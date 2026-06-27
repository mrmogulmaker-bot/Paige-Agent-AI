import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Download, Users, Briefcase, Sparkles, Tag } from "lucide-react";
import { toast } from "sonner";
import {
  LIFECYCLE_STAGES, lifecycleMeta, contactsToCSV, downloadCSV,
} from "@/lib/contacts";
import { formatMoney } from "@/lib/pipelines";
import { NewContactDialog } from "@/components/admin/contacts/NewContactDialog";
import { formatDistanceToNow } from "date-fns";

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  entity_name: string | null;
  funding_goal: number | null;
  status: string;
  lifecycle_stage: string;
  source: string | null;
  title: string | null;
  tags: string[] | null;
  lead_score: number | null;
  last_contacted_at: string | null;
  do_not_contact: boolean | null;
  assigned_coach_user_id: string | null;
  linked_user_id: string | null;
  created_at: string;
};

type Coach = { user_id: string; name: string };
type Rollup = {
  contact_id: string;
  open_deals: number;
  won_deals: number;
  open_value_cents: number;
  won_value_cents: number;
};

export default function ContactsAdmin() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [rollup, setRollup] = useState<Record<string, Rollup>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState<string>("all");
  const [coachFilter, setCoachFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [clientsRes, rolesRes, rollupRes] = await Promise.all([
        supabase.from("clients").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id").eq("role", "coach"),
        supabase.from("contact_deal_rollup").select("*"),
      ]);
      if (clientsRes.error) throw clientsRes.error;
      setClients((clientsRes.data || []) as ClientRow[]);

      const coachIds = (rolesRes.data || []).map((r: any) => r.user_id);
      if (coachIds.length) {
        const { data: profs } = await supabase
          .from("profiles").select("user_id, full_name").in("user_id", coachIds);
        setCoaches((profs || []).map((p: any) => ({
          user_id: p.user_id, name: p.full_name || "Unnamed Coach",
        })));
      }

      const map: Record<string, Rollup> = {};
      ((rollupRes.data || []) as Rollup[]).forEach((r) => { map[r.contact_id] = r; });
      setRollup(map);
    } catch (e: any) {
      toast.error(e.message || "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  };

  const coachName = (id: string | null) =>
    id ? (coaches.find((c) => c.user_id === id)?.name || "Coach") : "Unassigned";

  const allTags = useMemo(() => {
    const s = new Set<string>();
    clients.forEach((c) => (c.tags || []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [clients]);

  const filtered = useMemo(() => clients.filter((c) => {
    if (lifecycle !== "all" && (c.lifecycle_stage || "lead") !== lifecycle) return false;
    if (coachFilter === "unassigned" && c.assigned_coach_user_id) return false;
    if (coachFilter !== "all" && coachFilter !== "unassigned" && c.assigned_coach_user_id !== coachFilter) return false;
    if (tagFilter !== "all" && !(c.tags || []).includes(tagFilter)) return false;
    if (search) {
      const s = search.toLowerCase();
      const hay = `${c.first_name} ${c.last_name} ${c.email || ""} ${c.entity_name || ""} ${(c.tags || []).join(" ")}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }), [clients, search, lifecycle, coachFilter, tagFilter]);

  const stats = useMemo(() => {
    const totalOpenDeals = Object.values(rollup).reduce((a, r) => a + (r.open_deals || 0), 0);
    const totalOpenValue = Object.values(rollup).reduce((a, r) => a + (r.open_value_cents || 0), 0);
    const customers = clients.filter((c) => c.lifecycle_stage === "customer").length;
    const leads = clients.filter((c) => ["lead", "mql", "sql"].includes(c.lifecycle_stage)).length;
    return { totalOpenDeals, totalOpenValue, customers, leads };
  }, [clients, rollup]);

  const assignCoach = async (clientId: string, coachId: string | null) => {
    const { error } = await supabase.from("clients").update({ assigned_coach_user_id: coachId }).eq("id", clientId);
    if (error) return toast.error(error.message);
    toast.success(coachId ? "Coach assigned" : "Coach unassigned");
    setClients((prev) => prev.map((c) => c.id === clientId ? { ...c, assigned_coach_user_id: coachId } : c));
  };

  const updateLifecycle = async (clientId: string, stage: string) => {
    const { error } = await supabase.from("clients").update({ lifecycle_stage: stage }).eq("id", clientId);
    if (error) return toast.error(error.message);
    setClients((prev) => prev.map((c) => c.id === clientId ? { ...c, lifecycle_stage: stage } : c));
  };

  const exportCSV = () => {
    const rows = filtered.map((c) => ({
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      phone: c.phone,
      business: c.entity_name,
      title: c.title,
      lifecycle: c.lifecycle_stage,
      source: c.source,
      tags: (c.tags || []).join("; "),
      coach: coachName(c.assigned_coach_user_id),
      open_deals: rollup[c.id]?.open_deals || 0,
      open_value: ((rollup[c.id]?.open_value_cents || 0) / 100).toFixed(2),
      created_at: c.created_at,
    }));
    downloadCSV(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, contactsToCSV(rows));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Your CRM contact book — segment, assign, and push straight into the pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New contact
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Total contacts" value={clients.length.toString()} />
        <StatCard icon={Sparkles} label="Active leads (Lead → SQL)" value={stats.leads.toString()} />
        <StatCard icon={Briefcase} label="Open deals" value={stats.totalOpenDeals.toString()} sub={formatMoney(stats.totalOpenValue)} />
        <StatCard icon={Tag} label="Customers" value={stats.customers.toString()} />
      </div>

      <Card className="p-3 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, business, tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={lifecycle} onValueChange={setLifecycle}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Lifecycle" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lifecycle stages</SelectItem>
            {LIFECYCLE_STAGES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={coachFilter} onValueChange={setCoachFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Coach" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All coaches</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {coaches.map((c) => (
              <SelectItem key={c.user_id} value={c.user_id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tag" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      {/* Lifecycle quick filter chips */}
      <div className="flex flex-wrap gap-2">
        <Chip active={lifecycle === "all"} onClick={() => setLifecycle("all")} label={`All · ${clients.length}`} />
        {LIFECYCLE_STAGES.map((s) => {
          const count = clients.filter((c) => c.lifecycle_stage === s.value).length;
          if (count === 0 && s.value !== lifecycle) return null;
          return (
            <Chip
              key={s.value}
              active={lifecycle === s.value}
              onClick={() => setLifecycle(s.value)}
              label={`${s.label} · ${count}`}
              colorClass={s.color}
            />
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading contacts…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <div className="font-medium">No contacts match your filters</div>
            <div className="text-sm text-muted-foreground mb-4">
              {clients.length === 0 ? "Add your first contact to get started." : "Try clearing filters or change your search."}
            </div>
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New contact
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Contact</th>
                  <th className="px-4 py-3 text-left">Lifecycle</th>
                  <th className="px-4 py-3 text-left">Tags</th>
                  <th className="px-4 py-3 text-right">Open deals</th>
                  <th className="px-4 py-3 text-left">Coach</th>
                  <th className="px-4 py-3 text-left">Last touch</th>
                  <th className="px-4 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const meta = lifecycleMeta(c.lifecycle_stage);
                  const r = rollup[c.id];
                  const name = `${c.first_name} ${c.last_name}`.trim() || c.email || "Unnamed";
                  return (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <button
                          className="text-left"
                          onClick={() => navigate(`/admin/contacts/${c.id}`)}
                        >
                          <div className="font-medium">{name}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.entity_name || "—"}{c.email ? ` · ${c.email}` : ""}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={c.lifecycle_stage || "lead"}
                          onValueChange={(v) => updateLifecycle(c.id, v)}
                        >
                          <SelectTrigger className="h-8 w-[150px] border-0 bg-transparent p-0 focus:ring-0">
                            <Badge variant="outline" className={`${meta.color} border-transparent`}>
                              {meta.label}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {LIFECYCLE_STAGES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(c.tags || []).slice(0, 3).map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                          ))}
                          {(c.tags || []).length > 3 && (
                            <span className="text-xs text-muted-foreground">+{(c.tags || []).length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium">{r?.open_deals || 0}</div>
                        <div className="text-xs text-muted-foreground">
                          {r?.open_value_cents ? formatMoney(r.open_value_cents) : "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={c.assigned_coach_user_id || "unassigned"}
                          onValueChange={(v) => assignCoach(c.id, v === "unassigned" ? null : v)}
                        >
                          <SelectTrigger className="h-8 w-[170px]">
                            <SelectValue>{coachName(c.assigned_coach_user_id)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {coaches.map((co) => (
                              <SelectItem key={co.user_id} value={co.user_id}>{co.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {c.last_contacted_at
                          ? formatDistanceToNow(new Date(c.last_contacted_at), { addSuffix: true })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/admin/contacts/${c.id}`)}
                        >
                          Open
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewContactDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => navigate(`/admin/contacts/${id}`)}
      />
    </div>
  );
}

function Chip({
  active, onClick, label, colorClass,
}: { active: boolean; onClick: () => void; label: string; colorClass?: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : `border-border hover:bg-muted/50 ${colorClass || ""}`
      }`}
    >
      {label}
    </button>
  );
}

function StatCard({
  icon: Icon, label, value, sub,
}: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
      </div>
    </Card>
  );
}
