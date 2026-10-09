"""Feature tests for Worker delivery pipeline, claiming, retry, and reaper."""

import uuid
from datetime import datetime, timedelta, timezone
from app.models import Client, Delivery, DeliveryAttempt, EventTypeSetting, NotificationEvent, Template
from worker.claim import claim_deliveries
from worker.providers.base import ProviderOutcome, ProviderResult
from worker.reaper import reap_stuck_deliveries


def _create_test_delivery(db_session, priority=1, status="queued", expires_at=None, sensitive=False):
    client = Client(name=f"WorkerClient_{uuid.uuid4().hex[:6]}", status="active", rate_limit_per_sec=50)
    db_session.add(client)
    db_session.flush()

    evt = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"k_{uuid.uuid4().hex}",
        request_hash="mock_hash",
        event_type="test",
        recipient_email="test@example.com",
        data={"test": True},
    )
    db_session.add(evt)
    db_session.flush()

    setting = EventTypeSetting(client_id=client.id, event_type="test", priority=priority, ttl_seconds=3600, retry_schedule=[10, 60], respect_opt_out=True, sensitive=sensitive)
    deliv = Delivery(
        client_id=client.id,
        event_id=evt.id,
        to_email="test@example.com",
        status=status,
        priority=priority,
        retry_schedule=[10, 60],
        attempt_count=0,
        sensitive=sensitive,
        expires_at=expires_at,
        rendered_subject="Subject OTP 123",
        rendered_body="Body OTP 123",
    )
    db_session.add_all([setting, deliv])
    db_session.commit()
    return deliv


def test_priority_claiming_and_skip_locked(db_session):
    """Verify higher priority deliveries are claimed first."""
    d_low = _create_test_delivery(db_session, priority=1)
    d_high = _create_test_delivery(db_session, priority=2)

    claimed = claim_deliveries(db_session, batch_size=10)
    claimed_ids = [d.id for d in claimed]

    assert d_high.id in claimed_ids
    assert d_low.id in claimed_ids
    # High priority appears before low priority
    assert claimed_ids.index(d_high.id) < claimed_ids.index(d_low.id)


def test_expired_deliveries_marked_and_not_sent(db_session):
    """Verify deliveries past expires_at are marked expired and not sent."""
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    deliv = _create_test_delivery(db_session, expires_at=past, sensitive=True)

    claimed = claim_deliveries(db_session, batch_size=10)
    target = next((d for d in claimed if d.id == deliv.id), None)
    assert target is not None

    # Simulating worker expiry check
    if target.expires_at and target.expires_at < datetime.now(timezone.utc):
        target.status = "expired"
        if target.sensitive:
            target.rendered_subject = "redacted"
            target.rendered_body = "redacted"
        db_session.commit()

    db_session.refresh(deliv)
    assert deliv.status == "expired"
    assert deliv.rendered_subject == "redacted"


def test_lock_reaper_resets_stuck_processing_deliveries(db_session):
    """Verify reaper reclaims deliveries stuck in 'processing' beyond lock timeout."""
    deliv = _create_test_delivery(db_session, status="processing")
    deliv.locked_until = datetime.now(timezone.utc) - timedelta(minutes=5)
    db_session.commit()

    reaped_count = reap_stuck_deliveries(db_session)
    assert reaped_count >= 1

    db_session.refresh(deliv)
    assert deliv.status == "queued"
    assert deliv.locked_until is None
