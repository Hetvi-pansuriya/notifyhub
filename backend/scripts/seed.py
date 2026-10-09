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
            db.commit()
            print(f"[SUCCESS] Updated platform administrator '{admin_email}'.")
    finally:
        db.close()


if __name__ == "__main__":
    seed_admin()
