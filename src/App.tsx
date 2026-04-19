import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { FloatingChatbot } from "./components/FloatingChatbot";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import { DashboardModeProvider } from "./contexts/DashboardModeContext";
import { useReferralTracking } from "./hooks/useReferralTracking";
import { GlobalAuthSessionManager } from "./lib/auth/GlobalAuthSessionManager";

// Eagerly load only the public landing + auth pages (likely first-paint)
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Everything else is lazy-loaded for a smaller initial bundle
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const AppShell = React.lazy(() => import("./pages/AppShell"));
const CreditIntelligence = React.lazy(() => import("./pages/CreditIntelligence"));
const FundingMatches = React.lazy(() => import("./pages/FundingMatches"));
const Admin = React.lazy(() => import("./pages/Admin"));
const ResetPassword = React.lazy(() => import("./pages/ResetPassword"));
const AffiliateApply = React.lazy(() => import("./pages/AffiliateApply"));
const Unsubscribe = React.lazy(() => import("./pages/Unsubscribe"));
const Terms = React.lazy(() => import("./pages/Terms"));
const Privacy = React.lazy(() => import("./pages/Privacy"));

// Lazy-load existing dashboard sections for /app/* routes
const RepositioningNotice = React.lazy(() => import("./components/dashboard/RepositioningNotice").then(m => ({ default: m.RepositioningNotice })));
const LearningVault = React.lazy(() => import("./components/dashboard/LearningVault").then(m => ({ default: m.LearningVault })));
const CourseViewer = React.lazy(() => import("./pages/CourseViewer"));
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

const PageSuspense = ({ children }: { children: React.ReactNode }) => (
  <React.Suspense fallback={<SuspenseFallback />}>{children}</React.Suspense>
);

const AppInner = () => {
  useReferralTracking();
  return <GlobalAuthSessionManager />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SubscriptionProvider>
        <DashboardModeProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppInner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<PageSuspense><ResetPassword /></PageSuspense>} />

            {/* New agent-first dashboard */}
            <Route path="/app" element={<PageSuspense><AppShell /></PageSuspense>}>
              <Route index element={null} />
              <Route path="credit" element={<PageSuspense><CreditIntelligence /></PageSuspense>} />
              <Route path="funding" element={<PageSuspense><FundingMatches /></PageSuspense>} />
              {/* Legacy dispute routes — repositioned to a notice + CFPB redirect + CSV export */}
              <Route path="disputes" element={<PageSuspense><RepositioningNotice /></PageSuspense>} />
              <Route path="learn" element={<PageSuspense><LearningVault /></PageSuspense>} />
              <Route path="learn/:courseId" element={<PageSuspense><CourseViewer /></PageSuspense>} />
              <Route path="business" element={<PageSuspense><BusinessInfrastructureAssessment /></PageSuspense>} />
              <Route path="settings" element={<PageSuspense><ProfileSettings /></PageSuspense>} />
              <Route path="affiliate" element={<PageSuspense><AffiliateTracking /></PageSuspense>} />
            </Route>

            {/* Backward compat redirect */}
            <Route path="/dashboard" element={<Navigate to="/app" replace />} />

            <Route path="/admin/*" element={<PageSuspense><Admin /></PageSuspense>} />
            <Route path="/unsubscribe" element={<PageSuspense><Unsubscribe /></PageSuspense>} />
            <Route path="/terms" element={<PageSuspense><Terms /></PageSuspense>} />
            <Route path="/privacy" element={<PageSuspense><Privacy /></PageSuspense>} />
            <Route path="/affiliates" element={<PageSuspense><AffiliateApply /></PageSuspense>} />
            <Route path="/become-an-affiliate" element={<Navigate to="/affiliates" replace />} />
            <Route path="/pricing" element={<Navigate to="/#pricing" replace />} />
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
