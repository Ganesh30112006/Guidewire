import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type UserRole = "worker" | "agent" | "admin";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  city?: string;
  platform?: string;
  avgDailyIncome?: number;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isWorker: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; role?: UserRole }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string; loggedIn?: boolean; role?: UserRole }>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  updateProfile: (data: Partial<Pick<AuthUser, "name" | "phone" | "city" | "platform" | "avgDailyIncome">>) => Promise<void>;
  changePassword: (oldPwd: string, newPwd: string) => Promise<{ success: boolean; error?: string }>;
  /** Returns the home path for the current user's role */
  homePath: string;
}

interface RegisterData {
  name: string;
  phone: string;
  email: string;
  city: string;
  platform: string;
  avgDailyIncome: string;
  password: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Keep only non-sensitive profile cache in localStorage.
 * Session tokens are handled via secure cookies from the backend.
 */
const STORAGE_KEY = "giggo_auth_user";
const PASSWORDS_KEY = "giggo_passwords";
const VALID_ROLES: readonly UserRole[] = ["worker", "agent", "admin"];
const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "";
const API_BASE_URL = RAW_API_BASE_URL
  ? (() => {
      const trimmed = RAW_API_BASE_URL.replace(/\/+$/, "");
      return /\/api\/v\d+$/i.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
    })()
  : "";
const backendEnabled = API_BASE_URL.length > 0;

const clearGigGoStorage = () => {
  try {
    const keysToRemove = Object.keys(localStorage).filter((key) => key.startsWith("giggo_"));
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (err) {
    console.error("[AuthContext] localStorage cleanup failed:", err);
  }
};

/** Safely persist to localStorage, logging on failure instead of crashing. */
const safeSetStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.error("[AuthContext] localStorage write failed:", err);
  }
};

/** Load user-set passwords (overrides for demo accounts and custom registrations). */
const loadPasswords = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(PASSWORDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const savePassword = (email: string, password: string) => {
  const passwords = loadPasswords();
  passwords[email.toLowerCase()] = password;
  safeSetStorage(PASSWORDS_KEY, JSON.stringify(passwords));
};

const getPassword = (email: string): string | undefined => {
  return loadPasswords()[email.toLowerCase()];
};

type BackendWorkerProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  city?: string | null;
  platform?: string | null;
  avg_daily_income?: number | null;
};

const toRole = (role: string): UserRole => {
  if (role === "admin" || role === "agent" || role === "worker") return role;
  return "worker";
};

const toAuthUser = (profile: BackendWorkerProfile): AuthUser => ({
  id: profile.id,
  name: profile.name,
  email: profile.email,
  role: toRole(profile.role),
  phone: profile.phone ?? undefined,
  city: profile.city ?? undefined,
  platform: profile.platform ?? undefined,
  avgDailyIncome: profile.avg_daily_income ?? undefined,
});

class AuthRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
  }
}

async function authRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const csrfToken = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("csrf_token="))
    ?.split("=")[1];
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-CSRF-Token", decodeURIComponent(csrfToken));
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      const backendDetail = body?.detail;
      if (typeof backendDetail === "string") {
        detail = backendDetail;
      } else if (Array.isArray(backendDetail)) {
        detail = backendDetail
          .map((entry) => {
            if (typeof entry === "string") return entry;
            if (entry && typeof entry === "object") {
              const item = entry as { msg?: unknown };
              return typeof item.msg === "string" ? item.msg : JSON.stringify(entry);
            }
            return String(entry);
          })
          .join("; ");
      } else if (backendDetail && typeof backendDetail === "object") {
        detail = JSON.stringify(backendDetail);
      }
    } catch {
      // Keep fallback detail.
    }
    throw new AuthRequestError(response.status, detail);
  }

  return (await response.json()) as T;
}

/** Validate that a parsed value is a well-formed AuthUser before trusting it. */
function isValidAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
  const u = value as Record<string, unknown>;
  return (
    typeof u.id === "string" &&
    typeof u.name === "string" &&
    typeof u.email === "string" &&
    VALID_ROLES.includes(u.role as UserRole)
  );
}

// Local fallback credentials when backend API is not configured.
const DEMO_ACCOUNTS: Record<string, { password: string; user: AuthUser }> = {
  "chowdryganesh659@gmail.com": {
    password: "Ganesh@2006",
    user: { id: "ADM-001", name: "Ganesh", email: "chowdryganesh659@gmail.com", role: "admin" },
  },
  "chowdaryganesh659@gmail.com": {
    password: "Ganesh@2006",
    user: { id: "ADM-001", name: "Ganesh", email: "chowdaryganesh659@gmail.com", role: "admin" },
  },
};

