import Navbar from "@/components/Navbar";
import StatCard from "@/components/StatCard";
import AlertBox from "@/components/AlertBox";
import RiskChart from "@/components/RiskChart";
import RiskBadge from "@/components/RiskBadge";
import { PageSkeleton, ErrorState } from "@/components/LoadingSkeleton";
import {
  fetchWorker, fetchAlerts, fetchRiskTrends, fetchZoneRisks,
  calculateDynamicPremium, calculatePayout, WORK_HOURS_PER_DAY,
} from "@/services/api";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useInsurance } from "@/contexts/InsuranceContext";
import { useClaims } from "@/contexts/ClaimsContext";
import { fetchInsurancePlans } from "@/services/api";
import {
  Shield, TrendingUp, Award, FileCheck, DollarSign, MapPin,
  Zap, Brain, Users,
} from "lucide-react";

const Dashboard = () => {
  const { user } = useAuth();
  const { getActivePlan } = useInsurance();

  const { data: worker, isLoading: wLoading, isError: wError, refetch: wRefetch } = useQuery({ queryKey: ["worker"], queryFn: fetchWorker });
  const { data: alerts, isLoading: aLoading } = useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts });
  const { data: riskTrends, isLoading: rtLoading } = useQuery({ queryKey: ["riskTrends"], queryFn: fetchRiskTrends });
  const { data: zoneRisks, isLoading: zLoading } = useQuery({ queryKey: ["zoneRisks"], queryFn: fetchZoneRisks });
  const { data: plans, isLoading: pLoading } = useQuery({ queryKey: ["insurancePlans"], queryFn: fetchInsurancePlans });
  const { claims } = useClaims();

  if (wLoading || aLoading || rtLoading || zLoading || pLoading) return <PageSkeleton />;
  if (wError || !worker) return <ErrorState message="Failed to load dashboard data" onRetry={() => wRefetch()} />;

  const activePlan = getActivePlan(plans ?? []);
  const premium = calculateDynamicPremium(worker.riskScore);
  const avgHourlyIncome = worker.avgDailyIncome / WORK_HOURS_PER_DAY;

  // Compute claim stats from actual data
  const activeClaims = (claims ?? []).filter((c) => c.status !== "Rejected");
  const pendingClaims = (claims ?? []).filter((c) => c.status === "Pending");

  // Find the worker's zone data
  const workerZone = (zoneRisks ?? []).find((z) => z.zone === worker.zone);

  // Find highest-probability alert for weather forecast display
  const topAlert = (alerts ?? []).length > 0
    ? [...(alerts ?? [])].sort((a, b) => b.probability - a.probability)[0]
    : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              Welcome back, {user?.name || worker.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {worker.platform} • {worker.city} • {worker.zone}
            </p>
          </div>
          {activePlan ? (
            <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2">
              <div className="h-2 w-2 animate-pulse-glow rounded-full bg-success" />
              <span className="text-sm font-medium text-primary">Policy Active</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full border border-warning/20 bg-warning/5 px-4 py-2">
              <div className="h-2 w-2 rounded-full bg-warning" />
              <span className="text-sm font-medium text-warning">No Active Policy</span>
            </div>
          )}
        </div>

        {/* Stat cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard title="Risk Score" value={worker.riskScore} icon={TrendingUp} variant="warning" trend="up" trendValue="8% this week" />
          <StatCard title="Trust Score" value={worker.trustScore} icon={Award} variant="success" subtitle={worker.trustScore >= 75 ? "High Trust ✓" : "Building Trust"} />
          <StatCard title="Coverage" value={`₹${activePlan ? activePlan.coverage.toLocaleString() : '—'}`} icon={Shield} variant="primary" subtitle={activePlan?.name || "No plan"} />
          <StatCard title="Active Claims" value={activeClaims.length} icon={FileCheck} variant="default" subtitle={`${pendingClaims.length} pending`} />
          <StatCard title="Weekly Premium" value={`₹${premium}`} icon={DollarSign} variant="default" subtitle="Dynamic pricing" />
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

          {/* Zone Risk */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="mb-3 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">Hyper-Local Risk</h3>
            </div>
            <div className="space-y-2">
              {(zoneRisks ?? []).slice(0, 3).map((z) => (
                <div key={z.zone} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{z.zone}</span>
                  <RiskBadge level={z.riskLevel} />
                </div>
              ))}
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

        {/* Transparent AI */}
        <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h3 className="font-display text-sm font-semibold text-foreground">Transparent AI — How Your Premium Is Calculated</h3>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            {[
              { label: "Zone Risk", value: workerZone ? `${workerZone.riskLevel} (${workerZone.score})` : "N/A", weight: "35%" },
              { label: "Historical Claims", value: `${(claims ?? []).length} claims`, weight: "25%" },
              { label: "Trust Score", value: `${worker.trustScore}/100`, weight: "20%" },
              { label: "Weather Forecast", value: topAlert ? `${topAlert.type.charAt(0).toUpperCase() + topAlert.type.slice(1)} (${topAlert.probability}%)` : "Clear", weight: "20%" },
            ].map((f) => (
              <div key={f.label} className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="font-semibold text-foreground">{f.value}</p>
                <p className="text-xs text-primary">Weight: {f.weight}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Charts + Alerts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <RiskChart data={riskTrends ?? []} type="line" title="Risk & Disruption Trends" />
          <div className="space-y-4">
            <h3 className="font-display text-lg font-semibold text-foreground">Recent Alerts</h3>
            {(alerts ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No active alerts</p>
            ) : (
              (alerts ?? []).slice(0, 3).map((alert) => (
                <AlertBox key={alert.id} alert={alert} />
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
