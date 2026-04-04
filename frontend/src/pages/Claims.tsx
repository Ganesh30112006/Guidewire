import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import Navbar from "@/components/Navbar";
import ClaimTable from "@/components/ClaimTable";
import { useClaims } from "@/contexts/ClaimsContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  type Claim,
  type WeeklyEarningsProofRecord,
  calculatePayout,
  WORK_HOURS_PER_DAY,
  fetchWeeklyEarningsProofs,
  uploadWeeklyEarningsProof,
} from "@/services/api";
import { FileCheck, Clock, CheckCircle, DollarSign, Search, Plus, CloudRain, Thermometer, Waves, Wind, X, Download, CheckCircle2 } from "lucide-react";
import StatCard from "@/components/StatCard";
import { EmptyState } from "@/components/LoadingSkeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const PAGE_SIZE = 5;

const DISRUPTION_TYPES = [
  { label: "Heavy Rain", icon: CloudRain },
  { label: "Extreme Heat", icon: Thermometer },
  { label: "Flood", icon: Waves },
  { label: "Pollution", icon: Wind },
] as const;

type DisruptionType = typeof DISRUPTION_TYPES[number]["label"];

const claimSchema = z.object({
  disruptionType: z.enum(
    ["Heavy Rain", "Extreme Heat", "Flood", "Pollution"] as [DisruptionType, ...DisruptionType[]],
    { required_error: "Select a disruption type" }
  ),
  lostHours: z.coerce
    .number({ invalid_type_error: "Enter a number" })
    .min(0.5, "Minimum 0.5 hours")
    .max(24, "Cannot exceed 24 hours"),
});

type ClaimFormValues = z.infer<typeof claimSchema>;

const statusColors = {
  Approved: "text-success",
  Pending: "text-warning",
  Rejected: "text-destructive",
};
const statusBg = {
  Approved: "border-success/20 bg-success/5",
  Pending: "border-warning/20 bg-warning/5",
  Rejected: "border-destructive/20 bg-destructive/5",
};

const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const getCurrentWeekStartISO = () => {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diffToMonday);
  return now.toISOString().slice(0, 10);
};

