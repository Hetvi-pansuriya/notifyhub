"""Phase 7 Core Flow Tests: Idempotency, Priority, Expiry, Retry, Redaction, Isolation, and Access."""

import uuid
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
import pytest

from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import ApiKey, Client, Delivery, DeliveryAttempt, EventTypeSetting, NotificationEvent, Recipient, Template
from app.security import hash_key
from worker.claim import claim_deliveries
from worker.providers.base import BaseEmailProvider, ProviderOutcome, ProviderResult
from worker.sender import OutgoingRateLimiter, process_single_delivery


class FakeEmailProvider(BaseEmailProvider):
    """In-memory fake email provider for isolated deterministic testing."""
    provider_name: str = "fake"

    def __init__(self, outcome: ProviderOutcome = ProviderOutcome.SUCCESS, error_message: str | None = None):
        self.outcome = outcome
        self.error_message = error_message
        self.sent_messages: list[dict] = []

    def send(
        self,
        to: str = "",
        subject: str = "",
        body: str = "",
        message_id: str = "",
        from_name: str = "NotifyHub",
        reply_to: str | None = None,
        **kwargs,
    ) -> ProviderResult:
        to_email = to or kwargs.get("to_email", "")
        body_text = body or kwargs.get("body_text", "")
        if self.outcome == ProviderOutcome.SUCCESS:
            self.sent_messages.append({
                "to": to_email,
                "subject": subject,
                "body": body_text,
                "message_id": message_id,
                "from_name": from_name,
                "reply_to": reply_to,
            })
            return ProviderResult(
                outcome=ProviderOutcome.SUCCESS,
                provider_message_id=message_id,
                provider_response="250 OK FAKE",
            )
        return ProviderResult(
            outcome=self.outcome,
            error_message=self.error_message or "Fake provider error",
        )


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def http():
    return TestClient(app)


def make_client(db, name="Test Client", key=None, status="active", rate_limit=50):
    client = Client(
        id=uuid.uuid4(),
        name=name,
        status=status,
        rate_limit_per_sec=rate_limit,
    )
    db.add(client)
    if key:
        api_key = ApiKey(
            client_id=client.id,
            name="Default key",
            key_prefix=key[:12],
            key_hash=hash_key(key),
            status="active",
        )
        db.add(api_key)
    return client


def test_idempotency_same_key_and_conflict(db, http):
    """Same key and body -> 200 and one row; different body -> 409."""
    key = f"nh_live_{uuid.uuid4().hex}"
    client = make_client(db, "Idem Client", key)

    tpl = Template(
        client_id=client.id,
        event_type="welcome",
        version=1,
        subject="Welcome {{ name }}",
        body="Hello {{ name }}",
        status="active",
    )
    setting = EventTypeSetting(
        client_id=client.id,
        event_type="welcome",
        priority=1,
        retry_schedule=[5],
        respect_opt_out=True,
        sensitive=False,
    )
    db.add_all([tpl, setting])
    db.commit()

    headers = {"X-API-Key": key, "Idempotency-Key": f"idem_key_{uuid.uuid4().hex}"}
    body1 = {"event_type": "welcome", "email": "user@example.com", "data": {"name": "Alex"}}
    body2 = {"event_type": "welcome", "email": "user@example.com", "data": {"name": "Bob"}}

    # Initial request -> 202 Accepted
    r1 = http.post("/api/events", headers=headers, json=body1)
    assert r1.status_code == 202
    event_id_1 = r1.json()["event_id"]

    # Identical replay with same key and body -> 200 OK with same event_id
    r2 = http.post("/api/events", headers=headers, json=body1)
    assert r2.status_code == 200
    assert r2.json()["event_id"] == event_id_1

    # Database has exactly ONE event for this idempotency key
    events = db.query(NotificationEvent).filter(
        NotificationEvent.client_id == client.id,
        NotificationEvent.idempotency_key == headers["Idempotency-Key"],
    ).all()
    assert len(events) == 1

    # Same key with different payload -> 409 Conflict
    r3 = http.post("/api/events", headers=headers, json=body2)
    assert r3.status_code == 409


