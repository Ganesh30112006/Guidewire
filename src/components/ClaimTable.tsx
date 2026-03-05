import { type Claim } from "@/services/api";

interface ClaimTableProps {
  claims: Claim[];
}

const statusStyles = {
  Approved: "bg-success/10 text-success",
  Pending: "bg-warning/10 text-warning",
  Rejected: "bg-destructive/10 text-destructive",
};

const ClaimTable = ({ claims }: ClaimTableProps) => {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-secondary/50">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Claim ID</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Disruption</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lost Hours</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Income Loss</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payout</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim, i) => (
            <tr
              key={claim.id}
              className={`border-b border-border transition-colors hover:bg-secondary/30 ${
                i % 2 === 0 ? "" : "bg-secondary/20"
              }`}
            >
              <td className="px-4 py-3 text-sm font-medium text-foreground">{claim.id}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(claim.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
              <td className="px-4 py-3 text-sm text-foreground">{claim.disruptionType}</td>
              <td className="px-4 py-3 text-sm text-foreground">{claim.lostHours}h</td>
              <td className="px-4 py-3 text-sm text-foreground">₹{claim.estimatedIncomeLoss}</td>
              <td className="px-4 py-3 text-sm font-medium text-foreground">
                {claim.payoutAmount > 0 ? `₹${claim.payoutAmount}` : "—"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[claim.status]}`}
                >
                  {claim.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ClaimTable;
