"""Feature tests for PDF attachments: intake, validation, idempotency, providers, retention, and security."""

import base64
from datetime import datetime, timedelta, timezone
from email import message_from_bytes
import httpx
import pytest
import uuid

from app.config import settings
from app.models import (
    ApiKey,
    Client,
    Delivery,
    DeliveryAttachment,
    EventTypeSetting,
    NotificationEvent,
    Preference,
    Recipient,
    Template,
)
from app.security import generate_api_key
from worker.providers.base import Attachment, ProviderOutcome
from worker.providers.fake import FakeEmailProvider
from worker.providers.sendgrid import SendgridEmailProvider
from worker.providers.smtp import SmtpEmailProvider
from worker.reaper import reap_stuck_deliveries
from worker.sender import process_single_delivery


VALID_PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
VALID_PDF_B64 = base64.b64encode(VALID_PDF_BYTES).decode("ascii")


def _setup_client_and_template(db_session, event_type="report_email", sensitive=False):
    key, key_hash, prefix = generate_api_key()
    client = Client(name=f"AttachClient_{uuid.uuid4().hex[:6]}", status="active", rate_limit_per_sec=50)
    db_session.add(client)
    db_session.flush()

    api_key = ApiKey(client_id=client.id, key_hash=key_hash, key_prefix=prefix, name="Default Key", status="active")
    db_session.add(api_key)

    setting = EventTypeSetting(
        client_id=client.id,
        event_type=event_type,
        priority=1,
        ttl_seconds=3600,
        retry_schedule=[10, 60],
        respect_opt_out=True,
        sensitive=sensitive,
    )
    template = Template(
        client_id=client.id,
        event_type=event_type,
        version=1,
        subject="Report for {{ name }}",
        body="Hello {{ name }}, your report is attached.",
        status="active",
    )
    db_session.add_all([setting, template])
    db_session.commit()
    return client, key


def test_valid_pdf_accepted_and_stored(client, db_session):
    """Verify valid PDF attachment is accepted, stored in database, and exposed via delivery API."""
    cl, raw_key = _setup_client_and_template(db_session)
    headers = {"X-API-Key": raw_key, "Idempotency-Key": f"k_{uuid.uuid4().hex[:8]}"}
    payload = {
        "event_type": "report_email",
        "email": "recipient@example.com",
        "data": {"name": "Alice"},
        "attachments": [
            {
                "filename": "monthly_report.pdf",
                "content_type": "application/pdf",
                "content_base64": VALID_PDF_B64,
            }
        ],
    }

    resp = client.post("/api/events", json=payload, headers=headers)
    assert resp.status_code == 202
    data = resp.json()
    assert data["attachment_count"] == 1
    delivery_id = uuid.UUID(data["delivery"]["id"])

    # Verify attachment in database
    att = db_session.query(DeliveryAttachment).filter(DeliveryAttachment.delivery_id == delivery_id).first()
    assert att is not None
    assert att.filename == "monthly_report.pdf"
    assert att.content_type == "application/pdf"
    assert att.size_bytes == len(VALID_PDF_BYTES)
    assert att.content == VALID_PDF_BYTES
    assert att.available is True

    # Verify GET /api/deliveries/{id} returns attachment metadata without content bytes
    del_resp = client.get(f"/api/deliveries/{delivery_id}", headers=headers)
    assert del_resp.status_code == 200
    del_data = del_resp.json()
    assert len(del_data["attachments"]) == 1
    att_meta = del_data["attachments"][0]
    assert att_meta["filename"] == "monthly_report.pdf"
    assert att_meta["content_type"] == "application/pdf"
    assert att_meta["size_bytes"] == len(VALID_PDF_BYTES)
    assert att_meta["available"] is True
    assert "content" not in att_meta


def test_invalid_attachment_type_fails_422(client, db_session):
    """Verify non-allowed attachment types return 422."""
    cl, raw_key = _setup_client_and_template(db_session)
    headers = {"X-API-Key": raw_key}
    payload = {
        "event_type": "report_email",
        "email": "recipient@example.com",
        "data": {"name": "Alice"},
        "attachments": [
            {
                "filename": "photo.png",
                "content_type": "image/png",
                "content_base64": VALID_PDF_B64,
            }
        ],
    }
    resp = client.post("/api/events", json=payload, headers=headers)
    assert resp.status_code == 422
    assert "not allowed" in resp.json()["detail"].lower()


