"""Security utilities: API key generation, SHA-256 hashing, and constant-time HMAC verification."""

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config import settings

API_KEY_PREFIX = "nh_live_"
PREFIX_LENGTH = 12  # "nh_live_" (8 chars) + next 4 chars = 12 chars total

_hasher = PasswordHasher()
# Fixed dummy hash for constant-time comparison when email is unknown
_DUMMY_HASH = _hasher.hash("dummy_constant_time_timing_password_protection")


def hash_password(password: str) -> str:
    """Hashes a password using Argon2id."""
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    """Verifies a password against an Argon2 hash.
    
    If password_hash is None (unknown user), verifies against a fixed dummy hash
    to prevent timing attacks, always returning False.
    """
    if not password_hash:
        try:
            _hasher.verify(_DUMMY_HASH, password)
        except Exception:
            pass
        return False

    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, Exception):
        return False


def new_session_token() -> str:
    """Generates a random 32-byte URL-safe session token."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Computes SHA-256 hex digest for a session token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_key(api_key: str) -> str:
    """Computes SHA-256 hex digest for an API key."""
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def generate_api_key() -> tuple[str, str, str]:
    """Generates a secure API key.
    
    Returns:
        tuple of (full_key, sha256_hash, short_prefix)
    """
    raw_token = secrets.token_urlsafe(32)
    full_key = f"{API_KEY_PREFIX}{raw_token}"
    api_key_hash = hash_key(full_key)
    short_prefix = full_key[:PREFIX_LENGTH]
    return full_key, api_key_hash, short_prefix


def verify_admin_key(provided_key: str | None) -> bool:
    """Verifies provided admin key against configured ADMIN_KEY in constant time."""
    if not provided_key:
        return False
    return hmac.compare_digest(
        provided_key.encode("utf-8"),
        settings.ADMIN_KEY.encode("utf-8"),
    )

