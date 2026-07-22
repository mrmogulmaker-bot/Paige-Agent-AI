// Handoff queue panel (IA slice 1c-ix), modeled on DraftsAwaitingPanel. Renders the
// REAL, RLS-scoped, realtime team_handoff_queue as ranked HandoffCard rows. Ranking is
// by REAL columns only (§13): urgency, then soonest expiry, then oldest created_at.
//
// HONESTY (§13): there is NO producer filing handoffs today, so the queue is empty and a
// crafted §11 EmptyState shows now. The query + realtime are real, so it fills the instant
// the filed "mark lead qualified → file handoff" seam writes a row. Gold is spent ONLY on
// the per-card Accept act (HandoffCard) — this panel adds none.
import { useMemo } from "react";
import { ArrowLeftRight } from "lucide-react";
import { SectionCard, EmptyState, StatePill } from "@/components/ui/page";
import type { HandoffRow } from "@/hooks/useHandoffQueue";
import type { RosterMember } from "@/hooks/useTeamRoster";
import { HandoffCard } from "./HandoffCard";

const URGENCY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function rank(a: HandoffRow, b: HandoffRow): number {
  const ua = URGENCY_RANK[a.urgency] ?? 9;
  const ub = URGENCY_RANK[b.urgency] ?? 9;
  if (ua !== ub) return ua - ub;
  const ea = a.expires_at ? Date.parse(a.expires_at) : Infinity;
  const eb = b.expires_at ? Date.parse(b.expires_at) : Infinity;
  if (ea !== eb) return ea - eb;
  return Date.parse(a.created_at) - Date.parse(b.created_at);
}

export function HandoffQueuePanel({
  items,
  memberById,
  refresh,
  ownerUnscoped = false,
  cap = 6,
}: {
  items: HandoffRow[];
  memberById: Record<string, RosterMember>;
  refresh: () => void;
  /** Platform owner with no active tenant → the realtime filter can't scope; ask them to pick. */
  ownerUnscoped?: boolean;
  cap?: number;
}) {
  const ranked = useMemo(() => [...items].sort(rank), [items]);
  const visible = ranked.slice(0, cap);
  const overflow = ranked.length - visible.length;

  return (
    <SectionCard
      title="Handoff queue"
      description="Leads teed up to move from one teammate to the next."
      icon={ArrowLeftRight}
      // A count pill only earns its place when there IS a queue — an empty queue already
      // says "No handoffs waiting" in the body, so we don't double the signal (§11).
      actions={items.length > 0 ? <StatePill state="building">{items.length} waiting</StatePill> : undefined}
    >
      {ownerUnscoped ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Select a tenant to see its handoffs"
          description="Pick a workspace from the tenant switcher to view the leads waiting to move between teammates."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No handoffs waiting"
          description="When a lead is ready to move from one teammate to the next, it lands here to accept."
        />
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <HandoffCard key={row.id} row={row} memberById={memberById} onResolved={refresh} />
          ))}
          {overflow > 0 && (
            <p className="pt-1 text-center text-xs text-muted-foreground">
              +{overflow} more waiting
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}
