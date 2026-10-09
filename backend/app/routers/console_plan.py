"""Client console plan endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_owner_session
from app.models import Client, Plan, User
from app.services import plans as plan_service

router = APIRouter(
    prefix="/console",
    tags=["Console Plans"],
)


@router.get("/plan")
def get_client_plan(
    auth: tuple[User, Client] = Depends(require_owner_session),
    db: Session = Depends(get_db),
):
    _, client = auth
    if client.plan is None:
        client.plan = plan_service.get_or_create_default_plan(db)
        client.plan_id = client.plan.id
        db.commit()
        db.refresh(client)

    sent_this_month, sent_today = plan_service.get_client_month_and_day_usage(db, client.id)

    return {
        "plan": {
            "id": client.plan.id,
            "name": client.plan.name,
            "description": client.plan.description,
            "monthly_email_limit": client.plan.monthly_email_limit,
            "daily_email_limit": client.plan.daily_email_limit,
            "rate_limit_per_sec": client.plan.rate_limit_per_sec,
            "created_at": client.plan.created_at,
        },
        "sent_this_month": sent_this_month,
        "sent_today": sent_today,
        "daily_limit": client.daily_email_limit or client.plan.daily_email_limit,
        "monthly_limit": client.plan.monthly_email_limit,
    }


@router.get("/plans")
def list_available_plans(
    auth: tuple[User, Client] = Depends(require_owner_session),
    db: Session = Depends(get_db),
):
    plans = db.query(Plan).order_by(Plan.created_at.asc()).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "monthly_email_limit": p.monthly_email_limit,
            "daily_email_limit": p.daily_email_limit,
            "rate_limit_per_sec": p.rate_limit_per_sec,
            "created_at": p.created_at,
        }
        for p in plans
    ]


from pydantic import BaseModel
import uuid
from fastapi import HTTPException, status


class PlanSelectRequest(BaseModel):
    plan_id: uuid.UUID


@router.post("/plan/select", summary="Self-service plan selection for client tenant")
def select_plan(
    data: PlanSelectRequest,
    auth: tuple[User, Client] = Depends(require_owner_session),
    db: Session = Depends(get_db),
):
    user, client = auth
    target_plan = db.query(Plan).filter(Plan.id == data.plan_id).first()
    if target_plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested plan not found",
        )

    client.plan_id = target_plan.id
    client.daily_email_limit = target_plan.daily_email_limit
    client.rate_limit_per_sec = target_plan.rate_limit_per_sec
    db.commit()
    db.refresh(client)

    from app.services.audit import record_audit
    record_audit(
        db=db,
        actor_email=user.email,
        action="plan_selected",
        client_id=client.id,
        detail=f"Switched subscription plan to '{target_plan.name}'",
    )

    return {
        "status": "success",
        "plan_id": str(target_plan.id),
        "plan_name": target_plan.name,
        "monthly_limit": target_plan.monthly_email_limit,
        "daily_limit": target_plan.daily_email_limit,
        "rate_limit_per_sec": target_plan.rate_limit_per_sec,
    }
