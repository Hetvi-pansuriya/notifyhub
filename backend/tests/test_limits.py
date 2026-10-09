"""Feature tests for Safety Limits: rate limits, daily limits, monthly plan limits."""

import uuid
from datetime import datetime, timedelta, timezone
from app.config import settings
from app.models import ApiKey, Client, Delivery, EventTypeSetting, Plan, RateLimitHit, Template
from app.ratelimit import rate_limiter
from app.security import generate_api_key


def _setup_limited_client(db_session, daily_limit=2, monthly_limit=100, rate_limit=50):
    key, key_hash, prefix = generate_api_key()
    plan = Plan(name=f"Plan_{uuid.uuid4().hex[:6]}", monthly_email_limit=monthly_limit, daily_email_limit=daily_limit, rate_limit_per_sec=rate_limit)
    db_session.add(plan)
    db_session.flush()

    client = Client(name=f"LimClient_{uuid.uuid4().hex[:6]}", plan_id=plan.id, daily_email_limit=daily_limit, rate_limit_per_sec=rate_limit, status="active")
    db_session.add(client)
    db_session.flush()

    api_key = ApiKey(client_id=client.id, key_hash=key_hash, key_prefix=prefix, name="Key", status="active")
    setting = EventTypeSetting(client_id=client.id, event_type="notice", priority=1, ttl_seconds=3600, retry_schedule=[10], respect_opt_out=True, sensitive=False)
    template = Template(client_id=client.id, event_type="notice", version=1, subject="Notice {{ name }}", body="Body {{ name }}", status="active")
    db_session.add_all([api_key, setting, template])
    db_session.commit()
    return client, key


def test_per_second_rate_limiting_and_hit_recording(client, db_session):
    """Verify per-second rate limit rejection (429) records row in rate_limit_hits."""
    cl, raw_key = _setup_limited_client(db_session, rate_limit=1)

    headers = {"X-API-Key": raw_key, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"}
    payload = {"event_type": "notice", "email": "u@example.com", "data": {"name": "A"}}

    # Exhaust burst
    client.post("/api/events", json=payload, headers=headers)
    r2 = client.post("/api/events", json=payload, headers={**headers, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"})
    assert r2.status_code == 429

    # Verify hit recorded
    hit = db_session.query(RateLimitHit).filter(RateLimitHit.client_id == cl.id).first()
    assert hit is not None


def test_client_daily_limit_triggers_429_with_retry_after(client, db_session):
    """When client's daily limit is reached, next event returns 429 with Retry-After header."""
    cl, raw_key = _setup_limited_client(db_session, daily_limit=2)
    headers = {"X-API-Key": raw_key}

    # 1. First event -> 202
    r1 = client.post("/api/events", json={"event_type": "notice", "email": "u1@example.com", "data": {"name": "A"}}, headers={**headers, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"})
    assert r1.status_code in (200, 202)

    # 2. Second event -> 202
    r2 = client.post("/api/events", json={"event_type": "notice", "email": "u2@example.com", "data": {"name": "B"}}, headers={**headers, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"})
    assert r2.status_code in (200, 202)

    # 3. Third event -> 429 Daily limit exceeded
    r3 = client.post("/api/events", json={"event_type": "notice", "email": "u3@example.com", "data": {"name": "C"}}, headers={**headers, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"})
    assert r3.status_code == 429
    assert "Retry-After" in r3.headers


def test_monthly_plan_limit_triggers_429(client, db_session):
    """When client's monthly plan limit is reached, next event returns 429 Monthly plan limit reached."""
    cl, raw_key = _setup_limited_client(db_session, daily_limit=50, monthly_limit=1)
    headers = {"X-API-Key": raw_key}

    # 1. First event -> 202
    r1 = client.post("/api/events", json={"event_type": "notice", "email": "u1@example.com", "data": {"name": "A"}}, headers={**headers, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"})
    assert r1.status_code in (200, 202)

    # 2. Second event -> 429 Monthly limit reached
    r2 = client.post("/api/events", json={"event_type": "notice", "email": "u2@example.com", "data": {"name": "B"}}, headers={**headers, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"})
    assert r2.status_code == 429
    assert "Monthly plan limit reached" in r2.json()["detail"]
    assert "Retry-After" in r2.headers
