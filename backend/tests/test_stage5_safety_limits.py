"""Unit and integration tests for Stage 5: Safety Limits (daily limits, retry-after, and demo allowlist)."""

import uuid
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import ApiKey, Client, Delivery, EventTypeSetting, Preference, Recipient, Template
from app.security import hash_key


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def http():
    return TestClient(app)


def setup_client_and_template(db, name: str, daily_limit: int = 30, respect_opt_out: bool = True):
    """Helper to create client with API key and active template."""
    client = Client(
        id=uuid.uuid4(),
        name=name,
        daily_email_limit=daily_limit,
        status="active",
        rate_limit_per_sec=50,
    )
    db.add(client)
    db.commit()

    raw_key = f"nh_live_{uuid.uuid4().hex}"
    api_key = ApiKey(
        client_id=client.id,
        key_hash=hash_key(raw_key),
        name="Test Key",
        key_prefix=raw_key[:12],
    )
    db.add(api_key)

    setting = EventTypeSetting(
        client_id=client.id,
        event_type="test_event",
        priority=1,
        ttl_seconds=3600,
        retry_schedule=[60],
        respect_opt_out=respect_opt_out,
        sensitive=False,
    )
    tmpl = Template(
        client_id=client.id,
        event_type="test_event",
        version=1,
        status="active",
        subject="Hello {{ name }}",
        body="Message for {{ name }}",
    )
    db.add_all([setting, tmpl])
    db.commit()

    return client, raw_key


def test_client_daily_limit_triggers_429_with_retry_after(db, http):
    """When client's daily limit is reached, next event returns 429 with Retry-After header."""
    client, raw_key = setup_client_and_template(db, "Client Limit Test", daily_limit=2)
    headers = {"X-API-Key": raw_key}

    # 1. First event -> 202 Accepted
    res1 = http.post(
        "/api/events",
        json={"event_type": "test_event", "email": "u1@example.com", "data": {"name": "User 1"}},
        headers={**headers, "Idempotency-Key": f"k_{uuid.uuid4().hex}"},
    )
    assert res1.status_code == 202

    # 2. Second event -> 202 Accepted
    res2 = http.post(
        "/api/events",
        json={"event_type": "test_event", "email": "u2@example.com", "data": {"name": "User 2"}},
        headers={**headers, "Idempotency-Key": f"k_{uuid.uuid4().hex}"},
    )
    assert res2.status_code == 202

    # 3. Third event -> 429 Too Many Requests
    now = datetime.now(timezone.utc)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    expected_retry_after = int((midnight - now).total_seconds())

    res3 = http.post(
        "/api/events",
        json={"event_type": "test_event", "email": "u3@example.com", "data": {"name": "User 3"}},
        headers={**headers, "Idempotency-Key": f"k_{uuid.uuid4().hex}"},
    )
    assert res3.status_code == 429
    data3 = res3.json()
    assert data3["detail"] == "Daily sending limit reached"
    assert "retry_after_seconds" in data3
    assert abs(data3["retry_after_seconds"] - expected_retry_after) <= 2

    # Verify Retry-After response header
    assert "Retry-After" in res3.headers
    retry_header_sec = int(res3.headers["Retry-After"])
    assert abs(retry_header_sec - expected_retry_after) <= 2


def test_skipped_deliveries_do_not_count_towards_daily_limit(db, http):
    """Opted-out (skipped) deliveries do not count against daily limit."""
    client, raw_key = setup_client_and_template(db, "Optout Skip Limit Test", daily_limit=1, respect_opt_out=True)
    headers = {"X-API-Key": raw_key}

    # Register recipient and opt out
    rec = Recipient(client_id=client.id, email="opted_out@example.com")
    db.add(rec)
    db.commit()

    pref = Preference(recipient_id=rec.id, event_type="test_event", enabled=False)
    db.add(pref)
    db.commit()

    # 1. Ingest event to opted-out recipient -> skipped (202)
    res_opt = http.post(
        "/api/events",
        json={"event_type": "test_event", "recipient_id": str(rec.id), "data": {"name": "Opted Out"}},
        headers={**headers, "Idempotency-Key": f"opt_{uuid.uuid4().hex}"},
    )
    assert res_opt.status_code == 202
    assert res_opt.json()["delivery"]["status"] == "skipped"

    # 2. Ingest 1 normal event -> accepted (client limit is 1, skipped delivery didn't consume it)
    res_normal = http.post(
        "/api/events",
        json={"event_type": "test_event", "email": "normal@example.com", "data": {"name": "Normal"}},
        headers={**headers, "Idempotency-Key": f"norm_{uuid.uuid4().hex}"},
    )
    assert res_normal.status_code == 202
    assert res_normal.json()["delivery"]["status"] == "queued"

    # 3. Another normal event -> rejected with 429
    res_excess = http.post(
        "/api/events",
        json={"event_type": "test_event", "email": "extra@example.com", "data": {"name": "Extra"}},
        headers={**headers, "Idempotency-Key": f"ext_{uuid.uuid4().hex}"},
    )
    assert res_excess.status_code == 429

    # 4. Another opted-out recipient event -> still succeeds as skipped despite daily limit
    res_opt2 = http.post(
        "/api/events",
        json={"event_type": "test_event", "recipient_id": str(rec.id), "data": {"name": "Opted Out 2"}},
        headers={**headers, "Idempotency-Key": f"opt2_{uuid.uuid4().hex}"},
    )
    assert res_opt2.status_code == 202
    assert res_opt2.json()["delivery"]["status"] == "skipped"


