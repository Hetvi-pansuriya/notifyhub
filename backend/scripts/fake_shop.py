#!/usr/bin/env python3
"""FakeShop client simulation script for NotifyHub demonstration.

Can:
1. Send one order_shipped event
2. Send a login_otp event to a plain email
3. Send the same event twice (idempotency demo: 202 then 200)
4. Queue 200 normal events
5. Flood the API to trigger 429 (rate limiting demo)
"""

import argparse
import concurrent.futures
import json
import os
import random
import sys
import time
import uuid
import httpx

DEFAULT_BASE_URL = os.environ.get("NOTIFYHUB_BASE_URL", "http://localhost:8000")


def get_api_key(cli_key: str | None) -> str:
    key = cli_key or os.environ.get("NOTIFYHUB_API_KEY")
    if not key:
        print("\n[ERROR] Missing API Key!")
        print("Please set the NOTIFYHUB_API_KEY environment variable or pass --api-key.")
        print("\nWalkthrough to obtain your API key:")
        print("1. Open http://localhost:3000/signup in your browser and create your tenant account.")
        print("2. Navigate to 'API keys' in the sidebar and click 'Create key'.")
        print("3. Copy the revealed key (starts with nh_live_...) and set it in your terminal:")
        print("   Windows PowerShell:  $env:NOTIFYHUB_API_KEY = \"nh_live_...\"")
        print("   Linux/macOS Bash:    export NOTIFYHUB_API_KEY=\"nh_live_...\"")
        print("\nAlternatively, you may pass it directly: python scripts/fake_shop.py --api-key nh_live_...")
        sys.exit(1)
    return key.strip()


def send_order_shipped(client: httpx.Client, base_url: str, order_id: int | None = None) -> dict:
    oid = order_id or random.randint(1000, 9999)
    idem_key = f"order_{oid}_{uuid.uuid4().hex[:8]}"
    payload = {
        "event_type": "order_shipped",
        "email": f"customer_{oid}@example.com",
        "data": {
            "order_id": oid,
            "customer": f"Customer {oid}",
            "tracking": f"TRACK-USPS-{oid}",
        },
    }
    print(f"\n[1] Sending order_shipped event for order #{oid}...")
    resp = client.post(
        f"{base_url}/api/events",
        headers={"Idempotency-Key": idem_key},
        json=payload,
    )
    print(f"Status: {resp.status_code}")
    print(json.dumps(resp.json(), indent=2))
    return resp.json()


def send_login_otp(client: httpx.Client, base_url: str, email: str = "security@example.com") -> dict:
    code = f"{random.randint(100000, 999999)}"
    idem_key = f"otp_{uuid.uuid4().hex}"
    payload = {
        "event_type": "login_otp",
        "email": email,
        "data": {
            "code": code,
        },
    }
    print(f"\n[2] Sending high-priority login_otp event to {email}...")
    resp = client.post(
        f"{base_url}/api/events",
        headers={"Idempotency-Key": idem_key},
        json=payload,
    )
    print(f"Status: {resp.status_code}")
    print(json.dumps(resp.json(), indent=2))
    return resp.json()


def demo_idempotency(client: httpx.Client, base_url: str) -> None:
    idem_key = f"idempotent_demo_{uuid.uuid4().hex[:12]}"
    payload = {
        "event_type": "order_shipped",
        "email": "repeat_buyer@example.com",
        "data": {
            "order_id": 5555,
            "customer": "Repeat Buyer",
            "tracking": "TRK-REPEAT-5555",
        },
    }

    print(f"\n[3] Idempotency Demo (Key: {idem_key}):")
    print("Sending Request 1 (Initial intake)...")
    r1 = client.post(f"{base_url}/api/events", headers={"Idempotency-Key": idem_key}, json=payload)
    print(f"  Response 1 Status: {r1.status_code} (Expected 202 Accepted)")
    print(f"  Response 1 Body:   {r1.text}")

    print("\nSending Request 2 (Identical duplicate with same idempotency key)...")
    r2 = client.post(f"{base_url}/api/events", headers={"Idempotency-Key": idem_key}, json=payload)
    print(f"  Response 2 Status: {r2.status_code} (Expected 200 OK Replay)")
    print(f"  Response 2 Body:   {r2.text}")

    if r1.status_code == 202 and r2.status_code == 200:
        print("\n[SUCCESS] Idempotency verified: exactly 1 event created; second was replayed safely!")
    else:
        print(f"\n[WARNING] Unexpected status codes: r1={r1.status_code}, r2={r2.status_code}")


