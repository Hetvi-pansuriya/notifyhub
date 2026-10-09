"""Event type settings API endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_client
from app.models import Client
from app.schemas.event_types import (
    EventTypeSettingResponse,
    EventTypeSettingUpsert,
)
from app.services import management as mgmt_service

router = APIRouter(
    prefix="/api/event-types",
    tags=["Event Types"],
)


@router.get(
    "",
    response_model=list[EventTypeSettingResponse],
    summary="List event type settings",
    description="Lists all configured event type settings for the calling client.",
)
def list_event_types(
    current_client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return mgmt_service.list_event_type_settings(
        db=db,
        client_id=current_client.id,
    )


@router.put(
    "/{event_type}",
    response_model=EventTypeSettingResponse,
    status_code=status.HTTP_200_OK,
    summary="Configure event type settings",
    description="Creates or updates priority, ttl_seconds, retry_schedule, respect_opt_out, and sensitive flag.",
)
def configure_event_type(
    event_type: str,
    data: EventTypeSettingUpsert,
    current_client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return mgmt_service.upsert_event_type_setting(
        db=db,
        client_id=current_client.id,
        event_type=event_type,
        data=data,
    )
