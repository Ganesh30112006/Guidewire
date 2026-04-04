import { useNavigate } from "react-router-dom";
import {
  User, Mail, Phone, MapPin, LogOut,
  Edit2, Check, X, Shield, BadgeCheck,
  Users, FileText, Clock, Star, IndianRupee,
  CheckCircle, XCircle, AlertCircle,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { agentMetrics, mockClaimReviews } from "@/services/api";
import { getInitials } from "@/lib/utils";

const agentProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").trim(),
  phone: z.union([
    z.literal(""),
    z.string().regex(/^(\+?\d{1,3}[\s-]?)?\d{10}$/, "Enter a valid phone number"),
  ]),
  city: z.string(),
});

type AgentProfileFormValues = z.infer<typeof agentProfileSchema>;

const AgentProfile = () => {
  const { user, logout, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AgentProfileFormValues>({
    resolver: zodResolver(agentProfileSchema),
    defaultValues: {
      name: user?.name ?? "",
      phone: user?.phone ?? "",
      city: user?.city ?? "",
    },
  });

  const initials = user?.name ? getInitials(user.name) : "??";

  const inputClass = (hasError: boolean) =>
    `w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 ${
      hasError
        ? "border-destructive focus:border-destructive focus:ring-destructive/20"
        : "border-input focus:border-primary focus:ring-primary/20"
    }`;

  const field = (value: string | undefined, fallback = "Not set") =>
    value ? (
      <span className="text-sm font-medium text-foreground">{value}</span>
    ) : (
      <span className="text-sm text-amber-500 italic">{fallback}</span>
    );

  const onSave = async (data: AgentProfileFormValues) => {
    await updateProfile({
      name: data.name.trim(),
      phone: data.phone || undefined,
      city: data.city.trim() || undefined,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    reset({ name: user?.name ?? "", phone: user?.phone ?? "", city: user?.city ?? "" });
    setEditing(false);
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  // Recent 5 claim decisions (any status)
  const recentDecisions = [...mockClaimReviews].slice(0, 5);

  const statusIcon = (status: string) => {
    if (status === "Approved") return <CheckCircle className="h-3.5 w-3.5 text-success" />;
    if (status === "Rejected") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    return <AlertCircle className="h-3.5 w-3.5 text-warning" />;
  };

  const statusClass = (status: string) =>
    status === "Approved"
      ? "bg-success/10 text-success"
      : status === "Rejected"
      ? "bg-destructive/10 text-destructive"
      : "bg-warning/10 text-warning";

  const performanceMetrics = [
    { label: "Assigned Workers", value: agentMetrics.assignedWorkers, icon: <Users className="h-5 w-5 text-primary" />, color: "text-primary" },
    { label: "Active Policies", value: agentMetrics.activePolicies, icon: <Shield className="h-5 w-5 text-success" />, color: "text-success" },
    { label: "Pending Claims", value: agentMetrics.pendingClaims, icon: <FileText className="h-5 w-5 text-warning" />, color: "text-warning" },
    { label: "Avg. Resolution", value: `${agentMetrics.avgClaimResolutionMins}m`, icon: <Clock className="h-5 w-5 text-blue-500" />, color: "text-blue-500" },
    { label: "Worker Satisfaction", value: `${agentMetrics.workerSatisfaction}%`, icon: <Star className="h-5 w-5 text-amber-500" />, color: "text-amber-500" },
    { label: "Payouts Processed", value: `₹${agentMetrics.totalPayoutsProcessed.toLocaleString()}`, icon: <IndianRupee className="h-5 w-5 text-success" />, color: "text-success" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-foreground">My Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your account information and agent preferences</p>
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
                <p className="text-xs text-muted-foreground">Agent ID</p>
                <p className="font-mono text-sm font-semibold text-primary">{user?.id}</p>
              </div>
              <div className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-blue-500/5 px-3 py-1.5">
                <BadgeCheck className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-semibold text-blue-500">Insurance Agent</span>
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
            {/* Account Details */}
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
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">City</label>
                      <input
                        {...register("city")}
                        className={inputClass(!!errors.city)}
                        placeholder="Mumbai, Delhi…"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      <Check className="h-3.5 w-3.5" /> Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-start gap-3 rounded-lg bg-secondary/30 p-3">
                    <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Email</p>{field(user?.email)}</div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg bg-secondary/30 p-3">
                    <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Phone</p>{field(user?.phone)}</div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg bg-secondary/30 p-3 sm:col-span-2">
                    <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">City</p>{field(user?.city)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Performance Metrics */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 font-display text-base font-semibold text-foreground flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" /> Performance Overview
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {performanceMetrics.map((m) => (
                  <div key={m.label} className="rounded-lg bg-secondary/30 p-3">
                    <div className="mb-1 flex items-center gap-2">{m.icon}</div>
                    <p className={`font-display text-xl font-bold ${m.color}`}>{m.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Decisions */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-4 font-display text-base font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Recent Claim Decisions
              </h3>
              <div className="space-y-2">
                {recentDecisions.map((claim) => (
                  <div
                    key={claim.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <p className="text-sm font-medium text-foreground leading-tight">{claim.workerName}</p>
                        <p className="text-xs text-muted-foreground">{claim.disruptionType} · {claim.lostHours}h</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="hidden text-xs text-muted-foreground sm:block">{claim.date}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(claim.status)}`}
                      >
                        {statusIcon(claim.status)}
                        {claim.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AgentProfile;
