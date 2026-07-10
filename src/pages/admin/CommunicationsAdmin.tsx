import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Mail, MessageSquare, TrendingUp, AlertTriangle, ShieldCheck } from "lucide-react";
import {
  PageShell,
  PageHeader,
  StatRow,
  StatTile,
  SectionCard,
  DataTableShell,
  EmptyState,
  StatePill,
} from "@/components/ui/page";
import { TableCell, TableRow } from "@/components/ui/table";

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

const isFailedStatus = (status: string) => status === "failed" || status === "bounced";

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

  const failures = logs.filter((l) => isFailedStatus(l.status));

  return (
    <PageShell width="wide">
      <PageHeader
        variant="hero"
        eyebrow="Platform"
        title="Communications"
        description="Email and SMS dispatch overview, plus this month's audit log."
      />

      <StatRow cols={4}>
        <StatTile
          label="Emails (MTD)"
          value={stats.emailsThisMonth}
          icon={Mail}
          hint={`${stats.emailSuccessRate}% delivered`}
          loading={loading}
        />
        <StatTile
          label="SMS (MTD)"
          value={stats.smsThisMonth}
          icon={MessageSquare}
          hint={`${stats.smsSuccessRate}% delivered`}
          loading={loading}
        />
        <StatTile
          label="Opt-in (Email / SMS)"
          value={`${stats.emailEnabledPct}% / ${stats.smsEnabledPct}%`}
          icon={TrendingUp}
          hint="of all users opted in"
          loading={loading}
        />
        <StatTile
          label="Issues"
          value={stats.failuresThisMonth}
          icon={AlertTriangle}
          intent="negative"
          hint={`${stats.unsubscribedCount} unsubscribed`}
          loading={loading}
        />
      </StatRow>

      <Tabs defaultValue="recent">
        <TabsList>
          <TabsTrigger value="recent">Recent Activity</TabsTrigger>
          <TabsTrigger value="failures">Failures ({failures.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="recent">
          <DataTableShell
            columns={[
              { key: "when", header: "When" },
              { key: "channel", header: "Channel" },
              { key: "type", header: "Type" },
              { key: "user", header: "User" },
              { key: "status", header: "Status" },
              { key: "preview", header: "Preview" },
            ]}
            loading={loading}
            isEmpty={logs.length === 0}
            empty={
              <EmptyState
                icon={Mail}
                title="Nothing has gone out yet"
                description="The moment Paige sends an email or text, every dispatch lands here with its delivery status."
              />
            }
          >
            {logs.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="capitalize">{row.channel}</TableCell>
                <TableCell>{row.message_type}</TableCell>
                <TableCell className="font-mono text-xs">{row.user_id.slice(0, 8)}…</TableCell>
                <TableCell>
                  <StatePill state={isFailedStatus(row.status) ? "error" : "success"}>
                    {row.status}
                  </StatePill>
                </TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">
                  {row.preview ?? row.subject ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </DataTableShell>
        </TabsContent>

        <TabsContent value="failures">
          {failures.length === 0 ? (
            <SectionCard>
              <EmptyState
                icon={ShieldCheck}
                title="Every message landed"
                description="No bounces, no failures this month. When one slips, it shows up here with the reason so you can fix it fast."
              />
            </SectionCard>
          ) : (
            <div className="space-y-3">
              {failures.map((row) => (
                <SectionCard key={row.id}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{new Date(row.created_at).toLocaleString()}</span>
                      <StatePill state="error">{row.status}</StatePill>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold capitalize">{row.channel}</span> · {row.message_type} · user{" "}
                      <span className="font-mono text-xs">{row.user_id.slice(0, 8)}…</span>
                    </div>
                    {row.error_message && (
                      <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                        {row.error_message}
                      </div>
                    )}
                  </div>
                </SectionCard>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
};

export default CommunicationsAdmin;
