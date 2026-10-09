# NotifyHub 🚀

**NotifyHub** is a high-reliability, multi-tenant transactional notification delivery engine built with Python, FastAPI, and PostgreSQL, accompanied by a Google AI Studio-inspired web console in React + Vite. It delivers guaranteed, zero-message-loss transactional email dispatch using a durable database-backed queue with PostgreSQL `FOR UPDATE SKIP LOCKED`, completely eliminating external message broker dependencies (like Redis, RabbitMQ, or Celery).

---

## 📁 Repository Layout

```
NotifyHub/
├── backend/                   # Backend API, Database models, and Workers
│   ├── app/                   # FastAPI application package
│   │   ├── routers/           # API routes (events, console_auth, console_keys, admin, etc.)
│   │   ├── models.py          # SQLAlchemy 2.x models (User, Session, ApiKey, Client, Delivery, etc.)
│   │   ├── security.py        # Argon2id hashing, timing-safe checks, token generation
│   │   ├── deps.py            # Authentication dependencies & role-based access control
│   │   └── config.py          # Pydantic Settings configuration
│   ├── alembic/               # Database migrations (including 003_auth_and_api_keys)
│   ├── worker/                # Background queue worker process and lock reaper
│   ├── scripts/               # Seeding script (seed.py) and simulation client (fake_shop.py)
│   ├── docker-compose.yml     # Multi-container orchestration (api, worker, postgres, mailhog)
│   ├── .env.example           # Development environment template
│   └── .env.production.example# Production environment template (COOKIE_SECURE=true)
├── frontend/                  # React + Vite Management Web Console
│   ├── src/
│   │   ├── styles/            # tokens.css (color tokens) and base.css (reset, components)
│   │   ├── router.jsx         # Zero-dependency browser history router
│   │   ├── auth.jsx           # Cookie session AuthProvider and RBAC route guards
│   │   ├── api.js             # Fetch client with credentials & CSRF protection
│   │   ├── components/        # Sidebar, Topbar, Layout, LogoMark, Toast, PageShell
│   │   └── pages/             # Login, Signup, Client pages (ApiKeys, Dashboard, etc.), Admin pages
│   ├── vercel.json            # Deployment configuration with API proxy rewrites
│   └── package.json           # Frontend scripts and minimal dependencies
└── CLAUDE.md                  # Development guidelines and architecture rules
```

---

## 🔐 The Two Kinds of Credentials

NotifyHub maintains a strict architectural boundary between human console access and machine API calls:

| Credential Type | Used By | Transport | Storage & Security | Allowed Endpoints |
|---|---|---|---|---|
| **Console Session** | Browser Users (Persons) | `nh_session` HTTP-only cookie with `SameSite=Lax` | Server-side `sessions` table (SHA-256 token hash). Brute-force throttle (10 / 15m). | `/console/*`, web UI routes |
| **Server API Key** | Client Backend Servers | `X-API-Key: nh_live_<token>` header | Client creates self-service keys (max 5 active). Full key revealed **only once**; DB stores SHA-256 hash & 12-char prefix. | `/api/events`, `/api/*` |
| **Admin Key** | Platform Admin Systems | `X-Admin-Key: <ADMIN_KEY>` header | Configured via `ADMIN_KEY` environment variable. | `/admin/*` |

> [!IMPORTANT]
> Non-GET browser calls to `/console/*` require the CSRF protection header `X-Requested-With: notifyhub-console`.

---

## 🚀 How to Start the System

### 1. Start the Backend
From the `backend/` directory:
```bash
cd backend
docker compose up -d
```
This starts 4 containers:
- **FastAPI API Gateway:** `http://localhost:8000`
- **MailHog Web Inbox:** `http://localhost:8025` (SMTP on `localhost:1025`)
- **PostgreSQL 16:** `localhost:5433`
- **Background Worker:** processing deliveries with `FOR UPDATE SKIP LOCKED`

To seed the initial admin account and default FakeShop tenant:
```bash
docker compose exec api python scripts/seed.py
```

### 2. Start the Frontend Web Console
From the `frontend/` directory:
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:3000`** in your browser. The Vite dev server proxies `/api`, `/console`, and `/admin` requests directly to `http://localhost:8000`.

---

## 🚶 Walkthrough: From Signup to First Delivered Email

Follow these steps to experience the complete self-service flow:

### Step 1: Sign Up in the Browser
1. Open **[http://localhost:3000/signup](http://localhost:3000/signup)**.
2. Enter your company name (e.g. `Acme Retail`), your work email (`owner@acme.test`), and a password (at least 10 characters).
3. Click **Create account**. You are immediately authenticated and landed in your new **Client Console**.

### Step 2: Create a Self-Service API Key
1. In the sidebar, navigate to **API keys** (`http://localhost:3000/app/api-keys`).
2. Click **Create key** in the top right.
3. Name your key (e.g. `Production`) and click **Create**.
4. The raw secret key (starting with `nh_live_`) is revealed in a secure code box.
5. Click **Copy**, tick the **"I have saved my key"** confirmation box, and click **Done**.
   *(Note: For security, the raw key is never shown again; subsequent views display only the prefix `nh_live_XXXX••••`).*

### Step 3: Send an Event with Your API Key
In your terminal, set the copied key and dispatch a transactional event via `curl` or PowerShell:

#### In Windows PowerShell:
```powershell
$apiKey = "YOUR_COPIED_API_KEY_HERE"

$body = @{
    event_type = "order_shipped"
    email = "customer@example.com"
    data = @{
        order_id = "1001"
        customer = "Jane Doe"
        tracking = "TRACK-USPS-8877"
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/api/events" `
  -Method Post `
  -ContentType "application/json" `
  -Headers @{
      "X-API-Key" = $apiKey
      "Idempotency-Key" = [guid]::NewGuid().ToString()
  } `
  -Body $body
```

#### In Linux / macOS Bash:
```bash
export NOTIFYHUB_API_KEY="YOUR_COPIED_API_KEY_HERE"

curl -X POST http://localhost:8000/api/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $NOTIFYHUB_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "event_type": "order_shipped",
    "email": "customer@example.com",
    "data": {
      "order_id": "1001",
      "customer": "Jane Doe",
      "tracking": "TRACK-USPS-8877"
    }
  }'
```

### Step 4: Verify Delivery in MailHog
1. Open **[http://localhost:8025](http://localhost:8025)**.
2. Observe your incoming email delivered by the background worker with subject:
   `"Order #1001 is on its way!"`
3. Refresh the **API keys** page in your browser: the **Last used** timestamp for your key now reflects `"Just now"`.

---

## 🧪 Interactive Demo Script (`fake_shop.py`)

Run the client simulation script to test rate limiting, idempotency, and high-priority OTPs:

```powershell
# Set your self-service key from the browser:
$env:NOTIFYHUB_API_KEY = "YOUR_KEY_HERE"

# Send a single order event:
python scripts/fake_shop.py order

# Send a high-priority OTP event:
python scripts/fake_shop.py otp

# Demonstrate idempotency replay (202 then 200 without duplicate creation):
python scripts/fake_shop.py idempotency

# Test rate limiting burst protection (triggers HTTP 429):
python scripts/fake_shop.py flood
```

---

## 🌐 Production Deployment & Rewrites

NotifyHub is designed to be deployed with the frontend on Vercel and the backend on any standard container platform (e.g. AWS ECS, Render, Railway, Fly.io).

### Frontend Deployment (`frontend/vercel.json`)
The frontend uses Vercel rewrites to proxy all API paths to the production backend URL:
- `/api/*` -> `https://api.yourdomain.com/api/*`
- `/console/*` -> `https://api.yourdomain.com/console/*`
- `/admin/*` -> `https://api.yourdomain.com/admin/*`
- All other routes fall back to `/index.html` for client-side routing.

> [!NOTE]
> Update the backend target domain in `frontend/vercel.json` with your deployed backend URL. Do not hardcode secrets or backend hostnames in frontend source files.

### Backend Production Configuration
Ensure your production `.env` configures:
```bash
COOKIE_SECURE=true
```
Because the frontend proxies requests through rewrites under the same site/domain origin, the `nh_session` cookie operates as a first-party cookie with `SameSite=Lax`.

---

## 🔬 Automated Testing

Run the full automated test suite inside Docker:
```bash
docker compose exec api pytest -v
```
All **81 tests pass 100%**, covering:
- Authentication, Argon2id passwords, and Session lifecycles
- Self-service API Key creation, 5-key limits, prefix matching, and instant revocation
- CSRF protection and role-based access control (Admin vs Client Owner)
- Durable queue claiming (`FOR UPDATE SKIP LOCKED`), priority dispatch, lock reaper, and DLQ
- Jinja2 sandboxed rendering and sensitive OTP redaction
- SendGrid integration with `httpx.MockTransport`, privacy logging guarantees, and SMTP fallback
- Client sending identity (`from_name`, `reply_to_email`) and live previews
- Scheduled sending (`send_at`), TTL calculation, and idempotency hashing
- Safety limits: client daily limit, global daily limit, and demo recipient allowlist

---

## 📬 Real Email with SendGrid

NotifyHub supports real-world transactional email dispatch via Twilio SendGrid while maintaining MailHog (SMTP) as the default for local development and CI testing.

### Configuration (`backend/.env`)

To switch from local SMTP to real SendGrid sending, configure the following variables:

```bash
# Set mail provider to sendgrid (defaults to smtp)
MAIL_PROVIDER=sendgrid

# Your Twilio SendGrid API Key (starts with SG.)
SENDGRID_API_KEY=SG.your_actual_api_key_here

# Verified Sender Email configured in your SendGrid console
FROM_EMAIL=no-reply@yourdomain.com

# Global daily sending ceiling across all tenants (default: 300)
GLOBAL_DAILY_LIMIT=300

# Optional demo mode allowlist (comma-separated emails).
# When set, any recipient not in this list is rejected with 422.
# Leave blank to allow sending to any recipient.
DEMO_ALLOWED_RECIPIENTS=team@yourdomain.com,tester@example.com
```

### Safety & Privacy Guarantees
- **Fail-Fast Validation:** If `MAIL_PROVIDER=sendgrid` is selected without `SENDGRID_API_KEY` or `FROM_EMAIL`, NotifyHub fails fast on startup with a clear configuration error.
- **Strict Privacy Logging:** NotifyHub **never logs** SendGrid API keys, email subjects, bodies, or OTP codes. Only internal delivery IDs, provider message IDs, and HTTP status codes are written to logs.
- **Provider Switching:** When `MAIL_PROVIDER=smtp` (default), MailHog on port 1025 captures all outgoing email locally at `http://localhost:8025`, and the demo allowlist is bypassed.

---

## 🏢 The Three Demo Clients

NotifyHub includes pre-configured client fixtures representing three distinct real-world application patterns.

To seed the demo clients, run:
```bash
docker compose exec api python -m scripts.seed_demo_clients
```
*(This script is strictly idempotent and safe to run multiple times. If clients already exist, existing API keys and `.env` files are preserved.)*

Generated keys are saved to `backend/demo_keys/<client>.env` as `NOTIFYHUB_API_KEY=nh_live_...`.

### Client Overview & Credentials

All demo client owners share the password configured in `DEMO_OWNER_PASSWORD` (default: `DemoClientPass123!`).

| Client Name | Domain / Owner Email | Default From Name & Reply-To | Daily Limit | Key File |
|---|---|---|---|---|
| **ShopEasy** | `owner@shopeasy.example` | `ShopEasy` <br> `support@shopeasy.example` | 30 | `backend/demo_keys/shopeasy.env` |
| **SecureLogin** | `owner@securelogin.example` | `SecureLogin` <br> `support@securelogin.example` | 30 | `backend/demo_keys/securelogin.env` |
| **ReminderBox** | `owner@reminderbox.example` | `ReminderBox` <br> `support@reminderbox.example` | 30 | `backend/demo_keys/reminderbox.env` |

### Pre-Configured Event Types & Templates

| Tenant | Event Type | Priority | TTL | Retries | Opt-Out | Sensitive | Template Subject |
|---|---|---|---|---|---|---|---|
| **ShopEasy** | `order_confirmed` | Normal (1) | Default | [60, 300, 900] | Respected | False | `Order #{{ order_id }} confirmed` |
| **ShopEasy** | `order_shipped` | Normal (1) | Default | [60, 300, 900] | Respected | False | `Order #{{ order_id }} on its way` |
| **SecureLogin** | `welcome_email` | Normal (1) | Default | [60, 300, 900] | Respected | False | `Welcome to SecureLogin, {{ name }}` |
| **SecureLogin** | `login_otp` | High (2) | 300s (5m) | [2, 5] | **Ignored** | **True** | `Your login code` |
| **SecureLogin** | `password_reset` | High (2) | 900s (15m)| [2, 5] | **Ignored** | **True** | `Reset your password` |
| **ReminderBox** | `reminder_due` | Normal (1) | Default | [60, 300, 900] | Respected | False | `Reminder: {{ title }}` |
| **ReminderBox** | `newsletter` | Low (0) | 172800s (2d) | [60, 300, 900] | Respected | False | `{{ headline }}` |

---

## 🛡️ Opt-Out Preferences & Sensitive Event Security

NotifyHub enforces strict security and deliverability policies around recipient preferences and payload storage:

1. **Opt-Out Preference Enforcement:**
   - **Low & Normal Priority Events (`priority <= 1`):** Recipient opt-out preferences are **always respected**. If a recipient has unsubscribed or disabled an event type, intake marks the delivery as `status = "skipped"`. Skipped deliveries do not touch mail providers and do not consume client daily limits.
   - **High Priority & Sensitive Events (`priority = 2` / `sensitive = true`):** Recipient opt-out preferences are **never respected** (e.g. login OTPs, multi-factor authentication codes, password resets). These critical security notifications are dispatched regardless of general marketing preferences.

2. **Why Sensitive Events Disallow Scheduled Sending (`send_at`):**
   - Scheduled sending allows events to sit in the queue until a future execution timestamp (`send_at`).
   - For sensitive events (such as OTPs, temporary tokens, and reset links), queuing secrets for delayed future dispatch poses a major security hazard: clear-text credentials would remain stored at rest, and the time-sensitive security window of the token would expire before dispatch.
   - Therefore, any intake request supplying `send_at` for a sensitive event type fails fast with HTTP `422 Unprocessable Content`.

---

## ℹ️ Definition of "Sent" Status in NotifyHub

In the NotifyHub UI and delivery lifecycle, **"Sent"** has a precise operational meaning:

> **"Sent" means our mail provider accepted the delivery request.**
> *(HTTP 202 Accepted from SendGrid or 250 OK from SMTP).*
> 
> Once accepted by the mail provider, downstream transmission to the recipient's inbox depends on the provider's dispatch pipeline, network routing, and the recipient mail exchange (MX) server spam and reputation filters. An email marked "Sent" may still take a moment to appear in the user's inbox.
