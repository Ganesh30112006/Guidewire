"""
Security Module — GigGo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Security layers implemented here:
  • Argon2id   — Password hashing (PHC winner, memory-hard, GPU-resistant)
  • RS256 JWT  — Asymmetric token signing (private key signs, public key verifies)
  • Refresh    — Rotating refresh tokens with server-side blacklist
  • Lockout    — In-memory brute-force tracking (swap to Redis in production)
"""

from __future__ import annotations

import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from jose import jwt, JWTError
from jose.exceptions import ExpiredSignatureError

from app.core.config import get_settings

settings = get_settings()

# ── Argon2id hasher (tuned for security/speed balance) ────────────────────────
# time_cost=3, memory_cost=65536 (64MB), parallelism=4 are OWASP recommendations
_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Hash a password with Argon2id. Returns PHC string."""
    return _hasher.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time Argon2id password verification."""
    try:
        return _hasher.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(hashed: str) -> bool:
    """True if the hash was made with old parameters and should be upgraded."""
    return _hasher.check_needs_rehash(hashed)


# ── RSA key loading ────────────────────────────────────────────────────────────

def _load_key(path: str) -> str:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(
            f"RSA key not found at {path}. "
            "Generate with: openssl genrsa -out keys/private.pem 4096 && "
            "openssl rsa -in keys/private.pem -pubout -out keys/public.pem"
        )
    return p.read_text()


def _private_key() -> str:
    return _load_key(settings.RSA_PRIVATE_KEY_PATH)


def _public_key() -> str:
    return _load_key(settings.RSA_PUBLIC_KEY_PATH)


# ── JWT — RS256 ────────────────────────────────────────────────────────────────
#  Access token  : short-lived (15 min), signed with RSA private key
#  Refresh token : long-lived (7 days), stored hash in DB
ALGORITHM = "RS256"


def create_access_token(subject: str, role: str, extra: dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": subject,               # User ID
        "role": role,
        "iat": now,
        "exp": expire,
        "jti": str(uuid.uuid4()),     # Unique token ID (for blacklisting)
        "typ": "access",
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, _private_key(), algorithm=ALGORITHM)


def create_refresh_token(subject: str) -> tuple[str, str]:
    """Returns (raw_token, jti). Store the jti in DB to enable revocation."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    jti = str(uuid.uuid4())
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": expire,
        "jti": jti,
        "typ": "refresh",
    }
    return jwt.encode(payload, _private_key(), algorithm=ALGORITHM), jti


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT. Raises JWTError on any failure.
    Uses the RSA public key so only our private-key-signed tokens pass.
    """
    return jwt.decode(token, _public_key(), algorithms=[ALGORITHM])


def decode_token_unverified_exp(token: str) -> dict[str, Any]:
    """Decode without raising on expiry (used for refresh token rotation)."""
    try:
        return jwt.decode(
            token,
            _public_key(),
            algorithms=[ALGORITHM],
            options={"verify_exp": False},
        )
    except JWTError as exc:
        raise exc


# ── In-memory brute-force tracker ─────────────────────────────────────────────
# For production: replace with Redis (INCR + EXPIRE) for multi-instance safety.

_login_attempts: dict[str, list[float]] = defaultdict(list)


def record_failed_login(identifier: str) -> int:
    """Record a failed login. Returns current attempt count in window."""
    window = settings.LOCKOUT_DURATION_MINUTES * 60
    now = time.monotonic()
    attempts = [t for t in _login_attempts[identifier] if now - t < window]
    attempts.append(now)
    _login_attempts[identifier] = attempts
    return len(attempts)


def is_locked_out(identifier: str) -> bool:
    window = settings.LOCKOUT_DURATION_MINUTES * 60
    now = time.monotonic()
    recent = [t for t in _login_attempts[identifier] if now - t < window]
    _login_attempts[identifier] = recent
    return len(recent) >= settings.MAX_LOGIN_ATTEMPTS


def clear_login_attempts(identifier: str) -> None:
    _login_attempts.pop(identifier, None)
