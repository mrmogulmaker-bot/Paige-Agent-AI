// =============================================================================
// Alerting — signal readers (A2)
// =============================================================================
// One reader per signal key registered in `paige_alert_signal`. The catalogue is the
// SOURCE OF TRUTH for which signals exist (config-as-data, §10); this file is only the
// set of readers that can currently satisfy them.
//
// THE RULE THAT MATTERS HERE (§13): a reader that cannot produce a real number returns
// `undefined`, never 0. Zero and "could not read" are different facts, and a monitoring
// system that collapses the second into the first reports green while blind — which is
// the exact failure mode alerting exists to prevent, arriving through the alerting system
// itself.
//
// A signal registered with `is_readable = false` has NO reader by design and must never
// be given one here without also flipping the row. `migrations.drift` is the standing
// example: an edge function cannot read git.
// =============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { SignalValues } from "./alert-conditions.ts";

/** Matches `INTERNAL_REVENUE_CLASS` in src/operator/data/useFleet.ts. */
const INTERNAL_REVENUE_CLASS = "internal_test";

/**
 * How many rows a paged read will pull before it refuses to guess.
 *
 * PostgREST caps a select at its own `max-rows` regardless of what we ask for, and the cap arrives
 * SILENTLY — the array is just shorter. Any reader that derives a count from `rows.length` is
 * therefore wrong-by-default once the platform outgrows the cap, with no error to notice.
 * `assertNotTruncated` closes that by comparing what came back against the exact count.
 */
const PAGE_CAP = 10_000;

/** Throw (→ recorded unreadable) rather than return a count derived from a truncated page. */
function assertNotTruncated(table: string, got: number, total: number | null): void {
  if (total === null) throw new Error(`${table} returned a null exact count — cannot verify the read is complete`);
  if (got < total) {
    throw new Error(
      `${table} read truncated at ${got} of ${total} rows — a count over a truncated fleet would ` +
        `under-report, so this signal is unreadable this tick rather than wrong`,
    );
  }
}

export interface SignalReadResult {
  values: SignalValues;
  /** Keys that were asked for but could not be read, with why. Recorded, never swallowed. */
  unreadable: Record<string, string>;
}

type Reader = (admin: SupabaseClient) => Promise<number | boolean>;

/**
 * `fleet.tenants_at_risk` — the server-side twin of the Fleet Console's AT RISK figure.
 *
 * DELIBERATELY MIRRORS `health()` in src/operator/surfaces/FleetConsole.tsx, which grades
 * a tenant at risk when its status is set and not 'active', OR it has zero active seats.
 * (`customers === 0` is 'watch', NOT 'risk' — including it here would make this signal
 * disagree with the number on screen.)
 *
 * The duplication is real and worth naming: the UI derivation is TypeScript in `src/`, this
 * is Deno in an edge function, and they cannot import each other. The §39 peer gate caught
 * exactly this class of bug on the Tenants rail — a count and its label describing different
 * populations — so the mirroring is stated here rather than assumed, and the smoke test pins
 * the derivation. If `health()` changes, this must change with it.
 *
 * Internal/test tenants are excluded, matching the console's own "customer tenants" framing.
 */
const readTenantsAtRisk: Reader = async (admin) => {
  const [tenantRes, memberRes, { data: revenue }] = await Promise.all([
    admin.from("tenants").select("id, status", { count: "exact" }).range(0, PAGE_CAP - 1),
    admin
      .from("tenant_members")
      .select("tenant_id", { count: "exact" })
      .eq("status", "active")
      .range(0, PAGE_CAP - 1),
    // deno-lint-ignore no-explicit-any
    (admin as any).from("tenant_revenue_classification").select("tenant_id, revenue_class"),
  ]);
  const { data: tenants, error: tErr, count: tenantCount } = tenantRes;
  const { data: members, error: mErr, count: memberCount } = memberRes;
  if (tErr) throw new Error(`tenants read failed: ${tErr.message}`);
  if (mErr) throw new Error(`tenant_members read failed: ${mErr.message}`);
  if (!tenants) throw new Error("tenants read returned no rows object");

  // A count derived from a SILENTLY TRUNCATED page is a wrong number wearing a right number's
  // clothes — it can only ever UNDER-report risk, which is the direction that matters. Task #199
  // is this exact defect on the Fleet Console's own tenant count (`rows.length` over an uncapped
  // select); reproducing it in the signal that alerts on that number would be worse, because
  // nothing downstream would ever question it. Report unreadable instead (§13).
  assertNotTruncated("tenants", tenants.length, tenantCount);
  assertNotTruncated("tenant_members", (members ?? []).length, memberCount);

  const seats = new Map<string, number>();
  for (const m of (members ?? []) as Array<{ tenant_id: string }>) {
    seats.set(m.tenant_id, (seats.get(m.tenant_id) ?? 0) + 1);
  }
  const klass = new Map<string, string>();
  for (const r of (revenue ?? []) as Array<{ tenant_id: string; revenue_class: string }>) {
    klass.set(r.tenant_id, r.revenue_class);
  }

  let atRisk = 0;
  for (const t of tenants as Array<{ id: string; status: string | null }>) {
    if (klass.get(t.id) === INTERNAL_REVENUE_CLASS) continue; // customer tenants only
    const statusBad = !!t.status && t.status !== "active";
    const noSeats = (seats.get(t.id) ?? 0) === 0;
    if (statusBad || noSeats) atRisk += 1;
  }
  return atRisk;
};

