/**
 * useSoloSubagents — the Solo Paige-Hub › Sub-Agents adapter (§18: composes the
 * EXISTING tenant-VP + forged-specialist seams, never a new query family).
 *
 * WHAT IT COMPOSES (§18 — thin reshape, no re-query):
 *   • VP_ROSTER (`@/components/ui/page`)   — the 7 platform VPs shipped to EVERY
 *     tenant as the standing team Paige delegates to (PAIGE is the orchestrator
 *     herself, excluded here — the console lists the specialists she hands work
 *     to, matching PaigeTeamDirectory's `ORDER.filter(id !== 'PAIGE')`).
 *   • useTenantSpecialists (`@/hooks/usePaigeOrchestrator`) — the tenant's OWN
 *     Paige-forged "keeper" specialists (`paige_subagents` rows with a non-null
 *     tenant_id, RLS-scoped). This is the tenant VP-roster path DELIBERATELY, NOT
 *     the operator-global `useSubAgents` (which reads every tenant's rows).
 *
 * §9/§51 TENANT ISOLATION: this adapter passes NO tenant_id anywhere. The VP roster
 * is a compiled platform constant (same for everyone); the forged specialists come
 * from useTenantSpecialists, whose read is gated SERVER-SIDE by the existing
 * `paige_subagents_tenant_read` RLS (`current_user_tenant_id()` from the JWT — the
 * client can't spoof it), so a sub-account sees only ITS OWN forged agents, never
 * the parent agency's. RLS is the floor; no SECURITY DEFINER aggregate is added.
 *
 * §13/§31 HONESTY — which fields are REAL vs PREVIEW (mirrors the fixture shape in
 * src/solo/paigehub.tsx `PT.subagents = {n, kind, tag, on, d, runs, ok}`):
 *   • n    — REAL. VP_ROSTER[id].name / specialist.name.
 *   • d    — REAL. VP remit (the shipped one-line remit) / specialist.description.
 *   • tag  — REAL (reshaped). Short token off the VP remit / specialist department
 *            or domain — a projection of real data, never invented.
 *   • on   — REAL. VPs are always-on shipped defaults (true); useTenantSpecialists
 *            already filters `.eq("enabled", true)`, so every forged row is on:true.
 *   • kind — PREVIEW. The composed reads carry NO `runtime` column (useTenantSpecialists
 *            selects slug/name/domain/description/department/display_order only, and
 *            VP_ROSTER has none), so the soft/local distinction is NOT sourced here.
 *            Defaulted to 'soft' (VPs + forged specialists ARE prompt/orchestration
 *            specialists, not local edge functions — the honest default), but it is
 *            NOT a stored fact. Wiring the real runtime is a follow-up that would
 *            widen the tenant read.
 *   • runs — PREVIEW. No run telemetry is composed here (neither seam carries a run
 *            count). Defaulted to 0 — an honest "not tracked in this read", never an
 *            invented non-zero number.
 *   • ok   — PREVIEW. No success telemetry composed → null, which the UI already
 *            hides (`{a.ok!=null && …}`), so no fabricated "% clean" ever renders.
 *
 * PROPOSALS / QUOTA (§13): there is no cheap, tenant-scoped sub-agent-proposal seam
 * to compose (forging a specialist is a §20 chat act, not a table this surface owns),
 * so `proposals` is honestly EMPTY and flagged PREVIEW — never the fixture's invented
 * "Onboarding Sequencer" / "Referral Asker". The "Today: 2/10 …" quota line is
 * hardcoded UI chrome (not part of PT), so it is untouched here.
 *
 * DROP-IN: `subagents` returns the EXACT PT.subagents shape; the rewire replaces the
 * fixture const with this array. UI is preserved verbatim (§28 owner-locked design).
 */
import { useMemo } from "react";
import { VP_ROSTER, type VP } from "@/components/ui/page";
import {
  useTenantSpecialists,
  type TenantSpecialist,
} from "@/hooks/usePaigeOrchestrator";

