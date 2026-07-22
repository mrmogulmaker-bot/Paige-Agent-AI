// Members & Roles panel (IA slice 1c-ix) — the staff roster INSIDE the Team floor,
// team-grouped into collapsible SectionCards. §18: reuses the roster shape + the existing
// MemberProfileDrawer (no new route; Admin.tsx unchanged). Admin-gated (mirrors
// MembersAdmin's AdminOnly gate). Grouping is a role-derived UI organization (§13 —
// "Grouped by role", never a backend segmentation). No per-member scoreboard here (no
// metrics → would be fabricated).
import { useMemo, useState } from "react";
import { Users2, ChevronDown } from "lucide-react";
import { SectionCard, DataTableShell, EmptyState, StatePill, type Column } from "@/components/ui/page";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RoleGate } from "@/components/auth/RoleGate";
import { MemberProfileDrawer, type MemberProfile } from "@/components/admin/MemberProfileDrawer";
import { GROUP_LABEL, GROUP_ORDER, groupForRoles, roleLabel, type TeamGroup } from "@/lib/team/teamGroups";
import type { RosterMember } from "@/hooks/useTeamRoster";

const COLUMNS: Column[] = [
  { key: "member", header: "Member" },
  { key: "roles", header: "Roles" },
  { key: "status", header: "Status" },
];

function initialsOf(m: RosterMember): string {
  const s = (m.full_name || m.email || "?").split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("");
  return s.toUpperCase() || "?";
}

function GroupCard({
  group,
  members,
  onSelect,
}: {
  group: TeamGroup;
  members: RosterMember[];
  onSelect: (m: RosterMember) => void;
}) {
  const [open, setOpen] = useState(group === "leadership" || group === "sales");
  return (
    <SectionCard
      title={GROUP_LABEL[group]}
      description={`${members.length} ${members.length === 1 ? "member" : "members"}`}
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-expanded={open}
          aria-label={open ? `Collapse ${GROUP_LABEL[group]}` : `Expand ${GROUP_LABEL[group]}`}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </Button>
      }
      padded={false}
    >
      {open ? (
        <DataTableShell columns={COLUMNS} className="border-0 shadow-none rounded-none">
          {members.map((m) => (
            <TableRow key={m.user_id} className="cursor-pointer" onClick={() => onSelect(m)}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-[11px] font-semibold text-muted-foreground">
                    {m.avatar_url ? <img src={m.avatar_url} alt="" className="h-full w-full object-cover" /> : initialsOf(m)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.full_name || m.email || "—"}</div>
                    {m.full_name && m.email && <div className="truncate text-xs text-muted-foreground">{m.email}</div>}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {m.is_owner && <Badge variant="outline">Owner</Badge>}
                  {m.roles.map((r) => (
                    <Badge key={r} variant="outline">{roleLabel(r)}</Badge>
                  ))}
                  {m.roles.length === 0 && !m.is_owner && (
                    <span className="text-xs text-muted-foreground">No role</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {/* Account status, NOT live presence (§13) — a static pill, never an
                    online-pulsing dot. Real presence lives in the Availability rail. */}
                <StatePill state={m.suspended_at ? "off" : "success"}>
                  {m.suspended_at ? "Suspended" : "Active"}
                </StatePill>
              </TableCell>
            </TableRow>
          ))}
        </DataTableShell>
      ) : undefined}
    </SectionCard>
  );
}

export function MembersRolesPanel({
  members,
  loading,
}: {
  members: RosterMember[];
  loading: boolean;
}) {
  const [selected, setSelected] = useState<RosterMember | null>(null);

  const byGroup = useMemo(() => {
    const map = new Map<TeamGroup, RosterMember[]>();
    for (const m of members) {
      const g = groupForRoles(m.roles);
      const list = map.get(g);
      if (list) list.push(m);
      else map.set(g, [m]);
    }
    return map;
  }, [members]);

  const nonEmptyGroups = GROUP_ORDER.filter((g) => (byGroup.get(g)?.length ?? 0) > 0);

  return (
    <RoleGate allow={["admin"]} fallback={<></>}>
      <div className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Members &amp; Roles</h2>
          <p className="text-sm text-muted-foreground">Grouped by role.</p>
        </div>

        {loading && members.length === 0 ? (
          <SectionCard>
            <EmptyState icon={Users2} title="Loading your team…" />
          </SectionCard>
        ) : nonEmptyGroups.length === 0 ? (
          <SectionCard>
            <EmptyState
              icon={Users2}
              title="No teammates yet"
              description="Invite admins, coaches, sales reps, and staff to see them organized here by role."
            />
          </SectionCard>
        ) : (
          <div className="space-y-3">
            {nonEmptyGroups.map((g) => (
              <GroupCard key={g} group={g} members={byGroup.get(g)!} onSelect={setSelected} />
            ))}
          </div>
        )}
      </div>

      <MemberProfileDrawer
        member={selected as MemberProfile | null}
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      />
    </RoleGate>
  );
}
