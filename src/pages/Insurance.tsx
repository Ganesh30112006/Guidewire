import Navbar from "@/components/Navbar";
import { PageSkeleton, ErrorState } from "@/components/LoadingSkeleton";
import { fetchInsurancePlans } from "@/services/api";
import { useInsurance } from "@/contexts/InsuranceContext";
import { useQuery } from "@tanstack/react-query";
import { Check, Shield, Droplets, Thermometer, Wind, CloudRain } from "lucide-react";

const riskIcons: Record<string, typeof CloudRain> = {
  Rain: CloudRain,
  Flood: Droplets,
  "Extreme Heat": Thermometer,
  Pollution: Wind,
};

const allRisks = ["Rain", "Flood", "Extreme Heat", "Pollution"];

const Insurance = () => {
  const { selectedPlanId, setSelectedPlanId, selectedRisks, setSelectedRisks } = useInsurance();
  const { data: plans, isLoading, isError, refetch } = useQuery({ queryKey: ["insurancePlans"], queryFn: fetchInsurancePlans });

  if (isLoading) return <PageSkeleton />;
  if (isError || !plans) return <ErrorState message="Failed to load insurance plans" onRetry={() => refetch()} />;

  const toggleRisk = (risk: string) => {
    setSelectedRisks((prev) =>
      prev.includes(risk) ? prev.filter((r) => r !== risk) : [...prev, risk]
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-foreground">Insurance Plans</h1>
          <p className="text-sm text-muted-foreground">Choose coverage that fits your needs</p>
        </div>

        {/* Plans */}
        <div className="mb-10 grid gap-6 sm:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => setSelectedPlanId(plan.id)}
              className={`relative cursor-pointer rounded-xl border-2 p-6 shadow-card transition-all hover:shadow-elevated ${
                selectedPlanId === plan.id
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                  Most Popular
                </span>
              )}
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display text-xl font-bold text-foreground">{plan.name}</h3>
              <div className="my-4">
                <span className="font-display text-3xl font-bold text-foreground">₹{plan.weeklyPremium}</span>
                <span className="text-sm text-muted-foreground">/week</span>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Coverage up to <span className="font-semibold text-foreground">₹{plan.coverage.toLocaleString()}</span>
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
                className={`mt-6 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                  selectedPlanId === plan.id
                    ? "gradient-primary text-primary-foreground"
                    : "border border-border bg-secondary text-foreground hover:bg-secondary/80"
                }`}
              >
                {selectedPlanId === plan.id ? "Selected" : "Select Plan"}
              </button>
            </div>
          ))}
        </div>

        {/* Multi-risk selector */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h3 className="mb-4 font-display text-lg font-semibold text-foreground">
            Multi-Risk Coverage
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Select the risks you want to insure against
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            {allRisks.map((risk) => {
              const Icon = riskIcons[risk] || CloudRain;
              const isSelected = selectedRisks.includes(risk);
              return (
                <button
                  key={risk}
                  onClick={() => toggleRisk(risk)}
                  className={`flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    isSelected ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{risk}</p>
                    <p className="text-xs text-muted-foreground">
                      {isSelected ? "Covered" : "Not covered"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Insurance;
