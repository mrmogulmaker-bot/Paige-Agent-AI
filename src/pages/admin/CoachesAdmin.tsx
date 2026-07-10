import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { UserCog, Plus, Search } from "lucide-react";
import { AddCoachDialog } from "@/components/admin/AddCoachDialog";
import { CoachDetailDrawer } from "@/components/admin/CoachDetailDrawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PageShell,
  PageHeader,
  DataTableShell,
  EmptyState,
  StatePill,
  Toolbar,
  type Column,
} from "@/components/ui/page";

type CoachRow = {
  user_id: string;
  name: string;
  specialties: string[];
  capacity: number | null;
  accepting: boolean;
  active_count: number;
  total_count: number;
};

const SPECIALTY_LABEL: Record<string, string> = {
  personal_credit: "Personal Credit",
  business_credit: "Business Credit",
  funding: "Funding",
  btf: "BTF",
  entity: "Entity",
  underwriting: "Underwriting",
};

const COLUMNS: Column[] = [
  { key: "coach", header: "Coach" },
  { key: "specialties", header: "Specialties" },
  { key: "load", header: "Load", numeric: true },
  { key: "status", header: "Status" },
  { key: "actions", header: "", className: "text-right" },
];

export default function CoachesAdmin() {
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<CoachRow | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "accepting" | "full">("all");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "coach");
      const ids = (roles || []).map((r: any) => r.user_id);
      if (!ids.length) { setCoaches([]); return; }

      const [profilesRes, clientsRes, ccRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, coach_specialties, coach_capacity, coach_accepting_clients").in("user_id", ids),
        supabase.from("clients").select("assigned_coach_user_id, status").in("assigned_coach_user_id", ids),
        supabase.from("coach_clients").select("coach_user_id, status").in("coach_user_id", ids),
      ]);

      const rows: CoachRow[] = ids.map((id) => {
        const p: any = (profilesRes.data || []).find((x: any) => x.user_id === id) || {};
        const direct = (clientsRes.data || []).filter((c: any) => c.assigned_coach_user_id === id);
        const linked = (ccRes.data || []).filter((c: any) => c.coach_user_id === id);
        const total = direct.length + linked.length;
        const active = direct.filter((c: any) => (c.status ?? "active") === "active").length
                     + linked.filter((c: any) => (c.status ?? "active") === "active").length;
        return {
          user_id: id,
          name: p.full_name || "Unnamed Coach",
          specialties: p.coach_specialties || [],
          capacity: p.coach_capacity ?? null,
          accepting: p.coach_accepting_clients ?? true,
          active_count: active,
          total_count: total,
        };
      }).sort((a, b) => b.active_count - a.active_count);

      setCoaches(rows);
    } finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    return coaches.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "accepting" && !c.accepting) return false;
      if (filter === "full" && (c.capacity == null || c.active_count < c.capacity)) return false;
      return true;
    });
  }, [coaches, search, filter]);

  return (
    <PageShell width="wide">
      <PageHeader
        title="Coaches"
        icon={UserCog}
        description="Manage coach roster, specialties, capacity, and assignments."
        actions={
          <Button variant="gold" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add coach
          </Button>
        }
      />

      <Toolbar>
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search coaches…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All coaches</SelectItem>
            <SelectItem value="accepting">Accepting new</SelectItem>
            <SelectItem value="full">At capacity</SelectItem>
          </SelectContent>
        </Select>
      </Toolbar>

      <DataTableShell
        columns={COLUMNS}
        loading={loading}
        isEmpty={filtered.length === 0}
        empty={
          <EmptyState
            icon={UserCog}
            title="No coaches match your filter"
            description="Adjust your search or filter, or add a coach to the roster."
          />
        }
      >
        {filtered.map((c) => {
          const overCap = c.capacity != null && c.active_count >= c.capacity;
          return (
            <TableRow key={c.user_id} className="cursor-pointer" onClick={() => setSelected(c)}>
              <TableCell>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0">
                    <UserCog className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{c.user_id.slice(0, 8)}…</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {c.specialties.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : c.specialties.map((s) => (
                    <Badge key={s} variant="outline" className="text-xs">{SPECIALTY_LABEL[s] || s}</Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <StatePill state={overCap ? "error" : "off"}>
                  {c.active_count}{c.capacity != null ? ` / ${c.capacity}` : ""}
                </StatePill>
              </TableCell>
              <TableCell>
                {c.accepting ? <StatePill state="success">Accepting</StatePill> : <StatePill state="off">Paused</StatePill>}
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(c); }}>Manage</Button>
              </TableCell>
            </TableRow>
          );
        })}
      </DataTableShell>

      <AddCoachDialog open={addOpen} onOpenChange={setAddOpen} onAdded={load} />
      <CoachDetailDrawer
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        coachUserId={selected?.user_id ?? null}
        coachName={selected?.name}
        onChanged={load}
      />
    </PageShell>
  );
}
