"""Comprehensive tests for Stage B: Console Auth, API Keys, Sessions, CSRF, and RBAC."""

import uuid
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.routers.console_auth import login_throttle


@pytest.fixture
def client():
    # Fresh TestClient
    login_throttle.reset_for_test()
    return TestClient(app)


def test_signup_then_me_then_logout_then_me(client):
    """Verify signup creates session cookie, me returns profile, logout destroys session, me returns 401."""
    unique_email = f"user_{uuid.uuid4().hex[:8]}@example.com"
    signup_payload = {
        "company_name": "Stark Industries",
        "email": unique_email,
        "password": "SuperSecretPassword123!",
    }

    # 1. Signup
    res = client.post("/console/auth/signup", json=signup_payload)
    assert res.status_code == 201
    data = res.json()
    assert data["user"]["email"] == unique_email.lower()
    assert data["user"]["role"] == "owner"
    assert data["client"]["name"] == "Stark Industries"
    assert data["client"]["status"] == "active"
    assert settings.COOKIE_NAME in client.cookies

    # 2. GET /console/auth/me with session
    me_res = client.get("/console/auth/me")
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["user"]["email"] == unique_email.lower()
    assert me_data["client"]["id"] == data["client"]["id"]

    # 3. Logout
    logout_res = client.post("/console/auth/logout")
    assert logout_res.status_code == 204

    # 4. GET /console/auth/me after logout -> 401
    me_after_res = client.get("/console/auth/me")
    assert me_after_res.status_code == 401


def test_duplicate_signup_returns_409(client):
    """Verify signing up with an existing email returns 409 conflict."""
    unique_email = f"dup_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "company_name": "Wayne Enterprises",
        "email": unique_email,
        "password": "Password12345!",
    }

    res1 = client.post("/console/auth/signup", json=payload)
    assert res1.status_code == 201

    # Attempt same email with different casing
    payload["email"] = unique_email.upper()
    res2 = client.post("/console/auth/signup", json=payload)
    assert res2.status_code == 409
    assert res2.json()["detail"] == "An account with this email already exists"


def test_unknown_email_and_wrong_password_identical_response(client):
    """Verify unknown email and wrong password give identical 401 responses."""
    unique_email = f"real_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"company_name": "Oscorp", "email": unique_email, "password": "CorrectPassword123!"},
    )
    client.cookies.clear()

    # Unknown email
    res_unknown = client.post(
        "/console/auth/login",
        json={"email": "nonexistent_ghost_user@example.com", "password": "AnyPassword123!"},
    )
    assert res_unknown.status_code == 401
    assert res_unknown.json() == {"detail": "Wrong email or password"}

    # Wrong password for existing email
    res_wrong_pw = client.post(
        "/console/auth/login",
        json={"email": unique_email, "password": "WrongPassword123!"},
    )
    assert res_wrong_pw.status_code == 401
    assert res_wrong_pw.json() == {"detail": "Wrong email or password"}


def test_login_throttle_returns_429(client):
    """Verify 10 failed login attempts trigger 429 Too Many Requests with Retry-After header."""
    login_throttle.reset_for_test()
    test_email = f"throttle_{uuid.uuid4().hex[:8]}@example.com"

    for _ in range(settings.LOGIN_MAX_ATTEMPTS):
        res = client.post(
            "/console/auth/login",
            json={"email": test_email, "password": "WrongPassword123!"},
        )
        assert res.status_code == 401

    # 11th attempt should be throttled
    res_blocked = client.post(
        "/console/auth/login",
        json={"email": test_email, "password": "WrongPassword123!"},
    )
    assert res_blocked.status_code == 429
    assert "Retry-After" in res_blocked.headers
    assert int(res_blocked.headers["Retry-After"]) > 0


