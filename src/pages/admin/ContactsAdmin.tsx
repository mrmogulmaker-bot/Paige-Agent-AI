import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Plus, Download, Users, Briefcase, Sparkles, Tag, Pencil, BanIcon,
  Star, Filter, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  LIFECYCLE_STAGES, lifecycleMeta, contactsToCSV, downloadCSV, deleteContact,
} from "@/lib/contacts";
import { formatMoney } from "@/lib/pipelines";
import { NewContactDialog } from "@/components/admin/contacts/NewContactDialog";
import { EditContactDialog } from "@/components/admin/contacts/EditContactDialog";
import { BulkActionsBar } from "@/components/admin/contacts/BulkActionsBar";
import { formatDistanceToNow, format } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUserRoles } from "@/hooks/useUserRoles";

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  entity_name: string | null;
  title: string | null;
  funding_goal: number | null;
  status: string;
  lifecycle_stage: string;
  source: string | null;
  tags: string[] | null;
  lead_score: number | null;
  last_contacted_at: string | null;
  do_not_contact: boolean | null;
  current_notes: string | null;
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

type Segment = {
  id: string;
  label: string;
  description: string;
  match: (c: ClientRow, ctx: { meId: string | null }) => boolean;
};

const SEGMENTS: Segment[] = [
  { id: "my", label: "My coachees", description: "Assigned to me",
    match: (c, { meId }) => !!meId && c.assigned_coach_user_id === meId },
  { id: "unassigned", label: "Unassigned", description: "No coach yet",
    match: (c) => !c.assigned_coach_user_id },
  { id: "hot", label: "Hot leads", description: "Lead score ≥ 70",
    match: (c) => (c.lead_score ?? 0) >= 70 },
  { id: "stale", label: "Stale (30d+)", description: "No touch in 30+ days",
    match: (c) => {
      const t = c.last_contacted_at ? new Date(c.last_contacted_at).getTime() : 0;
      return Date.now() - t > 30 * 86_400_000;
    } },
  { id: "btf", label: "BTF Active", description: "Tagged BTF Active",
    match: (c) => (c.tags || []).includes("BTF Active") },
  { id: "dnc", label: "DNC", description: "Do Not Contact",
    match: (c) => !!c.do_not_contact },
  { id: "churned", label: "Churned", description: "Churned lifecycle",
    match: (c) => c.lifecycle_stage === "client_churned" },
];

