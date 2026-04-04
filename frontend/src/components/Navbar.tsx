import { Link, useLocation, useNavigate } from "react-router-dom";
import { Shield, Menu, X, LogOut, User, Bell } from "lucide-react";
import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import ThemeToggle from "@/components/ThemeToggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getInitials } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fetchLiveAlerts } from "@/services/weather";

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, isAgent, isWorker, logout, homePath } = useAuth();
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const selectedCity = user?.city?.trim() || undefined;

  const { data: alerts } = useQuery({
    queryKey: ["alerts", selectedCity ?? "default"],
    queryFn: () => fetchLiveAlerts(selectedCity),
    staleTime: 1000 * 60 * 10,
  });
  const alertCount = alerts?.length ?? 0;

  // Role-differentiated navigation — workers use t() so labels switch with language
  const navItems = useMemo(() => isAdmin
    ? [
        { path: "/admin", label: "Dashboard" },
        { path: "/analytics", label: "Analytics" },
        { path: "/alerts", label: "Alerts" },
      ]
    : isAgent
    ? [
        { path: "/agent", label: "Portal" },
        { path: "/alerts", label: "Alerts" },
        { path: "/analytics", label: "Analytics" },
      ]
    : [
        { path: "/dashboard", label: t("nav.dashboard") },
        { path: "/insurance", label: t("nav.insurance") },
        { path: "/claims", label: t("nav.claims") },
        { path: "/alerts", label: t("nav.alerts") },
        { path: "/analytics", label: t("nav.analytics") },
      ], [isAdmin, isAgent, t]);

  const profilePath = isWorker ? "/profile" : isAgent ? "/agent/profile" : "/admin/profile";

  const initials = user?.name ? getInitials(user.name) : "??";

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <>
      {/* Skip-to-content link — visible only on keyboard focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>
    <nav aria-label="Main navigation" className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to={homePath} aria-label="GigGo — home" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-primary">
            <Shield className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
          </div>
          <span className="font-display text-xl font-bold text-foreground">
            GigGo
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex" role="list">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              role="listitem"
              aria-current={location.pathname === item.path ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                location.pathname === item.path
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate("/alerts")}
                aria-label={`Alerts${alertCount > 0 ? ` (${alertCount} active)` : ""}`}
                className="relative rounded-md p-1.5 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {alertCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-[9px] font-bold text-black">
                    {alertCount > 9 ? "9+" : alertCount}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {alertCount > 0 ? `${alertCount} active alert${alertCount !== 1 ? "s" : ""}` : "No active alerts"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to={profilePath}
                aria-label={`View profile for ${user?.name ?? "user"}`}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
              >
                {initials}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("nav.profile")}</TooltipContent>
          </Tooltip>
          <button
            onClick={handleLogout}
            aria-label={t("nav.signOut")}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          className="rounded-md p-2 text-foreground transition-colors hover:bg-secondary md:hidden"
        >
          {mobileOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div id="mobile-menu" className="border-t border-border bg-card px-4 pb-4 pt-2 md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              aria-current={location.pathname === item.path ? "page" : undefined}
              className={`block rounded-md px-3 py-3 text-sm font-medium transition-colors ${
                location.pathname === item.path
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={() => { navigate("/alerts"); setMobileOpen(false); }}
                aria-label={`Alerts${alertCount > 0 ? ` (${alertCount} active)` : ""}`}
                className="relative rounded-md p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {alertCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-[9px] font-bold text-black">
                    {alertCount > 9 ? "9+" : alertCount}
                  </span>
                )}
              </button>
              <Link
                to={profilePath}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                <User className="h-4 w-4" aria-hidden="true" /> {t("nav.profile")}
              </Link>
            </div>
            <button
              onClick={handleLogout}
              aria-label={t("nav.signOut")}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" /> {t("nav.signOut")}
            </button>
          </div>
        </div>
      )}
    </nav>
    </>
  );
};

export default Navbar;
