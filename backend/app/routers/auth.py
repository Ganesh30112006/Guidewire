"""
Auth Router — /api/v1/auth

Security levels enforced:
  • Rate limited  (10/min login, 5/min register)
  • Brute-force lockout (5 failed attempts → 15 min lockout)
  • Argon2id password verify + rehash-on-upgrade
  • RS256 JWT access token (15 min) + rotating refresh token (7 days)
  • Refresh token stored in DB with revocation support
  • Audit logged: login, logout, register, password change
"""

from datetime import datetime, timedelta, timezone

import hashlib
import secrets
from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.core.database import get_db
from app.core.security import (
    hash_password, verify_password, needs_rehash,
    create_access_token, create_refresh_token, decode_token,
    record_failed_login, is_locked_out, clear_login_attempts,
)
from app.core.encryption import encrypt_field, decrypt_field
from app.dependencies.auth import get_current_user
from app.middleware.audit_logger import log_action
from app.models.models import User, RefreshToken, TokenBlacklist
from app.schemas.schemas import (
    RegisterRequest, LoginRequest, TokenResponse,
    RefreshRequest, ChangePasswordRequest, OKResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

_ACCESS_EXPIRE_SECS = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


def _email_hash(email: str) -> str:
    """BLAKE2b hash of normalised email for unique lookups (not decryptable)."""
    return hashlib.blake2b(email.lower().encode(), digest_size=32).hexdigest()


# ── Register ───────────────────────────────────────────────────────────────────

@router.post("/register", response_model=OKResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_REGISTER)
async def register(
    request: Request,
    body: RegisterRequest = Body(...),
    db: AsyncSession = Depends(get_db),
) -> OKResponse:
    email_norm = body.email.lower().strip()
    eh = _email_hash(email_norm)

    # Duplicate check via hash (O(1) index lookup, no plaintext comparison)
    existing = await db.scalar(select(User.id).where(User.email_hash == eh))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    user = User(
        name=body.name,
        email_encrypted=encrypt_field(email_norm),
        email_hash=eh,
        phone_encrypted=encrypt_field(body.phone) if body.phone else None,
        password_hash=hash_password(body.password),
        role="worker",
        city=body.city,
        platform=body.platform,
        avg_daily_income_enc=encrypt_field(str(body.avg_daily_income)),
    )
    db.add(user)
    await db.flush()

    await log_action(db, request=request, action="auth.register",
                     user_id=user.id, detail={"platform": body.platform})
    return OKResponse(message="Account created. Please log in.")


# ── Login ──────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
async def login(
    request: Request,
    response: Response,
    body: LoginRequest = Body(...),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    email_norm = body.email.lower().strip()

    # Lockout check before any DB query to prevent timing oracle
    if is_locked_out(email_norm):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many failed attempts. Try again in {settings.LOCKOUT_DURATION_MINUTES} minutes.",
        )

    eh = _email_hash(email_norm)
    user: User | None = await db.scalar(select(User).where(User.email_hash == eh))

    # Always run password verify (even on miss) to prevent timing attacks
    dummy_hash = "$argon2id$v=19$m=65536,t=3,p=4$dummysalt1234567$dummyhashvalue123456"
    pwd_to_check = user.password_hash if user else dummy_hash
    valid = verify_password(body.password, pwd_to_check)

    if not user or not valid or not user.is_active:
        attempts = record_failed_login(email_norm)
        remaining = settings.MAX_LOGIN_ATTEMPTS - attempts
        if remaining <= 0:
            await log_action(db, request=request, action="auth.lockout",
                             detail={"email_hash": eh})
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Account temporarily locked due to multiple failed attempts.",
            )
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            f"Invalid credentials. {max(remaining, 0)} attempt(s) remaining.",
        )

    # Rehash with upgraded parameters if needed (transparent upgrade)
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)

    clear_login_attempts(email_norm)

    # Issue tokens
    access_token = create_access_token(user.id, user.role)
    raw_refresh, jti = create_refresh_token(user.id)

    rt = RefreshToken(
        jti=jti,
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(rt)

    csrf_token = secrets.token_urlsafe(32)

    # Set refresh token as httpOnly cookie (XSS-safe)
    response.set_cookie(
        key="refresh_token",
        value=raw_refresh,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="strict",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth",
    )
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="strict",
        max_age=_ACCESS_EXPIRE_SECS,
        path="/",
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,
        secure=settings.ENVIRONMENT == "production",
        samesite="strict",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )

    await log_action(db, request=request, action="auth.login", user_id=user.id)

    return TokenResponse(access_token=access_token, expires_in=_ACCESS_EXPIRE_SECS)


