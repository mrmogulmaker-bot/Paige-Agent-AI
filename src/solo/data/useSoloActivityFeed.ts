/**
 * useSoloActivityFeed — what Paige and the team ACTUALLY did, read from the Rail.
 *
 * WHY THIS EXISTS. Two Solo surfaces presented invented activity as live fact. The Trust
 * Compass rendered a panel headed "Working now — the last few minutes, as they happened",
 * carrying a green "Live" pill over eight lines that were typed into the file: named clients
 * who do not exist, a named recipient, timings down to "4s ago". The Team hub did the same
 * under "What the team did". Neither read anything. A placeholder is one thing; a placeholder
 * under a Live pill, naming customers, is an assertion — and the charter's boundary is exact:
 * do not invent activity, revenue, permissions, provider state, customer records, or
 * successful actions.
 *
 * §18 — ONE SEAM, NOT A NEW QUERY FAMILY. `paige_client_events` is the Rail: the row
 * `record_rail_event` writes, server-side and as the DEFINER owner, whenever something
 * actually happens. It is already the source for `useRailEvents`, and this composes the same
 * table rather than standing up a second idea of "what Paige did". If the two ever disagree,
 * one of them is lying, and the way to prevent that is for there to be only one.
 *
 * §9 TENANT ISOLATION. This passes NO tenant_id. `pce_staff_read` admits a row only for the
 * caller's own active tenant plus a staff role, so a sub-account sees ITS OWN activity and
 * never the parent's aggregate. Do not add a tenant parameter to "make it work" for an
 * operator — that is the §588 shape, and the fix belongs in the policy, not the caller.
 *
 * §13 — WHAT IS LIVE AND WHAT IS DERIVED, field by field, because the file this replaces
 * made no such distinction:
 *   • title, summary        → LIVE   the recorded event, verbatim
 *   • occurred_at           → LIVE   (rendered as an elapsed label, which is derivation, not
 *                                     invention — the instant is real)
 *   • actor_type            → LIVE   paige_agent vs owner_staff. This is exactly what the
 *                                     Team hub's "Paige / People" filter means, so the filter
 *                                     stops being decorative.
 *   • department            → LIVE   from the event's own from/to_department, matched against
 *                                     the seeded §16 slugs. Unmatched resolves to null and the
 *                                     surface says so; it is never guessed from the title.
 *   • tier / "waiting on you" → NOT DERIVABLE HERE and therefore not produced. A Rail row is a
 *                                     record that something HAPPENED; it carries no approval
 *                                     state. Synthesising amber/red from it would re-introduce
 *                                     the exact fiction this hook removes, in a subtler form.
 *                                     Approval state lives in `paige_actions`; a feed that
 *                                     wants it needs that seam named, not a guess.
 *
 * AN EMPTY FEED AND A FAILED READ ARE DIFFERENT ANSWERS. They render identically if you let
 * them, and the second one told an operator, with confidence, that Paige had done nothing.
 * `error` is therefore distinct from an empty `items`, and callers are expected to say which
 * they are looking at.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** How many recent events a feed carries. Both surfaces render a short list. */
const MAX_ITEMS = 25;

/** Live-refresh cadence, matching `usePaigeDeptStatus` so the two never drift apart. */
const POLL_INTERVAL_MS = 15_000;

/** One recorded event, in the shape the Solo surfaces consume. */
export interface SoloActivityItem {
  id: string;
  /** The event as recorded — never rewritten for presentation. */
  title: string;
  summary: string | null;
  /** True when Paige performed it; false when a person did. LIVE from actor_type. */
  byPaige: boolean;
  /** The §16 department slug the event names, or null when it names none. */
  departmentSlug: string | null;
  occurredAt: string;
}

export interface SoloActivityFeed {
  items: SoloActivityItem[];
  loading: boolean;
  /**
   * Why the feed is missing, when it is. `null` means it loaded — which may still mean
   * zero items, and that is a DIFFERENT statement (§13).
   */
  error: string | null;
  refresh: () => void;
}

/**
 * The §16 department slugs, seeded in `paige_departments` and verified live 2026-09-01.
 * Held here as a constant rather than joined per row: the Rail stores the slug as text, the
 * eleven names are a fixed platform fact rather than tenant data, and a join would add a
 * second query to render a label. `null` for an unknown slug is deliberate — a department we
 * cannot name is reported as unnamed, never bucketed into a plausible one.
 */
