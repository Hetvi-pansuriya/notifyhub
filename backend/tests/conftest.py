"""Shared pytest fixtures for NotifyHub backend test suite.

All tests create their own data through these fixtures.
"""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import User
from app.security import hash_password


@pytest.fixture
def db_session():
    """Provides a fresh database session, closing it after the test."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def db(db_session):
    """Alias for db_session fixture for compatibility."""
    return db_session


@pytest.fixture
def client():
    """Provides a FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def http(client):
    """Alias for client fixture for compatibility."""
    return client


@pytest.fixture
def admin_headers():
    """Admin API key headers for direct machine endpoints."""
    return {"X-Admin-Key": settings.ADMIN_KEY}


@pytest.fixture(autouse=True)
def ensure_default_admin(db_session):
    """Ensures platform administrator exists in test database for authentication tests."""
    admin_email = (settings.ADMIN_EMAIL or "admin@notifyhub.local").strip().lower()
    admin = db_session.query(User).filter(User.email == admin_email).first()
    if not admin:
        admin_pw = settings.ADMIN_PASSWORD or "AdminSecretPass123!"
        admin = User(
            client_id=None,
            email=admin_email,
            password_hash=hash_password(admin_pw),
            name="Platform Admin",
            role="admin",
        )
        db_session.add(admin)
        db_session.commit()
    return admin


@pytest.fixture(scope="session", autouse=True)
def clean_db_after_test_session():
    """Teardown fixture that purges test-created clients and extra plans after test session completes."""
    yield
    session = SessionLocal()
    try:
        from app.models import (
            Delivery,
            NotificationEvent,
            EventTypeSetting,
            Template,
            Recipient,
            ApiKey,
            User,
            AuditLog,
            Client,
            Plan,
        )
        session.query(Delivery).delete()
        session.query(NotificationEvent).delete()
        session.query(EventTypeSetting).delete()
        session.query(Template).delete()
        session.query(Recipient).delete()
        session.query(ApiKey).delete()
        session.query(User).filter(User.client_id.isnot(None)).delete()
        session.query(AuditLog).filter(AuditLog.client_id.isnot(None)).delete()
        session.query(Client).delete()
        session.query(Plan).filter(~Plan.name.in_(["Starter", "Growth", "Scale"])).delete()
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()

