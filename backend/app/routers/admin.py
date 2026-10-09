"""Admin API endpoints for system overview, clients, plans, system health, and audit logs."""

from datetime import datetime
from typing import Optional
import uuid
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import AuditLog
from app.schemas.admin import (
    AuditLogRow,
    ClientCreate,
    ClientCreateResponse,
    ClientResponse,
    ClientUpdate,
    KeyRotateResponse,
    PlanCreate,
    PlanResponse,
    PlanUpdate,
)
from app.schemas.metrics import MetricsResponse
from app.services.metrics import get_delivery_metrics
from app.services import admin as admin_service
from app.services import plans as plan_service

router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


# =====================================================================
# PLATFORM OVERVIEW & HEALTH
# =====================================================================

@router.get("/overview", summary="Admin platform overview")
def get_overview(db: Session = Depends(get_db)):
    return admin_service.get_platform_overview(db)


@router.get("/metrics", response_model=MetricsResponse, summary="Get delivery metrics")
def get_metrics(
    client_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
):
    return get_delivery_metrics(db, client_id)


@router.get("/health", summary="Admin system health status")
def get_health(db: Session = Depends(get_db)):
    return admin_service.get_system_health(db)


@router.get("/settings", summary="Read-only platform configuration")
def get_settings():
    return admin_service.get_system_settings()


# =====================================================================
# CLIENT MANAGEMENT
# =====================================================================

@router.post(
    "/clients",
    response_model=ClientCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new client tenant",
    description="Creates a new client and reveals the full API key ONCE. Raw key is never stored.",
)
def create_client(
    data: ClientCreate,
    db: Session = Depends(get_db),
):
    client, full_key, prefix = admin_service.create_client(db, data)
    return ClientCreateResponse(
        id=client.id,
        name=client.name,
        from_name=client.from_name or client.name,
        reply_to_email=client.reply_to_email,
        daily_email_limit=client.daily_email_limit or 30,
        api_key=full_key,
        api_key_prefix=prefix,
        status=client.status,
        rate_limit_per_sec=client.rate_limit_per_sec,
        created_at=client.created_at,
    )


@router.get(
    "/clients",
    summary="List all client tenants with optional search and status filter",
)
def list_clients(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return admin_service.list_clients_table(db, search=search, status_filter=status)


@router.get("/clients/{client_id}", summary="Get client tenant details")
def get_client(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    return admin_service.get_client_detail(db, client_id)


@router.get("/clients/{client_id}/activity", summary="Get client recent failures and audit activity")
def get_client_activity(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    return admin_service.get_client_activity(db, client_id)


@router.patch("/clients/{client_id}", summary="Update client status or assigned plan")
def update_client(
    client_id: uuid.UUID,
    data: ClientUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    admin_user = getattr(request.state, "admin_user", None)
    actor_email = admin_user.email if admin_user else "admin@notifyhub.local"
    return admin_service.patch_client(db, client_id, data, actor_email=actor_email)


@router.post("/clients/{client_id}/reset-keys", summary="Reset client API keys")
def reset_client_keys(
    client_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
):
    admin_user = getattr(request.state, "admin_user", None)
    actor_email = admin_user.email if admin_user else "admin@notifyhub.local"
    client, full_key, prefix = admin_service.reset_client_keys(db, client_id, actor_email=actor_email)
    return {
        "id": client.id,
        "name": client.name,
        "api_key": full_key,
        "api_key_prefix": prefix,
    }


@router.post(
    "/clients/{client_id}/rotate-key",
    response_model=KeyRotateResponse,
    summary="Rotate a client's API key",
)
def rotate_client_key(
    client_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    client, full_key, prefix = admin_service.rotate_client_key(db, client_id)
    return KeyRotateResponse(
        id=client.id,
        name=client.name,
        api_key=full_key,
        api_key_prefix=prefix,
    )


# =====================================================================
# PLANS CRUD
# =====================================================================

@router.get("/plans", summary="List all plans with clients count")
def list_plans(db: Session = Depends(get_db)):
    return plan_service.list_plans_with_counts(db)


@router.post("/plans", status_code=status.HTTP_201_CREATED, summary="Create a new plan")
def create_plan(
    data: PlanCreate,
    db: Session = Depends(get_db),
):
    return plan_service.create_plan(
        db=db,
        name=data.name,
        description=data.description,
        monthly_email_limit=data.monthly_email_limit,
        daily_email_limit=data.daily_email_limit,
        rate_limit_per_sec=data.rate_limit_per_sec,
    )


@router.patch("/plans/{plan_id}", summary="Update an existing plan")
def update_plan(
    plan_id: uuid.UUID,
    data: PlanUpdate,
    db: Session = Depends(get_db),
):
    return plan_service.update_plan(
        db=db,
        plan_id=plan_id,
        data=data.model_dump(exclude_unset=True),
    )


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a plan")
def delete_plan(
    plan_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    plan_service.delete_plan(db, plan_id)
    return None


# =====================================================================
# AUDIT LOG
# =====================================================================

@router.get("/audit-log", response_model=list[AuditLogRow], summary="List audit log entries")
def list_audit_log(
    client_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(AuditLog)
    if client_id is not None:
        query = query.filter(AuditLog.client_id == client_id)
    if action is not None and action.strip():
        query = query.filter(AuditLog.action == action.strip())
    if search is not None and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (AuditLog.actor_email.ilike(term)) | (AuditLog.detail.ilike(term))
        )

    return query.order_by(AuditLog.at.desc()).offset(offset).limit(limit).all()
