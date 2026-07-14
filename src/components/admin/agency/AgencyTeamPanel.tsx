/**
 * AgencyTeamPanel — the AGENCY tier's Members & Roles area (§9, Task #213).
 *
 * WHO IS THIS FOR: the agency OPERATOR building out the team that helps run their
 * BOOK of sub-accounts. These are AGENCY-tier roles, deliberately distinct from
 * any one sub-account's own staff roles (the §9 lesson from GHL's Agency View).
 *
 * Enforcement is REAL (owner chose "enforce now"): every mutation goes through a
 * SECURITY DEFINER RPC (or the invite edge function) that authorizes server-side
 * on agency_team_can_manage — the UI only *reflects* permission, never grants it.
 * §10 Paige-callable: the same RPCs are the seam Paige uses; this panel is one
 * caller. §11: built on the shared primitive layer; gold only on invite/act.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  PageShell, PageHeader, DataTableShell, StatePill, GlyphPlate, EmptyState, StatTile,
} from "@/components/ui/page";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserCog, UserPlus, MoreHorizontal, Loader2, ShieldCheck, Users } from "lucide-react";
import type { PillState } from "@/components/ui/page";

// --- Agency role taxonomy (mirrors the DB CHECK; NOT the sub-account staff roles) ---
type AgencyRole =
  | "agency_owner" | "agency_admin" | "agency_manager"
  | "agency_biller" | "agency_specialist" | "agency_viewer";

const ROLE_META: Record<AgencyRole, { label: string; blurb: string }> = {
  agency_owner:      { label: "Owner",      blurb: "Full control — team, billing, branding, every sub-account." },
  agency_admin:      { label: "Admin",      blurb: "Manage the team and every sub-account. No ownership transfer." },
  agency_manager:    { label: "Manager",    blurb: "Open, run, and resell to every sub-account. No team or billing." },
  agency_biller:     { label: "Billing",    blurb: "Billing and wallet only." },
  agency_specialist: { label: "Specialist", blurb: "Works inside assigned sub-accounts only." },
  agency_viewer:     { label: "Viewer",     blurb: "Read-only across the portfolio and reporting." },
};
// Roles an operator can assign (Owner is the tenant owner, set elsewhere).
const ASSIGNABLE: AgencyRole[] = ["agency_admin", "agency_manager", "agency_biller", "agency_specialist", "agency_viewer"];

const STATUS_PILL: Record<string, { state: PillState; label: string }> = {
  active:    { state: "success", label: "Active" },
  invited:   { state: "pending", label: "Invited" },
  suspended: { state: "warning", label: "Suspended" },
};

interface TeamMember {
  user_id: string;
  email: string | null;
  full_name: string | null;
  agency_role: AgencyRole;
  status: string;
  scoped_count: number;
  is_you: boolean;
  joined_at: string | null;
}
interface SubAccount { id: string; name: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => supabase.rpc(name as any, args as any);

export function AgencyTeamPanel({ agencyName }: { agencyName: string | null }) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [subs, setSubs] = useState<SubAccount[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teamRes, memRes, subRes] = await Promise.all([
        rpc("agency_list_team"),
        rpc("agency_my_membership"),
        rpc("agency_list_my_subaccounts"),
      ]);
      setMembers((teamRes.data as TeamMember[]) ?? []);
      const mem = (memRes.data as { can_manage_team?: boolean } | null) ?? null;
      setCanManage(mem?.can_manage_team === true);
      const roster = Array.isArray(subRes.data) ? (subRes.data as SubAccount[]) : [];
      setSubs(roster.map((s) => ({ id: s.id, name: s.name })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load the agency team.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    total: members.length,
    active: members.filter((m) => m.status === "active").length,
    managers: members.filter((m) => ["agency_owner", "agency_admin", "agency_manager"].includes(m.agency_role)).length,
  }), [members]);

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Paige · Agency"
        title="Team & Roles"
        icon={UserCog}
        description={`The people who help run ${agencyName ?? "your agency"}'s book of sub-accounts — with agency roles, separate from any one sub-account's own team.`}
        actions={canManage ? <InviteDialog subs={subs} onDone={load} /> : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <StatTile icon={Users} label="Team members" value={loading ? "—" : String(counts.total)} />
        <StatTile icon={ShieldCheck} label="Can run sub-accounts" value={loading ? "—" : String(counts.managers)} />
        <StatTile icon={UserPlus} label="Active" value={loading ? "—" : String(counts.active)} />
      </div>

      <DataTableShell
        columns={[
          { key: "member", header: "Member" },
          { key: "role", header: "Role" },
          { key: "status", header: "Status" },
          { key: "actions", header: "", className: "w-12" },
        ]}
        loading={loading}
        isEmpty={!loading && members.length === 0}
        empty={
          <EmptyState
            icon={UserCog}
            tone="brand"
            title="No teammates yet"
            description={canManage
              ? "Invite the people who help you run your book. Each gets an agency role that scopes what they can touch."
              : "Your agency's team will appear here."}
          />
        }
      >
        {members.map((m) => (
          <MemberRow key={m.user_id} m={m} canManage={canManage} subs={subs} onChanged={load} />
        ))}
      </DataTableShell>
    </PageShell>
  );
}

function RoleBadge({ role }: { role: AgencyRole }) {
  const meta = ROLE_META[role];
  // Owner is the "on" moment of authority — the only gold pill (§11).
  const state: PillState = role === "agency_owner" ? "on" : "included";
  return <StatePill state={state} className="normal-case tracking-normal">{meta.label}</StatePill>;
}

function MemberRow({
  m, canManage, subs, onChanged,
}: { m: TeamMember; canManage: boolean; subs: SubAccount[]; onChanged: () => void }) {
  const isOwner = m.agency_role === "agency_owner";
  const actionable = canManage && !isOwner && !m.is_you;
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const name = m.full_name || (m.email ? m.email.split("@")[0] : "Teammate");

  const setStatus = async (status: "active" | "suspended") => {
    setBusy(true);
    try {
      const { error } = await rpc("agency_set_member_status", { _target_user: m.user_id, _status: status });
      if (error) throw error;
      toast.success(status === "suspended" ? "Member suspended." : "Member reactivated.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update that member.");
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const { error } = await rpc("agency_remove_member", { _target_user: m.user_id });
      if (error) throw error;
      toast.success(`${name} removed from the agency team.`);
      setConfirmRemove(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove that member.");
    } finally { setBusy(false); }
  };

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <GlyphPlate icon={UserCog} size="sm" />
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">
              {name}{m.is_you && <span className="ml-1.5 text-[11px] text-muted-foreground">(you)</span>}
            </div>
            <div className="text-xs text-muted-foreground truncate">{m.email ?? "—"}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <RoleBadge role={m.agency_role} />
          {m.agency_role === "agency_specialist" && (
            <span className="text-[11px] text-muted-foreground">
              {m.scoped_count} sub-account{m.scoped_count === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <StatePill state={STATUS_PILL[m.status]?.state ?? "off"} className="normal-case tracking-normal">
          {STATUS_PILL[m.status]?.label ?? m.status}
        </StatePill>
      </TableCell>
      <TableCell className="text-right">
        {actionable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={busy} aria-label="Member actions">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setEditing(true)}>Change role…</DropdownMenuItem>
              {m.status === "active" ? (
                <DropdownMenuItem onClick={() => setStatus("suspended")}>Suspend access</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setStatus("active")}>Reactivate</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setConfirmRemove(true)} className="text-destructive focus:text-destructive">
                Remove from team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {editing && (
          <RoleEditor
            member={m} subs={subs}
            onClose={() => setEditing(false)}
            onSaved={() => { setEditing(false); onChanged(); }}
          />
        )}

        <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {name} from the agency team?</AlertDialogTitle>
              <AlertDialogDescription>
                They'll lose agency access immediately. Their own sub-account logins (if any) aren't affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); void remove(); }}
                disabled={busy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {busy ? "Removing…" : "Remove"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

/** Specialist sub-account scope picker (§11 — real controls, no native checkbox). */
function ScopePicker({
  subs, value, onChange,
}: { subs: SubAccount[]; value: string[]; onChange: (next: string[]) => void }) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Which sub-accounts can they work inside?</Label>
      <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border">
        {subs.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No sub-accounts yet.</p>
        ) : subs.map((s) => (
          <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40">
            <Checkbox checked={value.includes(s.id)} onCheckedChange={() => toggle(s.id)} />
            <span className="text-sm truncate">{s.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function RoleEditor({
  member, subs, onClose, onSaved,
}: { member: TeamMember; subs: SubAccount[]; onClose: () => void; onSaved: () => void }) {
  const [role, setRole] = useState<AgencyRole>(member.agency_role);
  const [scoped, setScoped] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await rpc("agency_set_member_role", {
        _target_user: member.user_id,
        _role: role,
        _scoped: role === "agency_specialist" ? scoped : [],
      });
      if (error) throw error;
      toast.success("Role updated.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the role.");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="text-left">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>{member.full_name || member.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Agency role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AgencyRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNABLE.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_META[r].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_META[role].blurb}</p>
          </div>
          {role === "agency_specialist" && <ScopePicker subs={subs} value={scoped} onChange={setScoped} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="gold" onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({ subs, onDone }: { subs: SubAccount[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AgencyRole>("agency_manager");
  const [scoped, setScoped] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const reset = () => { setEmail(""); setRole("agency_manager"); setScoped([]); };

  const invite = async () => {
    if (!/.+@.+\..+/.test(email.trim())) {
      toast.error("Enter a valid email.");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("agency-invite-member", {
        body: { email: email.trim(), role, scoped_subaccounts: role === "agency_specialist" ? scoped : [] },
      });
      const body = (data ?? {}) as { success?: boolean; error?: string; created_user?: boolean };
      if (error || body.error || !body.success) {
        throw new Error(body.error || error?.message || "Couldn't send the invite.");
      }
      toast.success(
        body.created_user
          ? `Invited ${email.trim()} — they'll get an email to set their password.`
          : `Added ${email.trim()} to the agency team.`,
      );
      reset();
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the invite.");
    } finally { setSending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <Button variant="gold" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4 mr-2" /> Invite teammate
      </Button>
      <DialogContent className="text-left">
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>They'll help run your agency's book of sub-accounts.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@email.com" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Agency role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AgencyRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNABLE.map((r) => <SelectItem key={r} value={r}>{ROLE_META[r].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_META[role].blurb}</p>
          </div>
          {role === "agency_specialist" && <ScopePicker subs={subs} value={scoped} onChange={setScoped} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
          <Button variant="gold" onClick={invite} disabled={sending || !email.trim()}>
            {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
