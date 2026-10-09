"""Event intake and inspection API endpoints."""

import uuid
from fastapi import APIRouter, Depends, Header, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_client
from app.models import Client
from app.schemas.events import EventCreate, EventDetailResponse, EventIntakeResponse
from app.services import intake as intake_service

router = APIRouter(
    prefix="/api/events",
    tags=["Events"],
)


@router.post(
    "",
    response_model=EventIntakeResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest a notification event",
    description="Accepts an event, renders templates strictly, creates a durable queued delivery, and returns 202 Accepted. Idempotent by client and Idempotency-Key.",
)
def create_event(
    event_data: EventCreate,
    response: Response,
    idempotency_key: str = Header(
        ...,
        alias="Idempotency-Key",
        min_length=1,
        max_length=255,
        description="Unique idempotency key per event dispatch",
    ),
    current_client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    intake_resp, status_code = intake_service.process_event_intake(
        db=db,
        client_id=current_client.id,
        idempotency_key=idempotency_key,
        event_data=event_data,
    )
    response.status_code = status_code
    return intake_resp


@router.get(
    "/{event_id}",
    response_model=EventDetailResponse,
    summary="Get event details and delivery status",
    description="Returns event payload, rendered delivery details, and delivery attempts. Scoped to the authenticated client.",
)
def get_event(
    event_id: uuid.UUID,
    current_client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return intake_service.get_event_detail(
        db=db,
        client_id=current_client.id,
        event_id=event_id,
    )
