// Handoff card (IA slice 1c-ix) — one pending role→role lead handoff, modeled on
// ApprovalRow. Accept is THE act and the ONLY gold control on the whole Team floor
// (bg-gradient-gold); everything else is ghost/outline (§11). Accept drives the
// already-built accept_handoff() RPC (§10 callable seam), whose jsonb {ok,error,status}
// branches are all handled with honest toasts (§13). Motion (check flash + collapse) is
// reduced-motion-guarded.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Timer, ArrowRight, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/team/teamGroups";
import type { HandoffRow } from "@/hooks/useHandoffQueue";
import type { RosterMember } from "@/hooks/useTeamRoster";

// Urgency chip + left tick — word AND color, never color alone (S4). NON-GOLD: gold is
// reserved for Accept. urgent=destructive, high=warning, normal/low=muted.
const URGENCY_TICK: Record<string, string> = {
  urgent: "bg-destructive",
  high: "bg-[hsl(var(--warning))]",
  normal: "bg-muted-foreground/40",
  low: "bg-muted-foreground/30",
};
const URGENCY_CHIP: Record<string, string> = {
  urgent: "border-destructive/40 text-destructive",
  high: "border-[hsl(var(--warning)/0.4)] text-[hsl(var(--warning))]",
  normal: "text-muted-foreground",
  low: "text-muted-foreground",
};

function nameFor(id: string | null, memberById: Record<string, RosterMember>): string | null {
  if (!id) return null;
  const m = memberById[id];
  return m?.full_name?.trim() || m?.email || null;
}

function leadLabel(row: HandoffRow): string {
  const ctx = row.lead_context ?? {};
  const ctxName = typeof ctx.name === "string" ? ctx.name.trim() : "";
  if (ctxName) return ctxName;
  return "Lead";
}

function targetLabel(row: HandoffRow, memberById: Record<string, RosterMember>): string {
  const named = nameFor(row.to_user_id_target, memberById);
  if (named) return named;
  if (row.to_role_target) return roleLabel(row.to_role_target);
  return "Next available";
}

function expiryLabel(expiresAt: string | null): { text: string; overdue: boolean } | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - Date.now();
  if (ms <= 0) return { text: "Expired", overdue: true };
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) return { text: `Expires in ${Math.floor(hours / 24)}d`, overdue: false };
  if (hours >= 1) return { text: `Expires in ${hours}h`, overdue: false };
  return { text: `Expires in ${Math.max(1, mins)}m`, overdue: false };
}

export function HandoffCard({
  row,
  memberById,
  onResolved,
}: {
  row: HandoffRow;
  memberById: Record<string, RosterMember>;
  onResolved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const fromName = nameFor(row.from_user_id, memberById);
  const lead = leadLabel(row);
  const target = targetLabel(row, memberById);
  const urgency = row.urgency ?? "normal";
  const expiry = expiryLabel(row.expires_at);

  const accept = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "accept_handoff" as any,
      { p_id: row.id },
    );
    setBusy(false);

    if (error) {
      toast.error(error.message ?? "Couldn't accept that handoff."); // keep the row
      return;
    }
    const res = (data ?? {}) as { ok?: boolean; error?: string; status?: string };
    if (res.ok === false) {
      if (res.error === "handoff_not_found") toast.error("That handoff is no longer available.");
      else if (res.error === "not_pending") toast.message(`Already ${res.status ?? "resolved"}.`);
      else toast.error(res.error ?? "Couldn't accept that handoff.");
      onResolved?.();
      return;
    }
    // Success beat: flash the check, then collapse. Realtime ticks the queue down.
    setAccepted(true);
    setTimeout(() => setCollapsing(true), 240);
    onResolved?.();
  };

  return (
    <div className={cn("cc-collapse", collapsing && "cc-collapsing")}>
      <div>
        <div className="relative flex items-start gap-2.5 rounded-md border p-2.5 pl-3 transition-colors hover:bg-muted/40">
          <span className={cn("absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full", URGENCY_TICK[urgency] ?? "bg-muted-foreground/30")} />
          {accepted && (
            <span className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-accent/10">
              <Check className="h-6 w-6 text-accent" />
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium">{lead}</p>
              <Badge variant="outline" className={cn("shrink-0 text-[10px] capitalize tabular-nums", URGENCY_CHIP[urgency] ?? "")}>
                {urgency}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 min-w-0">
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">{fromName ?? "Unassigned"}</span>
                <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{target}</span>
              </span>
              {expiry && (
                <span className={cn("inline-flex items-center gap-1", expiry.overdue && "text-muted-foreground")}>
                  <Timer className="h-3 w-3" /> {expiry.text}
                </span>
              )}
            </div>
            <div className="flex items-center justify-end gap-1.5 pt-0.5">
              <Button
                size="sm"
                variant="gold"
                onClick={accept}
                disabled={busy || accepted}
                className="h-7"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Accept"}
              </Button>
              {row.contact_id && (
                <Button asChild size="sm" variant="ghost" className="h-7">
                  <Link to={`/admin/contacts/${row.contact_id}`}>View</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
