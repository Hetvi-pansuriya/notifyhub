"""Email provider implementations package."""

from app.config import settings
from worker.providers.base import Attachment, BaseEmailProvider, ProviderOutcome, ProviderResult
from worker.providers.fake import FakeEmailProvider
from worker.providers.smtp import SmtpEmailProvider


def get_provider() -> BaseEmailProvider:
    """Factory choosing provider from settings.MAIL_PROVIDER."""
    provider_name = (settings.MAIL_PROVIDER or "smtp").lower()
    if provider_name == "sendgrid":
        from worker.providers.sendgrid import SendgridEmailProvider
        return SendgridEmailProvider()
    elif provider_name == "smtp":
        return SmtpEmailProvider()
    elif provider_name == "fake":
        return FakeEmailProvider()
    else:
        raise ValueError(f"Unknown MAIL_PROVIDER: '{settings.MAIL_PROVIDER}'. Expected 'smtp' or 'sendgrid'.")
