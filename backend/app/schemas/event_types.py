"""Event type settings request and response Pydantic schemas."""

import uuid
from datetime import datetime
from typing import Optional, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator


class EventTypeSettingUpsert(BaseModel):
    # Allows "high", "normal", "low" or integer 2, 1, 0
    priority: Union[str, int] = Field(
        default="normal",
        description="Priority level: 'high' (2), 'normal' (1), or 'low' (0)",
    )
    ttl_seconds: Optional[int] = Field(
        None, ge=1, description="Optional time-to-live expiration window in seconds"
    )
    retry_schedule: list[int] = Field(
        default_factory=lambda: [5, 10, 20, 40],
        description="List of retry intervals in seconds (must be positive numbers)",
    )
    respect_opt_out: bool = Field(
        default=True, description="Whether to honor recipient opt-out preferences"
    )
    sensitive: bool = Field(
        default=False, description="Whether event contains sensitive/OTP data"
    )

    @field_validator("priority")
    @classmethod
    def validate_and_convert_priority(cls, v: Union[str, int]) -> int:
        if isinstance(v, str):
            v_lower = v.strip().lower()
            mapping = {"high": 2, "normal": 1, "low": 0}
            if v_lower in mapping:
                return mapping[v_lower]
            try:
                val = int(v_lower)
            except ValueError:
                raise ValueError("Priority must be 'high', 'normal', 'low', or an integer (2, 1, 0)")
        else:
            val = v

        if val not in (0, 1, 2):
            raise ValueError("Priority number must be 2 (high), 1 (normal), or 0 (low)")
        return val

    @field_validator("retry_schedule")
    @classmethod
    def validate_retry_schedule(cls, v: list[int]) -> list[int]:
        if not v:
            raise ValueError("retry_schedule cannot be empty")
        for num in v:
            if num <= 0:
                raise ValueError("All retry schedule intervals must be positive integers")
        return v


class EventTypeSettingResponse(BaseModel):
    id: uuid.UUID
    client_id: uuid.UUID
    event_type: str
    priority: int
    ttl_seconds: Optional[int]
    retry_schedule: list[int]
    respect_opt_out: bool
    sensitive: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
