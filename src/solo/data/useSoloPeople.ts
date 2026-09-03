/**
 * useSoloPeople — the Solo Setup › People adapter (§18: wraps the EXISTING
 * `useTeamRoster` seam, never a new roster query).
 *
 * READ-ONLY this slice. It surfaces the real staff roster (name / role / email /
 * status) for the ACTIVE tenant via `useTeamRoster(true, activeTenantId)` — the
 * SAME admin-gated `admin-list-users` → user_roles → profiles path the Team floor
 * ships, RLS/§9-scoped (no client tenant param). The roles legend reuses the ONE
 * home for role copy (ROLE_LABEL/ROLE_BLURB in ManageRolesDialog), not a fork.
 *
 * DEFERRED (§53-sensitive, §13 — NO fake action): every WRITE — role grant/revoke,
 * invite, resend, suspend, remove — is a separate slice. This adapter exposes NO
 * mutation; the Setup surface renders those controls DISABLED/Preview so nothing
 * looks functional while doing nothing.
 *
 * HONEST DEGRADE (§13): `admin-list-users` is admin-gated — a non-admin gets an
 * EMPTY roster with the error surfaced (never a throw). A fresh solo tenant is
 * usually a roster of one → the caller renders a "just you" state (`onlyYou`).
 */
import { useMemo } from "react";
import { useTeamRoster, type RosterMember } from "@/hooks/useTeamRoster";
import { useTenantContext } from "@/hooks/useTenantContext";
// §18: reuse the ONE home for role copy instead of re-declaring it.
import { ROLE_LABEL, ROLE_BLURB } from "@/components/admin/ManageRolesDialog";

/** A person reshaped into exactly what the solo People list renders. */
export interface SoloPerson {
  id: string;
  name: string;
  /** Per-tenant role for the active tenant, humanized (owner-aware). */
  role: string;
  email: string | null;
  /** "Active" | "Suspended" | "Invited" — derived from real signals only. */
  status: "Active" | "Suspended" | "Invited";
  isOwner: boolean;
}

export interface SoloRoleLegendItem {
  role: string;
  label: string;
  blurb: string;
}

export interface SoloPeopleData {
  loading: boolean;
  error: string | null;
  people: SoloPerson[];
  /** True when the roster is just the single owner seat (the common solo case). */
  onlyYou: boolean;
  /** The shared role legend (ROLE_LABEL/ROLE_BLURB), for the roles reference. */
  roleLegend: SoloRoleLegendItem[];
  refresh: () => void;
}

/** Humanize a raw role slug via the shared legend, else title-case it. */
function humanizeRole(raw: string | null | undefined): string {
  if (!raw) return "Member";
  if (raw in ROLE_LABEL) return ROLE_LABEL[raw as keyof typeof ROLE_LABEL];
  const s = raw.replace(/[_-]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Member";
}

function mapPerson(m: RosterMember): SoloPerson {
  const status: SoloPerson["status"] = m.suspended_at
    ? "Suspended"
    : (m.tenant_role || m.tenant_is_owner)
      ? "Active"
      : "Invited";
  const role = m.tenant_is_owner ? "Owner" : humanizeRole(m.tenant_role ?? m.roles[0] ?? null);
  return {
    id: m.user_id,
    name: m.full_name || m.email || "Unnamed",
    role,
    email: m.email,
    status,
    isOwner: m.tenant_is_owner,
  };
}

export function useSoloPeople(): SoloPeopleData {
  const { activeTenantId } = useTenantContext();
  const { members, loading, error, refresh } = useTeamRoster(true, activeTenantId);

  const people = useMemo(() => members.map(mapPerson), [members]);

  const roleLegend = useMemo<SoloRoleLegendItem[]>(
    () =>
      (Object.keys(ROLE_LABEL) as Array<keyof typeof ROLE_LABEL>).map((role) => ({
        role,
        label: ROLE_LABEL[role],
        blurb: ROLE_BLURB[role],
      })),
    [],
  );

  const onlyYou = !loading && !error && people.length <= 1;

  return { loading, error, people, onlyYou, roleLegend, refresh };
}