def test_invalid_base64_fails_422(client, db_session):
    """Verify non-base64 content fails with 422."""
    cl, raw_key = _setup_client_and_template(db_session)
    headers = {"X-API-Key": raw_key}
    payload = {
        "event_type": "report_email",
        "email": "recipient@example.com",
        "data": {"name": "Alice"},
        "attachments": [
            {
                "filename": "report.pdf",
                "content_type": "application/pdf",
                "content_base64": "invalid_base64_content!!!",
            }
        ],
    }
    resp = client.post("/api/events", json=payload, headers=headers)
    assert resp.status_code == 422
    assert "base64" in resp.json()["detail"].lower()


def test_empty_attachment_file_fails_422(client, db_session):
    """Verify empty decoded attachment returns 422."""
    cl, raw_key = _setup_client_and_template(db_session)
    headers = {"X-API-Key": raw_key}
    payload = {
        "event_type": "report_email",
        "email": "recipient@example.com",
        "data": {"name": "Alice"},
        "attachments": [
            {
                "filename": "report.pdf",
                "content_type": "application/pdf",
                "content_base64": "",
            }
        ],
    }
    resp = client.post("/api/events", json=payload, headers=headers)
    assert resp.status_code == 422
    assert "empty" in resp.json()["detail"].lower()


def test_fake_pdf_fails_422(client, db_session):
    """Verify PDF without %PDF- magic bytes fails with 422."""
    cl, raw_key = _setup_client_and_template(db_session)
    headers = {"X-API-Key": raw_key}
    fake_bytes = b"Hello, this is just plain text masquerading as a PDF"
    payload = {
        "event_type": "report_email",
        "email": "recipient@example.com",
        "data": {"name": "Alice"},
        "attachments": [
            {
                "filename": "report.pdf",
                "content_type": "application/pdf",
                "content_base64": base64.b64encode(fake_bytes).decode("ascii"),
            }
        ],
    }
    resp = client.post("/api/events", json=payload, headers=headers)
    assert resp.status_code == 422
    assert "not a valid pdf" in resp.json()["detail"].lower()


def test_unsafe_filenames_fail_422(client, db_session):
    """Verify path separators, control chars, and invalid lengths are rejected with 422."""
    cl, raw_key = _setup_client_and_template(db_session)
    headers = {"X-API-Key": raw_key}

    unsafe_names = [
        "../secret.pdf",
        "subdir/report.pdf",
        "subdir\\report.pdf",
        "report\n.pdf",
        "report\r.pdf",
        "report\x00.pdf",
        "a" * 101 + ".pdf",
        "",
    ]
    for bad_name in unsafe_names:
        payload = {
            "event_type": "report_email",
            "email": "recipient@example.com",
            "data": {"name": "Alice"},
            "attachments": [
                {
                    "filename": bad_name,
                    "content_type": "application/pdf",
                    "content_base64": VALID_PDF_B64,
                }
            ],
        }
        resp = client.post("/api/events", json=payload, headers=headers)
        assert resp.status_code == 422


def test_too_many_attachments_fails_422(client, db_session):
    """Verify exceeding ATTACHMENT_MAX_COUNT (3) returns 422."""
    cl, raw_key = _setup_client_and_template(db_session)
    headers = {"X-API-Key": raw_key}
    payload = {
        "event_type": "report_email",
        "email": "recipient@example.com",
        "data": {"name": "Alice"},
        "attachments": [
            {"filename": f"file_{i}.pdf", "content_type": "application/pdf", "content_base64": VALID_PDF_B64}
            for i in range(4)
        ],
    }
    resp = client.post("/api/events", json=payload, headers=headers)
    assert resp.status_code == 422
    assert "exceed" in resp.json()["detail"].lower()


