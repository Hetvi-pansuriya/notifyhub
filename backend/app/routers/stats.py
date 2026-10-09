"""Stats API router for both client tenants and administrators."""

from datetime import datetime
from typing import Optional
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_client, require_admin
from app.models import Client
from app.services import stats as stats_service

client_stats_router = APIRouter(
    prefix="/api/stats",
    tags=["Client Stats"],
)

admin_stats_router = APIRouter(
    prefix="/admin/stats",
    tags=["Admin Stats"],
    dependencies=[Depends(require_admin)],
)


# =====================================================================
# CLIENT STATS (scoped to authenticated client)
# =====================================================================

@client_stats_router.get("/summary")
def get_client_summary(
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return stats_service.get_stats_summary(
        db=db,
        client_id=client.id,
        from_dt=from_dt,
        to_dt=to_dt,
    )


@client_stats_router.get("/series")
def get_client_series(
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    bucket: str = Query("hour"),
    metric: str = Query("requests"),
    tz: str = Query("UTC"),
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return stats_service.get_stats_series(
        db=db,
        client_id=client.id,
        from_dt=from_dt,
        to_dt=to_dt,
        bucket=bucket,
        metric=metric,
        tz_str=tz,
    )


@client_stats_router.get("/rate")
def get_client_rate(
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    tz: str = Query("UTC"),
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return stats_service.get_stats_rate(
        db=db,
        client_id=client.id,
        from_dt=from_dt,
        to_dt=to_dt,
        tz_str=tz,
    )


# =====================================================================
# ADMIN STATS (global platform or optional client_id filter)
# =====================================================================

@admin_stats_router.get("/summary")
def get_admin_summary(
    client_id: Optional[uuid.UUID] = Query(None),
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    db: Session = Depends(get_db),
):
    return stats_service.get_stats_summary(
        db=db,
        client_id=client_id,
        from_dt=from_dt,
        to_dt=to_dt,
    )


@admin_stats_router.get("/series")
def get_admin_series(
    client_id: Optional[uuid.UUID] = Query(None),
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    bucket: str = Query("hour"),
    metric: str = Query("requests"),
    tz: str = Query("UTC"),
    db: Session = Depends(get_db),
):
    return stats_service.get_stats_series(
        db=db,
        client_id=client_id,
        from_dt=from_dt,
        to_dt=to_dt,
        bucket=bucket,
        metric=metric,
        tz_str=tz,
    )


@admin_stats_router.get("/rate")
def get_admin_rate(
    client_id: Optional[uuid.UUID] = Query(None),
    from_dt: Optional[datetime] = Query(None, alias="from"),
    to_dt: Optional[datetime] = Query(None, alias="to"),
    tz: str = Query("UTC"),
    db: Session = Depends(get_db),
):
    return stats_service.get_stats_rate(
        db=db,
        client_id=client_id,
        from_dt=from_dt,
        to_dt=to_dt,
        tz_str=tz,
    )
