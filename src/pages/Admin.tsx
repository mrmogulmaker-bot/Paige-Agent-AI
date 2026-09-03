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
import { useNavigate, Routes, Route, useParams, Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageSkeleton } from "@/components/ui/page";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { PracticeOverview } from "@/pages/admin/PracticeOverview";
import { AdminNotFound } from "@/pages/admin/AdminNotFound";
import { toast } from "sonner";
import { RoleGate } from "@/components/auth/RoleGate";
import { AdminLoaderBoundary } from "@/components/admin/AdminLoaderBoundary";
import { useTenantContext } from "@/hooks/useTenantContext";
import { shouldOfferAccountPicker } from "@/lib/auth/accountSelection";
import {
  WORKSPACE_CHOOSER_PATH,
  WORKSPACE_CHOOSER_SETTLED_PARAM,
  reachableWorkspaceCount,
  hasEnteredWorkspace,
  workspaceRecordUsable,
} from "@/lib/auth/workspaceEntry";
import { FundingRoute, FundingGate } from "@/components/admin/FundingRoute";
import { RequireFeature } from "@/components/tier/RequireFeature";
import { useTierFeatures } from "@/hooks/useTierFeatures";

/** Wraps a route element so it's only visible to admins (or platform owner). */
const AdminOnly = ({ children }: { children: React.ReactNode }) => (
  <RoleGate allow={["admin"]}>{children}</RoleGate>
);

/** God-tier gate: platform staff (owner or scoped Platform Admin) only. */
const PlatformStaffOnly = ({ children }: { children: React.ReactNode }) => {
  const { loading, isPlatformStaff, isPlatformOwner } = useTenantContext();
  if (loading) return <div className="p-6 text-sm text-muted-foreground animate-pulse">Checking access…</div>;
  // An owner is by definition staff — accept either so a partial resolution (owner
  // flag set before the staff flag) never flashes the restricted panel (§13).
  if (!isPlatformStaff && !isPlatformOwner) {
    return (
      <div className="max-w-md mx-auto mt-12 rounded-lg border border-border bg-card p-6 text-center">
        <h2 className="text-lg font-semibold mb-1">Restricted area</h2>
        <p className="text-sm text-muted-foreground">This area is for the platform team.</p>
      </div>
    );
  }
  return <>{children}</>;
};

/** Owner-only gate: the platform OWNER (super_admin), not a scoped Platform Admin.
 *  Closes the §9 gap the operator nav restructure surfaced — the owner-only console
 *  surfaces (Money Spine, Doctrine, Prompt-Forge, Compliance overview, Content Defaults,
 *  Deploy Health) hide their nav tab from scoped staff (canSee: owner), so the ROUTE must
 *  gate the same way or a staffer could deep-link past the hidden tab. */
const PlatformOwnerOnly = ({ children }: { children: React.ReactNode }) => {
  const { loading, isPlatformOwner } = useTenantContext();
  if (loading) return <div className="p-6 text-sm text-muted-foreground animate-pulse">Checking access…</div>;
  if (!isPlatformOwner) {
    return (
      <div className="max-w-md mx-auto mt-12 rounded-lg border border-border bg-card p-6 text-center">
        <h2 className="text-lg font-semibold mb-1">Restricted area</h2>
        <p className="text-sm text-muted-foreground">This area is for the platform owner.</p>
      </div>
    );
  }
  return <>{children}</>;
};


// Solo greenfield shell (faithful port of the Claude Design Solo pack). Lazy-loaded so
// its ~400KB of chunks NEVER enter the shared Admin bundle unless a flagged solo tenant
// actually mounts it — every non-solo admin's bundle + cache keys stay unchanged (§58).
const SoloApp = lazy(() => import("@/solo/SoloApp"));

// Agency/sub-account greenfield shell. Lazy-loaded so its chunks NEVER enter the shared
// Admin bundle unless a flagged agency/enterprise/sub_account tenant actually mounts it —
// every non-flagged admin's bundle + cache keys stay unchanged (§58).
const AgencyApp = lazy(() => import("@/agency/AgencyApp"));

