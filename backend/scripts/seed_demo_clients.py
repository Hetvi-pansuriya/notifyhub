"""Seed script for the 3 demo client applications (ShopEasy, SecureLogin, ReminderBox).

Idempotent: safe to run multiple times without duplicating clients or overwriting API keys.
Usage:
    docker compose exec api python -m scripts.seed_demo_clients
"""

import os
from pathlib import Path
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import ApiKey, Client, EventTypeSetting, Template, User
from app.security import generate_api_key, hash_password

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DEMO_KEYS_DIR = BACKEND_ROOT / "demo_keys"


DEMO_CLIENTS_SPEC = [
    {
        "name": "ShopEasy",
        "owner_email": "owner@shopeasy.example",
        "owner_name": "ShopEasy Owner",
        "from_name": "ShopEasy",
        "reply_to_email": "support@shopeasy.example",
        "env_filename": "shopeasy.env",
        "event_types": [
            {
                "event_type": "order_confirmed",
                "priority": 1,  # normal
                "ttl_seconds": None,
                "retry_schedule": [60, 300, 900],
                "respect_opt_out": True,
                "sensitive": False,
                "subject": "Order #{{ order_id }} confirmed",
                "body": (
                    "Hello {{ name }},\n\n"
                    "Thank you for your purchase! Your order #{{ order_id }} has been confirmed.\n\n"
                    "Items: {{ items }}\n"
                    "Total: {{ total }}\n\n"
                    "Best regards,\n"
                    "The ShopEasy Team"
                ),
            },
            {
                "event_type": "order_shipped",
                "priority": 1,  # normal
                "ttl_seconds": None,
                "retry_schedule": [60, 300, 900],
                "respect_opt_out": True,
                "sensitive": False,
                "subject": "Order #{{ order_id }} on its way",
                "body": (
                    "Hello {{ name }},\n\n"
                    "Great news! Your order #{{ order_id }} is on its way.\n"
                    "Estimated arrival time: {{ eta }}\n\n"
                    "Thank you for shopping with ShopEasy!"
                ),
            },
        ],
    },
    {
        "name": "SecureLogin",
        "owner_email": "owner@securelogin.example",
        "owner_name": "SecureLogin Owner",
        "from_name": "SecureLogin",
        "reply_to_email": "support@securelogin.example",
        "env_filename": "securelogin.env",
        "event_types": [
            {
                "event_type": "welcome_email",
                "priority": 1,  # normal
                "ttl_seconds": None,
                "retry_schedule": [60, 300, 900],
                "respect_opt_out": True,
                "sensitive": False,
                "subject": "Welcome to SecureLogin, {{ name }}",
                "body": (
                    "Hello {{ name }},\n\n"
                    "Welcome to SecureLogin! We are excited to have you on board.\n\n"
                    "Best regards,\n"
                    "The SecureLogin Team"
                ),
            },
            {
                "event_type": "login_otp",
                "priority": 2,  # high
                "ttl_seconds": 300,
                "retry_schedule": [2, 5],
                "respect_opt_out": False,
                "sensitive": True,
                "subject": "Your login code",
                "body": (
                    "Hello {{ name }},\n\n"
                    "Your one-time verification code is: {{ code }}\n\n"
                    "This code will expire in 5 minutes. Do not share this code with anyone.\n\n"
                    "SecureLogin Security Team"
                ),
            },
            {
                "event_type": "password_reset",
                "priority": 2,  # high
                "ttl_seconds": 900,
                "retry_schedule": [2, 5],
                "respect_opt_out": False,
                "sensitive": True,
                "subject": "Reset your password",
                "body": (
                    "Hello {{ name }},\n\n"
                    "We received a request to reset your password. Click the link below to proceed:\n"
                    "{{ link }}\n\n"
                    "This link is valid for 15 minutes.\n\n"
                    "SecureLogin Security Team"
                ),
            },
        ],
    },
    {
        "name": "ReminderBox",
        "owner_email": "owner@reminderbox.example",
        "owner_name": "ReminderBox Owner",
        "from_name": "ReminderBox",
        "reply_to_email": "support@reminderbox.example",
        "env_filename": "reminderbox.env",
        "event_types": [
            {
                "event_type": "reminder_due",
                "priority": 1,  # normal
                "ttl_seconds": None,
                "retry_schedule": [60, 300, 900],
                "respect_opt_out": True,
                "sensitive": False,
                "subject": "Reminder: {{ title }}",
                "body": (
                    "Hello {{ name }},\n\n"
                    "This is a reminder for: {{ title }}\n"
                    "Scheduled time: {{ time }}\n\n"
                    "Best regards,\n"
                    "ReminderBox Team"
                ),
            },
            {
                "event_type": "newsletter",
                "priority": 0,  # low
                "ttl_seconds": 172800,  # 2 days
                "retry_schedule": [60, 300, 900],
                "respect_opt_out": True,
                "sensitive": False,
                "subject": "{{ headline }}",
                "body": (
                    "Hello {{ name }},\n\n"
                    "{{ headline }}\n\n"
                    "{{ body }}\n\n"
                    "To manage your email preferences, update your settings at any time.\n"
                    "Best regards,\n"
                    "ReminderBox Team"
                ),
            },
        ],
    },
]


