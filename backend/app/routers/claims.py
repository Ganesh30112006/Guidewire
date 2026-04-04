"""
Claims Router — /api/v1/claims

Security:
  • Workers can only file and view their own claims
  • Agents and admins can review (approve/reject) claims
  • Every status change is audit logged with reviewer identity
  • AI recommendation is computed on submit
"""

from __future__ import annotations
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.event_bus import event_bus
from app.core.encryption import decrypt_field
from app.dependencies.auth import get_current_user, require_agent_or_admin
from app.middleware.audit_logger import log_action
from app.models.models import User, Claim, ClaimProof, Alert
from app.schemas.schemas import (
    ClaimCreateRequest,
    ClaimResponse,
    ClaimReviewRequest,
    ClaimSubmitMultipartRequest,
    OKResponse,
)
from app.services.proof_processing import validate_and_store_proof
from app.services.fraud_engine import fraud_engine
from app.services.risk_engine import (
    calculate_payout, calculate_income_loss, ai_recommend_claim, choose_model_variant_for_worker,
)

router = APIRouter(prefix="/claims", tags=["claims"])


_ALERT_TYPE_BY_DISRUPTION: dict[str, str] = {
    "Heavy Rain": "rain",
    "Extreme Heat": "heat",
    "Flood": "flood",
    "Pollution": "pollution",
}


async def _resolve_zone_disruption_confidence(
    *,
    db: AsyncSession,
    zone: str | None,
    disruption_type: str,
) -> float:
    """Resolve confidence from currently active zone alerts with a neutral fallback."""
    if not zone:
        return 50.0

    alert_type = _ALERT_TYPE_BY_DISRUPTION.get(disruption_type)
    if not alert_type:
        return 50.0

    now = datetime.now(timezone.utc)
    stmt = (
        select(Alert.probability)
        .where(
            Alert.zone == zone,
            Alert.is_active.is_(True),
            Alert.alert_type == alert_type,
            (Alert.expires_at.is_(None) | (Alert.expires_at > now)),
        )
        .order_by(Alert.created_at.desc())
        .limit(1)
    )
    probability = await db.scalar(stmt)
    if probability is None:
        return 50.0

    return round(max(0.0, min(100.0, float(probability))), 1)


def _estimate_fraud_risk(
    *,
    confidence_score: float | None,
    ai_recommendation: str | None,
    claim_count_last_30d: int,
    trust_score: float,
    lost_hours: float,
) -> float:
    risk = 50.0
    if ai_recommendation == "approve":
        risk -= 20.0
    elif ai_recommendation == "reject":
        risk += 25.0
    if confidence_score is not None:
        risk -= (confidence_score - 50.0) * 0.25
    risk += min(claim_count_last_30d * 4.0, 20.0)
    risk += max(0.0, (70.0 - trust_score) * 0.4)
    if lost_hours > 10:
        risk += 8.0
    return round(max(0.0, min(100.0, risk)), 1)


def _explain_decision(
    *,
    status: str,
    ai_recommendation: str | None,
    confidence_score: float | None,
) -> str:
    conf = f" ({confidence_score:.1f}% confidence)" if confidence_score is not None else ""
    if status == "Approved":
        return f"Approved after review. AI suggested '{ai_recommendation}'{conf}."
    if status == "Rejected":
        return f"Rejected after review. AI suggested '{ai_recommendation}'{conf}."
    return f"Pending review. AI suggested '{ai_recommendation}'{conf}."


def _serialize(
    c: Claim,
    *,
    fraud_risk_score: float | None = None,
    decision_explanation: str | None = None,
    proof: ClaimProof | None = None,
    risk_model_variant: str | None = None,
) -> ClaimResponse:
    return ClaimResponse(
        id=c.id,
        worker_id=c.worker_id,
        disruption_type=c.disruption_type,
        lost_hours=c.lost_hours,
        estimated_income_loss=c.estimated_income_loss,
        payout_amount=c.payout_amount,
        status=c.status,
        zone=c.zone,
        ai_recommendation=c.ai_recommendation,
        confidence_score=c.confidence_score,
        fraud_risk_score=fraud_risk_score,
        decision_explanation=decision_explanation,
        risk_model_variant=risk_model_variant,
        proof_uploaded=proof is not None,
        proof_file_name=proof.file_name if proof else None,
        proof_model_quality_score=proof.model_quality_score if proof else None,
        proof_processing_summary=proof.processing_summary if proof else None,
        created_at=c.created_at.isoformat(),
    )


