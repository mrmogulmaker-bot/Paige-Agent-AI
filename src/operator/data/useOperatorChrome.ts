import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The live signal the operator console's CHROME reads — the rail badges, the rail footer, the
 * header greeting and its status pill. REAL rows only.
 *
 * THE RULE THIS FILE IS BUILT AROUND (§13/§57). Claude Design's pack draws a badge on every
 * branch and a count in every group header because a design pack can invent its numbers. This
 * console cannot: it is the operator's source of truth about his OWN platform, and the anchor
 * case for getting it wrong is a Fleet surface that once printed $397 MRR on tenants with no
 * subscription at all. So a count we cannot substantiate is ABSENT — the key is simply not in
 * `badges`, and the chrome draws no badge. Never a `0` standing in for "we didn't read it",
 * never a plausible number. Every figure below traces to a row this hook actually read.
 *
 * WHAT IS REAL HERE, AND WHAT IS DELIBERATELY MISSING:
 *   • `fleet` badge + `statusSummary` — REAL. `systems_check_snapshot('operator')` (the shipped
 *     RPC the Systems Check tile already reads, §18 one seam) returns the latest OPERATOR-scope
 *     scan run and its findings. Red/amber is the SAME mapping `SystemsCheckTile` uses, so the
 *     rail and the tile can never disagree: an open `fail` at `blocking` severity is red; every
 *     other open fail is amber, and so is an `error` — a check that FAILED TO RUN is a real
 *     problem, not a benign neutral. A `skip` is "not yet assessable" and counts as neither.
 *   • `tenantCount` / `subAccountCount` — REAL, from `tenants`. A sub-account is a row with a
 *     non-null `parent_tenant_id` (§51). Nothing else is excluded; this is the whole fleet, so
 *     the footer matches what the Fleet Console lists rather than a differently-filtered total.
 *   • `support` badge — REAL, from `support_tickets` (the platform support inbox: it has no
 *     tenant column, the operator IS the desk). Open = anything not `resolved`/`closed`, the
 *     same predicate `SupportAdmin` uses.
 *   • `roleLabel` — REAL, from `user_roles` for THIS session's own uid ("Users can view own
 *     roles" is a self-read policy, so it works for every operator tier).
 *   • `provisioning` badge — ABSENT ON PURPOSE. `tenant_provisioning` still exists, but its only
 *     writers (the new-tenant trigger, the queue drain, `run_starter_provisioning`) were all
 *     dropped by `20260915000000_remove_starter_auto_provisioner.sql` when the owner ruled that
 *     nothing auto-provisions. Whatever rows remain are a dead historical ledger, so counting
 *     them as "pending" would put a number on the rail that nothing is working on — exactly the
 *     phantom this file exists to prevent. There is no other provisioning-request queue in the
 *     schema. When one ships, it gets a badge here.
 *   • `incident` — ALWAYS null today. There is no incident table anywhere in the schema (the
 *     generated types and the migrations both have nothing). The field is part of the contract
 *     so the banner can light up the day a real incident record exists; until then the console
 *     says nothing rather than dressing a support ticket up as an outage.
 *
 * §9/§53 — "NO ROWS" IS UNKNOWN, NOT ZERO. `support_tickets` staff-read is gated on
 * `is_platform_owner()`, which §53 freezes to `super_admin`: a scoped `platform_admin` reads
 * ZERO rows from it and cannot tell that apart from an empty inbox. `tenants` can be narrowed
 * the same way. So every count here is emitted only when it is POSITIVE — an unreadable seam and
 * a genuinely-empty one both render as no badge, which is the honest outcome for both, instead of
 * a confident "0" that would be a lie in one of the two cases. (The Systems Check RPC gates on
 * `is_platform_operator()`, so a platform_admin genuinely does see the operator lens there.)
 * `subAccountCount` is the one legitimate zero: it is a subset of tenant rows we actually read,
 * so it only reports 0 when the fleet itself was readable.
 */
export type OperatorChromeBadgeTone = "warn" | "risk" | "info";

export type OperatorChrome = {
  /** Operator's first name from RUNTIME auth metadata. null = unknown, undefined = resolving. */
  firstName: string | null | undefined;
  /** Per-branch rail badge, keyed by branch SLUG. Only include a key you can substantiate. */
  badges: Record<string, { count: number; tone: OperatorChromeBadgeTone }>;
  /** Fleet totals for the rail footer. null when unread. */
  tenantCount: number | null;
  subAccountCount: number | null;
  /** The operator's role word for the footer, e.g. "super_admin". null when unknown. */
  roleLabel: string | null;
  /** Short status summary for the header pill, e.g. "3 red · 6 amber". null when nothing to say. */
  statusSummary: string | null;
  /** The open incident for the banner, when one genuinely exists. */
  incident: { ref: string; summary: string; href?: string } | null;
  loading: boolean;
};

/** The finding fields this hook reads — the same shape `useSystemsCheck` maps (§18 one seam). */
type ScanFinding = {
  status: "pass" | "fail" | "skip" | "error";
  severity_at_finding: "blocking" | "high" | "medium" | "low" | null;
  resolved_at: string | null;
};

const EMPTY_BADGES: OperatorChrome["badges"] = {};

/**
 * @param enabled Hold every read until the console is actually behind the operator gate. Defaults
 * to true because the only mount is inside that gate; the flag exists so a caller that resolves
 * the gate asynchronously can wait rather than firing reads that would be denied.
 */