// Lazy-load admin sub-pages
const ClientManagementDashboard = lazy(() => import("@/components/dashboard/ClientManagementDashboard").then(m => ({ default: m.ClientManagementDashboard })));
const ClientFileView = lazy(() => import("@/components/dashboard/ClientFileView").then(m => ({ default: m.ClientFileView })));
const InternalClientFileView = lazy(() => import("@/components/dashboard/InternalClientFileView").then(m => ({ default: m.InternalClientFileView })));
const FundingMatchAccuracy = lazy(() => import("@/components/dashboard/admin/FundingMatchAccuracy").then(m => ({ default: m.FundingMatchAccuracy })));
const KnowledgeBaseReviewQueue = lazy(() => import("@/components/dashboard/admin/KnowledgeBaseReviewQueue").then(m => ({ default: m.KnowledgeBaseReviewQueue })));
const LenderBureauManager = lazy(() => import("@/components/dashboard/admin/LenderBureauManager").then(m => ({ default: m.LenderBureauManager })));
const FundingPortfolioView = lazy(() => import("@/components/dashboard/admin/FundingPortfolioView").then(m => ({ default: m.FundingPortfolioView })));
const FundingPipelineView = lazy(() => import("@/components/dashboard/admin/FundingPipelineView").then(m => ({ default: m.FundingPipelineView })));
// UserManagement removed in Ship #3 / Task #15 — canonical Team & Roles is /admin/team (TeamHub).
const PlaybookAdmin = lazy(() => import("@/pages/admin/PlaybookAdmin"));
const Marketplace = lazy(() => import("@/pages/admin/Marketplace"));
const PortalStudio = lazy(() => import("@/pages/admin/PortalStudio"));
const PlatformTenants = lazy(() => import("@/pages/admin/PlatformTenants"));
// Operator Command Center — the platform operator's /admin home in godMode (no tenant
// selected). Superior-to-tenant fleet dashboard; replaces the old Fleet redirect (§9/§30).
const OperatorCommandCenter = lazy(() => import("@/pages/admin/OperatorCommandCenter"));
const PlatformTeam = lazy(() => import("@/pages/admin/PlatformTeam"));
const PlatformSendingIdentities = lazy(() => import("@/pages/admin/PlatformSendingIdentities"));
const PlatformSends = lazy(() => import("@/pages/admin/PlatformSends"));
const PlatformFleetCommunications = lazy(() => import("@/pages/admin/PlatformFleetCommunications"));
const PlatformIntelligence = lazy(() => import("@/pages/admin/PlatformIntelligence"));
// Super Admin restructure (operator console SPINE): 9 NEW operator nav items each
// land on a real, honest §13 in-development placeholder route (§18 one home each).
// Deep surfaces are follow-ups. All sit under <PlatformStaffOnly> (§9).
const MarketplaceOperatorAdmin = lazy(() => import("@/pages/admin/platform/MarketplaceOperatorAdmin"));
const MoneySpineAdmin = lazy(() => import("@/pages/admin/platform/MoneySpineAdmin"));
const DoctrineAdmin = lazy(() => import("@/pages/admin/platform/DoctrineAdmin"));
const PromptForgeAdmin = lazy(() => import("@/pages/admin/platform/PromptForgeAdmin"));
const ModelRouterAdmin = lazy(() => import("@/pages/admin/platform/ModelRouterAdmin"));
const ComplianceAdmin = lazy(() => import("@/pages/admin/platform/ComplianceAdmin"));
const ContentDefaultsAdmin = lazy(() => import("@/pages/admin/platform/ContentDefaultsAdmin"));
const PlatformAnalyticsAdmin = lazy(() => import("@/pages/admin/platform/PlatformAnalyticsAdmin"));
const DeployHealthAdmin = lazy(() => import("@/pages/admin/platform/DeployHealthAdmin"));
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
// Setup › Integrations mounts the REAL IntegrationsHub inline (§18/§31 — one home);
// the standalone /admin/integrations index redirects here. See the routes below.
const SetupLegal = lazy(() => import("@/pages/admin/setup/SetupLegal"));
const SetupBilling = lazy(() => import("@/pages/admin/setup/SetupBilling"));
const SetupPlaybook = lazy(() => import("@/pages/admin/setup/SetupPlaybook"));
const PlatformSettings = lazy(() => import("@/pages/admin/PlatformSettings"));
const PlatformInvites = lazy(() => import("@/pages/admin/PlatformInvites"));
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
// PipelineAdmin is reused by the Clients container's Pipeline tab (ClientsPipelinePane
// imports it directly); /admin/pipeline 301-redirects into that tab.
const PipelineSettings = lazy(() => import("@/pages/admin/PipelineSettings"));
const CustomFieldsSettings = lazy(() => import("@/pages/admin/CustomFieldsSettings"));
const StageAutomationRules = lazy(() => import("@/pages/admin/StageAutomationRules"));
const ReadinessProposalsAdmin = lazy(() => import("@/pages/admin/ReadinessProposalsAdmin"));
const PlanningAdmin = lazy(() => import("@/pages/admin/PlanningAdmin"));
const SubAgentsAdmin = lazy(() => import("@/pages/admin/SubAgentsAdmin"));
// #244 — the canonical "About Your Paige Team" directory (operator scope). Lives
// INSIDE the Paige workspace group (its natural home — it's about Paige's own team),
// NOT /admin/team (the human Team floor). ONE component; scope prop set by the route.
const PaigeTeamDirectory = lazy(() => import("@/pages/PaigeTeamDirectory"));
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
// Conversations container (Cowork #127 feature #3): a pathless layout adds a subordinate
// sub-tab strip INSIDE Conversations (index = the inbox, byte-identical to before — §37).
// Eager like the other layouts — small chrome.
import ConversationsTabsLayout from "@/components/clients/ConversationsTabsLayout";
import {
  ConversationsManualActions,
  ConversationsSnippets,
  ConversationsTriggerLinks,
  ConversationsAnalytics,
} from "@/pages/admin/conversations/ConversationsSubPages";
// Settings is a substantial 5-panel surface (numbers/texting/consent/signatures/notifications);
// lazy-load it so it doesn't weigh down the eager Admin chunk on every /admin/* entry (perf).
const ConversationsSettings = lazy(() => import("@/pages/admin/conversations/ConversationsSettings"));
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
const EmailIntegrationConfig = lazy(() => import("@/pages/admin/EmailIntegrationConfig"));

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
const FundingLensHub = lazy(() => import("@/pages/admin/FundingLensHub"));



