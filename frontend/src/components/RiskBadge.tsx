import { memo } from "react";

interface RiskBadgeProps {
  level: "Low" | "Medium" | "High";
  size?: "sm" | "md";
}

const styles: Record<"High" | "Medium" | "Low", string> = {
  High: "bg-destructive/10 text-destructive",
  Medium: "bg-warning/10 text-warning",
  Low: "bg-success/10 text-success",
};

const RiskBadge = ({ level, size = "sm" }: RiskBadgeProps) => {
  return (
    <span
      className={`rounded-full font-semibold ${styles[level]} ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
    >
      {level}
    </span>
  );
};

export default memo(RiskBadge);

interface StatusBadgeProps {
  status: "Approved" | "Pending" | "Rejected";
}

const statusStyles: Record<"Approved" | "Pending" | "Rejected", string> = {
  Approved: "bg-success/10 text-success",
  Pending: "bg-warning/10 text-warning",
  Rejected: "bg-destructive/10 text-destructive",
};

const StatusBadgeComponent = ({ status }: StatusBadgeProps) => {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[status]}`}>
      {status}
    </span>
  );
};

export const StatusBadge = memo(StatusBadgeComponent);
