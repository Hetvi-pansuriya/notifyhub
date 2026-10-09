"""Delivery processing logic: rate limiting, provider dispatch, retry scheduling, and redaction."""

import logging
import math
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Client, Delivery, DeliveryAttempt, NotificationEvent
from worker.providers.base import BaseEmailProvider, ProviderOutcome

logger = logging.getLogger("worker.sender")


class OutgoingRateLimiter:
    """Thread-safe token bucket rate limiter for outgoing email dispatch."""

    def __init__(self, rate_per_sec: float):
        self.rate = max(float(rate_per_sec), 1.0)
        self.capacity = self.rate
        self.tokens = self.capacity
        self.last_update = time.monotonic()
        self.lock = threading.Lock()

    def wait_for_slot(self) -> None:
        """Blocks until a token is available."""
        while True:
            with self.lock:
                now = time.monotonic()
                elapsed = now - self.last_update
                self.last_update = now
                self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)

                if self.tokens >= 1.0:
                    self.tokens -= 1.0
                    return

                # Calculate sleep duration needed for 1 token
                needed = 1.0 - self.tokens
                sleep_sec = max(0.01, needed / self.rate)

            time.sleep(sleep_sec)


def _default_outgoing_rate() -> float:
    """When provider is sendgrid default OUTGOING_RATE_PER_SEC to 2."""
    if settings.MAIL_PROVIDER.lower() == "sendgrid" and settings.OUTGOING_RATE_PER_SEC == 20:
        return 2.0
    return float(settings.OUTGOING_RATE_PER_SEC)


outgoing_rate_limiter = OutgoingRateLimiter(_default_outgoing_rate())


def redact_sensitive_delivery(db: Session, delivery: Delivery) -> None:
    """Wipes subject, body, and event data for sensitive deliveries (Rule 9)."""
    delivery.rendered_subject = "redacted"
    delivery.rendered_body = "redacted"

    if delivery.event_id is not None:
        event = db.query(NotificationEvent).filter(NotificationEvent.id == delivery.event_id).first()
        if event is not None:
            event.data = {"redacted": True}


def calculate_next_retry(
    retry_schedule: list[int],
    attempt_count: int,
    now: datetime,
    expires_at: Optional[datetime] = None,
) -> tuple[str, Optional[datetime]]:
    """Determine the next status and attempt time after a TEMPORARY_ERROR.

    The number of attempts equals the number of delays plus one.
    - If attempts are left (attempt_count <= len(retry_schedule)):
      delay is retry_schedule[attempt_count - 1] seconds.
      next_retry_time = now + delay.
      If next_retry_time > expires_at (when expires_at is set):
        status is 'expired'.
      Else:
        status is 'queued' with next_attempt_at = next_retry_time.
    - When attempts are used up (attempt_count > len(retry_schedule)):
      status is 'dead' with next_attempt_at = None.

    Returns:
        (new_status, next_attempt_at)
    """
    if attempt_count <= len(retry_schedule):
        delay_sec = retry_schedule[attempt_count - 1]
        next_attempt = now + timedelta(seconds=delay_sec)
        if expires_at is not None and next_attempt > expires_at:
            return "expired", None
        return "queued", next_attempt
    else:
        return "dead", None


