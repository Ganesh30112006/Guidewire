import { type Alert } from "@/services/api";
import { CloudRain, Thermometer, Droplets, Wind, AlertTriangle } from "lucide-react";

interface AlertBoxProps {
  alert: Alert;
}

const iconMap = {
  rain: CloudRain,
  heat: Thermometer,
  flood: Droplets,
  pollution: Wind,
};

const severityStyles = {
  low: "border-info/30 bg-info/5",
  medium: "border-warning/30 bg-warning/5",
  high: "border-destructive/30 bg-destructive/5",
};

const severityIconBg = {
  low: "bg-info/10 text-info",
  medium: "bg-warning/10 text-warning",
  high: "bg-destructive/10 text-destructive",
};

const AlertBox = ({ alert }: AlertBoxProps) => {
  const Icon = iconMap[alert.type] || AlertTriangle;

  return (
    <div
      className={`animate-fade-in rounded-xl border p-4 shadow-card ${severityStyles[alert.severity]}`}
    >
      <div className="flex gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${severityIconBg[alert.severity]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{alert.message}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{alert.zone}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs font-medium text-foreground">
              {alert.probability}% probability
            </span>
          </div>
          {/* Probability bar */}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all ${
                alert.severity === "high"
                  ? "bg-destructive"
                  : alert.severity === "medium"
                  ? "bg-warning"
                  : "bg-info"
              }`}
              style={{ width: `${alert.probability}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlertBox;
