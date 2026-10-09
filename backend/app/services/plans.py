"""Plan management service: plan CRUD, client assignment, and limit synchronization."""

from datetime import datetime, timezone
from typing import Optional
import uuid
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Client, Delivery, Plan
from app.services.audit import record_audit


def get_or_create_default_plan(db: Session) -> Plan:
    """Returns the default plan or creates it if not found."""
    plan = db.query(Plan).filter(Plan.name == settings.DEFAULT_PLAN_NAME).first()
    if plan is None:
        plan = db.query(Plan).order_by(Plan.created_at.asc()).first()
    if plan is None:
        plan = Plan(
            name=settings.DEFAULT_PLAN_NAME,
            description="Default platform plan",
            monthly_email_limit=settings.DEFAULT_PLAN_MONTHLY_LIMIT,
            daily_email_limit=30,
            rate_limit_per_sec=settings.DEFAULT_RATE_LIMIT_PER_SEC,
        )
        db.add(plan)
        db.flush()
    return plan


def assign_plan(
    db: Session,
    client: Client,
    plan: Plan,
    actor_email: str,
) -> Client:
    """Assigns a plan to a client, copying limits onto client columns and recording an audit log."""
    client.plan_id = plan.id
    client.daily_email_limit = plan.daily_email_limit
    client.rate_limit_per_sec = plan.rate_limit_per_sec

    record_audit(
        db=db,
        actor_email=actor_email,
        action="plan_assigned",
        client_id=client.id,
        detail=f"Assigned plan '{plan.name}' (Monthly: {plan.monthly_email_limit}, Daily: {plan.daily_email_limit})",
    )
    db.flush()
    return client


def list_plans_with_counts(db: Session) -> list[dict]:
    """Lists all plans along with the number of clients currently assigned to each."""
    plans = db.query(Plan).order_by(Plan.created_at.asc()).all()
    result = []
    for p in plans:
        count = db.query(Client).filter(Client.plan_id == p.id).count()
        result.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "monthly_email_limit": p.monthly_email_limit,
            "daily_email_limit": p.daily_email_limit,
            "rate_limit_per_sec": p.rate_limit_per_sec,
            "created_at": p.created_at,
            "clients_count": count,
        })
    return result


def create_plan(
    db: Session,
    name: str,
    description: Optional[str],
    monthly_email_limit: int,
    daily_email_limit: int,
    rate_limit_per_sec: int,
) -> Plan:
    """Creates a new plan ensuring name uniqueness."""
    existing = db.query(Plan).filter(Plan.name == name.strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Plan with name '{name}' already exists",
        )
    plan = Plan(
        name=name.strip(),
        description=description.strip() if description else None,
        monthly_email_limit=monthly_email_limit,
        daily_email_limit=daily_email_limit,
        rate_limit_per_sec=rate_limit_per_sec,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def update_plan(
    db: Session,
    plan_id: uuid.UUID,
    data: dict,
) -> Plan:
    """Updates an existing plan's parameters."""
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found",
        )
    if "name" in data and data["name"] is not None:
        new_name = data["name"].strip()
        if new_name != plan.name:
            conflict = db.query(Plan).filter(Plan.name == new_name).first()
            if conflict:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Plan with name '{new_name}' already exists",
                )
            plan.name = new_name
    if "description" in data:
        plan.description = data["description"]
    if "monthly_email_limit" in data and data["monthly_email_limit"] is not None:
        plan.monthly_email_limit = data["monthly_email_limit"]
    if "daily_email_limit" in data and data["daily_email_limit"] is not None:
        plan.daily_email_limit = data["daily_email_limit"]
    if "rate_limit_per_sec" in data and data["rate_limit_per_sec"] is not None:
        plan.rate_limit_per_sec = data["rate_limit_per_sec"]

    db.commit()
    db.refresh(plan)
    return plan


def delete_plan(db: Session, plan_id: uuid.UUID) -> None:
    """Deletes a plan. Refuses with 409 if any clients are currently using it."""
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found",
        )
    clients_using = db.query(Client).filter(Client.plan_id == plan_id).count()
    if clients_using > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete plan currently assigned to {clients_using} client(s)",
        )
    db.delete(plan)
    db.commit()


def get_client_month_and_day_usage(db: Session, client_id: uuid.UUID) -> tuple[int, int]:
    """Returns (sent_this_month, sent_today) for non-skipped deliveries in UTC."""
    now_utc = datetime.now(timezone.utc)
    month_start = now_utc.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)

    sent_this_month = (
        db.query(Delivery)
        .filter(
            Delivery.client_id == client_id,
            Delivery.created_at >= month_start,
            Delivery.status != "skipped",
        )
        .count()
    )
    sent_today = (
        db.query(Delivery)
        .filter(
            Delivery.client_id == client_id,
            Delivery.created_at >= today_start,
            Delivery.status != "skipped",
        )
        .count()
    )
    return sent_this_month, sent_today
