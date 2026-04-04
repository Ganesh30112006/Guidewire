"""
Risk Engine Service — AI-powered risk and payout calculation.

Algorithms used:
  • Dynamic risk scoring  : weighted multi-factor linear model
  • Dynamic premium       : risk-adjusted pricing (₹12–₹35 range)
  • Payout calculation    : income-based with 85% reimbursement rate
  • AI claim recommendation: confidence-weighted fraud heuristics
"""

from __future__ import annotations
import math
import hashlib


WORK_HOURS_PER_DAY = 10
PAYOUT_RATE = 0.85          # 85% reimbursement
BASE_PREMIUM = 12.0
MAX_PREMIUM = 35.0

# Risk weights for each factor (must sum to 1.0)
_WEIGHTS = {
    "disruption_history":  0.35,   # Past claims frequency
    "zone_risk":           0.30,   # Zone-level risk score
    "platform_stability":  0.20,   # Platform churn rate proxy
    "income_variability":  0.15,   # Earnings inconsistency
}

# Platform risk proxy (lower = more stable platform)
_PLATFORM_RISK: dict[str, float] = {
    "Zomato":  0.55,
    "Swiggy":  0.55,
    "Blinkit": 0.50,
    "Zepto":   0.50,
    "Dunzo":   0.65,
    "Other":   0.70,
}

# Zone base risk scores
_ZONE_RISK: dict[str, float] = {
    "Zone A": 0.82,
    "Zone B": 0.56,
    "Zone C": 0.28,
    "Zone D": 0.61,
}

_DEFAULT_REGION_ROLLOUT: dict[str, dict[str, int | bool]] = {
    "Zone A": {"enabled": True, "baseline": 70, "challenger": 30},
    "Zone B": {"enabled": True, "baseline": 80, "challenger": 20},
    "Zone C": {"enabled": True, "baseline": 90, "challenger": 10},
    "Zone D": {"enabled": True, "baseline": 75, "challenger": 25},
}


def calculate_risk_score(
    *,
    claim_count_last_30d: int,
    zone: str | None,
    platform: str | None,
    avg_daily_income: float,
) -> float:
    """
    Compute a 0–100 risk score using a weighted linear model.
    Higher score = higher risk.
    """
    # Factor 1: disruption history (0–1)
    disruption = min(claim_count_last_30d / 10.0, 1.0)   # Saturates at 10 claims

    # Factor 2: zone risk (0–1)
    zone_risk = _ZONE_RISK.get(zone or "", 0.5)

    # Factor 3: platform stability (0–1)
    platform_risk = _PLATFORM_RISK.get(platform or "", 0.60)

    # Factor 4: income variability proxy (lower income = higher variability risk)
    # Sigmoid-like: ₹0→1.0, ₹1000→0.5, ₹3000→0.1
    income_risk = 1.0 / (1.0 + math.exp((avg_daily_income - 1000) / 400))

    score = (
        disruption  * _WEIGHTS["disruption_history"] +
        zone_risk   * _WEIGHTS["zone_risk"] +
        platform_risk * _WEIGHTS["platform_stability"] +
        income_risk * _WEIGHTS["income_variability"]
    ) * 100

    return round(min(max(score, 0.0), 100.0), 2)


def calculate_dynamic_premium(risk_score: float) -> float:
    """₹12 at risk=0, ₹35 at risk=100. Linear interpolation."""
    clamped = max(0.0, min(100.0, risk_score))
    return round(BASE_PREMIUM + (clamped / 100.0) * (MAX_PREMIUM - BASE_PREMIUM), 2)


def simulate_dynamic_pricing(
    *,
    claim_count_last_30d: int,
    zone: str | None,
    platform: str | None,
    avg_daily_income: float,
    lost_hours: float,
    model_variant: str = "baseline",
) -> dict[str, float | str]:
    """Admin what-if simulation for premium and payout sensitivity."""
    base_risk = calculate_risk_score(
        claim_count_last_30d=claim_count_last_30d,
        zone=zone,
        platform=platform,
        avg_daily_income=avg_daily_income,
    )

    # Challenger variant intentionally reacts stronger to recent disruptions.
    adjusted_risk = base_risk
    if model_variant == "challenger":
        adjusted_risk = min(100.0, base_risk + (claim_count_last_30d * 0.8) + (lost_hours * 0.5))

    weekly_premium = calculate_dynamic_premium(adjusted_risk)
    projected_payout = calculate_payout(lost_hours, avg_daily_income)
    income_loss = calculate_income_loss(lost_hours, avg_daily_income)

    return {
        "model_variant": model_variant,
        "risk_score": round(adjusted_risk, 2),
        "weekly_premium": weekly_premium,
        "projected_payout": projected_payout,
        "projected_income_loss": income_loss,
    }


