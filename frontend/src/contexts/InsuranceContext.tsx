import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { type InsurancePlan, getInsurancePlansSnapshot } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

export interface PlanHistoryEntry {
  planId: string;
  planName: string;
  date: string; // ISO string
}

interface InsuranceContextType {
  selectedPlanId: string | null;
  selectedRisks: string[];
  planHistory: PlanHistoryEntry[];
  setSelectedPlanId: (id: string | null) => void;
  setSelectedRisks: React.Dispatch<React.SetStateAction<string[]>>;
  getActivePlan: (plans: InsurancePlan[]) => InsurancePlan | undefined;
  cancelPlan: () => void;
}

const InsuranceContext = createContext<InsuranceContextType | undefined>(undefined);

const INSURANCE_KEY_PREFIX = "giggo_insurance";

export const InsuranceProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  // Scope the storage key to the logged-in user so different users on the same
  // device cannot see each other's plan selections.
  const insuranceKey = user ? `${INSURANCE_KEY_PREFIX}_${user.id}` : null;

  const [selectedPlanId, setSelectedPlanIdState] = useState<string | null>(null);
  const [selectedRisks, setSelectedRisks] = useState<string[]>([]);
  const [planHistory, setPlanHistory] = useState<PlanHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load from user-scoped key whenever the logged-in user changes.
  useEffect(() => {
    if (!insuranceKey) {
      setSelectedPlanIdState(null);
      setSelectedRisks([]);
      setPlanHistory([]);
      setLoaded(false);
      return;
    }
    try {
      const stored = localStorage.getItem(insuranceKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSelectedPlanIdState(parsed.planId ?? null);
        setSelectedRisks(parsed.risks ?? []);
        const raw: PlanHistoryEntry[] = parsed.history ?? [];
        // Trim to 5 most recent and deduplicate consecutive entries
        const deduped = raw.filter((e, i) => i === 0 || e.planId !== raw[i - 1].planId);
        setPlanHistory(deduped.slice(0, 5));
      } else {
        setSelectedPlanIdState(null);
        setSelectedRisks([]);
        setPlanHistory([]);
      }
    } catch (err) {
      console.error("[InsuranceContext] Failed to parse stored insurance data, resetting:", err);
      setSelectedPlanIdState(null);
      setSelectedRisks([]);
      setPlanHistory([]);
    }
    setLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Persist everything to the user-scoped key whenever selection changes.
  // Guard with `loaded` to avoid overwriting the stored data before it has been read.
  useEffect(() => {
    if (insuranceKey && loaded) {
      try {
        localStorage.setItem(
          insuranceKey,
          JSON.stringify({ planId: selectedPlanId, risks: selectedRisks, history: planHistory })
        );
      } catch (err) {
        console.error("[InsuranceContext] Failed to persist insurance data:", err);
      }
    }
  }, [selectedPlanId, selectedRisks, planHistory, insuranceKey, loaded]);

  const setSelectedPlanId = useCallback((id: string | null) => {
    if (id) {
      // Read plans outside the state setter to avoid stale-closure issues.
      const planName = getInsurancePlansSnapshot().find((p) => p.id === id)?.name ?? id;
      setPlanHistory((h) => {
        if (h.length > 0 && h[0].planId === id) return h;
        return [{ planId: id, planName, date: new Date().toISOString() }, ...h].slice(0, 5);
      });
    }
    setSelectedPlanIdState(id);
  }, []);

  const getActivePlan = useCallback(
    (plans: InsurancePlan[]) => plans.find((p) => p.id === selectedPlanId),
    [selectedPlanId]
  );

  const cancelPlan = useCallback(() => {
    setSelectedPlanIdState(null);
    setSelectedRisks([]);
  }, []);

  return (
    <InsuranceContext.Provider
      value={{ selectedPlanId, selectedRisks, planHistory, setSelectedPlanId, setSelectedRisks, getActivePlan, cancelPlan }}
    >
      {children}
    </InsuranceContext.Provider>
  );
};

export const useInsurance = () => {
  const context = useContext(InsuranceContext);
  if (!context) throw new Error("useInsurance must be used within an InsuranceProvider");
  return context;
};
