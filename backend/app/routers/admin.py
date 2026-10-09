"""Admin API endpoints for system overview, clients, plans, system health, and audit logs."""

from datetime import datetime
from typing import Optional
import uuid
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import AuditLog, Client
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


class TestEmailRequest(BaseModel):
    recipient: str
    subject: Optional[str] = "NotifyHub Diagnostic Test Email"
    body: Optional[str] = "This is a diagnostic message dispatched from the NotifyHub Admin Console."


@router.post("/settings/test-email", summary="Dispatch diagnostic email through active provider")
def send_test_email(data: TestEmailRequest, db: Session = Depends(get_db)):
    import time
    from worker.providers.smtp import SmtpEmailProvider
    from worker.providers.sendgrid import SendgridEmailProvider

    provider_name = (settings.MAIL_PROVIDER or "smtp").lower()
    t0 = time.time()
    try:
        if provider_name == "sendgrid":
            if not settings.SENDGRID_API_KEY:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SENDGRID_API_KEY is not configured")
            p = SendgridEmailProvider(api_key=settings.SENDGRID_API_KEY, from_email=settings.FROM_EMAIL)
        else:
            p = SmtpEmailProvider(host=settings.SMTP_HOST, port=settings.SMTP_PORT, from_email=settings.SMTP_FROM)

        res = p.send(
            to=data.recipient,
            subject=data.subject,
            body=data.body,
            message_id=str(uuid.uuid4()),
            from_name="NotifyHub Admin",
        )
        latency_ms = int((time.time() - t0) * 1000)
        return {
            "status": "success",
            "provider": provider_name,
            "outcome": res.outcome.value,
            "provider_message_id": res.provider_message_id,
            "latency_ms": latency_ms,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to dispatch test email: {str(e)}",
        )


@router.post("/settings/test-connection", summary="Test active provider network connectivity")
def test_connection():
    import socket, time
    provider_name = (settings.MAIL_PROVIDER or "smtp").lower()
    t0 = time.time()
    if provider_name == "sendgrid":
        import httpx
        try:
            r = httpx.get("https://api.sendgrid.com", timeout=5.0)
            ms = int((time.time() - t0) * 1000)
            return {"status": "ok", "provider": "SendGrid API", "latency_ms": ms, "http_status": r.status_code}
        except Exception as e:
            return {"status": "error", "provider": "SendGrid API", "error": str(e)}
    else:
        try:
            s = socket.create_connection((settings.SMTP_HOST, settings.SMTP_PORT), timeout=3.0)
            s.close()
            ms = int((time.time() - t0) * 1000)
            return {"status": "ok", "provider": f"MailHog SMTP ({settings.SMTP_HOST}:{settings.SMTP_PORT})", "latency_ms": ms}
        except Exception as e:
            return {"status": "error", "provider": f"MailHog SMTP ({settings.SMTP_HOST}:{settings.SMTP_PORT})", "error": str(e)}


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


@router.get("/clients/table", summary="List all client tenants for overview table")
def get_clients_table(
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

    logs = query.order_by(AuditLog.at.desc()).offset(offset).limit(limit).all()

    # Pre-fetch client names
    client_ids = {log.client_id for log in logs if log.client_id}
    client_names = {}
    if client_ids:
        clients = db.query(Client.id, Client.name).filter(Client.id.in_(client_ids)).all()
        client_names = {cid: cname for cid, cname in clients}

    result = []
    for log in logs:
        result.append(
            AuditLogRow(
                id=log.id,
                at=log.at,
                created_at=log.at,
                actor_email=log.actor_email,
                action=log.action,
                client_id=log.client_id,
                client_name=client_names.get(log.client_id),
                detail=log.detail,
            )
        )
    return result
