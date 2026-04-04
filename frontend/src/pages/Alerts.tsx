import { useEffect, useMemo } from "react";
import Navbar from "@/components/Navbar";
import AlertBox from "@/components/AlertBox";
import RiskBadge from "@/components/RiskBadge";
import { PageSkeleton, ErrorState, EmptyState } from "@/components/LoadingSkeleton";
import { connectRealtimeEvents, fetchZoneRisks } from "@/services/api";
import { fetchLiveAlerts } from "@/services/weather";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";

const Alerts = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const selectedCity = user?.city?.trim() || undefined;
  const { data: alerts, isLoading: alL } = useQuery({
    queryKey: ["alerts", selectedCity ?? "default"],
    queryFn: () => fetchLiveAlerts(selectedCity),
    staleTime: 1000 * 30,
    refetchOnWindowFocus: false,
  });
  const { data: zoneRisks, isLoading: zL, isError, refetch } = useQuery({
    queryKey: ["zoneRisks"],
    queryFn: fetchZoneRisks,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const { rainAlert, heatAlert, floodAlert } = useMemo(() => {
    const byType = (type: string) =>
      (alerts ?? []).filter((a) => a.type === type).sort((a, b) => b.probability - a.probability)[0];
    return { rainAlert: byType("rain"), heatAlert: byType("heat"), floodAlert: byType("flood") };
  }, [alerts]);

  const expectedPendingClaims = useMemo(
    () => (zoneRisks ?? []).reduce((sum, z) => sum + Math.round(z.disruptionConfidence * z.activeWorkers / 100), 0),
    [zoneRisks]
  );

  useEffect(() => {
    const disconnect = connectRealtimeEvents((event) => {
      if (event.type === "risk.updated" || event.type === "proof.processed") {
        void queryClient.invalidateQueries({ queryKey: ["alerts"] });
        void queryClient.invalidateQueries({ queryKey: ["zoneRisks"] });
      }
    });
    return () => {
      disconnect();
    };
  }, [queryClient]);

  if (alL || zL) return <PageSkeleton />;
  if (isError) return <ErrorState message="Failed to load alerts" onRetry={() => refetch()} />;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
            <Bell className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">{t("alerts.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("alerts.subtitle")}</p>
          </div>
        </div>

        {/* Disruption Prediction */}
        <div className="mb-8 rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="mb-4 font-display text-lg font-semibold text-foreground">{t("alerts.disruptionPredictions")}</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: t("alerts.rainProbability"), value: rainAlert ? `${rainAlert.probability}%` : "0%", color: "text-info" },
              { label: t("alerts.heatWave"), value: heatAlert ? `${heatAlert.probability}%` : "0%", color: "text-warning" },
              { label: t("alerts.floodRisk"), value: floodAlert ? `${floodAlert.probability}%` : "0%", color: "text-destructive" },
              { label: t("alerts.expectedClaims"), value: String(expectedPendingClaims), color: "text-foreground" },
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
          <h3 className="font-display text-lg font-semibold text-foreground">{t("alerts.activeAlerts")}</h3>
          {(alerts ?? []).length === 0 ? (
            <EmptyState title={t("alerts.noAlerts")} description={t("alerts.noAlertsDesc")} />
          ) : (
            [...(alerts ?? [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((alert) => (
              <AlertBox key={alert.id} alert={alert} />
            ))
          )}
        </div>

        {/* Community disruption */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <h3 className="mb-4 font-display text-lg font-semibold text-foreground">{t("alerts.communityDetection")}</h3>
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
