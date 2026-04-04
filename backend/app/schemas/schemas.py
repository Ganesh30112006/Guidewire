"""
Pydantic v2 schemas — strict validation on all inputs.

Security notes:
  • All string inputs are stripped and length-bounded
  • Email validated with email-validator library
  • Password strength enforced via regex
  • Numeric fields are bounded to prevent overflow attacks
"""

from __future__ import annotations
from datetime import datetime
import re
from typing import Annotated, Literal
from fastapi import Form
from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator, model_validator


# ── Shared ─────────────────────────────────────────────────────────────────────

class OKResponse(BaseModel):
    ok: bool = True
    message: str = "Success"


class StrictRequestModel(BaseModel):
    # Reject unexpected fields to prevent over-posting and malformed payloads.
    model_config = ConfigDict(extra="forbid")


# ── Auth ───────────────────────────────────────────────────────────────────────

_PASSWORD_RE = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_#\-])[A-Za-z\d@$!%*?&_#\-]{8,72}$"
)
_PHONE_RE = re.compile(r"^\+?[\d\s\-]{10,15}$")

NameStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
CityStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
PlanNameStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]

class RegisterRequest(StrictRequestModel):
    name: NameStr
    email: EmailStr
    phone: str      = Field(..., min_length=10, max_length=15)
    city: CityStr
    platform: str   = Field(..., min_length=1, max_length=80)
    avg_daily_income: float = Field(..., gt=0, lt=100_001)
    password: str   = Field(..., min_length=8, max_length=72)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        clean = v.strip()
        if not _PHONE_RE.match(clean):
            raise ValueError("Invalid phone number format")
        return clean

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not _PASSWORD_RE.match(v):
            raise ValueError(
                "Password must be 8-72 chars and include uppercase, lowercase, "
                "digit, and special character (@$!%*?&_#-)"
            )
        return v

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, v: str) -> str:
        v = v.strip()
        allowed = {"Zomato", "Swiggy", "Blinkit", "Zepto", "Dunzo", "Other"}
        if v not in allowed:
            raise ValueError(f"Platform must be one of {sorted(allowed)}")
        return v