def choose_model_variant_for_worker(zone: str | None, worker_id: str) -> str:
    """Deterministic region-based rollout for baseline/challenger risk models."""
    zone_key = zone or "default"
    config = _DEFAULT_REGION_ROLLOUT.get(zone_key, {"enabled": True, "baseline": 85, "challenger": 15})
    if not bool(config.get("enabled", True)):
        return "baseline"

    challenger_weight = int(config.get("challenger", 0))
    bucket = int(hashlib.sha256(f"{zone_key}:{worker_id}".encode("utf-8")).hexdigest()[:8], 16) % 100
    return "challenger" if bucket < challenger_weight else "baseline"


def get_rollout_config() -> dict[str, dict[str, int | bool]]:
    return {zone: dict(values) for zone, values in _DEFAULT_REGION_ROLLOUT.items()}


def update_rollout_config(config: dict[str, dict[str, int | bool]]) -> dict[str, dict[str, int | bool]]:
    for zone, values in config.items():
        enabled = bool(values.get("enabled", True))
        baseline = max(0, min(100, int(values.get("baseline", 0))))
        challenger = max(0, min(100, int(values.get("challenger", 0))))
        total = baseline + challenger
        if total != 100:
            # Keep the percentage model stable even with imperfect input.
            baseline = 100 - challenger
        _DEFAULT_REGION_ROLLOUT[zone] = {
            "enabled": enabled,
            "baseline": baseline,
            "challenger": challenger,
        }
    return get_rollout_config()


def calculate_payout(lost_hours: float, avg_daily_income: float) -> float:
    """Payout = lost_hours × hourly_rate × PAYOUT_RATE."""
    hourly = avg_daily_income / WORK_HOURS_PER_DAY
    return round(lost_hours * hourly * PAYOUT_RATE, 2)


def calculate_income_loss(lost_hours: float, avg_daily_income: float) -> float:
    hourly = avg_daily_income / WORK_HOURS_PER_DAY
    return round(lost_hours * hourly, 2)


# ── AI Claim Recommendation ────────────────────────────────────────────────────
# Heuristic fraud detector: fast, deterministic, no ML dependency needed for MVP.
# Replace with an ML model (sklearn/xgboost) when labeled data is available.

def ai_recommend_claim(
    *,
    disruption_type: str,
    lost_hours: float,
    worker_risk_score: float,
    worker_trust_score: float,
    claim_count_last_30d: int,
    zone_disruption_confidence: float,     # 0–100 from weather/zone data
) -> tuple[str, float]:
    """
    Returns (recommendation, confidence_score).
    recommendation: "approve" | "reject" | "review"
    confidence_score: 0–100
    """
    # Start at neutral 50 and adjust
    score = 50.0

    # High zone disruption confirmation → approve signal
    score += zone_disruption_confidence * 0.30

    # Trust score (track record) → approve signal
    score += (worker_trust_score / 100.0) * 20.0

    # High risk worker filing many claims → suspicious
    if claim_count_last_30d >= 5:
        score -= 20.0
    elif claim_count_last_30d >= 3:
        score -= 10.0

    # Unusually high hours for disruption type
    max_hours = {"Heavy Rain": 6, "Extreme Heat": 5, "Flood": 12, "Pollution": 4, "Other": 8}
    if lost_hours > max_hours.get(disruption_type, 8):
        score -= 15.0

    # High risk score → caution
    if worker_risk_score > 75:
        score -= 10.0

    score = max(0.0, min(100.0, score))

    if score >= 75:
        return "approve", round(score, 1)
    elif score <= 40:
        return "reject", round(100.0 - score, 1)
    else:
        return "review", round(score, 1)
