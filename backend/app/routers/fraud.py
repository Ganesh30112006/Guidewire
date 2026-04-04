from __future__ import annotations

from collections import defaultdict
from time import monotonic

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.dependencies.auth import require_admin
from app.models.models import User
from app.schemas.schemas import (
    FraudPredictRequest,
    FraudPredictResponse,
    FraudTrainEnqueueResponse,
    FraudTrainJobStatusResponse,
    FraudTrainRequest,
)
from app.services.fraud_engine import fraud_engine
from app.services.fraud_training_queue import (
    count_pending_jobs,
    enqueue_training_job,
    get_training_job,
)

router = APIRouter(prefix="/fraud", tags=["Fraud Engine"])
log = structlog.get_logger(__name__)

_TRAIN_WINDOW_SECONDS = 60.0
_MAX_TRAINS_PER_WINDOW = 1
_MAX_TRAIN_RECORDS = 25_000
_train_calls_by_actor: dict[str, list[float]] = defaultdict(list)


def _enforce_train_rate_limit(actor_key: str) -> None:
    now = monotonic()
    calls = _train_calls_by_actor[actor_key]
    calls[:] = [t for t in calls if now - t <= _TRAIN_WINDOW_SECONDS]
    if len(calls) >= _MAX_TRAINS_PER_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Training rate limit exceeded. Try again in a minute.",
        )
    calls.append(now)


@router.post("/train", response_model=FraudTrainEnqueueResponse, status_code=status.HTTP_202_ACCEPTED)
def train_fraud_engine(
    payload: FraudTrainRequest,
    request: Request,
    admin: User = Depends(require_admin),
) -> FraudTrainEnqueueResponse:
    if len(payload.records) > _MAX_TRAIN_RECORDS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Training payload too large. Max {_MAX_TRAIN_RECORDS} records.",
        )

    client_ip = request.client.host if request.client else "unknown"
    actor_key = f"{admin.id}:{client_ip}"
    _enforce_train_rate_limit(actor_key)

    records = [record.model_dump(mode="json") for record in payload.records]
    job = enqueue_training_job(
        records=records,
        requested_by=admin.id,
        training_data_source=payload.training_data_source,
        db_records=payload.db_records,
    )
    log.info(
        "fraud_training_queued",
        job_id=job["job_id"],
        requested_by=admin.id,
        record_count=len(records),
        training_data_source=payload.training_data_source,
        db_records=payload.db_records,
    )

    return FraudTrainEnqueueResponse(status="queued", job_id=job["job_id"], queue_depth=count_pending_jobs())


@router.get("/train/jobs/{job_id}", response_model=FraudTrainJobStatusResponse)
def get_train_job_status(
    job_id: str,
    _: User = Depends(require_admin),
) -> FraudTrainJobStatusResponse:
    job = get_training_job(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Training job not found")
    return FraudTrainJobStatusResponse(**job)


@router.post("/predict", response_model=FraudPredictResponse)
def predict_claim_risk(payload: FraudPredictRequest) -> FraudPredictResponse:
    try:
        result = fraud_engine.predict_one(payload.record.model_dump())
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Prediction failed: {exc}") from exc

    log.info(
        "fraud_prediction_scored",
        risk_score=result.risk_score,
        decision=result.decision,
        model_version=result.model_version,
        trained_at_utc=result.trained_at_utc,
        training_data_source=result.training_data_source,
        db_records=result.db_records,
    )

    return FraudPredictResponse(
        risk_score=result.risk_score,
        decision=result.decision,
        reasons=result.reasons,
        calibrated_probability=result.calibrated_probability,
        raw_score=result.raw_score,
        rule_flag=result.rule_flag,
        rule_reason=result.rule_reason,
        model_version=result.model_version,
        trained_at_utc=result.trained_at_utc,
        training_data_source=result.training_data_source,
        db_records=result.db_records,
    )
