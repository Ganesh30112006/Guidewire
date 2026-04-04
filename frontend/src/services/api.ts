// Mock data and API service for GigGo
//
// Live backend integration strategy:
// - Try backend first when VITE_API_BASE_URL is set
// - Fall back to in-memory/mock data if backend call fails or is unauthorized

const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "";
const API_BASE_URL = RAW_API_BASE_URL
  ? (() => {
      const trimmed = RAW_API_BASE_URL.replace(/\/+$/, "");
      return /\/api\/v\d+$/i.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
    })()
  : "";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/v\d+$/i, "");

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const hasApiBase = API_BASE_URL.length > 0;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const getCsrfTokenFromCookie = (): string | null => {
  const value = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("csrf_token="))
    ?.split("=")[1];
  return value ? decodeURIComponent(value) : null;
};

async function apiRequest<T>(path: string, method: HttpMethod = "GET", body?: unknown): Promise<T> {
  if (!hasApiBase) throw new Error("API base URL is not configured");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const csrfToken = getCsrfTokenFromCookie();
  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function apiMultipartRequest<T>(path: string, formData: FormData, method: "POST" | "PUT" | "PATCH" = "POST"): Promise<T> {
  if (!hasApiBase) throw new Error("API base URL is not configured");

  const headers: Record<string, string> = {};
  const csrfToken = getCsrfTokenFromCookie();
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export const hasBackendApi = hasApiBase;

export const connectRealtimeEvents = (
  onEvent: (evt: RealtimeEvent) => void,
  onError?: () => void,
): (() => void) => {
  if (!hasApiBase) return () => {};
  const source = new EventSource(`${API_ORIGIN}/api/v1/events/stream`, { withCredentials: true });

  const handler = (event: MessageEvent<string>) => {
    try {
      onEvent(JSON.parse(event.data) as RealtimeEvent);
    } catch {
      // Ignore malformed events to keep stream alive.
    }
  };

  source.onmessage = handler;
  source.addEventListener("claim.created", handler as EventListener);
  source.addEventListener("claim.reviewed", handler as EventListener);
  source.addEventListener("proof.processed", handler as EventListener);
  source.addEventListener("risk.updated", handler as EventListener);
  source.addEventListener("risk.rollout.updated", handler as EventListener);
  source.onerror = () => {
    onError?.();
  };

  return () => source.close();
};

type OfflineQueuedClaim = {
  id: string;
  disruptionType: SubmitClaimInput["disruptionType"];
  lostHours: number;
  proofName: string;
  proofType: string;
  proofDataUrl: string;
  createdAt: string;
};

const OFFLINE_CLAIMS_QUEUE_KEY = "giggo_offline_claim_queue";

const loadOfflineQueue = (): OfflineQueuedClaim[] => {
  try {
    const raw = localStorage.getItem(OFFLINE_CLAIMS_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineQueuedClaim[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveOfflineQueue = (items: OfflineQueuedClaim[]) => {
  localStorage.setItem(OFFLINE_CLAIMS_QUEUE_KEY, JSON.stringify(items));
};

const fileToDataUrl = async (file: File): Promise<string> => {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
};

const dataUrlToFile = async (dataUrl: string, fileName: string, fileType: string): Promise<File> => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: fileType || blob.type || "application/octet-stream" });
};

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface Worker {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  platform: string;
  avgDailyIncome: number;
  riskScore: number;
  trustScore: number;
  zone: string;
}

export interface InsurancePlan {
  id: string;
  name: string;
  weeklyPremium: number;
  coverage: number;
  risks: string[];
  popular?: boolean;
}

export interface Claim {
  id: string;
  disruptionType: string;
  lostHours: number;
  estimatedIncomeLoss: number;
  payoutAmount: number;
  status: "Pending" | "Approved" | "Rejected";
  date: string;
  proofUploaded?: boolean;
  proofFileName?: string;
  proofModelQualityScore?: number;
  proofProcessingSummary?: string;
  fraudRiskScore?: number;
  decisionExplanation?: string;
  riskModelVariant?: "baseline" | "challenger";
  isOfflineQueued?: boolean;
}

export interface WeeklyEarningsProofRecord {
  id: string;
  weekStartAt: string;
  reportedEarnings: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  modelQualityScore: number;
  processingSummary: string;
  createdAt: string;
}

export interface SubmitClaimInput {
  disruptionType: "Heavy Rain" | "Extreme Heat" | "Flood" | "Pollution" | "Other";
  lostHours: number;
  proofFile: File;
}

export interface WeeklyEarningsUploadInput {
  weekStartAt: string;
  reportedEarnings: number;
  screenshotFile: File;
}

export interface Alert {
  id: string;
  type: "rain" | "heat" | "flood" | "pollution";
  message: string;
  probability: number;
  severity: "low" | "medium" | "high";
  timestamp: string;
  zone: string;
}

export interface ZoneRisk {
  zone: string;
  riskLevel: "Low" | "Medium" | "High";
  score: number;
  activeWorkers: number;
  inactiveWorkers: number;
  disruptionConfidence: number;
}

export interface WeatherEvent {
  date: string;
  type: string;
  severity: string;
  impact: string;
}

export interface RiskTrend {
  date: string;
  riskScore: number;
  disruptionProb: number;
  claims: number;
}

export interface AgentWorker {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  platform: string;
  zone: string;
  riskScore: number;
  trustScore: number;
  planId: string | null;
  status: "active" | "inactive" | "suspended";
}

export interface AdminAgent {
  id: string;
  name: string;
  email: string;
  city: string;
  assignedWorkers: number;
  status: "active" | "inactive" | "suspended";
}

export interface ClaimReview {
  id: string;
  workerId: string;
  workerName: string;
  disruptionType: string;
  lostHours: number;
  estimatedIncomeLoss: number;
  requestedPayout: number;
  status: "Pending" | "Approved" | "Rejected";
  date: string;
  zone: string;
  aiRecommendation: "approve" | "reject" | "review";
  confidenceScore: number;
  fraudRiskScore?: number;
  decisionExplanation?: string;
  riskModelVariant?: "baseline" | "challenger";
}

export interface PricingSimulationInput {
  claimCountLast30d: number;
  zone: string;
  platform: string;
  avgDailyIncome: number;
  lostHours: number;
  modelVariant: "baseline" | "challenger";
}

export interface PricingSimulationResult {
  modelVariant: "baseline" | "challenger";
  riskScore: number;
  weeklyPremium: number;
  projectedPayout: number;
  projectedIncomeLoss: number;
}

export interface RegionRolloutPolicy {
  enabled: boolean;
  baseline: number;
  challenger: number;
}

export interface RolloutConfig {
  regions: Record<string, RegionRolloutPolicy>;
}

export interface RealtimeEvent {
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AdminMetrics {
  totalWorkers: number;
  activePolicies: number;
  predictedClaims: number;
  weeklyPayouts: number;
}

export interface AgentMetrics {
  assignedWorkers: number;
  activePolicies: number;
  pendingClaims: number;
  totalPayoutsProcessed: number;
  avgClaimResolutionMins: number;
  workerSatisfaction: number;
}

export interface BusinessKPIs {
  lossRatio: number;
  approvalRate: number;
  avgResolutionMinutes: number;
  retentionScore: number;
  fraudAlertRate: number;
}

export interface WorkerRetention {
  loyaltyScore: number;
  claimConsistencyScore: number;
  tenureDays: number;
  activePolicy: boolean;
}

export const mockWorker: Worker = {
  id: "WK-1024",
  name: "Rahul Kumar",
  phone: "+91 98765 43210",
  email: "rahul@email.com",
  city: "Mumbai",
  platform: "Zomato",
  avgDailyIncome: 850,
  riskScore: 72,
  trustScore: 84,
  zone: "Zone A",
};

const DEFAULT_INSURANCE_PLANS: InsurancePlan[] = [
  {
    id: "basic",
    name: "Basic Plan",
    weeklyPremium: 15,
    coverage: 1000,
    risks: ["Rain"],
  },
  {
    id: "standard",
    name: "Standard Plan",
    weeklyPremium: 22,
    coverage: 1500,
    risks: ["Rain", "Extreme Heat"],
    popular: true,
  },
  {
    id: "premium",
    name: "Premium Plan",
    weeklyPremium: 30,
    coverage: 2000,
    risks: ["Rain", "Flood", "Extreme Heat", "Pollution"],
  },
];

const INSURANCE_PLANS_STORAGE_KEY = "giggo_insurance_plans";

export const normalizePlans = (plans: InsurancePlan[]): InsurancePlan[] => {
  return plans
    .map((plan) => ({
      id: String(plan.id ?? "").trim(),
      name: String(plan.name ?? "").trim(),
      weeklyPremium: Number(plan.weeklyPremium ?? 0),
      coverage: Number(plan.coverage ?? 0),
      risks: Array.from(new Set((plan.risks ?? []).map((risk) => String(risk).trim()).filter(Boolean))),
      ...(plan.popular ? { popular: true } : {}),
    }))
    .filter((plan) => plan.id && plan.name);
};

const loadInsurancePlans = (): InsurancePlan[] => {
  try {
    const raw = localStorage.getItem(INSURANCE_PLANS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_INSURANCE_PLANS];
    const parsed = JSON.parse(raw) as InsurancePlan[];
    const normalized = normalizePlans(parsed);
    return normalized.length > 0 ? normalized : [...DEFAULT_INSURANCE_PLANS];
  } catch {
    return [...DEFAULT_INSURANCE_PLANS];
  }
};

const saveInsurancePlans = (plans: InsurancePlan[]) => {
  const normalized = normalizePlans(plans);
  localStorage.setItem(INSURANCE_PLANS_STORAGE_KEY, JSON.stringify(normalized));
};

export const getInsurancePlansSnapshot = (): InsurancePlan[] => {
  return loadInsurancePlans();
};

export const createInsurancePlan = async (input: Omit<InsurancePlan, "id">): Promise<InsurancePlan> => {
  await delay(250);
  const plans = loadInsurancePlans();

  const baseId = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "plan";

  let id = baseId;
  let suffix = 1;
  while (plans.some((p) => p.id === id)) {
    suffix += 1;
    id = `${baseId}-${suffix}`;
  }

  const created: InsurancePlan = {
    id,
    name: input.name.trim(),
    weeklyPremium: Math.max(0, Number(input.weeklyPremium) || 0),
    coverage: Math.max(0, Number(input.coverage) || 0),
    risks: Array.from(new Set(input.risks.map((risk) => risk.trim()).filter(Boolean))),
    ...(input.popular ? { popular: true } : {}),
  };

  saveInsurancePlans([...plans, created]);
  return created;
};

export const updateInsurancePlan = async (
  id: string,
  input: Omit<InsurancePlan, "id">
): Promise<InsurancePlan> => {
  await delay(250);
  const plans = loadInsurancePlans();
  const idx = plans.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error("Plan not found");

  const updated: InsurancePlan = {
    id,
    name: input.name.trim(),
    weeklyPremium: Math.max(0, Number(input.weeklyPremium) || 0),
    coverage: Math.max(0, Number(input.coverage) || 0),
    risks: Array.from(new Set(input.risks.map((risk) => risk.trim()).filter(Boolean))),
    ...(input.popular ? { popular: true } : {}),
  };

  const next = [...plans];
  next[idx] = updated;
  saveInsurancePlans(next);
  return updated;
};

export const deleteInsurancePlan = async (id: string): Promise<void> => {
  await delay(250);
  const plans = loadInsurancePlans();
  const next = plans.filter((p) => p.id !== id);
  if (next.length === plans.length) throw new Error("Plan not found");
  saveInsurancePlans(next);
};

// avgHourlyIncome = mockWorker.avgDailyIncome / 10 = 85
// estimatedIncomeLoss = lostHours * avgHourlyIncome, payoutAmount = lostHours * avgHourlyIncome * 0.85
export const mockClaims: Claim[] = [
  { id: "CLM-005", disruptionType: "Heavy Rain", lostHours: 5, estimatedIncomeLoss: 425, payoutAmount: 0, status: "Pending", date: "2026-03-03", proofUploaded: true, proofFileName: "rain-week-1.png" },
  { id: "CLM-002", disruptionType: "Extreme Heat", lostHours: 4, estimatedIncomeLoss: 340, payoutAmount: 0, status: "Pending", date: "2026-03-02", proofUploaded: true, proofFileName: "heat-proof.jpg" },
  { id: "CLM-001", disruptionType: "Heavy Rain", lostHours: 6, estimatedIncomeLoss: 510, payoutAmount: 434, status: "Approved", date: "2026-03-01", proofUploaded: true, proofFileName: "rain-claim-proof.jpg" },
  { id: "CLM-004", disruptionType: "Pollution", lostHours: 3, estimatedIncomeLoss: 255, payoutAmount: 217, status: "Approved", date: "2026-02-28", proofUploaded: true, proofFileName: "pollution-proof.png" },
  { id: "CLM-003", disruptionType: "Flood", lostHours: 8, estimatedIncomeLoss: 680, payoutAmount: 0, status: "Rejected", date: "2026-02-25", proofUploaded: true, proofFileName: "flood-proof.pdf" },
];

export const mockAlerts: Alert[] = [
  { id: "ALT-001", type: "rain", message: "Heavy rain expected in your zone in the next 2 hours", probability: 82, severity: "high", timestamp: "2026-03-04T14:00:00", zone: "Zone A" },
  { id: "ALT-002", type: "heat", message: "Extreme heat alert — temperatures expected to exceed 42°C", probability: 68, severity: "medium", timestamp: "2026-03-04T10:00:00", zone: "Zone B" },
  { id: "ALT-003", type: "pollution", message: "High pollution warning — AQI expected above 300", probability: 74, severity: "high", timestamp: "2026-03-04T08:00:00", zone: "Zone A" },
  { id: "ALT-004", type: "flood", message: "Flash flood risk due to sustained rainfall in low-lying areas", probability: 45, severity: "medium", timestamp: "2026-03-03T22:00:00", zone: "Zone C" },
];

export const mockZoneRisks: ZoneRisk[] = [
  { zone: "Zone A", riskLevel: "High", score: 82, activeWorkers: 120, inactiveWorkers: 45, disruptionConfidence: 78 },
  { zone: "Zone B", riskLevel: "Medium", score: 56, activeWorkers: 200, inactiveWorkers: 30, disruptionConfidence: 52 },
  { zone: "Zone C", riskLevel: "Low", score: 28, activeWorkers: 180, inactiveWorkers: 12, disruptionConfidence: 22 },
  { zone: "Zone D", riskLevel: "Medium", score: 61, activeWorkers: 95, inactiveWorkers: 28, disruptionConfidence: 58 },
];

export const mockWeatherEvents: WeatherEvent[] = [
  { date: "2026-03-01", type: "Heavy Rain", severity: "High", impact: "6hr disruption" },
  { date: "2026-02-28", type: "Pollution Spike", severity: "Medium", impact: "3hr disruption" },
  { date: "2026-02-25", type: "Flash Flood", severity: "High", impact: "Full day" },
  { date: "2026-02-22", type: "Heat Wave", severity: "Medium", impact: "4hr disruption" },
];

export const mockRiskTrends: RiskTrend[] = [
  { date: "Week 1", riskScore: 45, disruptionProb: 30, claims: 12 },
  { date: "Week 2", riskScore: 52, disruptionProb: 42, claims: 18 },
  { date: "Week 3", riskScore: 68, disruptionProb: 58, claims: 25 },
  { date: "Week 4", riskScore: 72, disruptionProb: 65, claims: 32 },
  { date: "Week 5", riskScore: 60, disruptionProb: 48, claims: 20 },
  { date: "Week 6", riskScore: 78, disruptionProb: 72, claims: 45 },
];

export const adminMetrics = {
  totalWorkers: 2847,
  activePolicies: 1923,
  predictedClaims: 145,
  weeklyPayouts: 287500,
};


// How many working hours we assume per day for income estimation
export const WORK_HOURS_PER_DAY = 10;

export const calculateDynamicPremium = (riskScore: number): number => {
  // Clamp riskScore to valid 0-100 range
  const clamped = Math.max(0, Math.min(100, riskScore));
  // Smooth linear formula: ₹12 at risk 0, ₹35 at risk 100
  const base = 12;
  const max = 35;
  return Math.round(base + (clamped / 100) * (max - base));
};

export const calculatePayout = (lostHours: number, avgHourlyIncome: number): number => {
  return Math.round(lostHours * avgHourlyIncome * 0.85);
};

// ---------------------------------------------------------------------------
// Async fetcher functions (simulate API latency for React Query integration)
// ---------------------------------------------------------------------------

export const fetchWorker = async (): Promise<Worker> => {
  try {
    type BackendWorker = {
      id: string;
      name: string;
      phone?: string | null;
      email: string;
      city?: string | null;
      platform?: string | null;
      avg_daily_income?: number | null;
      risk_score: number;
      trust_score: number;
      zone?: string | null;
    };
    const data = await apiRequest<BackendWorker>("/workers/me");
    return {
      id: data.id,
      name: data.name,
      phone: data.phone ?? "",
      email: data.email,
      city: data.city ?? "",
      platform: data.platform ?? "",
      avgDailyIncome: data.avg_daily_income ?? 0,
      riskScore: data.risk_score,
      trustScore: data.trust_score,
      zone: data.zone ?? "",
    };
  } catch {
    await delay(400);
    return mockWorker;
  }
};

export const fetchClaims = async (): Promise<Claim[]> => {
  try {
    type BackendClaim = {
      id: string;
      disruption_type: string;
      lost_hours: number;
      estimated_income_loss: number;
      payout_amount: number;
      status: "Pending" | "Approved" | "Rejected";
      created_at: string;
      proof_uploaded?: boolean;
      proof_file_name?: string | null;
      proof_model_quality_score?: number | null;
      proof_processing_summary?: string | null;
      fraud_risk_score?: number | null;
      decision_explanation?: string | null;
      risk_model_variant?: "baseline" | "challenger" | null;
    };
    const data = await apiRequest<BackendClaim[]>("/claims");
    return data.map((c) => ({
      id: c.id,
      disruptionType: c.disruption_type,
      lostHours: c.lost_hours,
      estimatedIncomeLoss: c.estimated_income_loss,
      payoutAmount: c.payout_amount,
      status: c.status,
      date: c.created_at.slice(0, 10),
      proofUploaded: c.proof_uploaded ?? false,
      proofFileName: c.proof_file_name ?? undefined,
      proofModelQualityScore: c.proof_model_quality_score ?? undefined,
      proofProcessingSummary: c.proof_processing_summary ?? undefined,
      fraudRiskScore: c.fraud_risk_score ?? undefined,
      decisionExplanation: c.decision_explanation ?? undefined,
      riskModelVariant: c.risk_model_variant ?? undefined,
    }));
  } catch {
    await delay(400);
    return mockClaims;
  }
};

export const submitClaimWithProof = async (input: SubmitClaimInput): Promise<Claim> => {
  try {
    type BackendClaim = {
      id: string;
      disruption_type: string;
      lost_hours: number;
      estimated_income_loss: number;
      payout_amount: number;
      status: "Pending" | "Approved" | "Rejected";
      created_at: string;
      proof_uploaded?: boolean;
      proof_file_name?: string | null;
      proof_model_quality_score?: number | null;
      proof_processing_summary?: string | null;
      fraud_risk_score?: number | null;
      decision_explanation?: string | null;
      risk_model_variant?: "baseline" | "challenger" | null;
    };

    const formData = new FormData();
    formData.append("disruption_type", input.disruptionType);
    formData.append("lost_hours", String(input.lostHours));
    formData.append("proof_file", input.proofFile);

    const data = await apiMultipartRequest<BackendClaim>("/claims", formData, "POST");
    return {
      id: data.id,
      disruptionType: data.disruption_type,
      lostHours: data.lost_hours,
      estimatedIncomeLoss: data.estimated_income_loss,
      payoutAmount: data.payout_amount,
      status: data.status,
      date: data.created_at.slice(0, 10),
      proofUploaded: data.proof_uploaded ?? true,
      proofFileName: data.proof_file_name ?? input.proofFile.name,
      proofModelQualityScore: data.proof_model_quality_score ?? undefined,
      proofProcessingSummary: data.proof_processing_summary ?? undefined,
      fraudRiskScore: data.fraud_risk_score ?? undefined,
      decisionExplanation: data.decision_explanation ?? undefined,
      riskModelVariant: data.risk_model_variant ?? undefined,
    };
  } catch {
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    if (isOffline) {
      const queued: OfflineQueuedClaim = {
        id: `OFF-${crypto.randomUUID().slice(0, 8)}`,
        disruptionType: input.disruptionType,
        lostHours: input.lostHours,
        proofName: input.proofFile.name,
        proofType: input.proofFile.type,
        proofDataUrl: await fileToDataUrl(input.proofFile),
        createdAt: new Date().toISOString(),
      };
      saveOfflineQueue([queued, ...loadOfflineQueue()]);
      const avgHourlyIncome = 500 / WORK_HOURS_PER_DAY;
      return {
        id: queued.id,
        disruptionType: queued.disruptionType,
        lostHours: queued.lostHours,
        estimatedIncomeLoss: Math.round(queued.lostHours * avgHourlyIncome),
        payoutAmount: 0,
        status: "Pending",
        date: queued.createdAt.slice(0, 10),
        proofUploaded: true,
        proofFileName: queued.proofName,
        proofProcessingSummary: "Queued offline and will auto-sync when connectivity is restored.",
        isOfflineQueued: true,
      };
    }

    await delay(300);
    const avgHourlyIncome = 500 / WORK_HOURS_PER_DAY;
    return {
      id: `CLM-${crypto.randomUUID().slice(0, 8)}`,
      disruptionType: input.disruptionType,
      lostHours: input.lostHours,
      estimatedIncomeLoss: Math.round(input.lostHours * avgHourlyIncome),
      payoutAmount: 0,
      status: "Pending",
      date: new Date().toISOString().slice(0, 10),
      proofUploaded: true,
      proofFileName: input.proofFile.name,
      proofModelQualityScore: 78,
      proofProcessingSummary: "Mock mode: proof accepted for review.",
    };
  }
};

export const flushOfflineClaimsQueue = async (): Promise<Claim[]> => {
  if (!hasApiBase) return [];
  if (typeof navigator !== "undefined" && !navigator.onLine) return [];

  const queue = loadOfflineQueue();
  if (queue.length === 0) return [];

  const synced: Claim[] = [];
  const remaining: OfflineQueuedClaim[] = [];

  for (const item of queue) {
    try {
      type BackendClaim = {
        id: string;
        disruption_type: string;
        lost_hours: number;
        estimated_income_loss: number;
        payout_amount: number;
        status: "Pending" | "Approved" | "Rejected";
        created_at: string;
        proof_uploaded?: boolean;
        proof_file_name?: string | null;
        proof_model_quality_score?: number | null;
        proof_processing_summary?: string | null;
        fraud_risk_score?: number | null;
        decision_explanation?: string | null;
        risk_model_variant?: "baseline" | "challenger" | null;
      };

      const proofFile = await dataUrlToFile(item.proofDataUrl, item.proofName, item.proofType);
      const formData = new FormData();
      formData.append("disruption_type", item.disruptionType);
      formData.append("lost_hours", String(item.lostHours));
      formData.append("proof_file", proofFile);
      const data = await apiMultipartRequest<BackendClaim>("/claims", formData, "POST");

      synced.push({
        id: data.id,
        disruptionType: data.disruption_type,
        lostHours: data.lost_hours,
        estimatedIncomeLoss: data.estimated_income_loss,
        payoutAmount: data.payout_amount,
        status: data.status,
        date: data.created_at.slice(0, 10),
        proofUploaded: data.proof_uploaded ?? true,
        proofFileName: data.proof_file_name ?? item.proofName,
        proofModelQualityScore: data.proof_model_quality_score ?? undefined,
        proofProcessingSummary: data.proof_processing_summary ?? undefined,
        fraudRiskScore: data.fraud_risk_score ?? undefined,
        decisionExplanation: data.decision_explanation ?? undefined,
        riskModelVariant: data.risk_model_variant ?? undefined,
      });
    } catch {
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  return synced;
};

export const uploadWeeklyEarningsProof = async (
  input: WeeklyEarningsUploadInput
): Promise<WeeklyEarningsProofRecord> => {
  try {
    type BackendWeeklyProof = {
      id: string;
      week_start_at: string;
      reported_earnings: number;
      file_name: string;
      file_type: string;
      file_size: number;
      model_quality_score: number;
      processing_summary: string;
      created_at: string;
    };

    const formData = new FormData();
    formData.append("week_start_at", input.weekStartAt);
    formData.append("reported_earnings", String(input.reportedEarnings));
    formData.append("screenshot_file", input.screenshotFile);

    const data = await apiMultipartRequest<BackendWeeklyProof>(
      "/workers/me/weekly-earnings-proof",
      formData,
      "POST"
    );

    return {
      id: data.id,
      weekStartAt: data.week_start_at,
      reportedEarnings: data.reported_earnings,
      fileName: data.file_name,
      fileType: data.file_type,
      fileSize: data.file_size,
      modelQualityScore: data.model_quality_score,
      processingSummary: data.processing_summary,
      createdAt: data.created_at,
    };
  } catch {
    await delay(300);
    return {
      id: `WEP-${crypto.randomUUID().slice(0, 8)}`,
      weekStartAt: input.weekStartAt,
      reportedEarnings: input.reportedEarnings,
      fileName: input.screenshotFile.name,
      fileType: input.screenshotFile.type || "application/octet-stream",
      fileSize: input.screenshotFile.size,
      modelQualityScore: 80,
      processingSummary: "Mock mode: screenshot processed.",
      createdAt: new Date().toISOString(),
    };
  }
};

export const fetchWeeklyEarningsProofs = async (): Promise<WeeklyEarningsProofRecord[]> => {
  try {
    type BackendWeeklyProof = {
      id: string;
      week_start_at: string;
      reported_earnings: number;
      file_name: string;
      file_type: string;
      file_size: number;
      model_quality_score: number;
      processing_summary: string;
      created_at: string;
    };
    type BackendWeeklyProofList = { records: BackendWeeklyProof[] };

    const data = await apiRequest<BackendWeeklyProofList>("/workers/me/weekly-earnings-proof");
    return data.records.map((record) => ({
      id: record.id,
      weekStartAt: record.week_start_at,
      reportedEarnings: record.reported_earnings,
      fileName: record.file_name,
      fileType: record.file_type,
      fileSize: record.file_size,
      modelQualityScore: record.model_quality_score,
      processingSummary: record.processing_summary,
      createdAt: record.created_at,
    }));
  } catch {
    await delay(200);
    return [];
  }
};

export const fetchAlerts = async (): Promise<Alert[]> => {
  try {
    type BackendAlert = {
      id: string;
      alert_type: "rain" | "heat" | "flood" | "pollution";
      message: string;
      probability: number;
      severity: "low" | "medium" | "high";
      zone: string;
      created_at: string;
    };
    const data = await apiRequest<BackendAlert[]>("/alerts");
    return data.map((a) => ({
      id: a.id,
      type: a.alert_type,
      message: a.message,
      probability: a.probability,
      severity: a.severity,
      zone: a.zone,
      timestamp: a.created_at,
    }));
  } catch {
    await delay(400);
    return mockAlerts;
  }
};

export const fetchZoneRisks = async (): Promise<ZoneRisk[]> => {
  await delay(400);
  return mockZoneRisks;
};

export const fetchRiskTrends = async (): Promise<RiskTrend[]> => {
  await delay(400);
  return mockRiskTrends;
};

export const fetchWeatherEvents = async (): Promise<WeatherEvent[]> => {
  await delay(400);
  return mockWeatherEvents;
};

export const fetchInsurancePlans = async (): Promise<InsurancePlan[]> => {
  try {
    type BackendPlan = {
      id: string;
      name: string;
      weekly_premium: number;
      coverage: number;
      risks: string[];
      is_popular: boolean;
    };
    const data = await apiRequest<BackendPlan[]>("/insurance/plans");
    const mapped = data.map((p) => ({
      id: p.id,
      name: p.name,
      weeklyPremium: p.weekly_premium,
      coverage: p.coverage,
      risks: p.risks,
      popular: p.is_popular,
    }));
    saveInsurancePlans(mapped);
    return mapped;
  } catch {
    await delay(400);
    return loadInsurancePlans();
  }
};

export const fetchAdminMetrics = async (): Promise<AdminMetrics> => {
  try {
    type BackendMetrics = {
      total_workers: number;
      active_policies: number;
      predicted_claims: number;
      weekly_payouts: number;
    };
    const data = await apiRequest<BackendMetrics>("/admin/metrics");
    return {
      totalWorkers: data.total_workers,
      activePolicies: data.active_policies,
      predictedClaims: data.predicted_claims,
      weeklyPayouts: data.weekly_payouts,
    };
  } catch {
    await delay(400);
    // Derive from actual mock data for realism
    const approved = mockClaimReviews.filter((c) => c.status === "Approved");
    const pending = mockClaimReviews.filter((c) => c.status === "Pending");
    // Scale agent-level data to platform-wide approximation
    const scale = adminMetrics.totalWorkers / mockAgentWorkers.length;
    return {
      totalWorkers: adminMetrics.totalWorkers,
      activePolicies: Math.round(mockAgentWorkers.filter((w) => w.planId).length * scale),
      predictedClaims: Math.round(pending.length * scale),
      weeklyPayouts: Math.round(approved.reduce((s, c) => s + c.requestedPayout, 0) * scale),
    };
  }
};

export const fetchBusinessKPIs = async (): Promise<BusinessKPIs> => {
  try {
    type BackendBusinessKPIs = {
      loss_ratio: number;
      approval_rate: number;
      avg_resolution_minutes: number;
      retention_score: number;
      fraud_alert_rate: number;
    };
    const data = await apiRequest<BackendBusinessKPIs>("/admin/business-kpis");
    return {
      lossRatio: data.loss_ratio,
      approvalRate: data.approval_rate,
      avgResolutionMinutes: data.avg_resolution_minutes,
      retentionScore: data.retention_score,
      fraudAlertRate: data.fraud_alert_rate,
    };
  } catch {
    await delay(400);
    const totalClaims = mockClaimReviews.length;
    const approvedClaims = mockClaimReviews.filter((c) => c.status === "Approved").length;
    const flaggedClaims = mockClaimReviews.filter((c) => c.status === "Pending" && c.confidenceScore <= 45).length;
    const totalIncomeLoss = mockClaimReviews.reduce((s, c) => s + c.estimatedIncomeLoss, 0);
    const totalPayout = mockClaimReviews
      .filter((c) => c.status === "Approved")
      .reduce((s, c) => s + c.requestedPayout, 0);
    const retentionBase = (mockAgentWorkers.filter((w) => w.planId).length / mockAgentWorkers.length) * 100;
    return {
      lossRatio: totalIncomeLoss > 0 ? Number(((totalPayout / totalIncomeLoss) * 100).toFixed(2)) : 0,
      approvalRate: totalClaims > 0 ? Number(((approvedClaims / totalClaims) * 100).toFixed(2)) : 0,
      avgResolutionMinutes: 4.2,
      retentionScore: Number(retentionBase.toFixed(2)),
      fraudAlertRate: totalClaims > 0 ? Number(((flaggedClaims / totalClaims) * 100).toFixed(2)) : 0,
    };
  }
};

export const fetchWorkerRetention = async (): Promise<WorkerRetention> => {
  try {
    type BackendRetention = {
      loyalty_score: number;
      claim_consistency_score: number;
      tenure_days: number;
      active_policy: boolean;
    };
    const data = await apiRequest<BackendRetention>("/workers/me/retention");
    return {
      loyaltyScore: data.loyalty_score,
      claimConsistencyScore: data.claim_consistency_score,
      tenureDays: data.tenure_days,
      activePolicy: data.active_policy,
    };
  } catch {
    await delay(250);
    return {
      loyaltyScore: 78,
      claimConsistencyScore: 88,
      tenureDays: 120,
      activePolicy: true,
    };
  }
};

// ---------------------------------------------------------------------------
// Agent-specific mock data
// ---------------------------------------------------------------------------

export const mockAgentWorkers: AgentWorker[] = [
  { id: "WK-1024", name: "Rahul Kumar", email: "rahul.kumar@example.com", phone: "+91 98765 43210", city: "Mumbai", platform: "Zomato", zone: "Zone A", riskScore: 72, trustScore: 84, planId: "standard", status: "active" },
  { id: "WK-1031", name: "Amit Patel", email: "amit.patel@example.com", phone: "+91 98765 43211", city: "Mumbai", platform: "Swiggy", zone: "Zone A", riskScore: 55, trustScore: 91, planId: "premium", status: "active" },
  { id: "WK-1045", name: "Deepak Singh", email: "deepak.singh@example.com", phone: "+91 98765 43212", city: "Mumbai", platform: "Zomato", zone: "Zone B", riskScore: 38, trustScore: 78, planId: "basic", status: "active" },
  { id: "WK-1052", name: "Sunil Yadav", email: "sunil.yadav@example.com", phone: "+91 98765 43213", city: "Mumbai", platform: "Dunzo", zone: "Zone B", riskScore: 81, trustScore: 62, planId: "standard", status: "inactive" },
  { id: "WK-1068", name: "Vikram Joshi", email: "vikram.joshi@example.com", phone: "+91 98765 43214", city: "Mumbai", platform: "Blinkit", zone: "Zone C", riskScore: 22, trustScore: 95, planId: "premium", status: "active" },
  { id: "WK-1079", name: "Manoj Gupta", email: "manoj.gupta@example.com", phone: "+91 98765 43215", city: "Mumbai", platform: "Zepto", zone: "Zone D", riskScore: 65, trustScore: 71, planId: null, status: "suspended" },
  { id: "WK-1083", name: "Ravi Verma", email: "ravi.verma@example.com", phone: "+91 98765 43216", city: "Mumbai", platform: "Swiggy", zone: "Zone C", riskScore: 44, trustScore: 88, planId: "standard", status: "active" },
  { id: "WK-1091", name: "Karan Mehta", email: "karan.mehta@example.com", phone: "+91 98765 43217", city: "Mumbai", platform: "Zomato", zone: "Zone A", riskScore: 68, trustScore: 76, planId: "basic", status: "active" },
];

export const mockAdminAgents: AdminAgent[] = [
  { id: "AGT-001", name: "Priya Sharma", email: "priya@giggo.ai", city: "Mumbai", assignedWorkers: 8, status: "active" },
  { id: "AGT-002", name: "Arjun Nair", email: "arjun@giggo.ai", city: "Pune", assignedWorkers: 11, status: "active" },
  { id: "AGT-003", name: "Neha Iyer", email: "neha@giggo.ai", city: "Delhi", assignedWorkers: 0, status: "inactive" },
  { id: "AGT-004", name: "Sameer Khan", email: "sameer@giggo.ai", city: "Bengaluru", assignedWorkers: 5, status: "suspended" },
];

export const mockClaimReviews: ClaimReview[] = [
  { id: "CLM-005", workerId: "WK-1024", workerName: "Rahul Kumar", disruptionType: "Heavy Rain", lostHours: 5, estimatedIncomeLoss: 425, requestedPayout: 361, status: "Pending", date: "2026-03-03", zone: "Zone A", aiRecommendation: "approve", confidenceScore: 92 },
  { id: "CLM-002", workerId: "WK-1031", workerName: "Amit Patel", disruptionType: "Extreme Heat", lostHours: 4, estimatedIncomeLoss: 340, requestedPayout: 289, status: "Pending", date: "2026-03-02", zone: "Zone A", aiRecommendation: "approve", confidenceScore: 87 },
  { id: "CLM-006", workerId: "WK-1052", workerName: "Sunil Yadav", disruptionType: "Pollution", lostHours: 6, estimatedIncomeLoss: 510, requestedPayout: 434, status: "Pending", date: "2026-03-02", zone: "Zone B", aiRecommendation: "review", confidenceScore: 58 },
  { id: "CLM-001", workerId: "WK-1024", workerName: "Rahul Kumar", disruptionType: "Heavy Rain", lostHours: 6, estimatedIncomeLoss: 510, requestedPayout: 434, status: "Approved", date: "2026-03-01", zone: "Zone A", aiRecommendation: "approve", confidenceScore: 95 },
  { id: "CLM-004", workerId: "WK-1045", workerName: "Deepak Singh", disruptionType: "Pollution", lostHours: 3, estimatedIncomeLoss: 255, requestedPayout: 217, status: "Approved", date: "2026-02-28", zone: "Zone B", aiRecommendation: "approve", confidenceScore: 89 },
  { id: "CLM-003", workerId: "WK-1052", workerName: "Sunil Yadav", disruptionType: "Flood", lostHours: 8, estimatedIncomeLoss: 680, requestedPayout: 578, status: "Rejected", date: "2026-02-25", zone: "Zone B", aiRecommendation: "reject", confidenceScore: 82 },
];

export const agentMetrics: AgentMetrics = {
  assignedWorkers: 8,
  activePolicies: 6, // was "activePolices" (typo fixed)
  pendingClaims: 3,
  totalPayoutsProcessed: 651,
  avgClaimResolutionMins: 4.2,
  workerSatisfaction: 94,
};

export const fetchAgentWorkers = async (): Promise<AgentWorker[]> => {
  await delay(400);
  return mockAgentWorkers;
};

export const fetchAdminWorkers = async (): Promise<AgentWorker[]> => {
  try {
    type BackendWorker = {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
      city?: string | null;
      platform?: string | null;
      zone?: string | null;
      risk_score: number;
      trust_score: number;
    };
    const data = await apiRequest<BackendWorker[]>("/admin/workers");
    return data.map((w) => ({
      id: w.id,
      name: w.name,
      email: w.email ?? "",
      phone: w.phone ?? "",
      city: w.city ?? "",
      platform: w.platform ?? "",
      zone: w.zone ?? "",
      riskScore: w.risk_score,
      trustScore: w.trust_score,
      planId: null,
      status: "active",
    }));
  } catch {
    await delay(400);
    return mockAgentWorkers;
  }
};

export const fetchAdminAgents = async (): Promise<AdminAgent[]> => {
  await delay(400);
  return mockAdminAgents;
};

export const fetchClaimReviews = async (): Promise<ClaimReview[]> => {
  try {
    type BackendClaim = {
      id: string;
      worker_id?: string;
      disruption_type: string;
      lost_hours: number;
      estimated_income_loss: number;
      payout_amount: number;
      status: "Pending" | "Approved" | "Rejected";
      zone?: string | null;
      ai_recommendation?: "approve" | "reject" | "review" | null;
      confidence_score?: number | null;
      created_at: string;
      fraud_risk_score?: number | null;
      decision_explanation?: string | null;
      risk_model_variant?: "baseline" | "challenger" | null;
    };
    const data = await apiRequest<BackendClaim[]>("/claims");
    return data.map((c) => ({
      id: c.id,
      workerId: c.worker_id ?? "unknown",
      workerName: c.worker_id ? `Worker ${c.worker_id.slice(0, 8)}` : "Unknown Worker",
      disruptionType: c.disruption_type,
      lostHours: c.lost_hours,
      estimatedIncomeLoss: c.estimated_income_loss,
      requestedPayout: c.payout_amount,
      status: c.status,
      date: c.created_at,
      zone: c.zone ?? "Unknown",
      aiRecommendation: c.ai_recommendation ?? "review",
      confidenceScore: Number(c.confidence_score ?? 50),
      fraudRiskScore: c.fraud_risk_score ?? undefined,
      decisionExplanation: c.decision_explanation ?? undefined,
      riskModelVariant: c.risk_model_variant ?? undefined,
    }));
  } catch {
    await delay(400);
    return mockClaimReviews;
  }
};

export const fetchAgentMetrics = async (): Promise<AgentMetrics> => {
  await delay(400);
  return agentMetrics;
};

export const simulatePricingScenario = async (
  input: PricingSimulationInput,
): Promise<PricingSimulationResult> => {
  type BackendPricingSimulation = {
    model_variant: "baseline" | "challenger";
    risk_score: number;
    weekly_premium: number;
    projected_payout: number;
    projected_income_loss: number;
  };

  const data = await apiRequest<BackendPricingSimulation>("/admin/pricing/simulate", "POST", {
    claim_count_last_30d: input.claimCountLast30d,
    zone: input.zone,
    platform: input.platform,
    avg_daily_income: input.avgDailyIncome,
    lost_hours: input.lostHours,
    model_variant: input.modelVariant,
  });

  return {
    modelVariant: data.model_variant,
    riskScore: data.risk_score,
    weeklyPremium: data.weekly_premium,
    projectedPayout: data.projected_payout,
    projectedIncomeLoss: data.projected_income_loss,
  };
};

export const fetchRiskRollouts = async (): Promise<RolloutConfig> => {
  type BackendRolloutPolicy = { enabled: boolean; baseline: number; challenger: number };
  type BackendRolloutResponse = { regions: Record<string, BackendRolloutPolicy> };
  const data = await apiRequest<BackendRolloutResponse>("/admin/risk-rollouts");
  return {
    regions: data.regions,
  };
};

export const updateRiskRollouts = async (config: RolloutConfig): Promise<RolloutConfig> => {
  type BackendRolloutPolicy = { enabled: boolean; baseline: number; challenger: number };
  type BackendRolloutResponse = { regions: Record<string, BackendRolloutPolicy> };
  const data = await apiRequest<BackendRolloutResponse>("/admin/risk-rollouts", "PUT", {
    regions: config.regions,
  });
  return {
    regions: data.regions,
  };
};
