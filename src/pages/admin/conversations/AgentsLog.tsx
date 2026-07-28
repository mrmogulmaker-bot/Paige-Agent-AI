import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { EmptyState, StatePill } from "@/components/ui/page";
import { Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type PaigeActionRow, PAIGE_ACTION_COLS } from "./inbox-shared";

// action-bus status → the shared StatePill vocabulary. Never gold — an agent action is not
// the operator's act/approve moment (§11); "building" is indigo, "success" the resolved green.
const STATUS_PILL: Record<string, { state: "building" | "success" | "pending" | "error" | "off"; label: string }> = {
  filed: { state: "pending", label: "Filed" },
  assigned: { state: "pending", label: "Assigned" },
  drafting: { state: "building", label: "Drafting" },
  drafted: { state: "building", label: "Drafted" },
  pending_approval: { state: "building", label: "Awaiting you" },
  approved: { state: "building", label: "Approved" },
  executing: { state: "building", label: "Sending" },
  executed: { state: "success", label: "Done" },
  resolved: { state: "success", label: "Done" },
  failed: { state: "error", label: "Failed" },
  cancelled: { state: "off", label: "Cancelled" },
  expired: { state: "off", label: "Expired" },
};

// §11/§36 — attribution must read as one of Paige's teammates, never a backend registry key.
// created_by_agent is usually already human ("Paige Sales Agent"). A raw assigned_subagent_slug
// (e.g. "subagent-email-composer") gets its backend "subagent-" prefix stripped and title-cased
// → "Email Composer", so a coach sees a team member, not a table slug.
function agentLabel(a: PaigeActionRow): string {
  const human = a.created_by_agent?.trim();
  if (human) return human;
  const cleaned = (a.assigned_subagent_slug ?? "")
    .replace(/^subagent[-_]/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return cleaned || "Paige";
}
const ts = (a: PaigeActionRow) => a.resolved_at ?? a.executed_at ?? a.drafted_at ?? a.filed_at;

export function AgentsLog({ contactId }: { contactId: string | null }) {
  const [rows, setRows] = useState<PaigeActionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contactId) { setRows([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    (async () => {
      // No tenant filter is passed or trusted: paige_actions RLS pins an authenticated coach/admin
      // to tenant_id = current_user_tenant_id(), so this is honest + tenant-isolated (§9). contact_id
      // is a global-unique clients PK, so no cross-tenant collision. `supabase as any` matches the
      // file family's house pattern (generated types are stale for some action-bus columns, #234).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data } = await sb
        .from("paige_actions")
        .select(PAIGE_ACTION_COLS)
        .eq("contact_id", contactId)
        .order("filed_at", { ascending: false })
        .limit(8);
      if (alive) { setRows((data as PaigeActionRow[]) ?? []); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [contactId]);

  // §11 — a skeleton, never a bare blank, under the always-rendered "What Paige did" heading.
  if (loading) {
    return (
      <ul className="space-y-1.5" aria-hidden>
        {[0, 1].map((i) => (
          <li key={i} className="rounded-md border border-border/60 bg-card px-2.5 py-2">
            <div className="h-3 w-2/3 rounded bg-muted" />
            <div className="mt-1.5 h-2.5 w-2/5 rounded bg-muted/70" />
          </li>
        ))}
      </ul>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Bot}
        tone="muted"
        className="py-6"
        title="Paige hasn't acted on this contact yet."
        description="When Paige drafts a reply, files a follow-up, or flags this contact, it shows up here — with which of her team did it."
      />
    );
  }

  return (
    <ul className="space-y-1.5">
      {rows.map((a) => {
        const p = STATUS_PILL[a.status] ?? { state: "pending" as const, label: a.status };
        return (
          <li key={a.id} className="rounded-md border border-border/60 bg-card px-2.5 py-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{a.title}</span>
              <StatePill state={p.state}>{p.label}</StatePill>
            </div>
            {/* Full --muted-foreground on the meta; only the separator is dimmed (AA, §11/§23). */}
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">Paige · {agentLabel(a)}</span>
              <span className="opacity-50" aria-hidden>·</span>
              <span className="shrink-0 tabular-nums">{formatDistanceToNow(new Date(ts(a)), { addSuffix: true })}</span>
            </div>
            {a.status === "failed" && a.error && (
              <p className="mt-1 text-[11px] text-destructive">{a.error}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
