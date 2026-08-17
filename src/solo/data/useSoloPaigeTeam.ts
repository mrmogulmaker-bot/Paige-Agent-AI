/**
 * useSoloPaigeTeam — the Solo Paige › "Paige Team" adapter (§18: composes the
 * EXISTING `usePaigeDeptStatus` seam, never a new query family).
 *
 * A THIN composition layer. It reshapes the live, RLS-tenant-scoped department
 * status into exactly the `PT.team` prop shape the solo `PaigeTeam` fixture already
 * renders ({ n, role, level, open, handoff, c }), so the design is preserved and
 * only the DATA source changes. Drop-in: replace the `PT.team` const with
 * `useSoloPaigeTeam().team`.
 *
 * Seam reused (data only):
 *   • usePaigeDeptStatus() → paige_departments (enabled) + paige_actions (open),
 *     one row per §16 department with the LIVE open count routed TO that desk.
 *
 * §9 TENANT ISOLATION: this adapter passes NO tenant_id anywhere — usePaigeDeptStatus
 * derives scope from the session/RLS on its own (current_user_tenant_id()), so a
 * sub-account sees ITS OWN book, never the parent aggregate. Do not re-widen.
 *
 * §13/§31 HONESTY — what is LIVE vs Preview:
 *   • n     (name)      → LIVE   paige_departments.name
 *   • open  (openCount) → LIVE   count of non-terminal paige_actions to this desk
 *   • role              → PREVIEW static design copy per department (a fixed platform
 *                          fact about what the desk does — NOT tenant data)
 *   • handoff           → PREVIEW static design copy (there is no "hands to" routing
 *                          seam to read; never invent a routing claim)
 *   • c     (color)     → PREVIEW presentation color per department
 *   • level (autonomy)  → PREVIEW there is NO real per-department autonomy seam, so
 *                          this is a fixed default and the 4-level slider is READ-ONLY
 *                          (do NOT wire a fake write — the slider persists nothing)
 *
 * When the §16 departments seed is absent (an env without the migration),
 * `usePaigeDeptStatus` reports `configured:false` and this adapter returns an empty
 * team + `empty:true` — never a fabricated department grid.
 */
import { useMemo } from "react";
import { usePaigeDeptStatus, type DeptStatusRow } from "@/hooks/usePaigeDeptStatus";

/** The exact `PT.team` fixture shape the solo `PaigeTeam` component consumes. */
export interface SoloTeamDept {
  /** Department display name — LIVE (paige_departments.name). */
  n: string;
  /** What the desk does — PREVIEW static design copy. */
  role: string;
  /** Autonomy level 1–4 — PREVIEW (no seam); slider is read-only. */
  level: number;
  /** Open (non-terminal) actions routed TO this desk — LIVE. */
  open: number;
  /** "Hands to …" label — PREVIEW static design copy. */
  handoff: string;
  /** Plate/accent color — PREVIEW presentation. */
  c: string;
}

export interface SoloPaigeTeamData {
  team: SoloTeamDept[];
  loading: boolean;
  /** false = no §16 departments seed → render honest empty, never a fake grid. */
  configured: boolean;
  /** True only when configured and there is genuinely nothing (no departments). */
  empty: boolean;
}

/**
 * Static PRESENTATION for each canonical §16 department slug. This is design copy +
 * color only (role/handoff/color) — a fixed platform fact about the org model, never
 * tenant data (§13). Keyed by the real `paige_departments` slugs. Unknown slugs fall
 * back to neutral values so a desk the DB has but this map hasn't caught up to still
 * renders honestly (§32: degrade visibly, never blank).
 */
const DEPT_PRESENTATION: Record<
  string,
  { role: string; handoff: string; c: string }
> = {
  executive_office: {
    role: "Priorities · brief · orchestration",
    handoff: "Owner Ops",
    c: "var(--gold)",
  },
  owner_ops: {
    role: "Pipeline · follow-ups · retainers",
    handoff: "Client Success",
    c: "var(--gold)",
  },
  marketing: {
    role: "Content · campaigns · social",
    handoff: "Sales",
    c: "#3FA6B8",
  },
  sales: {
    role: "Pipeline · outreach · deals",
    handoff: "Finance",
    c: "#E88A80",
  },
  client_experience: {
    role: "Onboarding · answers · nurture",
    handoff: "Owner Ops",
    c: "var(--violet)",
  },
  product_curriculum: {
    role: "Curriculum · delivery · assets",
    handoff: "Operations",
    c: "#F2C97A",
  },
  technology_automation: {
    role: "Automations · integrations · fixes",
    handoff: "Operations",
    c: "var(--ok)",
  },
  finance: {
    role: "Invoices · dunning · forecasts",
    handoff: "Owner Ops",
    c: "#E88A80",
  },
  people_talent: {
    role: "Hiring · roles · enablement",
    handoff: "Executive Office",
    c: "#B08CE0",
  },
  legal_compliance: {
    role: "Checks · policy · compliance",
    handoff: "Operations",
    c: "#7D9CF5",
  },
  operations_pmo: {
    role: "Delivery · workflows · vendors",
    handoff: "Systems",
    c: "#4CC48C",
  },
};

/** Fixed default autonomy level for the read-only slider (§13 — Preview, no seam). */
const DEFAULT_LEVEL = 2;

const FALLBACK_PRESENTATION = {
  role: "Standing by",
  handoff: "—",
  c: "var(--violet)",
};

function toTeamDept(d: DeptStatusRow): SoloTeamDept {
  const p = DEPT_PRESENTATION[d.slug] ?? FALLBACK_PRESENTATION;
  return {
    n: d.name, // LIVE
    open: d.openCount, // LIVE
    role: p.role, // Preview
    handoff: p.handoff, // Preview
    c: p.c, // Preview
    level: DEFAULT_LEVEL, // Preview (read-only slider)
  };
}

export function useSoloPaigeTeam(): SoloPaigeTeamData {
  const { loading, configured, departments } = usePaigeDeptStatus();

  const team = useMemo<SoloTeamDept[]>(
    () => departments.map(toTeamDept),
    [departments],
  );

  return {
    team,
    loading,
    configured,
    empty: !loading && configured && team.length === 0,
  };
}
