from __future__ import annotations

import argparse
import json
import random
import shutil
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
    normal_device: str
    normal_ip: str


def fetch_db_claim_records(limit: int = 5000) -> list[dict[str, Any]]:
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
                    c.disruption_type,
                    c.lost_hours,
                    COALESCE(u.city, 'Unknown') AS city,
                    u.created_at AS user_created_at
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
    per_user_times: dict[str, list[datetime]] = defaultdict(list)
    per_user_amounts: dict[str, list[float]] = defaultdict(list)

    rng = random.Random(420)
    out: list[dict[str, Any]] = []

    for i, row in enumerate(rows):
        claim_time = row.get("created_at")
        if claim_time is None:
            continue
        if claim_time.tzinfo is None:
            claim_time = claim_time.replace(tzinfo=timezone.utc)

        user_id = str(row.get("worker_id"))
        created = row.get("user_created_at")
        if created is None:
            account_age = 180
        else:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            account_age = max(1, int((claim_time - created).total_seconds() / 86400.0))

        est = float(row.get("estimated_income_loss") or 0.0)
        payout = float(row.get("payout_amount") or 0.0)
        amount = max(est, payout, 45.0)

        times = per_user_times[user_id]
        c7 = sum(1 for t in times if (claim_time - t).total_seconds() <= 7 * 86400)
        c30 = sum(1 for t in times if (claim_time - t).total_seconds() <= 30 * 86400)

        amounts = per_user_amounts[user_id]
        hist_avg = float(np.median(amounts)) if amounts else amount

        status = str(row.get("status") or "Pending")
        ai_rec = str(row.get("ai_recommendation") or "")
        disruption = str(row.get("disruption_type") or "Other")
        lost_hours = float(row.get("lost_hours") or 0.0)

        label = 0
        if status == "Rejected" or ai_rec == "reject":
            label = 1
        if disruption == "Other" and lost_hours > 10 and amount > 2.7 * max(hist_avg, 1.0):
            label = 1

        normal_dev = f"db-dev-{abs(hash(user_id)) % 450}"
        normal_ip = f"10.20.{abs(hash(user_id)) % 200}.{(abs(hash(user_id)) // 7) % 200 + 20}"
        device_id = normal_dev
        ip_address = normal_ip

        if label == 1 and rng.random() < 0.6:
            device_id = f"db-shared-{i % 80}"
        if label == 1 and rng.random() < 0.55:
            ip_address = f"172.20.{i % 100}.{(i * 5) % 240 + 5}"

        out.append(
            {
                "user_id": user_id,
                "claim_amount": float(round(amount, 2)),
                "claim_time": claim_time.isoformat(),
                "device_id": device_id,
                "ip_address": ip_address,
                "location": str(row.get("city") or "Unknown"),
                "claims_last_7d": int(c7),
                "claims_last_30d": int(c30),
                "account_age": int(account_age),
                "historical_avg_claim_amount": float(round(max(hist_avg, 1.0), 2)),
                "label": int(label),
            }
        )

        times.append(claim_time)
        amounts.append(amount)

    return out


def build_profiles(total_users: int, rng: random.Random) -> list[UserProfile]:
    cities = ["Mumbai", "Delhi", "Bangalore", "Pune", "Hyderabad", "Kolkata", "Chennai", "Ahmedabad"]
    profiles: list[UserProfile] = []
    for i in range(total_users):
        uid = f"sim-u-{i+1}"
        city = rng.choice(cities)
        avg_amt = max(90.0, rng.gauss(950.0, 260.0))
        normal_dev = f"sim-dev-{abs(hash(uid)) % 800}"
        normal_ip = f"10.40.{abs(hash(uid)) % 220}.{(abs(hash((uid,'ip'))) % 200) + 10}"
        profiles.append(
            UserProfile(
                user_id=uid,
                city=city,
                account_age_days=rng.randint(4, 2000),
                avg_claim_amount=avg_amt,
                volatility=rng.uniform(0.15, 0.6),
                normal_device=normal_dev,
                normal_ip=normal_ip,
            )
        )
    return profiles


