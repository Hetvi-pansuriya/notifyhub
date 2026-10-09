"""Unit and integration tests for Stage 4: Scheduled Send (send_at) validation, delivery scheduling, and TTL."""

import uuid
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app.models import ApiKey, Client, Delivery, EventTypeSetting, Template
from app.security import hash_key
from worker.claim import claim_deliveries


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def http():
    return TestClient(app)


@pytest.fixture
def test_setup(db):
    """Sets up a test client with API key, active templates, and normal/sensitive event settings."""
    client = Client(
        id=uuid.uuid4(),
        name="Scheduled Send Client",
        status="active",
        rate_limit_per_sec=50,
    )
    db.add(client)
    db.commit()

    raw_key = f"nh_live_{uuid.uuid4().hex}"
    api_key = ApiKey(
        client_id=client.id,
        key_hash=hash_key(raw_key),
        name="Scheduled Test Key",
        key_prefix=raw_key[:12],
    )
    db.add(api_key)

    # 1. Normal event type (reminder_due, non-sensitive, ttl 3600s)
    setting_normal = EventTypeSetting(
        client_id=client.id,
        event_type="reminder_due",
        priority=1,
        ttl_seconds=3600,
        retry_schedule=[60, 300],
        respect_opt_out=True,
        sensitive=False,
    )
    tmpl_normal = Template(
        client_id=client.id,
        event_type="reminder_due",
        version=1,
        status="active",
        subject="Reminder: {{ title }}",
        body="Hi {{ name }}, your reminder is {{ title }} at {{ time }}.",
    )

    # 2. Sensitive event type (auth_otp, sensitive=True, ttl 300s)
    setting_sens = EventTypeSetting(
        client_id=client.id,
        event_type="auth_otp",
        priority=2,
        ttl_seconds=300,
        retry_schedule=[2, 5],
        respect_opt_out=False,
        sensitive=True,
    )
    tmpl_sens = Template(
        client_id=client.id,
        event_type="auth_otp",
        version=1,
        status="active",
        subject="Your OTP is {{ code }}",
        body="Hi {{ name }}, code is {{ code }}.",
    )

    db.add_all([setting_normal, tmpl_normal, setting_sens, tmpl_sens])
    db.commit()

    return {
        "client": client,
        "raw_key": raw_key,
        "headers": {"X-API-Key": raw_key},
    }


def test_send_at_without_timezone_rejected_422(test_setup, http):
    """POST /api/events rejects send_at without timezone offset with 422."""
    headers = {**test_setup["headers"], "Idempotency-Key": f"no_tz_{uuid.uuid4().hex}"}
    payload = {
        "event_type": "reminder_due",
        "email": "user@example.com",
        "send_at": "2026-10-15T12:00:00",  # No timezone
        "data": {"name": "Alice", "title": "Meeting", "time": "12:00"},
    }
    res = http.post("/api/events", json=payload, headers=headers)
    assert res.status_code == 422
    assert "timezone" in str(res.json())


def test_send_at_more_than_one_minute_in_past_rejected_422(test_setup, http):
    """POST /api/events rejects send_at more than 1 minute in the past with 422."""
    past_time = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    headers = {**test_setup["headers"], "Idempotency-Key": f"past_{uuid.uuid4().hex}"}
    payload = {
        "event_type": "reminder_due",
        "email": "user@example.com",
        "send_at": past_time,
        "data": {"name": "Alice", "title": "Meeting", "time": "12:00"},
    }
    res = http.post("/api/events", json=payload, headers=headers)
    assert res.status_code == 422
    assert "1 minute in the past" in str(res.json())


