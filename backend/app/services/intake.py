"""Event intake processing service: validation, idempotency, strict rendering, and durable delivery creation."""

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.exceptions import DailyLimitExceeded
from app.models import Client, Delivery, EventTypeSetting, NotificationEvent, Preference, Recipient, Template
from app.schemas.events import EventCreate, EventDetailResponse, EventIntakeResponse
from app.services.rendering import render


def compute_request_hash(payload: dict[str, Any], is_sensitive: bool) -> str:
    """Computes a deterministic hash of the request body.
    
    Uses HMAC-SHA256 with HMAC_SECRET for sensitive event types,
    and plain SHA-256 for non-sensitive events.
    """
    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    raw_bytes = canonical_json.encode("utf-8")

    if is_sensitive:
        return hmac.new(
            settings.HMAC_SECRET.encode("utf-8"),
            raw_bytes,
            hashlib.sha256,
        ).hexdigest()
    return hashlib.sha256(raw_bytes).hexdigest()


def check_existing_idempotency(
    db: Session, client_id: uuid.UUID, idempotency_key: str, request_hash: str
) -> Optional[tuple[NotificationEvent, Delivery]]:
    """Checks if an event with (client_id, idempotency_key) already exists.
    
    - Same key + same hash -> returns existing (event, delivery) to replay response.
    - Same key + different hash -> raises HTTP 409 Conflict.
    """
    existing_event = (
        db.query(NotificationEvent)
        .filter(
            NotificationEvent.client_id == client_id,
            NotificationEvent.idempotency_key == idempotency_key,
        )
        .first()
    )

    if existing_event is None:
        return None

    if existing_event.request_hash != request_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Idempotency key already exists with different request parameters",
        )

    # Load delivery associated with this event
    delivery = (
        db.query(Delivery)
        .filter(Delivery.client_id == client_id, Delivery.event_id == existing_event.id)
        .first()
    )
    return existing_event, delivery


def load_event_settings_and_active_template(
    db: Session, client_id: uuid.UUID, event_type: str
) -> tuple[EventTypeSetting, Template]:
    """Loads configured event type settings and the ACTIVE template for this client tenant.
    
    Raises 422 if the event type is unknown or no active template exists.
    """
    setting = (
        db.query(EventTypeSetting)
        .filter(
            EventTypeSetting.client_id == client_id,
            EventTypeSetting.event_type == event_type,
        )
        .first()
    )
    if setting is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown or unconfigured event type: '{event_type}'",
        )

    template = (
        db.query(Template)
        .filter(
            Template.client_id == client_id,
            Template.event_type == event_type,
            Template.status == "active",
        )
        .first()
    )
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"No active template found for event type: '{event_type}'",
        )

    return setting, template


def resolve_recipient_and_opt_out(
    db: Session,
    client_id: uuid.UUID,
    event_type: str,
    recipient_id: Optional[uuid.UUID],
    email: Optional[str],
    respect_opt_out: bool,
) -> tuple[str, bool]:
    """Resolves target email address and checks recipient opt-out status.
    
    Returns:
        tuple (to_email: str, is_opted_out: bool)
    """
    if recipient_id is not None:
        recipient = (
            db.query(Recipient)
            .filter(Recipient.client_id == client_id, Recipient.id == recipient_id)
            .first()
        )
        if recipient is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipient not found",
            )
        to_email = recipient.email

        if respect_opt_out:
            pref = (
                db.query(Preference)
                .filter(
                    Preference.recipient_id == recipient.id,
                    Preference.event_type == event_type,
                )
                .first()
            )
            # Opted out if preference exists and enabled is False
            is_opted_out = (pref is not None and not pref.enabled)
        else:
            is_opted_out = False
    else:
        to_email = email  # Guaranteed to be non-None by Pydantic validator
        is_opted_out = False

    return to_email, is_opted_out


