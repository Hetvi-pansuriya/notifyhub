"""Pydantic schemas for console client identity and settings."""

import re
import uuid
from typing import Optional
from pydantic import BaseModel, ConfigDict, field_validator

EMAIL_REGEX = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class ConsoleClientResponse(BaseModel):
    """Client identity and sending limits returned to console owner."""
    id: uuid.UUID
    name: str
    status: str
    from_name: str
    reply_to_email: Optional[str] = None
    daily_email_limit: int
    sent_today: int
    sender_email: str

    model_config = ConfigDict(from_attributes=True)


class ConsoleClientUpdate(BaseModel):
    """Payload to update client's sending identity."""
    from_name: str
    reply_to_email: Optional[str] = None

    @field_validator("from_name")
    @classmethod
    def validate_from_name(cls, v: str) -> str:
        # Header injection defense: reject CR or LF
        if "\r" in v or "\n" in v:
            raise ValueError("from_name must not contain carriage return or line feed characters")
        stripped = v.strip()
        if len(stripped) < 2 or len(stripped) > 60:
            raise ValueError("from_name must be between 2 and 60 characters")
        return stripped

    @field_validator("reply_to_email")
    @classmethod
    def validate_reply_to_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        if not stripped:
            return None
        if not re.match(EMAIL_REGEX, stripped):
            raise ValueError("reply_to_email must be a valid email address or null")
        return stripped
