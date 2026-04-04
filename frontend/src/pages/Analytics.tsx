import { useMemo } from "react";
import Navbar from "@/components/Navbar";
import RiskChart from "@/components/RiskChart";
import RiskBadge from "@/components/RiskBadge";
import { PageSkeleton, ErrorState } from "@/components/LoadingSkeleton";
import { fetchRiskTrends, fetchZoneRisks, fetchWeatherEvents } from "@/services/api";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, MapPin, TrendingUp } from "lucide-react";

const Analytics = () => {
  const { data: riskTrends, isLoading: rtL } = useQuery({ queryKey: ["riskTrends"], queryFn: fetchRiskTrends });
  const { data: zoneRisks, isLoading: zL } = useQuery({ queryKey: ["zoneRisks"], queryFn: fetchZoneRisks });
  const { data: weatherEvents, isLoading: wL, isError, refetch } = useQuery({ queryKey: ["weatherEvents"], queryFn: fetchWeatherEvents });

  // Sort zones highest risk first so the most critical ones appear top-left
  const sortedZones = useMemo(
    () => [...(zoneRisks ?? [])].sort((a, b) => b.score - a.score),
    [zoneRisks]
  );

  // Sort weather events newest first
  const sortedWeather = useMemo(
    () => [...(weatherEvents ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [weatherEvents]
  );

  if (rtL || zL || wL) return <PageSkeleton />;
  if (isError) return <ErrorState message="Failed to load analytics" onRetry={() => refetch()} />;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-foreground">Risk Analytics</h1>
          <p className="text-sm text-muted-foreground">AI-powered insights into your risk profile</p>
        </div>

        {/* Zone Risk Scores — sorted high to low */}
        <div className="mb-8 rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="mb-1 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <h3 className="font-display text-lg font-semibold text-foreground">Zone Risk Scores</h3>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">Sorted highest risk first</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sortedZones.map((z) => (
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
                      className={`h-full rounded-full transition-all ${
                        z.riskLevel === "High" ? "bg-destructive" :
                        z.riskLevel === "Medium" ? "bg-warning" : "bg-success"
                      }`}
                      style={{ width: `${z.score}%` }}
                    />
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Active workers</span>
                    <span className="font-medium text-success">{z.activeWorkers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Disruption prob</span>
                    <span className="font-medium text-foreground">{z.disruptionConfidence}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Two separate charts — each with a clear, distinct purpose */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Risk vs Disruption Over Time</span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Solid = Risk Score (0–100 pts) · Dashed = Disruption probability (0–100%)
            </p>
            <RiskChart
              data={riskTrends ?? []}
              type="line"
              title="Weekly Trend"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Claims Filed Per Week</span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Number of claims submitted each week across all workers
            </p>
            <RiskChart
              data={riskTrends ?? []}
              type="bar"
              title="Weekly Claims Volume"
            />
          </div>
        </div>

        {/* Recent Weather Events — sorted newest first */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h3 className="font-display text-lg font-semibold text-foreground">Recent Weather Events</h3>
          </div>
          {sortedWeather.length === 0 ? (
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
                  {sortedWeather.map((e) => (
                    <tr key={`${e.date}-${e.type}`} className="border-b border-border hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-foreground">
                        {new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{e.type}</td>
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
