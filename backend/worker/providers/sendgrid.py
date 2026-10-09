import base64
import logging
from typing import Optional
import httpx

from app.config import settings
from worker.providers.base import Attachment, BaseEmailProvider, ProviderOutcome, ProviderResult

logger = logging.getLogger("worker.providers.sendgrid")


class SendgridEmailProvider(BaseEmailProvider):
    """SendGrid v3 Mail Send provider using httpx.

    Security & Privacy Rules:
    - Never logs SendGrid API key, email subjects, bodies, or OTP data.
    - Logs delivery IDs and HTTP status codes only.
    """
    provider_name: str = "sendgrid"

    def __init__(
        self,
        api_key: Optional[str] = None,
        from_email: Optional[str] = None,
        timeout: float = 10.0,
        client: Optional[httpx.Client] = None,
    ):
        self.api_key = api_key or settings.SENDGRID_API_KEY or ""
        self.from_email = from_email or settings.FROM_EMAIL or ""
        self.timeout = timeout
        self._client = client

    def _extract_error(self, response: httpx.Response) -> str:
        """Extracts SendGrid's error message without logging or leaking email body."""
        try:
            data = response.json()
            if isinstance(data, dict) and "errors" in data and isinstance(data["errors"], list):
                msgs = [
                    err.get("message", "")
                    for err in data["errors"]
                    if isinstance(err, dict) and err.get("message")
                ]
                if msgs:
                    return "; ".join(msgs)
        except Exception:
            pass
        return response.text[:200]

    def send(
        self,
        to: str = "",
        subject: str = "",
        body: str = "",
        message_id: str = "",
        from_name: str = "NotifyHub",
        reply_to: Optional[str] = None,
        attachments: Optional[list[Attachment]] = None,
        **kwargs,
    ) -> ProviderResult:
        to_email = to or kwargs.get("to_email", "")
        body_text = body or kwargs.get("body_text", "")

        url = "https://api.sendgrid.com/v3/mail/send"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "personalizations": [
                {
                    "to": [{"email": to_email}],
                    "custom_args": {
                        "delivery_id": str(message_id),
                    },
                }
            ],
            "from": {
                "email": self.from_email,
                "name": f"{from_name} via NotifyHub",
            },
            "subject": subject,
            "content": [
                {
                    "type": "text/plain",
                    "value": body_text,
                }
            ],
            "tracking_settings": {
                "click_tracking": {
                    "enable": False,
                    "enable_text": False,
                },
                "open_tracking": {
                    "enable": False,
                },
            },
        }

        if reply_to:
            payload["reply_to"] = {"email": reply_to}

        if attachments:
            payload["attachments"] = [
                {
                    "content": base64.b64encode(att.bytes).decode("ascii"),
                    "type": att.content_type,
                    "filename": att.filename,
                    "disposition": "attachment",
                }
                for att in attachments
            ]

        try:
            if self._client is not None:
                response = self._client.post(url, json=payload, headers=headers)
            else:
                with httpx.Client(timeout=self.timeout) as client:
                    response = client.post(url, json=payload, headers=headers)
        except (httpx.TimeoutException, TimeoutError) as e:
            logger.warning("SendGrid request timeout for delivery_id=%s", message_id)
            return ProviderResult(
                outcome=ProviderOutcome.TEMPORARY_ERROR,
                error_message=f"SendGrid request timeout: {type(e).__name__}",
            )
        except httpx.RequestError as e:
            logger.warning("SendGrid connection error for delivery_id=%s: %s", message_id, type(e).__name__)
            return ProviderResult(
                outcome=ProviderOutcome.TEMPORARY_ERROR,
                error_message=f"SendGrid connection error: {str(e)}",
            )
        except Exception as e:
            logger.error("SendGrid unexpected error for delivery_id=%s: %s", message_id, type(e).__name__)
            return ProviderResult(
                outcome=ProviderOutcome.TEMPORARY_ERROR,
                error_message=f"Unexpected SendGrid error: {str(e)}",
            )

        status_code = response.status_code

        # 1. 202 = SUCCESS: store X-Message-Id header
        if status_code == 202:
            provider_msg_id = response.headers.get("X-Message-Id") or response.headers.get("x-message-id")
            logger.info("SendGrid dispatch successful for delivery_id=%s (status 202)", message_id)
            return ProviderResult(
                outcome=ProviderOutcome.SUCCESS,
                provider_message_id=provider_msg_id,
                provider_response="202 Accepted",
            )

        # 2. 401 or 403 = TEMPORARY with loud log line "SendGrid rejected the API key"
        if status_code in (401, 403):
            logger.error("SendGrid rejected the API key")
            return ProviderResult(
                outcome=ProviderOutcome.TEMPORARY_ERROR,
                error_message=f"SendGrid rejected the API key (status {status_code})",
            )

        # 3. 429 or 5xx = TEMPORARY
        if status_code == 429 or status_code >= 500:
            error_msg = self._extract_error(response)
            logger.warning("SendGrid temporary error for delivery_id=%s (status %s)", message_id, status_code)
            return ProviderResult(
                outcome=ProviderOutcome.TEMPORARY_ERROR,
                error_message=f"SendGrid temporary error ({status_code}): {error_msg}",
            )

        # 4. Other 4xx = PERMANENT with SendGrid's error message (no email body)
        error_msg = self._extract_error(response)
        logger.warning("SendGrid permanent error for delivery_id=%s (status %s)", message_id, status_code)
        return ProviderResult(
            outcome=ProviderOutcome.PERMANENT_ERROR,
            error_message=f"SendGrid permanent error ({status_code}): {error_msg}",
        )
