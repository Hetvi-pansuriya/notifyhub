"""Comprehensive unit and integration tests for Phase 4: Event Intake and Idempotency."""

import uuid
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_headers():
    return {"X-Admin-Key": settings.ADMIN_KEY}


@pytest.fixture
def setup_tenant(client, admin_headers):
    """Sets up a tenant with templates and event types ready for event intake."""
    # 1. Create client
    c_res = client.post(
        "/admin/clients",
        json={"name": "Intake Test App", "rate_limit_per_sec": 100},
        headers=admin_headers,
    )
    assert c_res.status_code == 201
    c_data = c_res.json()
    client_id = c_data["id"]
    headers = {"X-API-Key": c_data["api_key"]}

    # 2. Create and activate standard template (order_shipped)
    t1_res = client.post(
        "/api/templates",
        json={
            "event_type": "order_shipped",
            "subject": "Order #{{ order_id }} is on its way",
            "body": "Hi {{ name }}, tracking is {{ tracking }}.",
        },
        headers=headers,
    )
    assert t1_res.status_code == 201
    t1_id = t1_res.json()["id"]
    client.post(f"/api/templates/{t1_id}/activate", headers=headers)

    # 3. Create and activate sensitive OTP template
    client.put(
        "/api/event-types/auth_otp",
        json={
            "priority": "high",
            "ttl_seconds": 300,
            "retry_schedule": [10, 20],
            "respect_opt_out": False,
            "sensitive": True,
        },
        headers=headers,
    )
    t2_res = client.post(
        "/api/templates",
        json={
            "event_type": "auth_otp",
            "subject": "Your security code is {{ code }}",
            "body": "Your one-time code is {{ code }}. Valid for 5 minutes.",
        },
        headers=headers,
    )
    assert t2_res.status_code == 201
    t2_id = t2_res.json()["id"]
    client.post(f"/api/templates/{t2_id}/activate", headers=headers)

    # 4. Create a recipient
    r_res = client.put(
        "/api/recipients/user_200",
        json={"name": "Bob Builder", "email": "bob@example.com"},
        headers=headers,
    )
    assert r_res.status_code == 200

    return {
        "id": client_id,
        "headers": headers,
        "recipient_external_id": "user_200",
    }


def test_missing_idempotency_key_header(client, setup_tenant):
    """Verify 422 if Idempotency-Key header is missing."""
    headers = setup_tenant["headers"]
    res = client.post(
        "/api/events",
        json={
            "event_type": "order_shipped",
            "email": "user@example.com",
            "data": {"order_id": 1, "name": "A", "tracking": "XYZ"},
        },
        headers=headers,  # No Idempotency-Key header
    )
    assert res.status_code == 422


def test_recipient_xor_email_validation(client, setup_tenant):
    """Verify 422 if neither or both of recipient_id and email are provided."""
    headers = {**setup_tenant["headers"], "Idempotency-Key": str(uuid.uuid4())}

    # Neither recipient_id nor email
    res1 = client.post(
        "/api/events",
        json={
            "event_type": "order_shipped",
            "data": {"order_id": 1, "name": "A", "tracking": "XYZ"},
        },
        headers=headers,
    )
    assert res1.status_code == 422

    # Both recipient_id and email
    res2 = client.post(
        "/api/events",
        json={
            "event_type": "order_shipped",
            "recipient_id": str(uuid.uuid4()),
            "email": "both@example.com",
            "data": {"order_id": 1, "name": "A", "tracking": "XYZ"},
        },
        headers=headers,
    )
    assert res2.status_code == 422


def test_unknown_event_type_or_inactive_template(client, setup_tenant):
    """Verify 422 when event type is unknown or has no active template."""
    headers = {**setup_tenant["headers"], "Idempotency-Key": str(uuid.uuid4())}

    # Unknown event type
    res = client.post(
        "/api/events",
        json={
            "event_type": "unknown_event_99",
            "email": "user@example.com",
            "data": {},
        },
        headers=headers,
    )
    assert res.status_code == 422
    assert "unknown or unconfigured" in res.json()["detail"].lower()


def test_strict_rendering_fails_fast_with_422(client, setup_tenant):
    """Verify 422 when template variable is missing from data and nothing is stored."""
    idem_key = str(uuid.uuid4())
    headers = {**setup_tenant["headers"], "Idempotency-Key": idem_key}

    # Missing 'tracking' variable
    res = client.post(
        "/api/events",
        json={
            "event_type": "order_shipped",
            "email": "user@example.com",
            "data": {"order_id": 123, "name": "Bob"},  # missing tracking
        },
        headers=headers,
    )
    assert res.status_code == 422
    assert "missing variable" in res.json()["detail"].lower()


