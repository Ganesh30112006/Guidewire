import { useState } from "react";
import Navbar from "@/components/Navbar";
import ClaimTable from "@/components/ClaimTable";
import { useClaims } from "@/contexts/ClaimsContext";
import { FileCheck, Clock, CheckCircle, DollarSign, Search } from "lucide-react";
import StatCard from "@/components/StatCard";
import { EmptyState } from "@/components/LoadingSkeleton";

const PAGE_SIZE = 5;

const Claims = () => {
  const { claims } = useClaims();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Approved" | "Pending" | "Rejected">("All");
  const [page, setPage] = useState(1);

  const approved = claims.filter((c) => c.status === "Approved");
  const pending = claims.filter((c) => c.status === "Pending");
  const rejected = claims.filter((c) => c.status === "Rejected");
  const totalPayout = approved.reduce((s, c) => s + c.payoutAmount, 0);

  // Filtering & sorting (newest first)
  const filtered = claims
    .filter((c) => statusFilter === "All" || c.status === statusFilter)
    .filter(
      (c) =>
        c.id.toLowerCase().includes(search.toLowerCase()) ||
        c.disruptionType.toLowerCase().includes(search.toLowerCase()) ||
        c.date.includes(search)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-foreground">Claims</h1>
          <p className="text-sm text-muted-foreground">Track your insurance claims and payouts</p>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-5">
          <StatCard title="Total Claims" value={claims.length} icon={FileCheck} variant="default" />
          <StatCard title="Pending" value={pending.length} icon={Clock} variant="warning" />
          <StatCard title="Approved" value={approved.length} icon={CheckCircle} variant="success" />
          <StatCard title="Rejected" value={rejected.length} icon={FileCheck} variant="danger" />
          <StatCard title="Total Payout" value={`₹${totalPayout.toLocaleString()}`} icon={DollarSign} variant="primary" />
        </div>

        {/* Smart Claim Automation note */}
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm text-foreground">
            <span className="font-semibold">🤖 Smart Claim Automation:</span>{" "}
            Claims are automatically triggered when a disruption event is detected and you become inactive. No manual filing needed.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search claims..."
              className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-64"
            />
          </div>
          <div className="flex gap-2">
            {(["All", "Approved", "Pending", "Rejected"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No claims found" description="Try adjusting your search or filter" />
        ) : (
          <>
            <ClaimTable claims={paginated} />
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Claims;
