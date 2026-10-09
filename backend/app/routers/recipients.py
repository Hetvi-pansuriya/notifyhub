"""Recipients and opt-out preferences API endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_client
from app.models import Client
from app.schemas.recipients import (
    RecipientPreferenceUpdate,
    RecipientResponse,
    RecipientUpsert,
)
from app.services import management as mgmt_service

router = APIRouter(
    prefix="/api/recipients",
    tags=["Recipients"],
)


@router.get(
    "",
    response_model=list[RecipientResponse],
    summary="List all recipients",
    description="Returns all recipients and opt-outs for the calling client.",
)
def list_recipients(
    search: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
    current_client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return mgmt_service.list_recipients(
        db=db,
        client_id=current_client.id,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.put(
    "/{external_id}",
    response_model=RecipientResponse,
    status_code=status.HTTP_200_OK,
    summary="Create or update a recipient",
    description="Upserts a recipient record for the calling client using external_id.",
)
def upsert_recipient(
    external_id: str,
    data: RecipientUpsert,
    current_client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return mgmt_service.upsert_recipient(
        db=db,
        client_id=current_client.id,
        external_id=external_id,
        data=data,
    )


@router.get(
    "/{external_id}",
    response_model=RecipientResponse,
    summary="Get recipient details and opt-out preferences",
    description="Returns the recipient and a list of opted-out event types. 404 if not found.",
)
def get_recipient(
    external_id: str,
    current_client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return mgmt_service.get_recipient(
        db=db,
        client_id=current_client.id,
        external_id=external_id,
    )


@router.put(
    "/{external_id}/preferences",
    response_model=RecipientResponse,
    summary="Update recipient event preference (opt-in / opt-out)",
    description="Sets enabled=true (opt-in) or enabled=false (opt-out) for a specific event type.",
)
def update_preference(
    external_id: str,
    data: RecipientPreferenceUpdate,
    current_client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return mgmt_service.set_recipient_preference(
        db=db,
        client_id=current_client.id,
        external_id=external_id,
        event_type=data.event_type,
        enabled=data.enabled,
    )
