import React, { useEffect, useState, Suspense, lazy as reactLazy } from "react";

// Auto-recover from stale chunk errors after a deploy: when index.html is
// cached but references hashed JS chunks that no longer exist, dynamic imports
// throw "Failed to fetch dynamically imported module". We reload once
// (guarded by sessionStorage) to pick up the fresh index.html.
const lazy = <T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) =>
  reactLazy(async () => {
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
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
import { useNavigate, Routes, Route, useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Users, FileText, DollarSign, TrendingUp } from "lucide-react";
import { ExportClientsButton } from "@/components/dashboard/admin/ExportClientsButton";
import { toast } from "sonner";
import { RoleGate } from "@/components/auth/RoleGate";
import { AdminLoaderBoundary } from "@/components/admin/AdminLoaderBoundary";

/** Wraps a route element so it's only visible to admins (or platform owner). */
const AdminOnly = ({ children }: { children: React.ReactNode }) => (
  <RoleGate allow={["admin"]}>{children}</RoleGate>
);


// Lazy-load admin sub-pages
const ClientManagementDashboard = lazy(() => import("@/components/dashboard/ClientManagementDashboard").then(m => ({ default: m.ClientManagementDashboard })));
const ClientFileView = lazy(() => import("@/components/dashboard/ClientFileView").then(m => ({ default: m.ClientFileView })));
const InternalClientFileView = lazy(() => import("@/components/dashboard/InternalClientFileView").then(m => ({ default: m.InternalClientFileView })));
const FundingMatchAccuracy = lazy(() => import("@/components/dashboard/admin/FundingMatchAccuracy").then(m => ({ default: m.FundingMatchAccuracy })));
const KnowledgeBaseReviewQueue = lazy(() => import("@/components/dashboard/admin/KnowledgeBaseReviewQueue").then(m => ({ default: m.KnowledgeBaseReviewQueue })));
const LenderBureauManager = lazy(() => import("@/components/dashboard/admin/LenderBureauManager").then(m => ({ default: m.LenderBureauManager })));
const FundingPortfolioView = lazy(() => import("@/components/dashboard/admin/FundingPortfolioView").then(m => ({ default: m.FundingPortfolioView })));
const FundingPipelineView = lazy(() => import("@/components/dashboard/admin/FundingPipelineView").then(m => ({ default: m.FundingPipelineView })));
const UserManagement = lazy(() => import("@/components/dashboard/UserManagement").then(m => ({ default: m.UserManagement })));
const AdminSettingsHub = lazy(() => import("@/pages/admin/AdminSettingsHub"));
const PlatformTenants = lazy(() => import("@/pages/admin/PlatformTenants"));
const UserPerformance = lazy(() => import("@/components/dashboard/UserPerformance").then(m => ({ default: m.UserPerformance })));
const DataMaintenancePanel = lazy(() => import("@/components/admin/DataMaintenancePanel").then(m => ({ default: m.DataMaintenancePanel })));
const AffiliatesAdmin = lazy(() => import("@/pages/admin/AffiliatesAdmin"));
const MyReferralsPanel = lazy(() => import("@/components/dashboard/MyReferralsPanel"));
const KnowledgeBaseAdmin = lazy(() => import("@/pages/admin/KnowledgeBaseAdmin"));
const TenantKnowledgeAdmin = lazy(() => import("@/pages/admin/TenantKnowledgeAdmin"));
const NetworkKbInsights = lazy(() => import("@/pages/admin/NetworkKbInsights"));
const SecurityCanaryAdmin = lazy(() => import("@/pages/admin/SecurityCanaryAdmin"));
const LegalAdmin = lazy(() => import("@/pages/admin/LegalAdmin"));
const AgreementsAdmin = lazy(() => import("@/pages/admin/AgreementsAdmin"));
const AILearningOverview = lazy(() => import("@/components/admin/AILearningOverview").then(m => ({ default: m.AILearningOverview })));
const CommunicationsAdmin = lazy(() => import("@/pages/admin/CommunicationsAdmin"));
const BrokersAdmin = lazy(() => import("@/pages/admin/BrokersAdmin"));
const AnalyticsDashboard = lazy(() => import("@/pages/admin/AnalyticsDashboard"));
const SupportAdmin = lazy(() => import("@/pages/admin/SupportAdmin"));
const ContactsAdmin = lazy(() => import("@/pages/admin/ContactsAdmin"));
const ContactDetail = lazy(() => import("@/pages/admin/ContactDetail"));
const ClientJourney = lazy(() => import("@/pages/admin/ClientJourney"));
const CoachesAdmin = lazy(() => import("@/pages/admin/CoachesAdmin"));
const PipelineAdmin = lazy(() => import("@/pages/admin/PipelineAdmin"));
const PipelineSettings = lazy(() => import("@/pages/admin/PipelineSettings"));
const TasksAdmin = lazy(() => import("@/pages/admin/TasksAdmin"));
const SubAgentsAdmin = lazy(() => import("@/pages/admin/SubAgentsAdmin"));
const SkillsHub = lazy(() => import("@/pages/admin/SkillsHub"));
const WorkflowsList = lazy(() => import("@/pages/admin/WorkflowsList"));
const CampaignsAdmin = lazy(() => import("@/pages/admin/CampaignsAdmin"));
const CampaignsHub = lazy(() => import("@/pages/admin/CampaignsHub"));
const WorkflowDetail = lazy(() => import("@/pages/admin/WorkflowDetail"));
const WorkflowRuns = lazy(() => import("@/pages/admin/WorkflowRuns"));
const WorkflowRunDetail = lazy(() => import("@/pages/admin/WorkflowRunDetail"));
const ApprovalsInbox = lazy(() => import("@/pages/admin/ApprovalsInbox"));
const ApprovalDetail = lazy(() => import("@/pages/admin/ApprovalDetail"));
const AdminNotifications = lazy(() => import("@/pages/admin/AdminNotifications"));
const IntegrationsHub = lazy(() => import("@/pages/admin/IntegrationsHub"));
const N8nIntegrationConfig = lazy(() => import("@/pages/admin/N8nIntegrationConfig"));
const SubscriptionsRevenue = lazy(() => import("@/pages/admin/SubscriptionsRevenue"));
const GhlIntegrationConfig = lazy(() => import("@/pages/admin/GhlIntegrationConfig"));
const ZapierIntegrationConfig = lazy(() => import("@/pages/admin/ZapierIntegrationConfig"));
const TelegramIntegrationConfig = lazy(() => import("@/pages/admin/TelegramIntegrationConfig"));
const GmailIntegrationConfig = lazy(() => import("@/pages/admin/GmailIntegrationConfig"));

const AiActivity = lazy(() => import("@/pages/admin/AiActivity"));
const DocuSignConfig = lazy(() => import("@/pages/admin/DocuSignConfig"));
const SignaturesAdmin = lazy(() => import("@/pages/admin/SignaturesAdmin"));
const CalIntegrationConfig = lazy(() => import("@/pages/admin/CalIntegrationConfig"));
const BookingsAdmin = lazy(() => import("@/pages/admin/BookingsAdmin"));
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
const GrowthHub = lazy(() => import("@/pages/admin/GrowthHub"));



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
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeSubscriptions: 0,
    pendingApplications: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roleList = (roles || []).map((r: any) => r.role);
      const isAdmin = roleList.includes("admin");
      const isCoach = roleList.includes("coach");

      if (!isAdmin && !isCoach) {
        toast.error("Access denied. Admin or coach privileges required.");
        navigate("/app");
        return;
      }

      setUserRole(isAdmin ? "admin" : "coach");
      await fetchStats();
    } catch (error) {
      console.error("Admin access check error:", error);
      navigate("/app");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const [usersRes, subsRes, ordersRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("user_subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("orders").select("amount").eq("status", "completed"),
      ]);

      const totalRevenue = ordersRes.data?.reduce((sum, order) => sum + Number(order.amount), 0) || 0;

      setStats({
        totalUsers: usersRes.count || 0,
        activeSubscriptions: subsRes.count || 0,
        pendingApplications: 0,
        totalRevenue,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

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
        <Route index element={<AdminOverview stats={stats} />} />
        <Route path="contacts" element={
          <Suspense fallback={<SuspenseFallback />}><ContactsAdmin /></Suspense>
        } />
        <Route path="contacts/:id" element={
          <Suspense fallback={<SuspenseFallback />}><ContactDetail /></Suspense>
        } />
        <Route path="clients/:id/journey" element={
          <Suspense fallback={<SuspenseFallback />}><ClientJourney /></Suspense>
        } />
        <Route path="contacts/:id/journey" element={
          <Suspense fallback={<SuspenseFallback />}><ClientJourney /></Suspense>
        } />
        <Route path="pipeline" element={
          <Suspense fallback={<SuspenseFallback />}><PipelineAdmin /></Suspense>
        } />
        <Route path="tasks" element={
          <Suspense fallback={<SuspenseFallback />}><TasksAdmin /></Suspense>
        } />
        <Route path="coaches" element={
          <Suspense fallback={<SuspenseFallback />}><CoachesAdmin /></Suspense>
        } />
        <Route path="growth" element={<Navigate to="/admin/campaigns?tab=pages" replace />} />
        <Route path="growth/*" element={<Navigate to="/admin/campaigns?tab=pages" replace />} />
        <Route path="sub-agents" element={
          <Suspense fallback={<SuspenseFallback />}><SubAgentsAdmin /></Suspense>
        } />
        <Route path="skills" element={
          <Suspense fallback={<SuspenseFallback />}><SkillsHub /></Suspense>
        } />
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
        <Route path="funding" element={<Suspense fallback={<SuspenseFallback />}><FundingPortfolioView /></Suspense>} />
        <Route path="funding-pipeline" element={<Suspense fallback={<SuspenseFallback />}><FundingPipelineView /></Suspense>} />
        <Route path="analytics" element={
          <Suspense fallback={<SuspenseFallback />}>
            <div className="space-y-8">
              <AnalyticsDashboard />
              <FundingMatchAccuracy />
            </div>
          </Suspense>
        } />
        <Route path="knowledge" element={
          <Suspense fallback={<SuspenseFallback />}>
            <div className="space-y-6">
              <KnowledgeBaseReviewQueue />
              <LenderBureauManager />
            </div>
          </Suspense>
        } />
        <Route path="maintenance" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <DataMaintenancePanel />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="affiliates" element={
          <Suspense fallback={<SuspenseFallback />}>
            {userRole === "admin" ? <AffiliatesAdmin /> : <MyReferralsPanel />}
          </Suspense>
        } />
        <Route path="knowledge-base" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <KnowledgeBaseAdmin />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="tenant-knowledge" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <TenantKnowledgeAdmin />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="network-kb" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <NetworkKbInsights />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="security" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <SecurityCanaryAdmin />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="legal" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <LegalAdmin />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="agreements" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <AgreementsAdmin />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="communications" element={
          <Suspense fallback={<SuspenseFallback />}>
            <CommunicationsAdmin />
          </Suspense>
        } />
        <Route path="brokers" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <BrokersAdmin />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="support" element={
          <Suspense fallback={<SuspenseFallback />}>
            <SupportAdmin />
          </Suspense>
        } />
        <Route path="settings" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <AdminSettingsHub />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="settings/pipelines" element={
          <AdminOnly>
            <Suspense fallback={<SuspenseFallback />}>
              <PipelineSettings />
            </Suspense>
          </AdminOnly>
        } />
        <Route path="workflows" element={
          <Suspense fallback={<SuspenseFallback />}><WorkflowsList /></Suspense>
        } />
        <Route path="campaigns" element={
          <Suspense fallback={<SuspenseFallback />}><CampaignsHub /></Suspense>
        } />
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
        <Route path="approvals/:id" element={
          <Suspense fallback={<SuspenseFallback />}><ApprovalDetail /></Suspense>
        } />
        <Route path="integrations" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><IntegrationsHub /></Suspense></AdminOnly>
        } />
        <Route path="integrations/n8n" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><N8nIntegrationConfig /></Suspense></AdminOnly>
        } />
        <Route path="integrations/subscriptions" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><SubscriptionsRevenue /></Suspense></AdminOnly>
        } />
        <Route path="integrations/ghl" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><GhlIntegrationConfig /></Suspense></AdminOnly>
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
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><UsageAnalytics /></Suspense></AdminOnly>
        } />
        <Route path="observability/errors" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><ErrorTracking /></Suspense></AdminOnly>
        } />
        <Route path="integrations/nav" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><NavIntegrationConfig /></Suspense></AdminOnly>
        } />
        <Route path="business-credit" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><BusinessCreditAdmin /></Suspense></AdminOnly>
        } />
        <Route path="integrations/smartcredit" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><SmartCreditIntegrationConfig /></Suspense></AdminOnly>
        } />
        <Route path="owner-credit" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><OwnerCreditAdmin /></Suspense></AdminOnly>
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
          <Suspense fallback={<SuspenseFallback />}><FundingLensHub /></Suspense>
        } />
        <Route path="platform/tenants" element={
          <AdminOnly><Suspense fallback={<SuspenseFallback />}><PlatformTenants /></Suspense></AdminOnly>
        } />
      </Routes>

    </AdminLayout>
  );
};


function AdminOverview({ stats }: { stats: { totalUsers: number; activeSubscriptions: number; pendingApplications: number; totalRevenue: number } }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">Overview of your platform activity</p>
        </div>
        <ExportClientsButton />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeSubscriptions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Applications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingApplications}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalRevenue.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Suspense fallback={<SuspenseFallback />}>
        <AILearningOverview />
      </Suspense>

      <Suspense fallback={<SuspenseFallback />}>
        <UserPerformance />
      </Suspense>
    </div>
  );
}

export default Admin;
