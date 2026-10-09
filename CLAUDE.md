# NotifyHub Developer Guidelines and Architecture Rules

NotifyHub is a generic, backend-first multi-tenant email notification service with self-service console management and API key automation.

## Workspace Layout
- `backend/`: FastAPI application, SQLAlchemy 2.x, PostgreSQL 16, Alembic migrations, background queue worker, MailHog SMTP.
  - `app/routers/`: Modular route handlers (`events.py`, `console_auth.py`, `console_keys.py`, `console_client.py`, `admin.py`, etc.).
  - `app/services/`: Intake, delivery processing, stats calculations, rate limiting, and plan enforcement.
  - `app/models.py`: SQLAlchemy database models (`User`, `Session`, `ApiKey`, `Client`, `Plan`, `Delivery`, `NotificationEvent`, etc.).
  - `worker/`: Background worker process (`worker.main`) using PostgreSQL `FOR UPDATE SKIP LOCKED`, lock reaper, and pluggable providers (`MailHog`, `SendGrid`).
  - `tests/`: Feature-focused automated test suites (`test_auth.py`, `test_api_keys.py`, `test_events.py`, `test_scheduling.py`, `test_limits.py`, `test_plans.py`, `test_stats.py`, `test_admin.py`, `test_sendgrid_provider.py`, `test_worker.py`, `test_console_client.py`, `test_step5_smoke.py`).
- `frontend/`: React + Vite SPA using Vanilla CSS and custom router. Zero external UI dependencies.
  - `src/pages/client/`: Tenant owner portal pages (`Dashboard.jsx`, `Deliveries.jsx`, `Templates.jsx`, `ApiKeys.jsx`, `Profile.jsx`).
  - `src/pages/admin/`: Platform administrator portal pages (`AdminOverview.jsx`, `AdminClients.jsx`, `AdminClientDetail.jsx`, `AdminPlans.jsx`).
  - `src/components/`: Reusable primitives (`Sidebar.jsx`, `Topbar.jsx`, `Layout.jsx`, `Toast.jsx`, `PageShell.jsx`).

## Architecture and Credential Model

NotifyHub maintains three strictly separated types of credentials:

### 1. Person Console Sessions (Browser)
- **Authentication**: Email + Argon2id password (`POST /console/auth/login`, `POST /console/auth/signup`).
- **Transport**: `nh_session` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production).
- **CSRF Protection**: All mutating (non-GET) console requests require `X-Requested-With: notifyhub-console`.
- **Roles**:
  - `owner`: Associated with a tenant (`client_id`). Accesses client console (`/app/*`). Blocked from `/admin/*`.
  - `admin`: Platform administrator (`client_id = null`). Accesses admin console (`/admin/*`). Blocked from `/app/*`.
- **Brute-Force Throttle**: In-memory rate limiter limits login attempts to 10 per 15 minutes per identifier, returning HTTP 429.

### 2. Server API Keys (Machine-to-Machine)
- **Header**: `X-API-Key: nh_live_<token>`
- **Scope**: Used by client servers calling `/api/events`.
- **Storage**: Keys are revealed **only once** upon creation (`POST /console/api-keys`). The database stores only the prefix (`nh_live_XXXX`) and an HMAC/SHA-256 hash.
- **Limit**: Maximum 5 active keys per client tenant.
- **Lifecycle**: Clients can revoke keys at any time (`POST /console/api-keys/{id}/revoke`). Revoked keys immediately return HTTP 401.

### 3. System Admin Key
- **Header**: `X-Admin-Key: <ADMIN_KEY>`
- Used for machine access to `/admin/*` endpoints.

## Mail Delivery Architecture
- **MailHog (SMTP)**: Default provider for local development (`MAIL_PROVIDER=smtp`, port 1025, inbox on 8025).
- **SendGrid**: Enabled via `MAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY`, and `FROM_EMAIL`.
- **Daily Limits**: Capped globally by `GLOBAL_DAILY_LIMIT=90` (SendGrid free-tier safety margin).
- **Privacy Guarantee**: SendGrid keys, email subjects, bodies, and OTP data are never written to application logs.

## Design Aesthetic (Google AI Studio Inspired)
- **Palette**: Dark background (`#0b0b0c`), dark cards (`#141415`), borders (`#232325`), typography (`DM Sans`).
- **Accent Philosophy**: Colors are strictly reserved for status indicators:
  - Green (`#4ade80`): Active / Success / All systems running
  - Red (`#f87171`): Revoked / Error / Failed
  - Amber (`#fbbf24`): Warning / Rate Limit / Attention
  - Grey (`#85858b`): Disabled / Inactive
- **Shapes**: Pill buttons (`border-radius: 99px`), modern cards (`border-radius: 18px`).
- **Dependencies**: Pure React, native fetch client with credentials, custom history router. No Tailwind, Axios, Lucide, or external UI libraries.

## Testing & Commands
- **Run Backend Tests**: `docker compose exec api pytest`
- **Seed Admin User**: `docker compose exec api python scripts/seed.py`
- **Build Frontend**: `cd frontend && npm run build`
- **Run Frontend Dev**: `cd frontend && npm run dev`
