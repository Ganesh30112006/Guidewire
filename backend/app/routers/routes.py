"""
Workers Router — /api/v1/workers
Insurance Router — /api/v1/insurance
Alerts Router   — /api/v1/alerts
Admin Router    — /api/v1/admin
"""

from __future__ import annotations
import json
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy import select, func, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.event_bus import event_bus
from app.core.encryption import encrypt_field, decrypt_field
from app.dependencies.auth import get_current_user, require_admin, require_agent_or_admin
from app.middleware.audit_logger import log_action
from app.models.models import User, InsurancePlan, Policy, Alert, Claim, WeeklyEarningsProof, AuditLog
from app.schemas.schemas import (
    WorkerProfileResponse, UpdateProfileRequest,
    PlanCreateRequest, PlanResponse, PolicySubscribeRequest,
    AlertResponse, AdminMetricsResponse, BusinessKPIsResponse, WorkerRetentionResponse, OKResponse,
    WeeklyEarningsUploadRequest, WeeklyEarningsUploadResponse, WeeklyEarningsListResponse,
    PricingSimulationRequest, PricingSimulationResponse, RolloutConfigResponse, RolloutConfigUpdateRequest,
)
from app.services.proof_processing import validate_and_store_proof
from app.services.risk_engine import (
    calculate_dynamic_premium,
    get_rollout_config,
    simulate_dynamic_pricing,
    update_rollout_config,
)

# ══════════════════════════════════════════════════════════════════════════════
# WORKERS
# ══════════════════════════════════════════════════════════════════════════════

workers_router = APIRouter(prefix="/workers", tags=["workers"])


def _decrypt_safe(enc: str | None, default: str = "") -> str:
    if not enc:
        return default
    try:
        return decrypt_field(enc)
    except Exception:
        return default


def _serialize_worker(u: User) -> WorkerProfileResponse:
    avg_income_raw = _decrypt_safe(u.avg_daily_income_enc, "0")
    return WorkerProfileResponse(
        id=u.id,
        name=u.name,
        email=_decrypt_safe(u.email_encrypted),
        phone=_decrypt_safe(u.phone_encrypted) or None,
        city=u.city,
        platform=u.platform,
        avg_daily_income=float(avg_income_raw) if avg_income_raw else None,
        risk_score=u.risk_score,
        trust_score=u.trust_score,
        zone=u.zone,
        role=u.role,
    )


@workers_router.get("/me", response_model=WorkerProfileResponse)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
) -> WorkerProfileResponse:
    return _serialize_worker(current_user)


