"""Comprehensive unit and integration tests for Phase 2: Clients, Access, and Rate Limiting."""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.ratelimit import rate_limiter
from app.security import API_KEY_PREFIX, generate_api_key, hash_key, verify_admin_key


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_headers():
    return {"X-Admin-Key": settings.ADMIN_KEY}


def test_api_key_generation_and_hashing():
    """Verify API key format: nh_live_ prefix, length, hash, and short prefix."""
    full_key, key_hash, prefix = generate_api_key()
    assert full_key.startswith("nh_live_")
    assert len(prefix) == 12
    assert prefix == full_key[:12]
    assert hash_key(full_key) == key_hash


def test_admin_key_verification():
    """Verify admin key constant-time verification."""
    assert verify_admin_key(settings.ADMIN_KEY) is True
    assert verify_admin_key("wrong_key") is False
    assert verify_admin_key(None) is False


def test_admin_endpoints_require_admin_key(client):
    """Verify 401 on missing or incorrect X-Admin-Key."""
    # Missing key
    res = client.get("/admin/clients")
    assert res.status_code == 401

    # Wrong key
    res = client.get("/admin/clients", headers={"X-Admin-Key": "invalid_admin_secret"})
    assert res.status_code == 401

    # Correct key
    res = client.get("/admin/clients", headers={"X-Admin-Key": settings.ADMIN_KEY})
    assert res.status_code == 200


def test_client_lifecycle_and_authentication(client, admin_headers):
    """Verify:
    1. Create client: returns 201 with full API key starting with nh_live_.
    2. List clients: returns prefix, never full key or hash.
    3. GET /api/whoami: 401 with no/wrong key, 200 with right key.
    4. Rotate key: old key immediately 401, new key works.
    5. Disable client: immediately 401 on all calls.
    """
    # 1. Create client
    create_res = client.post(
        "/admin/clients",
        json={"name": "Acme Commerce", "rate_limit_per_sec": 50},
        headers=admin_headers,
    )
    assert create_res.status_code == 201
    created_data = create_res.json()
    client_id = created_data["id"]
    api_key_1 = created_data["api_key"]
    prefix_1 = created_data["api_key_prefix"]

    assert api_key_1.startswith("nh_live_")
    assert prefix_1 == api_key_1[:12]
    assert created_data["status"] == "active"

    # 2. List clients - verify full key and hash are NOT leaked
    list_res = client.get("/admin/clients", headers=admin_headers)
    assert list_res.status_code == 200
    clients_list = list_res.json()
    matching = [c for c in clients_list if c["id"] == client_id]
    assert len(matching) == 1
    found_client = matching[0]
    assert "api_key" not in found_client
    assert "api_key_hash" not in found_client
    assert "api_key_prefix" not in found_client

    # 3. Test authenticated endpoint with no key or invalid key
    no_key_res = client.get("/api/event-types")
    assert no_key_res.status_code == 401

    wrong_key_res = client.get("/api/event-types", headers={"X-API-Key": "nh_live_invalidkey1234567890"})
    assert wrong_key_res.status_code == 401

    # Right key -> 200 OK
    auth_res = client.get("/api/event-types", headers={"X-API-Key": api_key_1})
    assert auth_res.status_code == 200

    # 4. Rotate API key
    rotate_res = client.post(
        f"/admin/clients/{client_id}/rotate-key",
        headers=admin_headers,
    )
    assert rotate_res.status_code == 200
    rotated_data = rotate_res.json()
    api_key_2 = rotated_data["api_key"]
    assert api_key_2 != api_key_1
    assert api_key_2.startswith("nh_live_")

    # Old key must immediately be rejected (401)
    old_key_res = client.get("/api/event-types", headers={"X-API-Key": api_key_1})
    assert old_key_res.status_code == 401

    # New key must succeed (200)
    new_key_res = client.get("/api/event-types", headers={"X-API-Key": api_key_2})
    assert new_key_res.status_code == 200

    # 5. Disable the client
    disable_res = client.patch(
        f"/admin/clients/{client_id}",
        json={"status": "disabled"},
        headers=admin_headers,
    )
    assert disable_res.status_code == 200
    assert disable_res.json()["status"] == "disabled"

    # Disabled client key must return 401
    disabled_call_res = client.get("/api/event-types", headers={"X-API-Key": api_key_2})
    assert disabled_call_res.status_code == 401
    assert "disabled" in disabled_call_res.json()["detail"].lower()


def test_rate_limiting_burst(client, admin_headers):
    """Verify rate limiter token bucket returns 429 with Retry-After header on burst."""
    # Create client with tight rate limit: 2 requests per second
    create_res = client.post(
        "/admin/clients",
        json={"name": "Rate Limited App", "rate_limit_per_sec": 2},
        headers=admin_headers,
    )
    assert create_res.status_code == 201
    data = create_res.json()
    client_id = data["id"]
    api_key = data["api_key"]

    headers = {"X-API-Key": api_key}

    # Burst of rapid requests
    responses = [client.get("/api/event-types", headers=headers) for _ in range(6)]
    status_codes = [r.status_code for r in responses]

    # At least some requests should succeed (200) and subsequent ones should be rate limited (429)
    assert 200 in status_codes
    assert 429 in status_codes

    rate_limited = [r for r in responses if r.status_code == 429]
    assert len(rate_limited) > 0
    first_429 = rate_limited[0]
    assert "Retry-After" in first_429.headers
    assert int(first_429.headers["Retry-After"]) >= 1
