"""Comprehensive tests for Step 1 backend additions."""

from datetime import datetime, timedelta, timezone
import uuid
import pytest
from fastapi.testclient import TestClient
from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import Client, Delivery, NotificationEvent, Plan, RateLimitHit, User
from app.security import hash_password


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_headers():
    return {"X-Admin-Key": settings.ADMIN_KEY}


@pytest.fixture
def db_session():
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture
def setup_tenant(client, admin_headers):
    c_res = client.post(
        "/admin/clients",
        json={"name": "Step 1 Test Client", "rate_limit_per_sec": 50},
        headers=admin_headers,
    )
    assert c_res.status_code == 201
    c_data = c_res.json()
    return {
        "id": c_data["id"],
        "name": c_data["name"],
        "headers": {"X-API-Key": c_data["api_key"]},
    }


def test_plans_crud_and_client_assignment(client, db_session, admin_headers):
    # 1. Non-admin access rejected
    res = client.get("/admin/plans")
    assert res.status_code in (401, 403)

    # 2. Admin list plans
    res = client.get("/admin/plans", headers=admin_headers)
    assert res.status_code == 200
    plans = res.json()
    assert len(plans) >= 1
    assert any(p["name"] == "Starter" for p in plans)

    # 3. Admin create plan
    create_res = client.post(
        "/admin/plans",
        json={
            "name": "Enterprise Test Plan",
            "description": "High tier plan",
            "monthly_email_limit": 50000,
            "daily_email_limit": 200,
            "rate_limit_per_sec": 100,
        },
        headers=admin_headers,
    )
    assert create_res.status_code == 201
    created_plan = create_res.json()
    plan_id = created_plan["id"]

    # Duplicate name rejected
    dup_res = client.post(
        "/admin/plans",
        json={
            "name": "Enterprise Test Plan",
            "monthly_email_limit": 1000,
            "daily_email_limit": 10,
            "rate_limit_per_sec": 5,
        },
        headers=admin_headers,
    )
    assert dup_res.status_code == 409

    # 4. Admin update plan
    patch_res = client.patch(
        f"/admin/plans/{plan_id}",
        json={"description": "Updated high tier plan", "daily_email_limit": 250},
        headers=admin_headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["daily_email_limit"] == 250

    # 5. Delete plan not in use
    del_res = client.delete(f"/admin/plans/{plan_id}", headers=admin_headers)
    assert del_res.status_code == 204


def test_client_plan_endpoints_and_monthly_limit(client, db_session, setup_tenant):
    c_data = setup_tenant
    c_headers = c_data["headers"]
    client_id = c_data["id"]

    # 1. Create a client owner session
    owner_pw = "OwnerPass123!"
    pw_hash = hash_password(owner_pw)
    owner_user = User(
        client_id=uuid.UUID(client_id),
        email=f"owner_{uuid.uuid4().hex[:6]}@example.com",
        password_hash=pw_hash,
        name="Owner User",
        role="owner",
    )
    db_session.add(owner_user)
    db_session.commit()

    # Login owner to get session cookie
    login_res = client.post(
        "/console/auth/login",
        json={"email": owner_user.email, "password": owner_pw},
    )
    assert login_res.status_code == 200

    # 2. Check /console/plan and /console/plans
    plan_res = client.get("/console/plan")
    assert plan_res.status_code == 200
    plan_info = plan_res.json()
    assert "plan" in plan_info
    assert plan_info["plan"]["name"] == "Starter"
    assert "sent_this_month" in plan_info
    assert "sent_today" in plan_info

    plans_list = client.get("/console/plans")
    assert plans_list.status_code == 200
    assert len(plans_list.json()) >= 1

    # 3. Monthly limit enforcement
    # Assign a tight 1-limit plan to this client
    tight_plan = Plan(
        name=f"Tight Plan {uuid.uuid4().hex[:6]}",
        monthly_email_limit=1,
        daily_email_limit=30,
        rate_limit_per_sec=50,
    )
    db_session.add(tight_plan)
    db_session.commit()
    target_client = db_session.query(Client).filter(Client.id == uuid.UUID(client_id)).first()
    target_client.plan_id = tight_plan.id
    db_session.commit()

    try:
        # Create event template
        client.post(
            "/api/templates",
            json={
                "event_type": "limit_test",
                "subject": "Hello {{ name }}",
                "body": "Your test code is {{ code }}",
            },
            headers=c_headers,
        )
        t_list = client.get("/api/templates", headers=c_headers).json()
        t_id = next(t["id"] for t in t_list if t["event_type"] == "limit_test")
        client.post(f"/api/templates/{t_id}/activate", headers=c_headers)

        # 1st event -> 202 Accepted
        res1 = client.post(
            "/api/events",
            json={
                "event_type": "limit_test",
                "email": "user1@example.com",
                "data": {"name": "User 1", "code": "ABC"},
            },
            headers={**c_headers, "Idempotency-Key": f"limit_test_{uuid.uuid4().hex}"},
        )
        assert res1.status_code == 202

        # 2nd event -> 429 Monthly plan limit reached
        res2 = client.post(
            "/api/events",
            json={
                "event_type": "limit_test",
                "email": "user2@example.com",
                "data": {"name": "User 2", "code": "DEF"},
            },
            headers={**c_headers, "Idempotency-Key": f"limit_test_{uuid.uuid4().hex}"},
        )
        assert res2.status_code == 429
        assert "Monthly plan limit reached" in res2.json()["detail"]
        assert "Retry-After" in res2.headers
    except Exception:
        raise


def test_template_variables_and_friendly_preview(client, setup_tenant):
    headers = setup_tenant["headers"]

    # 1. Variables detection
    var_res = client.post(
        "/api/templates/variables",
        json={
            "subject": "Order #{{ order_id }} for {{ name }}",
            "body": "Hi {{ name }}, tracking is {{ tracking }} and code is {{ code }}.",
        },
        headers=headers,
    )
    assert var_res.status_code == 200
    vars_found = var_res.json()["variables"]
    assert set(vars_found) == {"order_id", "name", "tracking", "code"}

    # 2. Preview with missing variable returns 422 with friendly JSON
    prev_err = client.post(
        "/api/templates/preview",
        json={
            "subject": "Order #{{ order_id }}",
            "body": "Hi {{ name }}",
            "sample_data": {"order_id": 123},  # missing 'name'
        },
        headers=headers,
    )
    assert prev_err.status_code == 422
    err_body = prev_err.json()
    assert err_body["detail"] == "Missing variable: name"
    assert err_body["missing"] == ["name"]

    # 3. Preview with complete data succeeds
    prev_ok = client.post(
        "/api/templates/preview",
        json={
            "subject": "Order #{{ order_id }}",
            "body": "Hi {{ name }}",
            "sample_data": {"order_id": 123, "name": "Alice"},
        },
        headers=headers,
    )
    assert prev_ok.status_code == 200
    assert prev_ok.json()["rendered_subject"] == "Order #123"
    assert prev_ok.json()["rendered_body"] == "Hi Alice"


def test_stats_summary_series_and_rate(client, setup_tenant, admin_headers):
    headers = setup_tenant["headers"]
    client_id = setup_tenant["id"]

    # 1. Client stats summary
    res_summary = client.get("/api/stats/summary", headers=headers)
    assert res_summary.status_code == 200
    s_data = res_summary.json()
    assert "pending" in s_data
    assert "in_queue" in s_data
    assert "sent" in s_data
    assert "failed" in s_data
    assert "success_rate" in s_data
    assert "rejected_429" in s_data

    # 2. Client series with valid and invalid timezone
    res_series = client.get(
        "/api/stats/series?bucket=day&metric=requests&tz=America/New_York",
        headers=headers,
    )
    assert res_series.status_code == 200
    series_list = res_series.json()
    assert isinstance(series_list, list)
    assert len(series_list) > 0
    assert "timestamp" in series_list[0]
    assert "count" in series_list[0]

    # Invalid timezone returns 422
    res_bad_tz = client.get(
        "/api/stats/series?bucket=day&metric=requests&tz=Invalid/Timezone",
        headers=headers,
    )
    assert res_bad_tz.status_code == 422

    # 3. Client rate metrics
    res_rate = client.get("/api/stats/rate?tz=UTC", headers=headers)
    assert res_rate.status_code == 200
    rate_list = res_rate.json()
    assert len(rate_list) > 0
    assert "peak_requests_per_sec" in rate_list[0]
    assert "rejected_429" in rate_list[0]
    assert "rate_limit" in rate_list[0]

    # 4. Admin stats endpoints
    admin_sum = client.get(f"/admin/stats/summary?client_id={client_id}", headers=admin_headers)
    assert admin_sum.status_code == 200
    assert admin_sum.json()["sent"] == s_data["sent"]

    admin_global_sum = client.get("/admin/stats/summary", headers=admin_headers)
    assert admin_global_sum.status_code == 200


def test_admin_platform_overview_health_and_client_detail(client, setup_tenant, admin_headers, db_session):
    client_id = setup_tenant["id"]

    # 1. Overview
    overview_res = client.get("/admin/overview", headers=admin_headers)
    assert overview_res.status_code == 200
    ov = overview_res.json()
    assert ov["total_clients"] >= 1
    assert "active_clients" in ov
    assert "emails_today" in ov
    assert "needs_attention" in ov

    # 2. Health
    health_res = client.get("/admin/health", headers=admin_headers)
    assert health_res.status_code == 200
    h = health_res.json()
    assert "queue_depth" in h
    assert "dead_count" in h
    assert "mail_provider" in h

    # 3. Settings
    settings_res = client.get("/admin/settings", headers=admin_headers)
    assert settings_res.status_code == 200
    st = settings_res.json()
    assert "mail_provider" in st
    assert "global_daily_limit" in st
    # Verify no secrets in settings
    assert "SENDGRID_API_KEY" not in str(st)
    assert "ADMIN_KEY" not in str(st)

    # 4. Client detail and activity
    detail_res = client.get(f"/admin/clients/{client_id}", headers=admin_headers)
    assert detail_res.status_code == 200
    assert detail_res.json()["name"] == setup_tenant["name"]

    act_res = client.get(f"/admin/clients/{client_id}/activity", headers=admin_headers)
    assert act_res.status_code == 200
    assert "failures" in act_res.json()
    assert "audit_logs" in act_res.json()

    # 5. Admin pause and resume client with audit log
    pause_res = client.patch(
        f"/admin/clients/{client_id}",
        json={"status": "disabled"},
        headers=admin_headers,
    )
    assert pause_res.status_code == 200
    assert pause_res.json()["status"] == "disabled"

    # Verify audit log recorded pause
    audit_res = client.get(f"/admin/audit-log?client_id={client_id}", headers=admin_headers)
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert any(l["action"] == "client_paused" for l in logs)

    # Resume client
    resume_res = client.patch(
        f"/admin/clients/{client_id}",
        json={"status": "active"},
        headers=admin_headers,
    )
    assert resume_res.status_code == 200
    assert resume_res.json()["status"] == "active"

    # 6. Reset keys
    reset_res = client.post(f"/admin/clients/{client_id}/reset-keys", headers=admin_headers)
    assert reset_res.status_code == 200
    assert "api_key" in reset_res.json()
    assert reset_res.json()["api_key_prefix"] != ""