const SuspenseFallback = () => <PageSkeleton />;

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
  const { isPlatformStaff, activeTenantId, activeTenant, tenants, accountContextLoading, accountContextStatus, loading: tenantLoading, soloShellEnabled, agencyShellEnabled } = useTenantContext();
  // §51-safe canonical tier resolver — tierKey === "solo" ONLY for a standalone,
  // no-parent tenant (never god/agency/sub_account/enterprise). This is tier ROUTING
  // (which shell to mount), not a feature gate.
  const { tierKey, soloStandalone, loading: tierLoading } = useTierFeatures();
  // `/admin/*` is ONE route element, so this component renders for every path
  // beneath it. The entry question belongs to the door itself — see the gate below.
  // Lower-cased because React Router matches routes case-insensitively: `/Admin`
  // mounts this component just as `/admin` does, and a literal compare would let
  // any non-lowercase spelling walk straight past the entry question and resume a
  // parked context — the exact behaviour the ruling removes.
  // Secondary to the session record, and honoured ONLY on a browser that cannot
  // hold one — see WORKSPACE_CHOOSER_SETTLED_PARAM for why that condition is the
  // whole of its safety. Read from `window.location` because it must survive the
  // chooser's full-page assign, and read PURELY: an earlier revision stripped the
  // param here to stop it being bookmarked, which made the render mutate the value
  // it reads. React re-invoking a mount render then saw a URL the discarded pass
  // had already stripped and rebuilt the very loop this marker prevents.
  const chooserSettledOnThisHop =
    !workspaceRecordUsable() &&
    (() => {
      try {
        return new URLSearchParams(window.location.search).get(WORKSPACE_CHOOSER_SETTLED_PARAM) === "1";
      } catch {
        return false;
      }
    })();

  // Lower-cased because React Router matches routes case-insensitively: `/Admin`
  // mounts this component just as `/admin` does, and a literal compare would let
  // any non-lowercase spelling walk straight past the entry question and resume a
  // parked context — the exact behaviour the ruling removes.
  const atAdminDoor = useLocation().pathname.replace(/\/+$/, "").toLowerCase() === "/admin";

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
        {/* Page-shaped skeleton, not a full-screen bare-text splash (§11). The
            AdminLoaderBoundary still owns the 8s stall CTA + error boundary. */}
        <PageSkeleton />
      </AdminLoaderBoundary>
    );
  }

  // ENTRY ASKS; IT DOES NOT RESUME (owner ruling 2026-09-02).
  //
  // `/admin` is the door a RESTORED session comes through, and until now it went
  // straight to whichever context `active_tenant_id` was parked on. That is how an
  // owner who expected their Solo workspace was placed in a sub-account instead:
  // a previous agency act-as had left a membership row and a parked context behind
  // (#806), Gate B below read the child's tier, and the sub-account shell mounted
  // with nothing in it that said "this is not where you live."
  //
  // A FRESH sign-in already asks — `Auth.tsx` runs `shouldOfferAccountPicker` over
  // the caller's active memberships and routes to `/choose-account`. This applies
  // the SAME rule to the restored-session door. It is not a new product decision;
  // it is the shipped one, finally applied at both entrances.
  //
  // IT FIRES ON THE DOOR, NOT ON THE SUBTREE — and that distinction is the whole
  // of a confirmed infinite redirect. `/admin/*` is a single route element, so an
  // unscoped check here runs on `/admin/marketplace` and `/admin/setup` too: the
  // two paths `RequireSetupComplete` deliberately exempts so a tenant can choose a
  // playbook. A multi-context tenant mid-setup then cycled forever — chooser →
  // their workspace root → setup gate → `/admin/marketplace` → chooser — and could
  // never reach Setup to break out of it.
  //
  // THE COST OF THAT SCOPING, STATED RATHER THAN GLOSSED. An earlier version of
  // this comment justified it as "anything below the door is somewhere the person
  // has already navigated to", which is FALSE for a restored tab, a bookmark or a
  // shared link: landing directly on `/admin/contacts` with a wrongly-parked
  // context still drops the person into that context's shell without asking. That
  // is a narrower version of the reported defect and it is not closed here.
  // Widening the gate to the subtree re-opens the Setup cycle above, and the fix
  // for THAT collides with a standing shell-ownership directive, so the ordering
  // is #826 first. Recorded so the gap is known rather than assumed away — a
  // comment asserting a property the code does not have is exactly what this
  // repair keeps being caught by.
  //
  // THREE MORE THINGS IT DELIBERATELY WILL NOT DO:
  //  • It never fires until the account context is genuinely settled. Asking off a
  //    half-resolved set would itself be a fallback into a wrong account.
  //  • It never fires for a single-context person — there is nothing to choose, and
  //    the chooser would only send them back.
  //  • It never fires for platform staff, who move between tenants through the
  //    audited operator seam (§53), not this one.
  //
  // `hasEnteredWorkspace` is what stops it asking twice. It is keyed on the tenant
  // id, so a context the person did NOT choose re-arms the question by itself.
  if (
    atAdminDoor &&
    !isPlatformStaff &&
    !accountContextLoading &&
    accountContextStatus === "ready" &&
    !hasEnteredWorkspace(activeTenantId) &&
    !chooserSettledOnThisHop &&
    shouldOfferAccountPicker({
      // Honest note on the quantity: the predicate's parameter is a MEMBERSHIP
      // count, and `Auth.tsx` feeds it exactly that. Here it is the RLS-visible
      // tenant list, filtered to active. For a non-staff caller the two coincide
      // today — the `tenants` SELECT policy is `is_tenant_member(id)`, and that
      // helper requires an active membership — so this asks the same question by
      // a different route. If that policy ever widens, this count widens with it.
      activeMembershipCount: reachableWorkspaceCount(tenants, activeTenantId),
      isPlatformStaff,
    })
  ) {
    return <Navigate to={WORKSPACE_CHOOSER_PATH} replace />;
  }

  // Flag-gated Solo-shell takeover (§58 byte-unchanged when the flag is unset/false).
  // Fires ONLY for a standalone solo tenant once the tier hooks resolve, BEFORE the
  // godMode / tenant AdminLayout+Routes branch below. tierKey === "solo" is the
  // §51-safe canonical resolver, so god/agency/sub_account/enterprise never enter here.
  //
  // RUNTIME per-tenant flag (§57 source-of-truth / §10 config-as-data): `soloShellEnabled`
  // is derived by the tenant context from the ACTIVE tenant's OWN
  // `features.solo_shell_enabled` (§51-safe, no cross-tenant read) — a Super-Admin-set,
  // per-tenant canary, NOT the old build-time VITE_SOLO_SHELL_ENABLED env flag (which was
  // tier-wide and could not target one tenant). Absent flag → false → prod render unchanged.
  // STRICT gate (§51/§58): require BOTH the canonical solo tierKey AND a LITERAL
  // account_type='standalone' on a no-parent tenant (soloStandalone). resolveTierKey
  // fail-safes null/unknown account_type to "solo", so tierKey alone would take over a
  // freshly-provisioned tenant mid-setup; soloStandalone rejects that. Suspense because
  // SoloApp is a lazy chunk (see its definition) — loaded only when this gate fires.
  //
  // The Solo shell owns EVERY /admin path for a solo-standalone tenant (owner directive
  // 2026-08-16): NOTHING falls through to the old AdminLayout view — Setup, like every
  // other surface, renders INSIDE the shell (src/solo/setup.tsx). No hand-off.
  // §65 R3d-i: the Solo shell now lives at its OWN deep-linkable URL
  // (/solo/{account}/{branch}), so /admin REDIRECTS there instead of rendering the
  // shell inline — mirrors Gate A/B (task #171/#526). §58 fallback: if the
  // account_number hasn't resolved yet, render inline exactly as before rather than
  // redirect to a broken URL.
  if (
    soloShellEnabled &&
    !tierLoading &&
    tierKey === "solo" &&
    soloStandalone
  ) {
    const acctNum = activeTenant?.account_number;
    if (acctNum != null) {
      return <Navigate to={`/solo/${acctNum}/command-center`} replace />;
    }
    // Mirror the normal branch's error boundary (§32): a SoloApp render throw or a
    // genuine chunk-import failure must degrade to a visible error UI, never a
    // whole-app white-screen (there is no error boundary above /admin). SoloApp is
    // @ts-nocheck, so TS does not guard its runtime — the boundary is load-bearing.
    return (
      <AdminLoaderBoundary>
        <Suspense fallback={<PageSkeleton />}>
          <SoloApp />
        </Suspense>
      </AdminLoaderBoundary>
    );
  }

  // Flag-gated Agency-shell takeover (§58 byte-unchanged when the flag is unset/false).
  // Mirrors the Solo gate above, fires ONLY once the tier hooks resolve, BEFORE the
  // godMode / tenant AdminLayout+Routes branch below.
  //
  // RUNTIME per-tenant flag (§57 source-of-truth / §10 config-as-data): `agencyShellEnabled`
  // is derived by the tenant context from the ACTIVE tenant's OWN
  // `features.agency_shell_enabled` (§51-safe, no cross-tenant read) — a Super-Admin-set,
  // per-tenant canary. Absent flag → false → prod render unchanged (§58: with no tenant
  // setting agency_shell_enabled, EVERY render path is byte-identical to today).
  //
  // tierKey is the §51-safe canonical resolver (resolveTierKey already bakes in the
  // parent-first invariant: a parented tenant is NEVER a manager tier), so the two gates
  // route on it directly — no re-derivation here. Suspense because AgencyApp is a lazy
  // chunk (see its definition), loaded only when a gate fires. AdminLoaderBoundary mirrors
  // the Solo gate's error boundary (§32): AgencyApp is @ts-nocheck, so TS does not guard
  // its runtime — the boundary is load-bearing against a render throw / chunk-import fail.
  //
  // Gate A — agency operator (agency + enterprise): the parent-facing shell, isAgency=true.
  // §65 R0-slice-2: the agency shell now lives at its OWN deep-linkable URL
  // (/agency/{account}/{branch}), so /admin REDIRECTS there instead of rendering the
  // shell inline — that is how every tab becomes a real, bookmarkable route.
  // §58 fallback: if the account_number hasn't resolved yet (defensive; it is NOT NULL
  // on prod), render inline exactly as before rather than redirect to a broken URL.
  if (
    agencyShellEnabled &&
    !tierLoading &&
    (tierKey === "agency" || tierKey === "enterprise")
  ) {
    const acctNum = activeTenant?.account_number;
    if (acctNum != null) {
      return <Navigate to={`/agency/${acctNum}/command-center`} replace />;
    }
    return (
      <AdminLoaderBoundary>
        <Suspense fallback={<PageSkeleton />}>
          <AgencyApp mode="agency" />
        </Suspense>
      </AdminLoaderBoundary>
    );
  }

  // Gate B — sub-account: PINNED to mode="subaccount" so a sub-account NEVER sees the
  // parent aggregate/switcher (the §51 invariant is enforced inside AgencyApp: in
  // "subaccount" mode `acting` is provably null and the parent-aggregate is hard-off).
  // §65 R3c-i: the sub-account shell now lives at its OWN deep-linkable URL
  // (/business/{account}/{branch}), mirroring Gate A — /admin REDIRECTS there
  // instead of rendering the shell inline. §58 fallback: if account_number
  // hasn't resolved yet, render inline exactly as before rather than redirect
  // to a broken URL.
  if (
    agencyShellEnabled &&
    !tierLoading &&
    tierKey === "sub_account"
  ) {
    const acctNum = activeTenant?.account_number;
    if (acctNum != null) {
      return <Navigate to={`/business/${acctNum}/command-center`} replace />;
    }
    return (
      <AdminLoaderBoundary>
        <Suspense fallback={<PageSkeleton />}>
          <AgencyApp mode="subaccount" />
        </Suspense>
      </AdminLoaderBoundary>
    );
  }

  return (
    <AdminLoaderBoundary>
    <AdminLayout userRole={userRole}>
      <Routes>
        {/* Operator home: platform staff in godMode (no tenant selected) land on the
            Operator Command Center — the superior-to-tenant fleet dashboard — INSTEAD of
            the old Fleet redirect (§9/§30). A staff user WITH a tenant selected keeps the
            tenant Command Center; non-staff always get it.

            Gate the decision on tenant-context loading: it starts (loading:true,
            isPlatformStaff:false), so deciding before it resolves would briefly render the
            TENANT overview for a God user — which then calls a tenant-scoped RPC and 42501s,
            flashing a broken tenant dashboard as the operator's FIRST impression. Hold the
            loader until the real mode is known (no data leak either way — the RPC is
            server-gated — this is purely the first-paint impression). */}
        <Route index element={
          tenantLoading
            ? <SuspenseFallback />
            : isPlatformStaff && activeTenantId === null
              ? <Suspense fallback={<SuspenseFallback />}><OperatorCommandCenter /></Suspense>
              : <AdminOverview />
        } />
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
          {/* CONVERSATIONS — a pathless <ConversationsTabsLayout> adds a subordinate
              sub-tab strip (GHL-parity: sections OF Conversations, not top-nav). The
              index child resolves BYTE-IDENTICAL to /admin/clients-hub/conversations so
              every existing link/caller still lands on the inbox (§37). Snippets embeds
              the live SnippetsTab; Settings is the tenant messaging-config home
              (numbers, business texting, consent, signatures, notifications — §45/§18).
              The other three are crafted "coming soon" EmptyState stubs (§11). */}
          <Route path="conversations" element={<ConversationsTabsLayout />}>
            <Route index element={
              <Suspense fallback={<SuspenseFallback />}><ClientsConversations /></Suspense>
            } />
            <Route path="manual-actions" element={<ConversationsManualActions />} />
            <Route path="snippets" element={<ConversationsSnippets />} />
            <Route path="trigger-links" element={<ConversationsTriggerLinks />} />
            <Route path="analytics" element={<ConversationsAnalytics />} />
            <Route path="settings" element={
              <Suspense fallback={<SuspenseFallback />}><ConversationsSettings /></Suspense>
            } />
          </Route>
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
          {/* Integrations is the REAL hub, mounted inline as the ONE home (§18/§31).
              The standalone /admin/integrations index redirects here (below). */}
          <Route path="integrations" element={
            <AdminOnly><Suspense fallback={<SuspenseFallback />}><IntegrationsHub /></Suspense></AdminOnly>
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
          {/* Team is NOT a Setup sub-tab — it has its own main-nav hub (/admin/team).
              Removed to kill nav duplication (§18). */}
        </Route>
        {/* Legacy /admin/tasks now lands on the real Planning hub — the task
            manager the owner asked to be "wired to the admin user". The old
            TasksAdmin page is retired from the router; notifications and any
            saved deep-links resolve to Planning. */}
        <Route path="tasks" element={<Navigate to="/admin/planning" replace />} />
        {/* #616: Coaches folded into the one Team home; coach roster opens filtered. */}
        <Route path="coaches" element={<Navigate to="/admin/team?role=coach" replace />} />
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
          {/* Paige hub. Widened from AdminOnly → allowPlatformStaff (§9): the operator
              Command Center's "Open Paige" + the new Paige nav item route here, and a
              SCOPED Platform Admin (super_admin/platform_admin without the tenant "admin"
              AppRole, not the hardcoded owner) would otherwise hit the RoleGate wall. The
              hardcoded owner already cleared it via allowOwner; this admits scoped staff too. */}
          <Route path="playbook" element={
            <RoleGate allow={["admin"]} allowPlatformStaff>
              <Suspense fallback={<SuspenseFallback />}>
                <PlaybookAdmin />
              </Suspense>
            </RoleGate>
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
          {/* #244 — learn about your Paige team. Same gate as the Paige hub
              (admin + platform-staff) so the sub-tab never dead-ends (§9). */}
          <Route path="paige-team" element={
            <RoleGate allow={["admin"]} allowPlatformStaff>
              <Suspense fallback={<SuspenseFallback />}><PaigeTeamDirectory scope="operator" /></Suspense>
            </RoleGate>
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
        {/* §60 route gate: Growth/Campaigns is a creation surface — solo/sub/enterprise/god
            only, NOT agency (RequireFeature redirects an ineligible tier to /admin, §13). */}
        <Route path="campaigns" element={
          <RequireFeature feature="growth">
            <Suspense fallback={<SuspenseFallback />}><CampaignsHub /></Suspense>
          </RequireFeature>
        } />
        {/* Vibe Studio — its own immersive room. StudioLayout renders the persistent left rail
            once and swaps the body via <Outlet/> (§18: one home each, one in-surface nav).
            HOME = the gradient-hero dashboard + gallery (index /admin/studio).
            NEW  = a thin creator that mints a session then redirects into the builder.
            BUILDER = the StudioShell, opened FOR a session (/admin/studio/:sessionId). */}
        {/* §60 route gate: the whole Vibe Studio branch (index/new/library/:sessionId) is
            a creation surface — solo/sub/enterprise/god only, NOT agency (§13, not nav-only). */}
        <Route path="studio" element={
          <RequireFeature feature="studio"><StudioLayout /></RequireFeature>
        }>
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
        {/* Integrations now lives in Setup as the ONE home (§18): the hub is mounted
            at /admin/setup/integrations. Redirect the old index so saved deep-links,
            the connector back-links, and the AdminLayout Setup alias all resolve there.
            The /admin/integrations/:sub deep config pages stay mounted below. */}
        <Route path="integrations" element={<Navigate to="/admin/setup/integrations" replace />} />
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
        <Route path="integrations/email" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><EmailIntegrationConfig /></Suspense></AdminOnly>
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
        {/* #616: Members & Roles consolidated into the one Team home (/admin/team). */}
        <Route path="members" element={<Navigate to="/admin/team" replace />} />
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
        <Route path="platform/fleet-communications" element={
          <PlatformOwnerOnly><Suspense fallback={<SuspenseFallback />}><PlatformFleetCommunications /></Suspense></PlatformOwnerOnly>
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
        {/* Operator-issued invite links (God-level, §9) — generate + revoke prospect invites. */}
        <Route path="platform/invites" element={
          <PlatformStaffOnly><Suspense fallback={<SuspenseFallback />}><PlatformInvites /></Suspense></PlatformStaffOnly>
        } />
        {/* Super Admin restructure — the 9 NEW operator console surfaces (SPINE slice).
            Each renders one honest §13 in-development placeholder (§18 one home each);
            deep builds are follow-ups. All gated by <PlatformStaffOnly> (§9 — the nav
            gate is presentation only; this route wrapper + RLS are the real boundary).
            FOLLOW-UP: money / doctrine / prompt-forge / compliance / content-defaults /
            deploy-health are ownerOnly:true in the contract. No PlatformOwnerOnly React
            guard exists yet, so they use PlatformStaffOnly for now — tighten to
            owner-only gating when the real surfaces land. */}
        <Route path="platform/marketplace" element={
          <PlatformStaffOnly><Suspense fallback={<SuspenseFallback />}><MarketplaceOperatorAdmin /></Suspense></PlatformStaffOnly>
        } />
        <Route path="platform/money" element={
          <PlatformOwnerOnly><Suspense fallback={<SuspenseFallback />}><MoneySpineAdmin /></Suspense></PlatformOwnerOnly>
        } />
        <Route path="platform/doctrine" element={
          <PlatformOwnerOnly><Suspense fallback={<SuspenseFallback />}><DoctrineAdmin /></Suspense></PlatformOwnerOnly>
        } />
        <Route path="platform/prompt-forge" element={
          <PlatformOwnerOnly><Suspense fallback={<SuspenseFallback />}><PromptForgeAdmin /></Suspense></PlatformOwnerOnly>
        } />
        <Route path="platform/model-router" element={
          <PlatformStaffOnly><Suspense fallback={<SuspenseFallback />}><ModelRouterAdmin /></Suspense></PlatformStaffOnly>
        } />
        <Route path="platform/compliance" element={
          <PlatformOwnerOnly><Suspense fallback={<SuspenseFallback />}><ComplianceAdmin /></Suspense></PlatformOwnerOnly>
        } />
        <Route path="platform/content-defaults" element={
          <PlatformOwnerOnly><Suspense fallback={<SuspenseFallback />}><ContentDefaultsAdmin /></Suspense></PlatformOwnerOnly>
        } />
        <Route path="platform/analytics" element={
          <PlatformStaffOnly><Suspense fallback={<SuspenseFallback />}><PlatformAnalyticsAdmin /></Suspense></PlatformStaffOnly>
        } />
        <Route path="platform/deploy-health" element={
          <PlatformOwnerOnly><Suspense fallback={<SuspenseFallback />}><DeployHealthAdmin /></Suspense></PlatformOwnerOnly>
        } />
        {/* Orphan-path redirects (F1/F24): known stray URLs land on their real surface
            instead of a silent blank. The operator command-center home is the index route
            (/admin); the security surface is /admin/security. */}
        <Route path="command-center" element={<Navigate to="/admin" replace />} />
        <Route path="platform/security-canary" element={<Navigate to="/admin/security" replace />} />
        {/* Scoped catch-all: any other unmatched /admin/* path renders a real 404 INSIDE the
            admin shell instead of a blank content area (the App-level "*" NotFound can't fire
            here — the outer /admin/* route already consumed the match). Uses AdminNotFound
            (token-aware, SPA-recovering) rather than the marketing NotFound so it reads
            correctly in the dark admin theme and keeps the operator inside the app (§11/§23).
            Specificity ranking keeps this lowest priority regardless of position. */}
        <Route path="*" element={<AdminNotFound />} />
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
