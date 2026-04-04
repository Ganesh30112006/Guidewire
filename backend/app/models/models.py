"""
SQLAlchemy ORM models — MySQL (utf8mb4)

Security notes:
  • phone / email stored AES-256-GCM encrypted (see app.core.encryption)
  • avg_daily_income stored as encrypted string to protect financial PII
  • password_hash is Argon2id (never stored in plaintext)
  • All PKs are UUID v4 — no sequential integer IDs (enumeration-resistant)
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean, DateTime, Enum, Float, ForeignKey,
    Integer, String, Text, UniqueConstraint, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


# ── Users (workers / agents / admins) ─────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[str]              = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str]            = mapped_column(String(120), nullable=False)
    email_encrypted: Mapped[str] = mapped_column(Text, nullable=False)        # AES-256-GCM
    email_hash: Mapped[str]      = mapped_column(String(64), nullable=False, unique=True)  # BLAKE2b for lookups
    phone_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)  # AES-256-GCM
    password_hash: Mapped[str]   = mapped_column(Text, nullable=False)         # Argon2id
    role: Mapped[str]            = mapped_column(
        Enum("worker", "agent", "admin", name="user_role"),
        nullable=False,
        default="worker",
    )
    city: Mapped[str | None]     = mapped_column(String(100), nullable=True)
    platform: Mapped[str | None] = mapped_column(String(80), nullable=True)
    avg_daily_income_enc: Mapped[str | None] = mapped_column(Text, nullable=True)  # AES-256-GCM
    risk_score: Mapped[float]    = mapped_column(Float, default=50.0)
    trust_score: Mapped[float]   = mapped_column(Float, default=80.0)
    zone: Mapped[str | None]     = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool]      = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool]    = mapped_column(Boolean, default=False)
    assigned_agent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    # Relationships
    claims: Mapped[list["Claim"]]         = relationship(
        "Claim",
        back_populates="worker",
        cascade="all, delete-orphan",
        foreign_keys="Claim.worker_id",
    )
    policies: Mapped[list["Policy"]]      = relationship("Policy", back_populates="worker", cascade="all, delete-orphan")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    audit_logs: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="user")
    earnings_proofs: Mapped[list["WeeklyEarningsProof"]] = relationship(
        "WeeklyEarningsProof",
        back_populates="worker",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_users_role", "role"),
        Index("ix_users_zone", "zone"),
        Index("ix_users_email_hash", "email_hash"),
    )


# ── Insurance Plans ────────────────────────────────────────────────────────────

class InsurancePlan(Base):
    __tablename__ = "insurance_plans"

    id: Mapped[str]                = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str]              = mapped_column(String(120), nullable=False, unique=True)
    weekly_premium: Mapped[float]  = mapped_column(Float, nullable=False)
    coverage: Mapped[float]        = mapped_column(Float, nullable=False)
    risks: Mapped[str]             = mapped_column(Text, nullable=False)   # JSON array stored as text
    is_popular: Mapped[bool]       = mapped_column(Boolean, default=False)
    is_active: Mapped[bool]        = mapped_column(Boolean, default=True)
    created_by: Mapped[str]        = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    policies: Mapped[list["Policy"]] = relationship("Policy", back_populates="plan")


# ── Worker Policies (plan subscriptions) ──────────────────────────────────────

class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[str]               = mapped_column(String(36), primary_key=True, default=_uuid)
    worker_id: Mapped[str]        = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan_id: Mapped[str]          = mapped_column(String(36), ForeignKey("insurance_plans.id"), nullable=False)
    status: Mapped[str]           = mapped_column(
        Enum("active", "cancelled", "expired", name="policy_status"),
        default="active",
    )
    selected_risks: Mapped[str]   = mapped_column(Text, nullable=False)    # JSON array
    dynamic_premium: Mapped[float] = mapped_column(Float, nullable=False)
    started_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=_now)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    worker: Mapped["User"]        = relationship("User", back_populates="policies")
    plan: Mapped["InsurancePlan"] = relationship("InsurancePlan", back_populates="policies")

    __table_args__ = (
        Index("ix_policies_worker", "worker_id"),
        Index("ix_policies_status", "status"),
    )


# ── Claims ─────────────────────────────────────────────────────────────────────

class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[str]                   = mapped_column(String(36), primary_key=True, default=_uuid)
    worker_id: Mapped[str]            = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    disruption_type: Mapped[str]      = mapped_column(String(80), nullable=False)
    lost_hours: Mapped[float]         = mapped_column(Float, nullable=False)
    estimated_income_loss: Mapped[float] = mapped_column(Float, nullable=False)
    payout_amount: Mapped[float]      = mapped_column(Float, default=0.0)
    status: Mapped[str]               = mapped_column(
        Enum("Pending", "Approved", "Rejected", name="claim_status"),
        default="Pending",
    )
    zone: Mapped[str | None]          = mapped_column(String(50), nullable=True)
    ai_recommendation: Mapped[str | None] = mapped_column(
        Enum("approve", "reject", "review", name="ai_recommendation"),
        nullable=True,
    )
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    reviewed_by: Mapped[str | None]   = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now)

    worker: Mapped["User"] = relationship("User", back_populates="claims", foreign_keys=[worker_id])
    proof: Mapped["ClaimProof | None"] = relationship(
        "ClaimProof",
        back_populates="claim",
        uselist=False,
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_claims_worker", "worker_id"),
        Index("ix_claims_status", "status"),
        Index("ix_claims_created_at", "created_at"),
    )


class WeeklyEarningsProof(Base):
    __tablename__ = "weekly_earnings_proofs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    worker_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    week_start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reported_earnings: Mapped[float] = mapped_column(Float, nullable=False)
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(64), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    model_quality_score: Mapped[float] = mapped_column(Float, nullable=False)
    processing_summary: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    worker: Mapped["User"] = relationship("User", back_populates="earnings_proofs")

    __table_args__ = (
        Index("ix_weekly_earnings_proofs_worker", "worker_id"),
        Index("ix_weekly_earnings_proofs_week_start", "week_start_at"),
    )


class ClaimProof(Base):
    __tablename__ = "claim_proofs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    claim_id: Mapped[str] = mapped_column(String(36), ForeignKey("claims.id", ondelete="CASCADE"), nullable=False, unique=True)
    worker_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(64), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    model_quality_score: Mapped[float] = mapped_column(Float, nullable=False)
    processing_summary: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    claim: Mapped["Claim"] = relationship("Claim", back_populates="proof")

    __table_args__ = (
        Index("ix_claim_proofs_claim", "claim_id"),
        Index("ix_claim_proofs_worker", "worker_id"),
    )


# ── Refresh Tokens ─────────────────────────────────────────────────────────────
# Server-side tracking enables immediate revocation (logout, suspicious activity)

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    jti: Mapped[str]              = mapped_column(String(36), primary_key=True)   # JWT ID
    user_id: Mapped[str]          = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_revoked: Mapped[bool]      = mapped_column(Boolean, default=False)
    issued_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), nullable=False)
    rotated_from: Mapped[str | None] = mapped_column(String(36), nullable=True)   # Tracks refresh rotation chain

    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")

    __table_args__ = (Index("ix_refresh_tokens_user", "user_id"),)


# ── Token Blacklist (revoked access tokens) ────────────────────────────────────
# Stores JTI of revoked access tokens until they expire naturally.

class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"

    jti: Mapped[str]            = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str]        = mapped_column(String(36), nullable=False)
    revoked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (Index("ix_blacklist_expires", "expires_at"),)


# ── Alerts ─────────────────────────────────────────────────────────────────────

class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str]              = mapped_column(String(36), primary_key=True, default=_uuid)
    alert_type: Mapped[str]      = mapped_column(
        Enum("rain", "heat", "flood", "pollution", name="alert_type"),
        nullable=False,
    )
    message: Mapped[str]         = mapped_column(Text, nullable=False)
    probability: Mapped[float]   = mapped_column(Float, nullable=False)
    severity: Mapped[str]        = mapped_column(
        Enum("low", "medium", "high", name="alert_severity"),
        nullable=False,
    )
    zone: Mapped[str]            = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool]      = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_alerts_zone", "zone"),
        Index("ix_alerts_active", "is_active"),
    )


# ── Audit Log ──────────────────────────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int]               = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None]   = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    action: Mapped[str]           = mapped_column(String(120), nullable=False)   # e.g. "claim.approve"
    resource_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    resource_id: Mapped[str | None]   = mapped_column(String(36), nullable=True)
    ip_address: Mapped[str | None]    = mapped_column(String(45), nullable=True)  # IPv4/IPv6
    user_agent: Mapped[str | None]    = mapped_column(Text, nullable=True)
    detail: Mapped[str | None]        = mapped_column(Text, nullable=True)        # JSON
    created_at: Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped["User | None"] = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index("ix_audit_user", "user_id"),
        Index("ix_audit_action", "action"),
        Index("ix_audit_created_at", "created_at"),
    )
