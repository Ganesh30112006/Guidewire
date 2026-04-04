"""
Security middleware — applied at the ASGI layer (before any route handler).

Level 1 — Security Headers
    Prevents XSS, clickjacking, MIME sniffing, and information leakage.

Level 2 — Request ID
    Every request gets a unique ID injected into headers and logs.
"""

import uuid
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from app.core.config import get_settings

settings = get_settings()

_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "frame-ancestors 'none';"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject hardened security headers on every response."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Attach a unique request ID for tracing
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        response = await call_next(request)

        # ── Anti-XSS ──────────────────────────────────────────────────────────
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = _CSP

        # ── Anti-clickjacking ──────────────────────────────────────────────────
        response.headers["X-Frame-Options"] = "DENY"

        # ── Transport security ─────────────────────────────────────────────────
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        # ── Information hiding ─────────────────────────────────────────────────
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Server"] = "GigGo"       # Hide actual server name

        # ── Tracing ───────────────────────────────────────────────────────────
        response.headers["X-Request-ID"] = request_id

        return response