export function useOperatorChrome(enabled: boolean = true): OperatorChrome {
  const [firstName, setFirstName] = useState<string | null | undefined>(undefined);
  const [badges, setBadges] = useState<OperatorChrome["badges"]>(EMPTY_BADGES);
  const [tenantCount, setTenantCount] = useState<number | null>(null);
  const [subAccountCount, setSubAccountCount] = useState<number | null>(null);
  const [roleLabel, setRoleLabel] = useState<string | null>(null);
  const [statusSummary, setStatusSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        // Identity first, and published the moment it lands: the greeting is the first thing the
        // operator reads, and it comes from RUNTIME auth metadata — never the repo, never a
        // literal (§45). `undefined` → still resolving; `null` → no name on record, and the
        // header falls back to its name-less opener rather than guessing one.
        const { data: auth } = await supabase.auth.getUser();
        if (!alive) return;
        const uid = auth?.user?.id ?? null;
        const full = String(auth?.user?.user_metadata?.full_name ?? "").trim();
        setFirstName(full.split(/\s+/)[0]?.trim() || null);

        const [tenantsRes, snapRes, ticketsRes, rolesRes] = await Promise.all([
          supabase.from("tenants").select("id, parent_tenant_id"),
          // The operator lens of the shipped Systems Check seam. Scope is the ONLY argument —
          // the RPC derives the caller in-body and gates operator scope on is_platform_operator()
          // (§59), so this passes no tenant id and can widen nothing. Not in the generated types
          // yet, hence the cast, matching `useSystemsCheck`'s convention.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).rpc("systems_check_snapshot", { p_scope: "operator" }),
          // Open = not resolved and not closed — the same predicate the shipped support admin
          // uses, expressed as a NOT IN so a status we haven't seen yet still counts as open
          // rather than silently vanishing from the operator's queue.
          supabase.from("support_tickets").select("priority").not("status", "in", "(resolved,closed)"),
          uid ? supabase.from("user_roles").select("role").eq("user_id", uid) : Promise.resolve(null),
        ]);

        if (!alive) return;

        // ── Fleet totals ──────────────────────────────────────────────────────────────────
        // A failed read and an empty read are both "we don't know" for the total, so both leave
        // the footer blank. Once we DO hold rows, the sub-account split is a real subset of them
        // and may honestly be 0.
        const tenantRows = tenantsRes.error ? null : (tenantsRes.data ?? null);
        const haveFleet = !!tenantRows && tenantRows.length > 0;
        setTenantCount(haveFleet ? tenantRows.length : null);
        setSubAccountCount(
          haveFleet ? tenantRows.filter((t) => t.parent_tenant_id !== null).length : null,
        );

        // ── Role word ─────────────────────────────────────────────────────────────────────
        // Operator tiers only (§53). A session holding neither is not an operator, and printing
        // its tenant-level role in the platform footer would misdescribe who is standing there.
        const roleRows = (rolesRes?.error ? null : rolesRes?.data) ?? null;
        const roles = new Set((roleRows ?? []).map((r) => String(r.role)));
        setRoleLabel(
          roles.has("super_admin") ? "super_admin" : roles.has("platform_admin") ? "platform_admin" : null,
        );

        // ── Systems Check → the fleet badge + the header pill ─────────────────────────────
        const snap = (snapRes?.error ? null : snapRes?.data) as
          | { run?: { id: string } | null; findings?: ScanFinding[] | null }
          | null;
        const findings = (snap?.findings ?? []) as ScanFinding[];
        const openFails = findings.filter((f) => f.status === "fail" && !f.resolved_at);
        const red = openFails.filter((f) => (f.severity_at_finding ?? "low") === "blocking").length;
        // An errored check failed to RUN. It is not a pass and not a deferral, so it rides with
        // the amber column rather than disappearing (§13 — same call the tile makes).
        const amber = openFails.length - red + findings.filter((f) => f.status === "error").length;

        const next: OperatorChrome["badges"] = {};
        if (red > 0) next.fleet = { count: red + amber, tone: "risk" };
        else if (amber > 0) next.fleet = { count: amber, tone: "warn" };

        const parts: string[] = [];
        if (red > 0) parts.push(`${red} red`);
        if (amber > 0) parts.push(`${amber} amber`);
        if (parts.length > 0) {
          setStatusSummary(parts.join(" · "));
        } else {
          // Nothing is failing. Only say "passing" when the scan literally verified something:
          // a run exists and every assessable check passed. A scan of nothing but skips has
          // verified nothing, so the pill stays silent rather than claiming a clean bill.
          const passCount = findings.filter((f) => f.status === "pass").length;
          const assessable = findings.length - findings.filter((f) => f.status === "skip").length;
          setStatusSummary(
            snap?.run && passCount > 0 && passCount === assessable
              ? `all ${passCount} checks passing`
              : null,
          );
        }

        // ── Platform support inbox ────────────────────────────────────────────────────────
        const ticketRows = ticketsRes.error ? null : (ticketsRes.data ?? null);
        if (ticketRows && ticketRows.length > 0) {
          next.support = {
            count: ticketRows.length,
            tone: ticketRows.some((t) => t.priority === "urgent") ? "warn" : "info",
          };
        }

        setBadges(next);
      } catch {
        // A thrown read tells us nothing, so the chrome shows nothing — the badges/counts keep
        // their absent state rather than collapsing to zeros the operator would read as facts.
        if (alive) {
          setBadges(EMPTY_BADGES);
          setStatusSummary(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [enabled]);

  return {
    firstName,
    badges,
    tenantCount,
    subAccountCount,
    roleLabel,
    statusSummary,
    // No incident substrate exists yet (see the header note), so this is a documented constant
    // rather than a guess dressed as a read.
    incident: null,
    loading,
  };
}
