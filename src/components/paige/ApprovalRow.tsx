// The star row of the Live desk (cc-spec §1.2 group 1, closes B1). Inline
// Approve calls the execute-approval seam (§10): it APPROVES AND ACTS — email/SMS
// drafts get sent (send-message stamps the row approved+sent_at), and categories
// with no executor yet are acknowledged (marked approved) as before. This closes
// the old silent-drop where Approve flipped status but nothing ran. On success:
// gold check flash + the row collapses (motion #2) and the realtime subscription
// ticks the count down. On error: toast, keep the row.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Timer, User, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ApprovalQueueRow } from "@/hooks/usePendingApprovals";

const SLA_LABEL: Record<string, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  on_track: "On track",
  closed: "Closed",
  unscheduled: "No SLA",
};

// Left tick + chip color, never color-only (S4): the word rides along.
const TICK_COLOR: Record<string, string> = {
  overdue: "bg-destructive",
  due_soon: "bg-gradient-gold",
  on_track: "bg-muted-foreground/40",
  closed: "bg-muted-foreground/30",
  unscheduled: "bg-muted-foreground/30",
};

const CHIP_COLOR: Record<string, string> = {
  overdue: "border-destructive/40 text-destructive",
  due_soon: "border-accent/40 text-accent",
  on_track: "text-muted-foreground",
  closed: "text-muted-foreground",
  unscheduled: "text-muted-foreground",
};

function contactLabel(a: ApprovalQueueRow): string {
  if (a.contact_first_name || a.contact_last_name) {
    return `${a.contact_first_name ?? ""} ${a.contact_last_name ?? ""}`.trim();
  }
  return a.contact_email ?? "—";
}

export function ApprovalRow({ a }: { a: ApprovalQueueRow }) {
  const [busy, setBusy] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const [approved, setApproved] = useState(false);

  const dc = a.draft_content as Record<string, unknown> | string | null;
  const fallback =
    typeof dc === "object" && dc !== null
      ? String((dc as any).subject ?? (dc as any).body ?? (dc as any).preview ?? "")
      : String(dc ?? "");
  const summary = a.summary ?? fallback;
  const state = a.sla_state;

  const approve = async () => {
    setBusy(true);
    // Approve AND act via the callable execute-approval seam (§10): email/SMS
    // drafts are sent (send-message flips the row to approved+sent_at); other
    // categories are acknowledged (marked approved) as before.
    const { data, error } = await supabase.functions.invoke("execute-approval", {
      body: { approval_id: a.id },
    });
    setBusy(false);
    if (error || (data && data.ok === false)) {
      toast.error(error?.message ?? data?.error ?? "Couldn't complete that action."); // keep the row on failure
      return;
    }
    // Success beat: flash the check, then collapse. Realtime refresh ticks count.
    setApproved(true);
    setTimeout(() => setCollapsing(true), 240);
  };

  return (
    <div className={cn("cc-collapse", collapsing && "cc-collapsing")}>
      <div>
        <div className="relative flex items-start gap-2.5 rounded-md border p-2.5 pl-3 hover:bg-muted/40 transition-colors">
          <span className={cn("absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full", TICK_COLOR[state] ?? "bg-muted-foreground/30")} />
          {approved && (
            <span className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-accent/10">
              <Check className="h-6 w-6 text-accent" />
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium line-clamp-2 min-w-0">{summary || "(no summary)"}</p>
              <Badge variant="outline" className={cn("shrink-0 text-[10px] tabular-nums", CHIP_COLOR[state] ?? "")}>
                <Timer className="mr-1 h-3 w-3" />
                {SLA_LABEL[state] ?? state}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {a.category && <span className="capitalize">{a.category.replace(/_/g, " ")}</span>}
              {a.contact_id && (
                <span className="inline-flex items-center gap-1 min-w-0">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="truncate">{contactLabel(a)}</span>
                </span>
              )}
            </div>
            <div className="flex items-center justify-end gap-1.5 pt-0.5">
              <Button
                size="sm"
                onClick={approve}
                disabled={busy || approved}
                className="h-7 bg-gradient-gold text-accent-foreground hover:opacity-90"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Approve"}
              </Button>
              <Button asChild size="sm" variant="ghost" className="h-7">
                <Link to={`/admin/approvals/${a.id}`}>View</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
