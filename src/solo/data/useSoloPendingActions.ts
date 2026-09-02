/**
 * useSoloPendingActions — the work Paige has stopped on and is waiting for a person to decide.
 *
 * WHY THIS EXISTS. The Trust Compass ships two modals that describe a decision awaiting the
 * operator. Until now both were literals in the file: an outbound email addressed to
 * `sarah.nnadi@harpervale.com`, with a body, a "why she drafted it" rationale citing behaviour
 * that never happened, and a 91% confidence figure; and a legal escalation stating that a workers'
 * compensation policy "lapsed on August 9", naming a carrier, and recommending a course of action.
 * Approving the first one raised a toast reading "Sent." — a claim that an email had gone to a
 * person who does not exist.
 *
 * That is four of the six things the standing boundary names in two modals: an invented customer
 * record, invented provider state, an invented measurement, and a fabricated successful action.
 *
 * §18 — ONE SEAM. `paige_actions` is the action bus: the row Paige files when work needs doing,
 * carrying its own title, summary, draft, originating department and rationale. `usePaigeDeptStatus`
 * already reads it for the department tiles. This composes the same table rather than inventing a
 * second idea of "what is waiting on you".
 *
 * WHAT "WAITING ON YOU" ACTUALLY IS, read off production rather than assumed. There is no
 * `pending_approval` row in use anywhere; the real shape is `status = 'filed'` with
 * `autonomy_lane = 'confirm'` — filed, and not permitted to run unattended. 117 such rows exist
 * (2026-09-01), against 37 done. A read that filtered on the status name a designer would guess
 * would have returned nothing and rendered an honest-looking empty state over a real backlog.
 *
 * §9 TENANT ISOLATION: no tenant_id is passed. The live policy on `paige_actions` gates SELECT on
 * `tenant_id = current_user_tenant_id()` plus a staff role, with an operator escape, so scope is
 * the session's. Do not add a tenant parameter.
 *
 * §13 — WHAT THIS CANNOT PROVIDE, and therefore does not. `paige_actions` has no recipient, no
 * sender, no confidence score, and no list of options. The modals rendered all four. They are not
 * "missing data to be filled in later" — they are claims with no source, so the fields go rather
 * than being defaulted to something plausible.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { departmentLabel } from "./useSoloActivityFeed";

/** How many waiting items a modal needs. It shows one; a few are read so "next" is possible. */
const MAX_ITEMS = 10;

/** One filed action that cannot proceed without a person. */
export interface SoloPendingAction {
  id: string;
  /** What the action is, as Paige filed it. */
  title: string;
  summary: string | null;
  /** The drafted artefact, when the action carries one. */
  draftContent: string | null;
  /** Why it stopped here, when the row records a reason. */
  rationale: string | null;
  /** The desk it came from, named from the seeded §16 slugs. */
  department: string;
  createdAt: string;
}

export interface SoloPendingActionsData {
  items: SoloPendingAction[];
  loading: boolean;
  /** Distinct from an empty list. A failed read is not "nothing is waiting" (§13). */
  error: string | null;
  refresh: () => void;
}

/** Coerce a selected row; a row with no id or title is dropped rather than half-rendered. */
export function toPendingAction(raw: unknown): SoloPendingAction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.title !== "string" || !r.title.trim()) return null;
  const text = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v : null;
  // `draft_content` is jsonb-or-text depending on what filed it. Only a string is rendered as a
  // draft body; an object is real data but not prose, and stringifying it would put a JSON blob in
  // front of an operator as though Paige had written it.
  const draft = typeof r.draft_content === "string" && r.draft_content.trim() ? r.draft_content : null;
  return {
    id: r.id,
    title: r.title,
    summary: text(r.summary),
    draftContent: draft,
    rationale: text(r.decision_rationale),
    department: departmentLabel(
      typeof r.from_department === "string" && r.from_department ? r.from_department : null,
    ),
    createdAt: typeof r.created_at === "string" ? r.created_at : new Date().toISOString(),
  };
}

export function useSoloPendingActions(): SoloPendingActionsData {
  // The active account IS the scope of this read, so it is the epoch this hook keys on. It stays
  // out of the QUERY — the live policy on `paige_actions` derives the tenant from the session, and
  // passing one from the client would be a scope the caller chose rather than one they hold (§9).
  const { activeTenantId } = useTenantContext();

  const [items, setItems] = useState<SoloPendingAction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Which account the rows currently in state were read for.
  const [itemsAccount, setItemsAccount] = useState<string | null>(activeTenantId);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // ── THE PRIOR ACCOUNT'S WORK IS DROPPED DURING RENDER, NOT AFTER A ROUND TRIP. ──
  //
  // §9 — the Trust Compass survives an account switch that stays on the same route, and this hook
  // used to depend on the manual refresh counter alone. So after a switch the operator kept
  // reading the PREVIOUS tenant's filed titles, summaries, drafted artefacts and reasons-for-
  // stopping, indefinitely, inside the new account's chrome. RLS had scoped every one of those
  // rows correctly; what leaked is that nothing re-asked when the account changed.
  //
  // Clearing here rather than in an effect matters: an effect runs AFTER commit, so the modal would
  // paint one frame of the old account's drafts first. Adjusting state during render means the
  // stale rows are never shown at all — and it does not depend on the replacement read being fast,
  // or arriving. A slow or failing read is not a licence to keep another account's drafts on screen.
  //
  // Only an ACCOUNT change clears. A manual `refresh()` deliberately does not: it re-reads the same
  // account, and blanking a modal the operator is reading would be a regression, not a fix.
  if (itemsAccount !== activeTenantId) {
    setItemsAccount(activeTenantId);
    setItems([]);
    setError(null);
    setLoading(true);
  }

  useEffect(() => {
    // Effect-local, never a shared ref: this effect now re-runs on an account switch, and a
    // component-lifetime flag would be cleared by the old run's cleanup and set again by the new
    // run before the old read resolves — letting the previous account's answer through the guard.
    let cancelled = false;

    void (async () => {
      try {
        const { data, error: readError } = await supabase
          .from("paige_actions")
          .select("id,title,summary,draft_content,decision_rationale,from_department,created_at")
          .eq("status", "filed")
          .eq("autonomy_lane", "confirm")
          .order("created_at", { ascending: false })
          .limit(MAX_ITEMS);
        if (cancelled) return;
        if (readError) {
          setError(readError.message || "could not load what is waiting on you");
          setLoading(false);
          return;
        }
        setItems((data ?? []).map(toPendingAction).filter((a): a is SoloPendingAction => a !== null));
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "could not load what is waiting on you");
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // The active account is a dependency, not an afterthought: it is what makes a switch re-ask.
  }, [tick, activeTenantId]);

  return useMemo(() => ({ items, loading, error, refresh }), [items, loading, error, refresh]);
}
