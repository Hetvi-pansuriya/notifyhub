"""Unit and integration tests for Stage 3: Client Sending Identity endpoints and rules."""

import uuid
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import Client, Delivery, NotificationEvent, Session as SessionModel, User
from app.security import hash_password, hash_token
from worker.providers.base import BaseEmailProvider, ProviderOutcome, ProviderResult
from worker.sender import OutgoingRateLimiter, process_single_delivery


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def http():
    return TestClient(app)


def create_owner_session(db, client: Client, email: str = "owner@test.example") -> str:
    """Helper to create a test owner user and active session cookie."""
    user = User(
        client_id=client.id,
        email=email,
        name="Owner User",
        password_hash=hash_password("password123"),
        role="owner",
    )
    db.add(user)
    db.commit()

    raw_token = uuid.uuid4().hex
    sess = SessionModel(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(sess)
    db.commit()
    return raw_token


def test_get_console_client_unauthenticated(http):
    """GET /console/client returns 401 when no session cookie is provided."""
    res = http.get("/console/client")
    assert res.status_code == 401


def test_get_console_client_success_and_sent_today_calculation(db, http):
    """GET /console/client returns client fields, sender_email, and accurate sent_today count."""
    client = Client(
        id=uuid.uuid4(),
        name="Identity Store",
        from_name="Identity Store",
        reply_to_email="support@identity.example",
        daily_email_limit=30,
        status="active",
        rate_limit_per_sec=50,
    )
    db.add(client)
    db.commit()

    token = create_owner_session(db, client, f"owner_{uuid.uuid4().hex[:6]}@example.com")

    # Create deliveries:
    # 1. Sent today (UTC) -> counts
    # 2. Queued today (UTC) -> counts (non-skipped)
    # 3. Skipped today (UTC) -> does NOT count
    # 4. Sent yesterday (UTC) -> does NOT count
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(days=1)

    ev = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"ev_{uuid.uuid4().hex}",
        request_hash="hash",
        event_type="order_confirmed",
        recipient_email="u@e.com",
        data={},
    )
    db.add(ev)
    db.commit()

    d1 = Delivery(
        client_id=client.id,
        event_id=ev.id,
        to_email="u1@e.com",
        status="sent",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        rendered_subject="S1",
        rendered_body="B1",
        created_at=now,
    )
    d2 = Delivery(
        client_id=client.id,
        event_id=ev.id,
        to_email="u2@e.com",
        status="queued",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        rendered_subject="S2",
        rendered_body="B2",
        created_at=now,
    )
    d_skipped = Delivery(
        client_id=client.id,
        event_id=ev.id,
        to_email="u3@e.com",
        status="skipped",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        rendered_subject="S3",
        rendered_body="B3",
        created_at=now,
    )
    d_yesterday = Delivery(
        client_id=client.id,
        event_id=ev.id,
        to_email="u4@e.com",
        status="sent",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        rendered_subject="S4",
        rendered_body="B4",
        created_at=yesterday,
    )
    db.add_all([d1, d2, d_skipped, d_yesterday])
    db.commit()

    # GET /console/client with session cookie
    http.cookies.set(settings.COOKIE_NAME, token)
    res = http.get("/console/client")
    assert res.status_code == 200
    data = res.json()

    assert data["id"] == str(client.id)
    assert data["name"] == "Identity Store"
    assert data["from_name"] == "Identity Store"
    assert data["reply_to_email"] == "support@identity.example"
    assert data["daily_email_limit"] == 30
    assert data["sent_today"] == 2  # d1 and d2 (skipped and yesterday excluded)
    assert data["sender_email"] == (settings.FROM_EMAIL or "no-reply@notifyhub.local")


def test_patch_console_client_crlf_and_length_validation(db, http):
    """PATCH /console/client rejects CR/LF injection, strips spaces, and enforces 2-60 length."""
    client = Client(
        id=uuid.uuid4(),
        name="Validation Store",
        from_name="Validation Store",
    )
    db.add(client)
    db.commit()

    token = create_owner_session(db, client, f"owner_{uuid.uuid4().hex[:6]}@example.com")
    http.cookies.set(settings.COOKIE_NAME, token)
    headers = {"X-Requested-With": "notifyhub-console"}

    # 1. Missing CSRF header -> 403
    res_no_csrf = http.patch("/console/client", json={"from_name": "Valid Name"})
    assert res_no_csrf.status_code == 403

    # 2. Reject CR ('\r') header injection
    res_cr = http.patch(
        "/console/client",
        json={"from_name": "Store\rBcc: hacker@example.com"},
        headers=headers,
    )
    assert res_cr.status_code == 422

    # 3. Reject LF ('\n') header injection
    res_lf = http.patch(
        "/console/client",
        json={"from_name": "Store\nBcc: hacker@example.com"},
        headers=headers,
    )
    assert res_lf.status_code == 422

    # 4. Reject too short (< 2 chars after stripping)
    res_short = http.patch(
        "/console/client",
        json={"from_name": " A "},
        headers=headers,
    )
    assert res_short.status_code == 422

    # 5. Reject too long (> 60 chars)
    res_long = http.patch(
        "/console/client",
        json={"from_name": "A" * 61},
        headers=headers,
    )
    assert res_long.status_code == 422

    # 6. Reject invalid reply_to_email format
    res_bad_email = http.patch(
        "/console/client",
        json={"from_name": "Valid Store", "reply_to_email": "not-an-email"},
        headers=headers,
    )
    assert res_bad_email.status_code == 422


