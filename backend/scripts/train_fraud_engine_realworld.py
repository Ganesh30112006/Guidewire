from __future__ import annotations

import argparse
import json
import random
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pymysql

from app.core.config import get_settings
from app.services.fraud_engine import HybridFraudEngine


@dataclass
class UserProfile:
    user_id: str
    city: str
    account_age_days: int
    avg_claim_amount: float
    volatility: float


def fetch_db_claim_records(limit: int = 2500) -> list[dict[str, Any]]:
    settings = get_settings()
    conn = None
    try:
        conn = pymysql.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=True,
        )
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    c.worker_id,
                    c.created_at,
                    c.estimated_income_loss,
                    c.payout_amount,
                    c.status,
                    c.ai_recommendation,
                    COALESCE(u.city, 'Unknown') AS city,
                    u.created_at AS user_created_at,
                    c.disruption_type,
                    c.lost_hours
                FROM claims c
                JOIN users u ON u.id = c.worker_id
                ORDER BY c.created_at DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = list(cur.fetchall())
    except Exception:
        return []
    finally:
        if conn is not None:
            conn.close()

    if not rows:
        return []

    rows.sort(key=lambda r: r["created_at"])
    per_user_history: dict[str, list[datetime]] = defaultdict(list)
    per_user_amounts: dict[str, list[float]] = defaultdict(list)

    out: list[dict[str, Any]] = []
    rng = random.Random(42)

    for idx, r in enumerate(rows):
        claim_time = r["created_at"]
        if claim_time is None:
            continue
        if claim_time.tzinfo is None:
            claim_time = claim_time.replace(tzinfo=timezone.utc)

        user_id = str(r["worker_id"])
        user_created = r.get("user_created_at")
        if user_created is None:
            account_age = 180
        else:
            if user_created.tzinfo is None:
                user_created = user_created.replace(tzinfo=timezone.utc)
            account_age = max(1, int((claim_time - user_created).total_seconds() / 86400.0))

        est_loss = float(r.get("estimated_income_loss") or 0.0)
        payout = float(r.get("payout_amount") or 0.0)
        amount = max(est_loss, payout, 50.0)

        history = per_user_history[user_id]
        c7 = sum(1 for t in history if (claim_time - t).total_seconds() <= 7 * 86400)
        c30 = sum(1 for t in history if (claim_time - t).total_seconds() <= 30 * 86400)

        amounts = per_user_amounts[user_id]
        hist_avg = float(np.median(amounts)) if amounts else amount

        status = str(r.get("status") or "Pending")
        ai_rec = str(r.get("ai_recommendation") or "")

        label = 0
        if status == "Rejected":
            label = 1
        elif ai_rec == "reject":
            label = 1
        elif status == "Approved":
            label = 0

        disruption = str(r.get("disruption_type") or "Other")
        lost_hours = float(r.get("lost_hours") or 0.0)
        if disruption == "Other" and lost_hours > 10 and amount > 2.8 * max(hist_avg, 1.0):
            label = 1

        # Approximate device/ip behavior from sparse DB data.
        device_base = f"db-dev-{abs(hash(user_id)) % 300}"
        ip_base = f"10.10.{abs(hash(user_id)) % 200}.{(abs(hash(user_id)) // 13) % 220 + 10}"

        # Rejected/suspicious claims have higher chance of device or IP shifts.
        if label == 1 and rng.random() < 0.55:
            device_id = f"db-shared-dev-{idx % 60}"
        elif rng.random() < 0.12:
            device_id = f"db-dev-drift-{abs(hash((user_id, idx))) % 600}"
        else:
            device_id = device_base

        if label == 1 and rng.random() < 0.50:
            ip_address = f"172.16.{idx % 60}.{(idx * 7) % 250 + 2}"
        elif rng.random() < 0.15:
            ip_address = f"10.30.{idx % 80}.{(idx * 11) % 250 + 2}"
        else:
            ip_address = ip_base

        record = {
            "user_id": user_id,
            "claim_amount": float(round(amount, 2)),
            "claim_time": claim_time.isoformat(),
            "device_id": device_id,
            "ip_address": ip_address,
            "location": str(r.get("city") or "Unknown"),
            "claims_last_7d": int(c7),
            "claims_last_30d": int(c30),
            "account_age": int(account_age),
            "historical_avg_claim_amount": float(round(max(hist_avg, 1.0), 2)),
            "label": int(label),
        }
        out.append(record)

        history.append(claim_time)
        amounts.append(amount)

    return out


def build_user_profiles(user_count: int, rng: random.Random) -> list[UserProfile]:
    cities = [
        "Mumbai",
        "Delhi",
        "Bangalore",
        "Pune",
        "Chennai",
        "Hyderabad",
        "Kolkata",
        "Ahmedabad",
    ]
    profiles: list[UserProfile] = []
    for i in range(user_count):
        city = rng.choice(cities)
        base = max(120.0, rng.gauss(900.0, 220.0))
        profile = UserProfile(
            user_id=f"sim-u-{i+1}",
            city=city,
            account_age_days=rng.randint(5, 1800),
            avg_claim_amount=base,
            volatility=rng.uniform(0.18, 0.52),
        )
        profiles.append(profile)
    return profiles


