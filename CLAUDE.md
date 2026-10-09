# NotifyHub Developer Guidelines and Architecture Rules

NotifyHub is a backend-first email notification platform with self-service console management and API key automation.

## Workspace Layout
- `backend/`: FastAPI application, SQLAlchemy 2.x, PostgreSQL, Alembic migrations, Background worker, MailHog SMTP.
- `frontend/`: React + Vite SPA using Vanilla CSS and custom router. Zero external UI dependencies.

## Architecture and Credential Model

NotifyHub maintains two strictly separated types of credentials:

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

## Design Aesthetic (Google AI Studio Inspired)
- **Palette**: Dark background (`#0b0b0c`), dark cards (`#141415`), borders (`#232325`), typography (`DM Sans`).
- **Accent Philosophy**: Colors are strictly reserved for status indicators:
  - Green (`#4ade80`): Active / Success / All systems running
  - Red (`#f87171`): Revoked / Error / Failed
  - Amber (`#fbbf24`): Warning / Rate Limit / Attention
  - Grey (`#85858b`): Disabled / Inactive
- **Shapes**: Pill buttons (`border-radius: 99px`), modern cards (`border-radius: 18px`).
- **Dependencies**: Pure React, native fetch client with credentials, custom history router. No Tailwind, Axios, Lucide, or external UI libraries.

## Testing & Quality
- Run tests: `docker compose exec api pytest` (54/54 passing).
- Run seed: `docker compose exec api python scripts/seed.py`.