def save_event_and_delivery(
    db: Session,
    client_id: uuid.UUID,
    idempotency_key: str,
    request_hash: str,
    event_type: str,
    recipient_id: Optional[uuid.UUID],
    to_email: str,
    data: dict[str, Any],
    rendered_subject: str,
    rendered_body: str,
    setting: EventTypeSetting,
    is_skipped: bool,
    send_at: Optional[datetime] = None,
) -> tuple[NotificationEvent, Delivery]:
    """Atomically inserts the notification_event and delivery in ONE database transaction.
    
    If concurrent request arrives with the same idempotency key, handles IntegrityError gracefully.
    """
    now = datetime.now(timezone.utc)
    base_time = send_at if send_at is not None else now
    expires_at = (
        base_time + timedelta(seconds=setting.ttl_seconds)
        if setting.ttl_seconds is not None
        else None
    )

    delivery_status = "skipped" if is_skipped else "queued"
    next_attempt = None if is_skipped else (send_at if send_at is not None else now)

    event = NotificationEvent(
        client_id=client_id,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        event_type=event_type,
        recipient_id=recipient_id,
        recipient_email=to_email,
        send_at=send_at,
        data=data,
        created_at=now,
    )

    delivery = Delivery(
        client_id=client_id,
        event=event,
        to_email=to_email,
        status=delivery_status,
        priority=setting.priority,
        expires_at=expires_at,
        retry_schedule=setting.retry_schedule,
        sensitive=setting.sensitive,
        attempt_count=0,
        next_attempt_at=next_attempt,
        rendered_subject=rendered_subject,
        rendered_body=rendered_body,
        created_at=now,
    )

    try:
        db.add(event)
        db.add(delivery)
        db.commit()
        db.refresh(event)
        db.refresh(delivery)
        return event, delivery
    except IntegrityError:
        db.rollback()
        # Concurrent identical request raced: re-read existing event
        existing = check_existing_idempotency(db, client_id, idempotency_key, request_hash)
        if existing is not None:
            return existing
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conflict inserting notification event",
        )


