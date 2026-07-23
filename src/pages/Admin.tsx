import React, { useEffect, useState, Suspense, lazy as reactLazy } from "react";

// Auto-recover from stale chunk errors after a deploy: when index.html is
// cached but references hashed JS chunks that no longer exist, dynamic imports
// throw "Failed to fetch dynamically imported module". We reload once
// (guarded by sessionStorage) to pick up the fresh index.html.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- universal lazy wrapper: the constraint must admit components of any props shape
const lazy = <T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) =>
  reactLazy(async () => {
    try {
      return await factory();
    } catch (err: unknown) {
      const msg = String((err as { message?: string })?.message || err);
      if (
        /Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg) &&
        !sessionStorage.getItem("__chunk_reload__")
      ) {
        sessionStorage.setItem("__chunk_reload__", "1");
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
import { useNavigate, Routes, Route, useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { PracticeOverview } from "@/pages/admin/PracticeOverview";
import { toast } from "sonner";
import { RoleGate } from "@/components/auth/RoleGate";
import { AdminLoaderBoundary } from "@/components/admin/AdminLoaderBoundary";
import { useTenantContext } from "@/hooks/useTenantContext";
import { FundingRoute, FundingGate } from "@/components/admin/FundingRoute";

/** Wraps a route element so it's only visible to admins (or platform owner). */
const AdminOnly = ({ children }: { children: React.ReactNode }) => (
  <RoleGate allow={["admin"]}>{children}</RoleGate>
);

/** God-tier gate: platform staff (owner or scoped Platform Admin) only. */
const PlatformStaffOnly = ({ children }: { children: React.ReactNode }) => {
  const { loading, isPlatformStaff } = useTenantContext();
  if (loading) return <div className="p-6 text-sm text-muted-foreground animate-pulse">Checking access…</div>;
  if (!isPlatformStaff) {
    return (
      <div className="max-w-md mx-auto mt-12 rounded-lg border border-border bg-card p-6 text-center">
        <h2 className="text-lg font-semibold mb-1">Restricted area</h2>
        <p className="text-sm text-muted-foreground">This area is for the platform team.</p>
      </div>
    );
  }
  return <>{children}</>;
};


// Lazy-load admin sub-pages
const ClientManagementDashboard = lazy(() => import("@/components/dashboard/ClientManagementDashboard").then(m => ({ default: m.ClientManagementDashboard })));
const ClientFileView = lazy(() => import("@/components/dashboard/ClientFileView").then(m => ({ default: m.ClientFileView })));
const InternalClientFileView = lazy(() => import("@/components/dashboard/InternalClientFileView").then(m => ({ default: m.InternalClientFileView })));
const FundingMatchAccuracy = lazy(() => import("@/components/dashboard/admin/FundingMatchAccuracy").then(m => ({ default: m.FundingMatchAccuracy })));
const KnowledgeBaseReviewQueue = lazy(() => import("@/components/dashboard/admin/KnowledgeBaseReviewQueue").then(m => ({ default: m.KnowledgeBaseReviewQueue })));
const LenderBureauManager = lazy(() => import("@/components/dashboard/admin/LenderBureauManager").then(m => ({ default: m.LenderBureauManager })));
const FundingPortfolioView = lazy(() => import("@/components/dashboard/admin/FundingPortfolioView").then(m => ({ default: m.FundingPortfolioView })));
const FundingPipelineView = lazy(() => import("@/components/dashboard/admin/FundingPipelineView").then(m => ({ default: m.FundingPipelineView })));
// UserManagement removed in Ship #3 / Task #15 — canonical Team & Roles is /admin/members (MembersAdmin).
const PlaybookAdmin = lazy(() => import("@/pages/admin/PlaybookAdmin"));
const Marketplace = lazy(() => import("@/pages/admin/Marketplace"));
const PortalStudio = lazy(() => import("@/pages/admin/PortalStudio"));
const PlatformTenants = lazy(() => import("@/pages/admin/PlatformTenants"));
const PlatformTeam = lazy(() => import("@/pages/admin/PlatformTeam"));
const PlatformSendingIdentities = lazy(() => import("@/pages/admin/PlatformSendingIdentities"));
const PlatformSends = lazy(() => import("@/pages/admin/PlatformSends"));
const PlatformIntelligence = lazy(() => import("@/pages/admin/PlatformIntelligence"));
const DataMaintenancePanel = lazy(() => import("@/components/admin/DataMaintenancePanel").then(m => ({ default: m.DataMaintenancePanel })));
const AffiliatesAdmin = lazy(() => import("@/pages/admin/AffiliatesAdmin"));
const MyReferralsPanel = lazy(() => import("@/components/dashboard/MyReferralsPanel"));
// Slice 1c-v placeholder container landings (Team/Setup) — §11 EmptyStates with
// CTAs into the still-mounted surfaces they will absorb (1c-ix/xi). The Clients
// placeholder became the real container in 1c-viii-c (ClientsTabsLayout below).
const TeamHub = lazy(() => import("@/pages/admin/TeamHub"));
// Setup container (IA slice 1c-xi): the 8 tenant-config sub-tab pages + the
// operator-only PlatformSettings shell. The container layout (SetupTabsLayout) is
// imported EAGERLY below (small chrome, like ClientsTabsLayout).
const SetupGeneral = lazy(() => import("@/pages/admin/setup/SetupGeneral"));
const SetupBrand = lazy(() => import("@/pages/admin/setup/SetupBrand"));
const SetupAutomations = lazy(() => import("@/pages/admin/setup/SetupAutomations"));
const SetupIntegrations = lazy(() => import("@/pages/admin/setup/SetupIntegrations"));
const SetupLegal = lazy(() => import("@/pages/admin/setup/SetupLegal"));
const SetupBilling = lazy(() => import("@/pages/admin/setup/SetupBilling"));
const SetupPlaybook = lazy(() => import("@/pages/admin/setup/SetupPlaybook"));
const SetupTeam = lazy(() => import("@/pages/admin/setup/SetupTeam"));
const PlatformSettings = lazy(() => import("@/pages/admin/PlatformSettings"));
const KnowledgeBaseAdmin = lazy(() => import("@/pages/admin/KnowledgeBaseAdmin"));
const TenantKnowledgeAdmin = lazy(() => import("@/pages/admin/TenantKnowledgeAdmin"));
const NetworkKbInsights = lazy(() => import("@/pages/admin/NetworkKbInsights"));
const SecurityCanaryAdmin = lazy(() => import("@/pages/admin/SecurityCanaryAdmin"));
const LegalAdmin = lazy(() => import("@/pages/admin/LegalAdmin"));
const DataSourceRegistryAdmin = lazy(() => import("@/pages/admin/DataSourceRegistryAdmin"));
const CommunicationsAdmin = lazy(() => import("@/pages/admin/CommunicationsAdmin"));
const BrokersAdmin = lazy(() => import("@/pages/admin/BrokersAdmin"));
const AnalyticsDashboard = lazy(() => import("@/pages/admin/AnalyticsDashboard"));
const SupportAdmin = lazy(() => import("@/pages/admin/SupportAdmin"));
const ContactsAdmin = lazy(() => import("@/pages/admin/ContactsAdmin"));
const ContactDetail = lazy(() => import("@/pages/admin/ContactDetail"));
const ClientJourney = lazy(() => import("@/pages/admin/ClientJourney"));
const CoachesAdmin = lazy(() => import("@/pages/admin/CoachesAdmin"));
// PipelineAdmin is reused by the Clients container's Pipeline tab (ClientsPipelinePane
// imports it directly); /admin/pipeline 301-redirects into that tab.
const PipelineSettings = lazy(() => import("@/pages/admin/PipelineSettings"));
const CustomFieldsSettings = lazy(() => import("@/pages/admin/CustomFieldsSettings"));
const StageAutomationRules = lazy(() => import("@/pages/admin/StageAutomationRules"));
const ReadinessProposalsAdmin = lazy(() => import("@/pages/admin/ReadinessProposalsAdmin"));
const PlanningAdmin = lazy(() => import("@/pages/admin/PlanningAdmin"));
const SubAgentsAdmin = lazy(() => import("@/pages/admin/SubAgentsAdmin"));
const ActionsQueue = lazy(() => import("@/pages/admin/ActionsQueue"));
const SkillsHub = lazy(() => import("@/pages/admin/SkillsHub"));
const CampaignsHub = lazy(() => import("@/pages/admin/CampaignsHub"));
const VibeStudio = lazy(() => import("@/pages/admin/VibeStudio"));
const StudioHome = lazy(() => import("@/pages/admin/StudioHome"));
const StudioLibrary = lazy(() => import("@/pages/admin/StudioLibrary"));
const StudioNew = lazy(() => import("@/pages/admin/StudioNew"));
// Eager — small chrome, always on the studio branch, renders the persistent rail + <Outlet/>.
import StudioLayout from "@/components/admin/studio/StudioLayout";
import PaigeTabsLayout from "@/components/paige/PaigeTabsLayout";
// Clients container (IA slice 1c-viii-c): pathless layout wraps the reused surfaces
// (ContactsAdmin · PipelineAdmin · CalendarAdmin · PortalStudio) as sub-tabs.
import ClientsTabsLayout from "@/components/clients/ClientsTabsLayout";
// Setup container (IA slice 1c-xi): pathless-style path-nested layout wraps the 8
// tenant-config sub-tab pages. Eager like ClientsTabsLayout — small chrome.
import SetupTabsLayout from "@/components/setup/SetupTabsLayout";
const ClientsPipelinePane = lazy(() => import("@/components/clients/ClientsPipelinePane"));
const ClientsConversations = lazy(() => import("@/pages/admin/ClientsConversations"));
const WorkflowDetail = lazy(() => import("@/pages/admin/WorkflowDetail"));
const WorkflowRuns = lazy(() => import("@/pages/admin/WorkflowRuns"));
const WorkflowRunDetail = lazy(() => import("@/pages/admin/WorkflowRunDetail"));
const ApprovalsInbox = lazy(() => import("@/pages/admin/ApprovalsInbox"));
const ApprovalDetail = lazy(() => import("@/pages/admin/ApprovalDetail"));
const AdminNotifications = lazy(() => import("@/pages/admin/AdminNotifications"));
const IntegrationsHub = lazy(() => import("@/pages/admin/IntegrationsHub"));
const N8nIntegrationConfig = lazy(() => import("@/pages/admin/N8nIntegrationConfig"));
const SubscriptionsRevenue = lazy(() => import("@/pages/admin/SubscriptionsRevenue"));
const ZapierIntegrationConfig = lazy(() => import("@/pages/admin/ZapierIntegrationConfig"));
const TelegramIntegrationConfig = lazy(() => import("@/pages/admin/TelegramIntegrationConfig"));
const GmailIntegrationConfig = lazy(() => import("@/pages/admin/GmailIntegrationConfig"));

const AiActivity = lazy(() => import("@/pages/admin/AiActivity"));
const DocuSignConfig = lazy(() => import("@/pages/admin/DocuSignConfig"));
const SignaturesAdmin = lazy(() => import("@/pages/admin/SignaturesAdmin"));
const CalIntegrationConfig = lazy(() => import("@/pages/admin/CalIntegrationConfig"));
const BookingsAdmin = lazy(() => import("@/pages/admin/BookingsAdmin"));
const CalendarAdmin = lazy(() => import("@/pages/admin/CalendarAdmin"));
const MetaIntegrationConfig = lazy(() => import("@/pages/admin/MetaIntegrationConfig"));
const MetaPixelConfig = lazy(() => import("@/pages/admin/MetaPixelConfig"));
const SocialAdmin = lazy(() => import("@/pages/admin/SocialAdmin"));
const ApolloIntegrationConfig = lazy(() => import("@/pages/admin/ApolloIntegrationConfig"));
const LeadsEnrichment = lazy(() => import("@/pages/admin/LeadsEnrichment"));
const UsageAnalytics = lazy(() => import("@/pages/admin/UsageAnalytics"));
const ErrorTracking = lazy(() => import("@/pages/admin/ErrorTracking"));
const NavIntegrationConfig = lazy(() => import("@/pages/admin/NavIntegrationConfig"));
const BusinessCreditAdmin = lazy(() => import("@/pages/admin/BusinessCreditAdmin"));
const SmartCreditIntegrationConfig = lazy(() => import("@/pages/admin/SmartCreditIntegrationConfig"));
const OwnerCreditAdmin = lazy(() => import("@/pages/admin/OwnerCreditAdmin"));
const PlaidIntegrationConfig = lazy(() => import("@/pages/admin/PlaidIntegrationConfig"));
const BankingAdmin = lazy(() => import("@/pages/admin/BankingAdmin"));
const MembersAdmin = lazy(() => import("@/pages/admin/MembersAdmin"));
const FundingLensHub = lazy(() => import("@/pages/admin/FundingLensHub"));



const SuspenseFallback = () => (
  <div className="flex items-center justify-center py-12">
    <div className="animate-pulse text-muted-foreground">Loading...</div>
  </div>
);

function ClientFileWrapper({ userRole }: { userRole: "admin" | "coach" }) {
  const { userId } = useParams();
  const navigate = useNavigate();
  return <ClientFileView clientUserId={userId!} onBack={() => navigate("/admin/clients")} userRole={userRole} />;
}

function InternalClientFileWrapper() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  return <InternalClientFileView clientId={clientId!} onBack={() => navigate("/admin/clients")} />;
}

const Admin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<"admin" | "coach">("admin");
  const { isPlatformStaff } = useTenantContext();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        // Wait for the session to hydrate after a hard reload. supabase.auth
        // restores from localStorage asynchronously; calling getUser() too
        // early can return null and bounce the admin to /auth or /app.
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        let session = sessionResult ? sessionResult.data.session : null;
        if (!session) {
          session = await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              sub.data.subscription.unsubscribe();
              resolve(null);
            }, 4000);
            const sub = supabase.auth.onAuthStateChange((_e, s) => {
              if (s) {
                clearTimeout(timeout);
                sub.data.subscription.unsubscribe();
                resolve(s);
              }
            });
          });
        }
        if (cancelled) return;

        const user = session?.user;
        if (!user) {
          navigate("/auth", { replace: true });
          return;
        }

        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        const roleList = (roles || []).map((r: { role: string }) => r.role);
        const isAdmin = roleList.includes("admin");
        const isCoach = roleList.includes("coach");
        // Platform staff (owner / scoped Platform Admin) run the God console and
        // must clear this gate even without an agency admin/coach role.
        const isPlatformStaffRole = roleList.includes("platform_admin") || roleList.includes("super_admin");

        if (!isAdmin && !isCoach && !isPlatformStaffRole) {
          toast.error("Access denied. Staff privileges required.");
          navigate("/app", { replace: true });
          return;
        }

        setUserRole(isAdmin || isPlatformStaffRole ? "admin" : "coach");
      } catch (error) {
        console.error("Admin access check error:", error);
        // Stay on /admin and let the boundary surface the failure rather
        // than silently redirecting to /app.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleViewClient = (clientUserId: string) => {
    navigate(`/admin/clients/user/${clientUserId}`);
  };

  const handleViewInternalClient = (clientId: string) => {
    navigate(`/admin/clients/internal/${clientId}`);
  };

  if (loading) {
    return (
      <AdminLoaderBoundary loading>
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="animate-pulse text-muted-foreground">Loading admin workspace...</div>
        </div>
      </AdminLoaderBoundary>
    );
  }

  return (
    <AdminLoaderBoundary>
    <AdminLayout userRole={userRole}>
      <Routes>
        <Route index element={isPlatformStaff ? <Navigate to="/admin/platform/tenants" replace /> : <AdminOverview />} />
        {/* People is now the Clients container index — /admin/contacts 301-redirects
            there (SPA equivalent). contacts/:id stays a FULL route (Client 360). */}
        <Route path="contacts" element={<Navigate to="/admin/clients-hub" replace />} />
        <Route path="contacts/:id" element={
          <Suspense fallback={<SuspenseFallback />}><ContactDetail /></Suspense>
        } />
        <Route path="clients/:id/journey" element={
          <Suspense fallback={<SuspenseFallback />}><ClientJourney /></Suspense>
        } />
        <Route path="contacts/:id/journey" element={
          <Suspense fallback={<SuspenseFallback />}><ClientJourney /></Suspense>
        } />
        {/* Pipeline absorbed into the Clients container (1c-viii-c). */}
        <Route path="pipeline" element={<Navigate to="/admin/clients-hub/pipeline" replace />} />
        <Route path="planning" element={
          <Suspense fallback={<SuspenseFallback />}><PlanningAdmin /></Suspense>
        } />
        {/* Clients container (IA slice 1c-viii-c). A pathless <ClientsTabsLayout>
            renders ONLY the sub-tab strip + <Outlet/> (no "Clients" PageHeader —
            each child owns its header, §11/§27), wrapping the EXISTING surfaces as
            five sub-tabs (§18 reuse, no rebuild). Gates stay on each child element.
            No AdminOnly on the container — the top-nav item is coach-reachable; the
            Portal child keeps its AdminOnly. /admin/clients-hub is distinct from the
            load-bearing /admin/clients client-file surface (B3). */}
        <Route path="clients-hub" element={<ClientsTabsLayout />}>
          {/* PEOPLE (default) — the enhanced ContactsAdmin (two-axis grid). RLS-only. */}
          <Route index element={
            <Suspense fallback={<SuspenseFallback />}><ContactsAdmin /></Suspense>
          } />
          {/* PIPELINE — PipelineAdmin Kanban, wrapped so funding quick-links show ONLY
              for a funding tenant (FundingGate → null when off, §2). */}
          <Route path="pipeline" element={
            <Suspense fallback={<SuspenseFallback />}><ClientsPipelinePane /></Suspense>
          } />
          {/* CONVERSATIONS — crafted EmptyState placeholder (§11 primitive). */}
          <Route path="conversations" element={
            <Suspense fallback={<SuspenseFallback />}><ClientsConversations /></Suspense>
          } />
          {/* DELIVERY — CalendarAdmin (its own internal Calendar/List/Settings/Connections tabs). */}
          <Route path="delivery" element={
            <Suspense fallback={<SuspenseFallback />}><CalendarAdmin /></Suspense>
          } />
          {/* CLIENT PORTAL — unchanged gate (AdminOnly>PortalStudio), now the 5th tab. */}
          <Route path="portal" element={
            <AdminOnly>
              <Suspense fallback={<SuspenseFallback />}><PortalStudio /></Suspense>
            </AdminOnly>
          } />
        </Route>
        <Route path="team" element={
          <Suspense fallback={<SuspenseFallback />}><TeamHub /></Suspense>
        } />
        {/* Setup container (IA slice 1c-xi) — the tenant-config consolidation home.
            A path-nested <SetupTabsLayout> renders ONLY the sub-tab strip + <Outlet/>
            (no container PageHeader — each child owns its compact header, §11). The
            index redirects to General (the default). Gates stay on each child element
            per the canonical registry: General → admin + platform-staff; Integrations/
            Legal/Billing/Playbook → AdminOnly; Brand/Automations/Team → coach-visible
            (no gate). Deep editors (pipelines, custom-fields, stage-rules) stay mounted
            on their own routes and are link-outs from these tabs (§18 one home). */}
        <Route path="setup" element={<SetupTabsLayout />}>
          <Route index element={<Navigate to="/admin/setup/general" replace />} />
          <Route path="general" element={
            <RoleGate allow={["admin"]} allowPlatformStaff>
              <Suspense fallback={<SuspenseFallback />}><SetupGeneral /></Suspense>
            </RoleGate>
          } />
          <Route path="brand" element={
            <Suspense fallback={<SuspenseFallback />}><SetupBrand /></Suspense>
          } />
          <Route path="automations" element={
            <Suspense fallback={<SuspenseFallback />}><SetupAutomations /></Suspense>
          } />
          <Route path="integrations" element={
            <AdminOnly><Suspense fallback={<SuspenseFallback />}><SetupIntegrations /></Suspense></AdminOnly>
          } />
          <Route path="legal" element={
            <AdminOnly><Suspense fallback={<SuspenseFallback />}><SetupLegal /></Suspense></AdminOnly>
          } />
          <Route path="billing" element={
            <AdminOnly><Suspense fallback={<SuspenseFallback />}><SetupBilling /></Suspense></AdminOnly>
          } />
          <Route path="playbook" element={
            <AdminOnly><Suspense fallback={<SuspenseFallback />}><SetupPlaybook /></Suspense></AdminOnly>
          } />
          <Route path="team" element={
            <Suspense fallback={<SuspenseFallback />}><SetupTeam /></Suspense>
          } />
        </Route>
        {/* Legacy /admin/tasks now lands on the real Planning hub — the task
            manager the owner asked to be "wired to the admin user". The old
            TasksAdmin page is retired from the router; notifications and any
            saved deep-links resolve to Planning. */}
        <Route path="tasks" element={<Navigate to="/admin/planning" replace />} />
        <Route path="coaches" element={
          <Suspense fallback={<SuspenseFallback />}><CoachesAdmin /></Suspense>
        } />
        <Route path="growth" element={<Navigate to="/admin/campaigns?tab=pages" replace />} />
        <Route path="growth/*" element={<Navigate to="/admin/campaigns?tab=pages" replace />} />
        {/* sub-agents · skills · actions · playbook are absorbed into the Paige
            workspace group below (IA slice 1c-vi) — see the <PaigeTabsLayout> block. */}
        <Route path="clients" element={
          <Suspense fallback={<SuspenseFallback />}>
            <ClientManagementDashboard onViewClient={handleViewClient} onViewInternalClient={handleViewInternalClient} />
          </Suspense>
        } />
        <Route path="clients/user/:userId" element={
          <Suspense fallback={<SuspenseFallback />}>
            <ClientFileWrapper userRole={userRole} />
          </Suspense>
        } />
        <Route path="clients/internal/:clientId" element={
          <Suspense fallback={<SuspenseFallback />}>
            <InternalClientFileWrapper />
          </Suspense>
        } />
        <Route path="funding" element={<FundingRoute><Suspense fallback={<SuspenseFallback />}><FundingPortfolioView /></Suspense></FundingRoute>} />
        <Route path="funding-pipeline" element={<FundingRoute><Suspense fallback={<SuspenseFallback />}><FundingPipelineView /></Suspense></FundingRoute>} />
        {/* 1c-x: route OPENED to tenant staff so tenants reach their OWN analytics
            (tenant lens). Every platform-wide/operator read stays is_platform_owner-
            gated INSIDE the surface (view toggle + section guards + server RPC gates).
            Floor mirrors the 1c-ix Team gate. */}
        <Route path="analytics" element={
          <RoleGate
            allow={["admin", "coach", "sales_rep", "cs_rep", "finance", "manager", "owner"]}
            allowPlatformStaff
          >
            <Suspense fallback={<SuspenseFallback />}>
              <div className="space-y-8">
                <AnalyticsDashboard />
                <FundingGate><FundingMatchAccuracy /></FundingGate>
              </div>
            </Suspense>
          </RoleGate>
        } />
        <Route path="knowledge" element={
          <PlatformStaffOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <div className="space-y-6">
                <KnowledgeBaseReviewQueue />
                <FundingGate><LenderBureauManager /></FundingGate>
              </div>
            </Suspense>
          </PlatformStaffOnly>
        } />
        <Route path="maintenance" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <DataMaintenancePanel />
            </Suspense>
          </AdminOnly>
        } />
        {/* /admin/affiliates is the tenant-facing PERSONAL referrals view — every
            staff member (admin or coach) sees their OWN referrals here. The
            operator-run affiliate PROGRAM (leaderboard, applications, commission
            tiers) is a global/platform surface (no tenant_id) and lives at
            /admin/platform/affiliates under PlatformStaffOnly (§9). */}
        <Route path="affiliates" element={
          <Suspense fallback={<SuspenseFallback />}>
            <MyReferralsPanel />
          </Suspense>
        } />
        <Route path="knowledge-base" element={
          <PlatformStaffOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <KnowledgeBaseAdmin />
            </Suspense>
          </PlatformStaffOnly>
        } />
        <Route path="tenant-knowledge" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <TenantKnowledgeAdmin />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="network-kb" element={
          <PlatformStaffOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <NetworkKbInsights />
            </Suspense>
          </PlatformStaffOnly>
        } />
        <Route path="security" element={
          <PlatformStaffOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <SecurityCanaryAdmin />
            </Suspense>
          </PlatformStaffOnly>
        } />
        <Route path="legal" element={
          <PlatformStaffOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <LegalAdmin />
            </Suspense>
          </PlatformStaffOnly>
        } />
        {/* Agreements + Client Agreement consolidated into Setup › Legal (1c-xi). */}
        <Route path="agreements" element={<Navigate to="/admin/setup/legal" replace />} />
        <Route path="communications" element={
          <Suspense fallback={<SuspenseFallback />}>
            <CommunicationsAdmin />
          </Suspense>
        } />
        <Route path="brokers" element={
          <FundingRoute>
            <AdminOnly>
              <Suspense fallback={<SuspenseFallback />}>
                <BrokersAdmin />
              </Suspense>
            </AdminOnly>
          </FundingRoute>
        } />
        <Route path="support" element={
          <Suspense fallback={<SuspenseFallback />}>
            <SupportAdmin />
          </Suspense>
        } />
        {/* Settings consolidated into the Setup container (1c-xi). Redirect the old
            landing to Setup › General; the deep editor sub-routes below stay mounted. */}
        <Route path="settings" element={<Navigate to="/admin/setup/general" replace />} />
        {/* Paige workspace group (IA slice 1c-vi): Chat + absorbed Sub-Agents /
            Actions / Skills as sub-tabs. The pathless layout adds NO url segment,
            so child paths stay identical (/admin/playbook, /admin/sub-agents,
            /admin/actions, /admin/skills) and every deep-link / alias / CTA
            resolves unchanged. Gates stay on each child element (B5): Chat
            AdminOnly, Sub-Agents/Skills ungated, Actions admin + platform-staff. */}
        <Route element={<PaigeTabsLayout />}>
          <Route path="playbook" element={
            <AdminOnly>
              <Suspense fallback={<SuspenseFallback />}>
                <PlaybookAdmin />
              </Suspense>
            </AdminOnly>
          } />
          <Route path="sub-agents" element={
            <Suspense fallback={<SuspenseFallback />}><SubAgentsAdmin /></Suspense>
          } />
          <Route path="actions" element={
            <RoleGate allow={["admin"]} allowPlatformStaff><Suspense fallback={<SuspenseFallback />}><ActionsQueue /></Suspense></RoleGate>
          } />
          <Route path="skills" element={
            <Suspense fallback={<SuspenseFallback />}><SkillsHub /></Suspense>
          } />
        </Route>
        <Route path="agreement" element={<Navigate to="/admin/setup/legal" replace />} />
        <Route path="marketplace" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <Marketplace />
            </Suspense>
          </AdminOnly>
        } />
        {/* Client Portal moved to /admin/clients-hub/portal (§9/§12). These
            redirects (SPA equivalent of a 301) keep old links + deep-links live. */}
        <Route path="portal" element={<Navigate to="/admin/clients-hub/portal" replace />} />
        <Route path="portal/*" element={<Navigate to="/admin/clients-hub/portal" replace />} />
        <Route path="settings/pipelines" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <PipelineSettings />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="settings/custom-fields" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <CustomFieldsSettings />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="automation/stage-rules" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <StageAutomationRules />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="automation/readiness-proposals" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <ReadinessProposalsAdmin />
            </Suspense>
          </AdminOnly>
        } />
        {/* Workflows list absorbed into Setup › Automations (1c-xi). The runs +
            per-workflow detail routes below stay mounted (deep-linked from the tab). */}
        <Route path="workflows" element={<Navigate to="/admin/setup/automations" replace />} />
        <Route path="campaigns" element={
          <Suspense fallback={<SuspenseFallback />}><CampaignsHub /></Suspense>
        } />
        {/* Vibe Studio — its own immersive room. StudioLayout renders the persistent left rail
            once and swaps the body via <Outlet/> (§18: one home each, one in-surface nav).
            HOME = the gradient-hero dashboard + gallery (index /admin/studio).
            NEW  = a thin creator that mints a session then redirects into the builder.
            BUILDER = the StudioShell, opened FOR a session (/admin/studio/:sessionId). */}
        <Route path="studio" element={<StudioLayout />}>
          <Route index element={
            <Suspense fallback={<SuspenseFallback />}><StudioHome /></Suspense>
          } />
          <Route path="new" element={
            <Suspense fallback={<SuspenseFallback />}><StudioNew /></Suspense>
          } />
          <Route path="library" element={
            <Suspense fallback={<SuspenseFallback />}><StudioLibrary /></Suspense>
          } />
          <Route path=":sessionId" element={
            <Suspense fallback={<SuspenseFallback />}><VibeStudio /></Suspense>
          } />
        </Route>
        <Route path="workflows/runs" element={
          <Suspense fallback={<SuspenseFallback />}><WorkflowRuns /></Suspense>
        } />
        <Route path="workflows/runs/:id" element={
          <Suspense fallback={<SuspenseFallback />}><WorkflowRunDetail /></Suspense>
        } />
        <Route path="workflows/:key" element={
          <Suspense fallback={<SuspenseFallback />}><WorkflowDetail /></Suspense>
        } />
        <Route path="approvals" element={
          <Suspense fallback={<SuspenseFallback />}><ApprovalsInbox /></Suspense>
        } />
        <Route path="notifications" element={
          <Suspense fallback={<SuspenseFallback />}><AdminNotifications /></Suspense>
        } />
        <Route path="data-registry" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><DataSourceRegistryAdmin /></Suspense></AdminOnly>
        } />
        <Route path="approvals/:id" element={
          <Suspense fallback={<SuspenseFallback />}><ApprovalDetail /></Suspense>
        } />
        {/* actions absorbed into the Paige workspace group (1c-vi) above. */}
        <Route path="integrations" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><IntegrationsHub /></Suspense></AdminOnly>
        } />
        <Route path="integrations/n8n" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><N8nIntegrationConfig /></Suspense></AdminOnly>
        } />
        <Route path="integrations/subscriptions" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><SubscriptionsRevenue /></Suspense></AdminOnly>
        } />
        <Route path="integrations/zapier" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><ZapierIntegrationConfig /></Suspense></AdminOnly>
        } />
        <Route path="integrations/telegram" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><TelegramIntegrationConfig /></Suspense></AdminOnly>
        } />
        <Route path="integrations/gmail" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><GmailIntegrationConfig /></Suspense></AdminOnly>
        } />
        <Route path="integrations/ai-activity" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><AiActivity /></Suspense></AdminOnly>
        } />
        <Route path="integrations/docusign" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><DocuSignConfig /></Suspense></AdminOnly>
        } />
        <Route path="signatures" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><SignaturesAdmin /></Suspense></AdminOnly>
        } />
        <Route path="integrations/cal" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><CalIntegrationConfig /></Suspense></AdminOnly>
        } />
        <Route path="bookings" element={
          <Suspense fallback={<SuspenseFallback />}><BookingsAdmin /></Suspense>
        } />
        {/* Calendar absorbed into the Clients container as Delivery (1c-viii-c).
            301-redirect the old paths so saved deep-links + notifications resolve. */}
        <Route path="calendar" element={<Navigate to="/admin/clients-hub/delivery" replace />} />
        <Route path="calendar/*" element={<Navigate to="/admin/clients-hub/delivery" replace />} />
        <Route path="integrations/meta" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><MetaIntegrationConfig /></Suspense></AdminOnly>
        } />
        <Route path="integrations/meta-pixel" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><MetaPixelConfig /></Suspense></AdminOnly>
        } />
        <Route path="social" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><SocialAdmin /></Suspense></AdminOnly>
        } />
        <Route path="integrations/apollo" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><ApolloIntegrationConfig /></Suspense></AdminOnly>
        } />
        <Route path="leads/enrichment" element={
          <Suspense fallback={<SuspenseFallback />}><LeadsEnrichment /></Suspense>
        } />
        <Route path="observability/usage" element={
          <PlatformStaffOnly><Suspense fallback={<SuspenseFallback />}><UsageAnalytics /></Suspense></PlatformStaffOnly>
        } />
        <Route path="observability/errors" element={
          <PlatformStaffOnly><Suspense fallback={<SuspenseFallback />}><ErrorTracking /></Suspense></PlatformStaffOnly>
        } />
        <Route path="integrations/nav" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><NavIntegrationConfig /></Suspense></AdminOnly>
        } />
        <Route path="business-credit" element={
          <FundingRoute><AdminOnly><Suspense fallback={<SuspenseFallback />}><BusinessCreditAdmin /></Suspense></AdminOnly></FundingRoute>
        } />
        <Route path="integrations/smartcredit" element={
          <FundingRoute><AdminOnly><Suspense fallback={<SuspenseFallback />}><SmartCreditIntegrationConfig /></Suspense></AdminOnly></FundingRoute>
        } />
        <Route path="owner-credit" element={
          <FundingRoute><AdminOnly><Suspense fallback={<SuspenseFallback />}><OwnerCreditAdmin /></Suspense></AdminOnly></FundingRoute>
        } />
        <Route path="integrations/plaid" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><PlaidIntegrationConfig /></Suspense></AdminOnly>
        } />
        <Route path="banking" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><BankingAdmin /></Suspense></AdminOnly>
        } />
        <Route path="members" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><MembersAdmin /></Suspense></AdminOnly>
        } />
        <Route path="funding-lens" element={
          <FundingRoute><Suspense fallback={<SuspenseFallback />}><FundingLensHub /></Suspense></FundingRoute>
        } />
        {/* The agency operator side moved to its own top-level shell (`/agency`,
            §9). Keep this path as a redirect so saved deep-links resolve. */}
        <Route path="agency" element={<Navigate to="/agency" replace />} />
        <Route path="agency/*" element={<Navigate to="/agency" replace />} />
        <Route path="platform/tenants" element={
          <PlatformStaffOnly><Suspense fallback={<SuspenseFallback />}><PlatformTenants /></Suspense></PlatformStaffOnly>
        } />
        <Route path="platform/team" element={
          <PlatformStaffOnly><Suspense fallback={<SuspenseFallback />}><PlatformTeam /></Suspense></PlatformStaffOnly>
        } />
        <Route path="platform/sending" element={
          <PlatformStaffOnly><Suspense fallback={<SuspenseFallback />}><PlatformSendingIdentities /></Suspense></PlatformStaffOnly>
        } />
        <Route path="platform/sends" element={
          <PlatformStaffOnly><Suspense fallback={<SuspenseFallback />}><PlatformSends /></Suspense></PlatformStaffOnly>
        } />
        <Route path="platform/intelligence" element={
          <PlatformStaffOnly><Suspense fallback={<SuspenseFallback />}><PlatformIntelligence /></Suspense></PlatformStaffOnly>
        } />
        {/* Operator-only platform config (global feature flags + send pipes), §9 —
            relocated out of the retired AdminSettingsHub into its own God shell. */}
        <Route path="platform/settings" element={
          <PlatformStaffOnly><Suspense fallback={<SuspenseFallback />}><PlatformSettings /></Suspense></PlatformStaffOnly>
        } />
        {/* Operator-run affiliate PROGRAM management (global, no tenant_id) — §9. */}
        <Route path="platform/affiliates" element={
          <PlatformStaffOnly><Suspense fallback={<SuspenseFallback />}><AffiliatesAdmin /></Suspense></PlatformStaffOnly>
        } />
      </Routes>

    </AdminLayout>
    </AdminLoaderBoundary>
  );
};


function AdminOverview() {
  // The tenant Dashboard is the practice overview only. The AI Learning / RAG
  // telemetry tiles that used to render here were operator/AI-health data (§9)
  // and internal jargon (§11) — they live on the operator analytics surface
  // (RagPerformance), not the tenant's first screen.
  return <PracticeOverview />;
}

export default Admin;