export const DEPARTMENT_NAMES: Readonly<Record<string, string>> = {
  owner_ops: "Owner Ops",
  client_experience: "Client Success",
  executive_office: "Executive Office",
  marketing: "Marketing",
  sales: "Sales",
  product_curriculum: "Product & Curriculum",
  technology_automation: "Technology & Automation",
  finance: "Finance",
  people_talent: "People & Talent",
  legal_compliance: "Legal & Compliance",
  operations_pmo: "Operations / PMO",
};

/** The department an event names, preferring where it was ROUTED TO over where it came from. */
export function departmentSlugOf(row: { to_department?: string | null; from_department?: string | null }): string | null {
  const to = typeof row.to_department === "string" ? row.to_department.trim() : "";
  if (to && to in DEPARTMENT_NAMES) return to;
  const from = typeof row.from_department === "string" ? row.from_department.trim() : "";
  if (from && from in DEPARTMENT_NAMES) return from;
  return null;
}

/**
 * A human label for a department slug, or a stated absence.
 *
 * "Unattributed" rather than a blank or a plausible default: a reader can act on "this event
 * does not say which desk did it" and cannot act on a department that was picked for them.
 */
export function departmentLabel(slug: string | null): string {
  return slug ? (DEPARTMENT_NAMES[slug] ?? "Unattributed") : "Unattributed";
}

/**
 * Elapsed time, in the compact form the surfaces already render ("4s", "22m", "3d").
 *
 * Derivation, not invention: the instant is a recorded column. Clamped at zero because a
 * clock skew of a few seconds should read "just now", not "in 3 seconds".
 */
export function elapsedLabel(occurredAt: string, now: number = Date.now()): string {
  const then = Date.parse(occurredAt);
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Coerce one selected row. A malformed row is dropped rather than rendered half-blank. */
export function toActivityItem(raw: unknown): SoloActivityItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.title !== "string") return null;
  return {
    id: r.id,
    title: r.title,
    summary: typeof r.summary === "string" && r.summary.trim() ? r.summary : null,
    // Anything that is not explicitly Paige is reported as a person. The safe direction:
    // over-crediting Paige for a person's work is the misattribution that matters here.
    byPaige: r.actor_type === "paige_agent",
    departmentSlug: departmentSlugOf(r as { to_department?: string | null; from_department?: string | null }),
    occurredAt: typeof r.occurred_at === "string" ? r.occurred_at : new Date().toISOString(),
  };
}

export function useSoloActivityFeed(): SoloActivityFeed {
  const [items, setItems] = useState<SoloActivityItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const mounted = useRef(false);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    const read = async () => {
      try {
        // ── READ THROUGH THE RESOLVER, NOT THE RELATION (#746). ──
        //
        // This was `supabase.from("paige_client_events")` with NO filter of any kind — it leaned
        // entirely on the `pce_staff_read` policy to scope a cross-tenant activity table. It also
        // could not execute: `authenticated` has held no SELECT on that relation since
        // `20260712200000:25` revoked it, so the privilege check refused before RLS was ever
        // consulted (verified on production 2026-09-02). This surface was the one consumer that
        // reported the refusal honestly, which is why the platform looked merely quiet rather
        // than broken.
        //
        // `get_solo_rail_activity` resolves the workspace server-side from the caller's session
        // and takes no tenant argument, so the unfiltered read is now a scoped one by
        // construction rather than by policy. It returns only reviewed display fields.
        const { data, error: readError } = await supabase
          .rpc("get_solo_rail_activity", { p_limit: MAX_ITEMS });
        if (cancelled || !mounted.current) return;
        if (readError) {
          // Never turn a failed read into "nothing happened" (§13).
          setError(readError.message || "could not load recent activity");
          setLoading(false);
          return;
        }
        setItems((data ?? []).map(toActivityItem).filter((i): i is SoloActivityItem => i !== null));
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled || !mounted.current) return;
        setError(err instanceof Error ? err.message : "could not load recent activity");
        setLoading(false);
      }
    };

    void read();
    // Poll rather than subscribe: `paige_client_events` broadcasts to the private rail topics
    // (see useRailEvents) but is not in the `supabase_realtime` publication, so postgres_changes
    // would deliver nothing. Skip while the tab is hidden; the focus handler catches up.
    const id = setInterval(() => { if (!document.hidden) void read(); }, POLL_INTERVAL_MS);
    const onFocus = () => { void read(); };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      mounted.current = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [tick]);

  return useMemo(() => ({ items, loading, error, refresh }), [items, loading, error, refresh]);
}