def process_event_intake(
    db: Session,
    client_id: uuid.UUID,
    idempotency_key: str,
    event_data: EventCreate,
) -> tuple[EventIntakeResponse, int]:
    """Coordinates the full intake pipeline.
    
    Returns:
        tuple (EventIntakeResponse, http_status_code)
    """
    # 1. Quick lookup of event settings to check if sensitive for HMAC computation
    raw_setting = (
        db.query(EventTypeSetting)
        .filter(
            EventTypeSetting.client_id == client_id,
            EventTypeSetting.event_type == event_data.event_type,
        )
        .first()
    )
    is_sensitive = raw_setting.sensitive if raw_setting is not None else False

    # 2. Idempotency hash calculation and lookup
    payload_dict = event_data.model_dump(mode="json")
    request_hash = compute_request_hash(payload_dict, is_sensitive=is_sensitive)

    existing = check_existing_idempotency(db, client_id, idempotency_key, request_hash)
    if existing is not None:
        event, delivery = existing
        # Replay: 200 OK
        resp = EventIntakeResponse(
            event_id=event.id,
            send_at=event.send_at,
            delivery=delivery,
        )
        return resp, status.HTTP_200_OK

    # 3. Load settings and active template
    setting, template = load_event_settings_and_active_template(
        db, client_id, event_data.event_type
    )

    # Sensitive event types do not allow send_at (422)
    if event_data.send_at is not None and setting.sensitive:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Scheduled send (send_at) is not permitted for sensitive event types",
        )

    # 4. Resolve recipient and check opt-out preferences
    to_email, is_opted_out = resolve_recipient_and_opt_out(
        db,
        client_id=client_id,
        event_type=event_data.event_type,
        recipient_id=event_data.recipient_id,
        email=event_data.email,
        respect_opt_out=setting.respect_opt_out,
    )

    # 5. Allowlist check: only when MAIL_PROVIDER=sendgrid and DEMO_ALLOWED_RECIPIENTS is set
    if (
        (settings.MAIL_PROVIDER or "").lower() == "sendgrid"
        and settings.DEMO_ALLOWED_RECIPIENTS
        and settings.DEMO_ALLOWED_RECIPIENTS.strip()
    ):
        allowed_recipients = [
            em.strip().lower()
            for em in settings.DEMO_ALLOWED_RECIPIENTS.split(",")
            if em.strip()
        ]
        if to_email.strip().lower() not in allowed_recipients:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="This recipient is not allowed in demo mode",
            )

    # 6. Daily limit check: count today's (UTC) non-skipped deliveries per client and globally
    # Skipped (opted-out) deliveries do not count.
    if not is_opted_out:
        now_utc = datetime.now(timezone.utc)
        today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        midnight_utc = today_start + timedelta(days=1)
        retry_after_seconds = max(1, int((midnight_utc - now_utc).total_seconds()))

        # Monthly plan limit check
        client = db.query(Client).filter(Client.id == client_id).first()
        monthly_limit = (
            client.plan.monthly_email_limit
            if (client and client.plan and client.plan.monthly_email_limit is not None)
            else settings.DEFAULT_PLAN_MONTHLY_LIMIT
        )
        month_start = now_utc.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        client_month_count = (
            db.query(Delivery)
            .filter(
                Delivery.client_id == client_id,
                Delivery.created_at >= month_start,
                Delivery.status != "skipped",
            )
            .count()
        )
        if client_month_count >= monthly_limit:
            if now_utc.month == 12:
                next_month_start = now_utc.replace(year=now_utc.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            else:
                next_month_start = now_utc.replace(month=now_utc.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
            retry_after_month = max(1, int((next_month_start - now_utc).total_seconds()))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Monthly plan limit reached",
                headers={"Retry-After": str(retry_after_month)},
            )

        # A. Client daily limit
        client_limit = client.daily_email_limit if (client and client.daily_email_limit is not None) else 30
        client_today_count = (
            db.query(Delivery)
            .filter(
                Delivery.client_id == client_id,
                Delivery.created_at >= today_start,
                Delivery.status != "skipped",
            )
            .count()
        )
        if client_today_count >= client_limit:
            raise DailyLimitExceeded(retry_after_seconds=retry_after_seconds)

        # B. Global daily limit across all clients
        global_limit = settings.GLOBAL_DAILY_LIMIT
        if global_limit is not None and global_limit > 0:
            global_today_count = (
                db.query(Delivery)
                .filter(
                    Delivery.created_at >= today_start,
                    Delivery.status != "skipped",
                )
                .count()
            )
            if global_today_count >= global_limit:
                raise DailyLimitExceeded(retry_after_seconds=retry_after_seconds)

    # 7. Strict rendering of subject and body (missing variable raises 422 immediately)
    rendered_subject, rendered_body = render(
        template.subject,
        template.body,
        event_data.data,
    )

    # 6. Save event and delivery in ONE atomic transaction
    event, delivery = save_event_and_delivery(
        db=db,
        client_id=client_id,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        event_type=event_data.event_type,
        recipient_id=event_data.recipient_id,
        to_email=to_email,
        data=event_data.data,
        rendered_subject=rendered_subject,
        rendered_body=rendered_body,
        setting=setting,
        is_skipped=is_opted_out,
        send_at=event_data.send_at,
    )

    # 7. Return 202 Accepted
    resp = EventIntakeResponse(
        event_id=event.id,
        send_at=event.send_at,
        delivery=delivery,
    )
    return resp, status.HTTP_202_ACCEPTED


def get_event_detail(
    db: Session, client_id: uuid.UUID, event_id: uuid.UUID
) -> EventDetailResponse:
    """Retrieves event details, delivery, and delivery attempts scoped to client."""
    event = (
        db.query(NotificationEvent)
        .filter(NotificationEvent.client_id == client_id, NotificationEvent.id == event_id)
        .first()
    )
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    delivery = (
        db.query(Delivery)
        .filter(Delivery.client_id == client_id, Delivery.event_id == event.id)
        .first()
    )

    # Return safe data (if sensitive event data was redacted, it already holds {"redacted": true})
    return EventDetailResponse(
        id=event.id,
        client_id=event.client_id,
        idempotency_key=event.idempotency_key,
        event_type=event.event_type,
        recipient_id=event.recipient_id,
        recipient_email=event.recipient_email,
        send_at=event.send_at,
        data=event.data,
        created_at=event.created_at,
        delivery=delivery,
    )
