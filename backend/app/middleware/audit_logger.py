"""
Structured audit logger — writes a JSON log line for every sensitive action.

Each entry captures:  user_id | action | resource | ip | user_agent | detail
"""

import json
import structlog
from datetime import datetime, timezone
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import AuditLog

logger = structlog.get_logger("audit")


async def log_action(
    db: AsyncSession,
    *,
    request: Request,
    action: str,
    user_id: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    detail: dict | None = None,
) -> None:
    """
    Persist an audit log entry to the database AND emit a structured log line.
    Failures are swallowed — audit logging must never crash the request.
    """
    ip = _extract_ip(request)
    ua = request.headers.get("user-agent", "")[:500]
    detail_json = json.dumps(detail) if detail else None

    try:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip,
            user_agent=ua,
            detail=detail_json,
            created_at=datetime.now(timezone.utc),
        )
        db.add(entry)
        await db.flush()        # Write without committing (outer transaction commits)
    except Exception as exc:
        logger.error("audit_db_write_failed", error=str(exc))

    logger.info(
        "audit",
        action=action,
        user_id=user_id,
        resource_type=resource_type,
        resource_id=resource_id,
        ip=ip,
        detail=detail,
    )


def _extract_ip(request: Request) -> str:
    """Extract real IP, honoring trusted proxy headers."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    if request.client:
        return request.client.host
    return "unknown"
