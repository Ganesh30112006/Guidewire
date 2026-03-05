import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { InsuranceProvider } from "@/contexts/InsuranceContext";
import { ClaimsProvider } from "@/contexts/ClaimsContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Insurance from "./pages/Insurance";
import Claims from "./pages/Claims";
import Alerts from "./pages/Alerts";
import Analytics from "./pages/Analytics";
import AdminDashboard from "./pages/AdminDashboard";
import AgentDashboard from "./pages/AgentDashboard";
import UserProfile from "./pages/UserProfile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InsuranceProvider>
          <ClaimsProvider>
            <TooltipProvider>
              <Sonner />
              <BrowserRouter>
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
                {/* Agent route */}
                <Route path="/agent" element={<ProtectedRoute requireAgent><AgentDashboard /></ProtectedRoute>} />
                {/* Admin route */}
                <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </ClaimsProvider>
        </InsuranceProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