def test_created_key_shown_once_and_never_in_list(client):
    """Verify API key is returned full once upon creation, but list never includes full key or hash."""
    email = f"keys_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"company_name": "Key Corp", "email": email, "password": "StrongPassword123!"},
    )

    # Create key
    create_res = client.post(
        "/console/api-keys",
        json={"name": "Production Server"},
        headers={"X-Requested-With": "notifyhub-console"},
    )
    assert create_res.status_code == 201
    key_data = create_res.json()
    assert "api_key" in key_data
    full_key = key_data["api_key"]
    assert full_key.startswith("nh_live_")
    assert key_data["key_prefix"] == full_key[:12]
    assert key_data["status"] == "active"

    # List keys
    list_res = client.get("/console/api-keys")
    assert list_res.status_code == 200
    keys_list = list_res.json()
    assert len(keys_list) == 1
    item = keys_list[0]
    assert item["name"] == "Production Server"
    assert item["key_prefix"] == full_key[:12]
    assert "api_key" not in item
    assert "key_hash" not in item


def test_api_key_works_on_events_and_revocation_lifecycle(client):
    """Verify created key works on /api/events, revoked key immediately returns 401, revoking twice is 200."""
    email = f"lifecycle_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"company_name": "Lifecycle App", "email": email, "password": "StrongPassword123!"},
    )

    create_res = client.post(
        "/console/api-keys",
        json={"name": "Events Key"},
        headers={"X-Requested-With": "notifyhub-console"},
    )
    key_data = create_res.json()
    full_key = key_data["api_key"]
    key_id = key_data["id"]

    # First setup a template and event type for this client using owner session
    template_res = client.post(
        "/api/templates",
        json={
            "event_type": "user_welcome",
            "subject": "Welcome {{ name }}!",
            "body": "Welcome aboard, {{ name }}!",
        },
        headers={"X-Requested-With": "notifyhub-console"},
    )
    assert template_res.status_code == 201
    template_id = template_res.json()["id"]

    activate_res = client.post(
        f"/api/templates/{template_id}/activate",
        headers={"X-Requested-With": "notifyhub-console"},
    )
    assert activate_res.status_code == 200

    setting_res = client.put(
        "/api/event-types/user_welcome",
        json={
            "priority": 1,
            "retry_schedule": [5, 10],
            "respect_opt_out": False,
            "sensitive": False,
        },
        headers={"X-Requested-With": "notifyhub-console"},
    )
    assert setting_res.status_code == 200

    # Clear cookie to verify pure machine API key usage
    client.cookies.clear()

    # 1. POST /api/events with API key
    event_payload = {
        "event_type": "user_welcome",
        "email": "testuser@example.com",
        "data": {"name": "Alice"},
    }
    event_res = client.post(
        "/api/events",
        json=event_payload,
        headers={
            "X-API-Key": full_key,
            "Idempotency-Key": f"key-test-{uuid.uuid4()}",
        },
    )
    assert event_res.status_code == 202

    # Log back in to revoke key
    login_res = client.post(
        "/console/auth/login",
        json={"email": email, "password": "StrongPassword123!"},
    )
    assert login_res.status_code == 200

    # Revoke key
    revoke_res = client.post(
        f"/console/api-keys/{key_id}/revoke",
        headers={"X-Requested-With": "notifyhub-console"},
    )
    assert revoke_res.status_code == 200
    assert revoke_res.json()["status"] == "revoked"

    # Revoke key second time -> 200 idempotent
    revoke_again = client.post(
        f"/console/api-keys/{key_id}/revoke",
        headers={"X-Requested-With": "notifyhub-console"},
    )
    assert revoke_again.status_code == 200

    # Clear cookie again and attempt to send event with revoked key -> 401
    client.cookies.clear()
    event_res_revoked = client.post(
        "/api/events",
        json=event_payload,
        headers={
            "X-API-Key": full_key,
            "Idempotency-Key": f"key-test-revoked-{uuid.uuid4()}",
        },
    )
    assert event_res_revoked.status_code == 401


