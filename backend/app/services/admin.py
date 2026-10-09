"""Admin business logic service for managing clients, plans, system health, and audit logs."""

from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid
from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ApiKey, AuditLog, Client, Delivery, Plan, RateLimitHit, SystemStatus, User
from app.ratelimit import rate_limiter
from app.schemas.admin import ClientCreate, ClientUpdate
from app.security import generate_api_key
from app.services.audit import record_audit
from app.services.plans import assign_plan, get_client_month_and_day_usage, get_or_create_default_plan


def create_client(db: Session, data: ClientCreate) -> tuple[Client, str, str]:
    """Creates a new client tenant and its initial 'Default key', returning (client, raw_key, prefix)."""
    full_key, key_hash, prefix = generate_api_key()
    default_plan = get_or_create_default_plan(db)

    rate_limit = data.rate_limit_per_sec or default_plan.rate_limit_per_sec

    client = Client(
        name=data.name,
        from_name=data.name,
        status="active",
        plan_id=default_plan.id,
        rate_limit_per_sec=rate_limit,
        daily_email_limit=default_plan.daily_email_limit,
    )
    db.add(client)
    db.flush()

    api_key = ApiKey(
        client_id=client.id,
        name="Default key",
        key_prefix=prefix,
        key_hash=key_hash,
        status="active",
    )
    db.add(api_key)
    db.commit()
    db.refresh(client)
    return client, full_key, prefix


def list_clients(db: Session) -> list[Client]:
    """Retrieves all registered client tenants."""
    return db.query(Client).order_by(Client.created_at.desc()).all()


def list_clients_table(
    db: Session,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
) -> list[dict]:
    """Lists client tenants for the admin clients table with stats."""
    query = db.query(Client)
    if status_filter and status_filter.strip():
        query = query.filter(Client.status == status_filter.strip())
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(Client.name.ilike(term))

    clients = query.order_by(Client.created_at.desc()).all()
    now_utc = datetime.now(timezone.utc)
    month_start = now_utc.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    result = []
    for c in clients:
        owner = next((u for u in c.users if u.role == "owner"), None)
        if not owner and c.users:
            owner = c.users[0]
        owner_email = owner.email if owner else None

        emails_month = (
            db.query(Delivery)
            .filter(
                Delivery.client_id == c.id,
                Delivery.created_at >= month_start,
                Delivery.status != "skipped",
            )
            .count()
        )
        failed_now = (
            db.query(Delivery)
            .filter(Delivery.client_id == c.id, Delivery.status == "dead")
            .count()
        )

        result.append({
            "id": c.id,
            "name": c.name,
            "owner_email": owner_email,
            "plan": c.plan.name if c.plan else "None",
            "status": c.status,
            "emails_this_month": emails_month,
            "monthly_email_limit": c.plan.monthly_email_limit if c.plan else 10000,
            "failed_now": failed_now,
            "created_at": c.created_at,
        })
    return result


def get_client_detail(db: Session, client_id: uuid.UUID) -> dict:
    """Returns detailed information for a client tenant."""
    client = db.query(Client).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )
    owner = next((u for u in client.users if u.role == "owner"), None)
    if not owner and client.users:
        owner = client.users[0]

    sent_month, sent_today = get_client_month_and_day_usage(db, client.id)
    failed_now = (
        db.query(Delivery)
        .filter(Delivery.client_id == client.id, Delivery.status == "dead")
        .count()
    )

    # Today's 429 rejections
    now_utc = datetime.now(timezone.utc)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    rejections_today = (
        db.query(func.count(RateLimitHit.id))
        .filter(RateLimitHit.client_id == client.id, RateLimitHit.at >= today_start)
        .scalar()
        or 0
    )

    return {
        "id": client.id,
        "name": client.name,
        "from_name": client.from_name,
        "reply_to_email": client.reply_to_email,
        "owner_email": owner.email if owner else None,
        "status": client.status,
        "created_at": client.created_at,
        "plan_id": client.plan_id,
        "plan_name": client.plan.name if client.plan else "None",
        "monthly_email_limit": client.plan.monthly_email_limit if client.plan else 10000,
        "daily_email_limit": client.daily_email_limit or 30,
        "rate_limit_per_sec": client.rate_limit_per_sec or 50,
        "sent_this_month": sent_month,
        "sent_today": sent_today,
        "failed_now": failed_now,
        "rejections_today": rejections_today,
    }


