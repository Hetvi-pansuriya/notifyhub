"""Feature tests for Scheduled Send (send_at) validation and TTL."""

import uuid
from datetime import datetime, timedelta, timezone
from app.models import ApiKey, Client, Delivery, EventTypeSetting, Template
from app.security import generate_api_key


def _setup_scheduling_client(db_session, sensitive=False, ttl_seconds=86400):
    key, key_hash, prefix = generate_api_key()
    client = Client(name=f"SchedClient_{uuid.uuid4().hex[:6]}", status="active", rate_limit_per_sec=50)
    db_session.add(client)
    db_session.flush()

    api_key = ApiKey(client_id=client.id, key_hash=key_hash, key_prefix=prefix, name="Default Key", status="active")
    db_session.add(api_key)

    setting = EventTypeSetting(
        client_id=client.id,
        event_type="reminder",
        priority=1,
        ttl_seconds=ttl_seconds,
        retry_schedule=[10, 60],
        respect_opt_out=True,
        sensitive=sensitive,
    )
    template = Template(
        client_id=client.id,
        event_type="reminder",
        version=1,
        subject="Reminder for {{ name }}",
        body="Don't forget your appointment at {{ time }}",
        status="active",
    )
    db_session.add_all([setting, template])
    db_session.commit()
    return client, key


def test_valid_send_at_schedules_delivery(client, db_session):
    """Valid future send_at schedules delivery next_attempt_at and computes expires_at."""
    cl, raw_key = _setup_scheduling_client(db_session, sensitive=False, ttl_seconds=7200)
    future_time = datetime.now(timezone.utc) + timedelta(hours=1)
    future_iso = future_time.replace(microsecond=0).isoformat()

    headers = {"X-API-Key": raw_key, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"}
    resp = client.post(
        "/api/events",
        json={
            "event_type": "reminder",
            "email": "user@example.com",
            "send_at": future_iso,
            "data": {"name": "Charlie", "time": "2pm"},
        },
        headers=headers,
    )
    assert resp.status_code in (200, 202)
    del_id = resp.json()["delivery"]["id"]

    del_row = db_session.query(Delivery).filter(Delivery.id == del_id).first()
    assert del_row.next_attempt_at is not None
    assert del_row.expires_at is not None
    # expires_at is send_at + ttl_seconds (2 hours)
    expected_expiry = future_time + timedelta(seconds=7200)
    assert abs((del_row.expires_at - expected_expiry).total_seconds()) < 5


def test_send_at_in_past_returns_422(client, db_session):
    """Past send_at is rejected with 422."""
    cl, raw_key = _setup_scheduling_client(db_session)
    past_time = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    headers = {"X-API-Key": raw_key, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"}
    resp = client.post(
        "/api/events",
        json={
            "event_type": "reminder",
            "email": "user@example.com",
            "send_at": past_time,
            "data": {"name": "Charlie", "time": "2pm"},
        },
        headers=headers,
    )
    assert resp.status_code == 422


def test_sensitive_event_types_disallow_send_at(client, db_session):
    """Sensitive event types (like OTPs) strictly forbid send_at scheduling (422)."""
    cl, raw_key = _setup_scheduling_client(db_session, sensitive=True)
    future_time = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    headers = {"X-API-Key": raw_key, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"}
    resp = client.post(
        "/api/events",
        json={
            "event_type": "reminder",
            "email": "user@example.com",
            "send_at": future_time,
            "data": {"name": "Charlie", "time": "2pm"},
        },
        headers=headers,
    )
    assert resp.status_code == 422


def test_send_at_is_part_of_idempotency_hash(client, db_session):
    """Different send_at with identical idempotency key causes 409 Conflict."""
    cl, raw_key = _setup_scheduling_client(db_session)
    key = f"idem_sched_{uuid.uuid4().hex[:8]}"
    headers = {"X-API-Key": raw_key, "Idempotency-Key": key}

    time1 = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    time2 = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()

    r1 = client.post(
        "/api/events",
        json={"event_type": "reminder", "email": "a@b.com", "send_at": time1, "data": {"name": "C", "time": "1"}},
        headers=headers,
    )
    assert r1.status_code in (200, 202)

    r2 = client.post(
        "/api/events",
        json={"event_type": "reminder", "email": "a@b.com", "send_at": time2, "data": {"name": "C", "time": "1"}},
        headers=headers,
    )
    assert r2.status_code == 409
