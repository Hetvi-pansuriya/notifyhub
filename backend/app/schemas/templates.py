"""Template request and response Pydantic schemas."""

import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class TemplateCreate(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=100, description="Target event type name")
    subject: str = Field(..., min_length=1, description="Jinja2 template for email subject")
    body: str = Field(..., min_length=1, description="Jinja2 template for email body")


class TemplateUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    status: Optional[str] = None


class TemplatePreview(BaseModel):
    subject: str = Field(..., min_length=1, description="Subject template string")
    body: str = Field(..., min_length=1, description="Body template string")
    sample_data: dict[str, Any] = Field(
        default_factory=dict, description="Variables to pass into the template"
    )


class TemplatePreviewResponse(BaseModel):
    rendered_subject: str
    rendered_body: str


class TemplateVariablesRequest(BaseModel):
    subject: str = Field(default="", description="Subject template string")
    body: str = Field(default="", description="Body template string")


class TemplateVariablesResponse(BaseModel):
    variables: list[str] = Field(default_factory=list)


class TemplateResponse(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    event_type: str
    version: int
    subject: str
    body: str
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
