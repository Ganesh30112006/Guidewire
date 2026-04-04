"""
FastAPI auth dependencies — injected into route handlers.

Security levels enforced here:
  Level 3 — Token validation (RS256, expiry, blacklist)
  Level 4 — Role-based access control (RBAC)
  Level 5 — Resource ownership (workers can only see their own data)
"""

from __future__ import annotations
from typing import Callable
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.models import User, TokenBlacklist

_bearer = HTTPBearer(auto_error=False)
_settings = get_settings()


def _validate_csrf(request: Request) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return

    csrf_cookie = request.cookies.get("csrf_token")
    csrf_header = request.headers.get("X-CSRF-Token")
    if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid CSRF token",
        )


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Validate Bearer token and return the authenticated User.
    Checks: signature (RS256), expiry, token type, and blacklist.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials if credentials else request.cookies.get("access_token")
    using_cookie_auth = not credentials and bool(token)
    if not token:
        raise credentials_exc

    if using_cookie_auth and _settings.ENABLE_CSRF_PROTECTION:
        _validate_csrf(request)

    try:
        payload = decode_token(token)
    except JWTError:
        raise credentials_exc

    if payload.get("typ") != "access":
        raise credentials_exc

    user_id: str | None = payload.get("sub")
    jti: str | None = payload.get("jti")

    if not user_id or not jti:
        raise credentials_exc

    # Check token blacklist (covers logout + revocation)
    blacklisted = await db.scalar(
        select(TokenBlacklist.jti).where(TokenBlacklist.jti == jti)
    )
    if blacklisted:
        raise credentials_exc

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise credentials_exc

    return user


def require_role(*roles: str) -> Callable:
    """
    Factory dependency — restricts endpoint to specified roles.
    Usage: Depends(require_role("admin", "agent"))
    """
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(roles)}",
            )
        return current_user
    return _check


def require_self_or_role(user_id_param: str, *roles: str) -> Callable:
    """
    Allows access if the caller is the resource owner OR has one of the given roles.
    Usage: Depends(require_self_or_role("worker_id", "admin", "agent"))
    """
    async def _check(
        request: Request,
        current_user: User = Depends(get_current_user),
    ) -> User:
        target_id = request.path_params.get(user_id_param)
        # Admin/agent can access any worker resource
        if current_user.role in roles:
            return current_user
        # Workers can only access their own resource
        if target_id and current_user.id == target_id:
            return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only access your own data.",
        )
    return _check


# Convenience aliases
require_admin          = require_role("admin")
require_agent_or_admin = require_role("agent", "admin")
require_authenticated  = get_current_user
