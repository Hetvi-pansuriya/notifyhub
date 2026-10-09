"""Unit and integration tests for Phase 5: Worker Core, Claiming, Provider, and Redaction."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
import pytest

from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.main import app
from app.models import ApiKey, Client, Delivery, DeliveryAttempt, NotificationEvent
from app.security import hash_key
from worker.claim import claim_deliveries
from worker.providers.base import ProviderOutcome, ProviderResult
from worker.providers.smtp import SmtpEmailProvider
from worker.sender import OutgoingRateLimiter, calculate_next_retry, process_single_delivery


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def test_client_id(db):
    client = Client(
        id=uuid.uuid4(),
        name="Worker Test Client",
        status="active",
        rate_limit_per_sec=50,
    )
    db.add(client)
    db.commit()
    return client.id


def test_claim_deliveries_priority_ordering(db, test_client_id):
    """Verify that claim_deliveries claims high priority (2) before normal (1)."""
    # Clean any queued deliveries left by previous tests to ensure deterministic batch claiming
    db.query(Delivery).filter(Delivery.status == "queued").delete()
    db.commit()

    now = datetime.now(timezone.utc)

    # 1. Create a normal priority event + delivery (priority=1)
    ev1 = NotificationEvent(
        client_id=test_client_id,
        idempotency_key="norm_order_1",
        request_hash="hash1",
        event_type="order_shipped",
        recipient_email="norm@example.com",
        data={"order": 1},
    )
    db.add(ev1)
    del1 = Delivery(
        client_id=test_client_id,
        event=ev1,
        to_email="norm@example.com",
        status="queued",
        priority=1,
        retry_schedule=[60],
        sensitive=False,
        rendered_subject="Normal Order",
        rendered_body="Body",
        next_attempt_at=now - timedelta(seconds=10),
    )
    db.add(del1)

    # 2. Create a high priority event + delivery (priority=2)
    ev2 = NotificationEvent(
        client_id=test_client_id,
        idempotency_key="high_otp_1",
        request_hash="hash2",
        event_type="auth_otp",
        recipient_email="otp@example.com",
        data={"code": "1234"},
    )
    db.add(ev2)
    del2 = Delivery(
        client_id=test_client_id,
        event=ev2,
        to_email="otp@example.com",
        status="queued",
        priority=2,
        retry_schedule=[10],
        sensitive=True,
        rendered_subject="Your Code",
        rendered_body="Code: 1234",
        next_attempt_at=now - timedelta(seconds=5),
    )
    db.add(del2)
    db.commit()

    # Claim deliveries
    claimed = claim_deliveries(db, batch_size=10)
    claimed_ids = [d.id for d in claimed]

    # del2 (priority 2) must appear before del1 (priority 1)
    assert del2.id in claimed_ids
    assert del1.id in claimed_ids
    idx_del2 = claimed_ids.index(del2.id)
    idx_del1 = claimed_ids.index(del1.id)
    assert idx_del2 < idx_del1

    # Verify status changed to processing
    db.expire_all()
    reloaded_del2 = db.query(Delivery).filter(Delivery.id == del2.id).first()
    assert reloaded_del2.status == "processing"
    assert reloaded_del2.locked_until is not None


def test_expired_delivery_is_not_sent(db, test_client_id):
    """Verify expired delivery transitions to 'expired', is redacted if sensitive, and never sent."""
    now = datetime.now(timezone.utc)
    ev = NotificationEvent(
        client_id=test_client_id,
        idempotency_key="exp_event_1",
        request_hash="hash_exp",
        event_type="auth_otp",
        recipient_email="exp@example.com",
        data={"secret": "9999"},
    )
    db.add(ev)
    delivery = Delivery(
        client_id=test_client_id,
        event=ev,
        to_email="exp@example.com",
        status="processing",
        priority=2,
        retry_schedule=[10],
        sensitive=True,
        rendered_subject="Secret OTP",
        rendered_body="Your OTP: 9999",
        expires_at=now - timedelta(seconds=1),  # already expired
    )
    db.add(delivery)
    db.commit()

    mock_provider = MagicMock()
    rate_limiter = OutgoingRateLimiter(rate_per_sec=100)

    process_single_delivery(db, delivery, mock_provider, rate_limiter)

    # Provider send must NOT have been called
    mock_provider.send.assert_not_called()

    # Delivery status must be expired and content redacted
    db.refresh(delivery)
    assert delivery.status == "expired"
    assert delivery.rendered_subject == "redacted"
    assert delivery.rendered_body == "redacted"

    db.refresh(ev)
    assert ev.data == {"redacted": True}


def test_successful_send_and_sensitive_redaction(db, test_client_id):
    """Verify successful dispatch records an attempt, sets status 'sent', and wipes sensitive content."""
    ev = NotificationEvent(
        client_id=test_client_id,
        idempotency_key="otp_success_1",
        request_hash="hash_otp",
        event_type="auth_otp",
        recipient_email="alice@example.com",
        data={"otp": "555111"},
    )
    db.add(ev)
    delivery = Delivery(
        client_id=test_client_id,
        event=ev,
        to_email="alice@example.com",
        status="processing",
        priority=2,
        retry_schedule=[10],
        sensitive=True,
        rendered_subject="Code 555111",
        rendered_body="Your code is 555111",
    )
    db.add(delivery)
    db.commit()

    mock_provider = MagicMock()
    mock_provider.send.return_value = ProviderResult(
        outcome=ProviderOutcome.SUCCESS,
        provider_response="250 OK",
    )
    rate_limiter = OutgoingRateLimiter(rate_per_sec=100)

    process_single_delivery(db, delivery, mock_provider, rate_limiter)

    # Verify provider called
    mock_provider.send.assert_called_once()

    # Status must be sent and sensitive content redacted
    db.refresh(delivery)
    assert delivery.status == "sent"
    assert delivery.attempt_count == 1
    assert delivery.rendered_subject == "redacted"
    assert delivery.rendered_body == "redacted"

    # Event data must be wiped
    db.refresh(ev)
    assert ev.data == {"redacted": True}

    # Verify delivery attempt logged
    attempts = db.query(DeliveryAttempt).filter(DeliveryAttempt.delivery_id == delivery.id).all()
    assert len(attempts) == 1
    assert attempts[0].outcome == "success"
    assert attempts[0].attempt_no == 1


def test_calculate_next_retry_schedule():
    """Verify retry schedule progression and exhaustion."""
    schedule = [5, 10, 20, 40]
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

    # Attempt 1 failed -> wait 5s
    status1, next1 = calculate_next_retry(schedule, attempt_count=1, now=now)
    assert status1 == "queued"
    assert next1 == now + timedelta(seconds=5)

    # Attempt 2 failed -> wait 10s
    status2, next2 = calculate_next_retry(schedule, attempt_count=2, now=now)
    assert status2 == "queued"
    assert next2 == now + timedelta(seconds=10)

    # Attempt 3 failed -> wait 20s
    status3, next3 = calculate_next_retry(schedule, attempt_count=3, now=now)
    assert status3 == "queued"
    assert next3 == now + timedelta(seconds=20)

    # Attempt 4 failed -> wait 40s
    status4, next4 = calculate_next_retry(schedule, attempt_count=4, now=now)
    assert status4 == "queued"
    assert next4 == now + timedelta(seconds=40)

    # Attempt 5 failed -> exhausted (4 delays + 1 initial attempt = 5 max attempts)
    status5, next5 = calculate_next_retry(schedule, attempt_count=5, now=now)
    assert status5 == "dead"
    assert next5 is None

    # Empty schedule: 1 attempt max
    status_empty, next_empty = calculate_next_retry([], attempt_count=1, now=now)
    assert status_empty == "dead"
    assert next_empty is None


def test_calculate_next_retry_expires_before_retry():
    """Verify delivery expires if next retry would occur after expires_at."""
    schedule = [30]
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    expires_at = now + timedelta(seconds=15)  # Expires before 30s delay

    status, next_attempt = calculate_next_retry(schedule, attempt_count=1, now=now, expires_at=expires_at)
    assert status == "expired"
    assert next_attempt is None


def test_temporary_error_retry_and_dead_status(db, test_client_id):
    """Verify TEMPORARY_ERROR reschedules, logs attempt, and eventually marks dead."""
    ev = NotificationEvent(
        client_id=test_client_id,
        idempotency_key="temp_err_event",
        request_hash="hash_tmp",
        event_type="order_shipped",
        recipient_email="temp@example.com",
        data={"order_id": 99},
    )
    db.add(ev)
    delivery = Delivery(
        client_id=test_client_id,
        event=ev,
        to_email="temp@example.com",
        status="processing",
        priority=1,
        retry_schedule=[5],  # 1 delay -> max 2 attempts
        sensitive=False,
        rendered_subject="Order 99",
        rendered_body="Body",
    )
    db.add(delivery)
    db.commit()

    mock_provider = MagicMock()
    mock_provider.send.return_value = ProviderResult(
        outcome=ProviderOutcome.TEMPORARY_ERROR,
        error_message="SMTP connection refused",
    )
    rate_limiter = OutgoingRateLimiter(rate_per_sec=100)

    # 1. First failure -> should be queued with delay
    process_single_delivery(db, delivery, mock_provider, rate_limiter)
    db.refresh(delivery)
    assert delivery.status == "queued"
    assert delivery.attempt_count == 1
    assert delivery.last_error == "SMTP connection refused"
    assert delivery.next_attempt_at is not None

    # 2. Second failure -> max attempts (2) reached -> dead
    delivery.status = "processing"
    db.commit()

    process_single_delivery(db, delivery, mock_provider, rate_limiter)
    db.refresh(delivery)
    assert delivery.status == "dead"
    assert delivery.attempt_count == 2
    assert delivery.last_error == "SMTP connection refused"

    # Verify 2 attempts logged
    attempts = db.query(DeliveryAttempt).filter(DeliveryAttempt.delivery_id == delivery.id).all()
    assert len(attempts) == 2


def test_permanent_error_marks_dead_immediately(db, test_client_id):
    """Verify PERMANENT_ERROR sets dead status on first attempt without retrying."""
    ev = NotificationEvent(
        client_id=test_client_id,
        idempotency_key="perm_err_event",
        request_hash="hash_prm",
        event_type="order_shipped",
        recipient_email="bad@example.com",
        data={"order_id": 88},
    )
    db.add(ev)
    delivery = Delivery(
        client_id=test_client_id,
        event=ev,
        to_email="bad@example.com",
        status="processing",
        priority=1,
        retry_schedule=[10, 20],
        sensitive=False,
        rendered_subject="Order 88",
        rendered_body="Body",
    )
    db.add(delivery)
    db.commit()

    mock_provider = MagicMock()
    mock_provider.send.return_value = ProviderResult(
        outcome=ProviderOutcome.PERMANENT_ERROR,
        error_message="550 5.1.1 User unknown",
    )
    rate_limiter = OutgoingRateLimiter(rate_per_sec=100)

    process_single_delivery(db, delivery, mock_provider, rate_limiter)
    db.refresh(delivery)
    assert delivery.status == "dead"
    assert delivery.attempt_count == 1
    assert delivery.last_error == "550 5.1.1 User unknown"
    assert delivery.next_attempt_at is None


def test_delivery_retry_endpoint(db):
    """Verify POST /api/deliveries/{id}/retry behavior."""
    api_key = f"nh_live_{uuid.uuid4().hex}"
    client = Client(
        id=uuid.uuid4(),
        name="Retry API Client",
        status="active",
        rate_limit_per_sec=50,
    )
    api_key_obj = ApiKey(
        client_id=client.id,
        name="Default key",
        key_prefix=api_key[:12],
        key_hash=hash_key(api_key),
        status="active",
    )
    db.add(client)
    db.add(api_key_obj)

    ev = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"retry_test_ev_{uuid.uuid4().hex}",
        request_hash="hash_rt",
        event_type="order_shipped",
        recipient_email="retry@example.com",
        data={"foo": "bar"},
    )
    db.add(ev)

    # 1. Dead delivery (normal, non-sensitive)
    dead_delivery = Delivery(
        client_id=client.id,
        event=ev,
        to_email="retry@example.com",
        status="dead",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        attempt_count=2,
        last_error="Connection timed out",
        rendered_subject="Subj",
        rendered_body="Body",
    )
    db.add(dead_delivery)

    # 2. Sensitive dead delivery
    sensitive_dead = Delivery(
        client_id=client.id,
        event=ev,
        to_email="otp@example.com",
        status="dead",
        priority=2,
        retry_schedule=[5],
        sensitive=True,
        attempt_count=2,
        last_error="SMTP down",
        rendered_subject="redacted",
        rendered_body="redacted",
    )
    db.add(sensitive_dead)

    # 3. Queued delivery (not dead)
    queued_delivery = Delivery(
        client_id=client.id,
        event=ev,
        to_email="queued@example.com",
        status="queued",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        attempt_count=0,
        rendered_subject="Subj",
        rendered_body="Body",
    )
    db.add(queued_delivery)
    db.commit()

    http = TestClient(app)
    headers = {"X-API-Key": api_key}

    # Test A: Retrying non-dead delivery returns 409
    res_queued = http.post(f"/api/deliveries/{queued_delivery.id}/retry", headers=headers)
    assert res_queued.status_code == 409

    # Test B: Retrying sensitive delivery returns 409
    res_sens = http.post(f"/api/deliveries/{sensitive_dead.id}/retry", headers=headers)
    assert res_sens.status_code == 409

    # Test C: Retrying non-existent delivery returns 404
    fake_id = uuid.uuid4()
    res_404 = http.post(f"/api/deliveries/{fake_id}/retry", headers=headers)
    assert res_404.status_code == 404

    # Test D: Retrying valid dead delivery returns 200 and resets delivery state
    res_ok = http.post(f"/api/deliveries/{dead_delivery.id}/retry", headers=headers)
    assert res_ok.status_code == 200
    data = res_ok.json()
    assert data["status"] == "queued"
    assert data["attempt_count"] == 0
    assert data["last_error"] is None
    assert data["next_attempt_at"] is not None

    db.refresh(dead_delivery)
    assert dead_delivery.status == "queued"
    assert dead_delivery.attempt_count == 0
    assert dead_delivery.last_error is None

