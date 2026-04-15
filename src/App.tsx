import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import AppShell from "./pages/AppShell";
import CreditIntelligence from "./pages/CreditIntelligence";
import FundingMatches from "./pages/FundingMatches";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
const ResetPassword = React.lazy(() => import("./pages/ResetPassword"));
import NotFound from "./pages/NotFound";
import Unsubscribe from "./pages/Unsubscribe";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import { FloatingChatbot } from "./components/FloatingChatbot";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import { DashboardModeProvider } from "./contexts/DashboardModeContext";

// Lazy-load existing dashboard sections for /app/* routes
const DisputesManager = React.lazy(() => import("./components/dashboard/DisputesManager").then(m => ({ default: m.DisputesManager })));
const LearningVault = React.lazy(() => import("./components/dashboard/LearningVault").then(m => ({ default: m.LearningVault })));
const BusinessInfrastructureAssessment = React.lazy(() => import("./components/dashboard/business-profile/BusinessInfrastructureAssessment").then(m => ({ default: m.BusinessInfrastructureAssessment })));
const ProfileSettings = React.lazy(() => import("./components/dashboard/ProfileSettings").then(m => ({ default: m.ProfileSettings })));
const AffiliateTracking = React.lazy(() => import("./components/dashboard/AffiliateTracking").then(m => ({ default: m.AffiliateTracking })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const SuspenseFallback = () => (
  <div className="flex items-center justify-center py-12">
    <div className="animate-pulse text-muted-foreground">Loading...</div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SubscriptionProvider>
        <DashboardModeProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />

            {/* New agent-first dashboard */}
            <Route path="/app" element={<AppShell />}>
              <Route index element={null} />
              <Route path="credit" element={<CreditIntelligence />} />
              <Route path="funding" element={<FundingMatches />} />
              <Route path="disputes" element={
                <React.Suspense fallback={<SuspenseFallback />}>
                  <DisputesManager />
                </React.Suspense>
              } />
              <Route path="learn" element={
                <React.Suspense fallback={<SuspenseFallback />}>
                  <LearningVault />
                </React.Suspense>
              } />
              <Route path="business" element={
                <React.Suspense fallback={<SuspenseFallback />}>
                  <BusinessInfrastructureAssessment />
                </React.Suspense>
              } />
              <Route path="settings" element={
                <React.Suspense fallback={<SuspenseFallback />}>
                  <ProfileSettings />
                </React.Suspense>
              } />
              <Route path="affiliate" element={
                <React.Suspense fallback={<SuspenseFallback />}>
                  <AffiliateTracking />
                </React.Suspense>
              } />
            </Route>

            {/* Backward compat redirect */}
            <Route path="/dashboard" element={<Navigate to="/app" replace />} />

            <Route path="/admin/*" element={<Admin />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <FloatingChatbot />
        </BrowserRouter>
        </DashboardModeProvider>
      </SubscriptionProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
