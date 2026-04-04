import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import StatCard from "@/components/StatCard";
import RiskChart from "@/components/RiskChart";
import { StatusBadge } from "@/components/RiskBadge";
import { PageSkeleton, ErrorState, EmptyState } from "@/components/LoadingSkeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  fetchAdminMetrics,
  fetchBusinessKPIs,
  fetchRiskTrends,
  fetchZoneRisks,
  fetchClaimReviews,
  fetchAdminWorkers,
  fetchAdminAgents,
  fetchInsurancePlans,
  fetchRiskRollouts,
  connectRealtimeEvents,
  simulatePricingScenario,
  updateRiskRollouts,
  createInsurancePlan,
  updateInsurancePlan,
  deleteInsurancePlan,
  type AgentWorker,
  type AdminAgent,
  type InsurancePlan,
  type RolloutConfig,
} from "@/services/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Shield, FileCheck, DollarSign, AlertTriangle, Search, UserCog, Activity } from "lucide-react";
import { toast } from "sonner";

type ManageableStatus = "active" | "inactive" | "suspended";
const PLAN_RISKS = ["Rain", "Flood", "Extreme Heat", "Pollution"];

type PlanForm = {
  name: string;
  weeklyPremium: number | "";
  coverage: number | "";
  risks: string[];
  popular: boolean;
};

const EMPTY_PLAN_FORM: PlanForm = {
  name: "",
  weeklyPremium: "",
  coverage: "",
  risks: [],
  popular: false,
};

const WORKER_STATUS_KEY = "giggo_admin_worker_status";
const AGENT_STATUS_KEY = "giggo_admin_agent_status";

const loadStatusOverrides = (key: string): Record<string, ManageableStatus> => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveStatusOverrides = (key: string, overrides: Record<string, ManageableStatus>) => {
  try {
    localStorage.setItem(key, JSON.stringify(overrides));
  } catch (err) {
    console.error("[AdminDashboard] Failed to persist status overrides:", err);
  }
};

