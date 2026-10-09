"""NotifyHub durable queue worker main loop."""

import logging
import signal
import sys
import time

from app.config import settings
from app.db import SessionLocal
from worker.claim import claim_deliveries
from worker.providers import get_provider
from worker.reaper import ReaperLoop, reap_stuck_deliveries
from worker.sender import outgoing_rate_limiter, process_single_delivery

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [worker] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("worker")

# Graceful shutdown flag
_shutdown_requested = False


def _signal_handler(signum, frame):
    global _shutdown_requested
    logger.info("Shutdown signal received (%s). Finishing in-flight work...", signum)
    _shutdown_requested = True


def run_worker() -> None:
    """Main worker loop polling deliveries and dispatching emails."""
    global _shutdown_requested

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    provider = get_provider()
    poll_interval = max(float(settings.WORKER_POLL_SECONDS), 0.5)

    # Initial boot reap for any locks left by previously killed worker
    try:
        with SessionLocal() as init_db:
            init_reaped = reap_stuck_deliveries(init_db)
            if init_reaped > 0:
                logger.info("Initial boot reaper recovered %d stuck deliveries", init_reaped)
    except Exception as e:
        logger.warning("Initial reaper run failed: %s", str(e))

    # Start background reaper loop
    reaper = ReaperLoop()
    reaper.start()

    logger.info(
        "NotifyHub worker started with provider '%s'. Polling every %ss with outgoing limit %s/s, reaper every %ss...",
        getattr(provider, "provider_name", settings.MAIL_PROVIDER),
        poll_interval,
        outgoing_rate_limiter.rate,
        reaper.interval,
    )

    last_heartbeat_time = 0.0

    try:
        while not _shutdown_requested:
            now_mono = time.monotonic()
            if now_mono - last_heartbeat_time >= 10.0:
                try:
                    with SessionLocal() as hb_db:
                        from app.services.system_status import set_system_status
                        set_system_status(hb_db, "worker_heartbeat", "alive")
                    last_heartbeat_time = now_mono
                except Exception as hb_err:
                    logger.debug("Failed to record worker heartbeat: %s", hb_err)

            db = SessionLocal()
            try:
                # Claim up to 10 deliveries ordered by priority DESC, next_attempt_at ASC
                deliveries = claim_deliveries(db, batch_size=10)

                if deliveries:
                    logger.info("Claimed %s deliveries for processing", len(deliveries))
                    for delivery in deliveries:
                        if _shutdown_requested:
                            logger.info("Shutdown in progress; halting further batch processing")
                            break
                        process_single_delivery(db, delivery, provider)

            except Exception as e:
                logger.error("Unexpected worker loop error: %s", str(e), exc_info=True)
            finally:
                db.close()

            # Sleep before next poll
            if not _shutdown_requested:
                time.sleep(poll_interval)
    finally:
        reaper.stop()

    logger.info("NotifyHub worker stopped cleanly.")


if __name__ == "__main__":
    run_worker()
