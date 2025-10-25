import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Activity, Database, Zap, AlertCircle } from "lucide-react";

export function SystemMetrics() {
  const [apiLogs, setApiLogs] = useState<any[]>([]);
  const [rateLimits, setRateLimits] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalApiCalls: 0,
    errorRate: 0,
    avgResponseTime: 0,
    activeRateLimits: 0,
  });

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      // Fetch API logs
      const { data: logs } = await supabase
        .from("financial_api_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      setApiLogs(logs || []);

      // Fetch rate limits
      const { data: limits } = await supabase
        .from("api_rate_limits")
        .select("*")
        .order("window_start", { ascending: false })
        .limit(50);

      setRateLimits(limits || []);

      // Calculate stats
      const errorCount = logs?.filter(l => l.response_status >= 400).length || 0;
      setStats({
        totalApiCalls: logs?.length || 0,
        errorRate: logs ? (errorCount / logs.length) * 100 : 0,
        avgResponseTime: 0, // Would need response time data
        activeRateLimits: limits?.filter(l => l.request_count >= 30).length || 0,
      });
    } catch (error) {
      console.error("Error fetching metrics:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">API Calls (24h)</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalApiCalls}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.errorRate.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
            <Zap className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgResponseTime}ms</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Rate Limit Hits</CardTitle>
            <Database className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeRateLimits}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent API Calls</CardTitle>
          <CardDescription>Financial API activity log</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>User</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Badge variant="outline">{log.api_provider}</Badge>
                  </TableCell>
                  <TableCell className="text-sm font-mono">{log.api_endpoint}</TableCell>
                  <TableCell>
                    <Badge>{log.request_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={log.response_status < 400 ? "default" : "destructive"}>
                      {log.response_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.user_id.substring(0, 8)}...
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rate Limiting Status</CardTitle>
          <CardDescription>Current rate limit tracking</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Function</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Window Start</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rateLimits.map((limit) => (
                <TableRow key={limit.id}>
                  <TableCell className="font-mono text-sm">{limit.function_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {limit.user_id?.substring(0, 8) || "N/A"}...
                  </TableCell>
                  <TableCell>
                    <Badge variant={limit.request_count >= 30 ? "destructive" : "secondary"}>
                      {limit.request_count}/30
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(limit.window_start).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
