import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { type UserRole } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireAgent?: boolean;
  /** Allow any of these roles (overrides requireAdmin/requireAgent) */
  allowedRoles?: UserRole[];
}

const ProtectedRoute = ({ children, requireAdmin = false, requireAgent = false, allowedRoles }: ProtectedRouteProps) => {
  const { isAuthenticated, isAdmin, isAgent, user, isLoading, homePath } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Role-based access with allowedRoles array
  if (allowedRoles && user) {
    if (!allowedRoles.includes(user.role)) {
      return <Navigate to={homePath} replace />;
    }
    return <>{children}</>;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to={homePath} replace />;
  }

  if (requireAgent && !isAgent) {
    return <Navigate to={homePath} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
