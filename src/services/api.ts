// Mock data and API service for GigShield AI

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
  city: string;
  platform: string;
  zone: string;
  riskScore: number;
  trustScore: number;
  planId: string | null;
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

export const insurancePlans: InsurancePlan[] = [
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

// avgHourlyIncome = mockWorker.avgDailyIncome / 10 = 85
// estimatedIncomeLoss = lostHours * avgHourlyIncome, payoutAmount = lostHours * avgHourlyIncome * 0.85
export const mockClaims: Claim[] = [
  { id: "CLM-005", disruptionType: "Heavy Rain", lostHours: 5, estimatedIncomeLoss: 425, payoutAmount: 0, status: "Pending", date: "2026-03-03" },
  { id: "CLM-002", disruptionType: "Extreme Heat", lostHours: 4, estimatedIncomeLoss: 340, payoutAmount: 0, status: "Pending", date: "2026-03-02" },
  { id: "CLM-001", disruptionType: "Heavy Rain", lostHours: 6, estimatedIncomeLoss: 510, payoutAmount: 434, status: "Approved", date: "2026-03-01" },
  { id: "CLM-004", disruptionType: "Pollution", lostHours: 3, estimatedIncomeLoss: 255, payoutAmount: 217, status: "Approved", date: "2026-02-28" },
  { id: "CLM-003", disruptionType: "Flood", lostHours: 8, estimatedIncomeLoss: 680, payoutAmount: 0, status: "Rejected", date: "2026-02-25" },
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchWorker = async (): Promise<Worker> => {
  await delay(400);
  return mockWorker;
};

export const fetchClaims = async (): Promise<Claim[]> => {
  await delay(400);
  return mockClaims;
};

export const fetchAlerts = async (): Promise<Alert[]> => {
  await delay(400);
  return mockAlerts;
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
  await delay(400);
  return insurancePlans;
};

export const fetchAdminMetrics = async () => {
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
};

// ---------------------------------------------------------------------------
// Agent-specific mock data
// ---------------------------------------------------------------------------

export const mockAgentWorkers: AgentWorker[] = [
  { id: "WK-1024", name: "Rahul Kumar", city: "Mumbai", platform: "Zomato", zone: "Zone A", riskScore: 72, trustScore: 84, planId: "standard", status: "active" },
  { id: "WK-1031", name: "Amit Patel", city: "Mumbai", platform: "Swiggy", zone: "Zone A", riskScore: 55, trustScore: 91, planId: "premium", status: "active" },
  { id: "WK-1045", name: "Deepak Singh", city: "Mumbai", platform: "Zomato", zone: "Zone B", riskScore: 38, trustScore: 78, planId: "basic", status: "active" },
  { id: "WK-1052", name: "Sunil Yadav", city: "Mumbai", platform: "Dunzo", zone: "Zone B", riskScore: 81, trustScore: 62, planId: "standard", status: "inactive" },
  { id: "WK-1068", name: "Vikram Joshi", city: "Mumbai", platform: "Blinkit", zone: "Zone C", riskScore: 22, trustScore: 95, planId: "premium", status: "active" },
  { id: "WK-1079", name: "Manoj Gupta", city: "Mumbai", platform: "Zepto", zone: "Zone D", riskScore: 65, trustScore: 71, planId: null, status: "suspended" },
  { id: "WK-1083", name: "Ravi Verma", city: "Mumbai", platform: "Swiggy", zone: "Zone C", riskScore: 44, trustScore: 88, planId: "standard", status: "active" },
  { id: "WK-1091", name: "Karan Mehta", city: "Mumbai", platform: "Zomato", zone: "Zone A", riskScore: 68, trustScore: 76, planId: "basic", status: "active" },
];

export const mockClaimReviews: ClaimReview[] = [
  { id: "CLM-005", workerId: "WK-1024", workerName: "Rahul Kumar", disruptionType: "Heavy Rain", lostHours: 5, estimatedIncomeLoss: 425, requestedPayout: 361, status: "Pending", date: "2026-03-03", zone: "Zone A", aiRecommendation: "approve", confidenceScore: 92 },
  { id: "CLM-002", workerId: "WK-1031", workerName: "Amit Patel", disruptionType: "Extreme Heat", lostHours: 4, estimatedIncomeLoss: 340, requestedPayout: 289, status: "Pending", date: "2026-03-02", zone: "Zone A", aiRecommendation: "approve", confidenceScore: 87 },
  { id: "CLM-006", workerId: "WK-1052", workerName: "Sunil Yadav", disruptionType: "Pollution", lostHours: 6, estimatedIncomeLoss: 510, requestedPayout: 434, status: "Pending", date: "2026-03-02", zone: "Zone B", aiRecommendation: "review", confidenceScore: 58 },
  { id: "CLM-001", workerId: "WK-1024", workerName: "Rahul Kumar", disruptionType: "Heavy Rain", lostHours: 6, estimatedIncomeLoss: 510, requestedPayout: 434, status: "Approved", date: "2026-03-01", zone: "Zone A", aiRecommendation: "approve", confidenceScore: 95 },
  { id: "CLM-004", workerId: "WK-1045", workerName: "Deepak Singh", disruptionType: "Pollution", lostHours: 3, estimatedIncomeLoss: 255, requestedPayout: 217, status: "Approved", date: "2026-02-28", zone: "Zone B", aiRecommendation: "approve", confidenceScore: 89 },
  { id: "CLM-003", workerId: "WK-1052", workerName: "Sunil Yadav", disruptionType: "Flood", lostHours: 8, estimatedIncomeLoss: 680, requestedPayout: 578, status: "Rejected", date: "2026-02-25", zone: "Zone B", aiRecommendation: "reject", confidenceScore: 82 },
];

export const agentMetrics = {
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

export const fetchClaimReviews = async (): Promise<ClaimReview[]> => {
  await delay(400);
  return mockClaimReviews;
};

export const fetchAgentMetrics = async () => {
  await delay(400);
  return agentMetrics;
};
