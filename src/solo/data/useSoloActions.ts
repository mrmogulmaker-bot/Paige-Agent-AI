/**
 * useSoloActions — the Solo Paige › Actions (Action Bus §8) adapter.
 *
 * A THIN, design-agnostic read (the §18 precedent set by useCommandCenter /
 * useSoloOwner): it reads the REAL `paige_actions` coordination table and reshapes
 * each row into the EXACT `PT.actions[]` fixture shape the solo `Actions` surface
 * already renders, so the rewire is a DROP-IN — replace `PT.actions` with
 * `useSoloActions().actions` and the design is untouched (§28).
 *
 * §9 / §51 TENANT ISOLATION: this adapter passes NO tenant_id anywhere. The read is
 * gated by the base-table RLS (`pa_tenant_staff_read` → `current_user_tenant_id()`),
 * so a sub-account sees only its OWN bus, never the agency parent's — the scope is
 * derived from the SESSION, never a client-supplied id. Do not re-widen.
 *
 * §13 / §31 HONESTY: every field is present-guarded.
 *   • `pri` maps the REAL `paige_actions.priority` column (text: low/normal/high/
 *     urgent). NOTE — the build scout brief claimed "NO priority column"; the LIVE
 *     schema (verified) DOES have it, so per §0 the live-code check wins and this
 *     adapter delivers the real value rather than the instructed Preview null.
 *     A missing priority renders null (honest em-dash upstream), never invented.
 *   • route/kind are humanized from the real from/to department slugs + action_kind.
 *   • Honest-empty when the tenant has no open work.
 */
import { useCallback, useEffect, useMemo, useState, useId } from "react";
import { supabase } from "@/integrations/supabase/client";

/** One bus row reshaped into the solo `PT.actions[]` fixture shape (exact keys). */
export interface SoloAction {
  /** Work title. */
  t: string;
  /** "Owner Ops → Client Experience" (real from/to department slugs, humanized). */
  route: string;
  /** Humanized action_kind (e.g. "Client Followup"). */
  kind: string;
  /** Display status matching the surface's chips/tone: "Filed" / "Pending approval" / "Blocked" … */
  st: string;
  /** Real priority ("High"/"Urgent"/"Normal"/"Low") or null when unset (honest — never invented). */
  pri: string | null;
  /** Relative filed time, e.g. "3h ago" / "2d ago". */
  w: string;
}

export interface SoloActionsData {
  /** Open/active bus rows, newest filed first — drop-in for `PT.actions`. */
  actions: SoloAction[];
  /** The KPI counts the Actions surface derives. `completedToday` is a real count (done + resolved today). */
  kpis: { open: number; needsAttention: number; completedToday: number };
  loading: boolean;
  /** True only when there is genuinely nothing open to show. */
  empty: boolean;
  refresh: () => void;
}

/** The non-terminal statuses the surface shows (excludes done/dismissed/failed/expired). */
const OPEN_STATUSES = [
  "filed",
  "assigned",
  "drafting",
  "drafted",
  "pending_approval",
  "approved",
  "executing",
  "blocked",
] as const;

/** The columns the adapter actually reads (thin, no `select("*")`). */
const COLS =
  "id, action_kind, title, summary, status, priority, autonomy_lane, from_department, to_department, created_by_agent, assigned_subagent_slug, filed_at";

interface Row {
  id: string;
  action_kind: string | null;
  title: string | null;
  summary: string | null;
  status: string | null;
  priority: string | null;
  from_department: string | null;
  to_department: string | null;
  filed_at: string | null;
}

/** "pending_approval" → "Pending approval" (matches the surface's tone()/chip strings exactly). */
function humanizeStatus(s: string | null): string {
  if (!s) return "Filed";
  const t = s.replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Filed";
}

/** "owner_ops" → "Owner Ops"; "client_experience" → "Client Experience". Null → em-dash. */
function humanizeDept(slug: string | null): string {
  if (!slug) return "—";
  return slug.replace(/[_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

/** "owner.followup_email" → "Owner Followup Email". Null → "Action". */
function humanizeKind(k: string | null): string {
  if (!k) return "Action";
  const t = k.replace(/[_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  return t || "Action";
}

/** "high" → "High"; null stays null (never invented). */
function humanizePriority(p: string | null): string | null {
  if (!p) return null;
  const t = p.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

/** filed_at → compact "just now" / "5m ago" / "3h ago" / "2d ago". */
function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function useSoloActions(): SoloActionsData {
  const [rows, setRows] = useState<Row[]>([]);
  const [completedToday, setCompletedToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const instanceId = useId();

  const load = useCallback(async () => {
    // Open/active bus rows (§9: no tenant_id filter — RLS current_user_tenant_id() isolates).
    const rowsP = supabase
      .from("paige_actions")
      .select(COLS)
      .in("status", OPEN_STATUSES as unknown as string[])
      .order("filed_at", { ascending: false })
      .limit(300);

    // Real "Completed today" KPI — done + resolved since local midnight (honest count, not the fixture's hardcoded 6).
    const doneP = supabase
      .from("paige_actions")
      .select("id", { count: "exact", head: true })
      .eq("status", "done")
      .gte("resolved_at", startOfTodayISO());

    const [{ data }, { count }] = await Promise.all([rowsP, doneP]);
    setRows((data as Row[] | null) ?? []);
    setCompletedToday(count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    // Live Action Bus: refetch on any change to the tenant's rows (unique channel per §usePendingApprovals dedup note).
    const channel = supabase
      .channel(`solo_actions_${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "paige_actions" },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, instanceId]);

  const actions = useMemo<SoloAction[]>(
    () =>
      rows.map((r) => ({
        t: r.title || humanizeKind(r.action_kind),
        route: `${humanizeDept(r.from_department)} → ${humanizeDept(r.to_department)}`,
        kind: humanizeKind(r.action_kind),
        st: humanizeStatus(r.status),
        pri: humanizePriority(r.priority),
        w: relativeTime(r.filed_at),
      })),
    [rows],
  );

  const kpis = useMemo(() => {
    const open = actions.length; // all fetched rows are non-terminal (open/active)
    const needsAttention = rows.filter(
      (r) => r.status === "blocked" || r.status === "pending_approval",
    ).length;
    return { open, needsAttention, completedToday };
  }, [actions.length, rows, completedToday]);

  const empty = !loading && actions.length === 0;

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { actions, kpis, loading, empty, refresh };
}
