"""
GigGo — FastAPI Application Entrypoint

Security levels active:
  [L1] CORS            — strict origin whitelist
  [L2] Security Headers — XSS / clickjacking / HSTS / CSP
  [L3] Rate Limiting   — slowapi per-IP limits
  [L4] Authentication  — RS256 JWT + Argon2id
  [L5] Authorization   — RBAC (worker / agent / admin)
  [L6] Input Validation — Pydantic v2 strict mode
  [L7] Data Encryption — AES-256-GCM on PII fields
  [L8] SQL Safety      — SQLAlchemy ORM only (no raw queries)
  [L9] Audit Logging   — every sensitive action persisted
  [L10] Brute-force    — login lockout + refresh token rotation
"""

import structlog
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.core.database import engine, Base
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routers.auth import router as auth_router
from app.routers.claims import router as claims_router
from app.routers.events import router as events_router
from app.routers.fraud import router as fraud_router
from app.routers.routes import (
    workers_router, insurance_router, alerts_router, admin_router
)

settings = get_settings()

# ── Structured logging (JSON in production) ────────────────────────────────────
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(
        logging.DEBUG if settings.DEBUG else logging.INFO
    ),
)

# ── Lifespan (DB table creation on startup) ────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables (use Alembic migrations in production instead)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


# ── App factory ────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,       # Disable Swagger in production
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)

# [L3] Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# [L1] CORS — strict whitelist
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-CSRF-Token"],
    max_age=600,
)

# [L2] Security headers
app.add_middleware(SecurityHeadersMiddleware)


# ── Global exception handler (never leak stack traces) ─────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log = structlog.get_logger()
    log.error("unhandled_exception", path=request.url.path, error=str(exc), exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# ── Routers ────────────────────────────────────────────────────────────────────
PREFIX = "/api/v1"

app.include_router(auth_router,      prefix=PREFIX)
app.include_router(workers_router,   prefix=PREFIX)
app.include_router(claims_router,    prefix=PREFIX)
app.include_router(events_router,    prefix=PREFIX)
app.include_router(fraud_router,     prefix=PREFIX)
app.include_router(insurance_router, prefix=PREFIX)
app.include_router(alerts_router,    prefix=PREFIX)
app.include_router(admin_router,     prefix=PREFIX)


# ── Health check (no auth) ─────────────────────────────────────────────────────
@app.get("/health", tags=["health"], include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "version": settings.APP_VERSION}


@app.get("/health/db", tags=["health"], include_in_schema=False)
async def health_db() -> dict:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        log = structlog.get_logger()
        log.error("database_healthcheck_failed", error=str(exc), exc_info=exc)
        return JSONResponse(
            status_code=503,
            content={"status": "error", "database": "disconnected"},
        )