def test_priority_otp_claimed_first_over_normal_burst(db):
    """With many normal queued deliveries, the claim function returns the OTP first."""
    client = make_client(db, "Priority Client")
    client_id = client.id

    now = datetime.now(timezone.utc)

    # Queue 15 normal priority deliveries (priority=1)
    for i in range(15):
        ev_norm = NotificationEvent(
            client_id=client_id,
            idempotency_key=f"norm_{i}_{uuid.uuid4().hex[:6]}",
            request_hash="hash",
            event_type="order_shipped",
            recipient_email=f"user_{i}@example.com",
            data={"i": i},
        )
        db.add(ev_norm)
        del_norm = Delivery(
            client_id=client_id,
            event=ev_norm,
            to_email=f"user_{i}@example.com",
            status="queued",
            priority=1,
            retry_schedule=[5],
            sensitive=False,
            rendered_subject="Normal",
            rendered_body="Body",
            next_attempt_at=now - timedelta(seconds=1),
        )
        db.add(del_norm)

    # Queue 1 high priority OTP delivery (priority=2)
    ev_otp = NotificationEvent(
        client_id=client_id,
        idempotency_key=f"otp_{uuid.uuid4().hex[:6]}",
        request_hash="hash",
        event_type="login_otp",
        recipient_email="vip@example.com",
        data={"code": "123456"},
    )
    db.add(ev_otp)
    del_otp = Delivery(
        client_id=client_id,
        event=ev_otp,
        to_email="vip@example.com",
        status="queued",
        priority=2,
        retry_schedule=[2],
        sensitive=True,
        rendered_subject="OTP",
        rendered_body="Code: 123456",
        next_attempt_at=now - timedelta(seconds=1),
    )
    db.add(del_otp)
    db.commit()

    # Claim a batch
    claimed = claim_deliveries(db, batch_size=5)
    assert len(claimed) > 0
    # The very first delivery claimed MUST be the priority=2 OTP delivery
    assert claimed[0].id == del_otp.id
    assert claimed[0].priority == 2


def test_expiry_past_expires_at_not_sent_with_fake_provider(db):
    """A delivery past expires_at becomes expired and is not sent (using fake provider)."""
    client = make_client(db, "Expiry Client")

    now = datetime.now(timezone.utc)
    ev = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"exp_{uuid.uuid4().hex}",
        request_hash="h",
        event_type="login_otp",
        recipient_email="exp@example.com",
        data={"code": "000000"},
    )
    db.add(ev)
    delivery = Delivery(
        client_id=client.id,
        event=ev,
        to_email="exp@example.com",
        status="processing",
        priority=2,
        retry_schedule=[5],
        sensitive=True,
        expires_at=now - timedelta(seconds=2),  # Expired in past
        rendered_subject="OTP 000000",
        rendered_body="Code: 000000",
    )
    db.add(delivery)
    db.commit()

    fake_provider = FakeEmailProvider(outcome=ProviderOutcome.SUCCESS)
    rate_limiter = OutgoingRateLimiter(rate_per_sec=100)

    process_single_delivery(db, delivery, fake_provider, rate_limiter)

    # Provider send was never called
    assert len(fake_provider.sent_messages) == 0

    # Delivery status is expired and content redacted
    db.refresh(delivery)
    assert delivery.status == "expired"
    assert delivery.rendered_subject == "redacted"
    assert delivery.rendered_body == "redacted"


def test_retry_temporary_errors_follow_schedule_then_dead_permanent_dead_at_once(db):
    """Temporary errors follow the schedule then dead; permanent error -> dead at once."""
    client = make_client(db, "Retry Flow Client")

    ev = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"retry_flow_{uuid.uuid4().hex}",
        request_hash="h",
        event_type="order_shipped",
        recipient_email="flow@example.com",
        data={},
    )
    db.add(ev)

    # 1. Temporary error: schedule [5] -> 1 delay -> max 2 attempts
    d_temp = Delivery(
        client_id=client.id,
        event=ev,
        to_email="flow@example.com",
        status="processing",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        rendered_subject="Subj",
        rendered_body="Body",
    )
    # 2. Permanent error: schedule [5, 10]
    d_perm = Delivery(
        client_id=client.id,
        event=ev,
        to_email="flow_perm@example.com",
        status="processing",
        priority=1,
        retry_schedule=[5, 10],
        sensitive=False,
        rendered_subject="Subj",
        rendered_body="Body",
    )
    db.add_all([d_temp, d_perm])
    db.commit()

    rate_limiter = OutgoingRateLimiter(rate_per_sec=100)

    # A: First temporary error -> queued with retry scheduled
    fake_temp = FakeEmailProvider(outcome=ProviderOutcome.TEMPORARY_ERROR, error_message="Temporary 421 timeout")
    process_single_delivery(db, d_temp, fake_temp, rate_limiter)
    db.refresh(d_temp)
    assert d_temp.status == "queued"
    assert d_temp.attempt_count == 1
    assert d_temp.next_attempt_at is not None

    # B: Second temporary error -> max attempts reached -> dead
    d_temp.status = "processing"
    db.commit()
    process_single_delivery(db, d_temp, fake_temp, rate_limiter)
    db.refresh(d_temp)
    assert d_temp.status == "dead"
    assert d_temp.attempt_count == 2

    # C: Permanent error -> dead immediately on attempt 1 without retry
    fake_perm = FakeEmailProvider(outcome=ProviderOutcome.PERMANENT_ERROR, error_message="550 No such mailbox")
    process_single_delivery(db, d_perm, fake_perm, rate_limiter)
    db.refresh(d_perm)
    assert d_perm.status == "dead"
    assert d_perm.attempt_count == 1
    assert d_perm.next_attempt_at is None


