import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Auto-recover from stale chunk errors after a new deploy.
// When index.html is cached but references hashed JS chunks that no longer
// exist, dynamic imports throw "Failed to fetch dynamically imported module".
// We reload once (guarded by sessionStorage) to pick up the fresh index.html.
const lazyWithReload = <T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) =>
  React.lazy(async () => {
    try {
      return await factory();
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (
        /Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg) &&
        !sessionStorage.getItem("__chunk_reload__")
      ) {
        sessionStorage.setItem("__chunk_reload__", "1");
        window.location.reload();
        // Return a never-resolving promise while the page reloads.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { FloatingChatbot } from "./components/FloatingChatbot";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import { DashboardModeProvider } from "./contexts/DashboardModeContext";
import { useReferralTracking } from "./hooks/useReferralTracking";
import { GlobalAuthSessionManager } from "./lib/auth/GlobalAuthSessionManager";
import { usePageView } from "./hooks/useAnalytics";

// Eagerly load only the public landing + auth pages (likely first-paint)
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Everything else is lazy-loaded for a smaller initial bundle
const Dashboard = lazyWithReload(() => import("./pages/Dashboard"));
const AppShell = lazyWithReload(() => import("./pages/AppShell"));
const CreditIntelligence = lazyWithReload(() => import("./pages/CreditIntelligence"));
const FundingMatches = lazyWithReload(() => import("./pages/FundingMatches"));
const FundingJourney = lazyWithReload(() => import("./pages/FundingJourney"));
const Admin = lazyWithReload(() => import("./pages/Admin"));
const ResetPassword = lazyWithReload(() => import("./pages/ResetPassword"));
const AffiliateApply = lazyWithReload(() => import("./pages/AffiliateApply"));
const BrokerApply = lazyWithReload(() => import("./pages/BrokerApply"));
const BrokerWorkspace = lazyWithReload(() => import("./pages/broker/BrokerWorkspace"));
const BrokerOverview = lazyWithReload(() => import("./pages/broker/BrokerOverview"));
const BrokerClients = lazyWithReload(() => import("./pages/broker/BrokerClients"));
const BrokerSettings = lazyWithReload(() => import("./pages/broker/BrokerSettings"));
const BrokerComingSoon = lazyWithReload(() => import("./pages/broker/BrokerComingSoon"));
const BrokerCommissions = lazyWithReload(() => import("./pages/broker/BrokerCommissions"));
const BrokerMCC = lazyWithReload(() => import("./pages/broker/BrokerMCC"));
const BrokerSessions = lazyWithReload(() => import("./pages/broker/BrokerSessions"));
const BrokerPaigeSession = lazyWithReload(() => import("./pages/broker/BrokerPaigeSession"));
const Unsubscribe = lazyWithReload(() => import("./pages/Unsubscribe"));
const Terms = lazyWithReload(() => import("./pages/Terms"));
const Privacy = lazyWithReload(() => import("./pages/Privacy"));
const About = lazyWithReload(() => import("./pages/About"));
const Blog = lazyWithReload(() => import("./pages/Blog"));

// Lazy-load existing dashboard sections for /app/* routes
const RepositioningNotice = lazyWithReload(() => import("./components/dashboard/RepositioningNotice").then(m => ({ default: m.RepositioningNotice })));
const LearningVault = lazyWithReload(() => import("./components/dashboard/LearningVault").then(m => ({ default: m.LearningVault })));
const CourseViewer = lazyWithReload(() => import("./pages/CourseViewer"));
const BusinessInfrastructureAssessment = lazyWithReload(() => import("./components/dashboard/business-profile/BusinessInfrastructureAssessment").then(m => ({ default: m.BusinessInfrastructureAssessment })));
const ProfileSettings = lazyWithReload(() => import("./components/dashboard/ProfileSettings").then(m => ({ default: m.ProfileSettings })));
const AffiliateTracking = lazyWithReload(() => import("./components/dashboard/AffiliateTracking").then(m => ({ default: m.AffiliateTracking })));

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
  usePageView();
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
              <Route path="funding-journey" element={<PageSuspense><FundingJourney /></PageSuspense>} />
              {/* Legacy dispute routes — repositioned to a notice + CFPB redirect + CSV export */}
              <Route path="disputes" element={<PageSuspense><RepositioningNotice /></PageSuspense>} />
              <Route path="learn" element={<PageSuspense><LearningVault /></PageSuspense>} />
              <Route path="learn/:courseId" element={<PageSuspense><CourseViewer /></PageSuspense>} />
              <Route path="business" element={<PageSuspense><BusinessInfrastructureAssessment /></PageSuspense>} />
              <Route path="business-profile" element={<PageSuspense><BusinessInfrastructureAssessment /></PageSuspense>} />
              <Route path="settings" element={<PageSuspense><ProfileSettings /></PageSuspense>} />
              <Route path="affiliate" element={<PageSuspense><AffiliateTracking /></PageSuspense>} />
            </Route>

            {/* Backward compat redirect */}
            <Route path="/dashboard" element={<Navigate to="/app" replace />} />

            <Route path="/admin/*" element={<PageSuspense><Admin /></PageSuspense>} />
            <Route path="/unsubscribe" element={<PageSuspense><Unsubscribe /></PageSuspense>} />
            <Route path="/terms" element={<PageSuspense><Terms /></PageSuspense>} />
            <Route path="/privacy" element={<PageSuspense><Privacy /></PageSuspense>} />
            <Route path="/about" element={<PageSuspense><About /></PageSuspense>} />
            <Route path="/blog" element={<PageSuspense><Blog /></PageSuspense>} />
            <Route path="/affiliates" element={<PageSuspense><AffiliateApply /></PageSuspense>} />
            <Route path="/become-an-affiliate" element={<Navigate to="/affiliates" replace />} />
            <Route path="/broker" element={<PageSuspense><BrokerApply /></PageSuspense>} />
            <Route path="/brokers" element={<Navigate to="/broker" replace />} />

            {/* Broker workspace (signed-in brokers) */}
            <Route path="/broker/app" element={<PageSuspense><BrokerWorkspace /></PageSuspense>}>
              <Route index element={<PageSuspense><BrokerOverview /></PageSuspense>} />
              <Route path="clients" element={<PageSuspense><BrokerClients /></PageSuspense>} />
              <Route path="sessions" element={<PageSuspense><BrokerSessions /></PageSuspense>} />
              <Route path="sessions/:relationshipId" element={<PageSuspense><BrokerPaigeSession /></PageSuspense>} />
              <Route path="team" element={<PageSuspense><BrokerComingSoon title="Team" description="Invite team members under your broker account. Ships in Phase 2b." /></PageSuspense>} />
              <Route path="commissions" element={<PageSuspense><BrokerCommissions /></PageSuspense>} />
              <Route path="mcc" element={<PageSuspense><BrokerMCC /></PageSuspense>} />
              <Route path="settings" element={<PageSuspense><BrokerSettings /></PageSuspense>} />
            </Route>
            <Route path="/pricing" element={<Navigate to="/#pricing" replace />} />

            {/* Backward-compat: bare /clients links route into the admin workspace */}
            <Route path="/clients" element={<Navigate to="/admin/clients" replace />} />
            <Route path="/clients/user/:userId" element={<Navigate to="/admin/clients" replace />} />
            <Route path="/clients/internal/:clientId" element={<Navigate to="/admin/clients" replace />} />
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
