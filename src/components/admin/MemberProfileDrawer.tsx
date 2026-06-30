import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Crown, ShieldCheck, ShieldOff, Mail, Calendar, Clock, Users, FileText } from "lucide-react";

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
}

interface Extras {
  phone?: string | null;
  avatar_url?: string | null;
  assignedClientsCount?: number;
  invitesSentCount?: number;
  tenantNames?: string[];
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");

export function MemberProfileDrawer({ member, open, onOpenChange }: Props) {
  const [extras, setExtras] = useState<Extras>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !member) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: prof }, clientsRes, invitesRes, tenantRes] = await Promise.all([
          supabase.from("profiles").select("phone, avatar_url").eq("user_id", member.user_id).maybeSingle(),
          supabase.from("clients").select("id", { count: "exact", head: true }).eq("assigned_coach_user_id", member.user_id),
          supabase.from("invitations").select("id", { count: "exact", head: true }).eq("invited_by", member.user_id),
          supabase.from("tenant_members").select("tenants(name)").eq("user_id", member.user_id),
        ]);
        if (cancelled) return;
        setExtras({
          phone: (prof as any)?.phone ?? null,
          avatar_url: (prof as any)?.avatar_url ?? null,
          assignedClientsCount: clientsRes.count ?? 0,
          invitesSentCount: invitesRes.count ?? 0,
          tenantNames: (tenantRes.data ?? [])
            .map((r: any) => r.tenants?.name)
            .filter(Boolean),
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, member]);

  if (!member) return null;
  const initials = (member.full_name || member.email || "?")
    .split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-base font-semibold overflow-hidden">
              {extras.avatar_url
                ? <img src={extras.avatar_url} alt="" className="w-full h-full object-cover" />
                : initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {member.is_owner && <Crown className="w-4 h-4 text-yellow-500" />}
                <span className="truncate">{member.full_name || member.email || "Unnamed"}</span>
              </div>
              {member.full_name && (
                <SheetDescription className="text-xs truncate">{member.email}</SheetDescription>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-6 text-sm">
          {/* Status */}
          <div>
            {member.suspended_at ? (
              <Badge variant="destructive" className="gap-1">
                <ShieldOff className="w-3 h-3" /> Suspended
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <ShieldCheck className="w-3 h-3" /> Active
              </Badge>
            )}
            {member.suspended_reason && (
              <p className="text-xs text-muted-foreground mt-2">Reason: {member.suspended_reason}</p>
            )}
          </div>

          <Separator />

          {/* Roles */}
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-2">Roles</div>
            <div className="flex flex-wrap gap-1">
              {member.is_owner && <Badge>Owner</Badge>}
              {member.roles.map(r => (
                <Badge key={r} variant="outline" className="capitalize">{r.replace("_", " ")}</Badge>
              ))}
              {member.roles.length === 0 && !member.is_owner && (
                <Badge variant="outline" className="text-muted-foreground">Lead / no role</Badge>
              )}
            </div>
          </div>

          <Separator />

          {/* Contact */}
          <div className="space-y-2">
            <div className="text-xs uppercase text-muted-foreground">Contact</div>
            <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /> {member.email || "—"}</div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 text-muted-foreground text-center text-xs">☎</span>
              {extras.phone || <span className="text-muted-foreground">No phone on file</span>}
            </div>
          </div>

          <Separator />

          {/* Activity */}
          <div className="space-y-2">
            <div className="text-xs uppercase text-muted-foreground">Activity</div>
            <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground" /> Joined {fmt(member.created_at)}</div>
            <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-muted-foreground" /> Last sign-in {member.last_sign_in_at ? fmt(member.last_sign_in_at) : "Never"}</div>
          </div>

          <Separator />

          {/* Footprint */}
          <div className="space-y-2">
            <div className="text-xs uppercase text-muted-foreground">Footprint</div>
            <div className="flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" /> {loading ? "…" : extras.assignedClientsCount ?? 0} assigned client{(extras.assignedClientsCount ?? 0) === 1 ? "" : "s"}</div>
            <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" /> {loading ? "…" : extras.invitesSentCount ?? 0} invitation{(extras.invitesSentCount ?? 0) === 1 ? "" : "s"} sent</div>
            {extras.tenantNames && extras.tenantNames.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Workspaces</div>
                <div className="flex flex-wrap gap-1">
                  {extras.tenantNames.map(n => <Badge key={n} variant="secondary">{n}</Badge>)}
                </div>
              </div>
            )}
          </div>

          <Separator />

          <div className="text-[11px] text-muted-foreground">User ID: <code className="text-xs">{member.user_id}</code></div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
