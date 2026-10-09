"""Router for deliveries: retry dead deliveries and inspection."""

import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.deps import get_current_client
from app.models import Client, Delivery
from app.schemas.events import DeliveryDetail

router = APIRouter(prefix="/api/deliveries", tags=["Deliveries"])


@router.get("", response_model=list[DeliveryDetail], status_code=status.HTTP_200_OK)
def list_deliveries(
    status: Optional[str] = Query(None, description="Filter by status: queued, processing, sent, dead, skipped, expired"),
    limit: int = Query(50, ge=1, le=100, description="Max deliveries to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Lists deliveries for the calling client with optional status filter and pagination."""
    query = (
        db.query(Delivery)
        .options(selectinload(Delivery.attempts))
        .filter(Delivery.client_id == client.id)
    )
    if status is not None:
        query = query.filter(Delivery.status == status)

    deliveries = query.order_by(Delivery.created_at.desc()).offset(offset).limit(limit).all()
    return deliveries


@router.post("/{id}/retry", response_model=DeliveryDetail, status_code=status.HTTP_200_OK)
def retry_delivery(
    id: uuid.UUID,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Retries a dead delivery for the calling client.

    Returns 404 if not found for the client.
    Returns 409 if delivery is not dead, or if it is sensitive.
    Resets attempt_count to 0, status to queued, next_attempt_at to now, clears last_error.
    """
    delivery = (
        db.query(Delivery)
        .options(selectinload(Delivery.attempts))
        .filter(Delivery.id == id, Delivery.client_id == client.id)
        .first()
    )
    if not delivery:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Delivery not found",
        )

    if delivery.status != "dead":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot retry delivery with status '{delivery.status}' (only 'dead' deliveries can be retried)",
        )

    if delivery.sensitive:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot retry sensitive deliveries",
        )

    delivery.attempt_count = 0
    delivery.status = "queued"
    delivery.next_attempt_at = datetime.now(timezone.utc)
    delivery.last_error = None
    delivery.locked_until = None
    db.commit()
    db.refresh(delivery)
    return delivery


@router.get("/{id}", response_model=DeliveryDetail, status_code=status.HTTP_200_OK)
def get_delivery(
    id: uuid.UUID,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Gets delivery details and attempts for the calling client."""
    delivery = (
        db.query(Delivery)
        .options(selectinload(Delivery.attempts))
        .filter(Delivery.id == id, Delivery.client_id == client.id)
        .first()
    )
    if not delivery:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Delivery not found",
        )
    return delivery
