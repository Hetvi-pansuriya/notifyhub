from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid
import zoneinfo
from fastapi import HTTPException, status
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Client, Delivery, NotificationEvent, RateLimitHit


def validate_timezone(tz_name: str) -> zoneinfo.ZoneInfo:
    """Validates that tz_name is a recognized IANA timezone."""
    try:
        return zoneinfo.ZoneInfo(tz_name)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid timezone: '{tz_name}'",
        )


def get_stats_summary(
    db: Session,
    client_id: Optional[uuid.UUID] = None,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
) -> dict:
    """Returns high-level status counts, success rate, and 429 rejections.
    
    pending: queued, waiting for a future time or a retry.
    in_queue: queued and due now, plus processing.
    sent, failed (dead), skipped, expired, success_rate, rejected_429.
    """
    now_utc = datetime.now(timezone.utc)

    # Base query filters
    deliv_query = db.query(Delivery)
    if client_id is not None:
        deliv_query = deliv_query.filter(Delivery.client_id == client_id)
    if from_dt is not None:
        deliv_query = deliv_query.filter(Delivery.created_at >= from_dt)
    if to_dt is not None:
        deliv_query = deliv_query.filter(Delivery.created_at <= to_dt)

    # 1. Pending: queued and next_attempt_at > now
    pending_q = db.query(Delivery).filter(
        Delivery.status == "queued",
        Delivery.next_attempt_at > now_utc,
    )
    if client_id is not None:
        pending_q = pending_q.filter(Delivery.client_id == client_id)
    if from_dt is not None:
        pending_q = pending_q.filter(Delivery.created_at >= from_dt)
    if to_dt is not None:
        pending_q = pending_q.filter(Delivery.created_at <= to_dt)
    pending_count = pending_q.count()

    # 2. In queue: (queued and next_attempt_at <= now or null) + processing
    in_queue_due = db.query(Delivery).filter(
        Delivery.status == "queued",
        (Delivery.next_attempt_at <= now_utc) | (Delivery.next_attempt_at.is_(None)),
    )
    processing_q = db.query(Delivery).filter(Delivery.status == "processing")
    if client_id is not None:
        in_queue_due = in_queue_due.filter(Delivery.client_id == client_id)
        processing_q = processing_q.filter(Delivery.client_id == client_id)
    if from_dt is not None:
        in_queue_due = in_queue_due.filter(Delivery.created_at >= from_dt)
        processing_q = processing_q.filter(Delivery.created_at >= from_dt)
    if to_dt is not None:
        in_queue_due = in_queue_due.filter(Delivery.created_at <= to_dt)
        processing_q = processing_q.filter(Delivery.created_at <= to_dt)
    in_queue_count = in_queue_due.count() + processing_q.count()

    # 3. Status group by
    status_counts_rows = (
        deliv_query.with_entities(Delivery.status, func.count(Delivery.id))
        .group_by(Delivery.status)
        .all()
    )
    status_map = {row[0]: row[1] for row in status_counts_rows}

    sent = status_map.get("sent", 0)
    failed = status_map.get("dead", 0)
    skipped = status_map.get("skipped", 0)
    expired = status_map.get("expired", 0)

    finished = sent + failed + skipped + expired
    success_rate = round(sent / finished, 4) if finished > 0 else 0.0

    # 4. Rejected 429 hits
    hit_query = db.query(RateLimitHit)
    if client_id is not None:
        hit_query = hit_query.filter(RateLimitHit.client_id == client_id)
    if from_dt is not None:
        hit_query = hit_query.filter(RateLimitHit.at >= from_dt)
    if to_dt is not None:
        hit_query = hit_query.filter(RateLimitHit.at <= to_dt)
    rejected_429 = hit_query.count()

    return {
        "pending": pending_count,
        "in_queue": in_queue_count,
        "sent": sent,
        "failed": failed,
        "skipped": skipped,
        "expired": expired,
        "success_rate": success_rate,
        "rejected_429": rejected_429,
    }