def get_client_activity(db: Session, client_id: uuid.UUID) -> dict:
    """Returns recent failed deliveries and audit log rows for a client."""
    client = db.query(Client).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )

    # Recent dead deliveries (up to 10)
    dead_deliveries = (
        db.query(Delivery)
        .filter(Delivery.client_id == client_id, Delivery.status == "dead")
        .order_by(Delivery.created_at.desc())
        .limit(10)
        .all()
    )
    failures = [
        {
            "id": d.id,
            "to_email": d.to_email,
            "status": d.status,
            "attempt_count": d.attempt_count,
            "last_error": d.last_error,
            "created_at": d.created_at,
        }
        for d in dead_deliveries
    ]

    # Recent audit logs (up to 20)
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.client_id == client_id)
        .order_by(AuditLog.at.desc())
        .limit(20)
        .all()
    )
    activity_logs = [
        {
            "id": l.id,
            "at": l.at,
            "actor_email": l.actor_email,
            "action": l.action,
            "detail": l.detail,
        }
        for l in logs
    ]

    return {
        "failures": failures,
        "audit_logs": activity_logs,
    }


def patch_client(
    db: Session,
    client_id: uuid.UUID,
    data: ClientUpdate,
    actor_email: str,
) -> dict:
    """Updates client status or assigns a plan, recording audit logs."""
    client = db.query(Client).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )

    if data.status is not None and data.status != client.status:
        old_status = client.status
        client.status = data.status
        action = "client_paused" if data.status == "disabled" else "client_resumed"
        record_audit(
            db=db,
            actor_email=actor_email,
            action=action,
            client_id=client.id,
            detail=f"Client status changed from {old_status} to {data.status}",
        )

    if data.plan_id is not None and data.plan_id != client.plan_id:
        plan = db.query(Plan).filter(Plan.id == data.plan_id).first()
        if plan is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plan not found",
            )
        assign_plan(db, client, plan, actor_email=actor_email)

    if data.rate_limit_per_sec is not None:
        client.rate_limit_per_sec = data.rate_limit_per_sec
        rate_limiter.check(client.id, data.rate_limit_per_sec)

    if data.daily_email_limit is not None:
        client.daily_email_limit = data.daily_email_limit

    db.commit()
    db.refresh(client)
    return get_client_detail(db, client.id)


def reset_client_keys(
    db: Session,
    client_id: uuid.UUID,
    actor_email: str,
) -> tuple[Client, str, str]:
    """Revokes all active API keys and creates a fresh key once for the client."""
    client = db.query(Client).filter(Client.id == client_id).first()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found",
        )

    now = datetime.now(timezone.utc)
    active_keys = (
        db.query(ApiKey)
        .filter(ApiKey.client_id == client.id, ApiKey.status == "active")
        .all()
    )
    for k in active_keys:
        k.status = "revoked"
        k.revoked_at = now

    full_key, key_hash, prefix = generate_api_key()
    new_key = ApiKey(
        client_id=client.id,
        name="Reset Key (Admin)",
        key_prefix=prefix,
        key_hash=key_hash,
        status="active",
    )
    db.add(new_key)
    record_audit(
        db=db,
        actor_email=actor_email,
        action="admin_reset_keys",
        client_id=client.id,
        detail=f"Revoked {len(active_keys)} key(s) and issued new key with prefix '{prefix}'",
    )
    db.commit()
    db.refresh(client)
    return client, full_key, prefix


def rotate_client_key(db: Session, client_id: uuid.UUID) -> tuple[Client, str, str]:
    """Rotates a client's API key: revokes all active keys and creates a new key."""
    return reset_client_keys(db, client_id, actor_email="admin@notifyhub.local")


def get_platform_overview(db: Session) -> dict:
    """Aggregates platform-wide metrics and the 'needs attention' client list."""
    total_clients = db.query(Client).count()
    active_clients = db.query(Client).filter(Client.status == "active").count()

    now_utc = datetime.now(timezone.utc)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now_utc.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    day_24h_ago = now_utc - timedelta(hours=24)

    # Emails today (non-skipped)
    emails_today = (
        db.query(Delivery)
        .filter(Delivery.created_at >= today_start, Delivery.status != "skipped")
        .count()
    )

    # 24h success rate
    delivs_24h = (
        db.query(Delivery.status, func.count(Delivery.id))
        .filter(Delivery.created_at >= day_24h_ago)
        .group_by(Delivery.status)
        .all()
    )
    map_24h = {row[0]: row[1] for row in delivs_24h}
    sent_24h = map_24h.get("sent", 0)
    finished_24h = sent_24h + map_24h.get("dead", 0) + map_24h.get("skipped", 0) + map_24h.get("expired", 0)
    success_rate_24h = round(sent_24h / finished_24h, 4) if finished_24h > 0 else 0.0

    # Queue depth & oldest queued age
    queue_depth = (
        db.query(Delivery)
        .filter(Delivery.status.in_(["queued", "processing"]))
        .count()
    )
    oldest_queued = (
        db.query(Delivery.created_at)
        .filter(Delivery.status == "queued")
        .order_by(Delivery.created_at.asc())
        .first()
    )
    oldest_age = (
        int((now_utc - oldest_queued[0]).total_seconds())
        if oldest_queued and oldest_queued[0]
        else 0
    )

    # Compute "needs attention" list:
    # 1. Clients at >= 90% monthly limit
    # 2. Paused clients (status == 'disabled')
    # 3. Clients with failed (dead) deliveries
    clients = db.query(Client).all()
    needs_attention = []
    for c in clients:
        limit = c.plan.monthly_email_limit if c.plan else 10000
        sent_month = (
            db.query(Delivery)
            .filter(
                Delivery.client_id == c.id,
                Delivery.created_at >= month_start,
                Delivery.status != "skipped",
            )
            .count()
        )
        dead_count = (
            db.query(Delivery)
            .filter(Delivery.client_id == c.id, Delivery.status == "dead")
            .count()
        )

        reasons = []
        if c.status == "disabled":
            reasons.append("Service paused")
        if sent_month >= 0.9 * limit:
            pct = int((sent_month / limit) * 100) if limit > 0 else 100
            reasons.append(f"Near monthly limit ({pct}%)")
        if dead_count > 0:
            reasons.append(f"{dead_count} failed deliveries")

        if reasons:
            needs_attention.append({
                "id": c.id,
                "name": c.name,
                "status": c.status,
                "reasons": reasons,
                "emails_this_month": sent_month,
                "monthly_limit": limit,
                "failed_count": dead_count,
            })

    return {
        "active_clients": active_clients,
        "total_clients": total_clients,
        "emails_today": emails_today,
        "success_rate_24h": success_rate_24h,
        "queue_depth": queue_depth,
        "oldest_queued_age_seconds": oldest_age,
        "needs_attention": needs_attention,
    }


