import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User, Mail, Phone, MapPin, Bike, Shield, LogOut,
  Edit2, Check, X, FileText, CheckCircle, Clock, XCircle,
  IndianRupee, BadgeCheck, History, TrendingUp,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useInsurance } from "@/contexts/InsuranceContext";
import { useClaims } from "@/contexts/ClaimsContext";

const PLATFORMS = ["Zomato", "Swiggy", "Dunzo", "Blinkit", "Zepto", "Other"];

const UserProfile = () => {
  const { user, logout, updateProfile } = useAuth();
  const { selectedPlanId, selectedRisks, planHistory } = useInsurance();
  const { claims } = useClaims();
  const navigate = useNavigate();

  // Edit state
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: user?.name ?? "",
    phone: user?.phone ?? "",
    city: user?.city ?? "",
    avgDailyIncome: String(user?.avgDailyIncome ?? ""),
    platform: user?.platform ?? "",
  });
  const [saveError, setSaveError] = useState("");

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

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  const handleSave = () => {
    const trimmed = form.name.trim();
    if (!trimmed || trimmed.length < 2) {
      setSaveError("Name must be at least 2 characters");
      return;
    }
    updateProfile({
      name: trimmed,
      phone: form.phone.trim() || undefined,
      city: form.city.trim() || undefined,
      platform: form.platform || undefined,
      avgDailyIncome: form.avgDailyIncome ? Number(form.avgDailyIncome) : undefined,
    });
    setSaveError("");
    setEditing(false);
  };

  const handleCancel = () => {
    setForm({
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      city: user?.city ?? "",
      avgDailyIncome: String(user?.avgDailyIncome ?? ""),
      platform: user?.platform ?? "",
    });
    setSaveError("");
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-foreground">My Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your account information and preferences</p>
        </div>

        {/* Profile Completeness */}
        <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground">Profile Completeness</span>
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
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>

          {/* Right */}
          <div className="space-y-4 lg:col-span-2">
            {/* Account Details / Edit */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" /> Account Details
                </h3>
                {!editing && (
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Edit2 className="h-3 w-3" /> Edit Profile
                  </button>
                )}
              </div>

              {editing ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Full Name *</label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Your full name"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Phone Number</label>
                      <input
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="+91 XXXXX XXXXX"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">City</label>
                      <input
                        value={form.city}
                        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Mumbai, Delhi…"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Avg. Daily Income (₹)</label>
                      <input
                        type="number"
                        value={form.avgDailyIncome}
                        onChange={(e) => setForm((f) => ({ ...f, avgDailyIncome: e.target.value }))}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="e.g. 850"
                        min={0}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-muted-foreground">Platform</label>
                    <div className="flex flex-wrap gap-2">
                      {PLATFORMS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, platform: p }))}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${form.platform === p ? "bg-primary text-primary-foreground" : "border border-border bg-secondary text-muted-foreground hover:border-primary hover:text-primary"}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  {saveError && <p className="text-xs text-destructive">{saveError}</p>}
                  <div className="flex gap-2">
                    <button onClick={handleSave} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                      <Check className="h-3.5 w-3.5" /> Save Changes
                    </button>
                    <button onClick={handleCancel} className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                  </div>
                </div>
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
                    <div>
                      <p className="text-xs text-muted-foreground">Insurance Plan</p>
                      {selectedPlanId ? (
                        <span className="text-sm font-medium text-success capitalize">{selectedPlanId} — Active</span>
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
                  <History className="h-4 w-4 text-primary" /> Plan History
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
                <FileText className="h-4 w-4 text-primary" /> Claims Summary
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-secondary/30 p-3 text-center">
                  <p className="font-display text-2xl font-bold text-foreground">{claimStats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="rounded-lg bg-success/5 p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <CheckCircle className="h-3.5 w-3.5 text-success" />
                    <p className="font-display text-2xl font-bold text-success">{claimStats.approved}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </div>
                <div className="rounded-lg bg-warning/5 p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Clock className="h-3.5 w-3.5 text-warning" />
                    <p className="font-display text-2xl font-bold text-warning">{claimStats.pending}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
                <div className="rounded-lg bg-destructive/5 p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                    <p className="font-display text-2xl font-bold text-destructive">{claimStats.rejected}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Rejected</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg border border-success/20 bg-success/5 px-4 py-3">
                <span className="text-sm text-muted-foreground">Total Payouts Received</span>
                <span className="font-display text-lg font-bold text-success">₹{claimStats.totalPayout.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default UserProfile;
