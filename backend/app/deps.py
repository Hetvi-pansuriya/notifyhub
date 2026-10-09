"""FastAPI dependency providers for authentication, session verification, and rate limiting."""

from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import ApiKey, Client, Session as SessionModel, User
from app.ratelimit import rate_limiter
from app.security import hash_key, hash_token, verify_admin_key

api_key_header = APIKeyHeader(name="X-API-Key", scheme_name="ClientApiKey", auto_error=False)
admin_key_header = APIKeyHeader(name="X-Admin-Key", scheme_name="AdminApiKey", auto_error=False)


def get_session_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """Reads session token from cookie, verifies hash and non-expired status, and returns the User."""
    token = request.cookies.get(settings.COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    token_h = hash_token(token)
    session_obj = (
        db.query(SessionModel)
        .filter(SessionModel.token_hash == token_h)
        .first()
    )
    if not session_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    now = datetime.now(timezone.utc)
    exp = session_obj.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if exp < now:
        db.delete(session_obj)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired",
        )

    if not session_obj.user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return session_obj.user


def require_admin(
    request: Request,
    db: Session = Depends(get_db),
) -> None:
    """Validates admin access via X-Admin-Key header OR admin-role session.
    
    Owner sessions receive 403. Missing credentials receive 401.
    Cookie-authenticated non-GET requests require X-Requested-With: notifyhub-console.
    """
    x_admin_key = request.headers.get("x-admin-key")
    if x_admin_key:
        if not verify_admin_key(x_admin_key):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing admin key",
            )
        return

    # Check session cookie
    token = request.cookies.get(settings.COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin key",
        )

    user = get_session_user(request, db)
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )

    if request.method != "GET":
        csrf = request.headers.get("x-requested-with")
        if csrf != "notifyhub-console":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Missing or invalid CSRF header",
            )


def require_owner_session(
    request: Request,
    db: Session = Depends(get_db),
) -> tuple[User, Client]:
    """Requires an authenticated owner session. API keys are strictly rejected (401).
    
    Enforces CSRF guard on non-GET requests.
    """
    if request.method != "GET":
        csrf = request.headers.get("x-requested-with")
        if csrf != "notifyhub-console":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Missing or invalid CSRF header",
            )

    user = get_session_user(request, db)
    if user.role != "owner" or not user.client:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner privileges required",
        )

    return user, user.client


def get_current_client(
    request: Request,
    db: Session = Depends(get_db),
    x_api_key: str | None = Security(api_key_header),
) -> Client:
    """Authenticates client via X-API-Key OR owner session cookie.
    
    - If X-API-Key is present: hashes it and looks up active ApiKey for active Client (or 401).
      Updates last_used_at only if stored timestamp is older than 60s.
    - If no X-API-Key: inspects owner session cookie. Non-GET requires X-Requested-With header (else 403).
    - If client is disabled: session requests may read data, but POST /api/events returns 403 "Your service is paused".
    - Rate limit is applied to both authentication methods.
    """
    client: Client | None = None

    if x_api_key:
        hashed_key = hash_key(x_api_key)
        api_key_record = (
            db.query(ApiKey)
            .filter(ApiKey.key_hash == hashed_key)
            .first()
        )

        if not api_key_record or api_key_record.status != "active":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or revoked API key",
            )

        client = api_key_record.client
        if not client:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Client not found",
            )

        if client.status != "active":
            if request.method == "POST" and request.url.path.rstrip("/").endswith("/api/events"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your service is paused",
                )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Client account is disabled",
            )

        # Update last_used_at only if older than 60 seconds
        now = datetime.now(timezone.utc)
        if api_key_record.last_used_at is None:
            api_key_record.last_used_at = now
            db.commit()
        else:
            lua = api_key_record.last_used_at
            if lua.tzinfo is None:
                lua = lua.replace(tzinfo=timezone.utc)
            if (now - lua).total_seconds() > 60:
                api_key_record.last_used_at = now
                db.commit()

    else:
        # No X-API-Key header -> check owner session cookie
        token = request.cookies.get(settings.COOKIE_NAME)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing X-API-Key header or session",
            )

        # CSRF guard for session requests
        if request.method != "GET":
            csrf = request.headers.get("x-requested-with")
            if csrf != "notifyhub-console":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Missing or invalid CSRF header",
                )

        user = get_session_user(request, db)
        if user.role != "owner" or not user.client:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Owner privileges required",
            )

        client = user.client

        if client.status != "active":
            if request.method == "POST" and request.url.path.rstrip("/").endswith("/api/events"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your service is paused",
                )

    # In-process token bucket rate limiter
    allowed, retry_after = rate_limiter.check(
        client_id=client.id,
        rate_limit_per_sec=client.rate_limit_per_sec,
    )
    if not allowed:
        try:
            from app.models import RateLimitHit
            hit = RateLimitHit(client_id=client.id)
            db.add(hit)
            db.commit()
        except Exception:
            db.rollback()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )

    return client