const AdminDashboard = () => {
  const queryClient = useQueryClient();
  const [workerSearch, setWorkerSearch] = useState("");
  const [agentSearch, setAgentSearch] = useState("");
  const [workerStatusOverrides, setWorkerStatusOverrides] = useState<Record<string, ManageableStatus>>(
    () => loadStatusOverrides(WORKER_STATUS_KEY)
  );
  const [agentStatusOverrides, setAgentStatusOverrides] = useState<Record<string, ManageableStatus>>(
    () => loadStatusOverrides(AGENT_STATUS_KEY)
  );
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>(EMPTY_PLAN_FORM);
  const [planToDelete, setPlanToDelete] = useState<InsurancePlan | null>(null);
  const [pricingInput, setPricingInput] = useState({
    claimCountLast30d: 2,
    zone: "Zone A",
    platform: "Zomato",
    avgDailyIncome: 900,
    lostHours: 4,
    modelVariant: "baseline" as "baseline" | "challenger",
  });
  const [editableRollout, setEditableRollout] = useState<RolloutConfig | null>(null);

  const { data: metrics, isLoading: isMetricsLoading } = useQuery({ queryKey: ["adminMetrics"], queryFn: fetchAdminMetrics });
  const { data: businessKpis, isLoading: isBusinessKpisLoading } = useQuery({ queryKey: ["businessKpis"], queryFn: fetchBusinessKPIs });
  const { data: riskTrends, isLoading: isRiskTrendsLoading } = useQuery({ queryKey: ["riskTrends"], queryFn: fetchRiskTrends });
  const { data: zoneRisks, isLoading: isZoneRisksLoading } = useQuery({ queryKey: ["zoneRisks"], queryFn: fetchZoneRisks });
  const { data: workers, isLoading: isWorkersLoading } = useQuery({ queryKey: ["adminWorkers"], queryFn: fetchAdminWorkers });
  const { data: agents, isLoading: isAgentsLoading } = useQuery({ queryKey: ["adminAgents"], queryFn: fetchAdminAgents });
  const { data: plans, isLoading: isPlansLoading } = useQuery({ queryKey: ["insurancePlans"], queryFn: fetchInsurancePlans });
  const { data: claims, isLoading: isClaimsLoading, isError: isClaimsError, refetch } = useQuery({ queryKey: ["adminClaims"], queryFn: fetchClaimReviews });
  const { data: rolloutConfig, isLoading: isRolloutLoading } = useQuery({ queryKey: ["riskRollouts"], queryFn: fetchRiskRollouts });

  const refreshPlans = async () => {
    await queryClient.invalidateQueries({ queryKey: ["insurancePlans"] });
  };

  const createPlanMutation = useMutation({
    mutationFn: createInsurancePlan,
    onSuccess: async () => {
      toast.success("Insurance plan created");
      await refreshPlans();
      setPlanForm(EMPTY_PLAN_FORM);
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Omit<InsurancePlan, "id"> }) => updateInsurancePlan(id, payload),
    onSuccess: async () => {
      toast.success("Insurance plan updated");
      await refreshPlans();
      setEditingPlanId(null);
      setPlanForm(EMPTY_PLAN_FORM);
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: deleteInsurancePlan,
    onSuccess: async () => {
      toast.success("Insurance plan removed");
      await refreshPlans();
    },
  });

  const pricingSimulationMutation = useMutation({
    mutationFn: simulatePricingScenario,
    onError: () => {
      toast.error("Pricing simulation failed");
    },
  });

  const rolloutUpdateMutation = useMutation({
    mutationFn: updateRiskRollouts,
    onSuccess: async () => {
      toast.success("Risk rollout updated");
      await queryClient.invalidateQueries({ queryKey: ["riskRollouts"] });
    },
    onError: () => {
      toast.error("Failed to update risk rollout");
    },
  });

  useEffect(() => {
    if (rolloutConfig && !editableRollout) {
      setEditableRollout(rolloutConfig);
    }
  }, [rolloutConfig, editableRollout]);

  useEffect(() => {
    const disconnect = connectRealtimeEvents((event) => {
      if (event.type === "claim.created" || event.type === "claim.reviewed") {
        void queryClient.invalidateQueries({ queryKey: ["adminClaims"] });
        void queryClient.invalidateQueries({ queryKey: ["adminMetrics"] });
      }
      if (event.type === "risk.rollout.updated") {
        void queryClient.invalidateQueries({ queryKey: ["riskRollouts"] });
      }
    });
    return () => {
      disconnect();
    };
  }, [queryClient]);

  const getWorkerStatus = (worker: AgentWorker): ManageableStatus => workerStatusOverrides[worker.id] ?? worker.status;
  const getAgentStatus = (agent: AdminAgent): ManageableStatus => agentStatusOverrides[agent.id] ?? agent.status;

  const filteredWorkers = useMemo(() =>
    (workers ?? []).filter((w) =>
      [w.name, w.id, w.city, w.zone, w.platform, w.email, w.phone]
        .join(" ")
        .toLowerCase()
        .includes(workerSearch.toLowerCase())
    ),
  [workers, workerSearch]);

  const filteredAgents = useMemo(() =>
    (agents ?? []).filter((a) =>
      [a.name, a.id, a.email, a.city]
        .join(" ")
        .toLowerCase()
        .includes(agentSearch.toLowerCase())
    ),
  [agents, agentSearch]);

  const updateWorkerStatus = (worker: AgentWorker, status: ManageableStatus) => {
    setWorkerStatusOverrides((prev) => {
      const next = { ...prev, [worker.id]: status };
      saveStatusOverrides(WORKER_STATUS_KEY, next);
      return next;
    });
    toast.success(`${worker.name} is now ${status}`);
  };

  const updateAgentStatus = (agent: AdminAgent, status: ManageableStatus) => {
    setAgentStatusOverrides((prev) => {
      const next = { ...prev, [agent.id]: status };
      saveStatusOverrides(AGENT_STATUS_KEY, next);
      return next;
    });
    toast.success(`${agent.name} is now ${status}`);
  };

  const isPlanMutating = createPlanMutation.isPending || updatePlanMutation.isPending || deletePlanMutation.isPending;

  const startEditPlan = (plan: InsurancePlan) => {
    setEditingPlanId(plan.id);
    setPlanForm({
      name: plan.name,
      weeklyPremium: plan.weeklyPremium,
      coverage: plan.coverage,
      risks: [...plan.risks],
      popular: !!plan.popular,
    });
  };

  const resetPlanForm = () => {
    setEditingPlanId(null);
    setPlanForm(EMPTY_PLAN_FORM);
  };

  const togglePlanRisk = (risk: string) => {
    setPlanForm((prev) => ({
      ...prev,
      risks: prev.risks.includes(risk)
        ? prev.risks.filter((r) => r !== risk)
        : [...prev.risks, risk],
    }));
  };

  const submitPlanForm = () => {
    const name = planForm.name.trim();
    if (!name) {
      toast.error("Plan name is required");
      return;
    }
    if (planForm.weeklyPremium !== "" && planForm.weeklyPremium < 0) {
      toast.error("Weekly premium cannot be negative");
      return;
    }
    if (planForm.coverage !== "" && planForm.coverage < 0) {
      toast.error("Coverage cannot be negative");
      return;
    }
    if (planForm.risks.length === 0) {
      toast.error("Select at least one covered risk");
      return;
    }

    const payload: Omit<InsurancePlan, "id"> = {
      name,
      weeklyPremium: Math.round(Number(planForm.weeklyPremium) || 0),
      coverage: Math.round(Number(planForm.coverage) || 0),
      risks: planForm.risks,
      popular: planForm.popular,
    };

    if (editingPlanId) {
      updatePlanMutation.mutate({ id: editingPlanId, payload });
      return;
    }
    createPlanMutation.mutate(payload);
  };

  const removePlan = (plan: InsurancePlan) => {
    if ((plans?.length ?? 0) <= 1) {
      toast.error("At least one insurance plan must remain");
      return;
    }
    setPlanToDelete(plan);
  };

  const confirmRemovePlan = () => {
    if (!planToDelete) return;
    deletePlanMutation.mutate(planToDelete.id);
    setPlanToDelete(null);
  };

  if (isMetricsLoading || isBusinessKpisLoading || isRiskTrendsLoading || isZoneRisksLoading || isClaimsLoading || isWorkersLoading || isAgentsLoading || isPlansLoading || isRolloutLoading) return <PageSkeleton />;
  if (isClaimsError || !metrics) return <ErrorState message="Failed to load admin data" onRetry={() => refetch()} />;

  const safeZoneRisks = zoneRisks ?? [];
  const safeClaims = claims ?? [];
  const safePlans = plans ?? [];
  const safeWorkers = workers ?? [];
  const safeAgents = agents ?? [];
  const safeRiskTrends = riskTrends ?? [];
  const safeRollout = editableRollout ?? { regions: {} };

  const runSimulation = () => {
    pricingSimulationMutation.mutate(pricingInput);
  };

  const setRegionPolicy = (zone: string, patch: Partial<{ enabled: boolean; challenger: number }>) => {
    setEditableRollout((prev) => {
      if (!prev) return prev;
      const current = prev.regions[zone] ?? { enabled: true, baseline: 80, challenger: 20 };
      const challenger = patch.challenger != null ? Math.max(0, Math.min(100, patch.challenger)) : current.challenger;
      const nextPolicy = {
        enabled: patch.enabled ?? current.enabled,
        challenger,
        baseline: 100 - challenger,
      };
      return {
        regions: {
          ...prev.regions,
          [zone]: nextPolicy,
        },
      };
    });
  };

  const saveRollout = () => {
    if (!editableRollout) return;
    rolloutUpdateMutation.mutate(editableRollout);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {/* Delete plan confirmation dialog */}
      <AlertDialog open={!!planToDelete} onOpenChange={(open) => { if (!open) setPlanToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove insurance plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{planToDelete?.name}</strong>. Workers enrolled in this plan will need to select a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmRemovePlan}>
              Remove plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">System-wide analytics and monitoring</p>
        </div>

        {/* Metrics */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Workers" value={metrics.totalWorkers.toLocaleString()} icon={Users} variant="primary" trend="up" trendValue="12% this month" />
          <StatCard title="Active Policies" value={metrics.activePolicies.toLocaleString()} icon={Shield} variant="success" />
          <StatCard title="Predicted Claims" value={metrics.predictedClaims} icon={FileCheck} variant="warning" subtitle="Next 7 days" />
          <StatCard title="Weekly Payouts" value={`₹${(metrics.weeklyPayouts / 1000).toFixed(0)}K`} icon={DollarSign} variant="default" />
        </div>

        {/* Business health */}
        {businessKpis && (
          <div className="mb-8 rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <h3 className="font-display text-lg font-semibold text-foreground">Business Health KPIs</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Loss Ratio</p>
                <p className="font-display text-xl font-bold text-foreground">{businessKpis.lossRatio.toFixed(1)}%</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Approval Rate</p>
                <p className="font-display text-xl font-bold text-success">{businessKpis.approvalRate.toFixed(1)}%</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Avg Resolution</p>
                <p className="font-display text-xl font-bold text-primary">{businessKpis.avgResolutionMinutes.toFixed(1)}m</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Retention</p>
                <p className="font-display text-xl font-bold text-info">{businessKpis.retentionScore.toFixed(1)}%</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Fraud Alert Rate</p>
                <p className="font-display text-xl font-bold text-warning">{businessKpis.fraudAlertRate.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <RiskChart data={safeRiskTrends} type="bar" title="Claim Volume Prediction" />
          <RiskChart data={safeRiskTrends} type="line" title="Weather Disruption Impact" />
        </div>

        {/* High Risk Zones */}
        <div className="mb-8 rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <h3 className="font-display text-lg font-semibold text-foreground">High Risk Zones</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {safeZoneRisks.map((z) => (
              <div key={z.zone} className={`rounded-lg border p-4 ${
                z.riskLevel === "High" ? "border-destructive/30 bg-destructive/5" :
                z.riskLevel === "Medium" ? "border-warning/30 bg-warning/5" :
                "border-border bg-card"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-foreground">{z.zone}</p>
                  <span className="font-display text-xl font-bold text-foreground">{z.score}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary mb-2">
                  <div
                    className={`h-full rounded-full ${
                      z.riskLevel === "High" ? "bg-destructive" :
                      z.riskLevel === "Medium" ? "bg-warning" : "bg-success"
                    }`}
                    style={{ width: `${z.score}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{z.activeWorkers} active</span>
                  <span>{z.inactiveWorkers} inactive</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent claims overview */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="mb-4 font-display text-lg font-semibold text-foreground">Recent Claims</h3>
          {safeClaims.length === 0 ? (
            <EmptyState title="No claims yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <caption className="sr-only">Recent claims overview</caption>
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payout</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {safeClaims.map((c, i) => (
                    <tr key={c.id} className={`border-b border-border ${i % 2 ? "bg-secondary/20" : ""}`}>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{c.id}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{c.disruptionType}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{c.requestedPayout > 0 ? `₹${c.requestedPayout}` : "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Insurance plan management */}
        <section className="mt-8 rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-semibold text-foreground">Manage Insurance Plans</h3>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {safePlans.length} plans
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full">
              <caption className="sr-only">Insurance plans</caption>
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weekly Premium</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coverage</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Risks</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {safePlans.map((plan, i) => (
                  <tr key={plan.id} className={`border-b border-border last:border-0 ${i % 2 ? "bg-secondary/20" : ""}`}>
                    <td className="px-3 py-2 text-sm text-foreground">
                      <p className="font-medium">{plan.name}</p>
                      <p className="text-xs text-muted-foreground">{plan.id}</p>
                    </td>
                    <td className="px-3 py-2 text-sm font-semibold text-primary">₹{plan.weeklyPremium}/wk</td>
                    <td className="px-3 py-2 text-sm text-foreground">₹{plan.coverage.toLocaleString()}</td>
                    <td className="px-3 py-2 text-sm text-foreground">{plan.risks.join(", ")}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditPlan(plan)}
                          disabled={isPlanMutating}
                          aria-label={`Edit ${plan.name}`}
                          className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => removePlan(plan)}
                          disabled={isPlanMutating}
                          aria-label={`Remove ${plan.name}`}
                          className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 rounded-xl border border-border bg-secondary/20 p-4">
            <h4 className="mb-3 font-display text-base font-semibold text-foreground">
              {editingPlanId ? "Edit Plan" : "Add New Plan"}
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={planForm.name}
                onChange={(e) => setPlanForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Plan name"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <input
                type="number"
                min={0}
                value={planForm.weeklyPremium}
                onChange={(e) => setPlanForm((prev) => ({ ...prev, weeklyPremium: Number(e.target.value) || 0 }))}
                placeholder="Weekly premium"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <input
                type="number"
                min={0}
                value={planForm.coverage}
                onChange={(e) => setPlanForm((prev) => ({ ...prev, coverage: Number(e.target.value) || 0 }))}
                placeholder="Coverage amount"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {PLAN_RISKS.map((risk) => {
                const checked = planForm.risks.includes(risk);
                return (
                  <label key={risk} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePlanRisk(risk)}
                      className="h-4 w-4"
                    />
                    {risk}
                  </label>
                );
              })}
            </div>

            <label className="mt-3 inline-flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={planForm.popular}
                onChange={(e) => setPlanForm((prev) => ({ ...prev, popular: e.target.checked }))}
                className="h-4 w-4"
              />
              Mark as Most Popular
            </label>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={submitPlanForm}
                disabled={isPlanMutating}
                className="rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {editingPlanId ? "Save Changes" : "Add Plan"}
              </button>
              {editingPlanId && (
                <button
                  type="button"
                  onClick={resetPlanForm}
                  disabled={isPlanMutating}
                  className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/70 disabled:opacity-60"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="mb-4 font-display text-lg font-semibold text-foreground">Dynamic Pricing What-If Simulator</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              type="number"
              min={0}
              value={pricingInput.claimCountLast30d}
              onChange={(e) => setPricingInput((prev) => ({ ...prev, claimCountLast30d: Number(e.target.value) || 0 }))}
              placeholder="Claims in last 30 days"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <input
              value={pricingInput.zone}
              onChange={(e) => setPricingInput((prev) => ({ ...prev, zone: e.target.value }))}
              placeholder="Zone"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <input
              value={pricingInput.platform}
              onChange={(e) => setPricingInput((prev) => ({ ...prev, platform: e.target.value }))}
              placeholder="Platform"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <input
              type="number"
              min={1}
              value={pricingInput.avgDailyIncome}
              onChange={(e) => setPricingInput((prev) => ({ ...prev, avgDailyIncome: Number(e.target.value) || 0 }))}
              placeholder="Avg daily income"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <input
              type="number"
              step="0.5"
              min={0.5}
              max={24}
              value={pricingInput.lostHours}
              onChange={(e) => setPricingInput((prev) => ({ ...prev, lostHours: Number(e.target.value) || 0.5 }))}
              placeholder="Lost hours"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <select
              value={pricingInput.modelVariant}
              onChange={(e) => setPricingInput((prev) => ({ ...prev, modelVariant: e.target.value as "baseline" | "challenger" }))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="baseline">baseline</option>
              <option value="challenger">challenger</option>
            </select>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={runSimulation}
              disabled={pricingSimulationMutation.isPending}
              className="rounded-lg gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {pricingSimulationMutation.isPending ? "Running..." : "Run Simulation"}
            </button>
            {pricingSimulationMutation.data && (
              <p className="text-sm text-muted-foreground">
                Variant {pricingSimulationMutation.data.modelVariant}: Risk {pricingSimulationMutation.data.riskScore.toFixed(1)} | Premium ₹{pricingSimulationMutation.data.weeklyPremium.toFixed(2)} | Payout ₹{pricingSimulationMutation.data.projectedPayout.toFixed(2)}
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-foreground">Regional Rollout Controls (A/B Risk Models)</h3>
            <button
              type="button"
              onClick={saveRollout}
              disabled={rolloutUpdateMutation.isPending || !editableRollout}
              className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
            >
              Save rollout
            </button>
          </div>

          <div className="space-y-3">
            {Object.entries(safeRollout.regions).map(([zone, policy]) => (
              <div key={zone} className="rounded-lg border border-border bg-secondary/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{zone}</p>
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={policy.enabled}
                      onChange={(e) => setRegionPolicy(zone, { enabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                    Enabled
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={policy.challenger}
                    onChange={(e) => setRegionPolicy(zone, { challenger: Number(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">baseline {policy.baseline}% / challenger {policy.challenger}%</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Workforce management */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold text-foreground">Manage Workers</h3>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {safeWorkers.length} total
              </span>
            </div>
            <label htmlFor="worker-search" className="sr-only">Search workers</label>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                id="worker-search"
                value={workerSearch}
                onChange={(e) => setWorkerSearch(e.target.value)}
                placeholder="Search workers by name, city, email, phone, platform, or zone"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            {filteredWorkers.length === 0 ? (
              <EmptyState title="No workers found" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">Workers list</caption>
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">City</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Platform</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zone</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWorkers.map((worker, i) => {
                      const status = getWorkerStatus(worker);
                      return (
                        <tr key={worker.id} className={`border-b border-border ${i % 2 ? "bg-secondary/20" : ""}`}>
                          <td className="px-3 py-2 text-sm text-foreground">
                            <p className="font-medium">{worker.name}</p>
                            <p className="text-xs text-muted-foreground">{worker.id}</p>
                          </td>
                          <td className="px-3 py-2 text-sm text-foreground">{worker.city || "—"}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{worker.email || "—"}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{worker.phone || "—"}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{worker.platform || "—"}</td>
                          <td className="px-3 py-2 text-sm text-foreground">{worker.zone}</td>
                          <td className="px-3 py-2 text-sm capitalize text-foreground">{status}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => updateWorkerStatus(worker, "active")}
                                aria-label={`Activate ${worker.name}`}
                                className="rounded-md border border-success/30 bg-success/10 px-2 py-1 text-xs font-medium text-success hover:bg-success/20"
                              >
                                Activate
                              </button>
                              <button
                                type="button"
                                onClick={() => updateWorkerStatus(worker, "suspended")}
                                aria-label={`Suspend ${worker.name}`}
                                className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"
                              >
                                Suspend
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
                <UserCog className="h-5 w-5 text-primary" />
                Manage Agents
              </h3>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {safeAgents.length} total
              </span>
            </div>
            <label htmlFor="agent-search" className="sr-only">Search agents</label>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                id="agent-search"
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                placeholder="Search agents by name, ID, email, or city"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            {filteredAgents.length === 0 ? (
              <EmptyState title="No agents found" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">Agents list</caption>
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agent</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assigned</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.map((agent, i) => {
                      const status = getAgentStatus(agent);
                      return (
                        <tr key={agent.id} className={`border-b border-border ${i % 2 ? "bg-secondary/20" : ""}`}>
                          <td className="px-3 py-2 text-sm text-foreground">
                            <p className="font-medium">{agent.name}</p>
                            <p className="text-xs text-muted-foreground">{agent.id} • {agent.email}</p>
                          </td>
                          <td className="px-3 py-2 text-sm text-foreground">{agent.assignedWorkers}</td>
                          <td className="px-3 py-2 text-sm capitalize text-foreground">{status}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => updateAgentStatus(agent, "active")}
                                aria-label={`Activate ${agent.name}`}
                                className="rounded-md border border-success/30 bg-success/10 px-2 py-1 text-xs font-medium text-success hover:bg-success/20"
                              >
                                Activate
                              </button>
                              <button
                                type="button"
                                onClick={() => updateAgentStatus(agent, "inactive")}
                                aria-label={`Deactivate ${agent.name}`}
                                className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-xs font-medium text-warning hover:bg-warning/20"
                              >
                                Deactivate
                              </button>
                              <button
                                type="button"
                                onClick={() => updateAgentStatus(agent, "suspended")}
                                aria-label={`Suspend ${agent.name}`}
                                className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"
                              >
                                Suspend
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