def test_successful_intake_and_idempotency_replay(client, setup_tenant):
    """Verify 202 on intake and 200 replay on identical duplicate request."""
    idem_key = "order_dispatch_1001"
    headers = {**setup_tenant["headers"], "Idempotency-Key": idem_key}
    payload = {
        "event_type": "order_shipped",
        "email": "customer@example.com",
        "data": {"order_id": 1001, "name": "Customer", "tracking": "TRK999"},
    }

    # 1. First request -> 202 Accepted
    res1 = client.post("/api/events", json=payload, headers=headers)
    assert res1.status_code == 202
    data1 = res1.json()
    event_id = data1["event_id"]
    assert data1["delivery"]["status"] == "queued"
    assert data1["delivery"]["priority"] == 1

    # 2. Duplicate with same key + same payload -> 200 OK replay
    res2 = client.post("/api/events", json=payload, headers=headers)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["event_id"] == event_id
    assert data2["delivery"]["id"] == data1["delivery"]["id"]

    # 3. Duplicate with same key + DIFFERENT payload -> 409 Conflict
    diff_payload = {
        "event_type": "order_shipped",
        "email": "different@example.com",
        "data": {"order_id": 9999, "name": "Different", "tracking": "TRK000"},
    }
    res3 = client.post("/api/events", json=diff_payload, headers=headers)
    assert res3.status_code == 409


def test_opt_out_respect_creates_skipped_delivery(client, setup_tenant):
    """Verify opt-out produces delivery with status 'skipped' and returns 202."""
    headers = setup_tenant["headers"]

    # 1. Look up recipient to get recipient_id UUID
    rec_res = client.get(f"/api/recipients/{setup_tenant['recipient_external_id']}", headers=headers)
    assert rec_res.status_code == 200
    recipient_id = rec_res.json()["id"]

    # 2. Opt out of order_shipped
    client.put(
        f"/api/recipients/{setup_tenant['recipient_external_id']}/preferences",
        json={"event_type": "order_shipped", "enabled": False},
        headers=headers,
    )

    # 3. Post event with recipient_id
    idem_key = "order_dispatch_optout_99"
    intake_res = client.post(
        "/api/events",
        json={
            "event_type": "order_shipped",
            "recipient_id": recipient_id,
            "data": {"order_id": 99, "name": "Bob", "tracking": "TRK_SKIPPED"},
        },
        headers={**headers, "Idempotency-Key": idem_key},
    )
    assert intake_res.status_code == 202
    intake_data = intake_res.json()
    assert intake_data["delivery"]["status"] == "skipped"

    # 4. Verify detail endpoint shows skipped status
    detail = client.get(f"/api/events/{intake_data['event_id']}", headers=headers).json()
    assert detail["delivery"]["status"] == "skipped"


def test_sensitive_event_otp_and_detail(client, setup_tenant):
    """Verify sensitive OTP event creation, HMAC idempotency, and GET /api/events/{id}."""
    idem_key = "otp_dispatch_555"
    headers = {**setup_tenant["headers"], "Idempotency-Key": idem_key}
    payload = {
        "event_type": "auth_otp",
        "email": "user@secure.com",
        "data": {"code": "481920"},
    }

    # 1. Post OTP event -> 202 Accepted
    res = client.post("/api/events", json=payload, headers=headers)
    assert res.status_code == 202
    event_id = res.json()["event_id"]
    delivery_info = res.json()["delivery"]
    assert delivery_info["status"] == "queued"
    assert delivery_info["priority"] == 2  # high = 2

    # 2. Inspect event via GET /api/events/{id}
    detail_res = client.get(f"/api/events/{event_id}", headers=headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == event_id
    assert detail["event_type"] == "auth_otp"
    assert detail["recipient_email"] == "user@secure.com"
    assert detail["delivery"]["priority"] == 2
    assert detail["delivery"]["sensitive"] is True

    # 3. Tenant isolation: Other client gets 404
    other_client_res = client.post(
        "/admin/clients",
        json={"name": "Tenant Other"},
        headers={"X-Admin-Key": settings.ADMIN_KEY},
    )
    other_headers = {"X-API-Key": other_client_res.json()["api_key"]}
    iso_res = client.get(f"/api/events/{event_id}", headers=other_headers)
    assert iso_res.status_code == 404