def get_stats_series(
    db: Session,
    client_id: Optional[uuid.UUID] = None,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    bucket: str = "hour",
    metric: str = "requests",
    tz_str: str = "UTC",
) -> list[dict]:
    """Generates time-series buckets with zero-filled gaps in caller's timezone.
    
    bucket: 'hour', 'day', 'month'
    metric: 'requests', 'sent', 'failed'
    """
    valid_buckets = {"hour", "day", "month"}
    if bucket not in valid_buckets:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid bucket '{bucket}'. Allowed: hour, day, month",
        )

    valid_metrics = {"requests", "sent", "failed"}
    if metric not in valid_metrics:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid metric '{metric}'. Allowed: requests, sent, failed",
        )

    user_tz = validate_timezone(tz_str)
    now_utc = datetime.now(timezone.utc)
    if to_dt is None:
        to_dt = now_utc
    if from_dt is None:
        if bucket == "hour":
            from_dt = to_dt - timedelta(hours=24)
        elif bucket == "day":
            from_dt = to_dt - timedelta(days=30)
        else:
            from_dt = to_dt - timedelta(days=365)

    if from_dt.tzinfo is None:
        from_dt = from_dt.replace(tzinfo=timezone.utc)
    if to_dt.tzinfo is None:
        to_dt = to_dt.replace(tzinfo=timezone.utc)

    # Choose source table and conditions
    if metric == "requests":
        table_name = "notification_events"
        where_clauses = ["created_at >= :from_dt", "created_at <= :to_dt"]
    elif metric == "sent":
        table_name = "deliveries"
        where_clauses = ["status = 'sent'", "created_at >= :from_dt", "created_at <= :to_dt"]
    else:  # failed
        table_name = "deliveries"
        where_clauses = ["status = 'dead'", "created_at >= :from_dt", "created_at <= :to_dt"]

    params = {
        "from_dt": from_dt,
        "to_dt": to_dt,
        "tz": tz_str,
    }
    if client_id is not None:
        where_clauses.append("client_id = :client_id")
        params["client_id"] = str(client_id)

    where_sql = " AND ".join(where_clauses)
    query_sql = text(f"""
        SELECT date_trunc('{bucket}', created_at AT TIME ZONE :tz) AS bucket_time,
               COUNT(*) AS val_count
        FROM {table_name}
        WHERE {where_sql}
        GROUP BY bucket_time
        ORDER BY bucket_time ASC
    """)

    results = db.execute(query_sql, params).fetchall()
    data_map = {}
    for row in results:
        b_time = row[0]
        # In postgres AT TIME ZONE produces naive timestamp in that tz
        iso_key = b_time.isoformat()
        data_map[iso_key] = row[1]

    # Generate complete series in user_tz from start to end
    from_local = from_dt.astimezone(user_tz)
    to_local = to_dt.astimezone(user_tz)

    if bucket == "hour":
        curr = from_local.replace(minute=0, second=0, microsecond=0)
        step = timedelta(hours=1)
    elif bucket == "day":
        curr = from_local.replace(hour=0, minute=0, second=0, microsecond=0)
        step = timedelta(days=1)
    else:  # month
        curr = from_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        step = None

    series = []
    end_point = to_local
    while curr <= end_point:
        naive_curr = curr.replace(tzinfo=None)
        key = naive_curr.isoformat()
        val = data_map.get(key, 0)
        series.append({
            "timestamp": curr.isoformat(),
            "count": val,
        })
        if step is not None:
            curr += step
        else:
            if curr.month == 12:
                curr = curr.replace(year=curr.year + 1, month=1)
            else:
                curr = curr.replace(month=curr.month + 1)

    return series


def get_stats_rate(
    db: Session,
    client_id: Optional[uuid.UUID] = None,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    tz_str: str = "UTC",
) -> list[dict]:
    """Returns peak requests per second per day, 429 rejections, and rate limit."""
    user_tz = validate_timezone(tz_str)
    now_utc = datetime.now(timezone.utc)
    if to_dt is None:
        to_dt = now_utc
    if from_dt is None:
        from_dt = to_dt - timedelta(days=7)

    if from_dt.tzinfo is None:
        from_dt = from_dt.replace(tzinfo=timezone.utc)
    if to_dt.tzinfo is None:
        to_dt = to_dt.replace(tzinfo=timezone.utc)

    # Determine client rate limit
    if client_id is not None:
        client = db.query(Client).filter(Client.id == client_id).first()
        rate_limit = client.rate_limit_per_sec if client else settings.DEFAULT_RATE_LIMIT_PER_SEC
    else:
        rate_limit = settings.DEFAULT_RATE_LIMIT_PER_SEC

    # 1. Peak requests per sec per day
    params = {"from_dt": from_dt, "to_dt": to_dt, "tz": tz_str}
    client_filter = ""
    if client_id is not None:
        client_filter = "AND client_id = :client_id"
        params["client_id"] = str(client_id)

    peak_sql = text(f"""
        SELECT date_trunc('day', sub.sec) AS day_time,
               MAX(sub.req_count) AS peak_sec
        FROM (
            SELECT date_trunc('second', created_at AT TIME ZONE :tz) AS sec,
                   COUNT(*) AS req_count
            FROM notification_events
            WHERE created_at >= :from_dt AND created_at <= :to_dt {client_filter}
            GROUP BY sec
        ) sub
        GROUP BY day_time
        ORDER BY day_time ASC
    """)
    peak_rows = db.execute(peak_sql, params).fetchall()
    peak_map = {row[0].date().isoformat(): int(row[1]) for row in peak_rows}

    # 2. 429 rejections per day
    hits_filter = ""
    hits_params = {"from_dt": from_dt, "to_dt": to_dt, "tz": tz_str}
    if client_id is not None:
        hits_filter = "AND client_id = :client_id"
        hits_params["client_id"] = str(client_id)

    hits_sql = text(f"""
        SELECT date_trunc('day', at AT TIME ZONE :tz) AS day_time,
               COUNT(*) AS hit_count
        FROM rate_limit_hits
        WHERE at >= :from_dt AND at <= :to_dt {hits_filter}
        GROUP BY day_time
        ORDER BY day_time ASC
    """)
    hit_rows = db.execute(hits_sql, hits_params).fetchall()
    hit_map = {row[0].date().isoformat(): int(row[1]) for row in hit_rows}

    # Generate daily sequence
    from_local = from_dt.astimezone(user_tz).date()
    to_local = to_dt.astimezone(user_tz).date()

    rate_data = []
    curr = from_local
    while curr <= to_local:
        date_str = curr.isoformat()
        rate_data.append({
            "date": date_str,
            "peak_requests_per_sec": peak_map.get(date_str, 0),
            "rejected_429": hit_map.get(date_str, 0),
            "rate_limit": rate_limit,
        })
        curr += timedelta(days=1)

    return rate_data
