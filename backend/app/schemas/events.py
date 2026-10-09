"""Pydantic schemas for event intake and event inspection."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class AttachmentInput(BaseModel):
    filename: str
    content_type: str
    content_base64: str


class EventCreate(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=100, description="Type of event (e.g. order_shipped, auth_otp)")
    recipient_id: Optional[uuid.UUID] = Field(None, description="Registered recipient UUID")
    email: Optional[str] = Field(
        None,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
        description="Direct recipient email address",
    )
    send_at: Optional[datetime] = Field(
        None,
        description="Optional scheduled time in ISO 8601 with timezone",
    )
    data: dict[str, Any] = Field(default_factory=dict, description="Variables for template rendering")
    attachments: Optional[list[AttachmentInput]] = Field(None, description="Optional list of attachments")

    @field_validator("send_at")
    @classmethod
    def validate_send_at(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is None:
            return None
        # Must include timezone
        if v.tzinfo is None:
            raise ValueError("send_at must include a timezone offset (e.g. ISO 8601 with 'Z' or '+00:00')")
        now_utc = datetime.now(timezone.utc)
        v_utc = v.astimezone(timezone.utc)
        # More than 1 minute in the past = 422
        if v_utc < now_utc - timedelta(minutes=1):
            raise ValueError("send_at cannot be more than 1 minute in the past")
        # More than 30 days ahead = 422
        if v_utc > now_utc + timedelta(days=30):
            raise ValueError("send_at cannot be more than 30 days in the future")
        return v_utc

    @model_validator(mode="after")
    def check_recipient_xor_email(self) -> "EventCreate":
        has_recipient = self.recipient_id is not None
        has_email = bool(self.email)
        if (has_recipient and has_email) or (not has_recipient and not has_email):
            raise ValueError("Event must have exactly one of recipient_id or email")
        return self


class DeliverySummary(BaseModel):
    id: uuid.UUID
    status: str
    priority: int
    expires_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class EventIntakeResponse(BaseModel):
    event_id: uuid.UUID
    send_at: Optional[datetime] = None
    delivery: DeliverySummary
    attachment_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class DeliveryAttemptDetail(BaseModel):
    attempt_no: int
    outcome: str
    error_message: Optional[str]
    latency_ms: Optional[int]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DeliveryAttachmentSummary(BaseModel):
    filename: str
    content_type: str
    size_bytes: int
    available: bool

    model_config = ConfigDict(from_attributes=True)


class DeliveryDetail(BaseModel):
    id: uuid.UUID
    to_email: str
    status: str
    priority: int
    expires_at: Optional[datetime]
    retry_schedule: list[int]
    sensitive: bool
    attempt_count: int
    next_attempt_at: Optional[datetime]
    rendered_subject: str
    rendered_body: str
    last_error: Optional[str]
    provider: Optional[str] = None
    provider_message_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    attempts: list[DeliveryAttemptDetail] = Field(default_factory=list)
    attachments: list[DeliveryAttachmentSummary] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class EventDetailResponse(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    idempotency_key: str
    event_type: str
    recipient_id: Optional[uuid.UUID]
    recipient_email: Optional[str]
    send_at: Optional[datetime] = None
    data: dict[str, Any]
    created_at: datetime
    delivery: Optional[DeliveryDetail] = None

    model_config = ConfigDict(from_attributes=True)