def inject_noise_and_drift(records: list[dict[str, Any]], rng: random.Random, noise_level: float) -> None:
    n = len(records)
    if n == 0:
        return

    corrupt_count = int(n * noise_level)
    for _ in range(corrupt_count):
        idx = rng.randrange(n)
        r = records[idx]
        mode = rng.choice(["label_flip", "amount_spike", "timestamp_shift", "freq_distort", "location_noise"])
        if mode == "label_flip":
            if rng.random() < 0.35:
                r["label"] = 1 - int(r["label"])
        elif mode == "amount_spike":
            if rng.random() < 0.55:
                r["claim_amount"] = float(round(max(20.0, r["claim_amount"] * rng.uniform(0.3, 4.5)), 2))
        elif mode == "timestamp_shift":
            dt = datetime.fromisoformat(r["claim_time"].replace("Z", "+00:00"))
            dt = dt + timedelta(hours=rng.randint(-120, 120))
            r["claim_time"] = dt.isoformat()
        elif mode == "freq_distort":
            r["claims_last_7d"] = int(max(0, r["claims_last_7d"] + rng.randint(-3, 6)))
            r["claims_last_30d"] = int(max(r["claims_last_7d"], r["claims_last_30d"] + rng.randint(-5, 10)))
        else:
            if rng.random() < 0.4:
                r["location"] = rng.choice(["Unknown", "OutlierCity", "Remote", "-", r["location"]])