def test_revoking_another_client_key_returns_404(client):
    """Verify tenant isolation: revoking another client's key returns 404, never 403."""
    # Client A
    email_a = f"tenant_a_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"company_name": "Tenant A", "email": email_a, "password": "StrongPassword123!"},
    )
    key_a_res = client.post(
        "/console/api-keys",
        json={"name": "A Key"},
        headers={"X-Requested-With": "notifyhub-console"},
    )
    key_a_id = key_a_res.json()["id"]

    # Client B
    client.cookies.clear()
    email_b = f"tenant_b_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"company_name": "Tenant B", "email": email_b, "password": "StrongPassword123!"},
    )

    # Client B tries to revoke Client A's key
    res = client.post(
        f"/console/api-keys/{key_a_id}/revoke",
        headers={"X-Requested-With": "notifyhub-console"},
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "API key not found"


def test_sixth_active_key_refused_with_409(client):
    """Verify client cannot exceed MAX_ACTIVE_KEYS (5 active keys)."""
    email = f"limit_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"company_name": "Limit App", "email": email, "password": "StrongPassword123!"},
    )

    # Create 5 active keys
    for i in range(settings.MAX_ACTIVE_KEYS):
        res = client.post(
            "/console/api-keys",
            json={"name": f"Key {i+1}"},
            headers={"X-Requested-With": "notifyhub-console"},
        )
        assert res.status_code == 201

    # 6th active key must be refused
    res_6th = client.post(
        "/console/api-keys",
        json={"name": "Key 6"},
        headers={"X-Requested-With": "notifyhub-console"},
    )
    assert res_6th.status_code == 409
    assert res_6th.json()["detail"] == "Revoke a key before creating a new one"


def test_session_cookie_works_on_get_api_deliveries(client):
    """Verify owner session cookie authenticates GET /api/deliveries."""
    email = f"deliveries_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"company_name": "Delivery Co", "email": email, "password": "StrongPassword123!"},
    )

    res = client.get("/api/deliveries")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_cookie_post_without_csrf_is_403(client):
    """Verify cookie-authenticated non-GET without X-Requested-With: notifyhub-console returns 403."""
    email = f"csrf_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"company_name": "CSRF Guarded", "email": email, "password": "StrongPassword123!"},
    )

    # Missing X-Requested-With header
    res_missing = client.post(
        "/console/api-keys",
        json={"name": "No CSRF Header"},
    )
    assert res_missing.status_code == 403
    assert res_missing.json()["detail"] == "Missing or invalid CSRF header"

    # Wrong header value
    res_wrong = client.post(
        "/console/api-keys",
        json={"name": "Wrong Header"},
        headers={"X-Requested-With": "malicious-site"},
    )
    assert res_wrong.status_code == 403

    # Correct header value
    res_ok = client.post(
        "/console/api-keys",
        json={"name": "Valid CSRF"},
        headers={"X-Requested-With": "notifyhub-console"},
    )
    assert res_ok.status_code == 201


def test_api_key_on_console_api_keys_is_401(client):
    """Verify an API key cannot access console endpoints (/console/api-keys is session only)."""
    email = f"machine_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"company_name": "Machine Only", "email": email, "password": "StrongPassword123!"},
    )

    create_res = client.post(
        "/console/api-keys",
        json={"name": "Machine Key"},
        headers={"X-Requested-With": "notifyhub-console"},
    )
    full_key = create_res.json()["api_key"]

    # Clear cookies
    client.cookies.clear()

    # Pass API key to /console/api-keys -> 401
    res = client.get(
        "/console/api-keys",
        headers={"X-API-Key": full_key},
    )
    assert res.status_code == 401


def test_admin_session_reaches_admin_clients_and_owner_session_gets_403(client):
    """Verify admin session reaches /admin/clients and owner session gets 403."""
    # 1. Login as seeded admin
    admin_login_res = client.post(
        "/console/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    assert admin_login_res.status_code == 200
    assert admin_login_res.json()["user"]["role"] == "admin"

    # Admin session reaches /admin/clients
    admin_clients_res = client.get("/admin/clients")
    assert admin_clients_res.status_code == 200

    # 2. Login as regular client owner
    client.cookies.clear()
    owner_email = f"owner_rbac_{uuid.uuid4().hex[:8]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"company_name": "RBAC Owner", "email": owner_email, "password": "StrongPassword123!"},
    )

    # Owner session trying to access /admin/clients -> 403
    owner_forbidden_res = client.get("/admin/clients")
    assert owner_forbidden_res.status_code == 403
    assert owner_forbidden_res.json()["detail"] == "Admin privileges required"
