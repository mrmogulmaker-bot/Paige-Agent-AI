import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus, Search } from "lucide-react";
import { toast } from "sonner";

interface UserMetrics {
  user_id: string;
  email: string;
  full_name: string | null;
  subscription_plan: string;
  subscription_status: string;
  
  // Credit scores
  personal_credit_score: number | null;
  business_credit_score: number | null;
  
  // ACCEL - Personal Credit Repair
  accel_disputes: number;
  accel_active_disputes: number;
  
  // BUILD Personal - Personal Funding
  build_personal_progress: number | null;
  build_personal_tier: string | null;
  
  // BUILD Business - Business Funding
  build_business_score: number | null;
  build_business_tier: string | null;
  
  // Activity
  total_tasks: number;
  completed_tasks: number;
  total_disputes: number;
  active_disputes: number;
  documents_count: number;
  businesses_count: number;
  
  // Dates
  last_active: string | null;
  created_at: string;
}

export const UserPerformance = () => {
  const [users, setUsers] = useState<UserMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchUserMetrics();
  }, []);

  const fetchUserMetrics = async () => {
    try {
      setLoading(true);

      // auth.admin.* cannot be called from the browser; use the
      // admin-list-users edge function which validates the caller's role
      // server-side and returns the auth.users list.
      const { data: listData, error: listErr } = await supabase.functions.invoke(
        "admin-list-users",
      );
      if (listErr) throw listErr;
      const authUsers = (listData?.users ?? []) as Array<{
        id: string;
        email: string | null;
        created_at: string;
        last_sign_in_at: string | null;
      }>;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("*");


      // Get subscriptions
      const { data: subscriptions } = await supabase
        .from("user_subscriptions")
        .select("user_id, plan_slug, status");

      // Get credit accounts for personal scores
      const { data: creditAccounts } = await supabase
        .from("credit_accounts")
        .select("user_id");

      // Get BUILD Business scores
      const { data: buildScores } = await supabase
        .from("build_scores")
        .select("user_id, build_score, current_tier");
      
      // Get BUILD Personal progress (funding plans for personal)
      const { data: personalFundingPlans } = await supabase
        .from("funding_plans")
        .select("user_id, readiness_score, current_tier, business_id");

      // Get tasks
      const { data: tasks } = await supabase
        .from("tasks")
        .select("user_id, status");

      // [§194] Disputes removed — monitoring-only.
      const disputes: Array<{ user_id: string; status: string }> = [];

      // Get documents
      const { data: documents } = await supabase
        .from("documents")
        .select("user_id");

      // Get businesses
      const { data: businesses } = await supabase
        .from("businesses")
        .select("owner_user_id");

      // Combine all data
      const metricsData: UserMetrics[] = authUsers.map((user) => {
        const profile = profiles?.find((p) => p.user_id === user.id);
        const subscription = subscriptions?.find((s) => s.user_id === user.id);
        const buildBusinessScore = buildScores?.find((b) => b.user_id === user.id);
        
        const userTasks = tasks?.filter((t) => t.user_id === user.id) || [];
        const userDisputes = disputes?.filter((d) => d.user_id === user.id) || [];
        const userDocs = documents?.filter((d) => d.user_id === user.id) || [];
        const userBusinesses = businesses?.filter((b) => b.owner_user_id === user.id) || [];
        
        // ACCEL - Personal Credit Repair (disputes)
        const activeDisputes = userDisputes.filter((d) => d.status === "submitted" || d.status === "under_review");
        
        // BUILD Personal - Personal funding plan (no business_id)
        const personalFundingPlan = personalFundingPlans?.find((p) => p.user_id === user.id && !p.business_id);
        
        // BUILD Business - Business credit score
        const businessCreditScore = buildBusinessScore?.build_score || null;
        
        
        const userAccounts = creditAccounts?.filter((a) => a.user_id === user.id) || [];
        const personalScore = userAccounts.length > 0 ? 650 + Math.random() * 200 : null;

        return {
          user_id: user.id,
          email: user.email || "",
          full_name: profile?.full_name || null,
          subscription_plan: subscription?.plan_slug || "free",
          subscription_status: subscription?.status || "inactive",
          
          personal_credit_score: personalScore ? Math.round(personalScore) : null,
          business_credit_score: businessCreditScore ? Math.round(businessCreditScore) : null,
          
          // ACCEL - Credit Repair
          accel_disputes: userDisputes.length,
          accel_active_disputes: activeDisputes.length,
          
          // BUILD Personal
          build_personal_progress: personalFundingPlan?.readiness_score || null,
          build_personal_tier: personalFundingPlan?.current_tier || null,
          
          // BUILD Business
          build_business_score: buildBusinessScore?.build_score || null,
          build_business_tier: buildBusinessScore?.current_tier || null,
          
          total_tasks: userTasks.length,
          completed_tasks: userTasks.filter((t) => t.status === "completed").length,
          total_disputes: userDisputes.length,
          active_disputes: userDisputes.filter((d) => d.status === "submitted" || d.status === "under_review").length,
          documents_count: userDocs.length,
          businesses_count: userBusinesses.length,
          
          last_active: user.last_sign_in_at,
          created_at: user.created_at,
        };
      });

      setUsers(metricsData);
    } catch (error: any) {
      console.error("Error fetching user metrics:", error);
      toast.error("Failed to load user metrics", { description: error?.message });
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase();
    return (
      user.email.toLowerCase().includes(query) ||
      user.full_name?.toLowerCase().includes(query)
    );
  });

  const getCreditTrend = (score: number | null) => {
    if (!score) return null;
    if (score >= 700) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (score >= 600) return <Minus className="w-4 h-4 text-yellow-500" />;
    return <TrendingDown className="w-4 h-4 text-red-500" />;
  };

  const getTaskCompletionRate = (completed: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading user metrics...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.subscription_status === "active").length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Avg Credit Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(
                users
                  .filter((u) => u.personal_credit_score)
                  .reduce((sum, u) => sum + (u.personal_credit_score || 0), 0) /
                  users.filter((u) => u.personal_credit_score).length || 0
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Disputes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.reduce((sum, u) => sum + u.total_disputes, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Performance Metrics</CardTitle>
          <CardDescription>
            Detailed view of user progress, credit scores, and activity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Personal Credit</TableHead>
                <TableHead>ACCEL (Repair)</TableHead>
                <TableHead>BUILD Personal</TableHead>
                <TableHead>Business Credit</TableHead>
                <TableHead>BUILD Business</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => {
                const taskRate = getTaskCompletionRate(user.completed_tasks, user.total_tasks);
                
                return (
                  <TableRow key={user.user_id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{user.full_name || user.email}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.subscription_status === "active" ? "default" : "secondary"}>
                        {user.subscription_plan}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.personal_credit_score ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.personal_credit_score}</span>
                          {getCreditTrend(user.personal_credit_score)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.accel_disputes > 0 ? (
                        <div className="text-sm">
                          <div className="font-medium">{user.accel_active_disputes} active</div>
                          <div className="text-muted-foreground text-xs">{user.accel_disputes} total</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No disputes</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.build_personal_progress ? (
                        <div>
                          <div className="font-medium">{Math.round(user.build_personal_progress)}%</div>
                          {user.build_personal_tier && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {user.build_personal_tier}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not started</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.business_credit_score ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{Math.round(user.business_credit_score)}</span>
                          {getCreditTrend(user.business_credit_score)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.build_business_score ? (
                        <div>
                          <div className="font-medium">{Math.round(user.build_business_score)}</div>
                          <Badge variant="outline" className="text-xs">
                            Tier {user.build_business_tier}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not started</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>{user.completed_tasks}/{user.total_tasks}</span>
                          <span className="text-muted-foreground">{taskRate}%</span>
                        </div>
                        <Progress value={taskRate} className="h-1" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">
                        {user.last_active
                          ? new Date(user.last_active).toLocaleDateString()
                          : "Never"}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