const roleHomePath = (role: UserRole): string => {
  switch (role) {
    case "admin": return "/admin";
    case "agent": return "/agent";
    default: return "/dashboard";
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const boot = async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed: unknown = JSON.parse(stored);
          if (isValidAuthUser(parsed)) {
            setUser(parsed);
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      if (backendEnabled) {
        try {
          const profile = await authRequest<BackendWorkerProfile>("/workers/me");
          const backendUser = toAuthUser(profile);
          setUser(backendUser);
          safeSetStorage(STORAGE_KEY, JSON.stringify(backendUser));
        } catch (err) {
          const shouldClearSession =
            err instanceof AuthRequestError && (err.status === 401 || err.status === 403);

          if (shouldClearSession) {
            // Session cookie is missing/expired: clear cached user to avoid stale authenticated UI.
            clearGigGoStorage();
            setUser(null);
          } else {
            // Transient backend/network issue: keep locally cached user so refresh doesn't wipe app state.
            console.warn("[AuthContext] Session rehydrate skipped due to transient API error", err);
          }
        }
      }

      setIsLoading(false);
    };

    void boot();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string; role?: UserRole }> => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) return { success: false, error: "Email is required" };
    if (!trimmedPassword) return { success: false, error: "Password is required" };
    if (trimmedPassword.length < 6) return { success: false, error: "Password must be at least 6 characters" };

    if (backendEnabled) {
      try {
        await authRequest<{ access_token: string }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
        });

        const profile = await authRequest<BackendWorkerProfile>("/workers/me");
        const backendUser = toAuthUser(profile);
        setUser(backendUser);
        safeSetStorage(STORAGE_KEY, JSON.stringify(backendUser));
        return { success: true, role: backendUser.role };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Login failed" };
      }
    }

    const account = DEMO_ACCOUNTS[trimmedEmail];
    const userSetPassword = getPassword(trimmedEmail);

    // Known demo account: validate against user-changed password or fallback to demo default
    if (account) {
      const expectedPassword = userSetPassword ?? account.password;
      if (expectedPassword !== trimmedPassword) {
        return { success: false, error: "Incorrect password. Please try again." };
      }
      setUser(account.user);
      safeSetStorage(STORAGE_KEY, JSON.stringify(account.user));
      return { success: true, role: account.user.role };
    }

    // Unknown email: create a new gig-worker account (demo mode)
    const demoUser: AuthUser = {
      id: "WK-" + crypto.randomUUID().slice(0, 8),
      name: trimmedEmail.split("@")[0],
      email: trimmedEmail,
      role: "worker",
      // No profile fields yet — profile completeness will prompt user to fill them
    };
    setUser(demoUser);
    safeSetStorage(STORAGE_KEY, JSON.stringify(demoUser));
    return { success: true, role: demoUser.role };
  };

  const updateProfile = async (data: Partial<Pick<AuthUser, "name" | "phone" | "city" | "platform" | "avgDailyIncome">>) => {
    if (!user) return;

    if (backendEnabled) {
      try {
        const payload: Record<string, unknown> = {};
        if (data.name !== undefined) payload.name = data.name;
        if (data.phone !== undefined) payload.phone = data.phone;
        if (data.city !== undefined) payload.city = data.city;
        if (data.platform !== undefined) payload.platform = data.platform;
        if (data.avgDailyIncome !== undefined) payload.avg_daily_income = data.avgDailyIncome;

        const profile = await authRequest<BackendWorkerProfile>("/workers/me", {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        const backendUser = toAuthUser(profile);
        setUser(backendUser);
        safeSetStorage(STORAGE_KEY, JSON.stringify(backendUser));
        return;
      } catch (err) {
        console.error("[AuthContext] profile update failed:", err);
        // Do not apply local fallback updates when backend is enabled, otherwise
        // UI state can diverge from server state.
        return;
      }
    }

    const trimmedName = data.name?.trim();
    // Only skip the name field if invalid — don't discard the entire update.
    const nameUpdate = (trimmedName !== undefined && trimmedName.length >= 2) ? { name: trimmedName } : {};
    const updated = { ...user, ...data, ...nameUpdate };
    setUser(updated);
    safeSetStorage(STORAGE_KEY, JSON.stringify(updated));
  };

  const register = async (data: RegisterData): Promise<{ success: boolean; error?: string; loggedIn?: boolean; role?: UserRole }> => {
    if (!data.name.trim()) return { success: false, error: "Name is required" };
    if (!data.phone.trim()) return { success: false, error: "Phone is required" };
    if (!/^(\+?\d{1,3}[\s-]?)?\d{10}$/.test(data.phone.replace(/\s/g, "")))
      return { success: false, error: "Enter a valid 10-digit phone number" };
    if (!data.email.trim()) return { success: false, error: "Email is required" };
    if (!/\S+@\S+\.\S+/.test(data.email)) return { success: false, error: "Invalid email format" };

    if (backendEnabled) {
      try {
        await authRequest<{ message: string }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: data.name.trim(),
            phone: data.phone.trim(),
            email: data.email.trim().toLowerCase(),
            city: data.city.trim(),
            platform: data.platform,
            avg_daily_income: Number(data.avgDailyIncome),
            password: data.password,
          }),
        });

        const loginResult = await login(data.email, data.password);
        if (loginResult.success) {
          return { success: true, loggedIn: true, role: loginResult.role };
        }

        // Registration succeeded but auto-login failed (transient network/session issue).
        // Return success so the UI can redirect to manual login without suggesting retry register.
        return { success: true, loggedIn: false, error: "Account created. Please sign in." };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Registration failed" };
      }
    }

    // Prevent registering with a demo account email
    if (DEMO_ACCOUNTS[data.email.toLowerCase()]) {
      return { success: false, error: "An account with this email already exists" };
    }

    if (!data.city.trim()) return { success: false, error: "City is required" };
    if (!data.platform) return { success: false, error: "Please select a platform" };
    if (!data.avgDailyIncome) return { success: false, error: "Average daily income is required" };

    const income = Number(data.avgDailyIncome);
    if (isNaN(income) || income <= 0) return { success: false, error: "Daily income must be a positive number" };
    if (income > 100000) return { success: false, error: "Please enter a realistic daily income" };

    if (!data.password.trim()) return { success: false, error: "Password is required" };
    if (data.password.length < 6) return { success: false, error: "Password must be at least 6 characters" };

    const newUser: AuthUser = {
      id: "WK-" + crypto.randomUUID().slice(0, 8),
      name: data.name,
      email: data.email,
      role: "worker",
      phone: data.phone,
      city: data.city,
      platform: data.platform,
      avgDailyIncome: Number(data.avgDailyIncome),
    };
    setUser(newUser);
    safeSetStorage(STORAGE_KEY, JSON.stringify(newUser));
    return { success: true, loggedIn: true, role: newUser.role };
  };

  const logout = async () => {
    if (backendEnabled) {
      try {
        await authRequest<{ ok: boolean; message: string }>("/auth/logout", {
          method: "POST",
        });
      } catch {
        // Local cleanup still proceeds.
      }
    }

    setUser(null);
    clearGigGoStorage();
  };

  const deleteAccount = async (): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: "Not authenticated" };

    if (backendEnabled) {
      try {
        await authRequest<{ ok: boolean; message: string }>("/workers/me", {
          method: "DELETE",
        });
        setUser(null);
        clearGigGoStorage();
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Account deletion failed" };
      }
    }

    setUser(null);
    clearGigGoStorage();
    return { success: true };
  };

  const changePassword = async (oldPwd: string, newPwd: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: "Not authenticated" };

    if (backendEnabled) {
      try {
        await authRequest<{ ok: boolean; message: string }>("/auth/change-password", {
          method: "POST",
          body: JSON.stringify({ current_password: oldPwd.trim(), new_password: newPwd.trim() }),
        });
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Password change failed" };
      }
    }

    if (!oldPwd.trim() || oldPwd.trim().length < 6)
      return { success: false, error: "Current password must be at least 6 characters" };
    const account = DEMO_ACCOUNTS[user.email.toLowerCase()];
    const currentPassword = getPassword(user.email) ?? account?.password;
    if (currentPassword && currentPassword !== oldPwd.trim())
      return { success: false, error: "Current password is incorrect" };
    if (!newPwd.trim() || newPwd.trim().length < 6)
      return { success: false, error: "New password must be at least 6 characters" };
    if (newPwd.trim() === oldPwd.trim())
      return { success: false, error: "New password must be different from your current password" };
    savePassword(user.email, newPwd.trim());
    return { success: true };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === "admin",
        isAgent: user?.role === "agent",
        isWorker: user?.role === "worker",
        isLoading,
        login,
        register,
        logout,
        deleteAccount,
        updateProfile,
        changePassword,
        homePath: roleHomePath(user?.role ?? "worker"),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
