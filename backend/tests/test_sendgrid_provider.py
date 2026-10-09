"""Feature tests for SendGrid email provider integration and security."""

import httpx
import pytest
from worker.providers.base import ProviderOutcome
from worker.providers.sendgrid import SendgridEmailProvider


def test_sendgrid_payload_formatting_and_security(caplog):
    """Verify SendGrid payload structure and strict redaction in logs."""
    sent_payload = {}

    def mock_sendgrid_transport(request: httpx.Request):
        import json
        nonlocal sent_payload
        sent_payload = json.loads(request.content.decode("utf-8"))
        return httpx.Response(
            status_code=202,
            headers={"X-Message-Id": "sg_msg_123"},
        )

    mock_client = httpx.Client(transport=httpx.MockTransport(mock_sendgrid_transport))
    provider = SendgridEmailProvider(
        api_key="SG.test_mock_key_xyz",
        from_email="noreply@notifyhub.local",
        client=mock_client,
    )

    with caplog.at_level("INFO"):
        res = provider.send(
            to="user@example.com",
            subject="Welcome!",
            body="Your secure code is 987654",
            message_id="del_111",
            from_name="Acme Alerts",
            reply_to="support@acme.example",
        )

    assert res.outcome == ProviderOutcome.SUCCESS
    assert res.provider_message_id == "sg_msg_123"

    # Check payload
    assert sent_payload["from"] == {"email": "noreply@notifyhub.local", "name": "Acme Alerts via NotifyHub"}
    assert sent_payload["reply_to"] == {"email": "support@acme.example"}
    assert sent_payload["tracking_settings"]["click_tracking"]["enable"] is False
    assert sent_payload["tracking_settings"]["open_tracking"]["enable"] is False

    # Security check: secrets and content not in logs
    log_text = caplog.text
    assert "SG.test_mock_key_xyz" not in log_text
    assert "987654" not in log_text
    assert "Welcome!" not in log_text


def test_sendgrid_error_classification():
    """Verify SendGrid HTTP statuses are mapped correctly to temporary vs permanent errors."""
    # 401 Unauthorized -> TEMPORARY_ERROR
    p_401 = SendgridEmailProvider(
        api_key="SG.key",
        from_email="a@b.com",
        client=httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(401, json={"errors": [{"message": "bad key"}]}))),
    )
    r1 = p_401.send(to="u@e.com", subject="S", body="B", message_id="1")
    assert r1.outcome == ProviderOutcome.TEMPORARY_ERROR

    # 429 Rate limit -> TEMPORARY_ERROR
    p_429 = SendgridEmailProvider(
        api_key="SG.key",
        from_email="a@b.com",
        client=httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(429))),
    )
    r2 = p_429.send(to="u@e.com", subject="S", body="B", message_id="2")
    assert r2.outcome == ProviderOutcome.TEMPORARY_ERROR

    # 400 Bad Request (invalid email) -> PERMANENT_ERROR
    p_400 = SendgridEmailProvider(
        api_key="SG.key",
        from_email="a@b.com",
        client=httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(400, json={"errors": [{"message": "invalid email"}]}))),
    )
    r3 = p_400.send(to="bad", subject="S", body="B", message_id="3")
    assert r3.outcome == ProviderOutcome.PERMANENT_ERROR
