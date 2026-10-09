"""Comprehensive unit and integration tests for Phase 3: Recipients, Templates, and Event Types."""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services.rendering import render


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_headers():
    return {"X-Admin-Key": settings.ADMIN_KEY}


@pytest.fixture
def client_a(client, admin_headers):
    """Creates a test client tenant A and returns auth headers."""
    res = client.post(
        "/admin/clients",
        json={"name": "Tenant A Store", "rate_limit_per_sec": 50},
        headers=admin_headers,
    )
    assert res.status_code == 201
    data = res.json()
    return {"id": data["id"], "headers": {"X-API-Key": data["api_key"]}}


@pytest.fixture
def client_b(client, admin_headers):
    """Creates a second test client tenant B to test tenant isolation."""
    res = client.post(
        "/admin/clients",
        json={"name": "Tenant B Store", "rate_limit_per_sec": 50},
        headers=admin_headers,
    )
    assert res.status_code == 201
    data = res.json()
    return {"id": data["id"], "headers": {"X-API-Key": data["api_key"]}}


def test_rendering_service_strict_and_syntax():
    """Verify sandboxed rendering: success, missing variable (422), syntax error (422)."""
    # Success
    subj, body = render(
        subject_template_str="Hello {{ name }}",
        body_template_str="Your order is {{ order_id }}",
        data={"name": "Bob", "order_id": 123},
    )
    assert subj == "Hello Bob"
    assert body == "Your order is 123"

    # Missing variable in subject -> 422
    with pytest.raises(Exception) as exc_info:
        render(
            subject_template_str="Hello {{ missing_var }}",
            body_template_str="Body",
            data={},
        )
    assert exc_info.value.status_code == 422
    assert "missing variable" in exc_info.value.detail

    # Missing variable in body -> 422
    with pytest.raises(Exception) as exc_info:
        render(
            subject_template_str="Subject",
            body_template_str="Hi {{ missing_body_var }}",
            data={},
        )
    assert exc_info.value.status_code == 422
    assert "missing variable" in exc_info.value.detail

    # Syntax error -> 422
    with pytest.raises(Exception) as exc_info:
        render(
            subject_template_str="Bad {% syntax",
            body_template_str="Body",
            data={},
        )
    assert exc_info.value.status_code == 422
    assert "syntax error" in exc_info.value.detail.lower()


