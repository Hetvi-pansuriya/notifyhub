"""Application configuration using Pydantic Settings."""

from typing import Optional
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://notifyhub:notifyhub_secret@localhost:5433/notifyhub_db"

    # Security & Admin Keys
    ADMIN_KEY: str = "admin_master_secret_key_12345"
    HMAC_SECRET: str = "notifyhub_hmac_secret_token_67890"

    # SMTP Configuration
    SMTP_HOST: str = "mailhog"
    SMTP_PORT: int = 1025
    SMTP_FROM: str = "no-reply@notifyhub.local"

    # Mail Provider Configuration
    MAIL_PROVIDER: str = "smtp"
    SENDGRID_API_KEY: Optional[str] = None
    FROM_EMAIL: Optional[str] = None
    GLOBAL_DAILY_LIMIT: int = 90
    DEMO_ALLOWED_RECIPIENTS: Optional[str] = None

    # Plan Configuration
    DEFAULT_PLAN_NAME: str = "Starter"
    DEFAULT_PLAN_MONTHLY_LIMIT: int = 10000

    # Rate Limiting & Queue Timing Configuration
    DEFAULT_RATE_LIMIT_PER_SEC: int = 50
    OUTGOING_RATE_PER_SEC: int = 20
    WORKER_POLL_SECONDS: int = 1
    LOCK_SECONDS: int = 60
    REAPER_SECONDS: int = 30

    # Session & Authentication Configuration
    SESSION_DAYS: int = 7
    COOKIE_NAME: str = "nh_session"
    COOKIE_SECURE: bool = False
    MAX_ACTIVE_KEYS: int = 5
    LOGIN_MAX_ATTEMPTS: int = 10
    LOGIN_WINDOW_MINUTES: int = 15
    ADMIN_EMAIL: str = "admin@notifyhub.local"
    ADMIN_PASSWORD: str = "AdminSecretPass123!"

    # Attachment Configuration
    ATTACHMENT_MAX_COUNT: int = 3
    ATTACHMENT_MAX_TOTAL_MB: int = 5
    ATTACHMENT_ALLOWED_TYPES: str = "application/pdf"
    ATTACHMENT_RETENTION_DAYS: int = 7

    @model_validator(mode="after")
    def validate_sendgrid_config(self) -> "Settings":
        if self.MAIL_PROVIDER.lower() == "sendgrid":
            missing = []
            if not self.SENDGRID_API_KEY or not self.SENDGRID_API_KEY.strip():
                missing.append("SENDGRID_API_KEY")
            if not self.FROM_EMAIL or not self.FROM_EMAIL.strip():
                missing.append("FROM_EMAIL")
            if missing:
                raise ValueError(
                    f"Invalid configuration: {', '.join(missing)} must be set when MAIL_PROVIDER=sendgrid"
                )
        return self

    @property
    def sender_email(self) -> str:
        """Returns effective sender email."""
        return self.FROM_EMAIL or self.SMTP_FROM or "no-reply@notifyhub.local"

    @property
    def sync_database_url(self) -> str:
        """Returns database URL guaranteed to use psycopg (v3) dialect."""
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql+psycopg2://"):
            return url.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
        return url

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