def get_system_health(db: Session) -> dict:
    """Returns platform queue health, worker heartbeat, and provider status."""
    now_utc = datetime.now(timezone.utc)
    queue_depth = (
        db.query(Delivery)
        .filter(Delivery.status.in_(["queued", "processing"]))
        .count()
    )
    oldest_queued = (
        db.query(Delivery.created_at)
        .filter(Delivery.status == "queued")
        .order_by(Delivery.created_at.asc())
        .first()
    )
    oldest_age = (
        int((now_utc - oldest_queued[0]).total_seconds())
        if oldest_queued and oldest_queued[0]
        else 0
    )
    dead_count = db.query(Delivery).filter(Delivery.status == "dead").count()

    # Query system_status rows
    statuses = {r.key: r for r in db.query(SystemStatus).all()}

    hb = statuses.get("worker_heartbeat")
    if hb:
        hb_age = int((now_utc - hb.updated_at).total_seconds())
    else:
        hb_age = None

    reaper = statuses.get("reaper_last_run")
    reaper_last_run = reaper.updated_at.isoformat() if reaper else None

    send_ok = statuses.get("last_send_ok_at")
    last_send_ok_at = send_ok.value if send_ok else None

    send_err = statuses.get("last_send_error")
    last_send_error = send_err.value if send_err else None

    return {
        "queue_depth": queue_depth,
        "oldest_queued_age_seconds": oldest_age,
        "dead_count": dead_count,
        "worker_heartbeat_age_seconds": hb_age,
        "reaper_last_run": reaper_last_run,
        "mail_provider": settings.MAIL_PROVIDER,
        "last_send_ok_at": last_send_ok_at,
        "last_send_error": last_send_error,
    }


def get_system_settings() -> dict:
    """Returns non-secret platform settings."""
    return {
        "mail_provider": settings.MAIL_PROVIDER,
        "sendgrid_api_key_configured": bool(getattr(settings, "SENDGRID_API_KEY", None)),
        "global_daily_limit": settings.GLOBAL_DAILY_LIMIT,
        "default_rate_limit_per_sec": settings.DEFAULT_RATE_LIMIT_PER_SEC,
        "default_plan_name": settings.DEFAULT_PLAN_NAME,
        "default_plan_monthly_limit": settings.DEFAULT_PLAN_MONTHLY_LIMIT,
        "session_days": settings.SESSION_DAYS,
        "max_active_keys": settings.MAX_ACTIVE_KEYS,
        "lock_seconds": settings.LOCK_SECONDS,
        "reaper_seconds": settings.REAPER_SECONDS,
        "from_email": getattr(settings, "FROM_EMAIL", None) or "no-reply@notifyhub.local",
        "worker_concurrency": getattr(settings, "WORKER_CONCURRENCY", 2),
        "log_level": getattr(settings, "LOG_LEVEL", "INFO"),
        "smtp_host": getattr(settings, "SMTP_HOST", "smtp.example.com"),
        "smtp_port": getattr(settings, "SMTP_PORT", 587),
        "from_address": getattr(settings, "FROM_EMAIL", None) or getattr(settings, "SMTP_FROM", "no-reply@notifyhub.example"),
        "requests_per_sec": getattr(settings, "DEFAULT_RATE_LIMIT_PER_SEC", 50),
        "sending_speed": getattr(settings, "OUTGOING_RATE_PER_SEC", 20),
        "retry_after": "5s, 10s, 20s, 40s",
        "maintenance_mode": False,
    }