def simulate_realworld_records(total: int, seed: int = 41) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)

    users = build_user_profiles(user_count=max(90, total // 25), rng=rng)
    now = datetime.now(timezone.utc)

    # Fraud rings share devices/IPs and rotate users.
    ring_devices = [f"ring-dev-{i}" for i in range(25)]
    ring_ips = [f"192.168.66.{i+10}" for i in range(35)]

    user_claim_times: dict[str, list[datetime]] = defaultdict(list)
    user_claim_amounts: dict[str, list[float]] = defaultdict(list)

    records: list[dict[str, Any]] = []

    for i in range(total):
        profile = rng.choice(users)

        # Seasonality and event spikes.
        day_shift = rng.randint(0, 210)
        hour = rng.randint(0, 23)
        claim_time = now - timedelta(days=day_shift, hours=hour)

        hist = user_claim_amounts[profile.user_id]
        hist_avg = float(np.median(hist)) if hist else profile.avg_claim_amount

        # Fraud scenario mix.
        is_fraud = 0
        scenario = "normal"
        p = rng.random()
        if p < 0.07:
            is_fraud = 1
            scenario = "collusion_ring"
        elif p < 0.12:
            is_fraud = 1
            scenario = "account_takeover"
        elif p < 0.18:
            is_fraud = 1
            scenario = "claim_burst"

        claim_amount = max(45.0, rng.gauss(profile.avg_claim_amount, profile.avg_claim_amount * profile.volatility))

        if scenario == "collusion_ring":
            claim_amount *= rng.uniform(2.2, 3.7)
            device_id = rng.choice(ring_devices)
            ip_address = rng.choice(ring_ips)
            location = rng.choice(["Mumbai", "Delhi", "Bangalore"])
        elif scenario == "account_takeover":
            claim_amount *= rng.uniform(1.8, 3.0)
            device_id = f"ato-dev-{rng.randint(1, 120)}"
            ip_address = f"203.0.113.{rng.randint(5, 180)}"
            location = rng.choice(["Dubai", "Singapore", "Unknown", profile.city])
        elif scenario == "claim_burst":
            claim_amount *= rng.uniform(1.5, 2.4)
            device_id = f"sim-dev-{abs(hash((profile.user_id, i // 2))) % 500}"
            ip_address = f"10.55.{abs(hash(profile.user_id)) % 80}.{rng.randint(2, 240)}"
            location = profile.city
        else:
            device_id = f"sim-dev-{abs(hash(profile.user_id)) % 500}"
            ip_address = f"10.44.{abs(hash(profile.user_id)) % 110}.{abs(hash((profile.user_id, 'ip'))) % 180 + 20}"
            location = profile.city

        hist_times = user_claim_times[profile.user_id]
        claims_7d = sum(1 for t in hist_times if (claim_time - t).total_seconds() <= 7 * 86400)
        claims_30d = sum(1 for t in hist_times if (claim_time - t).total_seconds() <= 30 * 86400)

        if scenario == "claim_burst":
            claims_7d += rng.randint(3, 6)
            claims_30d += rng.randint(5, 12)

        account_age = max(1, profile.account_age_days - day_shift)

        # Add occasional label noise for realism.
        if is_fraud == 1 and rng.random() < 0.12:
            is_fraud = 0
        elif is_fraud == 0 and rng.random() < 0.03:
            is_fraud = 1

        # Heavy-tail outliers to resemble real claim distributions.
        if rng.random() < 0.02:
            claim_amount *= float(np_rng.lognormal(mean=0.9, sigma=0.35))

        rec = {
            "user_id": profile.user_id,
            "claim_amount": float(round(max(claim_amount, 30.0), 2)),
            "claim_time": claim_time.isoformat(),
            "device_id": device_id,
            "ip_address": ip_address,
            "location": location,
            "claims_last_7d": int(max(0, claims_7d)),
            "claims_last_30d": int(max(0, claims_30d)),
            "account_age": int(account_age),
            "historical_avg_claim_amount": float(round(max(hist_avg, 30.0), 2)),
            "label": int(is_fraud),
        }

        records.append(rec)
        user_claim_times[profile.user_id].append(claim_time)
        user_claim_amounts[profile.user_id].append(rec["claim_amount"])

    return records


def train_best_effort(target_records: int, db_limit: int, model_dir: str) -> dict[str, Any]:
    db_records = fetch_db_claim_records(limit=db_limit)

    sim_needed = max(0, target_records - len(db_records))
    sim_records = simulate_realworld_records(total=max(sim_needed, 1800))

    all_records = db_records + sim_records
    random.Random(99).shuffle(all_records)

    # Ensure enough class diversity if DB is skewed.
    positives = sum(int(r["label"]) for r in all_records)
    if positives < max(80, int(0.05 * len(all_records))):
        extra = simulate_realworld_records(total=max(1200, target_records // 2), seed=77)
        all_records.extend(extra)
        random.Random(123).shuffle(all_records)

    engine = HybridFraudEngine(model_dir=model_dir)
    metrics = engine.fit(all_records)

    summary = {
        "trained_records": len(all_records),
        "db_records": len(db_records),
        "sim_records": len(sim_records),
        "fraud_rate": round(sum(int(r["label"]) for r in all_records) / max(len(all_records), 1), 4),
        "metrics": metrics,
    }

    model_path = Path(model_dir) / "training_report_latest.json"
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Train hybrid fraud engine with real-world-like data.")
    parser.add_argument("--target-records", type=int, default=6000, help="Target combined records for training")
    parser.add_argument("--db-limit", type=int, default=3500, help="Max real claims to load from DB")
    parser.add_argument("--model-dir", type=str, default="models", help="Model directory")
    args = parser.parse_args()

    result = train_best_effort(
        target_records=max(1500, args.target_records),
        db_limit=max(500, args.db_limit),
        model_dir=args.model_dir,
    )
    print(json.dumps(result))


if __name__ == "__main__":
    main()
