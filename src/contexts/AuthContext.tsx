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
  login: (email: string, password: string) => { success: boolean; error?: string };
  register: (data: RegisterData) => { success: boolean; error?: string };
  logout: () => void;
  updateProfile: (data: Partial<Pick<AuthUser, "name" | "phone" | "city" | "platform" | "avgDailyIncome">>) => void;
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

const STORAGE_KEY = "gigshield_auth_user";

// Mock credentials for demo
const DEMO_ACCOUNTS: Record<string, { password: string; user: AuthUser }> = {
  "worker@demo.ai": {
    password: "demo123",
    user: { id: "WK-1024", name: "Rahul Kumar", email: "worker@demo.ai", role: "worker", phone: "+91 98765 43210", city: "Mumbai", platform: "Zomato", avgDailyIncome: 850 },
  },
  "agent@demo.ai": {
    password: "demo123",
    user: { id: "AGT-001", name: "Priya Sharma", email: "agent@demo.ai", role: "agent" },
  },
  "admin@demo.ai": {
    password: "demo123",
    user: { id: "ADM-001", name: "Admin User", email: "admin@demo.ai", role: "admin" },
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
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = (email: string, password: string): { success: boolean; error?: string } => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) return { success: false, error: "Email is required" };
    if (!trimmedPassword) return { success: false, error: "Password is required" };
    if (trimmedPassword.length < 6) return { success: false, error: "Password must be at least 6 characters" };

    const account = DEMO_ACCOUNTS[trimmedEmail];

    // Known demo account: validate password, then sign in with the account's role
    if (account) {
      if (account.password !== trimmedPassword) {
        return { success: false, error: "Incorrect password. Please try again." };
      }
      setUser(account.user);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(account.user));
      return { success: true };
    }

    // Unknown email: create a new gig-worker account (demo mode)
    const demoUser: AuthUser = {
      id: "WK-" + Math.floor(1000 + Math.random() * 9000),
      name: trimmedEmail.split("@")[0],
      email: trimmedEmail,
      role: "worker",
      // No profile fields yet — profile completeness will prompt user to fill them
    };
    setUser(demoUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demoUser));
    return { success: true };
  };

  const updateProfile = (data: Partial<Pick<AuthUser, "name" | "phone" | "city" | "platform" | "avgDailyIncome">>) => {
    if (!user) return;
    const trimmedName = data.name?.trim();
    if (trimmedName !== undefined && trimmedName.length < 2) return;
    const updated = { ...user, ...data, ...(trimmedName ? { name: trimmedName } : {}) };
    setUser(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const register = (data: RegisterData): { success: boolean; error?: string } => {
    if (!data.name.trim()) return { success: false, error: "Name is required" };
    if (!data.phone.trim()) return { success: false, error: "Phone is required" };
    if (!/^(\+?\d{1,3}[\s-]?)?\d{10}$/.test(data.phone.replace(/\s/g, "")))
      return { success: false, error: "Enter a valid 10-digit phone number" };
    if (!data.email.trim()) return { success: false, error: "Email is required" };
    if (!/\S+@\S+\.\S+/.test(data.email)) return { success: false, error: "Invalid email format" };

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
      id: "WK-" + Math.floor(1000 + Math.random() * 9000),
      name: data.name,
      email: data.email,
      role: "worker",
      phone: data.phone,
      city: data.city,
      platform: data.platform,
      avgDailyIncome: Number(data.avgDailyIncome),
    };
    setUser(newUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    return { success: true };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const currentRole = user?.role ?? "worker";

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: currentRole === "admin",
        isAgent: currentRole === "agent",
        isWorker: currentRole === "worker",
        isLoading,
        login,
        register,
        logout,
        updateProfile,
        homePath: roleHomePath(currentRole),
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
