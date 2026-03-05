import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const Login = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, homePath } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={homePath} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    const result = login(form.email, form.password);
    setLoading(false);
    if (result.success) {
      navigate(homePath);
    } else {
      setError(result.error || "Login failed");
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel */}
      <div className="hidden w-1/2 items-center justify-center gradient-hero lg:flex">
        <div className="max-w-md space-y-6 px-12">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary">
              <Shield className="h-7 w-7 text-primary-foreground" />
            </div>
            <span className="font-display text-3xl font-bold text-primary-foreground">
              GigShield AI
            </span>
          </div>
          <h2 className="font-display text-2xl font-semibold text-primary-foreground/90">
            AI-powered insurance for gig delivery workers
          </h2>
          <p className="text-primary-foreground/60 leading-relaxed">
            Protect your income from weather disruptions with smart parametric insurance. Instant claims, transparent pricing, real-time alerts.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { label: "Partners Protected", value: "2,800+" },
              { label: "Claims Processed", value: "12,000+" },
              { label: "Avg Payout Time", value: "<2 min" },
              { label: "Coverage Types", value: "4" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 p-3">
                <p className="font-display text-xl font-bold text-primary-foreground">{stat.value}</p>
                <p className="text-xs text-primary-foreground/50">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex w-full items-center justify-center px-6 lg:w-1/2">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-bold text-foreground">GigShield AI</span>
            </div>
            <h1 className="font-display text-3xl font-bold text-foreground">Welcome back</h1>
            <p className="text-muted-foreground">Sign in to continue — your role is detected automatically</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email address</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-shadow hover:shadow-elevated disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* Demo credentials hint */}
          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
            <p className="text-xs font-medium text-muted-foreground mb-2">Demo Credentials</p>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              {[
                { role: "Partner", user: "worker@demo.ai", pass: "demo123" },
                { role: "Agent", user: "agent@demo.ai", pass: "demo123" },
                { role: "Admin", user: "admin@demo.ai", pass: "demo123" },
              ].map(({ role, user, pass }) => (
                <div key={role} className="rounded border border-border bg-background px-2 py-1.5 space-y-0.5">
                  <p className="font-semibold text-foreground">{role}</p>
                  <p className="text-muted-foreground"><span className="text-foreground/60">user:</span> {user}</p>
                  <p className="text-muted-foreground"><span className="text-foreground/60">pass:</span> {pass}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            New to GigShield?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
