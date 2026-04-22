import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Inbox, Activity, AlertTriangle, Clock, CheckCircle2, Lightbulb, Download, ArrowUp } from "lucide-react";
import {
  TICKET_STATUS_LABEL, TICKET_STATUS_STYLES, PRIORITY_STYLES, FEATURE_STATUS_LABEL, FEATURE_STATUS_STYLES,
  ticketCategoryLabel, featureCategoryLabel, timeAgo,
  type TicketStatus, type TicketPriority, type FeatureStatus,
} from "@/components/support/supportTypes";
import { AdminTicketPanel } from "@/components/support/AdminTicketPanel";
import { AdminFeatureRequestPanel } from "@/components/support/AdminFeatureRequestPanel";

interface AdminTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  client_name?: string | null;
  client_email?: string | null;
}

interface AdminFeature {
  id: string;
  user_id: string;
  title: string;
  category: string;
  status: FeatureStatus;
  vote_count: number;
  admin_response: string | null;
  created_at: string;
  submitter_name?: string | null;
  submitter_email?: string | null;
}

export default function SupportAdmin() {
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [features, setFeatures] = useState<AdminFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      setAdminUserId(data.user?.id ?? null);
      await loadAll();
    })();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: t }, { data: f }] = await Promise.all([
        supabase
          .from("support_tickets")
          .select("id,ticket_number,user_id,subject,category,status,priority,created_at,updated_at,resolved_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("feature_requests")
          .select("id,user_id,title,category,status,vote_count,admin_response,created_at")
          .order("vote_count", { ascending: false })
          .limit(500),
      ]);

      const ticketRows = (t ?? []) as AdminTicket[];
      const featureRows = (f ?? []) as AdminFeature[];

      const userIds = Array.from(new Set([
        ...ticketRows.map((x) => x.user_id),
        ...featureRows.map((x) => x.user_id),
      ]));

      let profilesById: Record<string, { full_name: string | null; email: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id,full_name,email")
          .in("user_id", userIds);
        profilesById = Object.fromEntries(
          (profs ?? []).map((p: any) => [p.user_id, { full_name: p.full_name, email: p.email }]),
        );
      }

      setTickets(ticketRows.map((t) => ({
        ...t,
        client_name: profilesById[t.user_id]?.full_name ?? null,
        client_email: profilesById[t.user_id]?.email ?? null,
      })));
      setFeatures(featureRows.map((f) => ({
        ...f,
        submitter_name: profilesById[f.user_id]?.full_name ?? null,
        submitter_email: profilesById[f.user_id]?.email ?? null,
      })));
    } finally {
      setLoading(false);
    }
  };

  const openTickets = useMemo(
    () => tickets.filter((t) => t.status !== "resolved" && t.status !== "closed"),
    [tickets],
  );
  const openCount = useMemo(() => tickets.filter((t) => t.status === "open").length, [tickets]);
  const inProgressCount = useMemo(() => tickets.filter((t) => t.status === "in_progress").length, [tickets]);
  const urgentCount = useMemo(
    () => tickets.filter((t) => t.priority === "urgent" && t.status !== "resolved" && t.status !== "closed").length,
    [tickets],
  );
  const avgResolutionHours = useMemo(() => {
    const resolved = tickets.filter((t) => t.resolved_at);
    if (resolved.length === 0) return 0;
    const total = resolved.reduce((sum, t) => {
      const ms = +new Date(t.resolved_at!) - +new Date(t.created_at);
      return sum + Math.max(0, ms);
    }, 0);
    return total / resolved.length / 1000 / 3600;
  }, [tickets]);

  const filteredAllTickets = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() + 86400000 : null;
    return tickets.filter((t) => {
      const created = +new Date(t.created_at);
      if (fromTs !== null && created < fromTs) return false;
      if (toTs !== null && created > toTs) return false;
      return true;
    });
  }, [tickets, dateFrom, dateTo]);

  const exportCsv = () => {
    const headers = ["ticket_number", "client_name", "client_email", "category", "subject", "priority", "status", "created_at", "updated_at", "resolved_at"];
    const rows = filteredAllTickets.map((t) => [
      t.ticket_number, t.client_name ?? "", t.client_email ?? "", t.category,
      `"${t.subject.replace(/"/g, '""')}"`, t.priority, t.status,
      t.created_at, t.updated_at, t.resolved_at ?? "",
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `support-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalVotes = useMemo(() => features.reduce((s, f) => s + f.vote_count, 0), [features]);
  const plannedCount = useMemo(
    () => features.filter((f) => f.status === "planned" || f.status === "in_progress").length,
    [features],
  );
  const shippedCount = useMemo(() => features.filter((f) => f.status === "shipped").length, [features]);
  const top10 = useMemo(() => [...features].sort((a, b) => b.vote_count - a.vote_count).slice(0, 10), [features]);

  if (!adminUserId) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  const TicketTable = ({ rows }: { rows: AdminTicket[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ticket</TableHead>
          <TableHead>Client</TableHead>
          <TableHead className="hidden md:table-cell">Category</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden lg:table-cell">Created</TableHead>
          <TableHead className="hidden lg:table-cell">Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((t) => (
          <TableRow key={t.id} className="cursor-pointer" onClick={() => setActiveTicketId(t.id)}>
            <TableCell className="font-mono text-xs">{t.ticket_number}</TableCell>
            <TableCell>
              <div className="text-sm">{t.client_name || "—"}</div>
              <div className="text-xs text-muted-foreground">{t.client_email || ""}</div>
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <Badge variant="outline">{ticketCategoryLabel(t.category)}</Badge>
            </TableCell>
            <TableCell className="max-w-[260px] truncate">{t.subject}</TableCell>
            <TableCell>
              <Badge variant="outline" className={PRIORITY_STYLES[t.priority]}>
                {t.priority === "urgent" && <AlertTriangle className="w-3 h-3 mr-1" />}
                {t.priority}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={TICKET_STATUS_STYLES[t.status]}>
                {TICKET_STATUS_LABEL[t.status]}
              </Badge>
            </TableCell>
            <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(t.created_at)}</TableCell>
            <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(t.updated_at)}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
              No tickets to show.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Support & Feedback</h1>
        <p className="text-muted-foreground mt-1">Manage client tickets and product feedback in one place.</p>
      </div>

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open" className="gap-2"><Inbox className="w-4 h-4" /> Open Tickets</TabsTrigger>
          <TabsTrigger value="all" className="gap-2"><Activity className="w-4 h-4" /> All Tickets</TabsTrigger>
          <TabsTrigger value="features" className="gap-2"><Lightbulb className="w-4 h-4" /> Feature Requests</TabsTrigger>
        </TabsList>

        {/* OPEN TICKETS */}
        <TabsContent value="open" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Open" value={openCount} icon={<Inbox className="w-4 h-4" />} tone="blue" />
            <KpiCard label="In Progress" value={inProgressCount} icon={<Activity className="w-4 h-4" />} tone="amber" />
            <KpiCard label="Urgent" value={urgentCount} icon={<AlertTriangle className="w-4 h-4" />} tone="red" />
            <KpiCard label="Avg Resolution" value={`${avgResolutionHours.toFixed(1)}h`} icon={<Clock className="w-4 h-4" />} tone="emerald" />
          </div>
          <Card className="border-border">
            {loading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading...</div>
            ) : (
              <TicketTable rows={openTickets} />
            )}
          </Card>
        </TabsContent>

        {/* ALL TICKETS */}
        <TabsContent value="all" className="space-y-4 pt-4">
          <Card className="p-4 border-border">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">From</label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">To</label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
              </div>
              <div className="flex-1" />
              <Button variant="outline" onClick={exportCsv} className="gap-2">
                <Download className="w-4 h-4" /> Export CSV
              </Button>
            </div>
          </Card>
          <Card className="border-border">
            <TicketTable rows={filteredAllTickets} />
          </Card>
        </TabsContent>

        {/* FEATURE REQUESTS */}
        <TabsContent value="features" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Total Requests" value={features.length} icon={<Lightbulb className="w-4 h-4" />} tone="blue" />
            <KpiCard label="Total Votes" value={totalVotes} icon={<ArrowUp className="w-4 h-4" />} tone="amber" />
            <KpiCard label="Planned / In Progress" value={plannedCount} icon={<Activity className="w-4 h-4" />} tone="purple" />
            <KpiCard label="Shipped" value={shippedCount} icon={<CheckCircle2 className="w-4 h-4" />} tone="emerald" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Votes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Submitter</TableHead>
                    <TableHead className="hidden lg:table-cell">Submitted</TableHead>
                    <TableHead>Response</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {features.map((f) => (
                    <TableRow key={f.id} className="cursor-pointer" onClick={() => setActiveFeatureId(f.id)}>
                      <TableCell className="font-medium max-w-[240px] truncate">{f.title}</TableCell>
                      <TableCell><Badge variant="outline">{featureCategoryLabel(f.category)}</Badge></TableCell>
                      <TableCell><span className="font-bold tabular-nums">{f.vote_count}</span></TableCell>
                      <TableCell>
                        <Badge variant="outline" className={FEATURE_STATUS_STYLES[f.status]}>
                          {FEATURE_STATUS_LABEL[f.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="text-xs">{f.submitter_name || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">{f.submitter_email || ""}</div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(f.created_at)}</TableCell>
                      <TableCell>
                        {f.admin_response ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Yes</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">—</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {features.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                        No feature requests yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>

            {/* Top 10 widget */}
            <Card className="border-border p-4">
              <h3 className="font-semibold flex items-center gap-2 mb-3">
                <ArrowUp className="w-4 h-4 text-accent" /> Top 10 Most Requested
              </h3>
              <ol className="space-y-2">
                {top10.map((f, idx) => (
                  <li key={f.id} className="flex items-start gap-2 text-sm">
                    <span className="text-xs font-bold text-muted-foreground tabular-nums w-5 mt-0.5">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => setActiveFeatureId(f.id)}
                        className="font-medium text-left hover:text-accent line-clamp-2"
                      >
                        {f.title}
                      </button>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {featureCategoryLabel(f.category)}
                        </Badge>
                        <span className="text-xs font-bold text-accent">{f.vote_count} votes</span>
                      </div>
                    </div>
                  </li>
                ))}
                {top10.length === 0 && (
                  <li className="text-sm text-muted-foreground">No requests yet.</li>
                )}
              </ol>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <AdminTicketPanel
        ticketId={activeTicketId}
        adminUserId={adminUserId}
        open={!!activeTicketId}
        onOpenChange={(o) => !o && setActiveTicketId(null)}
        onTicketUpdated={loadAll}
      />
      <AdminFeatureRequestPanel
        requestId={activeFeatureId}
        open={!!activeFeatureId}
        onOpenChange={(o) => !o && setActiveFeatureId(null)}
        onUpdated={loadAll}
      />
    </div>
  );
}

function KpiCard({ label, value, icon, tone }: { label: string; value: number | string; icon: React.ReactNode; tone: "blue" | "amber" | "red" | "emerald" | "purple" }) {
  const toneClass = {
    blue: "text-blue-600 bg-blue-500/10 border-blue-500/30",
    amber: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    red: "text-destructive bg-destructive/10 border-destructive/30",
    emerald: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
    purple: "text-purple-600 bg-purple-500/10 border-purple-500/30",
  }[tone];
  return (
    <Card className="p-4 border-border">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className={`p-1.5 rounded-md border ${toneClass}`}>{icon}</span>
      </div>
      <div className="text-2xl font-bold mt-2 tabular-nums">{value}</div>
    </Card>
  );
}