def seed_demo_clients() -> None:
    DEMO_KEYS_DIR.mkdir(parents=True, exist_ok=True)
    db: Session = SessionLocal()
    password = settings.DEMO_OWNER_PASSWORD
    owner_pw_hash = hash_password(password)

    try:
        print("=" * 60)
        print("SEEDING DEMO CLIENTS (ShopEasy, SecureLogin, ReminderBox)")
        print("=" * 60)

        for spec in DEMO_CLIENTS_SPEC:
            client_name = spec["name"]
            owner_email = spec["owner_email"]
            env_filename = spec["env_filename"]
            key_path = DEMO_KEYS_DIR / env_filename

            existing_client = db.query(Client).filter(Client.name == client_name).first()

            if existing_client is None:
                # 1. Create client
                client = Client(
                    name=client_name,
                    from_name=spec["from_name"],
                    reply_to_email=spec["reply_to_email"],
                    status="active",
                    rate_limit_per_sec=50,
                    daily_email_limit=30,
                )
                db.add(client)
                db.flush()
                print(f"\n[+] Created client '{client_name}' (ID: {client.id})")

                # 2. Create owner user
                owner = User(
                    client_id=client.id,
                    email=owner_email,
                    password_hash=owner_pw_hash,
                    name=spec["owner_name"],
                    role="owner",
                )
                db.add(owner)
                db.flush()
                print(f"    Owner user created: {owner_email}")

                # 3. Create API key 'Demo app'
                full_key, key_hash, prefix = generate_api_key()
                api_key = ApiKey(
                    client_id=client.id,
                    name="Demo app",
                    key_prefix=prefix,
                    key_hash=key_hash,
                    status="active",
                )
                db.add(api_key)
                db.flush()

                # Write key to demo_keys/<client>.env
                with open(key_path, "w", encoding="utf-8") as f:
                    f.write(f"NOTIFYHUB_API_KEY={full_key}\n")

                print(f"    Created API key: {full_key}")
                print(f"    Saved key to: {key_path}")

            else:
                client = existing_client
                client.from_name = spec["from_name"]
                client.reply_to_email = spec["reply_to_email"]
                client.daily_email_limit = 30
                db.flush()

                # Ensure owner user exists
                owner = db.query(User).filter(User.email == owner_email).first()
                if owner is None:
                    owner = User(
                        client_id=client.id,
                        email=owner_email,
                        password_hash=owner_pw_hash,
                        name=spec["owner_name"],
                        role="owner",
                    )
                    db.add(owner)
                    db.flush()
                    print(f"\n[*] Created missing owner for '{client_name}': {owner_email}")
                else:
                    owner.client_id = client.id
                    owner.password_hash = owner_pw_hash
                    db.flush()

                print(f"\n[*] Client '{client_name}' already exists.")
                print(f"    Skipping API key creation and display (preserving existing {key_path.name}).")

            # Seed event type settings and active templates
            for et_spec in spec["event_types"]:
                event_type_name = et_spec["event_type"]

                # Setting
                setting = (
                    db.query(EventTypeSetting)
                    .filter(
                        EventTypeSetting.client_id == client.id,
                        EventTypeSetting.event_type == event_type_name,
                    )
                    .first()
                )
                if setting is None:
                    setting = EventTypeSetting(
                        client_id=client.id,
                        event_type=event_type_name,
                        priority=et_spec["priority"],
                        ttl_seconds=et_spec["ttl_seconds"],
                        retry_schedule=et_spec["retry_schedule"],
                        respect_opt_out=et_spec["respect_opt_out"],
                        sensitive=et_spec["sensitive"],
                    )
                    db.add(setting)
                else:
                    setting.priority = et_spec["priority"]
                    setting.ttl_seconds = et_spec["ttl_seconds"]
                    setting.retry_schedule = et_spec["retry_schedule"]
                    setting.respect_opt_out = et_spec["respect_opt_out"]
                    setting.sensitive = et_spec["sensitive"]

                # Template
                tmpl = (
                    db.query(Template)
                    .filter(
                        Template.client_id == client.id,
                        Template.event_type == event_type_name,
                        Template.version == 1,
                    )
                    .first()
                )
                if tmpl is None:
                    tmpl = Template(
                        client_id=client.id,
                        event_type=event_type_name,
                        version=1,
                        subject=et_spec["subject"],
                        body=et_spec["body"],
                        status="active",
                    )
                    db.add(tmpl)
                else:
                    tmpl.subject = et_spec["subject"]
                    tmpl.body = et_spec["body"]
                    tmpl.status = "active"

            db.commit()
            print(f"    Configured {len(spec['event_types'])} event types and templates for '{client_name}'.")

        db.commit()
        print("\n" + "=" * 60)
        print("SEEDING COMPLETE!")
        print("=" * 60)

    except Exception as e:
        db.rollback()
        print(f"\n[ERROR] Seeding failed: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo_clients()
