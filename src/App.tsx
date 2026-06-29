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
import { MetaPixel } from "./components/seo/MetaPixel";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import { DashboardModeProvider } from "./contexts/DashboardModeContext";
import { BusinessProvider } from "./contexts/BusinessContext";
import { useReferralTracking } from "./hooks/useReferralTracking";
import { GlobalAuthSessionManager } from "./lib/auth/GlobalAuthSessionManager";
import { usePageView } from "./hooks/useAnalytics";

// Eagerly load only the public landing + auth pages (likely first-paint)
import Index from "./pages/Index";
import Auth from "./pages/Auth";
const PublicSignup = lazyWithReload(() => import("./pages/PublicSignup"));
const SignupCoachQualify = lazyWithReload(() => import("./pages/SignupCoachQualify"));
const McpAuthorize = lazyWithReload(() => import("./pages/McpAuthorize"));
const JoinWorkspace = lazyWithReload(() => import("./pages/JoinWorkspace"));
const TenantStorefront = lazyWithReload(() => import("./pages/public/TenantStorefront"));
import NotFound from "./pages/NotFound";

// Everything else is lazy-loaded for a smaller initial bundle
const Dashboard = lazyWithReload(() => import("./pages/Dashboard"));
const AppShell = lazyWithReload(() => import("./pages/AppShell"));
const CreditIntelligence = lazyWithReload(() => import("./pages/CreditIntelligence"));
const FundingMatches = lazyWithReload(() => import("./pages/FundingMatches"));
const FundingJourney = lazyWithReload(() => import("./pages/FundingJourney"));
const FinancialProfile = lazyWithReload(() => import("./pages/FinancialProfile"));
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
const BrokerTeam = lazyWithReload(() => import("./pages/broker/BrokerTeam"));
const AcceptBrokerInvite = lazyWithReload(() => import("./pages/broker/AcceptBrokerInvite"));
const Unsubscribe = lazyWithReload(() => import("./pages/Unsubscribe"));
const Terms = lazyWithReload(() => import("./pages/Terms"));
const Privacy = lazyWithReload(() => import("./pages/Privacy"));
const About = lazyWithReload(() => import("./pages/About"));
const Blog = lazyWithReload(() => import("./pages/Blog"));

// BTF Client Workspace (white-labeled — no Paige branding in these routes)
const WorkspaceLayout = lazyWithReload(() => import("./pages/workspace/WorkspaceLayout"));
const WorkspaceDashboard = lazyWithReload(() => import("./pages/workspace/WorkspaceDashboard"));
const WorkspacePhases = lazyWithReload(() => import("./pages/workspace/WorkspacePhases"));
const WorkspaceIntake = lazyWithReload(() => import("./pages/workspace/WorkspaceIntake"));
const WorkspaceDocuments = lazyWithReload(() => import("./pages/workspace/WorkspaceDocuments"));
const WorkspaceMessages = lazyWithReload(() => import("./pages/workspace/WorkspaceMessages"));
const WorkspacePayments = lazyWithReload(() => import("./pages/workspace/WorkspacePayments"));
const WorkspaceTasks = lazyWithReload(() => import("./pages/workspace/WorkspaceTasks"));
const WorkspaceFundingReadiness = lazyWithReload(() => import("./pages/workspace/WorkspaceFundingReadiness"));
const WorkspaceAcceptInvite = lazyWithReload(() => import("./pages/workspace/AcceptInvite"));
const OnboardLayout = lazyWithReload(() => import("./pages/onboard/OnboardLayout"));
const OnboardStep1 = lazyWithReload(() => import("./pages/onboard/Step1Welcome"));
const OnboardStep2 = lazyWithReload(() => import("./pages/onboard/Step2Agreement"));
const OnboardStep3 = lazyWithReload(() => import("./pages/onboard/Step3Payment"));
const OnboardStep4 = lazyWithReload(() => import("./pages/onboard/Step4Intake"));
const OnboardStep5 = lazyWithReload(() => import("./pages/onboard/Step5Documents"));
const OnboardStep6 = lazyWithReload(() => import("./pages/onboard/Step6Complete"));
const AcceptInvite = lazyWithReload(() => import("./pages/AcceptInvite"));

