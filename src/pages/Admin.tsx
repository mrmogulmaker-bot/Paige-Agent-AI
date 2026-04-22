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
import { useNavigate, Routes, Route, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Users, FileText, DollarSign, TrendingUp } from "lucide-react";
import { ExportClientsButton } from "@/components/dashboard/admin/ExportClientsButton";
import { toast } from "sonner";

// Lazy-load admin sub-pages
const ClientManagementDashboard = lazy(() => import("@/components/dashboard/ClientManagementDashboard").then(m => ({ default: m.ClientManagementDashboard })));
const ClientFileView = lazy(() => import("@/components/dashboard/ClientFileView").then(m => ({ default: m.ClientFileView })));
const InternalClientFileView = lazy(() => import("@/components/dashboard/InternalClientFileView").then(m => ({ default: m.InternalClientFileView })));
const DisputesManager = lazy(() => import("@/components/dashboard/DisputesManager").then(m => ({ default: m.DisputesManager })));
const DisputeAnalytics = lazy(() => import("@/components/dashboard/admin/DisputeAnalytics").then(m => ({ default: m.DisputeAnalytics })));
const FundingMatchAccuracy = lazy(() => import("@/components/dashboard/admin/FundingMatchAccuracy").then(m => ({ default: m.FundingMatchAccuracy })));
const KnowledgeBaseReviewQueue = lazy(() => import("@/components/dashboard/admin/KnowledgeBaseReviewQueue").then(m => ({ default: m.KnowledgeBaseReviewQueue })));
const LenderBureauManager = lazy(() => import("@/components/dashboard/admin/LenderBureauManager").then(m => ({ default: m.LenderBureauManager })));
const FundingPortfolioView = lazy(() => import("@/components/dashboard/admin/FundingPortfolioView").then(m => ({ default: m.FundingPortfolioView })));
const FundingPipelineView = lazy(() => import("@/components/dashboard/admin/FundingPipelineView").then(m => ({ default: m.FundingPipelineView })));
const UserManagement = lazy(() => import("@/components/dashboard/UserManagement").then(m => ({ default: m.UserManagement })));
const UserPerformance = lazy(() => import("@/components/dashboard/UserPerformance").then(m => ({ default: m.UserPerformance })));
const DataMaintenancePanel = lazy(() => import("@/components/admin/DataMaintenancePanel").then(m => ({ default: m.DataMaintenancePanel })));
const AffiliatesAdmin = lazy(() => import("@/pages/admin/AffiliatesAdmin"));
const MyReferralsPanel = lazy(() => import("@/components/dashboard/MyReferralsPanel"));
const KnowledgeBaseAdmin = lazy(() => import("@/pages/admin/KnowledgeBaseAdmin"));
const AILearningOverview = lazy(() => import("@/components/admin/AILearningOverview").then(m => ({ default: m.AILearningOverview })));
const CommunicationsAdmin = lazy(() => import("@/pages/admin/CommunicationsAdmin"));
const BrokersAdmin = lazy(() => import("@/pages/admin/BrokersAdmin"));
const AnalyticsDashboard = lazy(() => import("@/pages/admin/AnalyticsDashboard"));

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
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse text-muted-foreground">Loading admin workspace...</div>
      </div>
    );
  }

  return (
    <AdminLayout userRole={userRole}>
      <Routes>
        <Route index element={<AdminOverview stats={stats} />} />
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
        <Route path="disputes" element={<Suspense fallback={<SuspenseFallback />}><DisputesManager /></Suspense>} />
        <Route path="funding" element={<Suspense fallback={<SuspenseFallback />}><FundingPortfolioView /></Suspense>} />
        <Route path="funding-pipeline" element={<Suspense fallback={<SuspenseFallback />}><FundingPipelineView /></Suspense>} />
        <Route path="analytics" element={
          <Suspense fallback={<SuspenseFallback />}>
            <div className="space-y-8">
              <AnalyticsDashboard />
              <DisputeAnalytics />
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
          <Suspense fallback={<SuspenseFallback />}>
            <DataMaintenancePanel />
          </Suspense>
        } />
        <Route path="affiliates" element={
          <Suspense fallback={<SuspenseFallback />}>
            {userRole === "admin" ? <AffiliatesAdmin /> : <MyReferralsPanel />}
          </Suspense>
        } />
        <Route path="knowledge-base" element={
          <Suspense fallback={<SuspenseFallback />}>
            <KnowledgeBaseAdmin />
          </Suspense>
        } />
        <Route path="communications" element={
          <Suspense fallback={<SuspenseFallback />}>
            <CommunicationsAdmin />
          </Suspense>
        } />
        <Route path="brokers" element={
          <Suspense fallback={<SuspenseFallback />}>
            {userRole === "admin" ? <BrokersAdmin /> : <div className="p-6 text-muted-foreground">Admin only.</div>}
          </Suspense>
        } />
        <Route path="settings" element={
          <Suspense fallback={<SuspenseFallback />}>
            <UserManagement />
          </Suspense>
        } />
      </Routes>
    </AdminLayout>
  );
};

function AdminOverview({ stats }: { stats: { totalUsers: number; activeSubscriptions: number; pendingApplications: number; totalRevenue: number } }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your platform activity</p>
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
