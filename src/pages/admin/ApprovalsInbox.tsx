import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePendingApprovals, type ApprovalQueueRow } from "@/hooks/usePendingApprovals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import {
  Inbox, Check, X, Mic, Timer, AlertOctagon, User, Search, Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import FieldIngestionTab from "@/components/admin/FieldIngestionTab";
import {
  CATEGORY_LABEL, RISK_COLOR, SLA_COLOR, type ApprovalCategory,
} from "@/lib/approvals";

const SLA_LABEL: Record<string, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  on_track: "On track",
  closed: "Closed",
  unscheduled: "No SLA",
};

function contactLabel(a: ApprovalQueueRow): string {
  if (a.contact_first_name || a.contact_last_name) {
    return `${a.contact_first_name ?? ""} ${a.contact_last_name ?? ""}`.trim();
  }
  if (a.contact_email) return a.contact_email;
  return "—";
}

export default function ApprovalsInbox() {
  const [scope, setScope] = useState<"all" | "mine">("all");
  const { items, loading } = usePendingApprovals({ scope });

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [risk, setRisk] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    return items.filter((a) => {
      if (category !== "all" && (a.category ?? "other") !== category) return false;
      if (risk !== "all" && (a.risk_level ?? "") !== risk) return false;
      if (search) {
        const hay = [
          a.summary, a.contact_first_name, a.contact_last_name,
          a.contact_email, a.source, a.category,
          JSON.stringify(a.draft_content ?? {}).slice(0, 500),
        ].join(" ").toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [items, category, risk, search]);

  const kpis = useMemo(() => {
    const open = items.length;
    const overdue = items.filter((i) => i.sla_state === "overdue").length;
    const critical = items.filter((i) => (i.priority ?? 5) <= 1 || i.risk_level === "blocker").length;
    const avgAge = items.length
      ? Math.round(items.reduce((s, i) => s + i.age_seconds, 0) / items.length / 3600)
      : 0;
    return { open, overdue, critical, avgAge };
  }, [items]);

  // Group filtered by category
  const groups = useMemo(() => {
    const byCat = new Map<string, ApprovalQueueRow[]>();
    for (const a of filtered) {
      const k = a.category ?? "other";
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(a);
    }
    return Array.from(byCat.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const toggle = (id: string, on: boolean) =>
    setSelected((p) => {
      const n = new Set(p);
      on ? n.add(id) : n.delete(id);
      return n;
    });

  const clear = () => setSelected(new Set());
  const selectAll = () => setSelected(new Set(filtered.map((f) => f.id)));

  const bulk = async (decision: "approve" | "reject") => {
    if (selected.size === 0) return;
    setBusy(true);
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("paige_pending_approvals")
      .update({
        status: decision === "approve" ? "approved" : "rejected",
        reviewed_at: new Date().toISOString(),
      })
      .in("id", ids);
    setBusy(false);
    clear();
    if (error) { toast.error(error.message); return; }
    toast.success(`${decision === "approve" ? "Approved" : "Rejected"} ${ids.length}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Inbox className="w-6 h-6" /> Approvals
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every human-in-the-loop decision — drafts, dispute letters, refunds, tier changes, field ingest — in one place.
        </p>
      </div>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue" className="gap-1.5">
            <Inbox className="w-3.5 h-3.5" /> Queue
          </TabsTrigger>
          <TabsTrigger value="field" className="gap-1.5">
            <Mic className="w-3.5 h-3.5" /> Field Ingestion
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={Inbox} label="Open" value={kpis.open} />
            <KpiCard icon={AlertOctagon} label="Overdue" value={kpis.overdue} accent={kpis.overdue > 0 ? "text-red-600" : ""} />
            <KpiCard icon={Timer} label="Critical" value={kpis.critical} accent={kpis.critical > 0 ? "text-orange-600" : ""} />
            <KpiCard icon={Clock} label="Avg age (h)" value={kpis.avgAge} />
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-4 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 mr-2">
                <Button size="sm" variant={scope === "all" ? "default" : "ghost"} onClick={() => setScope("all")}>All</Button>
                <Button size="sm" variant={scope === "mine" ? "default" : "ghost"} onClick={() => setScope("mine")}>Mine</Button>
              </div>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search summary, client, content…" className="pl-7 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={risk} onValueChange={setRisk}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Risk" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any risk</SelectItem>
                  <SelectItem value="blocker">Blocker</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              {selected.size > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                  <Button size="sm" variant="outline" onClick={() => bulk("reject")} disabled={busy}>
                    <X className="w-3.5 h-3.5 mr-1" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => bulk("approve")} disabled={busy}>
                    <Check className="w-3.5 h-3.5 mr-1" /> Approve
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Queue */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {loading ? "Loading…" : `${filtered.length} of ${items.length}`}
              </CardTitle>
              {filtered.length > 0 && (
                <Button size="sm" variant="ghost" onClick={selected.size === filtered.length ? clear : selectAll}>
                  {selected.size === filtered.length ? "Clear" : "Select all"}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              {!loading && filtered.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Inbox zero. Nothing waiting for review.
                </p>
              )}

              {groups.map(([cat, rows]) => (
                <div key={cat} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                    <span className="font-semibold">{CATEGORY_LABEL[cat as ApprovalCategory] ?? cat}</span>
                    <span className="text-muted-foreground/60">· {rows.length}</span>
                  </div>
                  {rows.map((a) => (
                    <ApprovalRow
                      key={a.id}
                      a={a}
                      selected={selected.has(a.id)}
                      onToggle={(on) => toggle(a.id, on)}
                    />
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="field" className="mt-4">
          <FieldIngestionTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, accent,
}: { icon: any; label: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`text-xl font-semibold ${accent ?? ""}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ApprovalRow({
  a, selected, onToggle,
}: { a: ApprovalQueueRow; selected: boolean; onToggle: (on: boolean) => void }) {
  const dc = a.draft_content as Record<string, unknown> | string | null;
  const fallback =
    typeof dc === "object" && dc !== null
      ? String((dc as any).subject ?? (dc as any).body ?? (dc as any).preview ?? "")
      : String(dc ?? "");
  const preview = a.summary ?? fallback;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${selected ? "bg-muted/60 border-accent" : "hover:bg-muted/40"}`}>
      <Checkbox checked={selected} onCheckedChange={(c) => onToggle(c === true)} className="mt-1" />
      <Link to={`/admin/approvals/${a.id}`} className="min-w-0 flex-1 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {a.risk_level && (
              <Badge variant="outline" className={`text-[10px] ${RISK_COLOR[a.risk_level] ?? ""}`}>
                {a.risk_level}
              </Badge>
            )}
            {a.priority && a.priority <= 2 && (
              <Badge variant="destructive" className="text-[10px]">P{a.priority}</Badge>
            )}
            <Badge className={`text-[10px] ${SLA_COLOR[a.sla_state] ?? ""}`}>
              <Timer className="w-3 h-3 mr-1" />
              {SLA_LABEL[a.sla_state]}
            </Badge>
            {a.source && (
              <span className="text-[10px] text-muted-foreground">from {a.source}</span>
            )}
          </div>
          <p className="text-sm font-medium line-clamp-1">{preview || "(no summary)"}</p>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {a.contact_id && (
              <span className="inline-flex items-center gap-1">
                <User className="w-3 h-3" /> {contactLabel(a)}
              </span>
            )}
            {a.requires_role && <span>· needs {a.requires_role}</span>}
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap mt-0.5">
          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
        </span>
      </Link>
    </div>
  );
}
