import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { type Claim, mockClaims, calculatePayout, WORK_HOURS_PER_DAY } from "@/services/api";

interface ClaimsContextType {
  claims: Claim[];
  isLoading: boolean;
  /** For demo: toggle a pending claim to approved/rejected and update payout */
  updateClaimStatus: (id: string, status: "Approved" | "Rejected") => void;
}

const ClaimsContext = createContext<ClaimsContextType | undefined>(undefined);

const CLAIMS_KEY = "gigshield_claims";

const loadClaims = (): Claim[] => {
  try {
    const stored = localStorage.getItem(CLAIMS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return mockClaims;
};

export const ClaimsProvider = ({ children }: { children: ReactNode }) => {
  const [claims, setClaims] = useState<Claim[]>(loadClaims);
  const [isLoading] = useState(false);

  // Persist whenever claims change
  useEffect(() => {
    localStorage.setItem(CLAIMS_KEY, JSON.stringify(claims));
  }, [claims]);

  const updateClaimStatus = (id: string, status: "Approved" | "Rejected") => {
    setClaims((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const avgHourly = c.estimatedIncomeLoss / (c.lostHours || 1);
        const payoutAmount =
          status === "Approved"
            ? calculatePayout(c.lostHours, avgHourly)
            : 0;
        return { ...c, status, payoutAmount };
      })
    );
  };

  return (
    <ClaimsContext.Provider value={{ claims, isLoading, updateClaimStatus }}>
      {children}
    </ClaimsContext.Provider>
  );
};

export const useClaims = () => {
  const ctx = useContext(ClaimsContext);
  if (!ctx) throw new Error("useClaims must be used within ClaimsProvider");
  return ctx;
};
