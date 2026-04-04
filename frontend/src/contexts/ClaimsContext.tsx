import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import {
  type Claim,
  mockClaims,
  calculatePayout,
  connectRealtimeEvents,
  fetchClaims,
  flushOfflineClaimsQueue,
  submitClaimWithProof,
} from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

interface ClaimsContextType {
  claims: Claim[];
  isLoading: boolean;
  /** File a new claim on behalf of the logged-in worker */
  addClaim: (
    disruptionType: "Heavy Rain" | "Extreme Heat" | "Flood" | "Pollution" | "Other",
    lostHours: number,
    proofFile: File
  ) => Promise<void>;
  /** Approve or reject a claim (used by both worker view and agent portal) */
  updateClaimStatus: (id: string, status: "Approved" | "Rejected") => void;
}

const ClaimsContext = createContext<ClaimsContextType | undefined>(undefined);

const CLAIMS_KEY_PREFIX = "giggo_claims";

/**
 * Shared key prefix for agent claim decisions, scoped per worker.
 * When an agent approves/rejects a claim, the decision is written here so
 * it persists after the agent logs out and is applied when the worker next loads.
 */
export const CLAIM_DECISIONS_PREFIX = "giggo_claim_decisions";

/** @deprecated Use CLAIM_DECISIONS_PREFIX instead. Kept for migration only. */
export const CLAIM_DECISIONS_KEY = CLAIM_DECISIONS_PREFIX;

const DEMO_WORKER_IDS = new Set(["WK-1024"]);

const VALID_DECISION_VALUES = new Set(["Approved", "Rejected"] as const);

const claimDecisionsKey = (workerId: string) => `${CLAIM_DECISIONS_PREFIX}_${workerId}`;

const loadDecisions = (workerId: string): Record<string, "Approved" | "Rejected"> => {
  try {
    const raw = JSON.parse(localStorage.getItem(claimDecisionsKey(workerId)) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).filter(
        (entry): entry is [string, "Approved" | "Rejected"] =>
          VALID_DECISION_VALUES.has(entry[1] as "Approved" | "Rejected")
      )
    );
  } catch {
    return {};
  }
};

const applyDecisions = (
  claims: Claim[],
  decisions: Record<string, "Approved" | "Rejected">
): Claim[] =>
  claims.map((c) => {
    const decision = decisions[c.id];
    if (!decision) return c;
    return {
      ...c,
      status: decision,
      payoutAmount:
        decision === "Approved"
          ? calculatePayout(c.lostHours, c.estimatedIncomeLoss / (c.lostHours || 1))
          : 0,
    };
  });

export const ClaimsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const claimsKey = user ? `${CLAIMS_KEY_PREFIX}_${user.id}` : null;

  const [claims, setClaims] = useState<Claim[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Reload whenever the logged-in user changes.
  useEffect(() => {
    if (!user || !claimsKey) {
      setClaims([]);
      setIsLoading(false);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      const decisions = loadDecisions(user.id);

      try {
        const fromApi = await fetchClaims();
        setClaims(applyDecisions(fromApi, decisions));
        setIsLoading(false);
        return;
      } catch {
        // Fall through to local cache / demo data.
      }

      try {
        const stored = localStorage.getItem(claimsKey);
        if (stored) {
          setClaims(applyDecisions(JSON.parse(stored), decisions));
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.error("[ClaimsContext] Failed to parse stored claims, resetting:", err);
      }

      const base = DEMO_WORKER_IDS.has(user.id) ? mockClaims : [];
      setClaims(applyDecisions(base, decisions));
      setIsLoading(false);
    };

    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Persist to user-scoped key whenever claims change.
  useEffect(() => {
    if (claimsKey && !isLoading) {
      try {
        localStorage.setItem(claimsKey, JSON.stringify(claims));
      } catch (err) {
        console.error("[ClaimsContext] Failed to persist claims:", err);
      }
    }
  }, [claims, claimsKey, isLoading]);

  useEffect(() => {
    if (!user) return;

    const syncQueuedClaims = async () => {
      const synced = await flushOfflineClaimsQueue();
      if (synced.length === 0) return;
      setClaims((prev) => {
        const nonQueued = prev.filter((c) => !c.isOfflineQueued);
        return [...synced, ...nonQueued];
      });
    };

    void syncQueuedClaims();
    const onOnline = () => {
      void syncQueuedClaims();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const disconnect = connectRealtimeEvents(async (event) => {
      if (!["claim.created", "claim.reviewed", "proof.processed"].includes(event.type)) return;
      try {
        const decisions = loadDecisions(user.id);
        const latest = await fetchClaims();
        setClaims(applyDecisions(latest, decisions));
      } catch {
        // Keep current state if refresh fails.
      }
    });
    return () => {
      disconnect();
    };
  }, [user]);

  const addClaim = async (
    disruptionType: "Heavy Rain" | "Extreme Heat" | "Flood" | "Pollution" | "Other",
    lostHours: number,
    proofFile: File
  ) => {
    const newClaim = await submitClaimWithProof({ disruptionType, lostHours, proofFile });
    setClaims((prev) => [newClaim, ...prev]);
  };

  const updateClaimStatus = (id: string, status: "Approved" | "Rejected") => {
    if (!user) return;
    // Persist decision to user-scoped key so it survives across sessions.
    const decisions = loadDecisions(user.id);
    decisions[id] = status;
    try {
      localStorage.setItem(claimDecisionsKey(user.id), JSON.stringify(decisions));
    } catch (err) {
      console.error("[ClaimsContext] Failed to persist claim decisions:", err);
    }

    setClaims((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const avgHourly = c.estimatedIncomeLoss / (c.lostHours || 1);
        const payoutAmount = status === "Approved" ? calculatePayout(c.lostHours, avgHourly) : 0;
        return { ...c, status, payoutAmount };
      })
    );
  };

  return (
    <ClaimsContext.Provider value={{ claims, isLoading, addClaim, updateClaimStatus }}>
      {children}
    </ClaimsContext.Provider>
  );
};

export const useClaims = () => {
  const ctx = useContext(ClaimsContext);
  if (!ctx) throw new Error("useClaims must be used within ClaimsProvider");
  return ctx;
};
