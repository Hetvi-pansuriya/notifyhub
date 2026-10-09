"""Lock reaper: finds crashed/timed-out processing deliveries and returns them to queued or dead."""

import logging
import threading
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import Delivery
from worker.sender import redact_sensitive_delivery

logger = logging.getLogger("worker.reaper")


def reap_stuck_deliveries(db: Session) -> int:
    """Finds deliveries stuck in 'processing' where locked_until < now() and recovers them.

    - If expires_at <= now(): set to 'expired' (wiped if sensitive).
    - If attempts exhausted (attempt_count >= len(retry_schedule) + 1): set to 'dead' (wiped if sensitive).
    - Otherwise: set to 'queued' with next_attempt_at = now().
    
    Returns the count of recovered deliveries.
    """
    now = datetime.now(timezone.utc)
    try:
        from app.services.system_status import set_system_status
        set_system_status(db, "reaper_last_run", now.isoformat())
    except Exception as stat_err:
        logger.debug("Failed to record reaper status: %s", stat_err)

    stuck_deliveries = (
        db.query(Delivery)
        .filter(Delivery.status == "processing", Delivery.locked_until < now)
        .all()
    )

    if not stuck_deliveries:
        return 0

    reaped_count = 0
    for delivery in stuck_deliveries:
        # 1. TTL Expiration check
        if delivery.expires_at is not None and delivery.expires_at <= now:
            delivery.status = "expired"
            delivery.locked_until = None
            if delivery.sensitive:
                redact_sensitive_delivery(db, delivery)
            logger.info("Reaper marked delivery %s as expired (lock timed out after expires_at)", delivery.id)
            reaped_count += 1
            continue

        # 2. Max attempts check
        retry_schedule = delivery.retry_schedule or []
        max_attempts = len(retry_schedule) + 1
        if delivery.attempt_count >= max_attempts:
            delivery.status = "dead"
            delivery.locked_until = None
            delivery.last_error = f"Lock expired after {delivery.attempt_count} attempts (exhausted)"
            if delivery.sensitive:
                redact_sensitive_delivery(db, delivery)
            logger.warning("Reaper marked delivery %s as dead (exhausted %s attempts)", delivery.id, delivery.attempt_count)
        else:
            delivery.status = "queued"
            delivery.next_attempt_at = now
            delivery.locked_until = None
            logger.info("Reaper re-queued delivery %s (attempt_count=%s/%s)", delivery.id, delivery.attempt_count, max_attempts)

        reaped_count += 1

    db.commit()
    return reaped_count


class ReaperLoop:
    """Background thread running the lock reaper every REAPER_SECONDS."""

    def __init__(self, reaper_interval: Optional[float] = None):
        self.interval = reaper_interval if reaper_interval is not None else float(settings.REAPER_SECONDS)
        self.stop_event = threading.Event()
        self.thread: Optional[threading.Thread] = None

    def start(self) -> None:
        """Starts the background reaper thread."""
        self.thread = threading.Thread(target=self._run, name="worker-reaper", daemon=True)
        self.thread.start()
        logger.info("Reaper loop started with interval %ss", self.interval)

    def stop(self) -> None:
        """Stops the background reaper thread cleanly."""
        self.stop_event.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=5)
        logger.info("Reaper loop stopped")

    def _run(self) -> None:
        while not self.stop_event.is_set():
            try:
                with SessionLocal() as db:
                    reaped = reap_stuck_deliveries(db)
                    if reaped > 0:
                        logger.info("Reaper recovered %d stuck deliveries", reaped)
            except Exception as e:
                logger.error("Error during reaper execution: %s", str(e), exc_info=True)

            self.stop_event.wait(timeout=self.interval)
