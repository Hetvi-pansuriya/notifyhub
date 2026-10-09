"""Feature tests for Subscription Plans and limits management."""

import uuid
from app.config import settings
from app.models import Client, Plan


def test_client_plan_endpoints(client, db_session):
    """Verify owner can view current plan (/console/plan) and available plans (/console/plans)."""
    email = f"owner_plan_{uuid.uuid4().hex[:6]}@example.com"
    client.post(
        "/console/auth/signup",
        json={"email": email, "password": "Password123!", "company_name": "Plan Co"},
    )

    # 1. Current plan
    plan_res = client.get("/console/plan")
    assert plan_res.status_code == 200
    plan_data = plan_res.json()
    assert "plan" in plan_data
    assert plan_data["plan"]["name"] == "Starter"
    assert "sent_this_month" in plan_data
    assert "sent_today" in plan_data

    # 2. Available plans list
    plans_list = client.get("/console/plans")
    assert plans_list.status_code == 200
    assert len(plans_list.json()) >= 1


def test_admin_plans_crud_and_in_use_delete_protection(client, db_session, admin_headers):
    """Verify admin can create, update, and delete plans, with 409 protection when clients use it."""
    # 1. Create plan
    plan_name = f"Pro_{uuid.uuid4().hex[:6]}"
    create_res = client.post(
        "/admin/plans",
        json={
            "name": plan_name,
            "description": "Pro plan for scaling",
            "monthly_email_limit": 50000,
            "daily_email_limit": 2000,
            "rate_limit_per_sec": 100,
        },
        headers=admin_headers,
    )
    assert create_res.status_code == 201
    plan_id = create_res.json()["id"]

    # 2. Update plan
    patch_res = client.patch(
        f"/admin/plans/{plan_id}",
        json={"daily_email_limit": 2500},
        headers=admin_headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["daily_email_limit"] == 2500

    # 3. Assign plan to a client
    cl = Client(name=f"Assigned_{uuid.uuid4().hex[:6]}", plan_id=plan_id, status="active")
    db_session.add(cl)
    db_session.commit()

    # 4. Attempt to delete assigned plan -> 409 Conflict
    del_conflict = client.delete(f"/admin/plans/{plan_id}", headers=admin_headers)
    assert del_conflict.status_code == 409
    assert "Cannot delete plan" in del_conflict.json()["detail"]

    # 5. Remove client assignment and delete cleanly
    db_session.delete(cl)
    db_session.commit()

    del_ok = client.delete(f"/admin/plans/{plan_id}", headers=admin_headers)
    assert del_ok.status_code == 204
