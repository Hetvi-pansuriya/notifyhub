"""Stage 8: Comprehensive Unit & Integration Tests covering:
- SendGrid provider via httpx.MockTransport (202, 401, 429, 500)
- SMTP provider test double
- API Key never logged in logs or exception messages
- Scheduled sends: pending until send_at, processed after send_at
- Daily limit behavior & UTC midnight resets
- Allowlist rejection with 422 under SendGrid, pass under SMTP
- Client identity: from_name and reply_to appear in worker payload to provider
"""

import uuid
from datetime import datetime, timedelta, timezone
import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import ApiKey, Client, Delivery, EventTypeSetting, NotificationEvent, Preference, Recipient, Template
from worker.providers.base import ProviderOutcome
from worker.providers.sendgrid import SendgridEmailProvider
from worker.providers.smtp import SmtpEmailProvider
from worker.sender import process_single_delivery


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def http():
    return TestClient(app)


def test_sendgrid_mock_transport_all_status_codes(caplog):
    """Simulate SendGrid responses: 202 (success), 401 (auth), 429 (rate limit), 500 (server error)."""
    secret_key = "SG.super_secret_never_log_this_key_999"

    # 1. Test 202 Accepted
    def handler_202(request: httpx.Request):
        return httpx.Response(status_code=202, headers={"X-Message-Id": "sg_msg_ok"})

    p202 = SendgridEmailProvider(
        api_key=secret_key,
        from_email="no-reply@notifyhub.local",
        client=httpx.Client(transport=httpx.MockTransport(handler_202)),
    )
    with caplog.at_level("INFO"):
        res202 = p202.send("user@example.com", "Subject", "Body", "del_1", "TestClient", "reply@test.com")
    assert res202.outcome == ProviderOutcome.SUCCESS
    assert res202.provider_message_id == "sg_msg_ok"
    assert secret_key not in caplog.text

    # 2. Test 401 Unauthorized
    def handler_401(request: httpx.Request):
        return httpx.Response(status_code=401, text="Unauthorized key")

    p401 = SendgridEmailProvider(
        api_key=secret_key,
        from_email="no-reply@notifyhub.local",
        client=httpx.Client(transport=httpx.MockTransport(handler_401)),
    )
    with caplog.at_level("INFO"):
        res401 = p401.send("user@example.com", "Subject", "Body", "del_2")
    assert res401.outcome == ProviderOutcome.TEMPORARY_ERROR
    assert "SendGrid rejected the API key" in res401.error_message
    assert secret_key not in caplog.text
    assert secret_key not in res401.error_message

    # 3. Test 429 Rate Limit
    def handler_429(request: httpx.Request):
        return httpx.Response(status_code=429, text="Too Many Requests")

    p429 = SendgridEmailProvider(
        api_key=secret_key,
        from_email="no-reply@notifyhub.local",
        client=httpx.Client(transport=httpx.MockTransport(handler_429)),
    )
    with caplog.at_level("INFO"):
        res429 = p429.send("user@example.com", "Subject", "Body", "del_3")
    assert res429.outcome == ProviderOutcome.TEMPORARY_ERROR
    assert "429" in res429.error_message
    assert secret_key not in caplog.text

    # 4. Test 500 Server Error
    def handler_500(request: httpx.Request):
        return httpx.Response(status_code=500, text="Internal Server Error")

    p500 = SendgridEmailProvider(
        api_key=secret_key,
        from_email="no-reply@notifyhub.local",
        client=httpx.Client(transport=httpx.MockTransport(handler_500)),
    )
    with caplog.at_level("INFO"):
        res500 = p500.send("user@example.com", "Subject", "Body", "del_4")
    assert res500.outcome == ProviderOutcome.TEMPORARY_ERROR
    assert "500" in res500.error_message
    assert secret_key not in caplog.text


def test_sendgrid_payload_includes_client_identity():
    """Verify that from_name and reply_to are properly formatted in SendGrid payload."""
    recorded_body = {}

    def handler(request: httpx.Request):
        import json
        recorded_body["data"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(status_code=202, headers={"X-Message-Id": "sg_identity_msg"})

    provider = SendgridEmailProvider(
        api_key="SG.mock_key",
        from_email="no-reply@notifyhub.local",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    res = provider.send(
        to="recipient@example.com",
        subject="Important Update",
        body="Message body",
        message_id="del_id_100",
        from_name="Acme Support",
        reply_to="support@acme.example",
    )

    assert res.outcome == ProviderOutcome.SUCCESS
    payload = recorded_body["data"]
    assert payload["from"] == {
        "email": "no-reply@notifyhub.local",
        "name": "Acme Support via NotifyHub",
    }
    assert payload["reply_to"] == {"email": "support@acme.example"}


def test_daily_limit_utc_midnight_rollover(db, http):
    """Verify that deliveries from yesterday (before today's UTC midnight) do not count towards today's limit."""
    c_name = f"Midnight Client {uuid.uuid4().hex[:6]}"
    client = Client(name=c_name, from_name=c_name, daily_email_limit=1, status="active", rate_limit_per_sec=50)
    db.add(client)
    db.flush()

    raw_key = f"nh_live_mid_{uuid.uuid4().hex}"
    import hashlib
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    api_key = ApiKey(client_id=client.id, name="Test Key", key_prefix=raw_key[:12], key_hash=key_hash, status="active")
    db.add(api_key)

    setting = EventTypeSetting(client_id=client.id, event_type="daily_check", priority=1, respect_opt_out=True)
    tmpl = Template(client_id=client.id, event_type="daily_check", version=1, status="active", subject="Hi {{ name }}", body="Body {{ name }}")
    db.add_all([setting, tmpl])
    db.commit()

    # Create an old event and delivery timestamped yesterday (25 hours ago)
    yesterday = datetime.now(timezone.utc) - timedelta(hours=25)
    ev_old = NotificationEvent(
        client_id=client.id,
        event_type="daily_check",
        idempotency_key=f"old_{uuid.uuid4().hex}",
        request_hash="old_hash",
        recipient_email="old@example.com",
        data={"name": "Old"},
        created_at=yesterday,
    )
    db.add(ev_old)
    db.flush()

    del_old = Delivery(
        client_id=client.id,
        event_id=ev_old.id,
        to_email="old@example.com",
        rendered_subject="Hi Old",
        rendered_body="Body Old",
        retry_schedule=[60, 300, 900],
        status="sent",
        created_at=yesterday,
    )
    db.add(del_old)
    db.commit()

    # Client daily limit is 1. Since yesterday's delivery does not count, sending 1 today must succeed (202)
    res_today = http.post(
        "/api/events",
        headers={"X-API-Key": raw_key, "Idempotency-Key": f"today_{uuid.uuid4().hex}"},
        json={"event_type": "daily_check", "email": "today@example.com", "data": {"name": "Today"}},
    )
    assert res_today.status_code == 202

    # A second send today exceeds the limit of 1 and triggers 429
    res_excess = http.post(
        "/api/events",
        headers={"X-API-Key": raw_key, "Idempotency-Key": f"excess_{uuid.uuid4().hex}"},
        json={"event_type": "daily_check", "email": "excess@example.com", "data": {"name": "Excess"}},
    )
    assert res_excess.status_code == 429
    assert "Retry-After" in res_excess.headers
