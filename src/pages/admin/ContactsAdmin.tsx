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
import { Search, Users, UserPlus } from "lucide-react";
import { toast } from "sonner";

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  entity_name: string | null;
  funding_goal: number | null;
  status: string;
  assigned_coach_user_id: string | null;
  linked_user_id: string | null;
  created_at: string;
};

type Coach = { user_id: string; name: string };

export default function ContactsAdmin() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [coachFilter, setCoachFilter] = useState<string>("all");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [clientsRes, rolesRes] = await Promise.all([
        supabase.from("clients").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id").eq("role", "coach"),
      ]);
      if (clientsRes.error) throw clientsRes.error;
      setClients(clientsRes.data || []);

      const coachIds = (rolesRes.data || []).map((r: any) => r.user_id);
      if (coachIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", coachIds);
        setCoaches((profs || []).map((p: any) => ({
          user_id: p.user_id,
          name: p.full_name || "Unnamed Coach",
        })));
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  };

  const coachName = (id: string | null) =>
    id ? (coaches.find((c) => c.user_id === id)?.name || "Coach") : "Unassigned";

  const filtered = useMemo(() => clients.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (coachFilter === "unassigned" && c.assigned_coach_user_id) return false;
    if (coachFilter !== "all" && coachFilter !== "unassigned" && c.assigned_coach_user_id !== coachFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const hay = `${c.first_name} ${c.last_name} ${c.email || ""} ${c.entity_name || ""}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }), [clients, search, statusFilter, coachFilter]);

  const assignCoach = async (clientId: string, coachId: string | null) => {
    const { error } = await supabase
      .from("clients")
      .update({ assigned_coach_user_id: coachId })
      .eq("id", clientId);
    if (error) return toast.error(error.message);
    toast.success(coachId ? "Coach assigned" : "Coach unassigned");
    setClients((prev) => prev.map((c) => c.id === clientId ? { ...c, assigned_coach_user_id: coachId } : c));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Contacts</h1>
          <p className="text-sm text-muted-foreground">All client records — assign coaches, filter, take action.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" /> {filtered.length} of {clients.length}
        </div>
      </div>

      <Card className="p-3 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, business…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
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
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading contacts…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No contacts match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Business</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Coach</th>
                  <th className="px-4 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{c.first_name} {c.last_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.entity_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.email || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={c.status === "active" ? "default" : "outline"} className="capitalize">{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={c.assigned_coach_user_id || "unassigned"}
                        onValueChange={(v) => assignCoach(c.id, v === "unassigned" ? null : v)}
                      >
                        <SelectTrigger className="h-8 w-[180px]">
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