export default function ContactsAdmin() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [rollup, setRollup] = useState<Record<string, Rollup>>({});
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [editTarget, setEditTarget] = useState<ClientRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [alsoDeleteAuth, setAlsoDeleteAuth] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const { isAdmin } = useUserRoles();

  // URL-synced filters
  const search = searchParams.get("q") || "";
  const lifecycle = searchParams.get("lifecycle") || "all";
  const coachFilter = searchParams.get("coach") || "all";
  const tagFilter = searchParams.get("tag") || "all";
  const segment = searchParams.get("segment") || "";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setMeId(user?.id || null);

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
    if (lifecycle !== "all" && (c.lifecycle_stage || "new_lead") !== lifecycle) return false;
    if (coachFilter === "unassigned" && c.assigned_coach_user_id) return false;
    if (coachFilter !== "all" && coachFilter !== "unassigned" && c.assigned_coach_user_id !== coachFilter) return false;
    if (tagFilter !== "all" && !(c.tags || []).includes(tagFilter)) return false;
    if (segment) {
      const seg = SEGMENTS.find((s) => s.id === segment);
      if (seg && !seg.match(c, { meId })) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      const hay = `${c.first_name} ${c.last_name} ${c.email || ""} ${c.entity_name || ""} ${(c.tags || []).join(" ")}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }), [clients, search, lifecycle, coachFilter, tagFilter, segment, meId]);

  const stats = useMemo(() => {
    const totalOpenDeals = Object.values(rollup).reduce((a, r) => a + (r.open_deals || 0), 0);
    const totalOpenValue = Object.values(rollup).reduce((a, r) => a + (r.open_value_cents || 0), 0);
    const customers = clients.filter((c) => c.lifecycle_stage === "client_active").length;
    const leads = clients.filter((c) => ["new_lead", "qualified", "nurturing", "hot_lead"].includes(c.lifecycle_stage)).length;
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
    const source = selected.size > 0
      ? filtered.filter((c) => selected.has(c.id))
      : filtered;
    const rows = source.map((c) => ({
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      phone: c.phone,
      business: c.entity_name,
      title: c.title,
      lifecycle: c.lifecycle_stage,
      source: c.source,
      tags: (c.tags || []).join("; "),
      lead_score: c.lead_score ?? "",
      do_not_contact: c.do_not_contact ? "yes" : "",
      coach: coachName(c.assigned_coach_user_id),
      open_deals: rollup[c.id]?.open_deals || 0,
      open_value: ((rollup[c.id]?.open_value_cents || 0) / 100).toFixed(2),
      created_at: c.created_at,
    }));
    downloadCSV(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, contactsToCSV(rows));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // If the contact has a portal login and admin opted in, nuke the auth user too.
      if (alsoDeleteAuth && deleteTarget.linked_user_id) {
        const { data, error } = await supabase.functions.invoke("admin-delete-user", {
          body: { user_id: deleteTarget.linked_user_id, keep_contact: false },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
      } else {
        await deleteContact(deleteTarget.id);
      }
      toast.success(alsoDeleteAuth ? "Contact + platform account deleted" : "Contact deleted");
      setClients((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
      setDeleteTarget(null);
      setAlsoDeleteAuth(false);
    } catch (e: any) {
      toast.error(e?.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <TooltipProvider delayDuration={250}>
      <div className="space-y-4 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Contacts</h1>
            <p className="text-sm text-muted-foreground">
              Your CRM contact book — segment, assign, edit, and push straight into the pipeline.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1" /> Export {selected.size > 0 ? `(${selected.size})` : "CSV"}
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

        {/* Smart segments */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
            <Filter className="h-3 w-3" /> Segments:
          </span>
          <Chip active={!segment} onClick={() => setParam("segment", "")} label="All" />
          {SEGMENTS.map((s) => (
            <Tooltip key={s.id}>
              <TooltipTrigger asChild>
                <span>
                  <Chip
                    active={segment === s.id}
                    onClick={() => setParam("segment", segment === s.id ? "" : s.id)}
                    label={s.label}
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>{s.description}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <Card className="p-3 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, business, tag…"
              value={search}
              onChange={(e) => setParam("q", e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={lifecycle} onValueChange={(v) => setParam("lifecycle", v)}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Lifecycle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lifecycle stages</SelectItem>
              {LIFECYCLE_STAGES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={coachFilter} onValueChange={(v) => setParam("coach", v)}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Coach" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All coaches</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {coaches.map((c) => (
                <SelectItem key={c.user_id} value={c.user_id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tagFilter} onValueChange={(v) => setParam("tag", v)}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Card>

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
                    <th className="px-3 py-3 w-8">
                      <Checkbox
                        checked={selected.size > 0 && selected.size === filtered.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-4 py-3 text-left">Contact</th>
                    <th className="px-4 py-3 text-left">Lifecycle</th>
                    <th className="px-4 py-3 text-left">Tags</th>
                    <th className="px-4 py-3 text-right">Score</th>
                    <th className="px-4 py-3 text-right">Open deals</th>
                    <th className="px-4 py-3 text-left">Coach</th>
                    <th className="px-4 py-3 text-left">Last touch</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const meta = lifecycleMeta(c.lifecycle_stage);
                    const r = rollup[c.id];
                    const name = `${c.first_name} ${c.last_name}`.trim() || c.email || "Unnamed";
                    const isSel = selected.has(c.id);
                    return (
                      <tr key={c.id} className={`border-t border-border hover:bg-muted/30 ${isSel ? "bg-primary/5" : ""}`}>
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={() => toggleSelect(c.id)}
                            aria-label={`Select ${name}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button className="text-left" onClick={() => navigate(`/admin/contacts/${c.id}`)}>
                            <div className="font-medium flex items-center gap-2">
                              {name}
                              {c.do_not_contact && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <BanIcon className="h-3.5 w-3.5 text-red-600" />
                                  </TooltipTrigger>
                                  <TooltipContent>Do Not Contact</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {c.entity_name || "—"}{c.email ? ` · ${c.email}` : ""}
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <Select value={c.lifecycle_stage || "new_lead"} onValueChange={(v) => updateLifecycle(c.id, v)}>
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
                          <LeadScore score={c.lead_score} />
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
                          {c.last_contacted_at ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>{formatDistanceToNow(new Date(c.last_contacted_at), { addSuffix: true })}</span>
                              </TooltipTrigger>
                              <TooltipContent>{format(new Date(c.last_contacted_at), "PPpp")}</TooltipContent>
                            </Tooltip>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" onClick={() => setEditTarget(c)} aria-label="Edit contact">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteTarget(c)}
                                  aria-label="Delete contact"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete contact (admin)</TooltipContent>
                            </Tooltip>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/contacts/${c.id}`)}>
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

        <BulkActionsBar
          selectedIds={Array.from(selected)}
          coaches={coaches}
          knownTags={allTags}
          onCleared={() => setSelected(new Set())}
          onChanged={load}
          onExport={exportCSV}
        />

        <NewContactDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          onCreated={(id) => navigate(`/admin/contacts/${id}`)}
        />

        <EditContactDialog
          open={!!editTarget}
          onOpenChange={(v) => !v && setEditTarget(null)}
          contact={editTarget}
          coaches={coaches}
          knownTags={allTags}
          onSaved={(updated) => {
            setClients((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c));
            setEditTarget(null);
          }}
        />

        <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v && !deleting) { setDeleteTarget(null); setAlsoDeleteAuth(false); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {deleteTarget ? `${deleteTarget.first_name} ${deleteTarget.last_name}`.trim() || deleteTarget.email || "this contact" : "contact"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the contact and their CRM history — deals, activities, notes,
                documents, and coach assignments. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteTarget?.linked_user_id && (
              <label className="flex items-start gap-2 text-sm bg-destructive/5 border border-destructive/30 rounded p-3 -mt-1">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={alsoDeleteAuth}
                  onChange={(e) => setAlsoDeleteAuth(e.target.checked)}
                  disabled={deleting}
                />
                <span>
                  <strong>Also delete the platform login account.</strong> Removes their auth user,
                  roles, subscriptions, and consumer access. Use this when the person should no
                  longer exist on the platform at all.
                </span>
              </label>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); confirmDelete(); }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting…" : "Delete contact"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
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

function LeadScore({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const color =
    score >= 70 ? "bg-red-500/15 text-red-700 dark:text-red-300" :
    score >= 40 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" :
    "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`${color} border-transparent gap-1`}>
      <Star className="h-3 w-3" /> {score}
    </Badge>
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
