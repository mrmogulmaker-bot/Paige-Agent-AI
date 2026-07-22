// Assignments (DRI) panel (IA slice 1c-ix) — an HONEST single-axis assignment summary.
// The only shipped assignment data is clients.assigned_coach_user_id (paige_coach_assignments
// has ZERO UI consumers), so we render per-coach client counts + a drill list, NOT a fake
// multi-role DRI matrix (§13 — a full matrix is a filed follow-up). §9: RLS scopes the read,
// no client tenant param. "My Queue" view narrows to the signed-in user's own clients.
import { useEffect, useMemo, useRef, useState } from "react";
import { UserSquare2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, DataTableShell, EmptyState, type Column } from "@/components/ui/page";
import { TableCell, TableRow } from "@/components/ui/table";
import type { RosterMember } from "@/hooks/useTeamRoster";

type ClientRow = { id: string; first_name: string | null; last_name: string | null; assigned_coach_user_id: string | null };

const COLUMNS: Column[] = [
  { key: "coach", header: "Assigned to" },
  { key: "count", header: "Clients", numeric: true },
];

function coachName(id: string, memberById: Record<string, RosterMember>): string {
  const m = memberById[id];
  return m?.full_name?.trim() || m?.email || "Teammate";
}

export function AssignmentsPanel({
  memberById,
  restrictToUserId = null,
}: {
  memberById: Record<string, RosterMember>;
  /** "My Queue" view → only the signed-in user's assigned clients. */
  restrictToUserId?: string | null;
}) {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      // RLS-scoped read — no client tenant param (§9).
      let q = supabase.from("clients").select("id, first_name, last_name, assigned_coach_user_id");
      if (restrictToUserId) q = q.eq("assigned_coach_user_id", restrictToUserId);
      const { data } = await q.limit(2000);
      if (!mountedRef.current) return;
      setClients((data ?? []) as ClientRow[]);
      setLoading(false);
    })();
    return () => { mountedRef.current = false; };
  }, [restrictToUserId]);

  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    let unassigned = 0;
    for (const c of clients) {
      if (c.assigned_coach_user_id) counts.set(c.assigned_coach_user_id, (counts.get(c.assigned_coach_user_id) ?? 0) + 1);
      else unassigned += 1;
    }
    const rows = Array.from(counts.entries())
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count);
    return { rows, unassigned };
  }, [clients]);

  const isEmpty = !loading && summary.rows.length === 0 && summary.unassigned === 0;

  return (
    <SectionCard
      title="Assignments"
      description="Who owns which clients."
      icon={UserSquare2}
      footer={
        <p className="text-xs text-muted-foreground">
          Multi-role ownership (a full DRI grid across roles) arrives with the standing-assignments surface — tracked as a follow-up.
        </p>
      }
    >
      {isEmpty ? (
        <EmptyState
          icon={UserSquare2}
          title="No client assignments yet"
          description="As clients get assigned to a teammate, ownership shows up here."
        />
      ) : (
        <DataTableShell columns={COLUMNS} loading={loading} className="border-0 shadow-none">
          {summary.rows.map((r) => (
            <TableRow key={r.userId}>
              <TableCell className="font-medium">{coachName(r.userId, memberById)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.count}</TableCell>
            </TableRow>
          ))}
          {summary.unassigned > 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground">Unassigned</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{summary.unassigned}</TableCell>
            </TableRow>
          )}
        </DataTableShell>
      )}
    </SectionCard>
  );
}