class LoginRequest(StrictRequestModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int         # seconds


class RefreshRequest(StrictRequestModel):
    refresh_token: str = Field(..., min_length=10)


class ChangePasswordRequest(StrictRequestModel):
    current_password: str = Field(..., min_length=1, max_length=72)
    new_password: str     = Field(..., min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def validate_strength(cls, v: str) -> str:
        if not _PASSWORD_RE.match(v):
            raise ValueError(
                "Password must be 8-72 chars and include uppercase, lowercase, "
                "digit, and special character"
            )
        return v

    @model_validator(mode="after")
    def not_same(self) -> "ChangePasswordRequest":
        if self.current_password == self.new_password:
            raise ValueError("New password must differ from current password")
        return self


# ── Worker profile ─────────────────────────────────────────────────────────────

class WorkerProfileResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: str | None
    city: str | None
    platform: str | None
    avg_daily_income: float | None
    risk_score: float
    trust_score: float
    zone: str | None
    role: str

    model_config = {"from_attributes": True}


class UpdateProfileRequest(StrictRequestModel):
    name: NameStr | None = None
    phone: str | None       = Field(None, min_length=10, max_length=15)
    city: CityStr | None = None
    platform: str | None    = Field(None, min_length=1, max_length=80)
    avg_daily_income: float | None = Field(None, gt=0, lt=100_001)

    @field_validator("platform")
    @classmethod
    def normalize_platform(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else None


# ── Claims ─────────────────────────────────────────────────────────────────────

_DISRUPTION_TYPES = {"Heavy Rain", "Extreme Heat", "Flood", "Pollution", "Other"}

class ClaimCreateRequest(StrictRequestModel):
    disruption_type: str = Field(..., min_length=2, max_length=80)
    lost_hours: float    = Field(..., gt=0, le=24)    # Max 24h lost in a day

    @field_validator("disruption_type")
    @classmethod
    def validate_disruption(cls, v: str) -> str:
        if v not in _DISRUPTION_TYPES:
            raise ValueError(f"disruption_type must be one of {sorted(_DISRUPTION_TYPES)}")
        return v


class ClaimResponse(BaseModel):
    id: str
    worker_id: str
    disruption_type: str
    lost_hours: float
    estimated_income_loss: float
    payout_amount: float
    status: Literal["Pending", "Approved", "Rejected"]
    zone: str | None
    ai_recommendation: Literal["approve", "reject", "review"] | None
    confidence_score: float | None
    fraud_risk_score: float | None = None
    decision_explanation: str | None = None
    risk_model_variant: Literal["baseline", "challenger"] | None = None
    proof_uploaded: bool = False
    proof_file_name: str | None = None
    proof_model_quality_score: float | None = None
    proof_processing_summary: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class ClaimReviewRequest(StrictRequestModel):
    status: Literal["Approved", "Rejected"]
    note: str | None = Field(None, max_length=500)


class ClaimSubmitMultipartRequest(StrictRequestModel):
    disruption_type: Literal["Heavy Rain", "Extreme Heat", "Flood", "Pollution", "Other"]
    lost_hours: float = Field(..., gt=0, le=24)

    @classmethod
    def as_form(
        cls,
        disruption_type: Literal["Heavy Rain", "Extreme Heat", "Flood", "Pollution", "Other"] = Form(...),
        lost_hours: float = Form(...),
    ) -> "ClaimSubmitMultipartRequest":
        return cls(disruption_type=disruption_type, lost_hours=lost_hours)


class WeeklyEarningsUploadResponse(BaseModel):
    id: str
    week_start_at: str
    reported_earnings: float
    file_name: str
    file_type: str
    file_size: int
    model_quality_score: float
    processing_summary: str
    created_at: str


class WeeklyEarningsListResponse(BaseModel):
    records: list[WeeklyEarningsUploadResponse]


# ── Insurance plans ────────────────────────────────────────────────────────────

_ALLOWED_RISKS = {"Rain", "Extreme Heat", "Flood", "Pollution"}

class PlanCreateRequest(StrictRequestModel):
    name: PlanNameStr
    weekly_premium: float = Field(..., gt=0, le=10_000)
    coverage: float      = Field(..., gt=0, le=1_000_000)
    risks: list[str]     = Field(..., min_length=1, max_length=4)
    is_popular: bool     = False

    @field_validator("risks")
    @classmethod
    def validate_risks(cls, v: list[str]) -> list[str]:
        for r in v:
            if r not in _ALLOWED_RISKS:
                raise ValueError(f"Invalid risk: {r}. Allowed: {sorted(_ALLOWED_RISKS)}")
        return list(dict.fromkeys(v))     # Deduplicate while preserving order


class PlanResponse(BaseModel):
    id: str
    name: str
    weekly_premium: float
    coverage: float
    risks: list[str]
    is_popular: bool
    is_active: bool

    model_config = {"from_attributes": True}


class PolicySubscribeRequest(StrictRequestModel):
    plan_id: str        = Field(..., min_length=1)
    selected_risks: list[str] = Field(..., min_length=1, max_length=4)

    @field_validator("selected_risks")
    @classmethod
    def validate_risks(cls, v: list[str]) -> list[str]:
        allowed = {"Rain", "Extreme Heat", "Flood", "Pollution"}
        for r in v:
            if r not in allowed:
                raise ValueError(f"Invalid risk: {r}")
        return list(dict.fromkeys(v))


class WeeklyEarningsUploadRequest(StrictRequestModel):
    week_start_at: datetime
    reported_earnings: float = Field(..., gt=0, lt=10_000_000)

    @classmethod
    def as_form(
        cls,
        week_start_at: datetime = Form(...),
        reported_earnings: float = Form(...),
    ) -> "WeeklyEarningsUploadRequest":
        return cls(week_start_at=week_start_at, reported_earnings=reported_earnings)


# ── Admin ──────────────────────────────────────────────────────────────────────

class AdminMetricsResponse(BaseModel):
    total_workers: int
    active_policies: int
    predicted_claims: int
    weekly_payouts: float


class BusinessKPIsResponse(BaseModel):
    loss_ratio: float
    approval_rate: float
    avg_resolution_minutes: float
    retention_score: float
    fraud_alert_rate: float


class PricingSimulationRequest(StrictRequestModel):
    claim_count_last_30d: int = Field(..., ge=0, le=200)
    zone: str = Field(..., min_length=2, max_length=50)
    platform: str = Field(..., min_length=1, max_length=80)
    avg_daily_income: float = Field(..., gt=0, le=100_000)
    lost_hours: float = Field(..., gt=0, le=24)
    model_variant: Literal["baseline", "challenger"] = "baseline"


class PricingSimulationResponse(BaseModel):
    model_variant: Literal["baseline", "challenger"]
    risk_score: float
    weekly_premium: float
    projected_payout: float
    projected_income_loss: float


class RegionRolloutPolicy(StrictRequestModel):
    enabled: bool = True
    baseline: int = Field(..., ge=0, le=100)
    challenger: int = Field(..., ge=0, le=100)

    @model_validator(mode="after")
    def validate_split(self) -> "RegionRolloutPolicy":
        if (self.baseline + self.challenger) != 100:
            raise ValueError("baseline + challenger must equal 100")
        return self


class RolloutConfigResponse(BaseModel):
    regions: dict[str, RegionRolloutPolicy]


class RolloutConfigUpdateRequest(StrictRequestModel):
    regions: dict[str, RegionRolloutPolicy]


class WorkerRetentionResponse(BaseModel):
    loyalty_score: float
    claim_consistency_score: float
    tenure_days: int
    active_policy: bool


class AgentResponse(BaseModel):
    id: str
    name: str
    email: str
    city: str | None
    assigned_workers: int
    status: str

    model_config = {"from_attributes": True}


class WorkerListResponse(BaseModel):
    id: str
    name: str
    city: str | None
    platform: str | None
    zone: str | None
    risk_score: float
    trust_score: float
    status: str

    model_config = {"from_attributes": True}


# ── Alerts ─────────────────────────────────────────────────────────────────────

class AlertResponse(BaseModel):
    id: str
    alert_type: str
    message: str
    probability: float
    severity: str
    zone: str
    created_at: str

    model_config = {"from_attributes": True}


# -- Fraud Engine ----------------------------------------------------------------

class FraudRecordBase(StrictRequestModel):
    user_id: str = Field(..., min_length=1, max_length=120)
    claim_amount: float = Field(..., gt=0, le=10_000_000)
    claim_time: datetime
    device_id: str = Field(..., min_length=1, max_length=256)
    ip_address: str = Field(..., min_length=3, max_length=128)
    location: str = Field(..., min_length=1, max_length=256)
    claims_last_7d: int = Field(..., ge=0, le=10_000)
    claims_last_30d: int = Field(..., ge=0, le=50_000)
    account_age: int = Field(..., ge=0, le=20_000)
    historical_avg_claim_amount: float = Field(..., gt=0, le=10_000_000)


class FraudTrainingRecord(FraudRecordBase):
    label: Literal[0, 1]


class FraudTrainRequest(StrictRequestModel):
    records: list[FraudTrainingRecord] = Field(..., min_length=50)
    training_data_source: str = Field("api", min_length=1, max_length=80)
    db_records: int = Field(0, ge=0)


class FraudTrainResponse(BaseModel):
    status: str
    metrics: dict[str, float]


class FraudTrainEnqueueResponse(BaseModel):
    status: Literal["queued"]
    job_id: str
    queue_depth: int


class FraudTrainJobStatusResponse(BaseModel):
    job_id: str
    status: Literal["pending", "running", "succeeded", "failed"]
    submitted_at: str
    started_at: str | None = None
    finished_at: str | None = None
    record_count: int
    requested_by: str
    worker_id: str | None = None
    metrics: dict[str, float] | None = None
    error: str | None = None
    training_data_source: str | None = None
    db_records: int = 0


class FraudPredictRequest(StrictRequestModel):
    record: FraudRecordBase


class FraudPredictResponse(BaseModel):
    risk_score: int
    decision: Literal["APPROVE", "REVIEW", "REJECT"]
    reasons: list[str]
    calibrated_probability: float
    raw_score: float
    rule_flag: int
    rule_reason: str
    model_version: str
    trained_at_utc: str | None = None
    training_data_source: str | None = None
    db_records: int = 0
