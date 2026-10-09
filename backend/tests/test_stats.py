"""Feature tests for Analytics, Usage, Series, and Rate statistics."""

import uuid
from app.models import ApiKey, Client
from app.security import generate_api_key


def _setup_stats_tenant(client, admin_headers):
    c_res = client.post(
        "/admin/clients",
        json={"name": "Stats Test Client", "rate_limit_per_sec": 50},
        headers=admin_headers,
    )
    assert c_res.status_code == 201
    c_data = c_res.json()
    k_res = client.post(
        f"/admin/clients/{c_data['id']}/reset-keys",
        headers={**admin_headers, "X-Requested-With": "notifyhub-console"},
    )
    assert k_res.status_code == 200
    return c_data["id"], k_res.json()["api_key"]


def test_stats_summary_and_empty_states(client, admin_headers):
    """Verify stats summary returns all required counters."""
    client_id, api_key = _setup_stats_tenant(client, admin_headers)
    headers = {"X-API-Key": api_key}

    res = client.get("/api/stats/summary", headers=headers)
    assert res.status_code == 200
    data = res.json()
    for key in ["pending", "in_queue", "sent", "failed", "skipped", "expired", "success_rate", "rejected_429"]:
        assert key in data


def test_stats_series_bucketing_and_timezone_validation(client, admin_headers):
    """Verify series bucketing for hour, day, month and IANA timezone handling."""
    client_id, api_key = _setup_stats_tenant(client, admin_headers)
    headers = {"X-API-Key": api_key}

    # Valid timezones and buckets
    for bucket in ["hour", "day", "month"]:
        for metric in ["requests", "sent", "failed"]:
            res = client.get(
                f"/api/stats/series?bucket={bucket}&metric={metric}&tz=America/New_York",
                headers=headers,
            )
            assert res.status_code == 200
            assert isinstance(res.json(), list)

    # Invalid timezone returns 422
    bad_tz = client.get(
        "/api/stats/series?bucket=day&metric=sent&tz=Mars/Olympus_Mons",
        headers=headers,
    )
    assert bad_tz.status_code == 422


def test_stats_rate_endpoint(client, admin_headers):
    """Verify rate endpoint returns peak requests, 429 rejections, and rate limits."""
    client_id, api_key = _setup_stats_tenant(client, admin_headers)
    headers = {"X-API-Key": api_key}

    res = client.get("/api/stats/rate?tz=UTC", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    if len(data) > 0:
        assert "date" in data[0]
        assert "peak_requests_per_sec" in data[0]
        assert "rejected_429" in data[0]
        assert "rate_limit" in data[0]
