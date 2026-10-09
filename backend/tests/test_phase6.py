"""Unit and integration tests for Phase 6: Reliability, Lock Reaper, and Visibility Metrics."""

import uuid
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import ApiKey, Client, Delivery, DeliveryAttempt, NotificationEvent
from app.security import hash_key
from worker.reaper import reap_stuck_deliveries


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def http():
    return TestClient(app)


def make_client(db, name="Test Client", key=None, status="active", rate_limit=50):
    client = Client(
        id=uuid.uuid4(),
        name=name,
        status=status,
        rate_limit_per_sec=rate_limit,
    )
    db.add(client)
    if key:
        api_key = ApiKey(
            client_id=client.id,
            name="Default key",
            key_prefix=key[:12],
            key_hash=hash_key(key),
            status="active",
        )
        db.add(api_key)
    return client


def test_reap_stuck_deliveries_requeues_in_flight(db):
    """Verify that stuck processing deliveries whose lock expired are re-queued."""
    api_key = f"nh_live_{uuid.uuid4().hex}"
    client = make_client(db, "Reaper Client 1", api_key)

    ev = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"reap_ev_{uuid.uuid4().hex}",
        request_hash="hash_reap",
        event_type="order_shipped",
        recipient_email="stuck@example.com",
        data={"order_id": 123},
    )
    db.add(ev)

    now = datetime.now(timezone.utc)
    delivery = Delivery(
        client_id=client.id,
        event=ev,
        to_email="stuck@example.com",
        status="processing",
        priority=1,
        retry_schedule=[5, 10],  # Max attempts: 2 delays + 1 = 3
        sensitive=False,
        attempt_count=1,
        locked_until=now - timedelta(seconds=10),  # Lock has expired!
        rendered_subject="Order 123",
        rendered_body="Body",
    )
    db.add(delivery)
    db.commit()

    reaped = reap_stuck_deliveries(db)
    assert reaped >= 1

    db.refresh(delivery)
    assert delivery.status == "queued"
    assert delivery.locked_until is None
    assert delivery.next_attempt_at is not None


def test_reap_stuck_deliveries_marks_dead_if_attempts_exhausted(db):
    """Verify that stuck processing deliveries with exhausted attempts become dead."""
    api_key = f"nh_live_{uuid.uuid4().hex}"
    client = make_client(db, "Reaper Client 2", api_key)

    ev = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"reap_dead_ev_{uuid.uuid4().hex}",
        request_hash="hash_reap_dead",
        event_type="order_shipped",
        recipient_email="dead@example.com",
        data={"order_id": 456},
    )
    db.add(ev)

    now = datetime.now(timezone.utc)
    delivery = Delivery(
        client_id=client.id,
        event=ev,
        to_email="dead@example.com",
        status="processing",
        priority=1,
        retry_schedule=[5],  # 1 delay -> max 2 attempts
        sensitive=False,
        attempt_count=2,  # Already used attempt 2!
        locked_until=now - timedelta(seconds=10),
        rendered_subject="Order 456",
        rendered_body="Body",
    )
    db.add(delivery)
    db.commit()

    reaped = reap_stuck_deliveries(db)
    assert reaped >= 1

    db.refresh(delivery)
    assert delivery.status == "dead"
    assert delivery.locked_until is None
    assert "exhausted" in delivery.last_error.lower()


def test_reap_stuck_deliveries_expires_and_wipes_sensitive(db):
    """Verify stuck sensitive delivery past expires_at is marked expired and redacted."""
    api_key = f"nh_live_{uuid.uuid4().hex}"
    client = make_client(db, "Reaper Sensitive Client", api_key)

    ev = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"reap_sens_ev_{uuid.uuid4().hex}",
        request_hash="hash_sens",
        event_type="auth_otp",
        recipient_email="sens@example.com",
        data={"code": "987654"},
    )
    db.add(ev)

    now = datetime.now(timezone.utc)
    delivery = Delivery(
        client_id=client.id,
        event=ev,
        to_email="sens@example.com",
        status="processing",
        priority=2,
        retry_schedule=[10],
        sensitive=True,
        attempt_count=1,
        locked_until=now - timedelta(seconds=15),
        expires_at=now - timedelta(seconds=5),  # Already expired
        rendered_subject="Your Code 987654",
        rendered_body="Code: 987654",
    )
    db.add(delivery)
    db.commit()

    reaped = reap_stuck_deliveries(db)
    assert reaped >= 1

    db.refresh(delivery)
    assert delivery.status == "expired"
    assert delivery.rendered_subject == "redacted"
    assert delivery.rendered_body == "redacted"

    db.refresh(ev)
    assert ev.data == {"redacted": True}