def test_attachment_too_large_fails_422(client, db_session):
    """Verify decoded attachments exceeding ATTACHMENT_MAX_TOTAL_MB return 422."""
    cl, raw_key = _setup_client_and_template(db_session)
    headers = {"X-API-Key": raw_key}

    # 5.3 MB decoded PDF bytes (> 5 MB limit of 5,242,880 bytes)
    large_pdf = b"%PDF-1.4\n" + b"X" * (5300 * 1024)
    payload = {
        "event_type": "report_email",
        "email": "recipient@example.com",
        "data": {"name": "Alice"},
        "attachments": [
            {
                "filename": "large.pdf",
                "content_type": "application/pdf",
                "content_base64": base64.b64encode(large_pdf).decode("ascii"),
            }
        ],
    }
    resp = client.post("/api/events", json=payload, headers=headers)
    assert resp.status_code == 422
    assert "exceeds" in resp.json()["detail"].lower()


def test_oversized_request_fails_413(client, db_session):
    """Verify requests with Content-Length larger than max allowed early return 413."""
    cl, raw_key = _setup_client_and_template(db_session)
    headers = {
        "X-API-Key": raw_key,
        "Content-Length": "9000000",  # 9 MB > allowed total (5MB * 1.4 + 1MB = 8MB)
    }
    payload = {
        "event_type": "report_email",
        "email": "recipient@example.com",
        "data": {"name": "Alice"},
    }
    resp = client.post("/api/events", json=payload, headers=headers)
    assert resp.status_code == 413


def test_sensitive_event_type_refuses_attachments_422(client, db_session):
    """Verify sensitive event types refuse attachments with 422."""
    cl, raw_key = _setup_client_and_template(db_session, event_type="auth_otp", sensitive=True)
    headers = {"X-API-Key": raw_key}
    payload = {
        "event_type": "auth_otp",
        "email": "recipient@example.com",
        "data": {"name": "Alice"},
        "attachments": [
            {
                "filename": "code.pdf",
                "content_type": "application/pdf",
                "content_base64": VALID_PDF_B64,
            }
        ],
    }
    resp = client.post("/api/events", json=payload, headers=headers)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "Sensitive emails cannot have attachments"


def test_idempotency_same_key_and_file_returns_200_and_single_row(client, db_session):
    """Verify same idempotency key and file re-returns existing result without duplicating rows."""
    cl, raw_key = _setup_client_and_template(db_session)
    headers = {"X-API-Key": raw_key, "Idempotency-Key": f"k_idem_{uuid.uuid4().hex[:8]}"}
    payload = {
        "event_type": "report_email",
        "email": "recipient@example.com",
        "data": {"name": "Alice"},
        "attachments": [
            {
                "filename": "report.pdf",
                "content_type": "application/pdf",
                "content_base64": VALID_PDF_B64,
            }
        ],
    }

    # 1. First send -> 202
    resp1 = client.post("/api/events", json=payload, headers=headers)
    assert resp1.status_code == 202
    del_id = resp1.json()["delivery"]["id"]

    # 2. Second send with identical key & file -> 200 Replay
    resp2 = client.post("/api/events", json=payload, headers=headers)
    assert resp2.status_code == 200
    assert resp2.json()["delivery"]["id"] == del_id
    assert resp2.json()["attachment_count"] == 1

    # Verify only one attachment row exists
    att_count = db_session.query(DeliveryAttachment).filter(DeliveryAttachment.delivery_id == uuid.UUID(del_id)).count()
    assert att_count == 1


def test_idempotency_same_key_different_file_fails_409(client, db_session):
    """Verify same key with a different attachment content returns 409 Conflict."""
    cl, raw_key = _setup_client_and_template(db_session)
    headers = {"X-API-Key": raw_key, "Idempotency-Key": f"k_idem_{uuid.uuid4().hex[:8]}"}

    file1 = b"%PDF-1.4\nfile1_content\n%%EOF"
    file2 = b"%PDF-1.4\nfile2_different_content\n%%EOF"

    payload1 = {
        "event_type": "report_email",
        "email": "recipient@example.com",
        "data": {"name": "Alice"},
        "attachments": [
            {
                "filename": "report.pdf",
                "content_type": "application/pdf",
                "content_base64": base64.b64encode(file1).decode("ascii"),
            }
        ],
    }
    payload2 = {
        "event_type": "report_email",
        "email": "recipient@example.com",
        "data": {"name": "Alice"},
        "attachments": [
            {
                "filename": "report.pdf",
                "content_type": "application/pdf",
                "content_base64": base64.b64encode(file2).decode("ascii"),
            }
        ],
    }

    resp1 = client.post("/api/events", json=payload1, headers=headers)
    assert resp1.status_code == 202

    resp2 = client.post("/api/events", json=payload2, headers=headers)
    assert resp2.status_code == 409


