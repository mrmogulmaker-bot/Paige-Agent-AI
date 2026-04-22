// BrokerTeam — manages team members for a broker workspace.
// Phase 4 minimum viable: list + invite. Resend/role-change/suspend ship next.

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Users, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBrokerContext } from "@/hooks/useBrokerContext";

interface TeamRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  status: string;
  invited_at: string;
  last_sign_in_at: string | null;
}

const roleLabel = (r: string) =>
  r === "lead_broker" ? "Lead Broker" : r === "advisor" ? "Advisor" : r === "assistant" ? "Assistant" : r;

const statusBadge = (s: string) => {
  if (s === "active") return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200">Active</Badge>;
  if (s === "invited") return <Badge className="bg-amber-500/15 text-amber-700 border-amber-200">Invited</Badge>;
  if (s === "suspended") return <Badge variant="destructive">Suspended</Badge>;
  return <Badge variant="outline">{s}</Badge>;
};

const BrokerTeam = () => {
  const { activeBrokerId, permissions, parentBrokerProfile } = useBrokerContext();
  const { toast } = useToast();
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", role: "advisor" as "lead_broker" | "advisor" | "assistant" });

  const load = async () => {
    if (!activeBrokerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("broker_team_members")
      .select("id, email, first_name, last_name, role, status, invited_at, last_sign_in_at")
      .eq("broker_id", activeBrokerId)
      .order("invited_at", { ascending: false });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setRows((data as TeamRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrokerId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBrokerId) return;
    if (!form.email.trim() || !form.firstName.trim()) {
      toast({ title: "Missing info", description: "First name and email are required.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("send-broker-team-invite", {
      body: {
        broker_id: activeBrokerId,
        invitee_email: form.email.trim().toLowerCase(),
        invitee_first_name: form.firstName.trim(),
        invitee_last_name: form.lastName.trim(),
        role: form.role,
      },
    });
    if (error || (data as any)?.error) {
      toast({ title: "Could not send invite", description: (error?.message || (data as any)?.error || ""), variant: "destructive" });
    } else {
      toast({ title: "Invitation sent", description: `${form.email} has 7 days to accept.` });
      setForm({ firstName: "", lastName: "", email: "", role: "advisor" });
      setOpen(false);
      load();
    }
    setSubmitting(false);
  };

  const handleResend = async (row: TeamRow) => {
    if (!activeBrokerId) return;
    const { error } = await supabase.functions.invoke("send-broker-team-invite", {
      body: { broker_id: activeBrokerId, team_member_id: row.id, resend: true },
    });
    if (error) toast({ title: "Resend failed", description: error.message, variant: "destructive" });
    else toast({ title: "Invite resent", description: `Sent to ${row.email}.` });
  };

  const handleSuspend = async (row: TeamRow) => {
    const next = row.status === "suspended" ? "active" : "suspended";
    const { error } = await supabase.from("broker_team_members").update({ status: next }).eq("id", row.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else load();
  };

  const handleRemove = async (row: TeamRow) => {
    if (!confirm(`Remove ${row.email} from your team?`)) return;
    const { error } = await supabase.from("broker_team_members").update({ status: "removed" }).eq("id", row.id);
    if (error) toast({ title: "Remove failed", description: error.message, variant: "destructive" });
    else load();
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your Team</h1>
          <p className="text-muted-foreground">
            Invite advisors and assistants to collaborate in {parentBrokerProfile?.business_name || "your"} workspace.
          </p>
        </div>
        {permissions.can_manage_team && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Invite team member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleInvite}>
                <DialogHeader>
                  <DialogTitle>Invite a team member</DialogTitle>
                  <DialogDescription>
                    They'll receive an email with a 7-day signup link to join your workspace.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="firstName">First name</Label>
                      <Input id="firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lastName">Last name</Label>
                      <Input id="lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={(v: any) => setForm({ ...form, role: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead_broker">Lead Broker — full workspace access</SelectItem>
                        <SelectItem value="advisor">Advisor — clients + Paige sessions</SelectItem>
                        <SelectItem value="assistant">Assistant — read-only access</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Send invitation
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
          <CardDescription>
            {rows.filter((r) => r.status !== "removed").length} active or pending
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p>No team members yet. Invite your first advisor or assistant to start collaborating.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last active</TableHead>
                  {permissions.can_manage_team && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.filter((r) => r.status !== "removed").map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.first_name || "—"} {row.last_name || ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.email}</TableCell>
                    <TableCell><Badge variant="outline">{roleLabel(row.role)}</Badge></TableCell>
                    <TableCell>{statusBadge(row.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.last_sign_in_at ? new Date(row.last_sign_in_at).toLocaleDateString() : "—"}
                    </TableCell>
                    {permissions.can_manage_team && (
                      <TableCell className="text-right space-x-2">
                        {row.status === "invited" && (
                          <Button variant="ghost" size="sm" onClick={() => handleResend(row)}>Resend</Button>
                        )}
                        {row.status !== "invited" && (
                          <Button variant="ghost" size="sm" onClick={() => handleSuspend(row)}>
                            {row.status === "suspended" ? "Reinstate" : "Suspend"}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleRemove(row)}>
                          Remove
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BrokerTeam;