const Claims = () => {
  const { claims, addClaim } = useClaims();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Approved" | "Pending" | "Rejected">("All");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);

  const [earningsWeekStart, setEarningsWeekStart] = useState(getCurrentWeekStartISO());
  const [earningsAmount, setEarningsAmount] = useState("");
  const [earningsScreenshotFile, setEarningsScreenshotFile] = useState<File | null>(null);
  const [isUploadingEarnings, setIsUploadingEarnings] = useState(false);
  const [earningsProofs, setEarningsProofs] = useState<WeeklyEarningsProofRecord[]>([]);
  const [isLoadingEarnings, setIsLoadingEarnings] = useState(true);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ClaimFormValues>({
    resolver: zodResolver(claimSchema),
    defaultValues: { lostHours: 1 },
  });

  const watchedType = watch("disruptionType");
  const watchedHours = watch("lostHours");

  const avgDailyIncome = user?.avgDailyIncome ?? 500;
  const avgHourlyIncome = avgDailyIncome / WORK_HOURS_PER_DAY;
  const previewLoss = watchedHours > 0 ? Math.round(watchedHours * avgHourlyIncome) : 0;
  const previewPayout = watchedHours > 0 ? calculatePayout(watchedHours, avgHourlyIncome) : 0;

  const approved = useMemo(() => claims.filter((c) => c.status === "Approved"), [claims]);
  const pending = useMemo(() => claims.filter((c) => c.status === "Pending"), [claims]);
  const rejected = useMemo(() => claims.filter((c) => c.status === "Rejected"), [claims]);
  const totalPayout = useMemo(() => approved.reduce((s, c) => s + c.payoutAmount, 0), [approved]);

  const filtered = useMemo(() =>
    claims
      .filter((c) => statusFilter === "All" || c.status === statusFilter)
      .filter(
        (c) =>
          c.id.toLowerCase().includes(search.toLowerCase()) ||
          c.disruptionType.toLowerCase().includes(search.toLowerCase()) ||
          c.date.includes(search)
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [claims, statusFilter, search]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  useEffect(() => {
    let mounted = true;
    const loadEarningsProofs = async () => {
      setIsLoadingEarnings(true);
      try {
        const records = await fetchWeeklyEarningsProofs();
        if (mounted) {
          setEarningsProofs(records);
        }
      } catch {
        if (mounted) {
          setEarningsProofs([]);
        }
      } finally {
        if (mounted) {
          setIsLoadingEarnings(false);
        }
      }
    };

    void loadEarningsProofs();
    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = async (data: ClaimFormValues) => {
    if (!proofFile) {
      toast.error("Proof file is required to file a claim");
      return;
    }

    setIsSubmittingClaim(true);
    try {
      await addClaim(data.disruptionType, data.lostHours, proofFile);
      toast.success(`Claim filed for ${data.disruptionType} - ${data.lostHours}h lost`);
      reset({ lostHours: 1 });
      setProofFile(null);
      setShowModal(false);
    } catch {
      toast.error("Failed to submit claim. Please retry.");
    } finally {
      setIsSubmittingClaim(false);
    }
  };

  const handleOpenModal = () => {
    reset({ lostHours: 1 });
    setProofFile(null);
    setShowModal(true);
  };

  const handleUploadWeeklyEarnings = async () => {
    const parsedEarnings = Number(earningsAmount);
    if (!earningsScreenshotFile) {
      toast.error("Please upload a weekly earnings screenshot");
      return;
    }
    if (!earningsWeekStart) {
      toast.error("Please select the week start date");
      return;
    }
    if (!Number.isFinite(parsedEarnings) || parsedEarnings <= 0) {
      toast.error("Please enter valid weekly earnings");
      return;
    }

    setIsUploadingEarnings(true);
    try {
      const uploaded = await uploadWeeklyEarningsProof({
        weekStartAt: earningsWeekStart,
        reportedEarnings: parsedEarnings,
        screenshotFile: earningsScreenshotFile,
      });
      setEarningsProofs((prev) => [uploaded, ...prev]);
      setEarningsAmount("");
      setEarningsScreenshotFile(null);
      toast.success("Weekly earnings screenshot uploaded and processed");
    } catch {
      toast.error("Failed to upload weekly earnings screenshot");
    } finally {
      setIsUploadingEarnings(false);
    }
  };

  const exportCsv = () => {
    const headers = ["Claim ID", "Date", "Disruption Type", "Lost Hours", "Income Loss (₹)", "Payout (₹)", "Status"];
    const rows = filtered.map((c) => [
      c.id,
      c.date,
      c.disruptionType,
      c.lostHours,
      c.estimatedIncomeLoss,
      c.payoutAmount,
      c.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `giggo-claims-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Claims exported as CSV");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">{t("claims.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("claims.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            {filtered.length > 0 && (
              <button
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            )}
            <button
              onClick={handleOpenModal}
              className="inline-flex items-center gap-2 rounded-lg gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:shadow-elevated transition-shadow"
            >
              <Plus className="h-4 w-4" />
              {t("claims.fileAClaim")}
            </button>
          </div>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-5">
          <StatCard title={t("claims.total")} value={claims.length} icon={FileCheck} variant="default" />
          <StatCard title={t("claims.pending")} value={pending.length} icon={Clock} variant="warning" />
          <StatCard title={t("claims.approved")} value={approved.length} icon={CheckCircle} variant="success" />
          <StatCard title={t("claims.rejected")} value={rejected.length} icon={FileCheck} variant="danger" />
          <StatCard title={t("claims.totalPayout")} value={`₹${totalPayout.toLocaleString()}`} icon={DollarSign} variant="primary" />
        </div>

        <div className="mb-8 rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="font-display text-lg font-semibold text-foreground">Weekly Earnings Proof</h2>
            <p className="text-sm text-muted-foreground">
              Upload your app dashboard screenshot each week. The model checks screenshot quality and logs proof for claim validation.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Week Start Date</label>
              <input
                type="date"
                value={earningsWeekStart}
                onChange={(e) => setEarningsWeekStart(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Weekly Earnings (INR)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={earningsAmount}
                onChange={(e) => setEarningsAmount(e.target.value)}
                placeholder="e.g. 6200"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Dashboard Screenshot</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setEarningsScreenshotFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:font-medium file:text-foreground"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleUploadWeeklyEarnings}
                disabled={isUploadingEarnings}
                className="w-full rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUploadingEarnings ? "Uploading..." : "Upload Proof"}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Uploaded Proofs</p>
            {isLoadingEarnings ? (
              <p className="text-sm text-muted-foreground">Loading weekly proofs...</p>
            ) : earningsProofs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No weekly earnings proof uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {earningsProofs.slice(0, 5).map((record) => (
                  <div key={record.id} className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-medium text-foreground">
                        Week of {new Date(record.weekStartAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                      <p className="text-xs text-muted-foreground">Quality Score: {record.modelQualityScore.toFixed(1)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Earnings: ₹{record.reportedEarnings.toLocaleString()} | File: {record.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">{record.processingSummary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Smart Claim Automation note */}
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm text-foreground">
            <span className="font-semibold">🤖 Smart Claim Automation:</span>{" "}
            Claims are automatically triggered when a disruption event is detected and you become inactive. You can also file manually using the button above.
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
              placeholder={t("claims.searchPlaceholder")}
              className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-64"
            />
          </div>
          <div className="flex gap-2">
            {(["All", "Approved", "Pending", "Rejected"] as const).map((s) => {
              const labels: Record<typeof s, string> = {
                All: t("claims.all"),
                Approved: t("claims.approved"),
                Pending: t("claims.pending"),
                Rejected: t("claims.rejected"),
              };
              return (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {labels[s]}
                </button>
              );
            })}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No claims found" description="Try adjusting your search or filter" />
        ) : (
          <>
            <ClaimTable claims={paginated} onSelect={setSelectedClaim} />
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
                    {t("common.previous")}
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                  >
                    {t("common.next")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* File-a-Claim Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">{t("claims.fileClaimTitle")}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            {/* Disruption type */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t("claims.disruptionType")}</label>
              <div className="grid grid-cols-2 gap-2">
                {DISRUPTION_TYPES.map(({ label, icon: Icon }) => {
                  const disruptionLabels: Record<DisruptionType, string> = {
                    "Heavy Rain": t("claims.heavyRain"),
                    "Extreme Heat": t("claims.extremeHeat"),
                    "Flood": t("claims.flood"),
                    "Pollution": t("claims.pollution"),
                  };
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setValue("disruptionType", label, { shouldValidate: true })}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
                        watchedType === label
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {disruptionLabels[label]}
                    </button>
                  );
                })}
              </div>
              {errors.disruptionType && (
                <p className="text-xs text-destructive">{errors.disruptionType.message}</p>
              )}
            </div>

            {/* Lost hours */}
            <div className="space-y-1.5">
              <label htmlFor="lostHours" className="text-sm font-medium text-foreground">
                {t("claims.hoursLost")}
              </label>
              <input
                id="lostHours"
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                {...register("lostHours")}
                className={`w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 ${
                  errors.lostHours
                    ? "border-destructive focus:border-destructive focus:ring-destructive/20"
                    : "border-input focus:border-primary focus:ring-primary/20"
                }`}
              />
              {errors.lostHours && (
                <p className="text-xs text-destructive">{errors.lostHours.message}</p>
              )}
            </div>

            {/* Live payout preview */}
            <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("claims.estimatedLoss")}</span>
                <span className="font-medium text-foreground">₹{previewLoss.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("claims.expectedPayout")}</span>
                <span className="font-semibold text-success">₹{previewPayout.toLocaleString()}</span>
              </div>
              {!user?.avgDailyIncome && (
                <p className="text-xs text-amber-500">
                  Set your daily income in your profile for more accurate estimates.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="proofFile" className="text-sm font-medium text-foreground">
                Claim Proof (Required)
              </label>
              <input
                id="proofFile"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:font-medium file:text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Upload screenshot/photo/PDF proof for this disruption claim.
              </p>
              {!proofFile && (
                <p className="text-xs text-destructive">Proof file is required.</p>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isSubmittingClaim || !proofFile}
                className="flex-1 rounded-lg gradient-primary py-2.5 text-sm font-semibold text-primary-foreground hover:shadow-elevated transition-shadow"
              >
                {isSubmittingClaim ? "Submitting..." : t("claims.submitClaim")}
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("claims.cancel")}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Claim Detail Modal */}
      {selectedClaim && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedClaim(null); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-elevated">
            {/* Header */}
            <div className={`flex items-center justify-between rounded-t-2xl border-b px-6 py-4 ${statusBg[selectedClaim.status]}`}>
              <div>
                <p className="text-xs text-muted-foreground">Claim ID</p>
                <p className="font-display text-lg font-bold text-foreground">{selectedClaim.id}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusBg[selectedClaim.status]} ${statusColors[selectedClaim.status]}`}>
                  {selectedClaim.status}
                </span>
                {selectedClaim.isOfflineQueued && (
                  <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-bold text-warning">
                    Offline queued
                  </span>
                )}
                <button onClick={() => setSelectedClaim(null)} className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Claim details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Disruption Type</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{selectedClaim.disruptionType}</p>
                </div>
                <div className="rounded-lg bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Hours Lost</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{selectedClaim.lostHours}h</p>
                </div>
                <div className="rounded-lg bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">Income Loss</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">₹{selectedClaim.estimatedIncomeLoss.toLocaleString()}</p>
                </div>
                <div className={`rounded-lg p-3 ${selectedClaim.payoutAmount > 0 ? "bg-success/5" : "bg-secondary/30"}`}>
                  <p className="text-xs text-muted-foreground">Payout Amount</p>
                  <p className={`text-sm font-semibold mt-0.5 ${selectedClaim.payoutAmount > 0 ? "text-success" : "text-muted-foreground"}`}>
                    {selectedClaim.payoutAmount > 0 ? `₹${selectedClaim.payoutAmount.toLocaleString()}` : "—"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Fraud Scoring Explanation</p>
                <p className="mt-1 text-sm text-foreground">
                  {selectedClaim.decisionExplanation ?? "Explanation will appear once the model evaluates this claim."}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Risk score: {selectedClaim.fraudRiskScore != null ? selectedClaim.fraudRiskScore.toFixed(1) : "N/A"}
                  {selectedClaim.riskModelVariant ? ` | Variant: ${selectedClaim.riskModelVariant}` : ""}
                </p>
              </div>

              {/* Timeline */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status Timeline</p>
                <div className="relative space-y-0">
                  {[
                    {
                      label: "Claim Filed",
                      date: new Date(selectedClaim.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
                      done: true,
                    },
                    {
                      label: "Under Review",
                      date: addDays(selectedClaim.date, 1),
                      done: true,
                    },
                    {
                      label: selectedClaim.status === "Approved" ? "Approved & Paid" : selectedClaim.status === "Rejected" ? "Claim Rejected" : "Awaiting Decision",
                      date: selectedClaim.status !== "Pending" ? addDays(selectedClaim.date, 2) : "Pending",
                      done: selectedClaim.status !== "Pending",
                    },
                  ].map((step, idx, arr) => (
                    <div key={step.label} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                          step.done
                            ? selectedClaim.status === "Rejected" && idx === arr.length - 1
                              ? "border-destructive bg-destructive/10"
                              : "border-success bg-success/10"
                            : "border-border bg-secondary"
                        }`}>
                          {step.done ? (
                            selectedClaim.status === "Rejected" && idx === arr.length - 1
                              ? <X className="h-3.5 w-3.5 text-destructive" />
                              : <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <div className="h-2 w-2 rounded-full bg-border" />
                          )}
                        </div>
                        {idx < arr.length - 1 && (
                          <div className={`w-0.5 flex-1 my-0.5 ${step.done ? "bg-success/30" : "bg-border"}`} style={{ minHeight: "24px" }} />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className={`text-sm font-medium ${step.done ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</p>
                        <p className="text-xs text-muted-foreground">{step.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Claims;
