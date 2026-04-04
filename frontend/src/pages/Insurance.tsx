import React, { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import { PageSkeleton, ErrorState } from "@/components/LoadingSkeleton";
import { fetchInsurancePlans, type InsurancePlan } from "@/services/api";
import { useInsurance } from "@/contexts/InsuranceContext";
import { useQuery } from "@tanstack/react-query";
import {
  Check, Shield, Droplets, Thermometer, Wind, CloudRain,
  X, CreditCard, Smartphone, Loader2, CheckCircle2, Plus, BarChart2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const riskIcons: Record<string, typeof CloudRain> = {
  Rain: CloudRain,
  Flood: Droplets,
  "Extreme Heat": Thermometer,
  Pollution: Wind,
};

const RISK_PRICES: Record<string, number> = {
  Rain: 5,
  Flood: 7,
  "Extreme Heat": 4,
  Pollution: 4,
};

const allRisks = ["Rain", "Flood", "Extreme Heat", "Pollution"];

type PaymentMethod = "upi" | "card";
type ModalState = "form" | "processing" | "success";

type PendingPurchase =
  | { kind: "plan"; plan: InsurancePlan }
  | { kind: "risks"; risks: string[]; premium: number };

const Insurance = () => {
  const { selectedPlanId, setSelectedPlanId, selectedRisks, setSelectedRisks, cancelPlan } = useInsurance();
  const { data: plans, isLoading, isError, refetch } = useQuery({ queryKey: ["insurancePlans"], queryFn: fetchInsurancePlans });
  const { t } = useTranslation();

  // Local "browsing" selection for risks — not committed until payment
  const [pendingRisks, setPendingRisks] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);

  // Sync local pending risks from context whenever context changes
  useEffect(() => {
    setPendingRisks([...selectedRisks]);
  }, [selectedRisks]);

  // Payment modal state
  const [pendingPurchase, setPendingPurchase] = useState<PendingPurchase | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [modalState, setModalState] = useState<ModalState>("form");
  const [upiId, setUpiId] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [fieldError, setFieldError] = useState("");

  // Ref to clear the simulated payment timer on unmount.
  const paymentTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (paymentTimerRef.current) clearTimeout(paymentTimerRef.current);
  }, []);

  if (isLoading) return <PageSkeleton />;
  if (isError || !plans) return <ErrorState message="Failed to load insurance plans" onRetry={() => refetch()} />;

  const activePlan = plans.find((p) => p.id === selectedPlanId);
  const planCoveredRisks = activePlan?.risks ?? [];

  // Risks available for custom add-on (not already covered by active plan)
  const addOnRisks = allRisks.filter((r) => !planCoveredRisks.includes(r));

  // Among the addOnRisks, which are currently pending selection
  const pendingAddOns = pendingRisks.filter((r) => addOnRisks.includes(r));
  const customPremium = pendingAddOns.reduce((sum, r) => sum + (RISK_PRICES[r] ?? 0), 0);

  const toggleRisk = (risk: string) => {
    if (planCoveredRisks.includes(risk)) return; // already included in plan, not toggleable
    setPendingRisks((prev) =>
      prev.includes(risk) ? prev.filter((r) => r !== risk) : [...prev, risk]
    );
  };

  const openPlanModal = (plan: InsurancePlan) => {
    setPendingPurchase({ kind: "plan", plan });
    resetModalForm();
  };

  const openRisksModal = () => {
    if (pendingAddOns.length === 0) return;
    setPendingPurchase({ kind: "risks", risks: pendingAddOns, premium: customPremium });
    resetModalForm();
  };

  const resetModalForm = () => {
    setModalState("form");
    setFieldError("");
    setUpiId("");
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setPaymentMethod("upi");
  };

  const closeModal = () => {
    if (modalState === "processing") return;
    setPendingPurchase(null);
    setModalState("form");
    setFieldError("");
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const validateAndPay = () => {
    setFieldError("");
    if (paymentMethod === "upi") {
      if (!upiId.trim() || !/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim())) {
        setFieldError("Enter a valid UPI ID (e.g. name@upi)");
        return;
      }
    } else {
      const rawCard = cardNumber.replace(/\s/g, "");
      if (rawCard.length < 16) { setFieldError("Enter a valid 16-digit card number"); return; }
      if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) { setFieldError("Enter a valid expiry (MM/YY)"); return; }
      const [mm, yy] = cardExpiry.split("/").map(Number);
      if (mm < 1 || mm > 12) { setFieldError("Expiry month must be 01–12"); return; }
      const now = new Date();
      const expiryDate = new Date(2000 + yy, mm); // first day of the month AFTER expiry
      if (expiryDate <= now) { setFieldError("Card has expired"); return; }
      if (cardCvv.length < 3) { setFieldError("Enter a valid CVV"); return; }
    }
    setModalState("processing");
    paymentTimerRef.current = setTimeout(() => setModalState("success"), 1800);
  };

  const confirmSuccess = () => {
    if (!pendingPurchase) return;
    if (pendingPurchase.kind === "plan") {
      setSelectedPlanId(pendingPurchase.plan.id);
      toast.success(`${pendingPurchase.plan.name} activated successfully!`);
    } else {
      // Merge newly purchased add-on risks with existing non-add-on saved risks
      const existingNonAddOns = selectedRisks.filter((r) => !addOnRisks.includes(r));
      setSelectedRisks([...existingNonAddOns, ...pendingPurchase.risks]);
      toast.success(`Custom coverage activated for ${pendingPurchase.risks.join(", ")}!`);
    }
    setPendingPurchase(null);
    setModalState("form");
  };

  // Derived modal display values
  const modalPremium =
    pendingPurchase?.kind === "plan"
      ? pendingPurchase.plan.weeklyPremium
      : pendingPurchase?.premium ?? 0;

  const modalTitle =
    pendingPurchase?.kind === "plan"
      ? pendingPurchase.plan.name
      : `Custom Coverage (${pendingPurchase?.risks.length ?? 0} risks)`;

  const modalSubtitle =
    pendingPurchase?.kind === "plan"
      ? `Coverage up to ₹${pendingPurchase.plan.coverage.toLocaleString()}`
      : pendingPurchase?.risks.join(" · ") ?? "";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-foreground">{t("insurance.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("insurance.subtitle")}</p>
        </div>

        {/* Plans */}
        <div className="mb-10 grid gap-6 sm:grid-cols-3">
          {plans.map((plan) => {
            const isActive = selectedPlanId === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative rounded-xl border-2 p-6 shadow-card transition-all ${
                  isActive ? "border-primary bg-primary/5" : "border-border bg-card"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                    {t("insurance.mostPopular")}
                  </span>
                )}
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-display text-xl font-bold text-foreground">{plan.name}</h3>
                <div className="my-4">
                  <span className="font-display text-3xl font-bold text-foreground">₹{plan.weeklyPremium}</span>
                  <span className="text-sm text-muted-foreground">/{t("insurance.weekly")}</span>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                  {t("insurance.coveredUpTo")} <span className="font-semibold text-foreground">₹{plan.coverage.toLocaleString()}</span>
                </p>
                <div className="space-y-2">
                  {plan.risks.map((risk) => (
                    <div key={risk} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-success" />
                      <span className="text-foreground">{risk}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => isActive ? undefined : openPlanModal(plan)}
                  disabled={isActive}
                  className={`mt-6 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-default ${
                    isActive
                      ? "gradient-primary text-primary-foreground opacity-90"
                      : "border border-border bg-secondary text-foreground hover:bg-secondary/80 hover:border-primary/50"
                  }`}
                >
                  {isActive ? `✓ ${t("insurance.selected")}` : t("insurance.selectPlan")}
                </button>
                {isActive && (
                  <button
                    onClick={() => { cancelPlan(); toast.success("Plan cancelled successfully"); }}
                    className="mt-2 w-full rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    Cancel Plan
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Compare Plans toggle */}
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setShowComparison((s) => !s)}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <BarChart2 className="h-4 w-4" />
            {showComparison ? "Hide Comparison" : "Compare Plans"}
          </button>
        </div>

        {/* Plan comparison table */}
        {showComparison && (
          <div className="mb-10 overflow-x-auto rounded-xl border border-border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Feature</th>
                  {plans.map((p) => (
                    <th
                      key={p.id}
                      className={`px-5 py-3 text-center font-semibold ${p.id === selectedPlanId ? "text-primary" : "text-foreground"}`}
                    >
                      {p.name}
                      {p.id === selectedPlanId && (
                        <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">Active</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-5 py-3 font-medium text-foreground">Coverage Amount</td>
                  {plans.map((p) => (
                    <td key={p.id} className="px-5 py-3 text-center text-foreground">₹{p.coverage.toLocaleString()}</td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <td className="px-5 py-3 font-medium text-foreground">Weekly Premium</td>
                  {plans.map((p) => (
                    <td key={p.id} className="px-5 py-3 text-center font-semibold text-primary">₹{p.weeklyPremium}</td>
                  ))}
                </tr>
                {allRisks.map((risk) => (
                  <tr key={risk} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-foreground">{risk}</td>
                    {plans.map((p) => (
                      <td key={p.id} className="px-5 py-3 text-center">
                        {p.risks.includes(risk) ? (
                          <Check className="mx-auto h-4 w-4 text-success" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Multi-risk selector */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-foreground">
              {t("insurance.multiRisk")}
            </h3>
            {selectedRisks.filter((r) => addOnRisks.includes(r)).length > 0 && (
              <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                {selectedRisks.filter((r) => addOnRisks.includes(r)).length} active add-on{selectedRisks.filter((r) => addOnRisks.includes(r)).length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="mb-5 text-sm text-muted-foreground">
            {t("insurance.selectRisks")}
            {activePlan && (
              <span className="ml-1 text-primary font-medium">
                Risks already in your {activePlan.name} are pre-covered.
              </span>
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-4">
            {allRisks.map((risk) => {
              const Icon = riskIcons[risk] || CloudRain;
              const inPlan = planCoveredRisks.includes(risk);
              const isActivePaidAddOn = selectedRisks.includes(risk) && !inPlan;
              const isPendingSelection = pendingRisks.includes(risk) && !inPlan;

              return (
                <button
                  key={risk}
                  onClick={() => toggleRisk(risk)}
                  disabled={inPlan}
                  className={`relative flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-all disabled:cursor-default ${
                    inPlan
                      ? "border-success/30 bg-success/5"
                      : isPendingSelection
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {isActivePaidAddOn && (
                    <span className="absolute right-2 top-2 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">
                      ACTIVE
                    </span>
                  )}
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    inPlan
                      ? "bg-success/10 text-success"
                      : isPendingSelection
                      ? "bg-primary/10 text-primary"
                      : "bg-secondary text-muted-foreground"
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{risk}</p>
                    {inPlan ? (
                      <p className="text-xs text-success font-medium">Included in plan</p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {isPendingSelection ? t("insurance.covered") : t("insurance.notCovered")}
                        </p>
                        <p className="text-xs font-semibold text-primary mt-0.5">
                          +₹{RISK_PRICES[risk]}/week
                        </p>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Summary bar — shown when add-ons are pending */}
          {addOnRisks.length > 0 && (
            <div className={`mt-5 rounded-xl border p-4 transition-all ${
              pendingAddOns.length > 0
                ? "border-primary/20 bg-primary/5"
                : "border-border bg-secondary/30"
            }`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {pendingAddOns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Select one or more risks above to build custom coverage.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground">
                        Custom coverage: {pendingAddOns.join(", ")}
                      </p>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="font-display text-xl font-bold text-primary">₹{customPremium}</span>
                        <span className="text-xs text-muted-foreground">/week</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({pendingAddOns.map((r) => `${r} ₹${RISK_PRICES[r]}`).join(" + ")})
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={openRisksModal}
                  disabled={pendingAddOns.length === 0}
                  className="flex shrink-0 items-center gap-2 rounded-lg gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-shadow hover:shadow-elevated disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                  {pendingAddOns.length === 0
                    ? "Select risks to continue"
                    : `Buy Coverage · ₹${customPremium}/wk`}
                </button>
              </div>
            </div>
          )}

          {/* All risks already covered by plan */}
          {addOnRisks.length === 0 && activePlan && (
            <div className="mt-5 rounded-xl border border-success/20 bg-success/5 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <p className="text-sm font-medium text-success">
                  All risks are already covered by your {activePlan.name}.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Payment Modal */}
      {pendingPurchase && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-elevated">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="font-display text-lg font-bold text-foreground">
                {modalState === "success" ? "Payment Successful" : "Complete Payment"}
              </h2>
              {modalState !== "processing" && (
                <button
                  onClick={closeModal}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="p-6">
              {/* Success state */}
              {modalState === "success" ? (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                    <CheckCircle2 className="h-9 w-9 text-success" />
                  </div>
                  <div>
                    <p className="font-display text-xl font-bold text-foreground">{modalTitle} Activated!</p>
                    <p className="mt-1 text-sm text-muted-foreground">{modalSubtitle}</p>
                  </div>
                  <div className="w-full rounded-lg border border-success/20 bg-success/5 p-4 text-left">
                    <p className="text-xs text-muted-foreground">Amount paid</p>
                    <p className="font-display text-2xl font-bold text-success">₹{modalPremium}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Weekly premium · Auto-renews every week</p>
                  </div>
                  <button
                    onClick={confirmSuccess}
                    className="w-full rounded-lg gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-shadow hover:shadow-elevated"
                  >
                    Go to Dashboard
                  </button>
                </div>
              ) : (
                <>
                  {/* Purchase summary */}
                  <div className="mb-5 rounded-lg border border-border bg-secondary/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Coverage</p>
                        <p className="font-semibold text-foreground">{modalTitle}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{modalSubtitle}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-muted-foreground">Weekly premium</p>
                        <p className="font-display text-2xl font-bold text-primary">₹{modalPremium}</p>
                      </div>
                    </div>
                    {/* Risk price breakdown for custom risks */}
                    {pendingPurchase.kind === "risks" && (
                      <div className="mt-3 space-y-1 border-t border-border pt-3">
                        {pendingPurchase.risks.map((r) => (
                          <div key={r} className="flex justify-between text-xs text-muted-foreground">
                            <span>{r}</span>
                            <span className="font-medium text-foreground">₹{RISK_PRICES[r]}/wk</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs font-semibold text-foreground border-t border-border pt-1 mt-1">
                          <span>Total</span>
                          <span>₹{modalPremium}/wk</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Payment method toggle */}
                  <div className="mb-5">
                    <p className="mb-2 text-sm font-medium text-foreground">Payment Method</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setPaymentMethod("upi"); setFieldError(""); }}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-colors ${
                          paymentMethod === "upi"
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        <Smartphone className="h-4 w-4" /> UPI
                      </button>
                      <button
                        onClick={() => { setPaymentMethod("card"); setFieldError(""); }}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-colors ${
                          paymentMethod === "card"
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        <CreditCard className="h-4 w-4" /> Card
                      </button>
                    </div>
                  </div>

                  {/* UPI form */}
                  {paymentMethod === "upi" && (
                    <div className="mb-4 space-y-1.5">
                      <label className="text-sm font-medium text-foreground">UPI ID</label>
                      <input
                        type="text"
                        value={upiId}
                        onChange={(e) => { setUpiId(e.target.value); setFieldError(""); }}
                        placeholder="yourname@upi"
                        disabled={modalState === "processing"}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                      />
                    </div>
                  )}

                  {/* Card form */}
                  {paymentMethod === "card" && (
                    <div className="mb-4 space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">Card Number</label>
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={(e) => { setCardNumber(formatCardNumber(e.target.value)); setFieldError(""); }}
                          placeholder="1234 5678 9012 3456"
                          disabled={modalState === "processing"}
                          maxLength={19}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-foreground">Expiry</label>
                          <input
                            type="text"
                            value={cardExpiry}
                            onChange={(e) => { setCardExpiry(formatExpiry(e.target.value)); setFieldError(""); }}
                            placeholder="MM/YY"
                            disabled={modalState === "processing"}
                            maxLength={5}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-foreground">CVV</label>
                          <input
                            type="password"
                            value={cardCvv}
                            onChange={(e) => { setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4)); setFieldError(""); }}
                            placeholder="•••"
                            disabled={modalState === "processing"}
                            maxLength={4}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Field error */}
                  {fieldError && (
                    <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      {fieldError}
                    </p>
                  )}

                  {/* Processing indicator */}
                  {modalState === "processing" && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-sm text-primary font-medium">Processing payment securely…</span>
                    </div>
                  )}

                  {/* Pay button */}
                  <button
                    onClick={validateAndPay}
                    disabled={modalState === "processing"}
                    className="flex w-full items-center justify-center gap-2 rounded-lg gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-shadow hover:shadow-elevated disabled:opacity-70"
                  >
                    {modalState === "processing" ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                    ) : (
                      <>Pay ₹{modalPremium} / week</>
                    )}
                  </button>

                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    Secured by 256-bit SSL encryption · Cancel anytime
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Insurance;
