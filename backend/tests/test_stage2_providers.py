"""Unit and integration tests for Stage 2: SendGrid and SMTP providers, config validation, and delivery metadata."""

import uuid
import pytest
import httpx
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import SessionLocal
from app.main import app
from app.models import Client, Delivery, NotificationEvent
from worker.providers import get_provider
from worker.providers.base import ProviderOutcome
from worker.providers.sendgrid import SendgridEmailProvider
from worker.providers.smtp import SmtpEmailProvider
from worker.sender import OutgoingRateLimiter, process_single_delivery


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def http():
    return TestClient(app)


def test_config_validation_sendgrid():
    """Verify that MAIL_PROVIDER=sendgrid requires SENDGRID_API_KEY and FROM_EMAIL."""
    # 1. smtp mode works with defaults
    s_smtp = Settings(MAIL_PROVIDER="smtp")
    assert s_smtp.MAIL_PROVIDER == "smtp"

    # 2. sendgrid without key or from_email raises ValueError
    with pytest.raises(ValueError, match="must be set when MAIL_PROVIDER=sendgrid"):
        Settings(MAIL_PROVIDER="sendgrid", SENDGRID_API_KEY=None, FROM_EMAIL=None)

    with pytest.raises(ValueError, match="must be set when MAIL_PROVIDER=sendgrid"):
        Settings(MAIL_PROVIDER="sendgrid", SENDGRID_API_KEY="SG.12345", FROM_EMAIL=None)

    with pytest.raises(ValueError, match="must be set when MAIL_PROVIDER=sendgrid"):
        Settings(MAIL_PROVIDER="sendgrid", SENDGRID_API_KEY="", FROM_EMAIL="sender@notifyhub.local")

    # 3. sendgrid with both key and from_email passes
    s_sg = Settings(
        MAIL_PROVIDER="sendgrid",
        SENDGRID_API_KEY="SG.test_key",
        FROM_EMAIL="sender@notifyhub.local",
    )
    assert s_sg.MAIL_PROVIDER == "sendgrid"
    assert s_sg.SENDGRID_API_KEY == "SG.test_key"
    assert s_sg.FROM_EMAIL == "sender@notifyhub.local"


def test_get_provider_factory(monkeypatch):
    """Verify get_provider chooses provider based on MAIL_PROVIDER setting."""
    monkeypatch.setattr("app.config.settings.MAIL_PROVIDER", "smtp")
    provider = get_provider()
    assert isinstance(provider, SmtpEmailProvider)
    assert provider.provider_name == "smtp"

    monkeypatch.setattr("app.config.settings.MAIL_PROVIDER", "sendgrid")
    monkeypatch.setattr("app.config.settings.SENDGRID_API_KEY", "SG.test")
    monkeypatch.setattr("app.config.settings.FROM_EMAIL", "test@notifyhub.local")
    provider_sg = get_provider()
    assert isinstance(provider_sg, SendgridEmailProvider)
    assert provider_sg.provider_name == "sendgrid"

    monkeypatch.setattr("app.config.settings.MAIL_PROVIDER", "unsupported")
    with pytest.raises(ValueError, match="Unknown MAIL_PROVIDER"):
        get_provider()