/** One sub-agent in the EXACT `PT.subagents[]` shape the solo UI already renders. */
export interface SoloSubagent {
  /** Display name (REAL). */
  n: string;
  /** 'soft' | 'local' — PREVIEW (no runtime column composed; defaults 'soft'). */
  kind: "soft" | "local";
  /** Short remit/domain token (REAL, reshaped). */
  tag: string;
  /** Enabled (REAL — VPs always-on; forged rows are enabled-filtered upstream). */
  on: boolean;
  /** One-line description (REAL — VP remit / specialist description). */
  d: string;
  /** Run count — PREVIEW (no telemetry composed; 0). */
  runs: number;
  /** Clean % — PREVIEW (no telemetry composed; null hides the stat in the UI). */
  ok: number | null;
}

/** A proposal in the EXACT `PT.proposals[]` shape — PREVIEW (no real seam). */
export interface SoloSubagentProposal {
  n: string;
  why: string;
  kind: "soft" | "local";
}

export interface SoloSubagentsData {
  subagents: SoloSubagent[];
  /** Always PREVIEW-empty today — no tenant-scoped sub-agent-proposal seam to compose. */
  proposals: SoloSubagentProposal[];
  loading: boolean;
  /**
   * True only when there is genuinely nothing to show. In practice the 6 platform
   * VPs are a compiled constant present for every tenant, so this is effectively
   * always false — retained for API symmetry with the other solo adapters.
   */
  empty: boolean;
  refresh: () => void;
}

/** Fixed order — the 6 specialists Paige delegates to (PAIGE the orchestrator excluded). */
const VP_ORDER: VP[] = ["VERA", "NEXUS", "CURA", "MENTOR", "MERIT", "ZION"];

/**
 * A short lowercase tag token off a remit/department/domain string — a projection
 * of REAL data (§13, never invented). "Marketing & growth" → "marketing";
 * "Client success" → "client". Falls back to a neutral "paige" only when the source
 * is genuinely blank.
 */
function tagToken(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "paige";
  const first = s.split(/[\s&/,·]+/).filter(Boolean)[0];
  return first || "paige";
}

/** A forged specialist's remit source — department, else domain (§13 present-guarded). */
function specialistTagSource(s: TenantSpecialist): string {
  return s.department?.trim() || s.domain?.trim() || "";
}

export function useSoloSubagents(): SoloSubagentsData {
  const { specialists, loading, refresh } = useTenantSpecialists();

  const subagents = useMemo<SoloSubagent[]>(() => {
    // The 6 standing VPs — shipped to every tenant (REAL platform defaults).
    const vps: SoloSubagent[] = VP_ORDER.map((id) => {
      const vp = VP_ROSTER[id];
      return {
        n: vp.name,
        kind: "soft", // PREVIEW — VPs are orchestration personas, not sourced runtime.
        tag: tagToken(vp.remit),
        on: true, // REAL — a shipped default VP is always on.
        d: vp.remit, // REAL — the one-line remit shipped with the roster.
        runs: 0, // PREVIEW — no run telemetry composed here.
        ok: null, // PREVIEW — hides the "% clean" stat in the UI.
      };
    });

    // The tenant's OWN forged keepers (REAL, RLS-tenant-scoped).
    const forged: SoloSubagent[] = specialists.map((s) => ({
      n: s.name, // REAL
      kind: "soft", // PREVIEW — forge yields prompt-only specialists; runtime not read.
      tag: tagToken(specialistTagSource(s)), // REAL (reshaped)
      on: true, // REAL — useTenantSpecialists filters enabled=true upstream.
      d: s.description, // REAL
      runs: 0, // PREVIEW
      ok: null, // PREVIEW
    }));

    return [...vps, ...forged];
  }, [specialists]);

  const empty = !loading && subagents.length === 0;

  return {
    subagents,
    proposals: [], // PREVIEW — no tenant-scoped sub-agent-proposal seam to compose.
    loading,
    empty,
    refresh,
  };
}