# ── Refresh ────────────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Issues a new access token and rotates the refresh token.
    Detects refresh token reuse (replay attack) and revokes the entire chain.
    """
    raw = request.cookies.get("refresh_token")
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")

    try:
        payload = decode_token(raw)
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    if payload.get("typ") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")

    jti = payload["jti"]
    user_id = payload["sub"]

    rt: RefreshToken | None = await db.get(RefreshToken, jti)
    if not rt or rt.is_revoked or rt.user_id != user_id:
        # Possible replay attack — revoke all refresh tokens for this user
        await _revoke_all_refresh_tokens(db, user_id)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token is invalid or reused")

    if rt.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token expired")

    user: User | None = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")

    # Rotate: revoke old, issue new
    rt.is_revoked = True
    new_access = create_access_token(user.id, user.role)
    new_raw, new_jti = create_refresh_token(user.id)

    new_rt = RefreshToken(
        jti=new_jti,
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        rotated_from=jti,
    )
    db.add(new_rt)

    response.set_cookie(
        key="refresh_token",
        value=new_raw,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="strict",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth",
    )
    response.set_cookie(
        key="access_token",
        value=new_access,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="strict",
        max_age=_ACCESS_EXPIRE_SECS,
        path="/",
    )

    return TokenResponse(access_token=new_access, expires_in=_ACCESS_EXPIRE_SECS)


# ── Logout ─────────────────────────────────────────────────────────────────────

@router.post("/logout", response_model=OKResponse)
async def logout(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OKResponse:
    # Blacklist the current access token
    from fastapi.security import HTTPBearer
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        raw_token = auth_header[7:]
        try:
            payload = decode_token(raw_token)
            exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
            bl = TokenBlacklist(jti=payload["jti"], user_id=current_user.id, expires_at=exp)
            db.add(bl)
        except Exception:
            pass

    # Revoke refresh token from cookie
    raw_refresh = request.cookies.get("refresh_token")
    if raw_refresh:
        try:
            rp = decode_token(raw_refresh)
            rt: RefreshToken | None = await db.get(RefreshToken, rp["jti"])
            if rt:
                rt.is_revoked = True
        except Exception:
            pass

    response.delete_cookie("refresh_token", path="/api/v1/auth")
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("csrf_token", path="/")
    await log_action(db, request=request, action="auth.logout", user_id=current_user.id)
    return OKResponse(message="Logged out successfully")


# ── Change password ────────────────────────────────────────────────────────────

@router.post("/change-password", response_model=OKResponse)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OKResponse:
    if not verify_password(body.current_password, current_user.password_hash):
        try:
            email_norm = decrypt_field(current_user.email_encrypted).lower().strip()
        except Exception:
            email_norm = current_user.id
        record_failed_login(email_norm)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")

    current_user.password_hash = hash_password(body.new_password)

    # Revoke all active refresh tokens to force re-login on other devices
    await _revoke_all_refresh_tokens(db, current_user.id)

    await log_action(db, request=request, action="auth.change_password", user_id=current_user.id)
    return OKResponse(message="Password changed. Please log in again.")


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _revoke_all_refresh_tokens(db: AsyncSession, user_id: str) -> None:
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id,
            RefreshToken.is_revoked == False,
        )
    )
    for rt in result.scalars().all():
        rt.is_revoked = True
