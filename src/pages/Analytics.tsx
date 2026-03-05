import Navbar from "@/components/Navbar";
import RiskChart from "@/components/RiskChart";
import RiskBadge from "@/components/RiskBadge";
import { PageSkeleton, ErrorState } from "@/components/LoadingSkeleton";
import { fetchRiskTrends, fetchZoneRisks, fetchWeatherEvents } from "@/services/api";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, MapPin } from "lucide-react";

const Analytics = () => {
  const { data: riskTrends, isLoading: rtL } = useQuery({ queryKey: ["riskTrends"], queryFn: fetchRiskTrends });
  const { data: zoneRisks, isLoading: zL } = useQuery({ queryKey: ["zoneRisks"], queryFn: fetchZoneRisks });
  const { data: weatherEvents, isLoading: wL, isError, refetch } = useQuery({ queryKey: ["weatherEvents"], queryFn: fetchWeatherEvents });

  if (rtL || zL || wL) return <PageSkeleton />;
  if (isError) return <ErrorState message="Failed to load analytics" onRetry={() => refetch()} />;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-foreground">Risk Analytics</h1>
          <p className="text-sm text-muted-foreground">AI-powered insights into your risk profile</p>
        </div>

        {/* Zone Risk Scores */}
        <div className="mb-8 rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <h3 className="font-display text-lg font-semibold text-foreground">Zone Risk Scores</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(zoneRisks ?? []).map((z) => (
              <div key={z.zone} className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-semibold text-foreground">{z.zone}</p>
                  <RiskBadge level={z.riskLevel} />
                </div>
                <div className="mb-2">
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
                <p className="text-xs text-muted-foreground">
                  Disruption prob: <span className="font-medium text-foreground">{z.disruptionConfidence}%</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Charts */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <RiskChart data={riskTrends ?? []} type="line" title="Risk Trends" />
          <RiskChart data={riskTrends ?? []} type="bar" title="Claims & Disruption Frequency" />
        </div>

        {/* Recent Weather Events */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h3 className="font-display text-lg font-semibold text-foreground">Recent Weather Events</h3>
          </div>
          {(weatherEvents ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No recent weather events</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Event</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Severity</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(weatherEvents ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((e) => (
                    <tr key={`${e.date}-${e.type}`} className="border-b border-border hover:bg-secondary/30">
                      <td className="px-4 py-3 text-sm text-foreground">{new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{e.type}</td>
                      <td className="px-4 py-3">
                        <RiskBadge level={e.severity === "High" ? "High" : e.severity === "Low" ? "Low" : "Medium"} />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{e.impact}</td>
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

export default Analytics;
