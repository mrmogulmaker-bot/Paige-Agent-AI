import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Mail, MessageSquare, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";

interface LogRow {
  id: string;
  user_id: string;
  channel: string;
  message_type: string;
  status: string;
  subject: string | null;
  preview: string | null;
  error_message: string | null;
  created_at: string;
}

const CommunicationsAdmin = () => {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [stats, setStats] = useState({
    emailsThisMonth: 0,
    smsThisMonth: 0,
    emailSuccessRate: 0,
    smsSuccessRate: 0,
    emailEnabledPct: 0,
    smsEnabledPct: 0,
    unsubscribedCount: 0,
    failuresThisMonth: 0,
  });

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthStartISO = monthStart.toISOString();

      const [logRes, allLogsRes, prefsRes, totalProfilesRes] = await Promise.all([
        supabase
          .from("communication_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("communication_log")
          .select("channel, status")
          .gte("created_at", monthStartISO),
        supabase
          .from("communication_preferences")
          .select("email_enabled, sms_enabled, sms_phone_verified, unsubscribed_all"),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true }),
      ]);

      if (logRes.data) setLogs(logRes.data as LogRow[]);

      const allLogs = (allLogsRes.data as any[]) ?? [];
      const emails = allLogs.filter((l) => l.channel === "email");
      const sms = allLogs.filter((l) => l.channel === "sms");
      const emailSuccess = emails.filter((l) =>
        ["queued", "sent", "delivered"].includes(l.status),
      ).length;
      const smsSuccess = sms.filter((l) => ["sent", "delivered", "queued"].includes(l.status)).length;

      const prefs = (prefsRes.data as any[]) ?? [];
      const emailOptIn = prefs.filter((p) => p.email_enabled && !p.unsubscribed_all).length;
      const smsOptIn = prefs.filter(
        (p) => p.sms_enabled && p.sms_phone_verified && !p.unsubscribed_all,
      ).length;
      const unsubCount = prefs.filter((p) => p.unsubscribed_all).length;
      const totalUsers = totalProfilesRes.count || prefs.length || 1;

      const failures = allLogs.filter((l) => l.status === "failed" || l.status === "bounced").length;

      setStats({
        emailsThisMonth: emails.length,
        smsThisMonth: sms.length,
        emailSuccessRate: emails.length ? Math.round((emailSuccess / emails.length) * 100) : 0,
        smsSuccessRate: sms.length ? Math.round((smsSuccess / sms.length) * 100) : 0,
        emailEnabledPct: Math.round((emailOptIn / totalUsers) * 100),
        smsEnabledPct: Math.round((smsOptIn / totalUsers) * 100),
        unsubscribedCount: unsubCount,
        failuresThisMonth: failures,
      });
    } catch (err) {
      console.error("Failed to load communications data", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const failures = logs.filter((l) => l.status === "failed" || l.status === "bounced");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Communications</h1>
        <p className="text-muted-foreground">
          Email + SMS dispatch overview and audit log for this month.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Emails (MTD)</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.emailsThisMonth}</div>
            <p className="text-xs text-muted-foreground">{stats.emailSuccessRate}% delivered</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">SMS (MTD)</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.smsThisMonth}</div>
            <p className="text-xs text-muted-foreground">{stats.smsSuccessRate}% delivered</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Opt-in Rates</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm">Email: <strong>{stats.emailEnabledPct}%</strong></div>
            <div className="text-sm">SMS: <strong>{stats.smsEnabledPct}%</strong></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.failuresThisMonth}</div>
            <p className="text-xs text-muted-foreground">{stats.unsubscribedCount} unsubscribed</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="recent">
        <TabsList>
          <TabsTrigger value="recent">Recent Activity</TabsTrigger>
          <TabsTrigger value="failures">Failures ({failures.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="recent">
          <Card>
            <CardHeader>
              <CardTitle>Last 100 Communications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-4">When</th>
                      <th className="py-2 pr-4">Channel</th>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">User</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((row) => (
                      <tr key={row.id} className="border-b">
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {new Date(row.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline">{row.channel}</Badge>
                        </td>
                        <td className="py-2 pr-4">{row.message_type}</td>
                        <td className="py-2 pr-4 font-mono text-xs">
                          {row.user_id.slice(0, 8)}…
                        </td>
                        <td className="py-2 pr-4">
                          <Badge
                            variant={
                              row.status === "failed" || row.status === "bounced"
                                ? "destructive"
                                : "default"
                            }
                          >
                            {row.status}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 max-w-xs truncate text-muted-foreground">
                          {row.preview ?? row.subject ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                          No communications yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failures">
          <Card>
            <CardHeader>
              <CardTitle>Failed Deliveries</CardTitle>
            </CardHeader>
            <CardContent>
              {failures.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No failures — nice.</p>
              ) : (
                <div className="space-y-3">
                  {failures.map((row) => (
                    <div key={row.id} className="border rounded-md p-3 space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{new Date(row.created_at).toLocaleString()}</span>
                        <Badge variant="destructive">{row.status}</Badge>
                      </div>
                      <div className="text-sm">
                        <strong>{row.channel}</strong> · {row.message_type} · user{" "}
                        <span className="font-mono text-xs">{row.user_id.slice(0, 8)}…</span>
                      </div>
                      {row.error_message && (
                        <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                          {row.error_message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CommunicationsAdmin;
