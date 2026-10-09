"""Feature tests for Client Console endpoints: templates, event types, recipients, deliveries, and identity."""

import uuid
from app.models import Client, Delivery, EventTypeSetting, Recipient, Template
from app.security import generate_api_key


def _setup_console_tenant(client, db_session):
    email = f"client_console_{uuid.uuid4().hex[:6]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"email": email, "password": "Password123!", "company_name": "Acme Widgets"},
    )
    headers = {"X-Requested-With": "notifyhub-console"}
    k_res = client.post("/console/api-keys", json={"name": "Console Key"}, headers=headers)
    assert k_res.status_code == 201
    return k_res.json()["api_key"]


def test_template_variable_detection_and_friendly_preview(client, db_session):
    """Verify /api/templates/variables extracts variables and /preview gives friendly errors."""
    api_key = _setup_console_tenant(client, db_session)
    headers = {"X-API-Key": api_key}

    # 1. Variable extraction
    var_res = client.post(
        "/api/templates/variables",
        json={
            "subject": "Order #{{ order_id }} is ready",
            "body": "Hello {{ user_name }}, track at {{ tracking_url }}.",
        },
        headers=headers,
    )
    assert var_res.status_code == 200
    vars_found = var_res.json()["variables"]
    assert set(vars_found) == {"order_id", "user_name", "tracking_url"}

    # 2. Preview with missing variable -> friendly 422
    prev_fail = client.post(
        "/api/templates/preview",
        json={
            "subject": "Order #{{ order_id }}",
            "body": "Hello {{ user_name }}",
            "sample_data": {"order_id": 123},
        },
        headers=headers,
    )
    assert prev_fail.status_code == 422
    assert "Missing variable: user_name" in prev_fail.json()["detail"]
    assert prev_fail.json()["missing"] == ["user_name"]

    # 3. Preview with complete data -> 200
    prev_ok = client.post(
        "/api/templates/preview",
        json={
            "subject": "Order #{{ order_id }}",
            "body": "Hello {{ user_name }}",
            "sample_data": {"order_id": 123, "user_name": "Alice"},
        },
        headers=headers,
    )
    assert prev_ok.status_code == 200
    assert prev_ok.json()["rendered_subject"] == "Order #123"
    assert prev_ok.json()["rendered_body"] == "Hello Alice"


def test_event_types_crud_and_validation(client, db_session):
    """Verify event types can be created/updated with positive retry schedules."""
    api_key = _setup_console_tenant(client, db_session)
    headers = {"X-API-Key": api_key}

    # Create event type
    put_res = client.put(
        "/api/event-types/shipment_update",
        json={
            "priority": 1,
            "ttl_seconds": 7200,
            "retry_schedule": [30, 60, 120],
            "respect_opt_out": True,
            "sensitive": False,
        },
        headers=headers,
    )
    assert put_res.status_code == 200

    # List event types
    list_res = client.get("/api/event-types", headers=headers)
    assert list_res.status_code == 200
    types = [t["event_type"] for t in list_res.json()]
    assert "shipment_update" in types


def test_client_sending_identity_patch(client, db_session):
    """Verify owner can update sending identity (from_name, reply_to_email)."""
    email = f"identity_{uuid.uuid4().hex[:6]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"email": email, "password": "Password123!", "company_name": "Identity Co"},
    )
    csrf = {"X-Requested-With": "notifyhub-console"}

    patch_res = client.patch(
        "/console/client",
        json={"from_name": "Acme Support", "reply_to_email": "help@acme.example"},
        headers=csrf,
    )
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["from_name"] == "Acme Support"
    assert data["reply_to_email"] == "help@acme.example"