def test_opted_out_recipient_stores_no_bytes(client, db_session):
    """Verify opted-out recipients get skipped deliveries storing no attachment bytes."""
    cl, raw_key = _setup_client_and_template(db_session, event_type="marketing")
    rec = Recipient(client_id=cl.id, email="optout@example.com", name="Opted Out User")
    db_session.add(rec)
    db_session.flush()

    pref = Preference(
        recipient_id=rec.id,
        event_type="marketing",
        enabled=False,
    )
    db_session.add(pref)
    db_session.commit()

    headers = {"X-API-Key": raw_key}
    payload = {
        "event_type": "marketing",
        "recipient_id": str(rec.id),
        "data": {"name": "OptedOut"},
        "attachments": [
            {
                "filename": "brochure.pdf",
                "content_type": "application/pdf",
                "content_base64": VALID_PDF_B64,
            }
        ],
    }

    resp = client.post("/api/events", json=payload, headers=headers)
    assert resp.status_code == 202
    del_id = uuid.UUID(resp.json()["delivery"]["id"])

    # Check delivery is skipped
    deliv = db_session.query(Delivery).filter(Delivery.id == del_id).first()
    assert deliv.status == "skipped"

    # Check attachment row has no bytes stored
    att = db_session.query(DeliveryAttachment).filter(DeliveryAttachment.delivery_id == del_id).first()
    assert att is not None
    assert att.content is None
    assert att.content_removed_at is not None
    assert att.size_bytes == len(VALID_PDF_BYTES)


def test_smtp_provider_mime_attachment_formatting(monkeypatch):
    """Verify SMTP provider builds MIME message containing attachment with correct name and type."""
    captured_messages = []

    class MockSMTP:
        def __init__(self, host, port, timeout):
            pass
        def __enter__(self):
            return self
        def __exit__(self, exc_type, exc_val, exc_tb):
            pass
        def send_message(self, msg):
            captured_messages.append(msg)

    import smtplib
    monkeypatch.setattr(smtplib, "SMTP", MockSMTP)

    provider = SmtpEmailProvider()
    attachment = Attachment(
        filename="report.pdf",
        content_type="application/pdf",
        bytes=VALID_PDF_BYTES,
    )
    res = provider.send(
        to="user@example.com",
        subject="Monthly Report",
        body="See attached PDF",
        message_id="msg_123",
        attachments=[attachment],
    )

    assert res.outcome == ProviderOutcome.SUCCESS
    assert len(captured_messages) == 1
    msg = captured_messages[0]

    # Decode and inspect MIME message parts
    raw_mime = msg.as_bytes()
    parsed_msg = message_from_bytes(raw_mime)

    attachments_found = []
    for part in parsed_msg.walk():
        if part.get_content_disposition() == "attachment" or part.get_filename():
            attachments_found.append({
                "filename": part.get_filename(),
                "content_type": part.get_content_type(),
                "payload": part.get_payload(decode=True),
            })

    assert len(attachments_found) == 1
    assert attachments_found[0]["filename"] == "report.pdf"
    assert attachments_found[0]["content_type"] == "application/pdf"
    assert attachments_found[0]["payload"] == VALID_PDF_BYTES


