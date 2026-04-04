import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { InsuranceProvider } from "@/contexts/InsuranceContext";
import { ClaimsProvider } from "@/contexts/ClaimsContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ProtectedRoute from "@/components/ProtectedRoute";
import { PageSkeleton } from "@/components/LoadingSkeleton";
import { toast } from "sonner";

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Insurance = lazy(() => import("./pages/Insurance"));
const Claims = lazy(() => import("./pages/Claims"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Analytics = lazy(() => import("./pages/Analytics"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AgentDashboard = lazy(() => import("./pages/AgentDashboard"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const AgentProfile = lazy(() => import("./pages/AgentProfile"));
const AdminProfile = lazy(() => import("./pages/AdminProfile"));
const NotFound = lazy(() => import("./pages/NotFound"));

const onQueryError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  toast.error("Data fetch failed", { description: message });
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onQueryError }),
  mutationCache: new MutationCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : "An unexpected error occurred";
      toast.error("Operation failed", { description: message });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 20,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <InsuranceProvider>
            <ClaimsProvider>
              <TooltipProvider>
                <Sonner />
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <Suspense fallback={<PageSkeleton />}>
                    <Routes>
                      <Route path="/" element={<Login />} />
                      <Route path="/register" element={<Register />} />
                      {/* Worker routes */}
                      <Route path="/dashboard" element={<ProtectedRoute allowedRoles={["worker"]}><Dashboard /></ProtectedRoute>} />
                      <Route path="/insurance" element={<ProtectedRoute allowedRoles={["worker"]}><Insurance /></ProtectedRoute>} />
                      <Route path="/claims" element={<ProtectedRoute allowedRoles={["worker"]}><Claims /></ProtectedRoute>} />
                      <Route path="/profile" element={<ProtectedRoute allowedRoles={["worker"]}><UserProfile /></ProtectedRoute>} />
                      {/* Shared routes (worker + agent + admin) */}
                      <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
                      <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
                      {/* Agent routes */}
                      <Route path="/agent" element={<ProtectedRoute requireAgent><AgentDashboard /></ProtectedRoute>} />
                      <Route path="/agent/profile" element={<ProtectedRoute requireAgent><AgentProfile /></ProtectedRoute>} />
                      {/* Admin routes */}
                      <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />
                      <Route path="/admin/profile" element={<ProtectedRoute requireAdmin><AdminProfile /></ProtectedRoute>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </BrowserRouter>
              </TooltipProvider>
            </ClaimsProvider>
          </InsuranceProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
