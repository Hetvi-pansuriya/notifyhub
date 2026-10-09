"""Delivery metrics aggregation logic."""

import uuid
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Delivery
from app.schemas.metrics import MetricsResponse, StatusCounts


def get_delivery_metrics(db: Session, client_id: Optional[uuid.UUID] = None) -> MetricsResponse:
    """Aggregates status counts, queue depth, and success rate for a client or globally."""
    query = db.query(Delivery.status, func.count(Delivery.id))
    if client_id is not None:
        query = query.filter(Delivery.client_id == client_id)

    rows = query.group_by(Delivery.status).all()
    counts = {row[0]: row[1] for row in rows}

    queued = counts.get("queued", 0)
    processing = counts.get("processing", 0)
    sent = counts.get("sent", 0)
    dead = counts.get("dead", 0)
    skipped = counts.get("skipped", 0)
    expired = counts.get("expired", 0)

    queue_depth = queued + processing
    finished = sent + dead + skipped + expired
    success_rate = round(sent / finished, 4) if finished > 0 else 0.0

    return MetricsResponse(
        client_id=client_id,
        status_counts=StatusCounts(
            queued=queued,
            processing=processing,
            sent=sent,
            dead=dead,
            skipped=skipped,
            expired=expired,
        ),
        queue_depth=queue_depth,
        finished=finished,
        success_rate=success_rate,
    )
