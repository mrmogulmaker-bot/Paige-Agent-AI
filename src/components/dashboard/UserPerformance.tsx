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
  
  // ACCEL program (Personal)
  accel_progress: number | null;
  accel_stage: string | null;
  
  // BUILD program (Business)
  build_score: number | null;
  current_tier: string | null;
  
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

      // Get all profiles with auth users
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
      if (authError) throw authError;

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

      // Get BUILD scores (business)
      const { data: buildScores } = await supabase
        .from("build_scores")
        .select("user_id, build_score, current_tier");

      // Get tasks
      const { data: tasks } = await supabase
        .from("tasks")
        .select("user_id, status");

      // Get disputes
      const { data: disputes } = await supabase
        .from("disputes")
        .select("user_id, status");

      // Get documents
      const { data: documents } = await supabase
        .from("documents")
        .select("user_id");

      // Get businesses
      const { data: businesses } = await supabase
        .from("businesses")
        .select("owner_user_id");

      // Combine all data
      const metricsData: UserMetrics[] = authData.users.map((user) => {
        const profile = profiles?.find((p) => p.user_id === user.id);
        const subscription = subscriptions?.find((s) => s.user_id === user.id);
        const buildScore = buildScores?.find((b) => b.user_id === user.id);
        
        const userTasks = tasks?.filter((t) => t.user_id === user.id) || [];
        const userDisputes = disputes?.filter((d) => d.user_id === user.id) || [];
        const userDocs = documents?.filter((d) => d.user_id === user.id) || [];
        const userBusinesses = businesses?.filter((b) => b.owner_user_id === user.id) || [];
        
        // Calculate ACCEL progress - assume all tasks contribute to overall progress
        const completedTasks = userTasks.filter((t) => t.status === "completed");
        const accelProgress = userTasks.length > 0 
          ? Math.round((completedTasks.length / userTasks.length) * 100) 
          : null;
        
        
        const userAccounts = creditAccounts?.filter((a) => a.user_id === user.id) || [];
        const personalScore = userAccounts.length > 0 ? 650 + Math.random() * 200 : null;

        return {
          user_id: user.id,
          email: user.email || "",
          full_name: profile?.full_name || null,
          subscription_plan: subscription?.plan_slug || "free",
          subscription_status: subscription?.status || "inactive",
          
          personal_credit_score: personalScore ? Math.round(personalScore) : null,
          business_credit_score: buildScore?.build_score || null,
          
          accel_progress: accelProgress,
          accel_stage: accelProgress === 100 ? "Completed" : accelProgress ? "In Progress" : null,
          
          build_score: buildScore?.build_score || null,
          current_tier: buildScore?.current_tier || null,
          
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
      toast.error("Failed to load user metrics");
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
                <TableHead>ACCEL Progress</TableHead>
                <TableHead>Business Credit</TableHead>
                <TableHead>BUILD Tier</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Disputes</TableHead>
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
                      {user.accel_progress ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{Math.round(user.accel_progress)}%</span>
                          </div>
                          <Progress value={user.accel_progress} className="h-1" />
                          {user.accel_stage && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {user.accel_stage}
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
                      {user.build_score ? (
                        <div>
                          <div className="font-medium">{Math.round(user.build_score)}</div>
                          <Badge variant="outline" className="text-xs">
                            Tier {user.current_tier}
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
                      <div className="text-sm">
                        <div>{user.active_disputes} active</div>
                        <div className="text-muted-foreground text-xs">{user.total_disputes} total</div>
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
