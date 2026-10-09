"""Schemas for console authentication (signup, login, me)."""

import uuid
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SignupRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=80, description="Company or client tenant name")
    email: EmailStr = Field(..., description="Owner account email address")
    password: str = Field(..., min_length=10, max_length=128, description="Account password (10-128 chars)")


class LoginRequest(BaseModel):
    email: str = Field(..., description="Account email address")
    password: str = Field(..., description="Account password")


class UserSummaryResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: Optional[str] = None
    role: str

    model_config = ConfigDict(from_attributes=True)


class ClientSummaryResponse(BaseModel):
    id: uuid.UUID
    name: str
    from_name: str
    reply_to_email: Optional[str] = None
    daily_email_limit: int = 30
    status: str

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    user: UserSummaryResponse
    client: Optional[ClientSummaryResponse] = None

    model_config = ConfigDict(from_attributes=True)
