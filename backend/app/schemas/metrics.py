"""Pydantic schemas for delivery metrics."""

import uuid
from typing import Optional
from pydantic import BaseModel


class StatusCounts(BaseModel):
    queued: int = 0
    processing: int = 0
    sent: int = 0
    dead: int = 0
    skipped: int = 0
    expired: int = 0


class MetricsResponse(BaseModel):
    client_id: Optional[uuid.UUID] = None
    status_counts: StatusCounts
    queue_depth: int
    finished: int
    success_rate: float