def _hybrid_claim_risk(
    *,
    request: Request,
    claim: Claim,
    worker: User | None,
    claim_count_last_7d: int,
    claim_count_last_30d: int,
    historical_avg_claim_amount: float,
) -> tuple[float, str]:
    # Build inference payload expected by hybrid fraud engine.
    user_agent = request.headers.get("user-agent", "")
    device_hint = request.headers.get("x-device-id") or f"ua-{abs(hash(user_agent)) % 10_000}"
    ip_address = request.client.host if request.client else "0.0.0.0"
    location = worker.city if worker and worker.city else (claim.zone or "Unknown")

    account_age = 30
    if worker and worker.created_at:
        account_age = max(1, int((claim.created_at - worker.created_at).total_seconds() / 86400.0))

    record = {
        "user_id": claim.worker_id,
        "claim_amount": float(max(claim.estimated_income_loss, 1.0)),
        "claim_time": claim.created_at.isoformat(),
        "device_id": str(device_hint),
        "ip_address": str(ip_address),
        "location": str(location),
        "claims_last_7d": int(max(claim_count_last_7d, 0)),
        "claims_last_30d": int(max(claim_count_last_30d, 0)),
        "account_age": int(max(account_age, 1)),
        "historical_avg_claim_amount": float(max(historical_avg_claim_amount, 1.0)),
    }

    result = fraud_engine.predict_one(record)
    explanation = f"{result.decision} by hybrid engine (risk={result.risk_score}). "
    if result.reasons:
        explanation += f"Reasons: {', '.join(result.reasons[:3])}."
    return float(result.risk_score), explanation


