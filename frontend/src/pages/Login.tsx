import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Shield, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { useAuth, type UserRole } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const roleHomePath = (role: UserRole): string => {
  switch (role) {
    case "admin": return "/admin";
    case "agent": return "/agent";
    default: return "/dashboard";
  }
};

const Login = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, homePath } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"login" | "forgot" | "sent">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState("");

  const handleForgot = () => {
    setForgotError("");
    if (!forgotEmail.trim() || !/\S+@\S+\.\S+/.test(forgotEmail.trim())) {
      setForgotError("Enter a valid email address");
      return;
    }
    setView("sent");
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  if (isAuthenticated) {
    return <Navigate to={homePath} replace />;
  }

  const onSubmit = async (data: LoginFormValues) => {
    setServerError("");
    setLoading(true);
    await new Promise<void>((r) => setTimeout(r, 400));
    const result = await login(data.email, data.password);
    setLoading(false);
    if (result.success) {
      // Use the role returned by login() to derive the path, avoiding stale homePath.
      navigate(result.role ? roleHomePath(result.role) : homePath);
    } else {
      setServerError(result.error || "Login failed");
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
              GigGo
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
              <span className="font-display text-xl font-bold text-foreground">GigGo</span>
            </div>
            <h1 className="font-display text-3xl font-bold text-foreground">
              {view === "forgot" ? "Reset Password" : view === "sent" ? "Check Your Email" : "Welcome back"}
            </h1>
            <p className="text-muted-foreground">
              {view === "forgot"
                ? "Enter your email and we'll send a reset link."
                : view === "sent"
                ? `A mock reset link was sent to ${forgotEmail}`
                : "Sign in to continue — your role is detected automatically"}
            </p>
          </div>

          {view === "login" && (<>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            {serverError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {serverError}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email address
              </label>
              <input
                id="email"
                type="email"
                {...register("email")}
                className={`w-full rounded-lg border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${
                  errors.email
                    ? "border-destructive focus:border-destructive focus:ring-destructive/20"
                    : "border-input focus:border-primary focus:ring-primary/20"
                }`}
                placeholder="you@example.com"
                autoComplete="email"
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  {...register("password")}
                  className={`w-full rounded-lg border bg-background px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${
                    errors.password
                      ? "border-destructive focus:border-destructive focus:ring-destructive/20"
                      : "border-input focus:border-primary focus:ring-primary/20"
                  }`}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-shadow hover:shadow-elevated disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Signing in..." : "Sign In"}
            </button>
            <div className="text-right">
              <button
                type="button"
                onClick={() => { setView("forgot"); setForgotError(""); setForgotEmail(""); }}
                className="text-xs text-muted-foreground hover:text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            New to GigGo?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>
          </>)}

          {/* Forgot password form */}
          {view === "forgot" && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="forgot-email" className="text-sm font-medium text-foreground">
                  Email address
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => { setForgotEmail(e.target.value); setForgotError(""); }}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                {forgotError && <p className="text-xs text-destructive">{forgotError}</p>}
              </div>
              <button
                type="button"
                onClick={handleForgot}
                className="flex w-full items-center justify-center gap-2 rounded-lg gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-shadow hover:shadow-elevated"
              >
                Send Reset Link
              </button>
              <p className="text-center text-sm text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setView("login")}
                  className="font-medium text-primary hover:underline"
                >
                  Back to Sign In
                </button>
              </p>
            </div>
          )}

          {/* Reset link sent confirmation */}
          {view === "sent" && (
            <div className="flex flex-col items-center gap-5 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-9 w-9 text-success" />
              </div>
              <div>
                <p className="font-display text-xl font-bold text-foreground">Check your email</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We've sent a mock reset link to{" "}
                  <span className="font-medium text-foreground">{forgotEmail}</span>
                </p>
              </div>
              <div className="w-full rounded-lg border border-border bg-secondary/30 px-4 py-3 text-left text-xs text-muted-foreground">
                This is a demo — no real email was sent. In production, check your inbox for the password reset link.
              </div>
              <button
                type="button"
                onClick={() => { setView("login"); setForgotEmail(""); }}
                className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
