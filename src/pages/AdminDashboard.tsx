import Navbar from "@/components/Navbar";
import StatCard from "@/components/StatCard";
import RiskChart from "@/components/RiskChart";
import { StatusBadge } from "@/components/RiskBadge";
import { PageSkeleton, ErrorState, EmptyState } from "@/components/LoadingSkeleton";
import { fetchAdminMetrics, fetchRiskTrends, fetchZoneRisks, fetchClaims } from "@/services/api";
import { useQuery } from "@tanstack/react-query";
import { Users, Shield, FileCheck, DollarSign, AlertTriangle } from "lucide-react";

const AdminDashboard = () => {
  const { data: metrics, isLoading: mL } = useQuery({ queryKey: ["adminMetrics"], queryFn: fetchAdminMetrics });
  const { data: riskTrends, isLoading: rtL } = useQuery({ queryKey: ["riskTrends"], queryFn: fetchRiskTrends });
  const { data: zoneRisks, isLoading: zL } = useQuery({ queryKey: ["zoneRisks"], queryFn: fetchZoneRisks });
  const { data: claims, isLoading: cL, isError, refetch } = useQuery({ queryKey: ["claims"], queryFn: fetchClaims });

  if (mL || rtL || zL || cL) return <PageSkeleton />;
  if (isError || !metrics) return <ErrorState message="Failed to load admin data" onRetry={() => refetch()} />;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
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

        {/* Charts */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <RiskChart data={riskTrends ?? []} type="bar" title="Claim Volume Prediction" />
          <RiskChart data={riskTrends ?? []} type="line" title="Weather Disruption Impact" />
        </div>

        {/* High Risk Zones */}
        <div className="mb-8 rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <h3 className="font-display text-lg font-semibold text-foreground">High Risk Zones</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(zoneRisks ?? []).map((z) => (
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
          {(claims ?? []).length === 0 ? (
            <EmptyState title="No claims yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payout</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(claims ?? []).map((c, i) => (
                    <tr key={c.id} className={`border-b border-border ${i % 2 ? "bg-secondary/20" : ""}`}>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{c.id}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{c.disruptionType}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{c.payoutAmount > 0 ? `₹${c.payoutAmount}` : "—"}</td>
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
      </main>
    </div>
  );
};

export default AdminDashboard;
