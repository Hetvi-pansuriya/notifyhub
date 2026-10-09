"""Console API key management endpoints (owner session only)."""

from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import require_owner_session
from app.models import ApiKey, Client, User
from app.schemas.console_keys import (
    ApiKeyCreateRequest,
    ApiKeyCreateResponse,
    ApiKeyListItemResponse,
    ApiKeyRevokeResponse,
)
from app.security import generate_api_key

router = APIRouter(
    prefix="/console/api-keys",
    tags=["Console API Keys"],
)


@router.get(
    "",
    response_model=list[ApiKeyListItemResponse],
    summary="List API keys for current client tenant",
    description="Returns all API keys. Never exposes raw secret keys or hashes.",
)
def list_api_keys(
    auth: tuple[User, Client] = Depends(require_owner_session),
    db: Session = Depends(get_db),
):
    _, client = auth
    keys = (
        db.query(ApiKey)
        .filter(ApiKey.client_id == client.id)
        .order_by(ApiKey.created_at.desc())
        .all()
    )
    return keys


@router.post(
    "",
    response_model=ApiKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new self-service API key",
    description="Enforces MAX_ACTIVE_KEYS limit (5). Reveals full API key ONCE in response.",
)
def create_api_key(
    data: ApiKeyCreateRequest,
    auth: tuple[User, Client] = Depends(require_owner_session),
    db: Session = Depends(get_db),
):
    user, client = auth

    active_count = (
        db.query(ApiKey)
        .filter(ApiKey.client_id == client.id, ApiKey.status == "active")
        .count()
    )
    if active_count >= settings.MAX_ACTIVE_KEYS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Revoke a key before creating a new one",
        )

    full_key, key_hash, prefix = generate_api_key()
    new_key = ApiKey(
        client_id=client.id,
        name=data.name.strip(),
        key_prefix=prefix,
        key_hash=key_hash,
        status="active",
        created_by_user_id=user.id,
    )
    db.add(new_key)
    db.commit()
    db.refresh(new_key)

    from app.services.audit import record_audit
    record_audit(
        db=db,
        actor_email=user.email,
        action="key_created",
        client_id=client.id,
        detail=f"Created API key '{new_key.name}' (prefix: {prefix})",
    )

    return ApiKeyCreateResponse(
        id=new_key.id,
        name=new_key.name,
        key_prefix=new_key.key_prefix,
        status=new_key.status,
        created_at=new_key.created_at,
        last_used_at=new_key.last_used_at,
        api_key=full_key,
    )


@router.post(
    "/{key_id}/revoke",
    response_model=ApiKeyRevokeResponse,
    summary="Revoke an existing API key",
    description="Revokes the key immediately. Another tenant's key returns 404. Revoking twice returns 200.",
)
def revoke_api_key(
    key_id: uuid.UUID,
    auth: tuple[User, Client] = Depends(require_owner_session),
    db: Session = Depends(get_db),
):
    user, client = auth

    key = (
        db.query(ApiKey)
        .filter(ApiKey.id == key_id, ApiKey.client_id == client.id)
        .first()
    )
    if not key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    if key.status != "revoked":
        key.status = "revoked"
        key.revoked_at = datetime.now(timezone.utc)
        from app.services.audit import record_audit
        record_audit(
            db=db,
            actor_email=user.email,
            action="key_revoked",
            client_id=client.id,
            detail=f"Revoked API key '{key.name}' (prefix: {key.key_prefix})",
        )
        db.commit()
        db.refresh(key)

    return ApiKeyRevokeResponse(
        id=key.id,
        name=key.name,
        status=key.status,
        revoked_at=key.revoked_at,
    )