def test_sendgrid_payload_attachments_array():
    """Verify SendGrid provider formats attachments array with base64 content, type, filename and disposition."""
    sent_payload = {}

    def mock_sendgrid_transport(request: httpx.Request):
        import json
        nonlocal sent_payload
        sent_payload = json.loads(request.content.decode("utf-8"))
        return httpx.Response(status_code=202, headers={"X-Message-Id": "sg_msg_123"})

    mock_client = httpx.Client(transport=httpx.MockTransport(mock_sendgrid_transport))
    provider = SendgridEmailProvider(
        api_key="SG.test_mock_key",
        from_email="noreply@notifyhub.local",
        client=mock_client,
    )

    attachment = Attachment(
        filename="invoice.pdf",
        content_type="application/pdf",
        bytes=VALID_PDF_BYTES,
    )

    res = provider.send(
        to="client@example.com",
        subject="Invoice",
        body="Your invoice is attached",
        message_id="del_999",
        attachments=[attachment],
    )

    assert res.outcome == ProviderOutcome.SUCCESS
    assert "attachments" in sent_payload
    sg_att = sent_payload["attachments"][0]
    assert sg_att["filename"] == "invoice.pdf"
    assert sg_att["type"] == "application/pdf"
    assert sg_att["content"] == VALID_PDF_B64
    assert sg_att["disposition"] == "attachment"


def test_attachment_bytes_lifecycle_sent_expired_dead(db_session):
    """Verify bytes are wiped when sent/expired, kept for dead deliveries."""
    client = Client(name=f"LifecycleClient_{uuid.uuid4().hex[:6]}", status="active", rate_limit_per_sec=50)
    db_session.add(client)
    db_session.flush()

    evt = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"k_{uuid.uuid4().hex}",
        request_hash="hash",
        event_type="test",
        recipient_email="u@e.com",
        data={},
    )
    db_session.add(evt)
    db_session.flush()

    # 1. Delivery that succeeds -> bytes removed
    deliv_sent = Delivery(
        client_id=client.id,
        event_id=evt.id,
        to_email="u@e.com",
        status="queued",
        priority=1,
        retry_schedule=[10],
        attempt_count=0,
        rendered_subject="Subj",
        rendered_body="Body",
    )
    db_session.add(deliv_sent)
    db_session.flush()
    att_sent = DeliveryAttachment(
        delivery_id=deliv_sent.id,
        filename="sent.pdf",
        content_type="application/pdf",
        size_bytes=len(VALID_PDF_BYTES),
        content=VALID_PDF_BYTES,
    )
    db_session.add(att_sent)
    db_session.commit()

    fake_success = FakeEmailProvider(outcome=ProviderOutcome.SUCCESS)
    process_single_delivery(db_session, deliv_sent, fake_success)

    db_session.refresh(deliv_sent)
    db_session.refresh(att_sent)
    assert deliv_sent.status == "sent"
    assert att_sent.content is None
    assert att_sent.content_removed_at is not None

    # 2. Delivery that expires -> bytes removed
    deliv_exp = Delivery(
        client_id=client.id,
        event_id=evt.id,
        to_email="u@e.com",
        status="queued",
        priority=1,
        retry_schedule=[10],
        attempt_count=0,
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=10),
        rendered_subject="Subj",
        rendered_body="Body",
    )
    db_session.add(deliv_exp)
    db_session.flush()
    att_exp = DeliveryAttachment(
        delivery_id=deliv_exp.id,
        filename="exp.pdf",
        content_type="application/pdf",
        size_bytes=len(VALID_PDF_BYTES),
        content=VALID_PDF_BYTES,
    )
    db_session.add(att_exp)
    db_session.commit()

    process_single_delivery(db_session, deliv_exp, fake_success)
    db_session.refresh(deliv_exp)
    db_session.refresh(att_exp)
    assert deliv_exp.status == "expired"
    assert att_exp.content is None
    assert att_exp.content_removed_at is not None

    # 3. Delivery that fails permanently -> becomes dead, bytes KEPT
    deliv_dead = Delivery(
        client_id=client.id,
        event_id=evt.id,
        to_email="u@e.com",
        status="queued",
        priority=1,
        retry_schedule=[10],
        attempt_count=0,
        rendered_subject="Subj",
        rendered_body="Body",
    )
    db_session.add(deliv_dead)
    db_session.flush()
    att_dead = DeliveryAttachment(
        delivery_id=deliv_dead.id,
        filename="dead.pdf",
        content_type="application/pdf",
        size_bytes=len(VALID_PDF_BYTES),
        content=VALID_PDF_BYTES,
    )
    db_session.add(att_dead)
    db_session.commit()

    fake_fail = FakeEmailProvider(outcome=ProviderOutcome.PERMANENT_ERROR, error_message="Fatal error")
    process_single_delivery(db_session, deliv_dead, fake_fail)
    db_session.refresh(deliv_dead)
    db_session.refresh(att_dead)
    assert deliv_dead.status == "dead"
    assert att_dead.content == VALID_PDF_BYTES  # Bytes kept for dead deliveries!