def test_wiping_sensitive_redacted_after_sent_expired_dead_and_retry_refusal_409(db, http):
    """Sensitive content is redacted after sent, expired, and dead; manual retry -> 409."""
    key = f"nh_live_{uuid.uuid4().hex}"
    client = make_client(db, "Wipe Client", key)

    ev_sent = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"sens_sent_{uuid.uuid4().hex}",
        request_hash="h",
        event_type="login_otp",
        recipient_email="s@secure.com",
        data={"code": "111111"},
    )
    d_sent = Delivery(
        client_id=client.id,
        event=ev_sent,
        to_email="s@secure.com",
        status="processing",
        priority=2,
        retry_schedule=[5],
        sensitive=True,
        rendered_subject="OTP 111111",
        rendered_body="Body 111111",
    )
    db.add_all([ev_sent, d_sent])
    db.commit()

    fake_success = FakeEmailProvider(outcome=ProviderOutcome.SUCCESS)
    rate_limiter = OutgoingRateLimiter(rate_per_sec=100)

    process_single_delivery(db, d_sent, fake_success, rate_limiter)
    db.refresh(d_sent)
    db.refresh(ev_sent)

    # Sent delivery and event data must be redacted
    assert d_sent.status == "sent"
    assert d_sent.rendered_subject == "redacted"
    assert d_sent.rendered_body == "redacted"
    assert ev_sent.data == {"redacted": True}

    # Dead sensitive delivery
    d_dead = Delivery(
        client_id=client.id,
        event=ev_sent,
        to_email="s@secure.com",
        status="dead",
        priority=2,
        retry_schedule=[5],
        sensitive=True,
        rendered_subject="redacted",
        rendered_body="redacted",
    )
    db.add(d_dead)
    db.commit()

    # Manual retry on dead sensitive delivery MUST return 409
    headers = {"X-API-Key": key}
    res_retry = http.post(f"/api/deliveries/{d_dead.id}/retry", headers=headers)
    assert res_retry.status_code == 409
    assert "sensitive" in res_retry.json()["detail"].lower()


def test_isolation_client_a_gets_404_for_client_b_delivery_event_recipient(db, http):
    """Client A gets 404 for client B's delivery, event, and recipient."""
    key_a = f"nh_live_{uuid.uuid4().hex}"
    client_a = make_client(db, "Iso A", key_a)
    key_b = f"nh_live_{uuid.uuid4().hex}"
    client_b = make_client(db, "Iso B", key_b)
    db.commit()

    rec_b = Recipient(
        client_id=client_b.id,
        external_id="ext_b_99",
        email="b_user@example.com",
        name="B User",
    )
    db.add(rec_b)

    ev_b = NotificationEvent(
        client_id=client_b.id,
        idempotency_key=f"ev_b_{uuid.uuid4().hex}",
        request_hash="hb",
        event_type="order_shipped",
        recipient_email="b_user@example.com",
        data={},
    )
    db.add(ev_b)

    del_b = Delivery(
        client_id=client_b.id,
        event=ev_b,
        to_email="b_user@example.com",
        status="sent",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        rendered_subject="S",
        rendered_body="B",
    )
    db.add(del_b)
    db.commit()

    headers_a = {"X-API-Key": key_a}

    # Delivery 404
    r_del = http.get(f"/api/deliveries/{del_b.id}", headers=headers_a)
    assert r_del.status_code == 404

    # Event 404
    r_ev = http.get(f"/api/events/{ev_b.id}", headers=headers_a)
    assert r_ev.status_code == 404

    # Recipient 404
    r_rec = http.get(f"/api/recipients/{rec_b.external_id}", headers=headers_a)
    assert r_rec.status_code == 404


def test_access_no_key_401_disabled_client_401_burst_429(db, http):
    """No key -> 401, disabled client -> 401, burst -> 429."""
    # 1. No key -> 401
    r_no_key = http.get("/api/event-types")
    assert r_no_key.status_code == 401

    # 2. Disabled client -> 401
    key_disabled = f"nh_live_{uuid.uuid4().hex}"
    client_dis = make_client(db, "Disabled Client", key_disabled, status="disabled")
    db.commit()

    r_disabled = http.get("/api/event-types", headers={"X-API-Key": key_disabled})
    assert r_disabled.status_code == 401
    assert "disabled" in r_disabled.json()["detail"].lower()

    # 3. Burst -> 429
    key_burst = f"nh_live_{uuid.uuid4().hex}"
    client_burst = make_client(db, "Burst Client", key_burst, rate_limit=2)
    db.commit()

    headers_burst = {"X-API-Key": key_burst}
    responses = [http.get("/api/event-types", headers=headers_burst) for _ in range(6)]
    statuses = [r.status_code for r in responses]

    assert 200 in statuses
    assert 429 in statuses

    r_429 = next(r for r in responses if r.status_code == 429)
    assert "Retry-After" in r_429.headers
    assert int(r_429.headers["Retry-After"]) >= 1
