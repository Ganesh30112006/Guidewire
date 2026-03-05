import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from "recharts";
import { type RiskTrend } from "@/services/api";

interface RiskChartProps {
  data: RiskTrend[];
  type?: "line" | "bar";
  title: string;
}

const RiskChart = ({ data, type = "line", title }: RiskChartProps) => {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <h3 className="mb-4 font-display text-lg font-semibold text-foreground">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        {type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Legend />
            <Line type="monotone" dataKey="riskScore" stroke="hsl(var(--primary))" strokeWidth={2} name="Risk Score" dot={{ r: 4 }} />
            <Line type="monotone" dataKey="disruptionProb" stroke="hsl(var(--warning))" strokeWidth={2} name="Disruption %" dot={{ r: 4 }} />
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            />
            <Legend />
            <Bar dataKey="claims" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Claims" />
            <Bar dataKey="disruptionProb" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} name="Disruption %" />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default RiskChart;
