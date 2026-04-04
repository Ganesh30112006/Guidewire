import { useNavigate } from "react-router-dom";
import {
  User, Mail, Phone, MapPin, Bike, Shield, LogOut,
  Edit2, Check, X, FileText, CheckCircle, Clock, XCircle,
  IndianRupee, BadgeCheck, History, TrendingUp, Settings, Lock,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useInsurance } from "@/contexts/InsuranceContext";
import { useClaims } from "@/contexts/ClaimsContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getInitials } from "@/lib/utils";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { fetchWorkerRetention } from "@/services/api";

const PLATFORMS = ["Zomato", "Swiggy", "Dunzo", "Blinkit", "Zepto", "Other"];

const LANGUAGES = [
  { code: "en", label: "EN", fullLabel: "English" },
  { code: "hi", label: "हि", fullLabel: "हिंदी" },
] as const;

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").trim(),
  phone: z.union([
    z.literal(""),
    z.string().regex(/^(\+?\d{1,3}[\s-]?)?\d{10}$/, "Enter a valid phone number"),
  ]),
  city: z.string(),
  platform: z.string(),
  avgDailyIncome: z.union([
    z.literal(""),
    z
      .string()
      .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Enter a positive number")
      .refine((v) => Number(v) <= 100000, "Enter a realistic amount (max ₹1,00,000)"),
  ]),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const UserProfile = () => {
  const { user, logout, updateProfile, changePassword } = useAuth();
  const { selectedPlanId, selectedRisks, planHistory, cancelPlan } = useInsurance();
  const { claims } = useClaims();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      city: user?.city ?? "",
      avgDailyIncome: String(user?.avgDailyIncome ?? ""),
      platform: user?.platform ?? "",
    },
  });

  const watchedPlatform = watch("platform");
  const { data: retention } = useQuery({ queryKey: ["workerRetention"], queryFn: fetchWorkerRetention });

  // Claims stats
  const claimStats = {
    total: claims.length,
    approved: claims.filter((c) => c.status === "Approved").length,
    pending: claims.filter((c) => c.status === "Pending").length,
    rejected: claims.filter((c) => c.status === "Rejected").length,
    totalPayout: claims
      .filter((c) => c.status === "Approved")
      .reduce((s, c) => s + c.payoutAmount, 0),
  };

  // Profile completeness
  const completenessItems = [
    { label: "Full name", done: (user?.name ?? "").trim().includes(" ") },
    { label: "Phone number", done: !!user?.phone },
    { label: "City", done: !!user?.city },
    { label: "Platform", done: !!user?.platform },
    { label: "Daily income", done: !!user?.avgDailyIncome },
    { label: "Insurance plan", done: !!selectedPlanId },
    { label: "Risk selection", done: selectedRisks.length > 0 },
  ];
  const completenessScore = Math.round(
    (completenessItems.filter((i) => i.done).length / completenessItems.length) * 100
  );

  const initials = user?.name ? getInitials(user.name) : "??";

  const handleChangePassword = async () => {
    setPwdMsg(null);
    if (newPwd !== confirmPwd) {
      setPwdMsg({ type: "error", text: "New passwords don't match" });
      return;
    }
    const result = await changePassword(oldPwd, newPwd);
    if (result.success) {
      setPwdMsg({ type: "success", text: "Password changed successfully!" });
      setOldPwd(""); setNewPwd(""); setConfirmPwd("");
      setTimeout(() => { setPwdOpen(false); setPwdMsg(null); }, 2000);
    } else {
      setPwdMsg({ type: "error", text: result.error ?? "Failed to change password" });
    }
  };

  const onSave = async (data: ProfileFormValues) => {
    await updateProfile({
      name: data.name.trim(),
      phone: data.phone || undefined,
      city: data.city.trim() || undefined,
      platform: data.platform || undefined,
      avgDailyIncome: data.avgDailyIncome ? Number(data.avgDailyIncome) : undefined,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    reset({
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      city: user?.city ?? "",
      avgDailyIncome: String(user?.avgDailyIncome ?? ""),
      platform: user?.platform ?? "",
    });
    setEditing(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const field = (label: string, value: string | undefined) =>
    value ? (
      <span className="text-sm font-medium text-foreground">{value}</span>
    ) : (
      <span className="text-sm text-amber-500 italic">Not set</span>
    );

  const inputClass = (hasError: boolean) =>
    `w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 ${
      hasError
        ? "border-destructive focus:border-destructive focus:ring-destructive/20"
        : "border-input focus:border-primary focus:ring-primary/20"
    }`;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-foreground">{t("profile.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("profile.subtitle")}</p>
        </div>

        {/* Profile Completeness */}
        <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground">{t("profile.completeness")}</span>
            </div>
            <span className={`text-sm font-bold ${completenessScore === 100 ? "text-success" : completenessScore >= 60 ? "text-warning" : "text-destructive"}`}>
              {completenessScore}%
            </span>
          </div>
          <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all ${completenessScore === 100 ? "bg-success" : completenessScore >= 60 ? "bg-warning" : "bg-destructive"}`}
              style={{ width: `${completenessScore}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {completenessItems.map((item) => (
              <span
                key={item.label}
                className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${item.done ? "bg-success/10 text-success" : "bg-amber-500/10 text-amber-600"}`}
              >
                {item.done ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {item.label}
              </span>
            ))}
          </div>
        </div>

        {retention && (
          <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">Retention & Loyalty Insights</span>
              </div>
              <span className="text-sm font-bold text-primary">{retention.loyaltyScore.toFixed(1)}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Loyalty Score</p>
                <p className="font-display text-xl font-bold text-primary">{retention.loyaltyScore.toFixed(1)}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Consistency</p>
                <p className="font-display text-xl font-bold text-success">{retention.claimConsistencyScore.toFixed(1)}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Tenure</p>
                <p className="font-display text-xl font-bold text-foreground">{retention.tenureDays}d</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Policy Status</p>
                <p className={`font-display text-xl font-bold ${retention.activePolicy ? "text-success" : "text-warning"}`}>
                  {retention.activePolicy ? "Active" : "Inactive"}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left — avatar + logout */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-6 shadow-card text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-3xl font-bold text-primary">
                {initials}
              </div>
              <h2 className="font-display text-xl font-bold text-foreground">{user?.name}</h2>
              <p className="text-sm text-muted-foreground mb-4">{user?.email}</p>
              <div className="mt-1 rounded-lg bg-primary/5 px-3 py-2">
                <p className="text-xs text-muted-foreground">Member ID</p>
                <p className="font-mono text-sm font-semibold text-primary">{user?.id}</p>
              </div>
              <div className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-primary/5 px-3 py-1.5">
                <BadgeCheck className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-primary">Delivery Partner</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" /> {t("common.signOut")}
            </button>
          </div>

          {/* Right */}
          <div className="space-y-4 lg:col-span-2">
            {/* Account Details / Edit */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" /> {t("profile.accountDetails")}
                </h3>
                {!editing && (
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Edit2 className="h-3 w-3" /> {t("profile.editProfile")}
                  </button>
                )}
              </div>

              {editing ? (
                <form onSubmit={handleSubmit(onSave)} noValidate className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Full Name *</label>
                      <input
                        {...register("name")}
                        className={inputClass(!!errors.name)}
                        placeholder="Your full name"
                      />
                      {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Phone Number</label>
                      <input
                        {...register("phone")}
                        className={inputClass(!!errors.phone)}
                        placeholder="+91 XXXXX XXXXX"
                      />
                      {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone.message}</p>}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">City</label>
                      <input
                        {...register("city")}
                        className={inputClass(!!errors.city)}
                        placeholder="Mumbai, Delhi…"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Avg. Daily Income (₹)</label>
                      <input
                        type="number"
                        {...register("avgDailyIncome")}
                        className={inputClass(!!errors.avgDailyIncome)}
                        placeholder="e.g. 850"
                        min={0}
                      />
                      {errors.avgDailyIncome && (
                        <p className="mt-1 text-xs text-destructive">{errors.avgDailyIncome.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-medium text-muted-foreground">Platform</label>
                    <div className="flex flex-wrap gap-2">
                      {PLATFORMS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setValue("platform", p, { shouldValidate: true })}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            watchedPlatform === p
                              ? "bg-primary text-primary-foreground"
                              : "border border-border bg-secondary text-muted-foreground hover:border-primary hover:text-primary"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      <Check className="h-3.5 w-3.5" /> {t("profile.saveChanges")}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" /> {t("profile.cancel")}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-start gap-3 rounded-lg bg-secondary/30 p-3">
                    <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Email</p>{field("Email", user?.email)}</div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg bg-secondary/30 p-3">
                    <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Phone</p>{field("Phone", user?.phone)}</div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg bg-secondary/30 p-3">
                    <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">City</p>{field("City", user?.city)}</div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg bg-secondary/30 p-3">
                    <Bike className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Platform</p>{field("Platform", user?.platform)}</div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg bg-secondary/30 p-3">
                    <IndianRupee className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Avg. Daily Income</p>
                      {user?.avgDailyIncome ? (
                        <span className="text-sm font-medium text-foreground">₹{user.avgDailyIncome}</span>
                      ) : (
                        <span className="text-sm text-amber-500 italic">Not set</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg bg-secondary/30 p-3">
                    <Shield className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">Insurance Plan</p>
                      {selectedPlanId ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-success capitalize">{selectedPlanId} — Active</span>
                          <button
                            onClick={() => { cancelPlan(); toast.success("Insurance plan cancelled"); }}
                            className="shrink-0 text-xs text-destructive hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-amber-500 italic">No plan selected</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Plan History */}
            {planHistory.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <h3 className="mb-3 font-display text-base font-semibold text-foreground flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" /> {t("profile.planHistory")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {planHistory.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="text-xs font-medium text-foreground">{entry.planName}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Claims Summary */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 font-display text-base font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> {t("profile.claimsSummary")}
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-secondary/30 p-3 text-center">
                  <p className="font-display text-2xl font-bold text-foreground">{claimStats.total}</p>
                  <p className="text-xs text-muted-foreground">{t("claims.total")}</p>
                </div>
                <div className="rounded-lg bg-success/5 p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <CheckCircle className="h-3.5 w-3.5 text-success" />
                    <p className="font-display text-2xl font-bold text-success">{claimStats.approved}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("claims.approved")}</p>
                </div>
                <div className="rounded-lg bg-warning/5 p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Clock className="h-3.5 w-3.5 text-warning" />
                    <p className="font-display text-2xl font-bold text-warning">{claimStats.pending}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("claims.pending")}</p>
                </div>
                <div className="rounded-lg bg-destructive/5 p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                    <p className="font-display text-2xl font-bold text-destructive">{claimStats.rejected}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("claims.rejected")}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg border border-success/20 bg-success/5 px-4 py-3">
                <span className="text-sm text-muted-foreground">{t("profile.totalPayouts")}</span>
                <span className="font-display text-lg font-bold text-success">₹{claimStats.totalPayout.toLocaleString()}</span>
              </div>
            </div>

            {/* Settings & Preferences */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 font-display text-base font-semibold text-foreground flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" /> {t("profile.settings")}
              </h3>
              <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("profile.language")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("profile.languageHint")}</p>
                </div>
                <div
                  className="flex items-center gap-1 rounded-lg border border-border bg-background p-1"
                  role="group"
                  aria-label="Language selector"
                >
                  {LANGUAGES.map(({ code, label, fullLabel }) => (
                    <button
                      key={code}
                      onClick={() => i18n.changeLanguage(code)}
                      aria-label={`Switch to ${fullLabel}`}
                      aria-pressed={i18n.language === code}
                      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                        i18n.language === code
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Change Password */}
              <div className="mt-3 rounded-lg bg-secondary/30 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Change Password</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Update your account password</p>
                  </div>
                  <button
                    onClick={() => { setPwdOpen((o) => !o); setPwdMsg(null); }}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Lock className="h-3.5 w-3.5" /> {pwdOpen ? "Cancel" : "Change"}
                  </button>
                </div>
                {pwdOpen && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Current Password</label>
                      <input
                        type="password"
                        value={oldPwd}
                        onChange={(e) => setOldPwd(e.target.value)}
                        placeholder="Current password"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">New Password</label>
                      <input
                        type="password"
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        placeholder="New password (min 6 chars)"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPwd}
                        onChange={(e) => setConfirmPwd(e.target.value)}
                        placeholder="Confirm new password"
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    {pwdMsg && (
                      <p className={`rounded-lg border px-3 py-2 text-xs ${
                        pwdMsg.type === "success"
                          ? "border-success/30 bg-success/5 text-success"
                          : "border-destructive/30 bg-destructive/5 text-destructive"
                      }`}>
                        {pwdMsg.text}
                      </p>
                    )}
                    <button
                      onClick={handleChangePassword}
                      className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Update Password
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default UserProfile;