@router.post("", response_model=ClaimResponse, status_code=status.HTTP_201_CREATED)
async def submit_claim(
    request: Request,
    body: ClaimSubmitMultipartRequest = Depends(ClaimSubmitMultipartRequest.as_form),
    proof_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClaimResponse:
    if current_user.role != "worker":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only workers can submit claims")

    disruption_type = body.disruption_type
    lost_hours = body.lost_hours

    # Decrypt income for payout calculation
    avg_income = 0.0
    if current_user.avg_daily_income_enc:
        try:
            avg_income = float(decrypt_field(current_user.avg_daily_income_enc))
        except Exception:
            avg_income = 500.0      # Safe fallback

    income_loss = calculate_income_loss(lost_hours, avg_income)

    # Recent claim count (30 days) for AI model
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    claim_count = await db.scalar(
        select(func.count()).where(
            Claim.worker_id == current_user.id,
            Claim.created_at >= thirty_days_ago,
        )
    ) or 0

    zone_disruption_confidence = await _resolve_zone_disruption_confidence(
        db=db,
        zone=current_user.zone,
        disruption_type=disruption_type,
    )

    recommendation, confidence = ai_recommend_claim(
        disruption_type=disruption_type,
        lost_hours=lost_hours,
        worker_risk_score=current_user.risk_score,
        worker_trust_score=current_user.trust_score,
        claim_count_last_30d=claim_count,
        zone_disruption_confidence=zone_disruption_confidence,
    )
    model_variant = choose_model_variant_for_worker(current_user.zone, current_user.id)

    claim = Claim(
        worker_id=current_user.id,
        disruption_type=disruption_type,
        lost_hours=lost_hours,
        estimated_income_loss=income_loss,
        payout_amount=0.0,
        status="Pending",
        zone=current_user.zone,
        ai_recommendation=recommendation,
        confidence_score=confidence,
    )
    db.add(claim)
    await db.flush()

    saved_proof = await validate_and_store_proof(proof_file, category="claims")
    claim_proof = ClaimProof(
        claim_id=claim.id,
        worker_id=current_user.id,
        file_path=saved_proof.storage_path,
        file_name=saved_proof.original_filename,
        file_type=saved_proof.content_type,
        file_size=saved_proof.file_size,
        model_quality_score=saved_proof.model_quality_score,
        processing_summary=saved_proof.processing_summary,
    )
    db.add(claim_proof)

    await log_action(db, request=request, action="claim.submit",
                     user_id=current_user.id, resource_type="claim", resource_id=claim.id,
                     detail={
                         "disruption": disruption_type,
                         "hours": lost_hours,
                         "proof_file": saved_proof.original_filename,
                         "proof_quality": saved_proof.model_quality_score,
                     })
    await event_bus.publish(
        "claim.created",
        {
            "claim_id": claim.id,
            "worker_id": current_user.id,
            "status": claim.status,
            "zone": current_user.zone,
            "model_variant": model_variant,
        },
    )
    await event_bus.publish(
        "proof.processed",
        {
            "claim_id": claim.id,
            "worker_id": current_user.id,
            "file_name": saved_proof.original_filename,
            "quality_score": saved_proof.model_quality_score,
        },
    )
    await event_bus.publish(
        "risk.updated",
        {
            "worker_id": current_user.id,
            "risk_score": current_user.risk_score,
            "zone": current_user.zone,
            "model_variant": model_variant,
        },
    )
    claim_count_7d = await db.scalar(
        select(func.count()).where(
            Claim.worker_id == current_user.id,
            Claim.created_at >= (datetime.now(timezone.utc) - timedelta(days=7)),
        )
    ) or 0

    try:
        fraud_risk, explanation = _hybrid_claim_risk(
            request=request,
            claim=claim,
            worker=current_user,
            claim_count_last_7d=int(claim_count_7d),
            claim_count_last_30d=int(claim_count),
            historical_avg_claim_amount=float(max(avg_income, 1.0)),
        )
    except Exception:
        fraud_risk = _estimate_fraud_risk(
            confidence_score=claim.confidence_score,
            ai_recommendation=claim.ai_recommendation,
            claim_count_last_30d=claim_count,
            trust_score=current_user.trust_score,
            lost_hours=claim.lost_hours,
        )
        explanation = _explain_decision(
            status=claim.status,
            ai_recommendation=claim.ai_recommendation,
            confidence_score=claim.confidence_score,
        )
    return _serialize(
        claim,
        fraud_risk_score=fraud_risk,
        decision_explanation=explanation,
        proof=claim_proof,
        risk_model_variant=model_variant,
    )


@router.get("", response_model=list[ClaimResponse])
async def list_claims(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ClaimResponse]:
    base_query = select(Claim)
    if current_user.role == "worker":
        base_query = base_query.where(Claim.worker_id == current_user.id)
    else:
        # Agents and admins see all claims
        pass

    result = await db.execute(
        base_query.order_by(Claim.created_at.desc()).offset(offset).limit(limit)
    )

    claims = result.scalars().all()
    claim_ids = [c.id for c in claims]
    worker_ids = list({c.worker_id for c in claims})
    proof_map: dict[str, ClaimProof] = {}
    if claim_ids:
        proof_result = await db.execute(select(ClaimProof).where(ClaimProof.claim_id.in_(claim_ids)))
        proof_map = {p.claim_id: p for p in proof_result.scalars().all()}

    claim_count_map: dict[str, int] = {}
    trust_map: dict[str, float] = {}
    if worker_ids:
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        counts_result = await db.execute(
            select(Claim.worker_id, func.count())
            .where(
                Claim.worker_id.in_(worker_ids),
                Claim.created_at >= thirty_days_ago,
            )
            .group_by(Claim.worker_id)
        )
        claim_count_map = {worker_id: int(count) for worker_id, count in counts_result.all()}

        trust_result = await db.execute(
            select(User.id, User.trust_score).where(User.id.in_(worker_ids))
        )
        trust_map = {user_id: float(trust_score) for user_id, trust_score in trust_result.all()}

    serialized: list[ClaimResponse] = []
    for c in claims:
        claim_count = claim_count_map.get(c.worker_id, 0)
        trust = trust_map.get(c.worker_id, 80.0)
        fraud_risk = _estimate_fraud_risk(
            confidence_score=c.confidence_score,
            ai_recommendation=c.ai_recommendation,
            claim_count_last_30d=claim_count,
            trust_score=trust,
            lost_hours=c.lost_hours,
        )
        explanation = _explain_decision(
            status=c.status,
            ai_recommendation=c.ai_recommendation,
            confidence_score=c.confidence_score,
        )
        serialized.append(
            _serialize(
                c,
                fraud_risk_score=fraud_risk,
                decision_explanation=explanation,
                proof=proof_map.get(c.id),
            )
        )
    return serialized


@router.patch("/{claim_id}/review", response_model=ClaimResponse)
async def review_claim(
    claim_id: str,
    body: ClaimReviewRequest,
    request: Request,
    reviewer: User = Depends(require_agent_or_admin),
    db: AsyncSession = Depends(get_db),
) -> ClaimResponse:
    claim: Claim | None = await db.get(Claim, claim_id)
    if not claim:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Claim not found")
    if claim.status != "Pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "Claim is already reviewed")

    claim.status = body.status
    claim.reviewed_by = reviewer.id
    claim.reviewed_at = datetime.now(timezone.utc)

    if body.status == "Approved":
        # Fetch worker to get income for payout
        worker: User | None = await db.get(User, claim.worker_id)
        avg_income = 500.0
        if worker and worker.avg_daily_income_enc:
            try:
                avg_income = float(decrypt_field(worker.avg_daily_income_enc))
            except Exception:
                pass
        claim.payout_amount = calculate_payout(claim.lost_hours, avg_income)

    await log_action(
        db, request=request, action=f"claim.{body.status.lower()}",
        user_id=reviewer.id, resource_type="claim", resource_id=claim_id,
        detail={"status": body.status, "note": body.note},
    )
    await event_bus.publish(
        "claim.reviewed",
        {
            "claim_id": claim.id,
            "worker_id": claim.worker_id,
            "status": claim.status,
            "reviewed_by": reviewer.id,
        },
    )
    claim_count_7d = await db.scalar(
        select(func.count()).where(
            Claim.worker_id == claim.worker_id,
            Claim.created_at >= (datetime.now(timezone.utc) - timedelta(days=7)),
        )
    ) or 0
    claim_count = await db.scalar(
        select(func.count()).where(
            Claim.worker_id == claim.worker_id,
            Claim.created_at >= (datetime.now(timezone.utc) - timedelta(days=30)),
        )
    ) or 0
    worker_for_trust = await db.get(User, claim.worker_id)

    # Approximate historical claim amount for reviewed claim context.
    historical_avg = 500.0
    if worker_for_trust and worker_for_trust.avg_daily_income_enc:
        try:
            historical_avg = float(decrypt_field(worker_for_trust.avg_daily_income_enc))
        except Exception:
            historical_avg = 500.0

    try:
        fraud_risk, explanation = _hybrid_claim_risk(
            request=request,
            claim=claim,
            worker=worker_for_trust,
            claim_count_last_7d=int(claim_count_7d),
            claim_count_last_30d=int(claim_count),
            historical_avg_claim_amount=float(max(historical_avg, 1.0)),
        )
    except Exception:
        fraud_risk = _estimate_fraud_risk(
            confidence_score=claim.confidence_score,
            ai_recommendation=claim.ai_recommendation,
            claim_count_last_30d=claim_count,
            trust_score=worker_for_trust.trust_score if worker_for_trust else 80.0,
            lost_hours=claim.lost_hours,
        )
        explanation = _explain_decision(
            status=claim.status,
            ai_recommendation=claim.ai_recommendation,
            confidence_score=claim.confidence_score,
        )
    proof = await db.scalar(select(ClaimProof).where(ClaimProof.claim_id == claim.id))
    return _serialize(claim, fraud_risk_score=fraud_risk, decision_explanation=explanation, proof=proof)
