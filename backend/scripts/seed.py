"""Seed script for NotifyHub development and testing.

Safe to run multiple times (idempotent).
Creates:
- Admin user from ADMIN_EMAIL / ADMIN_PASSWORD
- FakeShop client tenant
- FakeShop owner user (owner@fakeshop.example / SEED_OWNER_PASSWORD)
- Active 'Default key' in api_keys table
- Event type settings and templates for 'order_shipped' and 'login_otp'
"""

import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import ApiKey, Client, EventTypeSetting, Template, User
from app.security import hash_key, hash_password

FAKESHOP_API_KEY = "nh_live_fakeshop_demo_key_secret_9999999999"


def seed_database() -> dict[str, str]:
    db: Session = SessionLocal()
    try:
        # 1. Seed or update Admin User
        admin_email = settings.ADMIN_EMAIL.strip().lower()
        admin_user = db.query(User).filter(User.email == admin_email).first()
        admin_pw_hash = hash_password(settings.ADMIN_PASSWORD)

        if admin_user is None:
            admin_user = User(
                client_id=None,
                email=admin_email,
                password_hash=admin_pw_hash,
                name="NotifyHub Admin",
                role="admin",
            )
            db.add(admin_user)
            db.flush()
            admin_action = "Created"
        else:
            admin_user.password_hash = admin_pw_hash
            admin_user.role = "admin"
            db.flush()
            admin_action = "Updated"

        # 2. Seed or update FakeShop Client
        client = db.query(Client).filter(Client.name == "FakeShop").first()
        if client is None:
            client = Client(
                name="FakeShop",
                from_name="FakeShop",
                status="active",
                rate_limit_per_sec=50,
                daily_email_limit=30,
            )
            db.add(client)
            db.flush()
            client_action = "Created"
        else:
            client.status = "active"
            client.from_name = "FakeShop"
            client.rate_limit_per_sec = 50
            client.daily_email_limit = 30
            db.flush()
            client_action = "Updated"

        # 3. Seed or update FakeShop Owner User
        owner_email = "owner@fakeshop.example"
        owner_user = db.query(User).filter(User.email == owner_email).first()
        owner_pw_hash = hash_password(settings.SEED_OWNER_PASSWORD)

        if owner_user is None:
            owner_user = User(
                client_id=client.id,
                email=owner_email,
                password_hash=owner_pw_hash,
                name="FakeShop Owner",
                role="owner",
            )
            db.add(owner_user)
            db.flush()
            owner_action = "Created"
        else:
            owner_user.client_id = client.id
            owner_user.password_hash = owner_pw_hash
            owner_user.role = "owner"
            db.flush()
            owner_action = "Updated"

        # 4. Seed or ensure FakeShop API Key
        raw_key = os.environ.get("FAKESHOP_API_KEY", FAKESHOP_API_KEY)
        key_hash = hash_key(raw_key)
        prefix = raw_key[:12]

        active_key = (
            db.query(ApiKey)
            .filter(ApiKey.client_id == client.id, ApiKey.status == "active")
            .first()
        )
        if active_key is None:
            active_key = ApiKey(
                client_id=client.id,
                name="Default key",
                key_prefix=prefix,
                key_hash=key_hash,
                status="active",
                created_by_user_id=owner_user.id,
            )
            db.add(active_key)
            db.flush()
            key_action = "Created"
        else:
            active_key.key_prefix = prefix
            active_key.key_hash = key_hash
            active_key.status = "active"
            db.flush()
            key_action = "Updated"

        # 5. Seed 'order_shipped' event type settings and template
        order_settings = (
            db.query(EventTypeSetting)
            .filter(
                EventTypeSetting.client_id == client.id,
                EventTypeSetting.event_type == "order_shipped",
            )
            .first()
        )
        if order_settings is None:
            order_settings = EventTypeSetting(
                client_id=client.id,
                event_type="order_shipped",
                priority=1,
                ttl_seconds=None,
                retry_schedule=[5, 10, 20, 40],
                respect_opt_out=True,
                sensitive=False,
            )
            db.add(order_settings)

        order_template = (
            db.query(Template)
            .filter(
                Template.client_id == client.id,
                Template.event_type == "order_shipped",
                Template.version == 1,
            )
            .first()
        )
        if order_template is None:
            order_template = Template(
                client_id=client.id,
                event_type="order_shipped",
                version=1,
                subject="Order #{{ order_id }} is on its way!",
                body="Hello {{ customer }}, your package has been shipped! Tracking code: {{ tracking }}.",
                status="active",
            )
            db.add(order_template)

        # 6. Seed 'login_otp' event type settings and template
        otp_settings = (
            db.query(EventTypeSetting)
            .filter(
                EventTypeSetting.client_id == client.id,
                EventTypeSetting.event_type == "login_otp",
            )
            .first()
        )
        if otp_settings is None:
            otp_settings = EventTypeSetting(
                client_id=client.id,
                event_type="login_otp",
                priority=2,
                ttl_seconds=300,
                retry_schedule=[2, 5],
                respect_opt_out=False,
                sensitive=True,
            )
            db.add(otp_settings)

        otp_template = (
            db.query(Template)
            .filter(
                Template.client_id == client.id,
                Template.event_type == "login_otp",
                Template.version == 1,
            )
            .first()
        )
        if otp_template is None:
            otp_template = Template(
                client_id=client.id,
                event_type="login_otp",
                version=1,
                subject="Your FakeShop Login Verification Code",
                body="Your one-time login verification code is {{ code }}. It will expire in 5 minutes.",
                status="active",
            )
            db.add(otp_template)

        db.commit()

        print("=" * 60)
        print(f"[SUCCESS] {admin_action} admin user '{admin_email}' (role: admin)")
        print(f"[SUCCESS] {client_action} client 'FakeShop' (ID: {client.id})")
        print(f"[SUCCESS] {owner_action} owner user '{owner_email}' (role: owner)")
        print(f"[SUCCESS] {key_action} active 'Default key'")
        print(f"API Key:   {raw_key}")
        print("=" * 60)
        print("Templates seeded & activated:")
        print("  - order_shipped (priority=normal, opt-out=true, retry=[5, 10, 20, 40])")
        print("  - login_otp     (priority=high, ttl=300s, opt-out=false, sensitive=true, retry=[2, 5])")
        print("=" * 60)

        return {
            "admin_email": admin_email,
            "owner_email": owner_email,
            "client_id": str(client.id),
            "api_key": raw_key,
        }
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
