import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Shield, Loader2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const platforms = ["Zomato", "Swiggy", "Dunzo", "Blinkit", "Zepto", "Other"];

const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    phone: z
      .string()
      .min(1, "Phone is required")
      .regex(/^(\+?\d{1,3}[\s-]?)?\d{10}$/, "Enter a valid 10-digit phone number"),
    email: z.string().min(1, "Email is required").email("Enter a valid email address"),
    city: z.string().min(1, "City is required"),
    platform: z.string().min(1, "Please select a delivery platform"),
    avgDailyIncome: z
      .string()
      .min(1, "Daily income is required")
      .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Enter a positive number")
      .refine((v) => Number(v) <= 100000, "Enter a realistic income (max ₹1,00,000)"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&_#\-])[A-Za-z\d@$!%*?&_#\-]{8,72}$/,
        "Use uppercase, lowercase, number, and special character"
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

const Register = () => {
  const navigate = useNavigate();
  const { register: authRegister, isAuthenticated, homePath } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { platform: "" },
  });

  const watchedPlatform = watch("platform");

  if (isAuthenticated) {
    return <Navigate to={homePath} replace />;
  }

  const onSubmit = async (data: RegisterFormValues) => {
    setServerError("");
    setLoading(true);
    await new Promise<void>((r) => setTimeout(r, 400));
    const result = await authRegister({
      name: data.name,
      phone: data.phone,
      email: data.email,
      city: data.city,
      platform: data.platform,
      avgDailyIncome: data.avgDailyIncome,
      password: data.password,
    });
    setLoading(false);
    if (result.success) {
      if (result.loggedIn) {
        navigate(homePath);
      } else {
        navigate("/");
      }
    } else {
      setServerError(result.error || "Registration failed");
    }
  };

  const inputClass = (hasError: boolean) =>
    `w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${
      hasError
        ? "border-destructive focus:border-destructive focus:ring-destructive/20"
        : "border-input focus:border-primary focus:ring-primary/20"
    }`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg space-y-8">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl gradient-primary">
            <Shield className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">Create your account</h1>
          <p className="text-muted-foreground">Join GigGo and protect your earnings</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {serverError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                { label: "Full Name", field: "name" as const, placeholder: "Rahul Kumar", type: "text" },
                { label: "Phone", field: "phone" as const, placeholder: "+91 98765 43210", type: "tel" },
                { label: "Email", field: "email" as const, placeholder: "rahul@email.com", type: "email" },
                { label: "City", field: "city" as const, placeholder: "Mumbai", type: "text" },
              ]
            ).map((input) => (
              <div key={input.field} className="space-y-1.5">
                <label htmlFor={input.field} className="text-sm font-medium text-foreground">
                  {input.label}
                </label>
                <input
                  id={input.field}
                  type={input.type}
                  {...register(input.field)}
                  className={inputClass(!!errors[input.field])}
                  placeholder={input.placeholder}
                />
                {errors[input.field] && (
                  <p className="text-xs text-destructive">{errors[input.field]?.message}</p>
                )}
              </div>
            ))}
          </div>

          {/* Platform chip selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Delivery Platform</label>
            <div className="flex flex-wrap gap-2">
              {platforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setValue("platform", p, { shouldValidate: true })}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                    watchedPlatform === p
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            {errors.platform && (
              <p className="text-xs text-destructive">{errors.platform.message}</p>
            )}
          </div>

          {/* Daily income */}
          <div className="space-y-1.5">
            <label htmlFor="avgDailyIncome" className="text-sm font-medium text-foreground">
              Avg Daily Income (₹)
            </label>
            <input
              id="avgDailyIncome"
              type="number"
              {...register("avgDailyIncome")}
              className={inputClass(!!errors.avgDailyIncome)}
              placeholder="850"
              min={0}
            />
            {errors.avgDailyIncome && (
              <p className="text-xs text-destructive">{errors.avgDailyIncome.message}</p>
            )}
          </div>

          {/* Passwords */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  {...register("password")}
                  className={inputClass(!!errors.password) + " pr-10"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  {...register("confirmPassword")}
                  className={inputClass(!!errors.confirmPassword) + " pr-10"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-shadow hover:shadow-elevated disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
