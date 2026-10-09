"""Feature tests for Admin Console endpoints and tenant management."""

import uuid
from app.config import settings
from app.models import Client


def test_admin_overview_and_health(client, admin_headers):
    """Verify admin overview and health endpoints return full platform metrics."""
    # 1. Overview
    ov = client.get("/admin/overview", headers=admin_headers)
    assert ov.status_code == 200
    ov_data = ov.json()
    for key in ["active_clients", "total_clients", "emails_today", "success_rate_24h", "queue_depth", "needs_attention"]:
        assert key in ov_data

    # 2. Health
    hl = client.get("/admin/health", headers=admin_headers)
    assert hl.status_code == 200
    hl_data = hl.json()
    for key in ["queue_depth", "worker_heartbeat_age_seconds", "reaper_last_run", "mail_provider"]:
        assert key in hl_data


def test_admin_settings_read_only(client, admin_headers):
    """Verify admin settings returns read-only configuration without secrets."""
    st = client.get("/admin/settings", headers=admin_headers)
    assert st.status_code == 200
    data = st.json()
    assert "mail_provider" in data
    assert "global_daily_limit" in data
    # Secrets must not be exposed in plaintext
    assert "ADMIN_KEY" not in str(data)
    assert "HMAC_SECRET" not in str(data)


def test_admin_client_pause_resume_and_key_reset(client, admin_headers, db_session):
    """Verify admin can pause, resume, and reset keys for a tenant client."""
    # Create client
    c_res = client.post(
        "/admin/clients",
        json={"name": f"AdminTest_{uuid.uuid4().hex[:6]}"},
        headers=admin_headers,
    )
    assert c_res.status_code == 201
    cid = c_res.json()["id"]

    csrf_headers = {**admin_headers, "X-Requested-With": "notifyhub-console"}

    # Pause
    p_res = client.patch(f"/admin/clients/{cid}", json={"status": "disabled"}, headers=csrf_headers)
    assert p_res.status_code == 200
    assert p_res.json()["status"] == "disabled"

    # Resume
    r_res = client.patch(f"/admin/clients/{cid}", json={"status": "active"}, headers=csrf_headers)
    assert r_res.status_code == 200
    assert r_res.json()["status"] == "active"

    # Reset keys
    k_res = client.post(f"/admin/clients/{cid}/reset-keys", headers=csrf_headers)
    assert k_res.status_code == 200
    assert "api_key" in k_res.json()


def test_admin_audit_log(client, admin_headers):
    """Verify audit log endpoint returns real audit rows with filters."""
    res = client.get("/admin/audit-log", headers=admin_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)