def simulate_high_pressure_records(total: int, seed: int, pressure_level: int) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)
    profiles = build_profiles(max(140, total // 24), rng)

    rings = [
        {
            "devices": [f"ring-dev-{j}-{k}" for k in range(12 + pressure_level * 2)],
            "ips": [f"198.51.{j}.{20+k}" for k in range(18 + pressure_level * 3)],
        }
        for j in range(10)
    ]

    account_takeover_ips = [f"203.0.113.{i+5}" for i in range(120)]

    now = datetime.now(timezone.utc)
    user_times: dict[str, list[datetime]] = defaultdict(list)
    user_amounts: dict[str, list[float]] = defaultdict(list)

    records: list[dict[str, Any]] = []

    fraud_base = 0.14 + pressure_level * 0.015

    for i in range(total):
        p = rng.choice(profiles)

        day_back = rng.randint(0, 240)
        hour = rng.randint(0, 23)

        # High-pressure windows: storms, payout season, coordinated attacks.
        event_burst = 1.0
        if (20 < day_back < 40) or (90 < day_back < 120) or (170 < day_back < 190):
            event_burst = 1.55 + pressure_level * 0.08

        claim_time = now - timedelta(days=day_back, hours=hour)

        hist_amt = user_amounts[p.user_id]
        hist_avg = float(np.median(hist_amt)) if hist_amt else p.avg_claim_amount

        base_amt = max(40.0, rng.gauss(p.avg_claim_amount, p.avg_claim_amount * p.volatility))

        scenario_draw = rng.random()
        is_fraud = 1 if scenario_draw < fraud_base else 0
        scenario = "normal"
        if is_fraud:
            scenario = rng.choice(["ring", "ato", "burst", "serial_microfraud", "cross_region"])

        if scenario == "ring":
            ring = rng.choice(rings)
            claim_amount = base_amt * rng.uniform(2.0, 4.4)
            device_id = rng.choice(ring["devices"])
            ip_address = rng.choice(ring["ips"])
            location = rng.choice(["Mumbai", "Delhi", "Bangalore"])
        elif scenario == "ato":
            claim_amount = base_amt * rng.uniform(1.8, 3.6)
            device_id = f"ato-dev-{rng.randint(1, 280)}"
            ip_address = rng.choice(account_takeover_ips)
            location = rng.choice(["Unknown", "Remote", "Dubai", p.city])
        elif scenario == "burst":
            claim_amount = base_amt * rng.uniform(1.6, 2.7)
            device_id = p.normal_device
            ip_address = p.normal_ip
            location = p.city
        elif scenario == "serial_microfraud":
            claim_amount = max(35.0, base_amt * rng.uniform(0.45, 0.95))
            device_id = f"micro-dev-{abs(hash((p.user_id, i // 3))) % 900}"
            ip_address = f"10.77.{abs(hash(p.user_id)) % 130}.{rng.randint(10, 240)}"
            location = p.city
        elif scenario == "cross_region":
            claim_amount = base_amt * rng.uniform(1.5, 2.9)
            device_id = f"xreg-dev-{rng.randint(1, 400)}"
            ip_address = f"100.64.{rng.randint(1,100)}.{rng.randint(5,240)}"
            location = rng.choice(["Kolkata", "Jaipur", "Lucknow", "Unknown", p.city])
        else:
            claim_amount = base_amt * rng.uniform(0.9, 1.15)
            if rng.random() < 0.08 + pressure_level * 0.01:
                claim_amount *= rng.uniform(1.4, 2.0)
            device_id = p.normal_device if rng.random() > 0.12 else f"drift-dev-{rng.randint(1, 1200)}"
            ip_address = p.normal_ip if rng.random() > 0.14 else f"10.90.{rng.randint(1,120)}.{rng.randint(5,240)}"
            location = p.city if rng.random() > 0.08 else rng.choice([p.city, "Unknown", "Remote"])

        times = user_times[p.user_id]
        c7 = sum(1 for t in times if (claim_time - t).total_seconds() <= 7 * 86400)
        c30 = sum(1 for t in times if (claim_time - t).total_seconds() <= 30 * 86400)

        if scenario in {"burst", "serial_microfraud"}:
            c7 += rng.randint(3, 8 + pressure_level)
            c30 += rng.randint(8, 16 + pressure_level * 2)

        c7 = int(max(0, c7 * event_burst))
        c30 = int(max(c7, c30 * event_burst))

        account_age = max(1, p.account_age_days - day_back)

        # Hard negatives and hard positives to increase training pressure.
        if is_fraud == 0 and rng.random() < 0.07:
            claim_amount *= rng.uniform(1.7, 2.4)
            c7 += rng.randint(1, 3)
        if is_fraud == 1 and rng.random() < 0.11:
            claim_amount *= rng.uniform(0.7, 1.1)

        # Heavy-tail stress.
        if rng.random() < 0.03 + pressure_level * 0.01:
            claim_amount *= float(np_rng.lognormal(mean=0.8 + 0.05 * pressure_level, sigma=0.45))

        # Real-world imperfect labels.
        if is_fraud == 1 and rng.random() < (0.08 + pressure_level * 0.01):
            is_fraud = 0
        elif is_fraud == 0 and rng.random() < (0.02 + pressure_level * 0.005):
            is_fraud = 1

        record = {
            "user_id": p.user_id,
            "claim_amount": float(round(max(25.0, claim_amount), 2)),
            "claim_time": claim_time.isoformat(),
            "device_id": device_id,
            "ip_address": ip_address,
            "location": location,
            "claims_last_7d": int(max(0, c7)),
            "claims_last_30d": int(max(c7, c30)),
            "account_age": int(account_age),
            "historical_avg_claim_amount": float(round(max(hist_avg, 25.0), 2)),
            "label": int(is_fraud),
        }
        records.append(record)
        user_times[p.user_id].append(claim_time)
        user_amounts[p.user_id].append(record["claim_amount"])

    noise_level = min(0.22, 0.08 + pressure_level * 0.03)
    inject_noise_and_drift(records, rng, noise_level)

    return records


def build_mixed_dataset(target_records: int, db_limit: int, seed: int, pressure_level: int) -> dict[str, Any]:
    rng = random.Random(seed)

    db_records = fetch_db_claim_records(limit=db_limit)
    db_take = min(len(db_records), int(target_records * 0.45))
    db_records = db_records[:db_take]

    sim_needed = max(0, target_records - db_take)
    sim_records = simulate_high_pressure_records(total=sim_needed, seed=seed + 7, pressure_level=pressure_level)

    all_records = db_records + sim_records
    rng.shuffle(all_records)

    # Ensure enough positives.
    pos_count = sum(int(r["label"]) for r in all_records)
    min_pos = max(120, int(0.07 * len(all_records)))
    if pos_count < min_pos:
        extra = simulate_high_pressure_records(total=max(1200, target_records // 3), seed=seed + 99, pressure_level=pressure_level + 1)
        all_records.extend(extra)
        rng.shuffle(all_records)

    return {
        "records": all_records,
        "db_count": len(db_records),
        "sim_count": len(all_records) - len(db_records),
    }


def score_run(metrics: dict[str, float]) -> float:
    pr_auc = float(metrics.get("avg_precision_calibrated", 0.0))
    f1 = float(metrics.get("f1", 0.0))
    recall = float(metrics.get("recall", 0.0))
    precision = float(metrics.get("precision", 0.0))
    sanity_penalty = 0.0
    if float(metrics.get("leakage_warning", 0.0)) > 0.5:
        sanity_penalty = 0.2
    return (0.40 * pr_auc) + (0.30 * f1) + (0.20 * recall) + (0.10 * precision) - sanity_penalty


def train_under_pressure(
    rounds: int,
    target_records: int,
    db_limit: int,
    base_model_dir: str,
    pressure_level: int,
    min_recall: float,
    min_pr_auc: float,
) -> dict[str, Any]:
    model_dir = Path(base_model_dir)
    model_dir.mkdir(parents=True, exist_ok=True)

    round_summaries: list[dict[str, Any]] = []
    best_score = -1.0
    best_round_name = ""
    best_accepted_score = -1.0
    best_accepted_round_name = ""

    for i in range(rounds):
        round_id = i + 1
        round_seed = 90 + i * 17
        round_pressure = pressure_level + i
        round_size = target_records + i * int(target_records * 0.15)

        mixed = build_mixed_dataset(
            target_records=round_size,
            db_limit=db_limit,
            seed=round_seed,
            pressure_level=round_pressure,
        )

        round_model_name = f"hybrid_fraud_engine_round_{round_id}.joblib"
        engine = HybridFraudEngine(model_dir=str(model_dir), model_name=round_model_name)
        metrics = engine.fit(mixed["records"])
        run_score = score_run(metrics)
        recall = float(metrics.get("recall", 0.0))
        pr_auc = float(metrics.get("avg_precision_calibrated", 0.0))
        accepted = recall >= min_recall and pr_auc >= min_pr_auc

        summary = {
            "round": round_id,
            "seed": round_seed,
            "pressure_level": round_pressure,
            "records": len(mixed["records"]),
            "db_records": mixed["db_count"],
            "sim_records": mixed["sim_count"],
            "fraud_rate": round(sum(int(r["label"]) for r in mixed["records"]) / max(len(mixed["records"]), 1), 4),
            "score": run_score,
            "accepted": accepted,
            "metrics": metrics,
            "model_name": round_model_name,
        }
        round_summaries.append(summary)

        if run_score > best_score:
            best_score = run_score
            best_round_name = round_model_name

        if accepted and run_score > best_accepted_score:
            best_accepted_score = run_score
            best_accepted_round_name = round_model_name

    # Promote best round artifact as default model.
    default_model = model_dir / "hybrid_fraud_engine.joblib"
    promoted_from = ""
    if best_accepted_round_name:
        shutil.copyfile(model_dir / best_accepted_round_name, default_model)
        promoted_from = best_accepted_round_name
    elif best_round_name:
        shutil.copyfile(model_dir / best_round_name, default_model)
        promoted_from = best_round_name

    final_report = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "rounds": round_summaries,
        "best_score": best_score,
        "best_model_name": best_round_name,
        "best_accepted_score": best_accepted_score,
        "best_accepted_model_name": best_accepted_round_name,
        "gate_min_recall": min_recall,
        "gate_min_pr_auc": min_pr_auc,
        "gate_any_accepted": bool(best_accepted_round_name),
        "promoted_model": str(default_model.name),
        "promoted_from": promoted_from,
    }

    report_path = model_dir / "training_report_extreme.json"
    report_path.write_text(json.dumps(final_report, indent=2), encoding="utf-8")
    return final_report


def main() -> None:
    parser = argparse.ArgumentParser(description="Extreme high-pressure mixed-data trainer for hybrid fraud engine")
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--target-records", type=int, default=10000)
    parser.add_argument("--db-limit", type=int, default=6000)
    parser.add_argument("--model-dir", type=str, default="models")
    parser.add_argument("--pressure-level", type=int, default=2)
    parser.add_argument("--min-recall", type=float, default=0.90)
    parser.add_argument("--min-pr-auc", type=float, default=0.90)
    args = parser.parse_args()

    report = train_under_pressure(
        rounds=max(1, args.rounds),
        target_records=max(4000, args.target_records),
        db_limit=max(1000, args.db_limit),
        base_model_dir=args.model_dir,
        pressure_level=max(1, args.pressure_level),
        min_recall=float(np.clip(args.min_recall, 0.0, 1.0)),
        min_pr_auc=float(np.clip(args.min_pr_auc, 0.0, 1.0)),
    )
    print(json.dumps(report))


if __name__ == "__main__":
    main()