def test_recipients_crud_and_preferences(client, client_a, client_b):
    """Verify recipient upsert, fetch, preferences, and tenant isolation."""
    headers_a = client_a["headers"]
    headers_b = client_b["headers"]

    # 1. Upsert recipient
    res = client.put(
        "/api/recipients/user_100",
        json={"name": "Alice Wonderland", "email": "alice@example.com"},
        headers=headers_a,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["external_id"] == "user_100"
    assert data["name"] == "Alice Wonderland"
    assert data["email"] == "alice@example.com"
    assert data["opt_outs"] == []

    # 2. Get recipient
    get_res = client.get("/api/recipients/user_100", headers=headers_a)
    assert get_res.status_code == 200
    assert get_res.json()["email"] == "alice@example.com"

    # 3. Tenant isolation: Client B cannot see Client A's recipient (404, never 403)
    b_res = client.get("/api/recipients/user_100", headers=headers_b)
    assert b_res.status_code == 404

    # 4. Set opt-out preference
    opt_out_res = client.put(
        "/api/recipients/user_100/preferences",
        json={"event_type": "marketing", "enabled": False},
        headers=headers_a,
    )
    assert opt_out_res.status_code == 200
    assert "marketing" in opt_out_res.json()["opt_outs"]

    # 5. Re-enable opt-in
    opt_in_res = client.put(
        "/api/recipients/user_100/preferences",
        json={"event_type": "marketing", "enabled": True},
        headers=headers_a,
    )
    assert opt_in_res.status_code == 200
    assert "marketing" not in opt_in_res.json()["opt_outs"]


def test_templates_lifecycle_and_preview(client, client_a):
    """Verify template drafts, automatic default settings, activation, and preview."""
    headers = client_a["headers"]

    # 1. Preview template draft without saving (success)
    preview_res = client.post(
        "/api/templates/preview",
        json={
            "subject": "Order #{{ order_id }} Confirmed",
            "body": "Hello {{ customer }}, total is ${{ total }}.",
            "sample_data": {"order_id": 55, "customer": "John", "total": 99.99},
        },
        headers=headers,
    )
    assert preview_res.status_code == 200
    assert preview_res.json()["rendered_subject"] == "Order #55 Confirmed"
    assert preview_res.json()["rendered_body"] == "Hello John, total is $99.99."

    # 2. Preview fails on missing variable -> 422
    preview_err = client.post(
        "/api/templates/preview",
        json={
            "subject": "Order #{{ order_id }}",
            "body": "Missing {{ undefined_variable }}",
            "sample_data": {"order_id": 55},
        },
        headers=headers,
    )
    assert preview_err.status_code == 422

    # 3. Create Draft v1
    v1_res = client.post(
        "/api/templates",
        json={
            "event_type": "order_confirmed",
            "subject": "Order #{{ id }} Confirmed",
            "body": "Your order #{{ id }} is received.",
        },
        headers=headers,
    )
    assert v1_res.status_code == 201
    v1_data = v1_res.json()
    v1_id = v1_data["id"]
    assert v1_data["version"] == 1
    assert v1_data["status"] == "draft"

    # Verify that default event_type_settings was automatically created for this event_type
    settings_res = client.get("/api/event-types", headers=headers)
    assert settings_res.status_code == 200
    settings_list = settings_res.json()
    matching_setting = [s for s in settings_list if s["event_type"] == "order_confirmed"]
    assert len(matching_setting) == 1
    setting = matching_setting[0]
    assert setting["priority"] == 1  # normal
    assert setting["retry_schedule"] == [5, 10, 20, 40]
    assert setting["respect_opt_out"] is True
    assert setting["sensitive"] is False

    # 4. Create Draft v2 for the same event type -> next version
    v2_res = client.post(
        "/api/templates",
        json={
            "event_type": "order_confirmed",
            "subject": "Order #{{ id }} is on its way!",
            "body": "Updated template for order #{{ id }}.",
        },
        headers=headers,
    )
    assert v2_res.status_code == 201
    v2_data = v2_res.json()
    v2_id = v2_data["id"]
    assert v2_data["version"] == 2
    assert v2_data["status"] == "draft"

    # 5. Activate v1
    act_v1 = client.post(f"/api/templates/{v1_id}/activate", headers=headers)
    assert act_v1.status_code == 200
    assert act_v1.json()["status"] == "active"

    # 6. Activate v2 -> v1 should become archived in ONE transaction
    act_v2 = client.post(f"/api/templates/{v2_id}/activate", headers=headers)
    assert act_v2.status_code == 200
    assert act_v2.json()["status"] == "active"

    # Verify all versions
    list_res = client.get("/api/templates", headers=headers)
    templates = list_res.json()
    v1_check = next(t for t in templates if t["id"] == v1_id)
    v2_check = next(t for t in templates if t["id"] == v2_id)
    assert v1_check["status"] == "archived"
    assert v2_check["status"] == "active"


def test_event_types_configuration(client, client_a):
    """Verify configuring event types with priority, retries, and sensitivity."""
    headers = client_a["headers"]

    # Configure OTP event type
    res = client.put(
        "/api/event-types/auth_otp",
        json={
            "priority": "high",  # String converted to 2
            "ttl_seconds": 300,
            "retry_schedule": [10, 20, 30],
            "respect_opt_out": False,
            "sensitive": True,
        },
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["event_type"] == "auth_otp"
    assert data["priority"] == 2
    assert data["ttl_seconds"] == 300
    assert data["retry_schedule"] == [10, 20, 30]
    assert data["respect_opt_out"] is False
    assert data["sensitive"] is True

    # Check listing includes configured setting
    list_res = client.get("/api/event-types", headers=headers)
    assert list_res.status_code == 200
    types = [s["event_type"] for s in list_res.json()]
    assert "auth_otp" in types