// Lazy-load existing dashboard sections for /app/* routes
const RepositioningNotice = lazyWithReload(() => import("./components/dashboard/RepositioningNotice").then(m => ({ default: m.RepositioningNotice })));
const LearningVault = lazyWithReload(() => import("./components/dashboard/LearningVault").then(m => ({ default: m.LearningVault })));
const CourseViewer = lazyWithReload(() => import("./pages/CourseViewer"));
const BusinessInfrastructureAssessment = lazyWithReload(() => import("./components/dashboard/business-profile/BusinessInfrastructureAssessment").then(m => ({ default: m.BusinessInfrastructureAssessment })));
const ProfileSettings = lazyWithReload(() => import("./components/dashboard/ProfileSettings").then(m => ({ default: m.ProfileSettings })));
const AffiliateTracking = lazyWithReload(() => import("./components/dashboard/AffiliateTracking").then(m => ({ default: m.AffiliateTracking })));
const Support = lazyWithReload(() => import("./pages/Support"));
const ClientApprovals = lazyWithReload(() => import("./pages/ClientApprovals"));
const WorkspaceApprovals = lazyWithReload(() => import("./pages/workspace/WorkspaceApprovals"));

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
        <BusinessProvider>
        <DashboardModeProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppInner />
          <MetaPixel />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/signup" element={<PageSuspense><PublicSignup /></PageSuspense>} />
            <Route path="/signup/coach-qualify" element={<PageSuspense><SignupCoachQualify /></PageSuspense>} />
            <Route path="/reset-password" element={<PageSuspense><ResetPassword /></PageSuspense>} />
            <Route path="/accept-invite" element={<PageSuspense><AcceptInvite /></PageSuspense>} />
            <Route path="/join/:token" element={<PageSuspense><JoinWorkspace /></PageSuspense>} />
            <Route path="/mcp/authorize" element={<PageSuspense><McpAuthorize /></PageSuspense>} />

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
              <Route path="financial-profile" element={<PageSuspense><FinancialProfile /></PageSuspense>} />
              <Route path="support" element={<PageSuspense><Support /></PageSuspense>} />
              <Route path="settings" element={<PageSuspense><ProfileSettings /></PageSuspense>} />
              <Route path="affiliate" element={<PageSuspense><AffiliateTracking /></PageSuspense>} />
              <Route path="approvals" element={<PageSuspense><ClientApprovals /></PageSuspense>} />
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
            <Route path="/broker/accept-invite" element={<PageSuspense><AcceptBrokerInvite /></PageSuspense>} />

            {/* Public tenant storefront */}
            <Route path="/store/:slug" element={<PageSuspense><TenantStorefront /></PageSuspense>} />

            {/* BTF Client Workspace (white-labeled — Mogul Maker Academy) */}
            <Route path="/workspace/accept-invite" element={<PageSuspense><WorkspaceAcceptInvite /></PageSuspense>} />
            <Route path="/workspace" element={<PageSuspense><WorkspaceLayout /></PageSuspense>}>
              <Route index element={<PageSuspense><WorkspaceDashboard /></PageSuspense>} />
              <Route path="phases" element={<PageSuspense><WorkspacePhases /></PageSuspense>} />
              <Route path="intake" element={<PageSuspense><WorkspaceIntake /></PageSuspense>} />
              <Route path="documents" element={<PageSuspense><WorkspaceDocuments /></PageSuspense>} />
              <Route path="messages" element={<PageSuspense><WorkspaceMessages /></PageSuspense>} />
              <Route path="payments" element={<PageSuspense><WorkspacePayments /></PageSuspense>} />
              <Route path="tasks" element={<PageSuspense><WorkspaceTasks /></PageSuspense>} />
              <Route path="funding-readiness" element={<PageSuspense><WorkspaceFundingReadiness /></PageSuspense>} />
              <Route path="approvals" element={<PageSuspense><WorkspaceApprovals /></PageSuspense>} />
            </Route>

            {/* BTF Onboarding Wizard — admin-triggered, magic-link entry */}
            <Route path="/onboard" element={<PageSuspense><OnboardLayout /></PageSuspense>}>
              <Route index element={<PageSuspense><OnboardStep1 /></PageSuspense>} />
              <Route path="welcome" element={<PageSuspense><OnboardStep1 /></PageSuspense>} />
              <Route path="agreement" element={<PageSuspense><OnboardStep2 /></PageSuspense>} />
              <Route path="payment" element={<PageSuspense><OnboardStep3 /></PageSuspense>} />
              <Route path="intake" element={<PageSuspense><OnboardStep4 /></PageSuspense>} />
              <Route path="documents" element={<PageSuspense><OnboardStep5 /></PageSuspense>} />
              <Route path="complete" element={<PageSuspense><OnboardStep6 /></PageSuspense>} />
            </Route>

            {/* Broker workspace (signed-in brokers) */}
            <Route path="/broker/app" element={<PageSuspense><BrokerWorkspace /></PageSuspense>}>
              <Route index element={<PageSuspense><BrokerOverview /></PageSuspense>} />
              <Route path="clients" element={<PageSuspense><BrokerClients /></PageSuspense>} />
              <Route path="sessions" element={<PageSuspense><BrokerSessions /></PageSuspense>} />
              <Route path="sessions/:relationshipId" element={<PageSuspense><BrokerPaigeSession /></PageSuspense>} />
              <Route path="team" element={<PageSuspense><BrokerTeam /></PageSuspense>} />
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
        </BusinessProvider>
      </SubscriptionProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
