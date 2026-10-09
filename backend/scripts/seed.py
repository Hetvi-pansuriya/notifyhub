"""Seed script for NotifyHub platform administrator.

ONE job: Creates or updates the platform admin user from ADMIN_EMAIL and ADMIN_PASSWORD.
Requires ADMIN_EMAIL and ADMIN_PASSWORD to be explicitly set.
Safe to run multiple times (idempotent).
"""

import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import User
from app.security import hash_password


def seed_admin() -> None:
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")

    if not admin_email or not admin_password:
        sys.stderr.write(
            "ERROR: ADMIN_EMAIL and ADMIN_PASSWORD environment variables must be provided to seed the admin account.\n"
        )
        sys.exit(1)

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.email == admin_email).first()
        password_hash = hash_password(admin_password)

        if user is None:
            user = User(
                client_id=None,
                email=admin_email,
                password_hash=password_hash,
                name="Platform Admin",
                role="admin",
            )
            db.add(user)
            db.commit()
            print(f"[SUCCESS] Created platform administrator '{admin_email}'.")
        else:
            user.password_hash = password_hash
            user.role = "admin"
        # Seed 3 standard platform plans if missing
        from app.models import Plan
        plans_data = [
            ("Starter", "Free tier for development and early stage apps", 10000, 30, 50),
            ("Pro", "Growing businesses requiring higher daily sending throughput", 50000, 100, 100),
            ("Enterprise", "Large scale transactional email volume with dedicated rate ceilings", 250000, 500, 200),
        ]
        for name, desc, m_lim, d_lim, r_lim in plans_data:
            p = db.query(Plan).filter(Plan.name == name).first()
            if p is None:
                p = Plan(name=name, description=desc, monthly_email_limit=m_lim, daily_email_limit=d_lim, rate_limit_per_sec=r_lim)
                db.add(p)
                print(f"[SUCCESS] Created plan '{name}'.")
            else:
                p.monthly_email_limit = m_lim
                p.daily_email_limit = d_lim
                p.rate_limit_per_sec = r_lim
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed_admin()
