interface RiskBadgeProps {
  level: "Low" | "Medium" | "High";
  size?: "sm" | "md";
}

const styles: Record<string, string> = {
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

export default RiskBadge;

interface StatusBadgeProps {
  status: "Approved" | "Pending" | "Rejected";
}

const statusStyles: Record<string, string> = {
  Approved: "bg-success/10 text-success",
  Pending: "bg-warning/10 text-warning",
  Rejected: "bg-destructive/10 text-destructive",
};

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[status]}`}>
      {status}
    </span>
  );
};
