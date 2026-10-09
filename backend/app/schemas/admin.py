"""Admin request and response Pydantic schemas."""

from datetime import datetime
from typing import Any, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field


class ClientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Tenant client application name")
    rate_limit_per_sec: Optional[int] = Field(
        None, ge=1, le=10000, description="Rate limit requests per second"
    )


class ClientUpdate(BaseModel):
    status: Optional[str] = Field(
        None, pattern="^(active|disabled)$", description="Client status: active or disabled"
    )
    plan_id: Optional[uuid.UUID] = Field(None, description="Assigned plan ID")
    rate_limit_per_sec: Optional[int] = Field(
        None, ge=1, le=10000, description="Rate limit requests per second"
    )
    daily_email_limit: Optional[int] = Field(
        None, ge=1, le=1000, description="Daily email sending limit (1 to 1000)"
    )


class ClientResponse(BaseModel):
    """Client details returned in listings - never includes raw key or hash."""
    id: uuid.UUID
    name: str
    from_name: Optional[str] = None
    reply_to_email: Optional[str] = None
    daily_email_limit: int = 30
    status: str
    rate_limit_per_sec: int
    plan_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ClientListItem(BaseModel):
    """Client row for admin clients table."""
    id: uuid.UUID
    name: str
    owner_email: Optional[str] = None
    plan: Optional[str] = None
    status: str
    emails_this_month: int = 0
    failed_now: int = 0
    created_at: datetime


class ClientCreateResponse(BaseModel):
    """Response returned upon creation, displaying the full API key ONCE."""
    id: uuid.UUID
    name: str
    from_name: Optional[str] = None
    reply_to_email: Optional[str] = None
    daily_email_limit: int = 30
    api_key: str
    api_key_prefix: str
    status: str
    rate_limit_per_sec: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class KeyRotateResponse(BaseModel):
    """Response returned upon key rotation, displaying the new API key ONCE."""
    id: uuid.UUID
    name: str
    api_key: str
    api_key_prefix: str

    model_config = ConfigDict(from_attributes=True)


class PlanCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    monthly_email_limit: int = Field(10000, ge=1)
    daily_email_limit: int = Field(30, ge=1)
    rate_limit_per_sec: int = Field(50, ge=1)


class PlanUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    monthly_email_limit: Optional[int] = Field(None, ge=1)
    daily_email_limit: Optional[int] = Field(None, ge=1)
    rate_limit_per_sec: Optional[int] = Field(None, ge=1)


class PlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    monthly_email_limit: int
    daily_email_limit: int
    rate_limit_per_sec: int
    created_at: datetime
    clients_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


class AuditLogRow(BaseModel):
    id: uuid.UUID
    at: datetime
    created_at: Optional[datetime] = None
    actor_email: str
    action: str
    client_id: Optional[uuid.UUID] = None
    client_name: Optional[str] = None
    detail: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