/** Operator-scope findings that are failing and unresolved. Skips are NOT failures (§13). */
const readFailingChecks: Reader = async (admin) => {
  const { count, error } = await admin
    .from("paige_systems_check_finding")
    .select("id", { count: "exact", head: true })
    .is("tenant_id", null)
    .eq("status", "fail")
    .is("resolved_at", null);
  if (error) throw new Error(`systems-check findings read failed: ${error.message}`);
  if (count === null) throw new Error("systems-check findings returned a null count");
  return count;
};

const readBlockingPresent: Reader = async (admin) => {
  const { count, error } = await admin
    .from("paige_systems_check_finding")
    .select("id", { count: "exact", head: true })
    .is("tenant_id", null)
    .eq("status", "fail")
    .eq("severity_at_finding", "blocking")
    .is("resolved_at", null);
  if (error) throw new Error(`blocking findings read failed: ${error.message}`);
  if (count === null) throw new Error("blocking findings returned a null count");
  return count > 0;
};

/**
 * `llm.error_rate` — share of traced model calls in the last hour that ended in an error.
 *
 * §13 CORRECTION, recorded rather than quietly worked around. A1 seeded the catalogue with
 * `llm.failover_rate` and the architecture note claimed it was already backed by L1
 * observability. It is NOT: `paige_llm_trace` has no failover marker — the columns are
 * `status`, `error_class`, `provider`, `model`, `tier`, and nothing records "this call fell
 * through to a fallback provider". Verified against the live schema, not assumed.
 *
 * Substituting an error rate under the name `failover_rate` would have been precisely the
 * two-numbers-one-label defect the §39 peer gate caught on the Tenants rail, so instead the
 * A2 migration flips `llm.failover_rate` to is_readable=false with that reason, and registers
 * `llm.error_rate` — which the schema genuinely supports — as its own signal.
 *
 * Returns a RATE in 0..1. With no calls in the window the rate is genuinely undefined —
 * zero calls is not a zero error rate — so this throws rather than reporting a reassuring 0,
 * and the caller records it as unreadable for this tick.
 */
const readLlmErrorRate: Reader = async (admin) => {
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const [{ count: total, error: tErr }, { count: failed, error: fErr }] = await Promise.all([
    admin.from("paige_llm_trace").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin
      .from("paige_llm_trace")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .eq("status", "error"),
  ]);
  if (tErr) throw new Error(`llm trace read failed: ${tErr.message}`);
  if (fErr) throw new Error(`llm error-count read failed: ${fErr.message}`);
  if (total === null || failed === null) throw new Error("llm trace returned a null count");
  if (total === 0) throw new Error("no model calls in the last hour — an error RATE is undefined, not 0");
  return failed / total;
};

/** key → reader. A key absent here has no reader and is reported unreadable. */
const READERS: Record<string, Reader> = {
  "systems_check.failing_count": readFailingChecks,
  "systems_check.blocking_present": readBlockingPresent,
  "fleet.tenants_at_risk": readTenantsAtRisk,
  "llm.error_rate": readLlmErrorRate,
};

export function hasReader(key: string): boolean {
  return key in READERS;
}

/**
 * Read exactly the signals asked for.
 *
 * Each reader is isolated: one failing signal is recorded as unreadable and the rest still
 * resolve. A single broken read must not blind the whole sweep (§32 — degrade visibly, and
 * never wholesale).
 */
export async function readSignals(
  admin: SupabaseClient,
  keys: readonly string[],
  registry: ReadonlyMap<string, { isReadable: boolean }>,
): Promise<SignalReadResult> {
  const values: SignalValues = {};
  const unreadable: Record<string, string> = {};

  await Promise.all(
    [...new Set(keys)].map(async (key) => {
      const entry = registry.get(key);
      if (!entry) {
        unreadable[key] = "not registered in paige_alert_signal";
        return;
      }
      if (!entry.isReadable) {
        // The catalogue's own honesty flag. `migrations.drift` lives here.
        unreadable[key] = "registered as not readable (no reader exists yet)";
        return;
      }
      const reader = READERS[key];
      if (!reader) {
        // Registry says readable but no reader is wired — a real inconsistency, surfaced
        // rather than silently treated as a zero.
        unreadable[key] = "marked readable in the catalogue but no reader is implemented";
        return;
      }
      try {
        values[key] = await reader(admin);
      } catch (e) {
        unreadable[key] = e instanceof Error ? e.message : String(e);
      }
    }),
  );

  return { values, unreadable };
}