def test_patch_console_client_success_and_isolation(db, http):
    """PATCH /console/client strips spaces, updates identity, and isolates clients."""
    client_a = Client(id=uuid.uuid4(), name="Client A", from_name="Client A")
    client_b = Client(id=uuid.uuid4(), name="Client B", from_name="Client B", reply_to_email="b@example.com")
    db.add_all([client_a, client_b])
    db.commit()

    token_a = create_owner_session(db, client_a, f"owner_a_{uuid.uuid4().hex[:6]}@example.com")
    http.cookies.set(settings.COOKIE_NAME, token_a)
    headers = {"X-Requested-With": "notifyhub-console"}

    # Update Client A with extra surrounding spaces
    res = http.patch(
        "/console/client",
        json={"from_name": "  Updated Client A Brand  ", "reply_to_email": "hello@client-a.example"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["from_name"] == "Updated Client A Brand"
    assert data["reply_to_email"] == "hello@client-a.example"

    # Verify Client B was NOT touched
    db.refresh(client_b)
    assert client_b.from_name == "Client B"
    assert client_b.reply_to_email == "b@example.com"

    # Setting reply_to_email to None works
    res_null_reply = http.patch(
        "/console/client",
        json={"from_name": "Updated Client A Brand", "reply_to_email": None},
        headers=headers,
    )
    assert res_null_reply.status_code == 200
    assert res_null_reply.json()["reply_to_email"] is None


def test_admin_patch_client_daily_email_limit(db, http):
    """PATCH /admin/clients/{id} accepts daily_email_limit (1 to 1000) with validation."""
    client = Client(id=uuid.uuid4(), name="Admin Client Limit Test", daily_email_limit=30)
    db.add(client)
    db.commit()

    admin_headers = {"X-Admin-Key": settings.ADMIN_KEY}

    # 1. Update daily_email_limit to 100 -> success
    res = http.patch(
        f"/admin/clients/{client.id}",
        json={"daily_email_limit": 100},
        headers=admin_headers,
    )
    assert res.status_code == 200
    assert res.json()["daily_email_limit"] == 100

    db.refresh(client)
    assert client.daily_email_limit == 100

    # 2. Reject daily_email_limit < 1 -> 422
    res_low = http.patch(
        f"/admin/clients/{client.id}",
        json={"daily_email_limit": 0},
        headers=admin_headers,
    )
    assert res_low.status_code == 422

    # 3. Reject daily_email_limit > 1000 -> 422
    res_high = http.patch(
        f"/admin/clients/{client.id}",
        json={"daily_email_limit": 1001},
        headers=admin_headers,
    )
    assert res_high.status_code == 422


def test_worker_uses_client_from_name_and_reply_to_for_send(db):
    """Verify worker passes client's custom from_name and reply_to_email to provider."""
    client = Client(
        id=uuid.uuid4(),
        name="Custom Shop",
        from_name="Custom Shop Brand",
        reply_to_email="orders@customshop.example",
    )
    db.add(client)
    db.commit()

    ev = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"worker_ident_{uuid.uuid4().hex}",
        request_hash="hash_ident",
        event_type="order_shipped",
        recipient_email="customer@example.com",
        data={"order": 1},
    )
    db.add(ev)
    delivery = Delivery(
        client_id=client.id,
        event=ev,
        to_email="customer@example.com",
        status="processing",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        rendered_subject="Shipped!",
        rendered_body="On the way!",
    )
    db.add(delivery)
    db.commit()

    class IdentityCapturingProvider(BaseEmailProvider):
        provider_name = "test_ident"
        def __init__(self):
            self.captured = {}

        def send(self, to, subject, body, message_id, from_name, reply_to=None, **kwargs):
            self.captured = {
                "to": to,
                "from_name": from_name,
                "reply_to": reply_to,
            }
            return ProviderResult(
                outcome=ProviderOutcome.SUCCESS,
                provider_message_id=message_id,
            )

    provider = IdentityCapturingProvider()
    rate_limiter = OutgoingRateLimiter(rate_per_sec=100)

    process_single_delivery(db, delivery, provider, rate_limiter)
    db.refresh(delivery)

    assert delivery.status == "sent"
    assert provider.captured["from_name"] == "Custom Shop Brand"
    assert provider.captured["reply_to"] == "orders@customshop.example"
