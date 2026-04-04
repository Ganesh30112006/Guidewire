import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import StatCard from "@/components/StatCard";
import RiskBadge, { StatusBadge } from "@/components/RiskBadge";
import { PageSkeleton, ErrorState, EmptyState } from "@/components/LoadingSkeleton";
import {
  fetchAgentWorkers,
  fetchClaimReviews,
  fetchAgentMetrics,
  fetchZoneRisks,
  fetchAlerts,
  connectRealtimeEvents,
  getInsurancePlansSnapshot,
} from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { CLAIM_DECISIONS_PREFIX } from "@/contexts/ClaimsContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  FileCheck,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Shield,
  Brain,
  AlertTriangle,
  Star,
  Timer,
} from "lucide-react";

type AgentTab = "overview" | "workers" | "claims" | "zones";

const AgentDashboard = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AgentTab>("overview");
  const [claimSearch, setClaimSearch] = useState("");
  const [claimFilter, setClaimFilter] = useState<"All" | "Pending" | "Approved" | "Rejected">("All");
  const [workerSearch, setWorkerSearch] = useState("");
  const queryClient = useQueryClient();
  // Local override for claim statuses (approve/reject actions persist for the session)
  const [claimStatusOverrides, setClaimStatusOverrides] = useState<Record<string, "Approved" | "Rejected">>({});

  /** Write the agent's decision to the worker-scoped localStorage key so workers see it on next load. */
  const persistClaimDecision = (claimId: string, workerId: string, status: "Approved" | "Rejected") => {
    const key = `${CLAIM_DECISIONS_PREFIX}_${workerId}`;
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
      const existing: Record<string, string> =
        raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, string>) : {};
      localStorage.setItem(key, JSON.stringify({ ...existing, [claimId]: status }));
    } catch (err) {
      console.error("[AgentDashboard] Failed to persist claim decision:", err);
    }
  };

  const handleClaimAction = (claimId: string, workerId: string, action: "Approved" | "Rejected", workerName: string) => {
    setClaimStatusOverrides((prev) => ({ ...prev, [claimId]: action }));
    persistClaimDecision(claimId, workerId, action);
    if (action === "Approved") {
      toast.success(`Claim ${claimId} approved for ${workerName}`);
    } else {
      toast.error(`Claim ${claimId} rejected for ${workerName}`);
    }
  };

  const { data: metrics, isLoading: mL } = useQuery({ queryKey: ["agentMetrics"], queryFn: fetchAgentMetrics });
  const { data: workers, isLoading: wL } = useQuery({ queryKey: ["agentWorkers"], queryFn: fetchAgentWorkers });
  const { data: claimReviews, isLoading: cL } = useQuery({ queryKey: ["claimReviews"], queryFn: fetchClaimReviews });
  const { data: zoneRisks, isLoading: zL } = useQuery({ queryKey: ["zoneRisks"], queryFn: fetchZoneRisks });
  const { data: alerts, isLoading: aL, isError, refetch } = useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts });

  useEffect(() => {
    const disconnect = connectRealtimeEvents((event) => {
      if (event.type === "claim.created" || event.type === "claim.reviewed") {
        void queryClient.invalidateQueries({ queryKey: ["claimReviews"] });
        void queryClient.invalidateQueries({ queryKey: ["agentMetrics"] });
      }
      if (event.type === "risk.updated") {
        void queryClient.invalidateQueries({ queryKey: ["agentWorkers"] });
        void queryClient.invalidateQueries({ queryKey: ["zoneRisks"] });
      }
      if (event.type === "proof.processed") {
        void queryClient.invalidateQueries({ queryKey: ["claimReviews"] });
      }
    });
    return () => {
      disconnect();
    };
  }, [queryClient]);

  const getEffectiveStatus = (claim: { id: string; status: string }) =>
    (claimStatusOverrides[claim.id] ?? claim.status) as "Pending" | "Approved" | "Rejected";

  // Hoisted above early returns to satisfy the Rules of Hooks.
  const pendingClaims = useMemo(
    () => (claimReviews ?? []).filter((c) => (claimStatusOverrides[c.id] ?? c.status) === "Pending"),
    [claimReviews, claimStatusOverrides]
  );
  const approvedClaims = useMemo(
    () => (claimReviews ?? []).filter((c) => (claimStatusOverrides[c.id] ?? c.status) === "Approved"),
    [claimReviews, claimStatusOverrides]
  );
  const totalProcessed = useMemo(
    () => approvedClaims.reduce((s, c) => s + c.requestedPayout, 0),
    [approvedClaims]
  );

  const filteredClaims = useMemo(() =>
    (claimReviews ?? [])
      .map((c) => ({ ...c, status: getEffectiveStatus(c) }))
      .filter((c) => claimFilter === "All" || c.status === claimFilter)
      .filter(
        (c) =>
          c.id.toLowerCase().includes(claimSearch.toLowerCase()) ||
          c.workerName.toLowerCase().includes(claimSearch.toLowerCase()) ||
          c.disruptionType.toLowerCase().includes(claimSearch.toLowerCase())
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claimReviews, claimStatusOverrides, claimFilter, claimSearch]
  );

  const filteredWorkers = useMemo(
    () => (workers ?? []).filter(
      (w) =>
        w.name.toLowerCase().includes(workerSearch.toLowerCase()) ||
        w.id.toLowerCase().includes(workerSearch.toLowerCase()) ||
        w.zone.toLowerCase().includes(workerSearch.toLowerCase())
    ),
    [workers, workerSearch]
  );

  if (mL || wL || cL || zL || aL) return <PageSkeleton />;
  if (isError || !metrics) return <ErrorState message="Failed to load agent data" onRetry={() => refetch()} />;

  const getPlanName = (planId: string | null) => {
    if (!planId) return "No Plan";
    return getInsurancePlansSnapshot().find((p) => p.id === planId)?.name ?? planId;
  };

  const tabs: { id: AgentTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "workers", label: "Delivery Partners" },
    { id: "claims", label: "Claim Reviews" },
    { id: "zones", label: "Zone Monitor" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              Agent Portal
            </h1>
            <p className="text-sm text-muted-foreground">
              Welcome, {user?.name} — Manage delivery partners, review claims, and monitor zones
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-warning/20 bg-warning/5 px-4 py-2">
            <Shield className="h-4 w-4 text-warning" />
            <span className="text-sm font-medium text-warning">Agent</span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mb-6 flex gap-1 rounded-lg border border-border bg-secondary/30 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <>
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <StatCard title="Assigned Partners" value={metrics.assignedWorkers} icon={Users} variant="primary" />
              <StatCard title="Active Policies" value={metrics.activePolicies} icon={Shield} variant="success" />
              <StatCard title="Pending Claims" value={pendingClaims.length} icon={Clock} variant="warning" />
              <StatCard title="Payouts Processed" value={`₹${totalProcessed.toLocaleString()}`} icon={DollarSign} variant="default" />
              <StatCard title="Avg Resolution" value={`${metrics.avgClaimResolutionMins} min`} icon={Timer} variant="default" />
                <StatCard title="Partner Satisfaction" value={`${metrics.workerSatisfaction}%`} icon={Star} variant="success" />
            </div>

            {/* Pending claims requiring attention */}
            <div className="mb-8 rounded-xl border border-warning/20 bg-warning/5 p-5 shadow-card">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                <h3 className="font-display text-lg font-semibold text-foreground">Claims Requiring Attention</h3>
                <span className="ml-auto rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
                  {pendingClaims.length} pending
                </span>
              </div>
              {pendingClaims.length === 0 ? (
                <p className="text-sm text-muted-foreground">All claims have been reviewed.</p>
              ) : (
                <div className="space-y-3">
                  {pendingClaims.map((claim) => (
                    <div key={claim.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{claim.id}</span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-sm text-foreground">{claim.workerName}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {claim.disruptionType} — {claim.lostHours}h lost — {claim.zone}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">₹{claim.requestedPayout}</p>
                          <div className="flex items-center gap-1">
                            <Brain className="h-3 w-3 text-primary" />
                            <span className={`text-xs font-medium ${
                              claim.aiRecommendation === "approve" ? "text-success" :
                              claim.aiRecommendation === "reject" ? "text-destructive" : "text-warning"
                            }`}>
                              AI: {claim.aiRecommendation} ({claim.confidenceScore}%)
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleClaimAction(claim.id, claim.workerId, "Approved", claim.workerName)}
                            className="rounded-md bg-success/10 p-2 text-success hover:bg-success/20 transition-colors" title="Approve">
                            <CheckCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleClaimAction(claim.id, claim.workerId, "Rejected", claim.workerName)}
                            className="rounded-md bg-destructive/10 p-2 text-destructive hover:bg-destructive/20 transition-colors" title="Reject">
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active alerts for agent */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 font-display text-lg font-semibold text-foreground">Zone Alerts</h3>
              {(alerts ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No active alerts</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(alerts ?? []).map((alert) => (
                    <div key={alert.id} className={`rounded-lg border p-3 ${
                      alert.severity === "high" ? "border-destructive/30 bg-destructive/5" :
                      "border-warning/30 bg-warning/5"
                    }`}>
                      <p className="text-sm font-medium text-foreground">{alert.message}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{alert.zone}</span>
                        <span>•</span>
                        <span className="font-medium">{alert.probability}% probability</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* WORKERS TAB */}
        {activeTab === "workers" && (
          <>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={workerSearch}
                  onChange={(e) => setWorkerSearch(e.target.value)}
                  placeholder="Search delivery partners by name, ID, or zone..."
                  className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-80"
                />
              </div>
            </div>

            {filteredWorkers.length === 0 ? (
              <EmptyState title="No delivery partners found" description="Try adjusting your search" />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Worker</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Platform</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zone</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Risk</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trust</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWorkers.map((w, i) => (
                      <tr key={w.id} className={`border-b border-border transition-colors hover:bg-secondary/30 ${i % 2 ? "bg-secondary/20" : ""}`}>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{w.name}</p>
                            <p className="text-xs text-muted-foreground">{w.id}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">{w.platform}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{w.zone}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{w.riskScore}</span>
                            <RiskBadge level={w.riskScore >= 70 ? "High" : w.riskScore >= 40 ? "Medium" : "Low"} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-medium ${w.trustScore >= 80 ? "text-success" : w.trustScore >= 60 ? "text-warning" : "text-destructive"}`}>
                            {w.trustScore}/100
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">{getPlanName(w.planId)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            w.status === "active" ? "bg-success/10 text-success" :
                            w.status === "inactive" ? "bg-warning/10 text-warning" :
                            "bg-destructive/10 text-destructive"
                          }`}>
                            {w.status.charAt(0).toUpperCase() + w.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Worker summary stats */}
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4 shadow-card">
                <p className="text-sm text-muted-foreground">Active Partners</p>
                <p className="font-display text-2xl font-bold text-success">{(workers ?? []).filter((w) => w.status === "active").length}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-card">
                <p className="text-sm text-muted-foreground">High Risk Partners</p>
                <p className="font-display text-2xl font-bold text-destructive">{(workers ?? []).filter((w) => w.riskScore >= 70).length}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-card">
                <p className="text-sm text-muted-foreground">Without Insurance</p>
                <p className="font-display text-2xl font-bold text-warning">{(workers ?? []).filter((w) => !w.planId).length}</p>
              </div>
            </div>
          </>
        )}

        {/* CLAIMS TAB */}
        {activeTab === "claims" && (
          <>
            {/* Filters */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={claimSearch}
                  onChange={(e) => setClaimSearch(e.target.value)}
                  placeholder="Search claims..."
                  className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-64"
                />
              </div>
              <div className="flex gap-2">
                {(["All", "Pending", "Approved", "Rejected"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setClaimFilter(s)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      claimFilter === s
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Claims stats */}
            <div className="mb-6 grid gap-4 sm:grid-cols-4">
              <StatCard title="Total Claims" value={(claimReviews ?? []).length} icon={FileCheck} variant="default" />
              <StatCard title="Pending Review" value={pendingClaims.length} icon={Clock} variant="warning" />
              <StatCard title="Approved" value={approvedClaims.length} icon={CheckCircle} variant="success" />
              <StatCard title="Total Payouts" value={`₹${totalProcessed.toLocaleString()}`} icon={DollarSign} variant="primary" />
            </div>

            {filteredClaims.length === 0 ? (
              <EmptyState title="No claims found" description="Try adjusting your search or filter" />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Claim</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delivery Partner</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Income Loss</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payout</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Rec.</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClaims.map((c, i) => (
                      <tr key={c.id} className={`border-b border-border transition-colors hover:bg-secondary/30 ${i % 2 ? "bg-secondary/20" : ""}`}>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{c.id}</td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm text-foreground">{c.workerName}</p>
                            <p className="text-xs text-muted-foreground">{c.workerId}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {new Date(c.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground">{c.disruptionType}</td>
                        <td className="px-4 py-3 text-sm text-foreground">₹{c.estimatedIncomeLoss}</td>
                        <td className="px-4 py-3 text-sm font-medium text-foreground">₹{c.requestedPayout}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Brain className="h-3 w-3 text-primary" />
                            <span title={c.decisionExplanation ?? "No explanation available"} className={`text-xs font-medium ${
                              c.aiRecommendation === "approve" ? "text-success" :
                              c.aiRecommendation === "reject" ? "text-destructive" : "text-warning"
                            }`}>
                              {c.aiRecommendation} ({c.confidenceScore}%)
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Risk {c.fraudRiskScore != null ? c.fraudRiskScore.toFixed(1) : "N/A"}
                            {c.riskModelVariant ? ` • ${c.riskModelVariant}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-4 py-3">
                          {c.status === "Pending" ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleClaimAction(c.id, c.workerId, "Approved", c.workerName)}
                                className="rounded bg-success/10 p-1.5 text-success hover:bg-success/20" title="Approve">
                                <CheckCircle className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleClaimAction(c.id, c.workerId, "Rejected", c.workerName)}
                                className="rounded bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20" title="Reject">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Resolved</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ZONES TAB */}
        {activeTab === "zones" && (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(zoneRisks ?? []).map((z) => {
                const zoneWorkers = (workers ?? []).filter((w) => w.zone === z.zone);
                return (
                  <div key={z.zone} className={`rounded-xl border p-5 shadow-card ${
                    z.riskLevel === "High" ? "border-destructive/30 bg-destructive/5" :
                    z.riskLevel === "Medium" ? "border-warning/30 bg-warning/5" :
                    "border-border bg-card"
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-display text-lg font-bold text-foreground">{z.zone}</h3>
                      <RiskBadge level={z.riskLevel} size="md" />
                    </div>
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Risk Score</span>
                        <span className="font-medium text-foreground">{z.score}/100</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full ${
                            z.riskLevel === "High" ? "bg-destructive" :
                            z.riskLevel === "Medium" ? "bg-warning" : "bg-success"
                          }`}
                          style={{ width: `${z.score}%` }}
                        />
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Partners in zone</span>
                        <span className="font-semibold text-foreground">{zoneWorkers.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total active partners</span>
                        <span className="font-semibold text-success">{z.activeWorkers}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total inactive partners</span>
                        <span className="font-semibold text-destructive">{z.inactiveWorkers}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Disruption conf.</span>
                        <span className="font-semibold text-foreground">{z.disruptionConfidence}%</span>
                      </div>
                    </div>
                    {zoneWorkers.length > 0 && (
                      <div className="mt-3 border-t border-border pt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Delivery Partners:</p>
                        <div className="flex flex-wrap gap-1">
                          {zoneWorkers.map((w) => (
                            <span key={w.id} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground">
                              {w.name.split(" ")[0]}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Zone alerts */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 font-display text-lg font-semibold text-foreground">Active Zone Alerts</h3>
              {(alerts ?? []).length === 0 ? (
                <EmptyState title="No alerts" description="All zones are clear" />
              ) : (
                <div className="space-y-3">
                  {[...(alerts ?? [])].sort((a, b) => b.probability - a.probability).map((alert) => (
                    <div key={alert.id} className={`flex items-center justify-between rounded-lg border p-3 ${
                      alert.severity === "high" ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5"
                    }`}>
                      <div>
                        <p className="text-sm font-medium text-foreground">{alert.message}</p>
                        <p className="text-xs text-muted-foreground">{alert.zone} • {alert.probability}% probability</p>
                      </div>
                      <RiskBadge level={alert.severity === "high" ? "High" : alert.severity === "low" ? "Low" : "Medium"} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default AgentDashboard;
