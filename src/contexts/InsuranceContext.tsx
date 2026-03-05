import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { type InsurancePlan, insurancePlans as allPlans } from "@/services/api";

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
}

const InsuranceContext = createContext<InsuranceContextType | undefined>(undefined);

const INSURANCE_STORAGE_KEY = "gigshield_insurance";

export const InsuranceProvider = ({ children }: { children: ReactNode }) => {
  // Restore from localStorage if available
  const [selectedPlanId, setSelectedPlanIdState] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(INSURANCE_STORAGE_KEY);
      if (stored) return JSON.parse(stored).planId ?? null;
    } catch { /* ignore */ }
    return null;
  });

  const [selectedRisks, setSelectedRisks] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(INSURANCE_STORAGE_KEY);
      if (stored) return JSON.parse(stored).risks ?? [];
    } catch { /* ignore */ }
    return [];
  });

  const [planHistory, setPlanHistory] = useState<PlanHistoryEntry[]>(() => {
    try {
      const stored = localStorage.getItem(INSURANCE_STORAGE_KEY);
      if (stored) {
        const raw: PlanHistoryEntry[] = JSON.parse(stored).history ?? [];
        // Trim to 5 most recent and deduplicate consecutive entries
        const deduped = raw.filter((e, i) => i === 0 || e.planId !== raw[i - 1].planId);
        return deduped.slice(0, 5);
      }
    } catch { /* ignore */ }
    return [];
  });

  // Persist everything whenever selection changes
  useEffect(() => {
    localStorage.setItem(
      INSURANCE_STORAGE_KEY,
      JSON.stringify({ planId: selectedPlanId, risks: selectedRisks, history: planHistory })
    );
  }, [selectedPlanId, selectedRisks, planHistory]);

  const setSelectedPlanId = useCallback((id: string | null) => {
    setSelectedPlanIdState((prev) => {
      if (id && id !== prev) {
        const planName = allPlans.find((p) => p.id === id)?.name ?? id;
        setPlanHistory((h) => {
          // Skip if last entry is the same plan
          if (h.length > 0 && h[0].planId === id) return h;
          // Keep only the last 5 unique entries
          return [{ planId: id, planName, date: new Date().toISOString() }, ...h].slice(0, 5);
        });
      }
      return id;
    });
  }, []);

  const getActivePlan = useCallback(
    (plans: InsurancePlan[]) => plans.find((p) => p.id === selectedPlanId),
    [selectedPlanId]
  );

  return (
    <InsuranceContext.Provider
      value={{ selectedPlanId, selectedRisks, planHistory, setSelectedPlanId, setSelectedRisks, getActivePlan }}
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
