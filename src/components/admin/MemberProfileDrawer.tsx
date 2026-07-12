import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Crown, ShieldCheck, ShieldOff, Mail, Calendar, Clock, Users, FileText, Pencil, Save, X, KeyRound, LogOut, Send, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { callAdminAccountAction } from "@/lib/functions/adminAccountActions";
import { AvatarUploader } from "@/components/ui/avatar-uploader";

export interface MemberProfile {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  roles: string[];
  is_owner: boolean;
}

interface Props {
  member: MemberProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEdit?: boolean;
  onSaved?: () => void;
}

interface ProfileFields {
  full_name: string;
  first_name: string;
  middle_initial: string;
  last_name: string;
  phone: string;
  work_email: string;
  business_name: string;
  website_url: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  coach_bio: string;
  staff_notes: string;
  avatar_url: string;
}

const EMPTY: ProfileFields = {
  full_name: "", first_name: "", middle_initial: "", last_name: "",
  phone: "", work_email: "", business_name: "", website_url: "",
  address: "", city: "", state: "", postal_code: "", coach_bio: "", staff_notes: "", avatar_url: "",
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

export function MemberProfileDrawer({ member, open, onOpenChange, initialEdit = false, onSaved }: Props) {
  const [fields, setFields] = useState<ProfileFields>(EMPTY);
  const [original, setOriginal] = useState<ProfileFields>(EMPTY);
  const [extras, setExtras] = useState<{ assignedClientsCount?: number; invitesSentCount?: number; tenantNames?: string[] }>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(initialEdit);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmSignout, setConfirmSignout] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => { setEditing(initialEdit); }, [initialEdit, member?.user_id]);
  // A person may only upload to their OWN avatar folder (storage RLS), so the
  // photo control appears only when this drawer is the signed-in user's own.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!open || !member) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: prof }, clientsRes, invitesRes, tenantRes] = await Promise.all([
          supabase.from("profiles")
            .select("full_name, first_name, middle_initial, last_name, phone, work_email, business_name, website_url, address, city, state, postal_code, coach_bio, staff_notes, avatar_url")
            .eq("user_id", member.user_id).maybeSingle(),
          supabase.from("clients").select("id", { count: "exact", head: true }).eq("assigned_coach_user_id", member.user_id),
          supabase.from("invitations").select("id", { count: "exact", head: true }).eq("invited_by", member.user_id),
          supabase.from("tenant_members").select("tenants(name)").eq("user_id", member.user_id),
        ]);
        if (cancelled) return;
        const next: ProfileFields = {
          full_name: (prof as any)?.full_name ?? member.full_name ?? "",
          first_name: (prof as any)?.first_name ?? "",
          middle_initial: (prof as any)?.middle_initial ?? "",
          last_name: (prof as any)?.last_name ?? "",
          phone: (prof as any)?.phone ?? "",
          work_email: (prof as any)?.work_email ?? "",
          business_name: (prof as any)?.business_name ?? "",
          website_url: (prof as any)?.website_url ?? "",
          address: (prof as any)?.address ?? "",
          city: (prof as any)?.city ?? "",
          state: (prof as any)?.state ?? "",
          postal_code: (prof as any)?.postal_code ?? "",
          coach_bio: (prof as any)?.coach_bio ?? "",
          staff_notes: (prof as any)?.staff_notes ?? "",
          avatar_url: (prof as any)?.avatar_url ?? "",
        };
        setFields(next);
        setOriginal(next);
        setExtras({
          assignedClientsCount: clientsRes.count ?? 0,
          invitesSentCount: invitesRes.count ?? 0,
          tenantNames: (tenantRes.data ?? []).map((r: any) => r.tenants?.name).filter(Boolean),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, member]);

  if (!member) return null;
  const isSelf = !!currentUserId && member.user_id === currentUserId;
  const initials = (fields.full_name || member.email || "?")
    .split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const set = <K extends keyof ProfileFields>(k: K, v: ProfileFields[K]) => setFields(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = { user_id: member.user_id, ...fields, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      toast.success("Profile saved");
      setOriginal(fields);
      setEditing(false);
      onSaved?.();
    } catch (e: any) {
      toast.error("Failed to save profile", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { setFields(original); setEditing(false); };

  const runAction = async (action: "password_reset" | "signout_all" | "resend_invite" | "wipe_onboarding", successMsg: string) => {
    if (!member) return;
    setActionPending(action);
    try {
      const data = await callAdminAccountAction(action, member.user_id);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(successMsg);
    } catch (e: any) {
      toast.error("Action failed", { description: e?.message });
    } finally {
      setActionPending(null);
      setConfirmWipe(false);
      setConfirmSignout(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-base font-semibold overflow-hidden">
              {fields.avatar_url
                ? <img src={fields.avatar_url} alt="" className="w-full h-full object-cover" />
                : initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {member.is_owner && <Crown className="w-4 h-4 text-yellow-500" />}
                <span className="truncate">{fields.full_name || member.email || "Unnamed"}</span>
              </div>
              <SheetDescription className="text-xs truncate">{member.email}</SheetDescription>
            </div>
            {!editing ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
                  <X className="w-4 h-4" />
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="w-3.5 h-3.5 mr-1.5" /> {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-6 text-sm">
          <div>
            {member.suspended_at ? (
              <Badge variant="destructive" className="gap-1"><ShieldOff className="w-3 h-3" /> Suspended</Badge>
            ) : (
              <Badge variant="secondary" className="gap-1"><ShieldCheck className="w-3 h-3" /> Active</Badge>
            )}
          </div>

          <Separator />

          <div>
            <div className="text-xs uppercase text-muted-foreground mb-2">Roles</div>
            <div className="flex flex-wrap gap-1">
              {member.is_owner && <Badge>Owner</Badge>}
              {member.roles.map(r => (
                <Badge key={r} variant="outline" className="capitalize">{r.replace("_", " ")}</Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Personal */}
          <div className="space-y-3">
            <div className="text-xs uppercase text-muted-foreground">Personal</div>
            {editing && isSelf && (
              <div className="space-y-1">
                <Label className="text-xs">Profile photo</Label>
                <AvatarUploader
                  userId={member.user_id}
                  value={fields.avatar_url}
                  onChange={(url) => set("avatar_url", url)}
                  name={fields.full_name || member.email}
                  size={72}
                />
              </div>
            )}
            {editing ? (
              <>
                <Field label="First name" value={fields.first_name} editing onChange={v => set("first_name", v)} />
                <Field label="Middle initial" value={fields.middle_initial} editing onChange={v => set("middle_initial", v)} placeholder="M" />
                <Field label="Last name" value={fields.last_name} editing onChange={v => set("last_name", v)} />
              </>
            ) : (
              <Field label="Name" value={fields.full_name} editing={false} onChange={() => {}} />
            )}
            <Field label="Phone" value={fields.phone} editing={editing} onChange={v => set("phone", v)} placeholder="+1 555 555 5555" />
            <Field label="Work email" value={fields.work_email} editing={editing} onChange={v => set("work_email", v)} placeholder="work@company.com" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="w-3.5 h-3.5" /> Login email: <span className="text-foreground">{member.email || "—"}</span>
            </div>
          </div>

          <Separator />

          {/* Business */}
          <div className="space-y-3">
            <div className="text-xs uppercase text-muted-foreground">Business</div>
            <Field label="Business name" value={fields.business_name} editing={editing} onChange={v => set("business_name", v)} placeholder="e.g. Acme Capital Partners" />
            <Field label="Website" value={fields.website_url} editing={editing} onChange={v => set("website_url", v)} placeholder="https://" />
          </div>

          <Separator />

          {/* Address */}
          <div className="space-y-3">
            <div className="text-xs uppercase text-muted-foreground">Address</div>
            <Field label="Street" value={fields.address} editing={editing} onChange={v => set("address", v)} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="City" value={fields.city} editing={editing} onChange={v => set("city", v)} />
              <Field label="State" value={fields.state} editing={editing} onChange={v => set("state", v)} />
            </div>
            <Field label="Postal code" value={fields.postal_code} editing={editing} onChange={v => set("postal_code", v)} />
          </div>

          <Separator />

          {/* Bio / notes */}
          <div className="space-y-3">
            <div className="text-xs uppercase text-muted-foreground">Bio & internal notes</div>
            <div className="space-y-1">
              <Label className="text-xs">Public bio (shown to clients for coaches/brokers)</Label>
              {editing
                ? <Textarea rows={3} value={fields.coach_bio} onChange={e => set("coach_bio", e.target.value)} />
                : <p className="text-sm whitespace-pre-wrap text-muted-foreground">{fields.coach_bio || "—"}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Internal notes (staff only)</Label>
              {editing
                ? <Textarea rows={3} value={fields.staff_notes} onChange={e => set("staff_notes", e.target.value)} />
                : <p className="text-sm whitespace-pre-wrap text-muted-foreground">{fields.staff_notes || "—"}</p>}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="text-xs uppercase text-muted-foreground">Activity</div>
            <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /> Joined {fmt(member.created_at)}</div>
            <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /> Last sign-in {member.last_sign_in_at ? fmt(member.last_sign_in_at) : "Never"}</div>
            <div className="flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" /> {loading ? "…" : extras.assignedClientsCount ?? 0} assigned clients</div>
            <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" /> {loading ? "…" : extras.invitesSentCount ?? 0} invitations sent</div>
            {extras.tenantNames && extras.tenantNames.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {extras.tenantNames.map(n => <Badge key={n} variant="secondary">{n}</Badge>)}
              </div>
            )}
          </div>

          <Separator />

          {/* Account actions — admin reset toolkit */}
          <div className="space-y-3">
            <div className="text-xs uppercase text-muted-foreground">Reset account</div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline" size="sm" className="justify-start"
                disabled={!!actionPending || !member.email}
                onClick={() => runAction("password_reset", "Password reset link sent")}
              >
                <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                {actionPending === "password_reset" ? "Sending…" : "Send password reset"}
              </Button>
              <Button
                variant="outline" size="sm" className="justify-start"
                disabled={!!actionPending || !member.email}
                onClick={() => runAction("resend_invite", "Magic-link invite sent")}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {actionPending === "resend_invite" ? "Sending…" : "Resend invite"}
              </Button>
              <Button
                variant="outline" size="sm" className="justify-start"
                disabled={!!actionPending}
                onClick={() => setConfirmSignout(true)}
              >
                <LogOut className="w-3.5 h-3.5 mr-1.5" />
                Force sign-out
              </Button>
              <Button
                variant="outline" size="sm" className="justify-start"
                disabled={!!actionPending}
                onClick={() => setConfirmWipe(true)}
              >
                <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                Wipe onboarding
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Reset actions never touch credit data, businesses, or CRM history. Use Delete to remove an account.
            </p>
          </div>

          {confirmSignout && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
              <p className="text-sm">Sign this user out of every device immediately?</p>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setConfirmSignout(false)} disabled={!!actionPending}>Cancel</Button>
                <Button size="sm" onClick={() => runAction("signout_all", "Signed out of all sessions")} disabled={!!actionPending}>
                  {actionPending === "signout_all" ? "Working…" : "Sign out everywhere"}
                </Button>
              </div>
            </div>
          )}

          {confirmWipe && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
              <p className="text-sm">Reset this user's onboarding, intake, and consent flags? They'll re-run the welcome flow on next login.</p>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setConfirmWipe(false)} disabled={!!actionPending}>Cancel</Button>
                <Button size="sm" onClick={() => runAction("wipe_onboarding", "Onboarding reset")} disabled={!!actionPending}>
                  {actionPending === "wipe_onboarding" ? "Working…" : "Wipe onboarding"}
                </Button>
              </div>
            </div>
          )}

          <div className="text-[11px] text-muted-foreground pt-2">User ID: <code className="text-xs">{member.user_id}</code></div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label, value, editing, onChange, placeholder,
}: { label: string; value: string; editing: boolean; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {editing
        ? <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        : <div className="text-sm">{value || <span className="text-muted-foreground">—</span>}</div>}
    </div>
  );
}
