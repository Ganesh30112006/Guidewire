from __future__ import annotations

import argparse
import socket
import time
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.fraud_engine import fraud_engine
from app.services.fraud_training_queue import (
    claim_next_pending_job,
    complete_job_failure,
    complete_job_success,
)


def process_once(worker_id: str) -> bool:
    job = claim_next_pending_job(worker_id)
    if not job:
        return False

    job_id = str(job["job_id"])
    try:
        metrics = fraud_engine.fit(
            records=job.get("records", []),
            training_data_source=str(job.get("training_data_source") or "api"),
            db_records=int(job.get("db_records") or 0),
        )
        complete_job_success(job_id, metrics)
    except Exception as exc:
        complete_job_failure(job_id, str(exc))
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Process queued fraud-training jobs")
    parser.add_argument("--poll-seconds", type=float, default=2.0, help="Sleep interval when queue is empty")
    parser.add_argument("--once", action="store_true", help="Run one job if available, then exit")
    args = parser.parse_args()

    worker_id = f"{socket.gethostname()}-{int(time.time())}"

    if args.once:
        process_once(worker_id)
        return 0

    while True:
        processed = process_once(worker_id)
        if not processed:
            time.sleep(max(args.poll_seconds, 0.5))


if __name__ == "__main__":
    raise SystemExit(main())