def test_reaper_purges_dead_deliveries_and_retry_returns_409(client, db_session):
    """Verify reaper purges dead delivery attachments older than retention days, and retry returns 409."""
    cl, raw_key = _setup_client_and_template(db_session)
    headers = {"X-API-Key": raw_key}

    evt = NotificationEvent(
        client_id=cl.id,
        idempotency_key=f"k_{uuid.uuid4().hex}",
        request_hash="hash",
        event_type="report_email",
        recipient_email="u@e.com",
        data={},
    )
    db_session.add(evt)
    db_session.flush()

    old_date = datetime.now(timezone.utc) - timedelta(days=settings.ATTACHMENT_RETENTION_DAYS + 1)
    deliv = Delivery(
        client_id=cl.id,
        event_id=evt.id,
        to_email="u@e.com",
        status="dead",
        priority=1,
        retry_schedule=[10],
        attempt_count=1,
        rendered_subject="Subj",
        rendered_body="Body",
        created_at=old_date,
    )
    db_session.add(deliv)
    db_session.flush()

    att = DeliveryAttachment(
        delivery_id=deliv.id,
        filename="old_report.pdf",
        content_type="application/pdf",
        size_bytes=len(VALID_PDF_BYTES),
        content=VALID_PDF_BYTES,
        created_at=old_date,
    )
    db_session.add(att)
    db_session.commit()

    # Run reaper
    reaped = reap_stuck_deliveries(db_session)
    db_session.refresh(att)
    assert att.content is None
    assert att.content_removed_at is not None

    # Retry purged delivery -> 409 "The attachment has expired. Send a new event."
    retry_resp = client.post(f"/api/deliveries/{deliv.id}/retry", headers=headers)
    assert retry_resp.status_code == 409
    assert retry_resp.json()["detail"] == "The attachment has expired. Send a new event."


def test_logs_never_contain_filenames_or_content(caplog, db_session):
    """Verify logs contain delivery id, count, and size, but NEVER filenames or attachment content."""
    client = Client(name=f"LogClient_{uuid.uuid4().hex[:6]}", status="active", rate_limit_per_sec=50)
    db_session.add(client)
    db_session.flush()

    evt = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"k_{uuid.uuid4().hex}",
        request_hash="hash",
        event_type="test",
        recipient_email="u@e.com",
        data={},
    )
    db_session.add(evt)
    db_session.flush()

    deliv = Delivery(
        client_id=client.id,
        event_id=evt.id,
        to_email="u@e.com",
        status="queued",
        priority=1,
        retry_schedule=[10],
        attempt_count=0,
        rendered_subject="Subj",
        rendered_body="Body",
    )
    db_session.add(deliv)
    db_session.flush()

    secret_filename = "classified_confidential_topsecret_2026.pdf"
    att = DeliveryAttachment(
        delivery_id=deliv.id,
        filename=secret_filename,
        content_type="application/pdf",
        size_bytes=len(VALID_PDF_BYTES),
        content=VALID_PDF_BYTES,
    )
    db_session.add(att)
    db_session.commit()

    fake_provider = FakeEmailProvider(outcome=ProviderOutcome.SUCCESS)

    with caplog.at_level("INFO"):
        process_single_delivery(db_session, deliv, fake_provider)

    log_output = caplog.text
    assert secret_filename not in log_output
    assert str(VALID_PDF_BYTES) not in log_output
    assert str(deliv.id) in log_output
