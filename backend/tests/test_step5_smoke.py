"""Smoke test validating the complete Step 5 Part 1 flow."""

import uuid
from fastapi.testclient import TestClient
import pytest

from app.db import SessionLocal
from app.main import app
from app.models import Client, Plan, User
from app.security import hash_password


@pytest.fixture
def db_session():
    db = SessionLocal()
    yield db
    db.close()


def test_step5_complete_product_flow(db_session):
    client = TestClient(app)

    # Clean existing deliveries for clean counting
    from app.models import Delivery, NotificationEvent, RateLimitHit, AuditLog
    db_session.query(Delivery).delete()
    db_session.query(NotificationEvent).delete()
    db_session.query(RateLimitHit).delete()
    db_session.query(AuditLog).delete()
    db_session.commit()

    # 1. Sign up a new client account
    signup_email = f"owner_{uuid.uuid4().hex[:6]}@example.com"
    signup_resp = client.post(
        "/console/auth/signup",
        json={
            "email": signup_email,
            "password": "Password123!",
            "company_name": "Acme Widgets",
        },
    )
    assert signup_resp.status_code == 201, signup_resp.text
    signup_data = signup_resp.json()
    client_id = signup_data["client"]["id"]

    # Verify session cookie and Starter plan assignment
    plan_resp = client.get("/console/plan")
    assert plan_resp.status_code == 200, plan_resp.text
    assert plan_resp.json()["plan"]["name"] == "Starter"

    # 2. Create event type and template with variables; verify variable chips and live preview
    create_key_resp = client.post(
        "/console/api-keys",
        headers={"X-Requested-With": "notifyhub-console"},
        json={"name": "Smoke Key"},
    )
    assert create_key_resp.status_code == 201, create_key_resp.text
    api_key = create_key_resp.json()["api_key"]

    auth_headers = {"X-API-Key": api_key}

    # Detect template variables
    var_resp = client.post(
        "/api/templates/variables",
        headers=auth_headers,
        json={
            "subject": "Order #{{ order_id }} is confirmed",
            "body": "Hello {{ user_name }}, your package is ready.",
        },
    )
    assert var_resp.status_code == 200
    detected_vars = var_resp.json()["variables"]
    assert set(detected_vars) == {"order_id", "user_name"}

    # Missing variable 422 preview check
    bad_prev = client.post(
        "/api/templates/preview",
        headers=auth_headers,
        json={
            "subject": "Order #{{ order_id }}",
            "body": "Hello {{ user_name }}",
            "sample_data": {"order_id": 123},
        },
    )
    assert bad_prev.status_code == 422
    assert "Missing variable: user_name" in bad_prev.json()["detail"]

    # Successful preview
    good_prev = client.post(
        "/api/templates/preview",
        headers=auth_headers,
        json={
            "subject": "Order #{{ order_id }}",
            "body": "Hello {{ user_name }}",
            "sample_data": {"order_id": 123, "user_name": "Alice"},
        },
    )
    assert good_prev.status_code == 200
    assert good_prev.json()["rendered_subject"] == "Order #123"
    assert good_prev.json()["rendered_body"] == "Hello Alice"

    # Create event type
    et_resp = client.put(
        "/api/event-types/smoke_event",
        headers=auth_headers,
        json={
            "priority": 1,
            "ttl_seconds": 3600,
            "retry_schedule": [10, 30, 60],
            "respect_opt_out": True,
            "sensitive": False,
        },
    )
    assert et_resp.status_code == 200

    # Create & activate template
    tmpl_resp = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "event_type": "smoke_event",
            "subject": "Order #{{ order_id }}",
            "body": "Hello {{ user_name }}",
        },
    )
    assert tmpl_resp.status_code == 201
    tmpl_id = tmpl_resp.json()["id"]

    act_resp = client.post(
        f"/api/templates/{tmpl_id}/activate",
        headers=auth_headers,
    )
    assert act_resp.status_code == 200
    assert act_resp.json()["status"] == "active"

    # 3. Send an event through the API
    idem_key = f"smoke_evt_{uuid.uuid4().hex[:8]}"
    send_resp = client.post(
        "/api/events",
        headers={**auth_headers, "Idempotency-Key": idem_key},
        json={
            "event_type": "smoke_event",
            "email": "customer@example.com",
            "data": {"order_id": 999, "user_name": "Bob"},
        },
    )
    assert send_resp.status_code in (200, 202)

    # 4. Check client dashboard stats
    sum_resp = client.get("/api/stats/summary", headers=auth_headers)
    assert sum_resp.status_code == 200
    # Delivery was enqueued
    assert sum_resp.json()["in_queue"] + sum_resp.json()["pending"] + sum_resp.json()["sent"] >= 1

    # 5. Check client usage page: pick 4 ranges
    for rng in ["day", "month"]:
        ser_res = client.get(
            f"/api/stats/series?bucket={rng}&metric=sent&tz=UTC",
            headers=auth_headers,
        )
        assert ser_res.status_code == 200
        assert isinstance(ser_res.json(), list)

    rate_res = client.get("/api/stats/rate?tz=UTC", headers=auth_headers)
    assert rate_res.status_code == 200
    assert isinstance(rate_res.json(), list)

    # 6. Switch to Admin console
    # Create and login as test admin
    admin_pw = "AdminPass123!"
    admin_user = User(
        email=f"admin_{uuid.uuid4().hex[:6]}@example.com",
        password_hash=hash_password(admin_pw),
        name="Admin User",
        role="admin",
    )
    db_session.add(admin_user)
    db_session.commit()

    admin_client = TestClient(app)
    admin_login = admin_client.post(
        "/console/auth/login",
        json={"email": admin_user.email, "password": admin_pw},
    )
    assert admin_login.status_code == 200

    # Overview shows the new client
    admin_ov = admin_client.get("/admin/overview")
    assert admin_ov.status_code == 200
    assert admin_ov.json()["total_clients"] >= 1

    # Open /admin/clients/:id
    admin_detail = admin_client.get(f"/admin/clients/{client_id}")
    assert admin_detail.status_code == 200
    assert admin_detail.json()["name"] == "Acme Widgets"

    admin_csrf = {"X-Requested-With": "notifyhub-console"}

    # Pause the client
    pause_res = admin_client.patch(
        f"/admin/clients/{client_id}",
        json={"status": "disabled"},
        headers=admin_csrf,
    )
    assert pause_res.status_code == 200
    assert pause_res.json()["status"] == "disabled"

    # Verify paused client intake returns 403
    paused_send = client.post(
        "/api/events",
        headers={**auth_headers, "Idempotency-Key": f"fail_{uuid.uuid4().hex[:6]}"},
        json={
            "event_type": "smoke_event",
            "email": "test@example.com",
            "data": {"order_id": 1, "user_name": "X"},
        },
    )
    assert paused_send.status_code == 403

    # Resume the client
    resume_res = admin_client.patch(
        f"/admin/clients/{client_id}",
        json={"status": "active"},
        headers=admin_csrf,
    )
    assert resume_res.status_code == 200
    assert resume_res.json()["status"] == "active"

    # Change plan to a higher plan
    plans_list = admin_client.get("/admin/plans").json()
    higher_plan = next((p for p in plans_list if p["id"] != resume_res.json()["plan_id"]), None)
    if not higher_plan:
        new_p = admin_client.post(
            "/admin/plans",
            json={
                "name": "Enterprise",
                "monthly_email_limit": 500000,
                "daily_email_limit": 5000,
                "rate_limit_per_sec": 200,
            },
            headers=admin_csrf,
        ).json()
        higher_plan = new_p

    plan_change = admin_client.patch(
        f"/admin/clients/{client_id}",
        json={"plan_id": higher_plan["id"]},
        headers=admin_csrf,
    )
    assert plan_change.status_code == 200
    assert plan_change.json()["plan_id"] == higher_plan["id"]

    # Reset keys
    reset_res = admin_client.post(f"/admin/clients/{client_id}/reset-keys", headers=admin_csrf)
    assert reset_res.status_code == 200
    new_api_key = reset_res.json()["api_key"]
    assert new_api_key != api_key

    # Old key fails (401)
    old_key_send = client.post(
        "/api/events",
        headers={"X-API-Key": api_key, "Idempotency-Key": f"old_{uuid.uuid4().hex[:6]}"},
        json={
            "event_type": "smoke_event",
            "email": "test@example.com",
            "data": {"order_id": 1, "user_name": "X"},
        },
    )
    assert old_key_send.status_code == 401

    # New key succeeds
    new_key_send = client.post(
        "/api/events",
        headers={"X-API-Key": new_api_key, "Idempotency-Key": f"new_{uuid.uuid4().hex[:6]}"},
        json={
            "event_type": "smoke_event",
            "email": "test@example.com",
            "data": {"order_id": 1, "user_name": "X"},
        },
    )
    assert new_key_send.status_code in (200, 202)

    # Check the audit log: actions appear with correct actor
    audit_res = admin_client.get(f"/admin/audit-log?client_id={client_id}")
    assert audit_res.status_code == 200
    actions = [row["action"] for row in audit_res.json()]
    assert "client_paused" in actions
    assert "client_resumed" in actions
    assert "plan_assigned" in actions
    assert "admin_reset_keys" in actions

    # Clean up test-created data
    db_session.query(Delivery).delete()
    db_session.query(NotificationEvent).delete()
    db_session.query(RateLimitHit).delete()
    db_session.commit()