def test_sendgrid_provider_success_202(caplog):
    """Verify SendGrid HTTP 202 yields SUCCESS, captures X-Message-Id, and builds correct payload."""
    sent_request = {}

    def handler(request: httpx.Request):
        import json
        sent_request["headers"] = dict(request.headers)
        sent_request["body"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(
            status_code=202,
            headers={"X-Message-Id": "sg_msg_id_123456789"},
            content=b"",
        )

    transport = httpx.MockTransport(handler)
    mock_client = httpx.Client(transport=transport)

    provider = SendgridEmailProvider(
        api_key="SG.test_secret_key",
        from_email="noreply@notifyhub.example",
        client=mock_client,
    )

    with caplog.at_level("INFO"):
        res = provider.send(
            to="customer@example.com",
            subject="Order Placed",
            body="Thank you for your order!",
            message_id="del_9999",
            from_name="Acme Corp",
            reply_to="support@example.com",
        )

    assert res.outcome == ProviderOutcome.SUCCESS
    assert res.provider_message_id == "sg_msg_id_123456789"

    # Verify SendGrid payload format
    payload = sent_request["body"]
    assert payload["from"] == {
        "email": "noreply@notifyhub.example",
        "name": "Acme Corp via NotifyHub",
    }
    assert payload["reply_to"] == {"email": "support@example.com"}
    assert payload["subject"] == "Order Placed"
    assert payload["content"] == [{"type": "text/plain", "value": "Thank you for your order!"}]
    assert payload["personalizations"] == [
        {
            "to": [{"email": "customer@example.com"}],
            "custom_args": {"delivery_id": "del_9999"},
        }
    ]
    assert payload["tracking_settings"]["click_tracking"]["enable"] is False
    assert payload["tracking_settings"]["open_tracking"]["enable"] is False

    # Security: Verify API key, subject, and body are NEVER logged
    log_text = caplog.text
    assert "SG.test_secret_key" not in log_text
    assert "Thank you for your order!" not in log_text
    assert "Order Placed" not in log_text


def test_sendgrid_provider_auth_failure_401_403(caplog):
    """Verify 401/403 yields TEMPORARY_ERROR with loud 'SendGrid rejected the API key' log."""
    def handler(request: httpx.Request):
        return httpx.Response(status_code=401, json={"errors": [{"message": "The provided authorization grant is invalid"}]})

    mock_client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = SendgridEmailProvider(api_key="SG.bad_key", from_email="a@b.com", client=mock_client)

    with caplog.at_level("ERROR"):
        res = provider.send(
            to="user@example.com",
            subject="Test",
            body="Secret OTP 123456",
            message_id="del_401",
            from_name="AuthService",
        )

    assert res.outcome == ProviderOutcome.TEMPORARY_ERROR
    assert "SendGrid rejected the API key" in res.error_message
    assert "SendGrid rejected the API key" in caplog.text
    # Sensitive data not in logs
    assert "123456" not in caplog.text
    assert "SG.bad_key" not in caplog.text


def test_sendgrid_provider_temporary_errors():
    """Verify 429, 500, and timeout give TEMPORARY_ERROR."""
    # 429 Rate Limit
    def handler_429(req):
        return httpx.Response(status_code=429, json={"errors": [{"message": "Too Many Requests"}]})

    p_429 = SendgridEmailProvider(client=httpx.Client(transport=httpx.MockTransport(handler_429)))
    r_429 = p_429.send(to="u@e.com", subject="S", body="B", message_id="1", from_name="App")
    assert r_429.outcome == ProviderOutcome.TEMPORARY_ERROR

    # 500 Internal Error
    def handler_500(req):
        return httpx.Response(status_code=500, content=b"Server error")

    p_500 = SendgridEmailProvider(client=httpx.Client(transport=httpx.MockTransport(handler_500)))
    r_500 = p_500.send(to="u@e.com", subject="S", body="B", message_id="2", from_name="App")
    assert r_500.outcome == ProviderOutcome.TEMPORARY_ERROR

    # Timeout
    def handler_timeout(req):
        raise httpx.ReadTimeout("Connection timed out")

    p_to = SendgridEmailProvider(client=httpx.Client(transport=httpx.MockTransport(handler_timeout)))
    r_to = p_to.send(to="u@e.com", subject="S", body="B", message_id="3", from_name="App")
    assert r_to.outcome == ProviderOutcome.TEMPORARY_ERROR


def test_sendgrid_provider_permanent_error_400():
    """Verify other 4xx yields PERMANENT_ERROR with error message without leaking email body."""
    def handler_400(req):
        return httpx.Response(
            status_code=400,
            json={"errors": [{"message": "Invalid recipient format", "field": "to.email"}]},
        )

    p_400 = SendgridEmailProvider(client=httpx.Client(transport=httpx.MockTransport(handler_400)))
    r_400 = p_400.send(to="bad-email", subject="Test", body="Sensitive content here", message_id="4", from_name="App")
    assert r_400.outcome == ProviderOutcome.PERMANENT_ERROR
    assert "Invalid recipient format" in r_400.error_message
    assert "Sensitive content here" not in r_400.error_message


def test_delivery_provider_metadata_saved_and_returned_by_api(db, http):
    """Verify worker records provider and provider_message_id, and GET /api/deliveries/{id} returns them."""
    # 1. Create client and event
    client = Client(
        id=uuid.uuid4(),
        name="Stage 2 Test Client",
        from_name="Stage2Brand",
        reply_to_email="replies@stage2.example",
        status="active",
        rate_limit_per_sec=50,
    )
    db.add(client)
    db.commit()

    ev = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"stage2_ev_{uuid.uuid4().hex}",
        request_hash="hash_s2",
        event_type="order_confirmed",
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
        rendered_subject="Order #1 Confirmed",
        rendered_body="Hello customer!",
    )
    db.add(delivery)
    db.commit()

    # 2. Mock SendGrid transport
    def handler(request: httpx.Request):
        return httpx.Response(
            status_code=202,
            headers={"X-Message-Id": "sg_delivery_msg_abc"},
            content=b"",
        )

    sg_provider = SendgridEmailProvider(
        api_key="SG.test",
        from_email="noreply@notifyhub.example",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    rate_limiter = OutgoingRateLimiter(rate_per_sec=100)

    # 3. Process delivery
    process_single_delivery(db, delivery, sg_provider, rate_limiter)
    db.refresh(delivery)

    # 4. Assert delivery record updated
    assert delivery.status == "sent"
    assert delivery.provider == "sendgrid"
    assert delivery.provider_message_id == "sg_delivery_msg_abc"

    # 5. Assert GET /api/deliveries/{id} returns provider and provider_message_id
    from app.models import ApiKey
    from app.security import hash_key

    raw_key = f"nh_live_{uuid.uuid4().hex}"
    api_key_record = ApiKey(
        client_id=client.id,
        key_hash=hash_key(raw_key),
        name="Test Key",
        key_prefix=raw_key[:12],
    )
    db.add(api_key_record)
    db.commit()

    res = http.get(f"/api/deliveries/{delivery.id}", headers={"X-API-Key": raw_key})
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "sendgrid"
    assert data["provider_message_id"] == "sg_delivery_msg_abc"
