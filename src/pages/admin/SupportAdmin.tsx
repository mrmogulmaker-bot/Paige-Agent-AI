import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TableCell, TableRow } from "@/components/ui/table";
import { Inbox, Activity, AlertTriangle, Clock, CheckCircle2, Lightbulb, Download, ArrowUp } from "lucide-react";
import {
  PageShell, PageHeader, StatRow, StatTile, SectionCard, DataTableShell, EmptyState,
  Toolbar, FilterChip, StatePill, type Column, type PillState,
} from "@/components/ui/page";
import {
  TICKET_STATUS_LABEL, FEATURE_STATUS_LABEL,
  ticketCategoryLabel, featureCategoryLabel, timeAgo,
  type TicketStatus, type TicketPriority, type FeatureStatus,
} from "@/components/support/supportTypes";
import { AdminTicketPanel } from "@/components/support/AdminTicketPanel";
import { AdminFeatureRequestPanel } from "@/components/support/AdminFeatureRequestPanel";

// State-carrying pills replace the badge color soup — legible by label, gold spent
// only on the on-moment (§6). Green = resolved/shipped, destructive = urgent/declined.
const TICKET_STATUS_PILL: Record<TicketStatus, PillState> = {
  open: "pending",
  in_progress: "pending",
  waiting_on_client: "pending",
  resolved: "success",
  closed: "off",
};
const PRIORITY_PILL: Record<TicketPriority, PillState> = {
  low: "off",
  normal: "off",
  high: "pending",
  urgent: "error",
};
const FEATURE_STATUS_PILL: Record<FeatureStatus, PillState> = {
  submitted: "off",
  under_review: "pending",
  planned: "pending",
  in_progress: "pending",
  shipped: "success",
  declined: "error",
};

const TICKET_COLUMNS: Column[] = [
  { key: "ticket", header: "Ticket" },
  { key: "client", header: "Client", className: "hidden sm:table-cell" },
  { key: "category", header: "Category", className: "hidden md:table-cell" },
  { key: "subject", header: "Subject" },
  { key: "priority", header: "Priority", className: "hidden sm:table-cell" },
  { key: "status", header: "Status" },
  { key: "assignee", header: "Assignee", className: "hidden md:table-cell" },
  { key: "created", header: "Created", className: "hidden lg:table-cell" },
  { key: "updated", header: "Updated", className: "hidden lg:table-cell" },
];

const FEATURE_COLUMNS: Column[] = [
  { key: "title", header: "Title" },
  { key: "category", header: "Category" },
  { key: "votes", header: "Votes", numeric: true },
  { key: "status", header: "Status" },
  { key: "submitter", header: "Submitter", className: "hidden md:table-cell" },
  { key: "submitted", header: "Submitted", className: "hidden lg:table-cell" },
  { key: "response", header: "Response" },
];