def queue_200_events(client: httpx.Client, base_url: str) -> None:
    print("\n[4] Queuing 200 normal priority events...")
    start_time = time.time()
    success_count = 0

    for i in range(1, 201):
        idem_key = f"batch_200_{i}_{uuid.uuid4().hex[:6]}"
        payload = {
            "event_type": "order_shipped",
            "email": f"bulk_user_{i}@example.com",
            "data": {
                "order_id": 20000 + i,
                "customer": f"Bulk User {i}",
                "tracking": f"TRK-BULK-{i}",
            },
        }
        while True:
            resp = client.post(
                f"{base_url}/api/events",
                headers={"Idempotency-Key": idem_key},
                json=payload,
            )
            if resp.status_code in (200, 202):
                success_count += 1
                break
            elif resp.status_code == 401:
                print(f"\n[ERROR] 401 Unauthorized encountered on event #{i}: Invalid API key ({resp.text})!")
                sys.exit(1)
            elif resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", 0.05))
                time.sleep(max(retry_after, 0.05))
            else:
                print(f"\n[ERROR] Event #{i} failed with status {resp.status_code}: {resp.text}")
                break

        if i % 25 == 0 or i == 200:
            print(f"  Queued {i}/200 events...")

    duration = time.time() - start_time
    print(f"[SUCCESS] Successfully queued {success_count}/200 events in {duration:.2f}s ({success_count/duration:.1f} req/s)")


def flood_api_for_429(client: httpx.Client, base_url: str) -> None:
    print("\n[5] Flooding API with 120 rapid requests to trigger HTTP 429 Too Many Requests...")
    headers_base = {"X-API-Key": client.headers.get("X-API-Key", "")}

    def fire_request(req_id: int):
        with httpx.Client(base_url=base_url, timeout=15.0) as quick_client:
            return quick_client.get("/api/event-types", headers=headers_base)

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        futures = [executor.submit(fire_request, i) for i in range(1, 121)]
        for f in concurrent.futures.as_completed(futures):
            try:
                res = f.result()
                results.append(res.status_code)
            except Exception as e:
                results.append(str(e))

    status_counts = {}
    for r in results:
        status_counts[r] = status_counts.get(r, 0) + 1

    print("Flood results summary:")
    for status, count in sorted(status_counts.items(), key=lambda x: str(x[0])):
        print(f"  HTTP {status}: {count} requests")

    if 429 in status_counts:
        print(f"\n[SUCCESS] Token bucket rate limiter successfully triggered with {status_counts[429]} HTTP 429 responses!")
    else:
        print("\n[NOTE] No 429 triggered (burst rate was within token bucket capacity).")


def main() -> None:
    parser = argparse.ArgumentParser(description="NotifyHub FakeShop demo client")
    parser.add_argument(
        "action",
        choices=["order", "otp", "idempotency", "queue200", "flood", "all"],
        nargs="?",
        default="all",
        help="Action to perform (default: all)",
    )
    parser.add_argument("--api-key", help="NotifyHub API Key (or NOTIFYHUB_API_KEY env var)")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"API Base URL (default: {DEFAULT_BASE_URL})")

    args = parser.parse_args()
    api_key = get_api_key(args.api_key)

    with httpx.Client(base_url=args.base_url, headers={"X-API-Key": api_key}, timeout=30.0) as client:
        print("=" * 60)
        print("NotifyHub FakeShop Simulation")
        print(f"Target:  {args.base_url}")
        print(f"Key:     {api_key[:12]}...")
        print(f"Action:  {args.action}")
        print("=" * 60)

        # Preflight authentication check
        auth_check = client.get("/api/event-types")
        if auth_check.status_code == 401:
            print(f"\n[ERROR] 401 Unauthorized: The API key '{api_key[:12]}...' is invalid or revoked!")
            print("Tip: Set the key with $env:NOTIFYHUB_API_KEY=\"nh_live_fakeshop_demo_key_secret_9999999999\"")
            sys.exit(1)

        if args.action == "order":
            send_order_shipped(client, args.base_url)
        elif args.action == "otp":
            send_login_otp(client, args.base_url)
        elif args.action == "idempotency":
            demo_idempotency(client, args.base_url)
        elif args.action == "queue200":
            queue_200_events(client, args.base_url)
        elif args.action == "flood":
            flood_api_for_429(client, args.base_url)
        elif args.action == "all":
            send_order_shipped(client, args.base_url)
            send_login_otp(client, args.base_url)
            demo_idempotency(client, args.base_url)
            flood_api_for_429(client, args.base_url)
            print("\n" + "=" * 60)
            print("To run bulk queue of 200 events, run:")
            print("  python scripts/fake_shop.py queue200")
            print("=" * 60)


if __name__ == "__main__":
    main()
