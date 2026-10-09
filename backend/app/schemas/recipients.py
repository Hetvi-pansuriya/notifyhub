"""Recipient request and response Pydantic schemas."""

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class RecipientUpsert(BaseModel):
    name: Optional[str] = Field(None, max_length=255, description="Recipient full name")
    email: str = Field(
        ...,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
        max_length=255,
        description="Recipient email address",
    )


class RecipientPreferenceUpdate(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=100, description="Event type name")
    enabled: bool = Field(..., description="True to opt-in, False to opt-out")


class PreferenceResponse(BaseModel):
    event_type: str
    enabled: bool

    model_config = ConfigDict(from_attributes=True)


class RecipientResponse(BaseModel):
    id: uuid.UUID
    external_id: Optional[str]
    name: Optional[str]
    email: str
    opt_outs: list[str] = Field(
        default_factory=list,
        description="List of event types for which the recipient has opted out",
    )
    preferences: list[PreferenceResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
