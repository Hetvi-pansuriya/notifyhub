"""Client metrics router."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_client
from app.models import Client
from app.schemas.metrics import MetricsResponse
from app.services.metrics import get_delivery_metrics

router = APIRouter(prefix="/api/metrics", tags=["Metrics"])


@router.get("", response_model=MetricsResponse, status_code=status.HTTP_200_OK)
def get_client_metrics(
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    """Returns delivery counts per status, success rate, and queue depth for the calling client only."""
    return get_delivery_metrics(db, client_id=client.id)
