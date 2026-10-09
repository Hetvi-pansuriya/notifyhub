# NotifyHub

NotifyHub is a generic, multi-tenant transactional email notification service. It provides durable event ingestion, rate-limited queuing with zero message loss, pluggable email delivery (MailHog SMTP for local development, SendGrid for production), self-service client API keys, and dedicated management consoles for both tenants and platform administrators.

---

## Architecture in 5 Lines

- **FastAPI API Gateway:** High-performance REST API handling event ingestion, session authentication, client console endpoints, and platform administration.
- **PostgreSQL 16:** Durable persistence and brokerless message queueing using `SELECT ... FOR UPDATE SKIP LOCKED` for concurrent workers.
- **Background Worker:** Autonomous delivery engine with exponential backoff retries, dead-letter tracking, rate throttling, and an abandoned-lease reaper.
- **Pluggable Mail Providers:** Local SMTP capture via MailHog during development, switching cleanly to Twilio SendGrid for production delivery.
- **React Management Console:** Zero-dependency frontend built with React, Vite, and plain CSS, offering isolated portals for client tenants and platform administrators.

---

## Getting Started

### 1. Start the Backend Services (Docker Compose)

From the project root:

```bash
cd backend
docker compose up -d
```

This starts:
- **API Server:** `http://localhost:8000` (FastAPI with live reload)
- **Database:** `localhost:5433` (PostgreSQL 16)
- **Local Mailbox (MailHog):** `http://localhost:8025` (SMTP on `localhost:1025`)
- **Queue Worker:** Autonomous background delivery processor

### 2. Seed Initial Admin Account

Create the platform administrator user:

```bash
docker compose exec api python scripts/seed.py
```

Default administrator credentials (configured via `backend/.env`):
- **Email:** `admin@notifyhub.local`
- **Password:** `AdminSecretPass123!`

### 3. Start Frontend Development Server

From the project root:

```bash
cd frontend
npm install
npm run dev
```

Open **`http://localhost:3000`** in your browser. The Vite development server automatically proxies `/api`, `/console`, and `/admin` requests to `http://localhost:8000`.

---

## Email Delivery: Local Development vs. Production

NotifyHub uses MailHog by default for completely isolated local testing, preventing accidental external emails.

### Local Development (Default: MailHog)
- **Provider:** `MAIL_PROVIDER=smtp`
- **Outgoing Port:** Port `1025`
- **Web Inbox:** Open [http://localhost:8025](http://localhost:8025) to view captured emails in real time.

### Production (SendGrid)
To enable real email dispatch, set the following environment variables in `backend/.env`:

```env
MAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.your_actual_sendgrid_key_here
FROM_EMAIL=verified_sender@yourdomain.com
GLOBAL_DAILY_LIMIT=90
```

#### Privacy & Safety Rules:
- **Global Daily Cap:** Capped by `GLOBAL_DAILY_LIMIT` (default: 90) across all tenants per UTC day to stay safely within free-tier limits.
- **Zero Sensitive Data Logging:** NotifyHub never logs SendGrid API keys, email subjects, bodies, or OTP codes. Only internal delivery IDs, provider message IDs, and HTTP status codes are recorded.
- **Client Sending Identity:** Outgoing emails use the client tenant's configured `from_name` (formatted as `"{from_name} via NotifyHub"`) and `reply_to_email`.

---

## Key API Endpoints

All requests to `/api/*` require an `X-API-Key: nh_live_<token>` header. Non-GET requests to `/console/*` require the CSRF header `X-Requested-With: notifyhub-console`.

| Method | Path | Description | Authentication |
|---|---|---|---|
| `POST` | `/api/events` | Ingest transactional email notification | `X-API-Key` |
| `POST` | `/console/auth/signup` | Register client tenant account | Public |
| `POST` | `/console/auth/login` | Authenticate tenant owner or admin | Public |
| `POST` | `/console/auth/logout` | Terminate session cookie | Session cookie |
| `GET` | `/console/auth/me` | Fetch active user profile and tenant metadata | Session cookie |
| `GET` | `/console/api-keys` | List client API keys (masked prefix) | Session cookie (Owner) |
| `POST` | `/console/api-keys` | Create new API key (full secret shown once) | Session cookie (Owner) |
| `POST` | `/console/api-keys/{id}/revoke` | Revoke an API key immediately | Session cookie (Owner) |
| `GET` | `/console/dashboard/stats` | Client usage metrics, 24h volume, rates | Session cookie (Owner) |
| `GET` | `/console/deliveries` | Search and filter delivery history | Session cookie (Owner) |
| `GET` | `/console/templates` | List event types and rendered previews | Session cookie (Owner) |
| `GET` | `/admin/stats/overview` | Platform-wide volume, delivery & error rates | Session cookie (Admin) / `X-Admin-Key` |
| `GET` | `/admin/clients` | List all client tenants with plan & volume data | Session cookie (Admin) / `X-Admin-Key` |
| `GET` | `/admin/clients/{id}` | Detailed tenant profile, keys, and metrics | Session cookie (Admin) / `X-Admin-Key` |
| `POST` | `/admin/clients/{id}/plan` | Assign subscription tier to client | Session cookie (Admin) / `X-Admin-Key` |
| `GET` | `/admin/plans` | List available subscription tiers | Session cookie (Admin) / `X-Admin-Key` |
| `POST` | `/admin/plans` | Create a new subscription tier | Session cookie (Admin) / `X-Admin-Key` |
| `DELETE`| `/admin/plans/{id}` | Delete a subscription tier | Session cookie (Admin) / `X-Admin-Key` |

---

## Key Console Pages

The frontend management console automatically routes users based on their authenticated role:

| Page | URL | Target User | Features |
|---|---|---|---|
| **Sign Up** | `/signup` | Prospective clients | Tenant registration with immediate session creation |
| **Log In** | `/login` | All users | Brute-force protected email & password login |
| **Client Dashboard** | `/app/dashboard` | Tenant Owners | 24h delivery volume, success rate, monthly quota meter |
| **Deliveries** | `/app/deliveries` | Tenant Owners | Paginated delivery log, status filters, search, error details |
| **Templates** | `/app/templates` | Tenant Owners | Previews of configured event notification templates |
| **API Keys** | `/app/api-keys` | Tenant Owners | Self-service key generation, copying, revocation (max 5) |
| **Client Profile** | `/app/profile` | Tenant Owners | Sender identity settings (`from_name`, `reply_to_email`) |
| **Admin Overview** | `/admin/dashboard` | Platform Admins | Cross-tenant metrics, failure alerts, throughput gauges |
| **Admin Clients** | `/admin/clients` | Platform Admins | Searchable tenant table with status badges and quick links |
| **Admin Client Detail**| `/admin/clients/:id` | Platform Admins | Deep-dive tenant view, plan switcher, key audit |
| **Admin Plans** | `/admin/plans` | Platform Admins | Tier management (Starter, Pro, Enterprise) |

---

## Running Automated Tests

Run the full backend test suite inside the Docker container:

```bash
docker compose exec api pytest -v
```

All feature tests run against an isolated test database and verify:
- Ingestion, deduplication, idempotency hashing, and priority ordering
- Argon2id password hashing, session tokens, and brute-force lockouts
- Self-service API key lifecycles, hashing, prefix matching, and instant revocation
- Worker locking (`FOR UPDATE SKIP LOCKED`), retries, dead-letter queue, and lock reaper
- Template rendering and sensitive payload redaction
- SendGrid integration with MockTransport and credential sanitization
- Safety limits, daily quota caps, and plan enforcement
