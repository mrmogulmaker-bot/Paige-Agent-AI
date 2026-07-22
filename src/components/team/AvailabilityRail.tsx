// Live Availability rail (IA slice 1c-ix) — the ONE Team-floor panel with live REAL
// data today. Renders useEffectivePresence people (polled DEFINER RPC; presence is
// deny-all to realtime, §148) grouped by role-derived team-group, with effective-status
// dots and any active override reason. Admin/coach/manager (or platform owner) can pin a
// teammate's status via the presence_set_override seam (§10). Gold is absent here —
// presence dots are semantic, the manage control is a ghost button (§11).
import { useMemo, useState } from "react";
import { Users, MoreHorizontal } from "lucide-react";
import { SectionCard, EmptyState, PresenceAvatar } from "@/components/ui/page";
import type { PresenceStatus } from "@/components/ui/page/PresenceDot";
import { Button } from "@/components/ui/button";
import { useEffectivePresence, presenceRank, type EffectivePerson } from "@/hooks/useEffectivePresence";
import { GROUP_LABEL, GROUP_ORDER, groupForRoles, type TeamGroup } from "@/lib/team/teamGroups";
import { SetOverrideDialog, type OverrideTarget } from "./SetOverrideDialog";

function personName(p: EffectivePerson): string {
  return p.full_name?.trim() || "Teammate";
}

export function AvailabilityRail({
  tenantId,
  rolesByUser,
  canManage,
}: {
  /** Owner passes activeTenantId; non-owner passes null (server pins own tenant). §9. */
  tenantId: string | null;
  /** user_id → roles, from useTeamRoster; drives grouping so it matches Members & Roles. */
  rolesByUser: Record<string, string[]>;
  /** admin/coach/manager or platform owner → can pin a teammate's status. */
  canManage: boolean;
}) {
  const { people, loading, refresh } = useEffectivePresence({ tenantId });
  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<TeamGroup, EffectivePerson[]>();
    for (const p of people) {
      const g = groupForRoles(rolesByUser[p.user_id] ?? []);
      const list = map.get(g);
      if (list) list.push(p);
      else map.set(g, [p]);
    }
    // Sort each group online → busy → away → offline.
    for (const list of map.values()) {
      list.sort((a, b) => presenceRank(a.effective_status) - presenceRank(b.effective_status));
    }
    return map;
  }, [people, rolesByUser]);

  const hasAnyone = people.length > 0;

  return (
    <>
      <SectionCard
        title="Live availability"
        description="Who's on right now, organized by role."
        icon={Users}
      >
        {!hasAnyone ? (
          <EmptyState
            icon={Users}
            title={loading ? "Checking who's around…" : "No one's active right now"}
            description={loading ? undefined : "Presence lights up here the moment a teammate signs in."}
          />
        ) : (
          <div className="space-y-4">
            {GROUP_ORDER.filter((g) => (grouped.get(g)?.length ?? 0) > 0).map((g) => {
              const list = grouped.get(g)!;
              return (
                <div key={g} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {GROUP_LABEL[g]}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{list.length}</span>
                  </div>
                  <ul className="space-y-0.5">
                    {list.map((p) => (
                      <li
                        key={p.user_id}
                        className="group flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/40"
                      >
                        <PresenceAvatar
                          name={personName(p)}
                          avatarUrl={p.avatar_url}
                          status={p.effective_status as PresenceStatus}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{personName(p)}</div>
                          {p.override_status && (
                            <div className="truncate text-[11px] text-muted-foreground">
                              Pinned: {p.override_reason?.trim() || p.override_status}
                            </div>
                          )}
                        </div>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                            aria-label={`Set availability for ${personName(p)}`}
                            onClick={() =>
                              setOverrideTarget({
                                user_id: p.user_id,
                                name: personName(p),
                                current_override_status: p.override_status,
                                current_override_reason: p.override_reason,
                              })
                            }
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SetOverrideDialog
        target={overrideTarget}
        open={!!overrideTarget}
        onOpenChange={(o) => { if (!o) setOverrideTarget(null); }}
        onSaved={refresh}
      />
    </>
  );
}
