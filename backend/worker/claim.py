"""Delivery claim logic using PostgreSQL FOR UPDATE SKIP LOCKED in a single query."""

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import Delivery


def claim_deliveries(db: Session, batch_size: int = 10) -> list[Delivery]:
    """Atomically claims up to `batch_size` queued deliveries ordered by priority DESC.
    
    Uses a single SQL statement:
    UPDATE deliveries SET status='processing', locked_until=now()+interval '60 seconds'
    WHERE id IN (SELECT id FROM deliveries WHERE status='queued' AND next_attempt_at<=now()
    ORDER BY priority DESC, next_attempt_at ASC LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING id.
    """
    claim_sql = text("""
        UPDATE deliveries
        SET status = 'processing',
            locked_until = now() + interval '60 seconds',
            updated_at = now()
        WHERE id IN (
            SELECT id
            FROM deliveries
            WHERE status = 'queued'
              AND (next_attempt_at IS NULL OR next_attempt_at <= now())
            ORDER BY priority DESC, next_attempt_at ASC
            LIMIT :batch_size
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id;
    """)

    result = db.execute(claim_sql, {"batch_size": batch_size})
    claimed_ids = [row[0] for row in result.fetchall()]

    if not claimed_ids:
        db.commit()
        return []

    db.commit()

    # Retrieve ORM objects for processing
    deliveries = (
        db.query(Delivery)
        .filter(Delivery.id.in_(claimed_ids))
        .order_by(Delivery.priority.desc(), Delivery.next_attempt_at.asc())
        .all()
    )
    return deliveries
