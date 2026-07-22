// Team — the LIVE OPS FLOOR (IA slice 1c-ix). Replaces the 1c-v placeholder EmptyState
// (§18: extend the existing surface, no new route — this stays at /admin/team, aliases
// /admin/members, /admin/coaches). A working surface: COMPACT plain PageHeader (§11 banner
// rule — the floor leads, no hero), scoreboard + live availability, handoff queue, members
// & roles, assignments, and a reserved comp panel.
//
// HONESTY (§13): AVAILABILITY, MEMBERS, and ASSIGNMENTS render REAL data. SCOREBOARD and
// HANDOFF QUEUE render crafted EmptyStates because no producer writes their data yet — the
// queries + realtime are REAL, so they fill the instant a producer starts. COMP is reserved.
// No fabricated numbers, no fake rows, no "Paige noticed" language.
//
// §9: NO client-supplied tenant_id. Presence RPCs derive tenant server-side; scoreboard/
// handoff are RLS-only reads; activeTenantId (from useTenantContext) appears ONLY inside the
// realtime filter strings. View filters are client-side and never leak higher-tier scope to
// a lower role.
import { useMemo } from "react";
import { PageShell, PageHeader } from "@/components/ui/page";
import { RoleGate } from "@/components/auth/RoleGate";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useCommandCenterView } from "@/hooks/useCommandCenterView";
import {
  resolvePersona,
  TEAM_VIEW_ENABLED,
  type CommandCenterView,
} from "@/lib/roleViews/commandCenterRegistry";
import { useTeamRoster } from "@/hooks/useTeamRoster";
import { useTeamScoreboard } from "@/hooks/useTeamScoreboard";
import { useHandoffQueue } from "@/hooks/useHandoffQueue";
import { TeamViewToggle } from "@/components/team/TeamViewToggle";
import { TeamScoreboard } from "@/components/team/TeamScoreboard";
import { AvailabilityRail } from "@/components/team/AvailabilityRail";
import { HandoffQueuePanel } from "@/components/team/HandoffQueuePanel";
import { MembersRolesPanel } from "@/components/team/MembersRolesPanel";
import { AssignmentsPanel } from "@/components/team/AssignmentsPanel";
import { CompTrackingPanel } from "@/components/team/CompTrackingPanel";

function TeamFloor() {
  const { roles, userId } = useUserRoles();
  const { activeTenantId, activeTenant, isPlatformOwner } = useTenantContext();

  // Presentation-only persona/view resolution — NEVER gates a data read (§9), mirrors
  // PracticeOverview. Team stays gated OFF until TEAM_VIEW_ENABLED flips.
  const isOwner = (!!userId && activeTenant?.owner_user_id === userId) || isPlatformOwner;
  const persona = resolvePersona(roles, isOwner);
  const availableViews = useMemo<CommandCenterView[]>(
    () => persona.views.filter((v) => v !== "team" || TEAM_VIEW_ENABLED),
    [persona.views],
  );
  const { view, setView, canSwitch } = useCommandCenterView(availableViews, persona.defaultView, "paige_team_view");

  // "My Queue" narrows to the signed-in user; a platform owner in "business" also collapses
  // to their own scope so RLS never surfaces every tenant's rows (§9, mirrors PracticeOverview).
  const effectiveMine = view === "mine" || (view === "business" && isPlatformOwner);
  const restrictToUserId = effectiveMine ? userId : null;

  // Shared roster (one admin-list-users call; self-degrades to empty for non-admins, §13).
  const roster = useTeamRoster(true);
  const scoreboard = useTeamScoreboard(activeTenantId);
  const handoffs = useHandoffQueue(activeTenantId);

  const canManagePresence =
    isPlatformOwner || roles.includes("admin") || roles.includes("coach") || roles.includes("manager");

  // "My Queue" handoff filter (client-side; never a tenant param, never widens a lower role).
  const handoffItems = useMemo(() => {
    if (!effectiveMine || !userId) return handoffs.items;
    return handoffs.items.filter(
      (h) =>
        h.to_user_id_target === userId ||
        h.from_user_id === userId ||
        (h.to_role_target != null && roles.includes(h.to_role_target)),
    );
  }, [handoffs.items, effectiveMine, userId, roles]);

  const ownerUnscoped = isPlatformOwner && !activeTenantId;

  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        title="Team"
        description="Your team's live operations floor — scoreboard, availability, and handoffs in one place."
        actions={canSwitch ? <TeamViewToggle views={availableViews} value={view} onChange={setView} /> : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <TeamScoreboard
          rows={scoreboard.rows}
          loading={scoreboard.loading}
          memberById={roster.memberById}
          rolesByUser={roster.rolesByUser}
          restrictToUserId={restrictToUserId}
        />
        <AvailabilityRail
          tenantId={activeTenantId}
          rolesByUser={roster.rolesByUser}
          canManage={canManagePresence}
        />
      </div>

      <HandoffQueuePanel
        items={handoffItems}
        memberById={roster.memberById}
        refresh={handoffs.refresh}
        ownerUnscoped={ownerUnscoped}
      />

      <MembersRolesPanel members={roster.members} loading={roster.loading} />

      <AssignmentsPanel memberById={roster.memberById} restrictToUserId={restrictToUserId} />

      <CompTrackingPanel />
    </PageShell>
  );
}

export default function TeamHub() {
  // The whole floor is staff-only; Members & Roles inside stays admin-only (its own gate).
  // A non-staff user gets RoleGate's default "Restricted area" panel.
  return (
    <RoleGate allow={["admin", "coach", "sales_rep", "cs_rep", "finance", "manager", "owner", "viewer"]}>
      <TeamFloor />
    </RoleGate>
  );
}
