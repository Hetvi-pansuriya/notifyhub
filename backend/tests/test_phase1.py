"""Comprehensive tests for Phase 1: Models, Config, Database, and Health API."""

import uuid
from app.config import settings
from app.db import Base
import app.models as models
from fastapi.testclient import TestClient
from app.main import app


def test_config_loaded_with_all_fields():
    """Verify application configuration has all required Phase 1 settings."""
    assert settings.DATABASE_URL is not None
    assert settings.ADMIN_KEY == "admin_master_secret_key_12345"
    assert settings.HMAC_SECRET == "notifyhub_hmac_secret_token_67890"
    assert settings.SMTP_HOST is not None
    assert settings.SMTP_PORT == 1025
    assert settings.SMTP_FROM is not None
    assert settings.DEFAULT_RATE_LIMIT_PER_SEC == 50
    assert settings.OUTGOING_RATE_PER_SEC == 20
    assert settings.WORKER_POLL_SECONDS == 1
    assert settings.LOCK_SECONDS == 60
    assert settings.REAPER_SECONDS == 30
    assert "psycopg" in settings.sync_database_url


def test_all_eight_models_in_metadata():
    """Verify that all required tables are defined in SQLAlchemy Base.metadata."""
    expected_tables = {
        "clients",
        "recipients",
        "preferences",
        "templates",
        "event_type_settings",
        "notification_events",
        "deliveries",
        "delivery_attempts",
        "users",
        "sessions",
        "api_keys",
        "plans",
        "audit_log",
        "rate_limit_hits",
        "system_status",
    }
    actual_tables = set(Base.metadata.tables.keys())
    assert expected_tables == actual_tables, f"Mismatch: {expected_tables ^ actual_tables}"


def test_deliveries_partial_index_and_unique_constraints():
    """Verify partial index and unique constraints required by Phase 1."""
    deliveries_table = Base.metadata.tables["deliveries"]
    index_names = {idx.name for idx in deliveries_table.indexes}
    assert "idx_deliveries_claim" in index_names

    # Check notification_events unique constraint
    events_table = Base.metadata.tables["notification_events"]
    unique_constraints = [
        c for c in events_table.constraints if c.__class__.__name__ == "UniqueConstraint"
    ]
    u_cols = [{col.name for col in c.columns} for c in unique_constraints]
    assert {"client_id", "idempotency_key"} in u_cols


def test_models_instantiation():
    """Verify all models can be instantiated with their required fields."""
    client_id = uuid.uuid4()
    recipient_id = uuid.uuid4()
    event_id = uuid.uuid4()
    delivery_id = uuid.uuid4()

    client = models.Client(
        id=client_id,
        name="Demo Tenant",
        status="active",
        rate_limit_per_sec=50,
    )
    assert client.name == "Demo Tenant"

    recipient = models.Recipient(
        id=recipient_id,
        client_id=client_id,
        external_id="user_123",
        name="Alice",
        email="alice@example.com",
    )
    assert recipient.email == "alice@example.com"

    pref = models.Preference(
        recipient_id=recipient_id,
        event_type="order_shipped",
        enabled=True,
    )
    assert pref.enabled is True

    template = models.Template(
        client_id=client_id,
        event_type="order_shipped",
        version=1,
        subject="Your order #{{ id }} has shipped!",
        body="Order #{{ id }} is on its way.",
        status="active",
    )
    assert template.version == 1

    event_setting = models.EventTypeSetting(
        client_id=client_id,
        event_type="order_shipped",
        priority=1,
        ttl_seconds=3600,
        retry_schedule=[60, 300, 900],
        respect_opt_out=True,
        sensitive=False,
    )
    assert event_setting.priority == 1

    event = models.NotificationEvent(
        id=event_id,
        client_id=client_id,
        idempotency_key="idem_123",
        request_hash="req_hash_123",
        event_type="order_shipped",
        recipient_id=recipient_id,
        recipient_email="alice@example.com",
        data={"order_id": 42},
    )
    assert event.idempotency_key == "idem_123"

    delivery = models.Delivery(
        id=delivery_id,
        client_id=client_id,
        event_id=event_id,
        to_email="alice@example.com",
        status="queued",
        priority=1,
        retry_schedule=[60, 300, 900],
        sensitive=False,
        attempt_count=0,
        rendered_subject="Your order #42 has shipped!",
        rendered_body="Order #42 is on its way.",
    )
    assert delivery.status == "queued"

    attempt = models.DeliveryAttempt(
        delivery_id=delivery_id,
        attempt_no=1,
        outcome="success",
        latency_ms=120,
    )
    assert attempt.attempt_no == 1


def test_api_health_endpoint():
    """Verify GET /api/health endpoint returns API and database status."""
    test_client = TestClient(app)
    response = test_client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "database" in data
    assert data["database"] == "connected"
