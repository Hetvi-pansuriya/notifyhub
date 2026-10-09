"""SMTP provider implementation with outcome classification."""

import smtplib
import socket
from email.message import EmailMessage
from typing import Optional

from app.config import settings
from worker.providers.base import BaseEmailProvider, ProviderOutcome, ProviderResult


class SmtpEmailProvider(BaseEmailProvider):
    """SMTP email provider sending via smtplib with timeout and classification."""
    provider_name: str = "smtp"

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        from_email: Optional[str] = None,
        timeout: float = 10.0,
    ):
        self.host = host or settings.SMTP_HOST
        self.port = port or settings.SMTP_PORT
        self.from_email = from_email or settings.FROM_EMAIL or settings.SMTP_FROM
        self.timeout = timeout

    def send(
        self,
        to: str = "",
        subject: str = "",
        body: str = "",
        message_id: str = "",
        from_name: str = "NotifyHub",
        reply_to: Optional[str] = None,
        **kwargs,
    ) -> ProviderResult:
        to_email = to or kwargs.get("to_email", "")
        body_text = body or kwargs.get("body_text", "")

        msg = EmailMessage()
        msg["From"] = f'"{from_name} via NotifyHub" <{self.from_email}>'
        msg["To"] = to_email
        msg["Subject"] = subject
        msg["Message-ID"] = f"<{message_id}@notifyhub.local>"
        if reply_to:
            msg["Reply-To"] = reply_to
        msg.set_content(body_text)

        body_html = kwargs.get("body_html")
        if body_html:
            msg.add_alternative(body_html, subtype="html")

        try:
            with smtplib.SMTP(host=self.host, port=self.port, timeout=self.timeout) as server:
                server.send_message(msg)
                return ProviderResult(
                    outcome=ProviderOutcome.SUCCESS,
                    provider_message_id=str(message_id),
                    provider_response="250 Message accepted for delivery",
                )

        except (socket.timeout, TimeoutError) as e:
            return ProviderResult(
                outcome=ProviderOutcome.TEMPORARY_ERROR,
                error_message=f"SMTP connection timeout: {str(e)}",
            )
        except (ConnectionRefusedError, smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError) as e:
            return ProviderResult(
                outcome=ProviderOutcome.TEMPORARY_ERROR,
                error_message=f"SMTP connection failed/refused: {str(e)}",
            )
        except smtplib.SMTPResponseException as e:
            code = e.smtp_code
            error_msg = f"SMTP error ({code}): {e.smtp_error.decode('utf-8', errors='replace') if isinstance(e.smtp_error, bytes) else str(e.smtp_error)}"
            if 400 <= code < 500:
                return ProviderResult(
                    outcome=ProviderOutcome.TEMPORARY_ERROR,
                    error_message=error_msg,
                )
            else:
                return ProviderResult(
                    outcome=ProviderOutcome.PERMANENT_ERROR,
                    error_message=error_msg,
                )
        except smtplib.SMTPRecipientsRefused as e:
            return ProviderResult(
                outcome=ProviderOutcome.PERMANENT_ERROR,
                error_message=f"SMTP recipient refused: {str(e)}",
            )
        except Exception as e:
            return ProviderResult(
                outcome=ProviderOutcome.TEMPORARY_ERROR,
                error_message=f"Unexpected SMTP error: {str(e)}",
            )