@workers_router.get("/me/retention", response_model=WorkerRetentionResponse)
async def get_my_retention(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkerRetentionResponse:
    if current_user.role != "worker":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only workers can access retention insights")

    claim_count_90d = await db.scalar(
        select(func.count()).where(
            Claim.worker_id == current_user.id,
            Claim.created_at >= (datetime.now(timezone.utc) - timedelta(days=90)),
        )
    ) or 0
    approved_count_90d = await db.scalar(
        select(func.count()).where(
            Claim.worker_id == current_user.id,
            Claim.status == "Approved",
            Claim.created_at >= (datetime.now(timezone.utc) - timedelta(days=90)),
        )
    ) or 0
    active_policy = await db.scalar(
        select(func.count()).where(
            Policy.worker_id == current_user.id,
            Policy.status == "active",
        )
    ) or 0

    tenure_days = max(1, (datetime.now(timezone.utc) - current_user.created_at).days)
    claim_consistency_score = max(0.0, min(100.0, 100.0 - (claim_count_90d * 6.0)))
    loyalty_score = 0.0
    loyalty_score += min(40.0, tenure_days / 9.0)
    loyalty_score += 20.0 if active_policy > 0 else 0.0
    loyalty_score += min(20.0, current_user.trust_score / 5.0)
    loyalty_score += min(20.0, (approved_count_90d * 4.0))

    return WorkerRetentionResponse(
        loyalty_score=round(max(0.0, min(100.0, loyalty_score)), 1),
        claim_consistency_score=round(claim_consistency_score, 1),
        tenure_days=tenure_days,
        active_policy=bool(active_policy),
    )


@workers_router.patch("/me", response_model=WorkerProfileResponse)
async def update_my_profile(
    body: UpdateProfileRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkerProfileResponse:
    if body.name is not None:
        current_user.name = body.name
    if body.phone is not None:
        current_user.phone_encrypted = encrypt_field(body.phone)
    if body.city is not None:
        current_user.city = body.city
    if body.platform is not None:
        current_user.platform = body.platform
    if body.avg_daily_income is not None:
        current_user.avg_daily_income_enc = encrypt_field(str(body.avg_daily_income))

    await log_action(db, request=request, action="worker.profile_update", user_id=current_user.id)
    return _serialize_worker(current_user)


@workers_router.delete("/me", response_model=OKResponse)
async def delete_my_account(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OKResponse:
    if current_user.role != "worker":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only workers can delete their account")

    user_id = current_user.id

    # Keep historical audit events while releasing FK references before deleting the user.
    await db.execute(
        update(AuditLog)
        .where(AuditLog.user_id == user_id)
        .values(user_id=None)
    )
    await log_action(
        db,
        request=request,
        action="worker.account_delete",
        user_id=None,
        detail={"deleted_user_id": user_id},
    )

    await db.delete(current_user)

    # Clear client auth cookies so the browser session is terminated immediately.
    response.delete_cookie("refresh_token", path="/api/v1/auth")
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("csrf_token", path="/")

    return OKResponse(message="Worker account deleted")


@workers_router.post("/me/weekly-earnings-proof", response_model=WeeklyEarningsUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_weekly_earnings_proof(
    request: Request,
    body: WeeklyEarningsUploadRequest = Depends(WeeklyEarningsUploadRequest.as_form),
    screenshot_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WeeklyEarningsUploadResponse:
    if current_user.role != "worker":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only workers can upload earnings proofs")

    week_start_at = body.week_start_at
    reported_earnings = body.reported_earnings

    saved = await validate_and_store_proof(screenshot_file, category="weekly-earnings")
    row = WeeklyEarningsProof(
        worker_id=current_user.id,
        week_start_at=week_start_at,
        reported_earnings=reported_earnings,
        file_path=saved.storage_path,
        file_name=saved.original_filename,
        file_type=saved.content_type,
        file_size=saved.file_size,
        model_quality_score=saved.model_quality_score,
        processing_summary=saved.processing_summary,
    )
    db.add(row)
    await db.flush()

    await log_action(
        db,
        request=request,
        action="worker.weekly_earnings_proof.upload",
        user_id=current_user.id,
        resource_type="weekly_earnings_proof",
        resource_id=row.id,
        detail={
            "week_start_at": week_start_at.isoformat(),
            "reported_earnings": reported_earnings,
            "proof_file": saved.original_filename,
            "proof_quality": saved.model_quality_score,
        },
    )
    await event_bus.publish(
        "proof.processed",
        {
            "worker_id": current_user.id,
            "proof_id": row.id,
            "proof_type": "weekly_earnings",
            "file_name": saved.original_filename,
            "quality_score": saved.model_quality_score,
        },
    )

    return WeeklyEarningsUploadResponse(
        id=row.id,
        week_start_at=row.week_start_at.isoformat(),
        reported_earnings=row.reported_earnings,
        file_name=row.file_name,
        file_type=row.file_type,
        file_size=row.file_size,
        model_quality_score=row.model_quality_score,
        processing_summary=row.processing_summary,
        created_at=row.created_at.isoformat(),
    )


@workers_router.get("/me/weekly-earnings-proof", response_model=WeeklyEarningsListResponse)
async def list_weekly_earnings_proofs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WeeklyEarningsListResponse:
    if current_user.role != "worker":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only workers can view earnings proofs")

    result = await db.execute(
        select(WeeklyEarningsProof)
        .where(WeeklyEarningsProof.worker_id == current_user.id)
        .order_by(WeeklyEarningsProof.created_at.desc())
        .limit(20)
    )
    rows = result.scalars().all()
    return WeeklyEarningsListResponse(
        records=[
            WeeklyEarningsUploadResponse(
                id=r.id,
                week_start_at=r.week_start_at.isoformat(),
                reported_earnings=r.reported_earnings,
                file_name=r.file_name,
                file_type=r.file_type,
                file_size=r.file_size,
                model_quality_score=r.model_quality_score,
                processing_summary=r.processing_summary,
                created_at=r.created_at.isoformat(),
            )
            for r in rows
        ]
    )


@workers_router.get("/{worker_id}", response_model=WorkerProfileResponse)
async def get_worker(
    worker_id: str,
    current_user: User = Depends(require_agent_or_admin),
    db: AsyncSession = Depends(get_db),
) -> WorkerProfileResponse:
    worker: User | None = await db.get(User, worker_id)
    if not worker or worker.role != "worker":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Worker not found")
    return _serialize_worker(worker)


@workers_router.get("", response_model=list[WorkerProfileResponse])
async def list_workers(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: User = Depends(require_agent_or_admin),
    db: AsyncSession = Depends(get_db),
) -> list[WorkerProfileResponse]:
    result = await db.execute(
        select(User)
        .where(User.role == "worker")
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [_serialize_worker(worker) for worker in result.scalars().all()]


# ══════════════════════════════════════════════════════════════════════════════
# INSURANCE PLANS
# ══════════════════════════════════════════════════════════════════════════════

insurance_router = APIRouter(prefix="/insurance", tags=["insurance"])

DEFAULT_INSURANCE_PLANS = [
    {
        "name": "Basic Plan",
        "weekly_premium": 15.0,
        "coverage": 1000.0,
        "risks": ["Rain"],
        "is_popular": False,
    },
    {
        "name": "Standard Plan",
        "weekly_premium": 22.0,
        "coverage": 1500.0,
        "risks": ["Rain", "Extreme Heat"],
        "is_popular": True,
    },
    {
        "name": "Premium Plan",
        "weekly_premium": 30.0,
        "coverage": 2000.0,
        "risks": ["Rain", "Flood", "Extreme Heat", "Pollution"],
        "is_popular": False,
    },
]

DEFAULT_ALERTS = [
    {
        "alert_type": "rain",
        "message": "Heavy rain expected in your area over the next few hours.",
        "probability": 82.0,
        "severity": "high",
        "zone": "Zone A",
    },
    {
        "alert_type": "heat",
        "message": "Extreme heat conditions expected this afternoon.",
        "probability": 68.0,
        "severity": "medium",
        "zone": "Zone B",
    },
    {
        "alert_type": "pollution",
        "message": "Air quality is deteriorating. Use protective gear if possible.",
        "probability": 74.0,
        "severity": "high",
        "zone": "Zone C",
    },
    {
        "alert_type": "flood",
        "message": "Localized flood risk in low-lying routes.",
        "probability": 55.0,
        "severity": "medium",
        "zone": "Zone D",
    },
]


def _serialize_plan(p: InsurancePlan) -> PlanResponse:
    return PlanResponse(
        id=p.id,
        name=p.name,
        weekly_premium=p.weekly_premium,
        coverage=p.coverage,
        risks=json.loads(p.risks),
        is_popular=p.is_popular,
        is_active=p.is_active,
    )


async def _ensure_default_plans(db: AsyncSession) -> None:
    active_count = await db.scalar(
        select(func.count()).select_from(InsurancePlan).where(InsurancePlan.is_active == True)
    ) or 0
    if active_count > 0:
        return

    for plan in DEFAULT_INSURANCE_PLANS:
        db.add(
            InsurancePlan(
                name=str(plan["name"]),
                weekly_premium=float(plan["weekly_premium"]),
                coverage=float(plan["coverage"]),
                risks=json.dumps(plan["risks"]),
                is_popular=bool(plan["is_popular"]),
                is_active=True,
                created_by=None,
            )
        )
    await db.flush()


async def _ensure_default_alerts(db: AsyncSession) -> None:
    active_count = await db.scalar(
        select(func.count()).select_from(Alert).where(Alert.is_active == True)
    ) or 0
    if active_count > 0:
        return

    now = datetime.now(timezone.utc)
    for item in DEFAULT_ALERTS:
        db.add(
            Alert(
                alert_type=str(item["alert_type"]),
                message=str(item["message"]),
                probability=float(item["probability"]),
                severity=str(item["severity"]),
                zone=str(item["zone"]),
                is_active=True,
                expires_at=now + timedelta(hours=12),
            )
        )
    await db.flush()


@insurance_router.get("/plans", response_model=list[PlanResponse])
async def list_plans(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlanResponse]:
    await _ensure_default_plans(db)
    result = await db.execute(
        select(InsurancePlan).where(InsurancePlan.is_active == True).order_by(InsurancePlan.weekly_premium)
    )
    return [_serialize_plan(p) for p in result.scalars().all()]


@insurance_router.post("/plans", response_model=PlanResponse, status_code=201)
async def create_plan(
    body: PlanCreateRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> PlanResponse:
    existing = await db.scalar(select(InsurancePlan.id).where(InsurancePlan.name == body.name))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Plan name already exists")

    plan = InsurancePlan(
        name=body.name,
        weekly_premium=body.weekly_premium,
        coverage=body.coverage,
        risks=json.dumps(body.risks),
        is_popular=body.is_popular,
        created_by=admin.id,
    )
    db.add(plan)
    await db.flush()
    await log_action(db, request=request, action="plan.create",
                     user_id=admin.id, resource_type="plan", resource_id=plan.id)
    return _serialize_plan(plan)


@insurance_router.put("/plans/{plan_id}", response_model=PlanResponse)
async def update_plan(
    plan_id: str,
    body: PlanCreateRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> PlanResponse:
    plan: InsurancePlan | None = await db.get(InsurancePlan, plan_id)
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")

    plan.name = body.name
    plan.weekly_premium = body.weekly_premium
    plan.coverage = body.coverage
    plan.risks = json.dumps(body.risks)
    plan.is_popular = body.is_popular

    await log_action(db, request=request, action="plan.update",
                     user_id=admin.id, resource_type="plan", resource_id=plan_id)
    return _serialize_plan(plan)


@insurance_router.delete("/plans/{plan_id}", response_model=OKResponse)
async def delete_plan(
    plan_id: str,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> OKResponse:
    plan: InsurancePlan | None = await db.get(InsurancePlan, plan_id)
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    plan.is_active = False      # Soft delete — never hard delete financial records
    await log_action(db, request=request, action="plan.delete",
                     user_id=admin.id, resource_type="plan", resource_id=plan_id)
    return OKResponse(message="Plan deactivated")


@insurance_router.post("/subscribe", response_model=OKResponse)
async def subscribe(
    body: PolicySubscribeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OKResponse:
    if current_user.role != "worker":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only workers can subscribe to plans")

    plan: InsurancePlan | None = await db.get(InsurancePlan, body.plan_id)
    if not plan or not plan.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")

    # Cancel existing active policy
    existing = await db.execute(
        select(Policy).where(Policy.worker_id == current_user.id, Policy.status == "active")
    )
    for p in existing.scalars().all():
        p.status = "cancelled"
        p.cancelled_at = datetime.now(timezone.utc)

    policy = Policy(
        worker_id=current_user.id,
        plan_id=plan.id,
        selected_risks=json.dumps(body.selected_risks),
        dynamic_premium=calculate_dynamic_premium(current_user.risk_score),
    )
    db.add(policy)
    await log_action(db, request=request, action="policy.subscribe",
                     user_id=current_user.id, resource_type="plan", resource_id=plan.id)
    return OKResponse(message=f"Subscribed to {plan.name}")


# ══════════════════════════════════════════════════════════════════════════════
# ALERTS
# ══════════════════════════════════════════════════════════════════════════════

alerts_router = APIRouter(prefix="/alerts", tags=["alerts"])


@alerts_router.get("", response_model=list[AlertResponse])
async def list_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AlertResponse]:
    await _ensure_default_alerts(db)

    base_query = select(Alert).where(Alert.is_active == True).order_by(Alert.created_at.desc())
    query = base_query
    # Workers only see alerts for their zone
    if current_user.role == "worker" and current_user.zone:
        query = base_query.where(Alert.zone == current_user.zone)

    result = await db.execute(query)
    alerts = result.scalars().all()

    # If a worker has no zone-specific alerts, show active global feed as fallback.
    if current_user.role == "worker" and current_user.zone and not alerts:
        result = await db.execute(base_query)
        alerts = result.scalars().all()

    return [
        AlertResponse(
            id=a.id,
            alert_type=a.alert_type,
            message=a.message,
            probability=a.probability,
            severity=a.severity,
            zone=a.zone,
            created_at=a.created_at.isoformat(),
        )
        for a in alerts
    ]


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN
# ══════════════════════════════════════════════════════════════════════════════

admin_router = APIRouter(prefix="/admin", tags=["admin"])


@admin_router.get("/metrics", response_model=AdminMetricsResponse)
async def admin_metrics(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminMetricsResponse:
    total_workers = await db.scalar(
        select(func.count()).where(User.role == "worker", User.is_active == True)
    ) or 0
    active_policies = await db.scalar(
        select(func.count()).where(Policy.status == "active")
    ) or 0
    pending_claims = await db.scalar(
        select(func.count()).where(Claim.status == "Pending")
    ) or 0
    approved_payouts = await db.scalar(
        select(func.sum(Claim.payout_amount)).where(Claim.status == "Approved")
    ) or 0.0

    return AdminMetricsResponse(
        total_workers=total_workers,
        active_policies=active_policies,
        predicted_claims=pending_claims,
        weekly_payouts=float(approved_payouts),
    )


@admin_router.get("/business-kpis", response_model=BusinessKPIsResponse)
async def admin_business_kpis(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> BusinessKPIsResponse:
    total_claims = await db.scalar(select(func.count()).select_from(Claim)) or 0
    approved_claims = await db.scalar(
        select(func.count()).where(Claim.status == "Approved")
    ) or 0
    flagged_claims = await db.scalar(
        select(func.count()).where(
            Claim.status == "Pending",
            Claim.confidence_score <= 45,
        )
    ) or 0

    total_income_loss = await db.scalar(select(func.sum(Claim.estimated_income_loss))) or 0.0
    total_payout = await db.scalar(
        select(func.sum(Claim.payout_amount)).where(Claim.status == "Approved")
    ) or 0.0

    avg_resolution_minutes = await db.scalar(
        select(func.avg(func.timestampdiff(text("MINUTE"), Claim.created_at, Claim.reviewed_at))).where(
            Claim.reviewed_at.is_not(None)
        )
    ) or 0.0

    total_workers = await db.scalar(
        select(func.count()).where(User.role == "worker")
    ) or 0
    workers_with_active_policy = await db.scalar(
        select(func.count(func.distinct(Policy.worker_id))).where(Policy.status == "active")
    ) or 0

    approval_rate = (approved_claims / total_claims * 100.0) if total_claims else 0.0
    loss_ratio = (total_payout / total_income_loss * 100.0) if total_income_loss else 0.0
    retention_score = (workers_with_active_policy / total_workers * 100.0) if total_workers else 0.0
    fraud_alert_rate = (flagged_claims / total_claims * 100.0) if total_claims else 0.0

    return BusinessKPIsResponse(
        loss_ratio=round(loss_ratio, 2),
        approval_rate=round(approval_rate, 2),
        avg_resolution_minutes=round(float(avg_resolution_minutes), 2),
        retention_score=round(retention_score, 2),
        fraud_alert_rate=round(fraud_alert_rate, 2),
    )


@admin_router.get("/workers", response_model=list[WorkerProfileResponse])
async def list_all_workers(
    _: User = Depends(require_agent_or_admin),
    db: AsyncSession = Depends(get_db),
) -> list[WorkerProfileResponse]:
    result = await db.execute(
        select(User).where(User.role == "worker").order_by(User.created_at.desc())
    )
    return [_serialize_worker(u) for u in result.scalars().all()]


@admin_router.post("/pricing/simulate", response_model=PricingSimulationResponse)
async def simulate_pricing(
    body: PricingSimulationRequest,
    _: User = Depends(require_admin),
) -> PricingSimulationResponse:
    result = simulate_dynamic_pricing(
        claim_count_last_30d=body.claim_count_last_30d,
        zone=body.zone,
        platform=body.platform,
        avg_daily_income=body.avg_daily_income,
        lost_hours=body.lost_hours,
        model_variant=body.model_variant,
    )
    return PricingSimulationResponse(**result)


@admin_router.get("/risk-rollouts", response_model=RolloutConfigResponse)
async def get_risk_rollouts(
    _: User = Depends(require_admin),
) -> RolloutConfigResponse:
    config = get_rollout_config()
    return RolloutConfigResponse(regions=config)


@admin_router.put("/risk-rollouts", response_model=RolloutConfigResponse)
async def update_risk_rollouts(
    body: RolloutConfigUpdateRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> RolloutConfigResponse:
    updated = update_rollout_config(
        {
            zone: {
                "enabled": policy.enabled,
                "baseline": policy.baseline,
                "challenger": policy.challenger,
            }
            for zone, policy in body.regions.items()
        }
    )
    await log_action(
        db,
        request=request,
        action="admin.risk_rollout.update",
        user_id=admin.id,
        detail={"regions": list(updated.keys())},
    )
    await event_bus.publish(
        "risk.rollout.updated",
        {
            "updated_by": admin.id,
            "regions": updated,
        },
    )
    return RolloutConfigResponse(regions=updated)
