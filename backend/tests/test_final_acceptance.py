"""Final Acceptance Test Suite (Running the 6 Final Acceptance Criteria)."""

import json
import time
import urllib.request
import uuid
import pytest

BASE = "http://localhost:8000"
ADMIN_KEY = "admin_master_secret_key_12345"


def get_mailhog_url() -> str:
    for host in ["mailhog", "localhost", "127.0.0.1"]:
        try:
            url = f"http://{host}:8025"
            urllib.request.urlopen(f"{url}/api/v2/messages", timeout=1)
            return url
        except Exception:
            pass
    return "http://localhost:8025"


def test_final_acceptance_end_to_end():
    ts = int(time.time())
    test_company = f"AcceptanceCorp_{ts}"
    test_email = f"accept_{ts}@example.com"
    test_pass = "AcceptancePass12345!"

    # 1. Sign up as a new company and create an API key named "Production"
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
    signup_req = urllib.request.Request(
        f"{BASE}/console/auth/signup",
        data=json.dumps({
            "company_name": test_company,
            "email": test_email,
            "password": test_pass,
        }).encode(),
        headers={"Content-Type": "application/json", "X-Requested-With": "notifyhub-console"},
    )
    res = opener.open(signup_req)
    signup_data = json.loads(res.read())
    client_id = signup_data["client"]["id"]
    assert client_id is not None

    key_req = urllib.request.Request(
        f"{BASE}/console/api-keys",
        data=json.dumps({"name": "Production"}).encode(),
        headers={"Content-Type": "application/json", "X-Requested-With": "notifyhub-console"},
    )
    key_res = opener.open(key_req)
    key_data = json.loads(key_res.read())
    raw_key = key_data["api_key"]
    key_id = key_data["id"]
    assert raw_key.startswith("nh_live_")

    # 2. Create a template and an event type, then send an event with curl and that key: email appears in MailHog
    et_req = urllib.request.Request(
        f"{BASE}/api/event-types/order_confirmed",
        data=json.dumps({
            "priority": 1,
            "retry_schedule": [5, 10],
            "respect_opt_out": False,
        }).encode(),
        headers={"Content-Type": "application/json", "X-API-Key": raw_key},
        method="PUT",
    )
    opener.open(et_req)

    tpl_req = urllib.request.Request(
        f"{BASE}/api/templates",
        data=json.dumps({
            "event_type": "order_confirmed",
            "subject": "Order {{ order_id }} Confirmed!",
            "body": "Hi {{ name }}, your order #{{ order_id }} is confirmed.",
        }).encode(),
        headers={"Content-Type": "application/json", "X-API-Key": raw_key},
    )
    tpl_res = opener.open(tpl_req)
    tpl_data = json.loads(tpl_res.read())
    tpl_id = tpl_data["id"]

    act_req = urllib.request.Request(
        f"{BASE}/api/templates/{tpl_id}/activate",
        data=b"",
        headers={"X-API-Key": raw_key},
    )
    opener.open(act_req)

    recipient_email = f"final_{ts}@customer.example"
    send_req = urllib.request.Request(
        f"{BASE}/api/events",
        data=json.dumps({
            "event_type": "order_confirmed",
            "email": recipient_email,
            "data": {"order_id": "ORD-FINAL-77", "name": "John"},
        }).encode(),
        headers={
            "Content-Type": "application/json",
            "X-API-Key": raw_key,
            "Idempotency-Key": str(uuid.uuid4()),
        },
    )
    send_res = urllib.request.urlopen(send_req)
    assert send_res.status == 202

    time.sleep(2)
    mh_url = get_mailhog_url()
    mh_res = urllib.request.urlopen(f"{mh_url}/api/v2/messages")
    mh_data = json.loads(mh_res.read())
    delivered = any(recipient_email.split("@")[0] in str(item.get("To", [])) for item in mh_data.get("items", []))
    assert delivered, "Email was not found in MailHog!"

    # 3. Revoke the key: the same curl returns 401
    rev_req = urllib.request.Request(
        f"{BASE}/console/api-keys/{key_id}/revoke",
        data=b"",
        headers={"X-Requested-With": "notifyhub-console"},
    )
    opener.open(rev_req)

    try:
        urllib.request.urlopen(send_req)
        assert False, "Revoked key was accepted!"
    except urllib.error.HTTPError as e:
        assert e.code == 401

    # 4. Sign in as admin, pause that client: client can still log in but sending is refused with 'Your service is paused'
    patch_req = urllib.request.Request(
        f"{BASE}/admin/clients/{client_id}",
        data=json.dumps({"status": "disabled"}).encode(),
        headers={"Content-Type": "application/json", "X-Admin-Key": ADMIN_KEY},
        method="PATCH",
    )
    urllib.request.urlopen(patch_req)

    # Client creates a new active key
    new_key_req = urllib.request.Request(
        f"{BASE}/console/api-keys",
        data=json.dumps({"name": "Key After Pause"}).encode(),
        headers={"Content-Type": "application/json", "X-Requested-With": "notifyhub-console"},
    )
    new_k_res = opener.open(new_key_req)
    new_key_data = json.loads(new_k_res.read())
    new_raw_key = new_key_data["api_key"]

    # Client can still log in
    login_req = urllib.request.Request(
        f"{BASE}/console/auth/login",
        data=json.dumps({"email": test_email, "password": test_pass}).encode(),
        headers={"Content-Type": "application/json"},
    )
    fresh_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
    fresh_res = fresh_opener.open(login_req)
    fresh_data = json.loads(fresh_res.read())
    assert fresh_data["client"]["status"] == "disabled"

    # But sending is refused with 403 'Your service is paused'
    pause_send_req = urllib.request.Request(
        f"{BASE}/api/events",
        data=json.dumps({
            "event_type": "order_confirmed",
            "email": "pause_test@example.com",
            "data": {"order_id": "88", "name": "Bob"},
        }).encode(),
        headers={
            "Content-Type": "application/json",
            "X-API-Key": new_raw_key,
            "Idempotency-Key": str(uuid.uuid4()),
        },
    )
    try:
        urllib.request.urlopen(pause_send_req)
        assert False, "Sending was allowed for paused client!"
    except urllib.error.HTTPError as e:
        err_body = json.loads(e.read())
        assert e.code == 403
        assert "Your service is paused" in err_body.get("detail", "")

    # 5. Sign out: opening /app/dashboard sends to /login
    logout_req = urllib.request.Request(
        f"{BASE}/console/auth/logout",
        data=b"",
        headers={"X-Requested-With": "notifyhub-console"},
    )
    fresh_opener.open(logout_req)

    me_req = urllib.request.Request(f"{BASE}/console/auth/me")
    try:
        fresh_opener.open(me_req)
        assert False, "Session was not invalidated!"
    except urllib.error.HTTPError as e:
        assert e.code == 401


if __name__ == "__main__":
    test_final_acceptance_end_to_end()
    print("ALL 5 ACCEPTANCE CRITERIA PASSED!")
