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
      const mod = await factory();
      try { sessionStorage.removeItem("__chunk_reload__"); } catch {}
      return mod;
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (
        /Failed to fetch dynamically imported module|Importing a module script failed|Unexpected end of input|ChunkLoadError|Loading chunk/i.test(msg) &&
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
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
// Vercel Speed Insights — Core Web Vitals from real visitors. This is a Vite +
// React SPA, so we use the framework-agnostic /react entry (NOT /next).
import { SpeedInsights } from "@vercel/speed-insights/react";
import { FloatingChatbot } from "./components/FloatingChatbot";
import { MetaPixel } from "./components/seo/MetaPixel";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import { DashboardModeProvider } from "./contexts/DashboardModeContext";
import { RoleLensProvider } from "./contexts/RoleLensContext";
import { BusinessProvider } from "./contexts/BusinessContext";
import { ImpersonationProvider } from "./contexts/ImpersonationContext";
import { ClientOnlyRouteGuard } from "./components/auth/ClientOnlyRouteGuard";
import { useHostRouting } from "./lib/hostRouting";
import { useReferralTracking } from "./hooks/useReferralTracking";
import { GlobalAuthSessionManager } from "./lib/auth/GlobalAuthSessionManager";
import { usePageView } from "./hooks/useAnalytics";

// Eagerly load only the public landing + auth pages (likely first-paint)
import Index from "./pages/Index";
import Auth from "./pages/Auth";
const OperatorLogin = lazyWithReload(() => import("./pages/OperatorLogin"));
const JoinPlatform = lazyWithReload(() => import("./pages/JoinPlatform"));
const BookingPage = lazyWithReload(() => import("./pages/BookingPage"));
const ManageBooking = lazyWithReload(() => import("./pages/ManageBooking"));
const PaigeHome = lazyWithReload(() => import("./pages/PaigeHome"));
const PremiumHero = lazyWithReload(() => import("./pages/PremiumHero"));
const PublicSignup = lazyWithReload(() => import("./pages/PublicSignup"));
const Onboarding = lazyWithReload(() => import("./pages/Onboarding"));
const SignupCoachQualify = lazyWithReload(() => import("./pages/SignupCoachQualify"));
const McpAuthorize = lazyWithReload(() => import("./pages/McpAuthorize"));
const JoinWorkspace = lazyWithReload(() => import("./pages/JoinWorkspace"));
const PortalGateway = lazyWithReload(() => import("./pages/PortalGateway"));
const TenantStorefront = lazyWithReload(() => import("./pages/public/TenantStorefront"));
const GrowthPageRenderer = lazyWithReload(() => import("./pages/public/GrowthPageRenderer"));
const GrowthFormRenderer = lazyWithReload(() => import("./pages/public/GrowthFormRenderer"));
const GrowthFunnelRenderer = lazyWithReload(() => import("./pages/public/GrowthFunnelRenderer"));
import NotFound from "./pages/NotFound";

// Everything else is lazy-loaded for a smaller initial bundle
const Dashboard = lazyWithReload(() => import("./pages/Dashboard"));
const AppShell = lazyWithReload(() => import("./pages/AppShell"));
const CreditIntelligence = lazyWithReload(() => import("./pages/CreditIntelligence"));
const FundingMatches = lazyWithReload(() => import("./pages/FundingMatches"));
const FundingJourney = lazyWithReload(() => import("./pages/FundingJourney"));
const FinancialProfile = lazyWithReload(() => import("./pages/FinancialProfile"));
const Admin = lazyWithReload(() => import("./pages/Admin"));
// Agency Operator side (§9) — its own top-level shell, peer to the God console,
// gated on server-proven agency-manager eligibility inside AgencyLayout.
const AgencyLayout = lazyWithReload(() => import("./components/admin/AgencyLayout"));
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
const LegalDoc = lazyWithReload(() => import("./pages/LegalDoc"));
const About = lazyWithReload(() => import("./pages/About"));
const Pricing = lazyWithReload(() => import("./pages/Pricing"));
const Blog = lazyWithReload(() => import("./pages/Blog"));

// BTF workspace surface removed — consumer /app dashboard is the single client home. (Sprint 211.b cleanup)
const OnboardLayout = lazyWithReload(() => import("./pages/onboard/OnboardLayout"));
const OnboardStep1 = lazyWithReload(() => import("./pages/onboard/Step1Welcome"));
const OnboardStep2 = lazyWithReload(() => import("./pages/onboard/Step2Agreement"));
// Onboarding is now two gates (welcome + agreement); everything past agreement
// happens inside /workspace under Paige. The old Step3-6 (payment/intake/docs/
// complete) were dead — OnboardLayout aliases those paths to /app so they never
// rendered — and carried hardcoded §2 funding content. Removed in the final
// wiring audit. If a paid-onboarding step returns, build it Playbook-driven.
const AcceptInvite = lazyWithReload(() => import("./pages/AcceptInvite"));

// Lazy-load existing dashboard sections for /app/* routes
const RepositioningNotice = lazyWithReload(() => import("./components/dashboard/RepositioningNotice").then(m => ({ default: m.RepositioningNotice })));
const LearningVault = lazyWithReload(() => import("./components/dashboard/LearningVault").then(m => ({ default: m.LearningVault })));
const CourseViewer = lazyWithReload(() => import("./pages/CourseViewer"));
const BusinessInfrastructureAssessment = lazyWithReload(() => import("./components/dashboard/business-profile/BusinessInfrastructureAssessment").then(m => ({ default: m.BusinessInfrastructureAssessment })));
const ProfileSettings = lazyWithReload(() => import("./components/dashboard/ProfileSettings").then(m => ({ default: m.ProfileSettings })));
const AffiliateTracking = lazyWithReload(() => import("./components/dashboard/AffiliateTracking").then(m => ({ default: m.AffiliateTracking })));
const Support = lazyWithReload(() => import("./pages/Support"));
const MyAgreements = lazyWithReload(() => import("./pages/MyAgreements"));
const ClientApprovals = lazyWithReload(() => import("./pages/ClientApprovals"));
const ActionItems = lazyWithReload(() => import("./pages/app/ActionItems"));
const Planning = lazyWithReload(() => import("./pages/app/Planning"));
const GoogleCalendarCallback = lazyWithReload(() => import("./pages/GoogleCalendarCallback"));

// Bounces a signed-in-but-incomplete signup (no lane/agreement/workspace yet) to
// the /onboarding gate. Not lazy — it's a thin wrapper around the app shells.
import { RequireCompleteSignup } from "@/components/auth/RequireCompleteSignup";

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

// Keep the floating chat widget off the premium landing (homepage + preview).
const CHATBOT_HIDDEN_ROUTES = ["/", "/premium"];
const GatedChatbot = () => {
  const { pathname } = useLocation();
  if (CHATBOT_HIDDEN_ROUTES.includes(pathname)) return null;
  return <FloatingChatbot />;
};

const AppInner = () => {
  useHostRouting();
  useReferralTracking();
  usePageView();
  return <GlobalAuthSessionManager />;
};

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SubscriptionProvider>
        <BusinessProvider>
        <DashboardModeProvider>
        <RoleLensProvider>
        <ImpersonationProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppInner />
          <MetaPixel />
          <SpeedInsights />
          <ClientOnlyRouteGuard />
          <Routes>
            {/* Live homepage — the new gold+indigo Paige design */}
            <Route path="/" element={<PageSuspense><PaigeHome /></PageSuspense>} />
            {/* Parked prior designs (not linked): star-field orb + legacy site */}
            <Route path="/premium" element={<PageSuspense><PremiumHero /></PageSuspense>} />
            <Route path="/legacy" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/login" element={<Navigate to="/auth" replace />} />
            <Route path="/operator" element={<PageSuspense><OperatorLogin /></PageSuspense>} />
            <Route path="/join-platform" element={<PageSuspense><JoinPlatform /></PageSuspense>} />
            <Route path="/book/:slug" element={<PageSuspense><BookingPage /></PageSuspense>} />
            <Route path="/booking/manage" element={<PageSuspense><ManageBooking /></PageSuspense>} />
            <Route path="/signup" element={<PageSuspense><PublicSignup /></PageSuspense>} />
            <Route path="/onboarding" element={<PageSuspense><Onboarding /></PageSuspense>} />
            <Route path="/signup/coach-qualify" element={<PageSuspense><SignupCoachQualify /></PageSuspense>} />
            <Route path="/reset-password" element={<PageSuspense><ResetPassword /></PageSuspense>} />
            <Route path="/accept-invite" element={<PageSuspense><AcceptInvite /></PageSuspense>} />
            <Route path="/join/:token" element={<PageSuspense><JoinWorkspace /></PageSuspense>} />
            <Route path="/portal/:tenantSlug" element={<PageSuspense><PortalGateway /></PageSuspense>} />
            <Route path="/mcp/authorize" element={<PageSuspense><McpAuthorize /></PageSuspense>} />
            <Route path="/auth/google-calendar/callback" element={<PageSuspense><GoogleCalendarCallback /></PageSuspense>} />

            {/* New agent-first dashboard */}
            <Route path="/app" element={<RequireCompleteSignup><PageSuspense><AppShell /></PageSuspense></RequireCompleteSignup>}>
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
              <Route path="agreements" element={<PageSuspense><MyAgreements /></PageSuspense>} />
              <Route path="affiliate" element={<PageSuspense><AffiliateTracking /></PageSuspense>} />
              <Route path="approvals" element={<PageSuspense><ClientApprovals /></PageSuspense>} />
              <Route path="actions" element={<PageSuspense><ActionItems /></PageSuspense>} />
              <Route path="planning" element={<PageSuspense><Planning /></PageSuspense>} />
            </Route>

            {/* Backward compat redirect */}
            <Route path="/dashboard" element={<Navigate to="/app" replace />} />

            <Route path="/admin/*" element={<RequireCompleteSignup><PageSuspense><Admin /></PageSuspense></RequireCompleteSignup>} />
            <Route path="/agency/*" element={<RequireCompleteSignup><PageSuspense><AgencyLayout /></PageSuspense></RequireCompleteSignup>} />
            <Route path="/unsubscribe" element={<PageSuspense><Unsubscribe /></PageSuspense>} />
           <Route path="/terms" element={<PageSuspense><Terms /></PageSuspense>} />
           <Route path="/privacy" element={<PageSuspense><Privacy /></PageSuspense>} />
           <Route path="/legal/:slug" element={<PageSuspense><LegalDoc /></PageSuspense>} />
            <Route path="/about" element={<PageSuspense><About /></PageSuspense>} />
            <Route path="/pricing" element={<PageSuspense><Pricing /></PageSuspense>} />
            <Route path="/blog" element={<PageSuspense><Blog /></PageSuspense>} />
            <Route path="/affiliates" element={<PageSuspense><AffiliateApply /></PageSuspense>} />
            <Route path="/become-an-affiliate" element={<Navigate to="/affiliates" replace />} />
            <Route path="/broker" element={<PageSuspense><BrokerApply /></PageSuspense>} />
            <Route path="/brokers" element={<Navigate to="/broker" replace />} />
            <Route path="/broker/accept-invite" element={<PageSuspense><AcceptBrokerInvite /></PageSuspense>} />

            {/* Public tenant storefront */}
            <Route path="/store/:slug" element={<PageSuspense><TenantStorefront /></PageSuspense>} />

            {/* Growth OS public surfaces — landing pages, hosted forms, funnels */}
            <Route path="/p/:tenantSlug/:pageSlug" element={<PageSuspense><GrowthPageRenderer /></PageSuspense>} />
            <Route path="/f/:tenantSlug/:funnelSlug" element={<PageSuspense><GrowthFunnelRenderer /></PageSuspense>} />
            <Route path="/form/:id" element={<PageSuspense><GrowthFormRenderer /></PageSuspense>} />

            {/* Legacy BTF workspace surface removed — everything lives in the consumer /app dashboard now. (Sprint 211.b cleanup)
                Preserve invite deep-links by redirecting to the unified /accept-invite handler; all other
                /workspace/* URLs land in the consumer dashboard. */}
            <Route path="/workspace/accept-invite" element={<Navigate to={`/accept-invite${window.location.search}`} replace />} />
            {/* Customer action-bus notifications link here (admin_propose_paige_actions). */}
            <Route path="/workspace/paige/actions" element={<Navigate to="/app/actions" replace />} />
            <Route path="/workspace/*" element={<Navigate to="/app" replace />} />

            {/* Client program onboarding wizard — admin-triggered, magic-link entry */}
            <Route path="/onboard" element={<PageSuspense><OnboardLayout /></PageSuspense>}>
              <Route index element={<PageSuspense><OnboardStep1 /></PageSuspense>} />
              <Route path="welcome" element={<PageSuspense><OnboardStep1 /></PageSuspense>} />
              <Route path="agreement" element={<PageSuspense><OnboardStep2 /></PageSuspense>} />
              {/* Deep-link self-heal: any unknown /onboard/* path (incl. the
                  retired payment/intake/documents/complete) renders the layout so
                  it can normalize the URL to the current stage → /app. */}
              <Route path="*" element={<PageSuspense><OnboardStep1 /></PageSuspense>} />
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
          <GatedChatbot />
        </BrowserRouter>
        </ImpersonationProvider>
        </RoleLensProvider>
        </DashboardModeProvider>
        </BusinessProvider>
      </SubscriptionProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