def test_deliveries_list_and_status_filtering(db, http):
    """Verify GET /api/deliveries lists only caller's deliveries and filters by status."""
    api_key = f"nh_live_{uuid.uuid4().hex}"
    client = make_client(db, "List Deliveries Client", api_key)

    ev = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"list_ev_{uuid.uuid4().hex}",
        request_hash="hash_lst",
        event_type="order_shipped",
        recipient_email="lst@example.com",
        data={"order_id": 789},
    )
    db.add(ev)

    d_sent = Delivery(
        client_id=client.id,
        event=ev,
        to_email="lst_sent@example.com",
        status="sent",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        rendered_subject="Sent Order",
        rendered_body="Body",
    )
    d_dead = Delivery(
        client_id=client.id,
        event=ev,
        to_email="lst_dead@example.com",
        status="dead",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        rendered_subject="Dead Order",
        rendered_body="Body",
    )
    db.add_all([d_sent, d_dead])
    db.commit()

    headers = {"X-API-Key": api_key}

    # 1. List all
    res_all = http.get("/api/deliveries", headers=headers)
    assert res_all.status_code == 200
    ids_all = [d["id"] for d in res_all.json()]
    assert str(d_sent.id) in ids_all
    assert str(d_dead.id) in ids_all

    # 2. Filter by status=sent
    res_sent = http.get("/api/deliveries?status=sent", headers=headers)
    assert res_sent.status_code == 200
    ids_sent = [d["id"] for d in res_sent.json()]
    assert str(d_sent.id) in ids_sent
    assert str(d_dead.id) not in ids_sent


def test_delivery_tenant_isolation_404(db, http):
    """Verify accessing another client's delivery returns 404 (never 403)."""
    key_a = f"nh_live_{uuid.uuid4().hex}"
    client_a = make_client(db, "Client A", key_a)
    key_b = f"nh_live_{uuid.uuid4().hex}"
    client_b = make_client(db, "Client B", key_b)
    db.commit()

    ev_b = NotificationEvent(
        client_id=client_b.id,
        idempotency_key=f"b_ev_{uuid.uuid4().hex}",
        request_hash="hash_b",
        event_type="order_shipped",
        recipient_email="b@example.com",
        data={"b": 1},
    )
    db.add(ev_b)
    del_b = Delivery(
        client_id=client_b.id,
        event=ev_b,
        to_email="b@example.com",
        status="sent",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        rendered_subject="B Subj",
        rendered_body="B Body",
    )
    db.add(del_b)
    db.commit()

    # Client A requests Client B's delivery -> 404 Not Found
    res = http.get(f"/api/deliveries/{del_b.id}", headers={"X-API-Key": key_a})
    assert res.status_code == 404


def test_client_and_admin_metrics(db, http):
    """Verify GET /api/metrics for caller and GET /admin/metrics global and by client_id."""
    key = f"nh_live_{uuid.uuid4().hex}"
    client = make_client(db, "Metrics Test Client", key)

    ev = NotificationEvent(
        client_id=client.id,
        idempotency_key=f"met_ev_{uuid.uuid4().hex}",
        request_hash="hash_met",
        event_type="order_shipped",
        recipient_email="met@example.com",
        data={"met": 1},
    )
    db.add(ev)

    # 1 queued, 1 sent, 1 dead
    d1 = Delivery(
        client_id=client.id,
        event=ev,
        to_email="m1@example.com",
        status="queued",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        rendered_subject="S",
        rendered_body="B",
        next_attempt_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    d2 = Delivery(
        client_id=client.id,
        event=ev,
        to_email="m2@example.com",
        status="sent",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        rendered_subject="S",
        rendered_body="B",
    )
    d3 = Delivery(
        client_id=client.id,
        event=ev,
        to_email="m3@example.com",
        status="dead",
        priority=1,
        retry_schedule=[5],
        sensitive=False,
        rendered_subject="S",
        rendered_body="B",
    )
    db.add_all([d1, d2, d3])
    db.commit()

    # 1. GET /api/metrics for client
    res_client = http.get("/api/metrics", headers={"X-API-Key": key})
    assert res_client.status_code == 200
    data_client = res_client.json()
    assert data_client["status_counts"]["queued"] >= 1
    assert data_client["status_counts"]["sent"] >= 1
    assert data_client["status_counts"]["dead"] >= 1
    assert data_client["queue_depth"] >= 1
    assert data_client["finished"] >= 2  # sent + dead

    # 2. GET /admin/metrics without filter
    res_admin_all = http.get("/admin/metrics", headers={"X-Admin-Key": settings.ADMIN_KEY})
    assert res_admin_all.status_code == 200
    data_admin_all = res_admin_all.json()
    assert data_admin_all["client_id"] is None
    assert data_admin_all["finished"] >= data_client["finished"]

    # 3. GET /admin/metrics?client_id=...
    res_admin_filtered = http.get(f"/admin/metrics?client_id={client.id}", headers={"X-Admin-Key": settings.ADMIN_KEY})
    assert res_admin_filtered.status_code == 200
    data_admin_filtered = res_admin_filtered.json()
    assert data_admin_filtered["client_id"] == str(client.id)
    assert data_admin_filtered["status_counts"]["queued"] == data_client["status_counts"]["queued"]
    assert data_admin_filtered["status_counts"]["sent"] == data_client["status_counts"]["sent"]
    assert data_admin_filtered["status_counts"]["dead"] == data_client["status_counts"]["dead"]
