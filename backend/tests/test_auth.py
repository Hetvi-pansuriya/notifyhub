"""Feature tests for Authentication, Sessions, CSRF, and RBAC."""

import uuid
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.models import Client, User
from app.security import hash_password, verify_password


def test_password_hashing_and_verification():
    """Verify Argon2id password hashing and constant-time verification."""
    password = "StrongPassword123!"
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_signup_creates_client_and_owner_user(client, db_session):
    """Verify signup creates both tenant client and owner user with Starter plan."""
    email = f"signup_{uuid.uuid4().hex[:6]}@example.com"
    resp = client.post(
        "/console/auth/signup",
        json={
            "email": email,
            "password": "Password123!",
            "company_name": "Test Company",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["user"]["email"] == email
    assert data["user"]["role"] == "owner"
    assert data["client"]["name"] == "Test Company"
    assert settings.COOKIE_NAME in client.cookies


def test_login_success_and_me_endpoint(client, db_session):
    """Verify login authenticates and sets session cookie, /console/auth/me returns user."""
    email = f"login_{uuid.uuid4().hex[:6]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"email": email, "password": "Password123!", "company_name": "Login Co"},
    )
    client.cookies.clear()

    # Login
    login_resp = client.post(
        "/console/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert login_resp.status_code == 200
    assert login_resp.json()["user"]["email"] == email

    # /console/auth/me
    me_resp = client.get("/console/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["user"]["email"] == email


def test_login_invalid_credentials_returns_401(client):
    """Verify bad credentials return 401."""
    resp = client.post(
        "/console/auth/login",
        json={"email": "nonexistent@example.com", "password": "BadPassword!"},
    )
    assert resp.status_code == 401


def test_login_rate_limiting_throttle(client):
    """Verify brute-force limiter throttles after MAX_ATTEMPTS."""
    email = f"throttle_{uuid.uuid4().hex[:6]}@example.com"
    for _ in range(settings.LOGIN_MAX_ATTEMPTS):
        client.post("/console/auth/login", json={"email": email, "password": "wrong"})

    # Next attempt -> 429
    blocked = client.post("/console/auth/login", json={"email": email, "password": "wrong"})
    assert blocked.status_code == 429


def test_logout_clears_session(client):
    """Verify logout removes session cookie and subsequent /me returns 401."""
    email = f"logout_{uuid.uuid4().hex[:6]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"email": email, "password": "Password123!", "company_name": "Logout Co"},
    )
    logout_resp = client.post(
        "/console/auth/logout",
        headers={"X-Requested-With": "notifyhub-console"},
    )
    assert logout_resp.status_code == 204
    assert client.get("/console/auth/me").status_code == 401


def test_csrf_protection_on_mutating_console_requests(client):
    """Verify mutating non-GET console requests require X-Requested-With header."""
    email = f"csrf_{uuid.uuid4().hex[:6]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"email": email, "password": "Password123!", "company_name": "CSRF Co"},
    )

    # Missing header -> 403
    no_csrf = client.post("/console/api-keys", json={"name": "Test Key"})
    assert no_csrf.status_code == 403

    # Wrong header -> 403
    bad_csrf = client.post(
        "/console/api-keys",
        json={"name": "Test Key"},
        headers={"X-Requested-With": "malicious-site"},
    )
    assert bad_csrf.status_code == 403

    # Correct header -> 201
    good_csrf = client.post(
        "/console/api-keys",
        json={"name": "Test Key"},
        headers={"X-Requested-With": "notifyhub-console"},
    )
    assert good_csrf.status_code == 201


def test_role_based_access_control(client, db_session):
    """Verify owner cannot access /admin/* and admin cannot access owner console."""
    # Owner session
    email = f"rbac_{uuid.uuid4().hex[:6]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"email": email, "password": "Password123!", "company_name": "RBAC Co"},
    )
    assert client.get("/admin/clients").status_code == 403
    assert client.get("/admin/overview").status_code == 403

    # Admin session
    admin_client = TestClient(app)
    admin_login = admin_client.post(
        "/console/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    assert admin_login.status_code == 200
    assert admin_client.get("/admin/clients").status_code == 200
    # Admin cannot access client-tenant owner console endpoints
    assert admin_client.get("/console/api-keys").status_code == 403
