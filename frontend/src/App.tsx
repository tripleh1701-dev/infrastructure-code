import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { EnterpriseProvider } from "@/contexts/EnterpriseContext";
import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { PermissionProvider } from "@/contexts/PermissionContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import OverviewPage from "./pages/OverviewPage";
import DashboardPage from "./pages/DashboardPage";
import PipelinesPage from "./pages/PipelinesPage";
import PipelineCanvasSummaryPage from "./pages/pipelines/PipelineCanvasSummaryPage";
import PipelineCanvasPage from "./pages/pipelines/PipelineCanvasPage";
import BuildsPage from "./pages/BuildsPage";
import AccessControlPage from "./pages/AccessControlPage";
import AccountSettingsPage from "./pages/AccountSettingsPage";
import SecurityPage from "./pages/SecurityPage";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <AccountProvider>
          <EnterpriseProvider>
            <PermissionProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/oauth-callback" element={<OAuthCallbackPage />} />
                  <Route
                    path="/*"
                    element={
                      <ProtectedRoute>
                        <MainLayout>
                          <Routes>
                            <Route path="/" element={<OverviewPage />} />
                            <Route path="/dashboard" element={<DashboardPage />} />
                            <Route path="/pipelines" element={<PipelinesPage />} />
                            <Route path="/pipelines/summary" element={<PipelineCanvasSummaryPage />} />
                            <Route path="/pipelines/canvas" element={<PipelineCanvasPage />} />
                            <Route path="/builds" element={<BuildsPage />} />
                            <Route path="/access-control" element={<AccessControlPage />} />
                            <Route path="/account-settings" element={<AccountSettingsPage />} />
                            <Route path="/security" element={<SecurityPage />} />
                            <Route path="/inbox" element={<OverviewPage />} />
                            <Route path="/monitoring" element={<DashboardPage />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </MainLayout>
                      </ProtectedRoute>
                    }
                  />
                </Routes>
              </TooltipProvider>
            </PermissionProvider>
          </EnterpriseProvider>
        </AccountProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
