import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, ReferenceLine,
} from "recharts";
import { type RiskTrend } from "@/services/api";

interface RiskChartProps {
  data: RiskTrend[];
  type?: "line" | "bar";
  title: string;
  subtitle?: string;
}

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
} as const;

const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" } as const;

const formatTooltipValue = (value: number, name: string) => {
  if (name === "Risk Score") return [`${value} pts`, name];
  if (name === "Disruption %") return [`${value}%`, name];
  if (name === "Claims") return [value, "Claims filed"];
  return [value, name];
};

const RiskChart = ({ data, type = "line", title, subtitle }: RiskChartProps) => {
  // Sort chronologically so X-axis always reads left to right in week order
  const sorted = [...data].sort((a, b) => {
    const weekA = parseInt(a.date.replace(/\D/g, ""), 10) || 0;
    const weekB = parseInt(b.date.replace(/\D/g, ""), 10) || 0;
    return weekA - weekB;
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4">
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        {type === "line" ? (
          <LineChart data={sorted} margin={{ top: 12, right: 16, left: -4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            {/* Fixed 0-100 domain: both risk score and disruption % share the same 0-100 scale */}
            <YAxis domain={[0, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={formatTooltipValue}
              labelStyle={{ fontWeight: 600, marginBottom: 4, color: "hsl(var(--foreground))" }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
            {/* Visual threshold: above 70 = high risk zone */}
            <ReferenceLine
              y={70}
              stroke="hsl(var(--destructive))"
              strokeDasharray="4 4"
              strokeOpacity={0.45}
              label={{ value: "High Risk", position: "right", fontSize: 10, fill: "hsl(var(--destructive))" }}
            />
            <Line
              type="monotone" dataKey="riskScore"
              stroke="hsl(var(--primary))" strokeWidth={2.5}
              name="Risk Score"
              dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone" dataKey="disruptionProb"
              stroke="hsl(var(--warning))" strokeWidth={2.5}
              name="Disruption %"
              strokeDasharray="5 3"
              dot={{ r: 4, fill: "hsl(var(--warning))", strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        ) : (
          // Claims count only — never mix count-based and %-based on the same Y-axis
          <BarChart data={sorted} margin={{ top: 12, right: 8, left: -4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={formatTooltipValue}
              cursor={{ fill: "hsl(var(--border))", opacity: 0.5 }}
              labelStyle={{ fontWeight: 600, marginBottom: 4, color: "hsl(var(--foreground))" }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="rect" iconSize={10} />
            <Bar dataKey="claims" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Claims" maxBarSize={40} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default RiskChart;