def test_send_at_more_than_30_days_ahead_rejected_422(test_setup, http):
    """POST /api/events rejects send_at more than 30 days ahead with 422."""
    far_future = (datetime.now(timezone.utc) + timedelta(days=31)).isoformat()
    headers = {**test_setup["headers"], "Idempotency-Key": f"far_{uuid.uuid4().hex}"}
    payload = {
        "event_type": "reminder_due",
        "email": "user@example.com",
        "send_at": far_future,
        "data": {"name": "Alice", "title": "Meeting", "time": "12:00"},
    }
    res = http.post("/api/events", json=payload, headers=headers)
    assert res.status_code == 422
    assert "30 days in the future" in str(res.json())


def test_sensitive_event_types_disallow_send_at_422(test_setup, http):
    """Sensitive event types reject send_at with 422."""
    future_time = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    headers = {**test_setup["headers"], "Idempotency-Key": f"sens_{uuid.uuid4().hex}"}
    payload = {
        "event_type": "auth_otp",
        "email": "user@example.com",
        "send_at": future_time,
        "data": {"name": "Bob", "code": "654321"},
    }
    res = http.post("/api/events", json=payload, headers=headers)
    assert res.status_code == 422
    assert "sensitive" in str(res.json()).lower()


def test_valid_send_at_schedules_delivery_and_computes_expires_at(db, test_setup, http):
    """Valid send_at returns 202 with send_at, sets delivery.next_attempt_at, and calculates expires_at from send_at."""
    send_at_dt = datetime.now(timezone.utc) + timedelta(hours=2)
    # Truncate microseconds for exact ISO comparisons
    send_at_dt = send_at_dt.replace(microsecond=0)
    send_at_iso = send_at_dt.isoformat()

    headers = {**test_setup["headers"], "Idempotency-Key": f"valid_sched_{uuid.uuid4().hex}"}
    payload = {
        "event_type": "reminder_due",
        "email": "customer@example.com",
        "send_at": send_at_iso,
        "data": {"name": "Charlie", "title": "Dentist", "time": "2pm"},
    }

    res = http.post("/api/events", json=payload, headers=headers)
    assert res.status_code == 202
    data = res.json()

    # 1. 202 response includes send_at
    assert "send_at" in data
    assert data["send_at"] is not None

    delivery_id = uuid.UUID(data["delivery"]["id"])
    delivery = db.query(Delivery).filter(Delivery.id == delivery_id).first()
    assert delivery is not None

    # 2. delivery.next_attempt_at is set to send_at
    assert delivery.next_attempt_at is not None
    assert abs((delivery.next_attempt_at - send_at_dt).total_seconds()) < 2

    # 3. expires_at is send_at + ttl_seconds (3600s)
    expected_expires_at = send_at_dt + timedelta(seconds=3600)
    assert delivery.expires_at is not None
    assert abs((delivery.expires_at - expected_expires_at).total_seconds()) < 2

    # 4. Worker claim query does NOT claim future delivery
    claimed = claim_deliveries(db, batch_size=10)
    claimed_ids = [d.id for d in claimed]
    assert delivery.id not in claimed_ids


def test_send_at_is_part_of_idempotency_hash(test_setup, http):
    """Different send_at with same idempotency key causes 409 Conflict."""
    idempotency_key = f"hash_test_{uuid.uuid4().hex}"
    headers = {**test_setup["headers"], "Idempotency-Key": idempotency_key}

    time1 = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    time2 = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()

    payload1 = {
        "event_type": "reminder_due",
        "email": "user@example.com",
        "send_at": time1,
        "data": {"name": "Dana", "title": "Checkup", "time": "10am"},
    }
    payload2 = {
        **payload1,
        "send_at": time2,
    }

    # First request: 202 Accepted
    res1 = http.post("/api/events", json=payload1, headers=headers)
    assert res1.status_code == 202

    # Replay identical payload: 200 OK replay
    res_replay = http.post("/api/events", json=payload1, headers=headers)
    assert res_replay.status_code == 200
    assert res_replay.json()["event_id"] == res1.json()["event_id"]

    # Different send_at: 409 Conflict
    res_conflict = http.post("/api/events", json=payload2, headers=headers)
    assert res_conflict.status_code == 409
