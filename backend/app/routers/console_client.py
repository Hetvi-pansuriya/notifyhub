"""Console client identity and settings endpoints (owner session only)."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import require_owner_session
from app.models import Client, Delivery, User
from app.schemas.console_client import ConsoleClientResponse, ConsoleClientUpdate

router = APIRouter(
    prefix="/console/client",
    tags=["Console Client"],
)


def get_sent_today(db: Session, client_id) -> int:
    """Counts today's UTC non-skipped deliveries for the given client."""
    now_utc = datetime.now(timezone.utc)
    midnight_utc = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(Delivery)
        .filter(
            Delivery.client_id == client_id,
            Delivery.created_at >= midnight_utc,
            Delivery.status != "skipped",
        )
        .count()
    )


@router.get(
    "",
    response_model=ConsoleClientResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current client sending identity and daily limit stats",
)
def get_console_client(
    auth: tuple[User, Client] = Depends(require_owner_session),
    db: Session = Depends(get_db),
):
    _, client = auth
    sent_today = get_sent_today(db, client.id)
    sender_email = settings.FROM_EMAIL or settings.sender_email or "no-reply@notifyhub.local"

    return ConsoleClientResponse(
        id=client.id,
        name=client.name,
        status=client.status,
        from_name=client.from_name or client.name,
        reply_to_email=client.reply_to_email,
        daily_email_limit=client.daily_email_limit if client.daily_email_limit is not None else 30,
        sent_today=sent_today,
        sender_email=sender_email,
    )


@router.patch(
    "",
    response_model=ConsoleClientResponse,
    status_code=status.HTTP_200_OK,
    summary="Update client sending identity (from_name and reply_to_email)",
)
def update_console_client(
    data: ConsoleClientUpdate,
    auth: tuple[User, Client] = Depends(require_owner_session),
    db: Session = Depends(get_db),
):
    _, client = auth

    client.from_name = data.from_name
    client.reply_to_email = data.reply_to_email

    db.commit()
    db.refresh(client)

    sent_today = get_sent_today(db, client.id)
    sender_email = settings.FROM_EMAIL or settings.sender_email or "no-reply@notifyhub.local"

    return ConsoleClientResponse(
        id=client.id,
        name=client.name,
        status=client.status,
        from_name=client.from_name,
        reply_to_email=client.reply_to_email,
        daily_email_limit=client.daily_email_limit if client.daily_email_limit is not None else 30,
        sent_today=sent_today,
        sender_email=sender_email,
    )
