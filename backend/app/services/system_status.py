"""System status telemetry recording and retrieval service."""

from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.models import SystemStatus


def set_system_status(db: Session, key: str, value: Optional[str] = None) -> None:
    """Upserts a system status key-value pair with updated_at timestamp."""
    try:
        status_row = db.query(SystemStatus).filter(SystemStatus.key == key).first()
        now = datetime.now(timezone.utc)
        if status_row is None:
            status_row = SystemStatus(key=key, value=value, updated_at=now)
            db.add(status_row)
        else:
            status_row.value = value
            status_row.updated_at = now
        db.commit()
    except Exception:
        db.rollback()


def get_system_status(db: Session, key: str) -> Optional[dict]:
    """Retrieves a single status entry."""
    row = db.query(SystemStatus).filter(SystemStatus.key == key).first()
    if not row:
        return None
    return {
        "key": row.key,
        "value": row.value,
        "updated_at": row.updated_at,
    }


def get_all_system_status(db: Session) -> dict[str, dict]:
    """Retrieves all system status rows mapped by key."""
    rows = db.query(SystemStatus).all()
    return {
        r.key: {
            "value": r.value,
            "updated_at": r.updated_at,
        }
        for r in rows
    }