def process_single_delivery(
    db: Session,
    delivery: Delivery,
    provider: BaseEmailProvider,
    rate_limiter: Optional[OutgoingRateLimiter] = None,
) -> None:
    """Processes a single claimed delivery independently.
    
    Commit is executed per delivery so failure of one does not roll back others.
    """
    if rate_limiter is None:
        rate_limiter = outgoing_rate_limiter

    now = datetime.now(timezone.utc)

    # 1. Expiry check: if expires_at has passed, mark expired and wipe if sensitive
    if delivery.expires_at is not None and delivery.expires_at <= now:
        logger.info("Delivery %s has expired (expires_at=%s)", delivery.id, delivery.expires_at)
        delivery.status = "expired"
        delivery.locked_until = None
        if delivery.sensitive:
            redact_sensitive_delivery(db, delivery)
        db.commit()
        return

    # 2. Rate limit token bucket wait
    rate_limiter.wait_for_slot()

    # 3. Resolve client sending identity
    from_name = "NotifyHub"
    reply_to = None
    if delivery.client_id is not None:
        client = db.query(Client).filter(Client.id == delivery.client_id).first()
        if client:
            from_name = client.from_name or client.name or "NotifyHub"
            reply_to = client.reply_to_email

    p_name = getattr(provider, "provider_name", None)
    if isinstance(p_name, str):
        provider_name = p_name
    else:
        provider_name = (settings.MAIL_PROVIDER or "smtp").lower()

    # 4. Dispatch through email provider with latency measurement
    start_time = time.perf_counter()
    result = provider.send(
        to=delivery.to_email,
        subject=delivery.rendered_subject,
        body=delivery.rendered_body,
        message_id=str(delivery.id),
        from_name=from_name,
        reply_to=reply_to,
    )
    latency_ms = int((time.perf_counter() - start_time) * 1000)

    # Save provider and provider_message_id on delivery after each attempt
    delivery.provider = provider_name
    if result.provider_message_id:
        delivery.provider_message_id = result.provider_message_id

    # 5. Record delivery attempt
    attempt_no = delivery.attempt_count + 1
    attempt = DeliveryAttempt(
        delivery_id=delivery.id,
        attempt_no=attempt_no,
        outcome=result.outcome.value,
        error_message=result.error_message,
        latency_ms=latency_ms,
        created_at=datetime.now(timezone.utc),
    )
    db.add(attempt)
    delivery.attempt_count = attempt_no

    # 5. Handle outcome
    if result.outcome == ProviderOutcome.SUCCESS:
        delivery.status = "sent"
        delivery.locked_until = None
        delivery.last_error = None
        if delivery.sensitive:
            redact_sensitive_delivery(db, delivery)
        try:
            from app.services.system_status import set_system_status
            set_system_status(db, "last_send_ok_at", datetime.now(timezone.utc).isoformat())
        except Exception:
            pass
        logger.info("Delivery %s successfully sent (latency=%sms)", delivery.id, latency_ms)
    elif result.outcome == ProviderOutcome.PERMANENT_ERROR:
        delivery.status = "dead"
        delivery.last_error = result.error_message
        delivery.locked_until = None
        delivery.next_attempt_at = None
        if delivery.sensitive:
            redact_sensitive_delivery(db, delivery)
        try:
            from app.services.system_status import set_system_status
            err_msg = (result.error_message or "Permanent send error")[:250]
            set_system_status(db, "last_send_error", err_msg)
        except Exception:
            pass
        logger.warning(
            "Delivery %s marked dead on permanent error (attempt=%s, error=%s)",
            delivery.id,
            attempt_no,
            result.error_message,
        )
    else:  # TEMPORARY_ERROR
        delivery.last_error = result.error_message
        try:
            from app.services.system_status import set_system_status
            err_msg = (result.error_message or "Temporary send error")[:250]
            set_system_status(db, "last_send_error", err_msg)
        except Exception:
            pass
        retry_schedule = delivery.retry_schedule or []
        new_status, next_attempt_at = calculate_next_retry(
            retry_schedule=retry_schedule,
            attempt_count=attempt_no,
            now=datetime.now(timezone.utc),
            expires_at=delivery.expires_at,
        )
        delivery.status = new_status
        delivery.next_attempt_at = next_attempt_at
        delivery.locked_until = None

        if new_status in ("dead", "expired") and delivery.sensitive:
            redact_sensitive_delivery(db, delivery)

        if new_status == "queued":
            logger.info(
                "Delivery %s scheduled retry at %s (attempt=%s/%s)",
                delivery.id,
                next_attempt_at,
                attempt_no,
                len(retry_schedule) + 1,
            )
        elif new_status == "dead":
            logger.warning(
                "Delivery %s exhausted retries and marked dead (attempts=%s, error=%s)",
                delivery.id,
                attempt_no,
                result.error_message,
            )
        elif new_status == "expired":
            logger.warning(
                "Delivery %s retry would exceed expires_at; marked expired",
                delivery.id,
            )

    db.commit()