interface AdminTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: string | null;
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
  const [adminName, setAdminName] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "mine" | "unassigned">("all");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setAdminUserId(uid);
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", uid)
          .maybeSingle();
        setAdminName((prof as any)?.full_name || data.user?.email || null);
      }
      await loadAll();
    })();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: t }, { data: f }] = await Promise.all([
        supabase
          .from("support_tickets")
          .select("id,ticket_number,user_id,subject,category,status,priority,assigned_to,created_at,updated_at,resolved_at")
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
          .from("coach_client_profiles_safe")
          .select("user_id,full_name")
          .in("user_id", userIds);
        profilesById = Object.fromEntries(
          (profs ?? []).map((p: any) => [p.user_id, { full_name: p.full_name, email: null as string | null }]),
        );
        // Emails live in auth.users; hydrate via admin-list-users edge function.
        try {
          const { data: usersRes } = await supabase.functions.invoke("admin-list-users", { body: {} });
          const usersList: Array<{ id: string; email: string | null }> = usersRes?.users ?? [];
          for (const u of usersList) {
            if (!userIds.includes(u.id)) continue;
            const existing = profilesById[u.id] ?? { full_name: null, email: null };
            profilesById[u.id] = { ...existing, email: u.email };
          }
        } catch {
          // non-fatal: emails simply won't render
        }
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

  const filteredOpenTickets = useMemo(() => {
    if (assigneeFilter === "all") return openTickets;
    if (assigneeFilter === "unassigned") return openTickets.filter((t) => !t.assigned_to);
    if (assigneeFilter === "mine" && adminName) {
      return openTickets.filter((t) => t.assigned_to === adminName);
    }
    return openTickets;
  }, [openTickets, assigneeFilter, adminName]);
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

  const initials = (name: string) =>
    name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

  const TicketTable = ({ rows, loading: tableLoading }: { rows: AdminTicket[]; loading?: boolean }) => (
    <DataTableShell
      columns={TICKET_COLUMNS}
      loading={tableLoading}
      isEmpty={!tableLoading && rows.length === 0}
      empty={
        <EmptyState
          icon={Inbox}
          title="No tickets to show"
          description="When clients open a ticket, it lands right here for your team to work."
        />
      }
    >
      {rows.map((t) => (
        <TableRow key={t.id} className="cursor-pointer" onClick={() => setActiveTicketId(t.id)}>
          <TableCell className="font-mono text-xs">{t.ticket_number}</TableCell>
          <TableCell className="hidden sm:table-cell">
            <div className="text-sm">{t.client_name || "—"}</div>
            <div className="text-xs text-muted-foreground">{t.client_email || ""}</div>
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <Badge variant="outline">{ticketCategoryLabel(t.category)}</Badge>
          </TableCell>
          <TableCell className="max-w-[260px] truncate">{t.subject}</TableCell>
          <TableCell className="hidden sm:table-cell">
            <StatePill state={PRIORITY_PILL[t.priority]}>
              {t.priority === "urgent" && <AlertTriangle className="w-3 h-3" />}
              {t.priority}
            </StatePill>
          </TableCell>
          <TableCell>
            <StatePill state={TICKET_STATUS_PILL[t.status]}>{TICKET_STATUS_LABEL[t.status]}</StatePill>
          </TableCell>
          <TableCell className="hidden md:table-cell">
            {t.assigned_to ? (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                  {initials(t.assigned_to)}
                </span>
                <span className="text-xs">{t.assigned_to}</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">Unassigned</span>
            )}
          </TableCell>
          <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(t.created_at)}</TableCell>
          <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(t.updated_at)}</TableCell>
        </TableRow>
      ))}
    </DataTableShell>
  );

  return (
    <PageShell width="wide">
      <PageHeader
        variant="hero"
        eyebrow="Support"
        title="Support & Feedback"
        description="Manage client tickets and product feedback in one place."
      />

      <Tabs defaultValue="open">
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <TabsList className="w-max">
            <TabsTrigger value="open" className="gap-2"><Inbox className="w-4 h-4" /> Open Tickets</TabsTrigger>
            <TabsTrigger value="all" className="gap-2"><Activity className="w-4 h-4" /> All Tickets</TabsTrigger>
            <TabsTrigger value="features" className="gap-2"><Lightbulb className="w-4 h-4" /> Feature Requests</TabsTrigger>
          </TabsList>
        </div>

        {/* OPEN TICKETS */}
        <TabsContent value="open" className="space-y-4 pt-4">
          <StatRow cols={4}>
            <StatTile label="Open" value={openCount} icon={Inbox} loading={loading} />
            <StatTile label="In Progress" value={inProgressCount} icon={Activity} loading={loading} />
            <StatTile
              label="Urgent"
              value={urgentCount}
              icon={AlertTriangle}
              intent={urgentCount > 0 ? "negative" : "neutral"}
              loading={loading}
            />
            <StatTile label="Avg Resolution" value={`${avgResolutionHours.toFixed(1)}h`} icon={Clock} loading={loading} />
          </StatRow>

          {/* Assignee filter chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Filter:</span>
            <FilterChip active={assigneeFilter === "all"} onClick={() => setAssigneeFilter("all")}>
              All ({openTickets.length})
            </FilterChip>
            <FilterChip
              active={assigneeFilter === "mine"}
              onClick={() => adminName && setAssigneeFilter("mine")}
            >
              My Tickets ({adminName ? openTickets.filter((t) => t.assigned_to === adminName).length : 0})
            </FilterChip>
            <FilterChip active={assigneeFilter === "unassigned"} onClick={() => setAssigneeFilter("unassigned")}>
              Unassigned ({openTickets.filter((t) => !t.assigned_to).length})
            </FilterChip>
          </div>

          <TicketTable rows={filteredOpenTickets} loading={loading} />
        </TabsContent>

        {/* ALL TICKETS */}
        <TabsContent value="all" className="space-y-4 pt-4">
          <SectionCard>
            <Toolbar>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">From</label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">To</label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
                </div>
              </div>
              <Button variant="outline" onClick={exportCsv} className="gap-2">
                <Download className="w-4 h-4" /> Export CSV
              </Button>
            </Toolbar>
          </SectionCard>
          <TicketTable rows={filteredAllTickets} loading={loading} />
        </TabsContent>

        {/* FEATURE REQUESTS */}
        <TabsContent value="features" className="space-y-4 pt-4">
          <StatRow cols={4}>
            <StatTile label="Total Requests" value={features.length} icon={Lightbulb} loading={loading} />
            <StatTile label="Total Votes" value={totalVotes} icon={ArrowUp} loading={loading} />
            <StatTile label="Planned / In Progress" value={plannedCount} icon={Activity} loading={loading} />
            <StatTile
              label="Shipped"
              value={shippedCount}
              icon={CheckCircle2}
              intent={shippedCount > 0 ? "positive" : "neutral"}
              loading={loading}
            />
          </StatRow>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <DataTableShell
                columns={FEATURE_COLUMNS}
                loading={loading}
                isEmpty={!loading && features.length === 0}
                empty={
                  <EmptyState
                    icon={Lightbulb}
                    title="No feature requests yet"
                    description="Ideas your clients and team submit will collect here, ranked by votes."
                  />
                }
              >
                {features.map((f) => (
                  <TableRow key={f.id} className="cursor-pointer" onClick={() => setActiveFeatureId(f.id)}>
                    <TableCell className="font-medium max-w-[240px] truncate">{f.title}</TableCell>
                    <TableCell><Badge variant="outline">{featureCategoryLabel(f.category)}</Badge></TableCell>
                    <TableCell className="text-right"><span className="font-bold tabular-nums">{f.vote_count}</span></TableCell>
                    <TableCell>
                      <StatePill state={FEATURE_STATUS_PILL[f.status]}>{FEATURE_STATUS_LABEL[f.status]}</StatePill>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="text-xs">{f.submitter_name || "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{f.submitter_email || ""}</div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(f.created_at)}</TableCell>
                    <TableCell>
                      {f.admin_response ? (
                        <StatePill state="success">Yes</StatePill>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </DataTableShell>
            </div>

            {/* Top 10 widget */}
            <SectionCard title="Top 10 Most Requested" icon={ArrowUp}>
              <ol className="space-y-2">
                {top10.map((f, idx) => (
                  <li key={f.id} className="flex items-start gap-2 text-sm">
                    <span className="text-xs font-bold text-muted-foreground tabular-nums w-5 mt-0.5">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => setActiveFeatureId(f.id)}
                        className="font-medium text-left hover:text-primary line-clamp-2"
                      >
                        {f.title}
                      </button>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {featureCategoryLabel(f.category)}
                        </Badge>
                        <span className="text-xs font-semibold text-foreground tabular-nums">{f.vote_count} votes</span>
                      </div>
                    </div>
                  </li>
                ))}
                {top10.length === 0 && (
                  <li className="text-sm text-muted-foreground">No requests yet.</li>
                )}
              </ol>
            </SectionCard>
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
    </PageShell>
  );
}
