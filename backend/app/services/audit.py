"""Audit logging service for tracking administrative and client lifecycle actions."""

import json
from typing import Any, Optional
import uuid
from sqlalchemy.orm import Session

from app.models import AuditLog


def record_audit(
    db: Session,
    actor_email: str,
    action: str,
    client_id: Optional[uuid.UUID] = None,
    detail: Any = None,
) -> AuditLog:
    """Writes an immutable audit log entry. Never logs secrets."""
    detail_str = None
    if detail is not None:
        if isinstance(detail, (dict, list)):
            detail_str = json.dumps(detail)
        else:
            detail_str = str(detail)

    log_entry = AuditLog(
        actor_email=actor_email,
        action=action,
        client_id=client_id,
        detail=detail_str,
    )
    db.add(log_entry)
    db.flush()
    return log_entry
