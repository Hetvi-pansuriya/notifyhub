"""Feature tests for Event intake, idempotency, template rendering, and opt-outs."""

import uuid
from app.models import Client, Delivery, EventTypeSetting, Preference, Recipient, Template
from app.security import generate_api_key


def _setup_client_and_template(db_session, event_type="welcome"):
    key, key_hash, prefix = generate_api_key()
    client = Client(name=f"Client_{uuid.uuid4().hex[:6]}", status="active", rate_limit_per_sec=50)
    db_session.add(client)
    db_session.flush()

    from app.models import ApiKey
    api_key = ApiKey(client_id=client.id, key_hash=key_hash, key_prefix=prefix, name="Default Key", status="active")
    db_session.add(api_key)

    setting = EventTypeSetting(
        client_id=client.id,
        event_type=event_type,
        priority=1,
        ttl_seconds=3600,
        retry_schedule=[10, 60],
        respect_opt_out=True,
        sensitive=False,
    )
    template = Template(
        client_id=client.id,
        event_type=event_type,
        version=1,
        subject="Welcome {{ name }}",
        body="Hello {{ name }}, thank you for joining!",
        status="active",
    )
    db_session.add_all([setting, template])
    db_session.commit()
    return client, key


def test_event_intake_success_and_idempotency(client, db_session):
    """Verify event intake returns 202, and repeating with identical key returns existing."""
    cl, raw_key = _setup_client_and_template(db_session, "welcome")
    headers = {"X-API-Key": raw_key, "Idempotency-Key": f"idem_{uuid.uuid4().hex[:8]}"}
    payload = {
        "event_type": "welcome",
        "email": "user@example.com",
        "data": {"name": "Alice"},
    }

    # 1. First send -> 202
    resp1 = client.post("/api/events", json=payload, headers=headers)
    assert resp1.status_code in (200, 202)
    del_id = resp1.json()["delivery"]["id"]

    # 2. Second send with identical key & payload -> idempotent duplicate
    resp2 = client.post("/api/events", json=payload, headers=headers)
    assert resp2.status_code in (200, 202)
    assert resp2.json()["delivery"]["id"] == del_id

    # 3. Third send with same key but DIFFERENT payload -> 409 Conflict
    conflict_payload = {**payload, "data": {"name": "Bob"}}
    resp3 = client.post("/api/events", json=conflict_payload, headers=headers)
    assert resp3.status_code == 409


def test_unknown_event_type_fails_422(client, db_session):
    """Verify event intake fails with 422 if event type or active template does not exist."""
    cl, raw_key = _setup_client_and_template(db_session, "welcome")
    headers = {"X-API-Key": raw_key, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"}
    resp = client.post(
        "/api/events",
        json={"event_type": "nonexistent_type", "email": "a@b.com", "data": {}},
        headers=headers,
    )
    assert resp.status_code == 422


def test_strict_rendering_fails_fast_422_on_missing_variable(client, db_session):
    """Verify event intake fails immediately with 422 if a template variable is missing in data."""
    cl, raw_key = _setup_client_and_template(db_session, "welcome")
    headers = {"X-API-Key": raw_key, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"}
    resp = client.post(
        "/api/events",
        json={"event_type": "welcome", "email": "a@b.com", "data": {}},  # missing "name"
        headers=headers,
    )
    assert resp.status_code == 422
    assert "undefined" in resp.json()["detail"].lower() or "missing" in resp.json()["detail"].lower()


def test_recipient_opt_out_creates_skipped_delivery(client, db_session):
    """Verify that opted-out recipients receive delivery with status 'skipped'."""
    cl, raw_key = _setup_client_and_template(db_session, "marketing")
    rec = Recipient(client_id=cl.id, email="optout@example.com", name="Opted Out User")
    db_session.add(rec)
    db_session.flush()

    pref = Preference(
        recipient_id=rec.id,
        event_type="marketing",
        enabled=False,
    )
    db_session.add(pref)
    db_session.commit()

    headers = {"X-API-Key": raw_key, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"}
    resp = client.post(
        "/api/events",
        json={
            "event_type": "marketing",
            "recipient_id": str(rec.id),
            "data": {"name": "Test"},
        },
        headers=headers,
    )
    assert resp.status_code in (200, 202)
    assert resp.json()["delivery"]["status"] == "skipped"
