import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  calculatePayout,
  calculateDynamicPremium,
  normalizePlans,
  getInsurancePlansSnapshot,
  WORK_HOURS_PER_DAY,
  type InsurancePlan,
} from "@/services/api";

// ─── calculateDynamicPremium ────────────────────────────────────────────────
describe("calculateDynamicPremium", () => {
  it("returns ₹12 at risk score 0 (minimum premium)", () => {
    expect(calculateDynamicPremium(0)).toBe(12);
  });

  it("returns ₹35 at risk score 100 (maximum premium)", () => {
    expect(calculateDynamicPremium(100)).toBe(35);
  });

  it("clamps negative risk scores to ₹12", () => {
    expect(calculateDynamicPremium(-50)).toBe(12);
  });

  it("clamps risk scores above 100 to ₹35", () => {
    expect(calculateDynamicPremium(150)).toBe(35);
  });

  it("returns correct midpoint at risk score 50", () => {
    // 12 + (50/100) * 23 = 23.5 → round = 24
    expect(calculateDynamicPremium(50)).toBe(24);
  });

  it("returns correct value at risk score 72", () => {
    // 12 + (72/100) * 23 = 28.56 → round = 29
    expect(calculateDynamicPremium(72)).toBe(29);
  });

  it("premium is always between ₹12 and ₹35 for any valid input", () => {
    [0, 25, 50, 75, 100].forEach((score) => {
      const p = calculateDynamicPremium(score);
      expect(p).toBeGreaterThanOrEqual(12);
      expect(p).toBeLessThanOrEqual(35);
    });
  });
});

// ─── calculatePayout ────────────────────────────────────────────────────────
describe("calculatePayout", () => {
  it("pays 85% of lost income (6 hrs × ₹85/hr)", () => {
    // 6 * 85 * 0.85 = 433.5 → 434
    expect(calculatePayout(6, 85)).toBe(434);
  });

  it("returns 0 for 0 hours lost", () => {
    expect(calculatePayout(0, 100)).toBe(0);
  });

  it("returns 0 for 0 hourly income", () => {
    expect(calculatePayout(5, 0)).toBe(0);
  });

  it("rounds correctly (1 hr × ₹85/hr → ₹72)", () => {
    // 1 * 85 * 0.85 = 72.25 → 72
    expect(calculatePayout(1, 85)).toBe(72);
  });

  it("handles fractional hours (0.5 hr × ₹100/hr → ₹43)", () => {
    // 0.5 * 100 * 0.85 = 42.5 → 43 (Math.round(.5) = up in JS)
    expect(calculatePayout(0.5, 100)).toBe(43);
  });
});

// ─── WORK_HOURS_PER_DAY ─────────────────────────────────────────────────────
describe("WORK_HOURS_PER_DAY", () => {
  it("is 10", () => {
    expect(WORK_HOURS_PER_DAY).toBe(10);
  });

  it("produces correct average hourly income at ₹850/day", () => {
    const hourly = 850 / WORK_HOURS_PER_DAY;
    expect(hourly).toBe(85);
  });
});

// ─── normalizePlans ──────────────────────────────────────────────────────────
describe("normalizePlans", () => {
  const validPlan: InsurancePlan = {
    id: "basic",
    name: "Basic Plan",
    weeklyPremium: 15,
    coverage: 1000,
    risks: ["Rain"],
  };

  it("passes through a valid plan unchanged", () => {
    const result = normalizePlans([validPlan]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "basic", name: "Basic Plan", weeklyPremium: 15, coverage: 1000 });
  });

  it("trims whitespace from id and name", () => {
    const plan = { ...validPlan, id: "  basic  ", name: "  Basic Plan  " };
    const result = normalizePlans([plan]);
    expect(result[0].id).toBe("basic");
    expect(result[0].name).toBe("Basic Plan");
  });

  it("removes plans with an empty id after trimming", () => {
    const plan = { ...validPlan, id: "   " };
    expect(normalizePlans([plan])).toHaveLength(0);
  });

  it("removes plans with an empty name after trimming", () => {
    const plan = { ...validPlan, name: "" };
    expect(normalizePlans([plan])).toHaveLength(0);
  });

  it("deduplicates and trims risk strings", () => {
    const plan = { ...validPlan, risks: ["Rain", "  Rain  ", "Flood", "Flood"] };
    const result = normalizePlans([plan]);
    expect(result[0].risks).toEqual(["Rain", "Flood"]);
  });

  it("removes blank risk strings", () => {
    const plan = { ...validPlan, risks: ["Rain", "  ", "Flood"] };
    const result = normalizePlans([plan]);
    expect(result[0].risks).toEqual(["Rain", "Flood"]);
  });

  it("coerces string weeklyPremium and coverage to numbers", () => {
    const plan = { ...validPlan, weeklyPremium: "22" as unknown as number, coverage: "1500" as unknown as number };
    const result = normalizePlans([plan]);
    expect(result[0].weeklyPremium).toBe(22);
    expect(result[0].coverage).toBe(1500);
  });

  it("sets weeklyPremium and coverage to 0 for non-numeric values", () => {
    const plan = { ...validPlan, weeklyPremium: null as unknown as number, coverage: undefined as unknown as number };
    const result = normalizePlans([plan]);
    expect(result[0].weeklyPremium).toBe(0);
    expect(result[0].coverage).toBe(0);
  });

  it("omits popular key when not truthy", () => {
    const result = normalizePlans([validPlan]);
    expect(result[0]).not.toHaveProperty("popular");
  });

  it("includes popular: true when set", () => {
    const plan = { ...validPlan, popular: true };
    const result = normalizePlans([plan]);
    expect(result[0].popular).toBe(true);
  });

  it("filters out plans with null id", () => {
    const plan = { ...validPlan, id: null as unknown as string };
    expect(normalizePlans([plan])).toHaveLength(0);
  });

  it("handles an empty array", () => {
    expect(normalizePlans([])).toEqual([]);
  });

  it("processes multiple plans preserving order", () => {
    const plans: InsurancePlan[] = [
      { ...validPlan, id: "a", name: "Plan A" },
      { ...validPlan, id: "b", name: "Plan B" },
    ];
    const result = normalizePlans(plans);
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

// ─── getInsurancePlansSnapshot ───────────────────────────────────────────────
describe("getInsurancePlansSnapshot", () => {
  const STORAGE_KEY = "giggo_insurance_plans";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("returns the 3 default plans when localStorage is empty", () => {
    const plans = getInsurancePlansSnapshot();
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => p.id)).toEqual(["basic", "standard", "premium"]);
  });

  it("returns stored plans from localStorage when valid", () => {
    const custom: InsurancePlan[] = [
      { id: "custom", name: "Custom Plan", weeklyPremium: 20, coverage: 1200, risks: ["Rain"] },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    const plans = getInsurancePlansSnapshot();
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe("custom");
  });

  it("falls back to defaults when localStorage contains invalid JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-valid-json{{{");
    const plans = getInsurancePlansSnapshot();
    expect(plans).toHaveLength(3);
  });

  it("falls back to defaults when stored plans normalize to empty", () => {
    // A plan with no id will be removed by normalizePlans → empty → fallback
    const bad = [{ id: "", name: "", weeklyPremium: 0, coverage: 0, risks: [] }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
    const plans = getInsurancePlansSnapshot();
    expect(plans).toHaveLength(3);
  });
});
