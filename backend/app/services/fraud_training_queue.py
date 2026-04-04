from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

_QUEUE_LOCK = Lock()
_JOB_DIR = Path(__file__).resolve().parents[2] / "models" / "training_jobs"
_JOB_DIR.mkdir(parents=True, exist_ok=True)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _job_path(job_id: str) -> Path:
    return _JOB_DIR / f"{job_id}.json"


def _write_job(job: dict[str, Any]) -> None:
    path = _job_path(str(job["job_id"]))
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(job, separators=(",", ":"), ensure_ascii=True), encoding="utf-8")
    tmp.replace(path)


def _read_job(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _public_job(job: dict[str, Any]) -> dict[str, Any]:
    out = dict(job)
    out.pop("records", None)
    return out


def count_pending_jobs() -> int:
    with _QUEUE_LOCK:
        pending = 0
        for path in _JOB_DIR.glob("*.json"):
            try:
                if _read_job(path).get("status") == "pending":
                    pending += 1
            except Exception:
                continue
        return pending


def enqueue_training_job(
    *,
    records: list[dict[str, Any]],
    requested_by: str,
    training_data_source: str,
    db_records: int,
) -> dict[str, Any]:
    job_id = uuid.uuid4().hex
    submitted_at = _utc_now_iso()
    job = {
        "job_id": job_id,
        "status": "pending",
        "submitted_at": submitted_at,
        "started_at": None,
        "finished_at": None,
        "record_count": int(len(records)),
        "requested_by": requested_by,
        "worker_id": None,
        "metrics": None,
        "error": None,
        "training_data_source": str(training_data_source or "api"),
        "db_records": int(max(db_records, 0)),
        "records": records,
    }
    with _QUEUE_LOCK:
        _write_job(job)
    return _public_job(job)


def get_training_job(job_id: str) -> dict[str, Any] | None:
    path = _job_path(job_id)
    if not path.exists():
        return None
    with _QUEUE_LOCK:
        try:
            return _public_job(_read_job(path))
        except Exception:
            return None


def claim_next_pending_job(worker_id: str) -> dict[str, Any] | None:
    with _QUEUE_LOCK:
        pending_paths = sorted(_JOB_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime)
        for path in pending_paths:
            job = _read_job(path)
            if job.get("status") != "pending":
                continue
            job["status"] = "running"
            job["started_at"] = _utc_now_iso()
            job["worker_id"] = worker_id
            _write_job(job)
            return job
    return None


def complete_job_success(job_id: str, metrics: dict[str, float]) -> dict[str, Any] | None:
    path = _job_path(job_id)
    if not path.exists():
        return None
    with _QUEUE_LOCK:
        job = _read_job(path)
        job["status"] = "succeeded"
        job["finished_at"] = _utc_now_iso()
        job["metrics"] = metrics
        job["error"] = None
        _write_job(job)
        return _public_job(job)


def complete_job_failure(job_id: str, error: str) -> dict[str, Any] | None:
    path = _job_path(job_id)
    if not path.exists():
        return None
    with _QUEUE_LOCK:
        job = _read_job(path)
        job["status"] = "failed"
        job["finished_at"] = _utc_now_iso()
        job["error"] = str(error)[:1200]
        _write_job(job)
        return _public_job(job)
