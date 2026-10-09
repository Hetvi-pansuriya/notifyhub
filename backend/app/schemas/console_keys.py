"""Schemas for console API key management."""

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=40, description="Display name for the API key")


class ApiKeyListItemResponse(BaseModel):
    id: uuid.UUID
    name: str
    key_prefix: str
    status: str
    created_at: datetime
    last_used_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ApiKeyCreateResponse(BaseModel):
    """Response returned when an API key is created - full key shown ONCE."""
    id: uuid.UUID
    name: str
    key_prefix: str
    status: str
    created_at: datetime
    last_used_at: Optional[datetime] = None
    api_key: str = Field(..., description="Full secret API key. Shown ONCE upon creation.")

    model_config = ConfigDict(from_attributes=True)


class ApiKeyRevokeResponse(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    revoked_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
