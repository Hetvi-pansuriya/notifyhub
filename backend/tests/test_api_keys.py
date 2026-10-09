"""Feature tests for API Key management and authentication."""

import uuid
from datetime import datetime, timedelta, timezone
from app.config import settings
from app.models import ApiKey, Client
from app.security import API_KEY_PREFIX, generate_api_key, hash_key


def test_api_key_format_and_hashing():
    """Verify API key formatting, prefix extraction, and hashing."""
    full_key, key_hash, prefix = generate_api_key()
    assert full_key.startswith("nh_live_")
    assert len(prefix) == 12
    assert hash_key(full_key) == key_hash


def test_api_key_lifecycle_and_one_time_reveal(client, db_session):
    """Verify owner can list, create (with one-time raw key reveal), and revoke keys."""
    # Setup owner session
    email = f"keys_{uuid.uuid4().hex[:6]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"email": email, "password": "Password123!", "company_name": "Keys Co"},
    )
    headers = {"X-Requested-With": "notifyhub-console"}

    # 1. Create key
    create_resp = client.post("/console/api-keys", json={"name": "Production Key"}, headers=headers)
    assert create_resp.status_code == 201
    created_data = create_resp.json()
    assert "api_key" in created_data
    raw_key = created_data["api_key"]
    key_id = created_data["id"]

    # 2. List keys: raw key must never be shown in list
    list_resp = client.get("/console/api-keys")
    assert list_resp.status_code == 200
    keys = list_resp.json()
    assert len(keys) == 1
    assert "api_key" not in keys[0]
    assert keys[0]["key_prefix"].startswith("nh_live_")
    assert keys[0]["status"] == "active"

    # 3. Use key to authenticate machine endpoint
    auth_resp = client.get("/api/event-types", headers={"X-API-Key": raw_key})
    assert auth_resp.status_code == 200

    # 4. Revoke key
    revoke_resp = client.post(f"/console/api-keys/{key_id}/revoke", headers=headers)
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["status"] == "revoked"

    # 5. Revoked key immediately rejected with 401
    rejected = client.get("/api/event-types", headers={"X-API-Key": raw_key})
    assert rejected.status_code == 401


def test_max_active_keys_limit(client, db_session):
    """Verify maximum 5 active keys per client tenant enforced with 409 Conflict."""
    email = f"maxkeys_{uuid.uuid4().hex[:6]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"email": email, "password": "Password123!", "company_name": "Max Keys Co"},
    )
    headers = {"X-Requested-With": "notifyhub-console"}

    # Create up to MAX_ACTIVE_KEYS (5)
    for i in range(settings.MAX_ACTIVE_KEYS):
        res = client.post("/console/api-keys", json={"name": f"Key {i}"}, headers=headers)
        assert res.status_code == 201

    # 6th key should return 409
    overflow = client.post("/console/api-keys", json={"name": "Overflow Key"}, headers=headers)
    assert overflow.status_code == 409


def test_key_last_used_at_throttling(client, db_session):
    """Verify last_used_at is not updated if last update was within 60 seconds."""
    email = f"throttle_key_{uuid.uuid4().hex[:6]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"email": email, "password": "Password123!", "company_name": "Throttle Co"},
    )
    res = client.post(
        "/console/api-keys",
        json={"name": "Throttled Key"},
        headers={"X-Requested-With": "notifyhub-console"},
    )
    raw_key = res.json()["api_key"]
    key_id = res.json()["id"]

    # First access updates last_used_at
    client.get("/api/event-types", headers={"X-API-Key": raw_key})
    key_row = db_session.query(ApiKey).filter(ApiKey.id == key_id).first()
    first_used = key_row.last_used_at
    assert first_used is not None

    # Immediate second access should not update timestamp
    client.get("/api/event-types", headers={"X-API-Key": raw_key})
    db_session.refresh(key_row)
    assert key_row.last_used_at == first_used
