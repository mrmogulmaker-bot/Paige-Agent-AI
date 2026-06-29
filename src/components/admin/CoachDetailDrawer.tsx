import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ReassignCoachDialog } from "./ReassignCoachDialog";
import { Link } from "react-router-dom";
import { Users, CheckSquare, Activity, ExternalLink } from "lucide-react";

const SPECIALTY_OPTIONS = [
  { value: "personal_credit", label: "Personal Credit" },
  { value: "business_credit", label: "Business Credit" },
  { value: "funding", label: "Funding Strategy" },
  { value: "btf", label: "Build-to-Fund" },
  { value: "entity", label: "Entity Setup" },
  { value: "underwriting", label: "Underwriting" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  coachUserId: string | null;
  coachName?: string;
  onChanged?: () => void;
}

interface ClientRow { id: string; first_name: string | null; last_name: string | null; email: string | null; status: string | null; lifecycle_stage: string | null; }
interface Perf { active_clients: number; total_clients: number; open_tasks: number; completed_tasks_30d: number; capacity: number | null; }

export function CoachDetailDrawer({ open, onOpenChange, coachUserId, coachName, onChanged }: Props) {
  const [profile, setProfile] = useState<any>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [unassigned, setUnassigned] = useState<ClientRow[]>([]);
  const [pickedUnassigned, setPickedUnassigned] = useState<Set<string>>(new Set());
  const [perf, setPerf] = useState<Perf | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);

  useEffect(() => {
    if (!open || !coachUserId) return;
    load();
  }, [open, coachUserId]);

  const load = async () => {
    if (!coachUserId) return;
    setLoading(true);
    try {
      const [profRes, clientsRes, unassignedRes, openTasks, doneTasks] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, coach_specialties, coach_capacity, coach_accepting_clients, coach_bio, coach_timezone").eq("user_id", coachUserId).maybeSingle(),
        supabase.from("clients").select("id, first_name, last_name, email, status, lifecycle_stage").eq("assigned_coach_user_id", coachUserId).order("updated_at", { ascending: false }),
        supabase.from("clients").select("id, first_name, last_name, email, status, lifecycle_stage").is("assigned_coach_user_id", null).order("created_at", { ascending: false }).limit(100),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", coachUserId).in("status", ["pending", "in_progress"]),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", coachUserId).eq("status", "completed").gte("updated_at", new Date(Date.now() - 30 * 86400000).toISOString()),
      ]);
      setProfile(profRes.data ?? { user_id: coachUserId, coach_specialties: [], coach_accepting_clients: true });
      const cl = (clientsRes.data ?? []) as ClientRow[];
      setClients(cl);
      setUnassigned((unassignedRes.data ?? []) as ClientRow[]);
      setPerf({
        active_clients: cl.filter((c) => (c.status ?? "active") === "active").length,
        total_clients: cl.length,
        open_tasks: openTasks.count ?? 0,
        completed_tasks_30d: doneTasks.count ?? 0,
        capacity: profRes.data?.coach_capacity ?? null,
      });
      setPickedUnassigned(new Set());
    } finally { setLoading(false); }
  };

  const saveProfile = async () => {
    if (!coachUserId || !profile) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({
        coach_specialties: profile.coach_specialties ?? [],
        coach_capacity: profile.coach_capacity ?? null,
        coach_accepting_clients: !!profile.coach_accepting_clients,
        coach_bio: profile.coach_bio ?? null,
        coach_timezone: profile.coach_timezone ?? null,
      }).eq("user_id", coachUserId);
      if (error) throw error;
      toast.success("Coach profile saved");
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally { setSaving(false); }
  };

  const toggleSpecialty = (val: string) => {
    const cur: string[] = profile?.coach_specialties ?? [];
    setProfile({ ...profile, coach_specialties: cur.includes(val) ? cur.filter((s) => s !== val) : [...cur, val] });
  };

  const unassign = async (clientId: string) => {
    const { error } = await supabase.from("clients").update({ assigned_coach_user_id: null }).eq("id", clientId);
    if (error) return toast.error(error.message);
    toast.success("Client unassigned");
    load(); onChanged?.();
  };

  const bulkAssign = async () => {
    if (!coachUserId || pickedUnassigned.size === 0) return;
    const { error } = await supabase.rpc("admin_bulk_assign_coach", {
      _coach: coachUserId,
      _client_ids: Array.from(pickedUnassigned),
    });
    if (error) return toast.error(error.message);
    toast.success(`Assigned ${pickedUnassigned.size} client(s)`);
    load(); onChanged?.();
  };

  const removeRole = async () => {
    if (!coachUserId) return;
    if (!confirm("Revoke the coach role for this user? This is blocked if they still have active clients.")) return;
    const { data, error } = await supabase.rpc("admin_remove_coach_role", { _user_id: coachUserId });
    if (error) return toast.error(error.message);
    const res = data as any;
    if (!res?.ok) {
      toast.error(`Has ${res?.active_count ?? 0} active clients — reassign first.`);
      setReassignOpen(true);
      return;
    }
    toast.success("Coach role removed");
    onOpenChange(false); onChanged?.();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{coachName || profile?.full_name || "Coach"}</SheetTitle>
            <SheetDescription className="font-mono text-xs">{coachUserId}</SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Loading…</div>
          ) : (
            <div className="mt-4 space-y-4">
              {/* Perf snapshot */}
              {perf && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Card className="p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3 w-3" />Active</div><div className="text-xl font-semibold">{perf.active_clients}{perf.capacity ? <span className="text-sm text-muted-foreground"> / {perf.capacity}</span> : null}</div></Card>
                  <Card className="p-3"><div className="text-xs text-muted-foreground">Total clients</div><div className="text-xl font-semibold">{perf.total_clients}</div></Card>
                  <Card className="p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckSquare className="h-3 w-3" />Open tasks</div><div className="text-xl font-semibold">{perf.open_tasks}</div></Card>
                  <Card className="p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Activity className="h-3 w-3" />Done (30d)</div><div className="text-xl font-semibold">{perf.completed_tasks_30d}</div></Card>
                </div>
              )}

              <Tabs defaultValue="clients">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="clients">Clients ({clients.length})</TabsTrigger>
                  <TabsTrigger value="assign">Bulk Assign</TabsTrigger>
                  <TabsTrigger value="profile">Profile</TabsTrigger>
                </TabsList>

                <TabsContent value="clients" className="space-y-2 pt-3">
                  {clients.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-6 text-center">No clients assigned.</div>
                  ) : clients.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 p-3 border rounded-md">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.id}</div>
                        <div className="text-xs text-muted-foreground truncate">{c.email} · {c.lifecycle_stage || c.status}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button asChild size="sm" variant="ghost"><Link to={`/admin/contacts/${c.id}`}><ExternalLink className="h-3 w-3" /></Link></Button>
                        <Button size="sm" variant="ghost" onClick={() => unassign(c.id)}>Unassign</Button>
                      </div>
                    </div>
                  ))}
                  {clients.length > 0 && (
                    <Button variant="outline" className="w-full" onClick={() => setReassignOpen(true)}>Reassign all clients</Button>
                  )}
                </TabsContent>

                <TabsContent value="assign" className="space-y-2 pt-3">
                  <div className="text-sm text-muted-foreground">Pick unassigned clients to assign to this coach.</div>
                  <div className="max-h-80 overflow-y-auto space-y-1 border rounded-md p-2">
                    {unassigned.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-6 text-center">No unassigned clients.</div>
                    ) : unassigned.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-accent/50 rounded cursor-pointer">
                        <Checkbox
                          checked={pickedUnassigned.has(c.id)}
                          onCheckedChange={(v) => {
                            const next = new Set(pickedUnassigned);
                            if (v) next.add(c.id); else next.delete(c.id);
                            setPickedUnassigned(next);
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</div>
                          <div className="text-xs text-muted-foreground truncate">{c.email} · {c.lifecycle_stage || c.status}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <Button className="w-full" disabled={pickedUnassigned.size === 0} onClick={bulkAssign}>
                    Assign {pickedUnassigned.size || ""} client{pickedUnassigned.size === 1 ? "" : "s"}
                  </Button>
                </TabsContent>

                <TabsContent value="profile" className="space-y-4 pt-3">
                  <div className="space-y-2">
                    <Label>Specialties</Label>
                    <div className="flex flex-wrap gap-2">
                      {SPECIALTY_OPTIONS.map((s) => {
                        const on = (profile?.coach_specialties ?? []).includes(s.value);
                        return (
                          <Badge
                            key={s.value}
                            variant={on ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => toggleSpecialty(s.value)}
                          >{s.label}</Badge>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="capacity">Capacity (max active clients)</Label>
                      <Input id="capacity" type="number" min={0} value={profile?.coach_capacity ?? ""}
                        onChange={(e) => setProfile({ ...profile, coach_capacity: e.target.value ? parseInt(e.target.value) : null })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tz">Timezone</Label>
                      <Input id="tz" value={profile?.coach_timezone ?? ""} placeholder="America/New_York"
                        onChange={(e) => setProfile({ ...profile, coach_timezone: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-md">
                    <div>
                      <div className="font-medium text-sm">Accepting new clients</div>
                      <div className="text-xs text-muted-foreground">Round-robin auto-assignment respects this.</div>
                    </div>
                    <Switch checked={!!profile?.coach_accepting_clients}
                      onCheckedChange={(v) => setProfile({ ...profile, coach_accepting_clients: v })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio / notes</Label>
                    <Textarea id="bio" rows={3} value={profile?.coach_bio ?? ""}
                      onChange={(e) => setProfile({ ...profile, coach_bio: e.target.value })} />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={saveProfile} disabled={saving} className="flex-1">{saving ? "Saving…" : "Save profile"}</Button>
                    <Button variant="destructive" onClick={removeRole}>Remove coach role</Button>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ReassignCoachDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        fromCoachId={coachUserId}
        fromCoachLabel={coachName || profile?.full_name}
        onReassigned={() => { load(); onChanged?.(); }}
      />
    </>
  );
}
