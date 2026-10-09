"""Email provider implementations package."""

from app.config import settings
from worker.providers.base import BaseEmailProvider, ProviderOutcome, ProviderResult
from worker.providers.smtp import SmtpEmailProvider


def get_provider() -> BaseEmailProvider:
    """Factory choosing provider from settings.MAIL_PROVIDER."""
    provider_name = (settings.MAIL_PROVIDER or "smtp").lower()
    if provider_name == "sendgrid":
        from worker.providers.sendgrid import SendgridEmailProvider
        return SendgridEmailProvider()
    elif provider_name == "smtp":
        return SmtpEmailProvider()
    else:
        raise ValueError(f"Unknown MAIL_PROVIDER: '{settings.MAIL_PROVIDER}'. Expected 'smtp' or 'sendgrid'.")
