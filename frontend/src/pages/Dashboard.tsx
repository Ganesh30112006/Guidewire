import Navbar from "@/components/Navbar";
import StatCard from "@/components/StatCard";
import AlertBox from "@/components/AlertBox";
import RiskChart from "@/components/RiskChart";
import RiskBadge from "@/components/RiskBadge";
import { PageSkeleton, ErrorState } from "@/components/LoadingSkeleton";
import {
  fetchWorker, fetchAlerts, fetchRiskTrends, fetchZoneRisks,
  calculateDynamicPremium, calculatePayout, WORK_HOURS_PER_DAY,
  connectRealtimeEvents, fetchInsurancePlans,
} from "@/services/api";
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useInsurance } from "@/contexts/InsuranceContext";
import { useClaims } from "@/contexts/ClaimsContext";
import { useTranslation } from "react-i18next";
import {
  Shield, TrendingUp, Award, FileCheck, DollarSign, MapPin,
  Zap, Brain, Users, Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const Dashboard = () => {
  const { user, deleteAccount } = useAuth();
  const { getActivePlan } = useInsurance();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: worker, isLoading: wLoading, isError: wError, refetch: wRefetch } = useQuery({
    queryKey: ["worker", user?.id],
    queryFn: fetchWorker,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });
  const { data: alerts, isLoading: aLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: fetchAlerts,
    staleTime: 1000 * 30,
    refetchOnWindowFocus: false,
  });
  const { data: riskTrends, isLoading: rtLoading } = useQuery({
    queryKey: ["riskTrends"],
    queryFn: fetchRiskTrends,
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
  const { data: zoneRisks, isLoading: zLoading } = useQuery({
    queryKey: ["zoneRisks"],
    queryFn: fetchZoneRisks,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });
  const { data: plans, isLoading: pLoading } = useQuery({
    queryKey: ["insurancePlans"],
    queryFn: fetchInsurancePlans,
    staleTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
  });
  const { claims } = useClaims();

  // Memoized derivations — hoisted above early returns to satisfy the Rules of Hooks.
  const effectiveWorker = useMemo(() => {
    if (!worker) return null;
    return {
      ...worker,
      name: user?.name ?? worker.name,
      email: user?.email ?? worker.email,
      ...(user?.city           != null && { city: user.city }),
      ...(user?.platform       != null && { platform: user.platform }),
      ...(user?.avgDailyIncome != null && { avgDailyIncome: user.avgDailyIncome }),
    };
  }, [worker, user]);

  const activeClaims = useMemo(() => claims.filter((c) => c.status !== "Rejected"), [claims]);
  const pendingClaims = useMemo(() => claims.filter((c) => c.status === "Pending"), [claims]);

  const workerZone = useMemo(
    () => effectiveWorker ? (zoneRisks ?? []).find((z) => z.zone === effectiveWorker.zone) : undefined,
    [zoneRisks, effectiveWorker]
  );

  const topAlert = useMemo(
    () => alerts?.length ? [...alerts].sort((a, b) => b.probability - a.probability)[0] : null,
    [alerts]
  );

  // Sort zones highest risk score first — most critical shown at top
  const sortedZones = useMemo(
    () => [...(zoneRisks ?? [])].sort((a, b) => b.score - a.score),
    [zoneRisks]
  );

  // Sort alerts by probability desc — most urgent appears first
  const sortedAlerts = useMemo(
    () => [...(alerts ?? [])].sort((a, b) => b.probability - a.probability),
    [alerts]
  );

  useEffect(() => {
    const disconnect = connectRealtimeEvents((event) => {
      if (event.type === "claim.created" || event.type === "claim.reviewed") {
        void queryClient.invalidateQueries({ queryKey: ["claims"] });
      }
      if (event.type === "risk.updated") {
        void queryClient.invalidateQueries({ queryKey: ["worker", user?.id] });
        void queryClient.invalidateQueries({ queryKey: ["zoneRisks"] });
      }
      if (event.type === "proof.processed") {
        void queryClient.invalidateQueries({ queryKey: ["claims"] });
      }
    });
    return () => {
      disconnect();
    };
  }, [queryClient, user?.id]);

  if (wLoading || aLoading || rtLoading || zLoading || pLoading) return <PageSkeleton />;
  if (wError || !worker || !effectiveWorker) return <ErrorState message="Failed to load dashboard data" onRetry={() => wRefetch()} />;

  // Overlay the authenticated user's own profile data onto the mock worker record so
  // that each user sees their own name, city, platform, and income — not another user's.
  const activePlan = getActivePlan(plans ?? []);
  const premium = calculateDynamicPremium(effectiveWorker.riskScore);
  const avgHourlyIncome = effectiveWorker.avgDailyIncome / WORK_HOURS_PER_DAY;

  // AI factors sorted by weight descending — highest influence shown first
  const aiFactors = [
    { label: "Zone Risk",         value: workerZone ? `${workerZone.riskLevel} (${workerZone.score})` : "N/A", weight: 35 },
    { label: "Historical Claims", value: `${(claims ?? []).length} claims`,                                     weight: 25 },
    { label: "Trust Score",       value: `${effectiveWorker.trustScore}/100`,                                   weight: 20 },
    { label: "Weather Forecast",  value: topAlert ? `${topAlert.type} (${topAlert.probability}%)` : "Clear",   weight: 20 },
  ].sort((a, b) => b.weight - a.weight);

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Delete your worker account? This will permanently remove your profile, claims, and policy records.",
    );
    if (!confirmed) return;

    const result = await deleteAccount();
    if (!result.success) {
      toast.error(result.error ?? "Could not delete account");
      return;
    }

    toast.success("Worker account deleted");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              {t("dashboard.welcomeBack", { name: effectiveWorker.name })}
            </h1>
            <p className="text-sm text-muted-foreground">
              {effectiveWorker.platform} • {effectiveWorker.city} • {effectiveWorker.zone}
            </p>
          </div>
          {activePlan ? (
            <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2">
              <div className="h-2 w-2 animate-pulse-glow rounded-full bg-success" />
              <span className="text-sm font-medium text-primary">{t("dashboard.policyActive")}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full border border-warning/20 bg-warning/5 px-4 py-2">
              <div className="h-2 w-2 rounded-full bg-warning" />
              <span className="text-sm font-medium text-warning">{t("dashboard.noActivePolicy")}</span>
            </div>
          )}
        </div>

        {/* Stat cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard title={t("dashboard.riskScore")} value={effectiveWorker.riskScore} icon={TrendingUp} variant="warning" trend="up" trendValue="8% this week" />
          <StatCard title={t("dashboard.trustScore")} value={effectiveWorker.trustScore} icon={Award} variant="success" subtitle={effectiveWorker.trustScore >= 75 ? "High Trust ✓" : "Building Trust"} />
          <StatCard title={t("dashboard.coverage")} value={`₹${activePlan ? activePlan.coverage.toLocaleString() : '—'}`} icon={Shield} variant="primary" subtitle={activePlan?.name || "No plan"} />
          <StatCard title={t("dashboard.activeClaims")} value={activeClaims.length} icon={FileCheck} variant="default" subtitle={`${pendingClaims.length} pending`} />
          <StatCard title={t("dashboard.weeklyPremium")} value={`₹${premium}`} icon={DollarSign} variant="default" subtitle={t("dashboard.dynamicPricing")} />
        </div>

        {/* AI Features row */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {/* AI Income Estimation */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">AI Income Estimation</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Estimated hourly</span>
                <span className="font-semibold text-foreground">₹{Math.round(avgHourlyIncome)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Disruption loss/hr</span>
                <span className="font-semibold text-destructive">-₹{calculatePayout(1, avgHourlyIncome)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">Hyper-Local Risk</h3>
            </div>
            <div className="space-y-2">
              {sortedZones.slice(0, 3).map((z) => (
                <div key={z.zone} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{z.zone}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{z.score}</span>
                    <RiskBadge level={z.riskLevel} />
                  </div>
                </div>
              ))}
              <p className="pt-1 text-[10px] text-muted-foreground">Sorted highest risk first</p>
            </div>
          </div>

          {/* Community Detection */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">Community Detection</h3>
            </div>
            {workerZone ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your zone</span>
                  <span className="font-semibold text-foreground">{workerZone.zone}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Active workers</span>
                  <span className="font-semibold text-success">{workerZone.activeWorkers}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Inactive workers</span>
                  <span className="font-semibold text-destructive">{workerZone.inactiveWorkers}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Disruption confidence</span>
                  <span className="font-semibold text-foreground">{workerZone.disruptionConfidence}%</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Zone data unavailable</p>
            )}
          </div>
        </div>

        {/* Transparent AI — factors sorted by weight, highest influence first */}
        <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-5 shadow-card">
          <div className="mb-1 flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">How Your Premium Is Calculated</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Sorted by impact on your premium — most influential factor first</p>
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            {aiFactors.map((f) => (
              <div key={f.label} className="rounded-lg border border-border bg-card p-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{f.label}</p>
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{f.weight}%</span>
                </div>
                <p className="mb-2 font-semibold text-foreground">{f.value}</p>
                <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary/60" style={{ width: `${f.weight}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Charts + Alerts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 px-1 text-xs text-muted-foreground">
              Solid line = Risk Score · Dashed line = Disruption % · Red line = High Risk threshold
            </p>
            <RiskChart data={riskTrends ?? []} type="line" title="Risk & Disruption Trends" />
          </div>
          <div className="space-y-3">
            <h3 className="font-display text-base font-semibold text-foreground">
              {t("dashboard.recentAlerts")}
              {sortedAlerts.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">— highest probability first</span>
              )}
            </h3>
            {sortedAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dashboard.noAlerts")}</p>
            ) : (
              sortedAlerts.slice(0, 3).map((alert) => (
                <AlertBox key={alert.id} alert={alert} />
              ))
            )}
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-5 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-foreground">Delete Worker Account</h3>
              <p className="text-xs text-muted-foreground">
                This action permanently removes your worker account and associated records.
              </p>
            </div>
            <button
              onClick={() => void handleDeleteAccount()}
              className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/20"
            >
              <Trash2 className="h-4 w-4" />
              Delete Account
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