def test_global_daily_limit_triggers_429(db, http, monkeypatch):
    """When GLOBAL_DAILY_LIMIT is reached across all clients, next event gets 429."""
    now_utc = datetime.now(timezone.utc)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    current_count = (
        db.query(Delivery)
        .filter(Delivery.created_at >= today_start, Delivery.status != "skipped")
        .count()
    )
    # Set global limit to allow exactly 2 more events
    monkeypatch.setattr("app.config.settings.GLOBAL_DAILY_LIMIT", current_count + 2)

    client1, raw_key1 = setup_client_and_template(db, "Global Limit Client 1", daily_limit=50)
    client2, raw_key2 = setup_client_and_template(db, "Global Limit Client 2", daily_limit=50)

    # Client 1 sends 1 event
    r1 = http.post(
        "/api/events",
        json={"event_type": "test_event", "email": "a@example.com", "data": {"name": "A"}},
        headers={"X-API-Key": raw_key1, "Idempotency-Key": f"g_{uuid.uuid4().hex}"},
    )
    assert r1.status_code == 202

    # Client 2 sends 1 event (total non-skipped today across all clients = 2)
    r2 = http.post(
        "/api/events",
        json={"event_type": "test_event", "email": "b@example.com", "data": {"name": "B"}},
        headers={"X-API-Key": raw_key2, "Idempotency-Key": f"g_{uuid.uuid4().hex}"},
    )
    assert r2.status_code == 202

    # Client 1 tries to send another event -> rejected by global limit
    r3 = http.post(
        "/api/events",
        json={"event_type": "test_event", "email": "c@example.com", "data": {"name": "C"}},
        headers={"X-API-Key": raw_key1, "Idempotency-Key": f"g_{uuid.uuid4().hex}"},
    )
    assert r3.status_code == 429
    assert r3.json()["detail"] == "Daily sending limit reached"
    assert "Retry-After" in r3.headers


def test_allowlist_enforced_only_when_sendgrid_and_configured(db, http, monkeypatch):
    """Allowlist rejects non-allowlisted email with 422 only when MAIL_PROVIDER=sendgrid."""
    client, raw_key = setup_client_and_template(db, "Allowlist Test Client")
    headers = {"X-API-Key": raw_key}

    # Case A: MAIL_PROVIDER=smtp -> allowlist NOT enforced
    monkeypatch.setattr("app.config.settings.MAIL_PROVIDER", "smtp")
    monkeypatch.setattr("app.config.settings.DEMO_ALLOWED_RECIPIENTS", "allowed@example.com")

    res_smtp = http.post(
        "/api/events",
        json={"event_type": "test_event", "email": "anyone@example.com", "data": {"name": "Anyone"}},
        headers={**headers, "Idempotency-Key": f"al_{uuid.uuid4().hex}"},
    )
    assert res_smtp.status_code == 202

    # Case B: MAIL_PROVIDER=sendgrid and DEMO_ALLOWED_RECIPIENTS set
    monkeypatch.setattr("app.config.settings.MAIL_PROVIDER", "sendgrid")
    monkeypatch.setattr("app.config.settings.SENDGRID_API_KEY", "SG.test")
    monkeypatch.setattr("app.config.settings.FROM_EMAIL", "sender@notifyhub.local")
    monkeypatch.setattr("app.config.settings.DEMO_ALLOWED_RECIPIENTS", "allowed@example.com, friend@example.com")

    # B1: Allowed recipient -> 202 Accepted
    res_ok = http.post(
        "/api/events",
        json={"event_type": "test_event", "email": "ALLOWED@example.com", "data": {"name": "Allowed"}},
        headers={**headers, "Idempotency-Key": f"al_{uuid.uuid4().hex}"},
    )
    assert res_ok.status_code == 202

    # B2: Non-allowed recipient -> 422 "This recipient is not allowed in demo mode"
    res_blocked = http.post(
        "/api/events",
        json={"event_type": "test_event", "email": "unauthorized@example.com", "data": {"name": "Blocked"}},
        headers={**headers, "Idempotency-Key": f"al_{uuid.uuid4().hex}"},
    )
    assert res_blocked.status_code == 422
    assert res_blocked.json()["detail"] == "This recipient is not allowed in demo mode"
