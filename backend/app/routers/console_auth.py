"""Console authentication endpoints: signup, login, logout, me."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from threading import Lock
import time
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_session_user
from app.models import Client, Session as SessionModel, User
from app.schemas.console_auth import (
    AuthResponse,
    LoginRequest,
    SignupRequest,
)
from app.security import (
    hash_password,
    hash_token,
    new_session_token,
    verify_password,
)


class LoginThrottle:
    """Thread-safe in-memory sliding window throttle for failed login attempts."""

    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.failures: dict[str, list[float]] = defaultdict(list)
        self.lock = Lock()

    def is_throttled(self, key: str) -> tuple[bool, int]:
        now = time.time()
        with self.lock:
            attempts = [t for t in self.failures[key] if now - t < self.window_seconds]
            self.failures[key] = attempts
            if len(attempts) >= self.max_attempts:
                oldest = attempts[0]
                retry_after = max(1, int(self.window_seconds - (now - oldest)))
                return True, retry_after
            return False, 0

    def record_failure(self, key: str) -> None:
        now = time.time()
        with self.lock:
            self.failures[key].append(now)

    def record_success(self, key: str) -> None:
        with self.lock:
            self.failures.pop(key, None)

    def reset_for_test(self) -> None:
        with self.lock:
            self.failures.clear()


login_throttle = LoginThrottle(
    max_attempts=settings.LOGIN_MAX_ATTEMPTS,
    window_seconds=settings.LOGIN_WINDOW_MINUTES * 60,
)

router = APIRouter(
    prefix="/console/auth",
    tags=["Console Auth"],
)


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Sign up a new client tenant and owner user",
)
def signup(
    data: SignupRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    email = data.email.strip().lower()

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # In ONE atomic transaction: create client, owner user, default plan assignment, and session (no API key)
    from app.services.plans import get_or_create_default_plan
    from app.services.audit import record_audit

    default_plan = get_or_create_default_plan(db)
    company_name = data.company_name.strip()
    client = Client(
        name=company_name,
        from_name=company_name,
        status="active",
        plan_id=default_plan.id,
        rate_limit_per_sec=default_plan.rate_limit_per_sec,
        daily_email_limit=default_plan.daily_email_limit,
    )
    db.add(client)
    db.flush()

    pw_hash = hash_password(data.password)
    user = User(
        client_id=client.id,
        email=email,
        password_hash=pw_hash,
        name=data.company_name.strip(),
        role="owner",
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()

    record_audit(
        db=db,
        actor_email=email,
        action="client_signup",
        client_id=client.id,
        detail=f"Registered company '{company_name}' with plan '{default_plan.name}'",
    )

    raw_token = new_session_token()
    token_h = hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.SESSION_DAYS)

    session_obj = SessionModel(
        user_id=user.id,
        token_hash=token_h,
        expires_at=expires_at,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(session_obj)
    db.commit()
    db.refresh(user)
    db.refresh(client)

    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=raw_token,
        max_age=settings.SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
        path="/",
    )

    return AuthResponse(user=user, client=client)


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Log into the console with email and password",
)
def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    email = data.email.strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    throttle_key = f"{email}:{client_ip}"

    is_blocked, retry_after = login_throttle.is_throttled(throttle_key)
    if is_blocked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts",
            headers={"Retry-After": str(retry_after)},
        )

    user = db.query(User).filter(User.email == email).first()
    is_valid = verify_password(data.password, user.password_hash if user else None)

    if not user or not is_valid:
        login_throttle.record_failure(throttle_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wrong email or password",
        )

    login_throttle.record_success(throttle_key)
    user.last_login_at = datetime.now(timezone.utc)

    raw_token = new_session_token()
    token_h = hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.SESSION_DAYS)

    session_obj = SessionModel(
        user_id=user.id,
        token_hash=token_h,
        expires_at=expires_at,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(session_obj)
    db.commit()
    db.refresh(user)

    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=raw_token,
        max_age=settings.SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
        path="/",
    )

    return AuthResponse(user=user, client=user.client)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Log out of the console and invalidate session",
)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    token = request.cookies.get(settings.COOKIE_NAME)
    if token:
        token_h = hash_token(token)
        session_obj = (
            db.query(SessionModel)
            .filter(SessionModel.token_hash == token_h)
            .first()
        )
        if session_obj:
            db.delete(session_obj)
            db.commit()

    response.delete_cookie(
        key=settings.COOKIE_NAME,
        path="/",
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/me",
    response_model=AuthResponse,
    summary="Get currently authenticated session user and client tenant",
)
def get_me(
    user: User = Depends(get_session_user),
):
    return AuthResponse(user=user, client=user.client)
