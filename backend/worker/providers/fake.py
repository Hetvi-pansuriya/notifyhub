"""Fake email provider for testing worker dispatches and provider outcomes."""

from typing import Optional
from worker.providers.base import Attachment, BaseEmailProvider, ProviderOutcome, ProviderResult


class FakeEmailProvider(BaseEmailProvider):
    provider_name: str = "fake"

    def __init__(self, outcome: ProviderOutcome = ProviderOutcome.SUCCESS, error_message: Optional[str] = None):
        self.outcome = outcome
        self.error_message = error_message
        self.sent_messages: list[dict] = []

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
        self.sent_messages.append({
            "to": to,
            "subject": subject,
            "body": body,
            "message_id": message_id,
            "from_name": from_name,
            "reply_to": reply_to,
            "attachments": attachments or [],
            **kwargs,
        })
        return ProviderResult(
            outcome=self.outcome,
            error_message=self.error_message,
            provider_message_id=f"fake_{message_id}",
            provider_response="250 OK",
        )
