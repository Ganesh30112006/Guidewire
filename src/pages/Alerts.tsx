import Navbar from "@/components/Navbar";
import AlertBox from "@/components/AlertBox";
import RiskBadge from "@/components/RiskBadge";
import { PageSkeleton, ErrorState, EmptyState } from "@/components/LoadingSkeleton";
import { fetchAlerts, fetchZoneRisks } from "@/services/api";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";

const Alerts = () => {
  const { data: alerts, isLoading: alL } = useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts });
  const { data: zoneRisks, isLoading: zL, isError, refetch } = useQuery({ queryKey: ["zoneRisks"], queryFn: fetchZoneRisks });

  if (alL || zL) return <PageSkeleton />;
  if (isError) return <ErrorState message="Failed to load alerts" onRetry={() => refetch()} />;

  // Compute predictions from actual alert data
  const alertsByType = (type: string) =>
    (alerts ?? []).filter((a) => a.type === type).sort((a, b) => b.probability - a.probability)[0];

  const rainAlert = alertsByType("rain");
  const heatAlert = alertsByType("heat");
  const floodAlert = alertsByType("flood");
  const expectedPendingClaims = (zoneRisks ?? []).reduce((sum, z) =>
    sum + Math.round(z.disruptionConfidence * z.activeWorkers / 100), 0
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
            <Bell className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Alerts & Warnings</h1>
            <p className="text-sm text-muted-foreground">Real-time disruption alerts powered by AI</p>
          </div>
        </div>

        {/* Disruption Prediction */}
        <div className="mb-8 rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="mb-4 font-display text-lg font-semibold text-foreground">Disruption Predictions</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Rain Probability", value: rainAlert ? `${rainAlert.probability}%` : "0%", color: "text-info" },
              { label: "Heat Wave Risk", value: heatAlert ? `${heatAlert.probability}%` : "0%", color: "text-warning" },
              { label: "Flood Risk", value: floodAlert ? `${floodAlert.probability}%` : "0%", color: "text-destructive" },
              { label: "Expected Claims", value: String(expectedPendingClaims), color: "text-foreground" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-border bg-secondary/30 p-4 text-center">
                <p className={`font-display text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts list */}
        <div className="mb-8 space-y-4">
          <h3 className="font-display text-lg font-semibold text-foreground">Active Alerts</h3>
          {(alerts ?? []).length === 0 ? (
            <EmptyState title="No active alerts" description="You'll be notified when a disruption is predicted" />
          ) : (
            [...(alerts ?? [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((alert) => (
              <AlertBox key={alert.id} alert={alert} />
            ))
          )}
        </div>

        {/* Community disruption */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="mb-4 font-display text-lg font-semibold text-foreground">Community Disruption Detection</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(zoneRisks ?? []).map((z) => (
              <div key={z.zone} className="rounded-lg border border-border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold text-foreground">{z.zone}</p>
                  <RiskBadge level={z.riskLevel} />
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Active</span>
                    <span className="font-medium text-success">{z.activeWorkers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Inactive</span>
                    <span className="font-medium text-destructive">{z.inactiveWorkers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Confidence</span>
                    <span className="font-medium text-foreground">{z.disruptionConfidence}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Alerts;
