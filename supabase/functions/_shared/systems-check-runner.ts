// _shared/systems-check-runner.ts — Systems Check L2 CORE (Owner Trilogy Pillar #1, task #80).
//
// This is the SHARED RUNNER CORE the three flavor edge functions (systems-check-run-onboarding /
// -scheduled / -change) all import (§18 one home — the flavors differ only in which catalog subset
// they run and whether they file every fail or only NEW/degraded fails). It:
//   1. reads the applicable rows of the operator-authored catalog (paige_systems_check_registry),
//   2. dispatches each check to its runner module (keyed by runner_key — modules land next phase),
//   3. writes ONE paige_systems_check_run row + one paige_systems_check_finding per check (service-role),
//   4. on each 'fail' forges the drafted fix (prompt-forge) and files a 'systems.remediate' action onto
//      the action bus (file_action), routed to the finding's owning department, and links the finding's
//      resolution_action_id back to the filed action.
//
// SEAMS REUSED (§18 — never forked):
//   • forge()        (./prompt-forge.ts)        — the §26 remediation drafter.
//   • file_action()  (RPC, action-bus SPINE #1) — the ONLY writer of paige_actions (direct INSERT is
//     RLS-blocked). A service-role caller passes p_tenant_id EXPLICITLY; autonomy_lane + from/to
//     department + priority resolve FROM the action_kind row (systems.remediate) — the caller never
//     passes autonomy_lane. We override p_to_department per finding so the work routes to the owning desk.
//
// HONESTY / FAIL-LOUD (§13/§32): every check that THROWS is recorded status='error' with the error class
//   in evidence — NEVER a silent pass. A missing runner is likewise an 'error' finding (fail-loud), not a
//   skip. forge/file_action failures are caught, logged, and never abort the scan — the finding is still
//   written. No fabricated pass, no fabricated action_id.
//
// §9/§51 TENANT ISOLATION: the caller resolves tenantId from the JWT (or the cron/service context),
//   NEVER from the request body (§588). Every finding/run insert sets tenant_id EXPLICITLY. file_action
//   receives that same tenantId. The service-role client bypasses RLS, so tenant scope is enforced in the
//   queries themselves (every read below is `.eq("tenant_id", tenantId)` where a tenant table is touched).
//
// §37 PRODUCER INVENTORY: this core is the SOLE writer of paige_systems_check_run / _finding. No other
//   producer inserts those tables (confirmed by grep of the repo — only later-layer edge fns call THIS
//   core). The registry is operator-authored (is_platform_owner) and read-only here.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { forge } from "./prompt-forge.ts";
import type { Tier } from "./model-router-gates.ts";

// The remediation draft is plain text, cost-low (§14): a fix draft is neither a customer send nor an
// approval decision, so it routes to the open tier. §17 permits text @ open-flexible (no send/approval).
const REMEDIATION_TIER: Tier = "open-flexible";

// The platform-default action-kind the migration seeds; the fix routes onto the bus as this kind.
const REMEDIATE_ACTION_KIND = "systems.remediate";
const RUNNER_AGENT = "paige-systems-check";

// ── Types ──────────────────────────────────────────────────────────────────────────────────────

export type CheckStatus = "pass" | "fail" | "skip" | "error";
export type ScanFlavor = "onboarding" | "scheduled" | "change_triggered";

/** One row of the operator-authored catalog (paige_systems_check_registry), as the core reads it. */
export interface RegistryRow {
  check_id: string;
  check_name: string;
  domain: string;
  severity: "blocking" | "high" | "medium" | "low";
  department: string | null;      // paige_departments.slug — the finding's owning desk (§16 routing)
  data_source: string;
  runner_key: string;             // dispatch key
  nl_prompt: string | null;
  remediation_prompt: string;     // Paige's fix-draft brief (contains a {{tenant.business_name}} token)
  priority: number;
}

/** What a single runner module observed. The runner NEVER writes DB rows itself (§37) — it returns this
 *  and the core persists it. On a genuine failure to determine an answer, a runner returns status:'error'
 *  (fail-loud, §32), never a silent 'pass'. status:'skip' is the honest "not determinable / needs_config"
 *  outcome (e.g. an owner-gated dependency not yet available) — also never a fabricated pass (§13). */
export interface CheckResult {
  status: CheckStatus;
  /** Real, observed evidence (§13) — what the runner actually read. On 'error', carries the error class. */
  evidence: Record<string, unknown>;
  /** Paige's plain-language read of the finding, when the runner has one (§34 intelligence). */
  interpretation?: string;
  /** Optional metric for the §26 rolling baseline (populated by later baseline-writing work). */
  metric?: { name: string; value: number };
}

/** Everything a runner module needs to do its tenant-scoped read. The core builds this once per scan and
 *  hands it to every runner. Runners read via `ctx.admin` filtered by `ctx.tenantId` (§9/§51). */
export interface CheckRunContext {
  /** Service-role client (bypasses RLS) — runners MUST self-scope every tenant read to ctx.tenantId. */
  admin: SupabaseClient;
  /** Server-resolved tenant (never body-trusted, §588). */
  tenantId: string;
  /** Resolved tenant display name (tenants.name), used to fill the remediation brief's business-name token. */
  tenantName: string;
  /** Which scan flavor is running (some runners may vary depth by flavor). */
  scanFlavor: ScanFlavor;
}

/** A per-check runner module: reuse the seam, tenant-scoped, fail-loud. One module per runner_key lands in
 *  ./systems-check-runners/<runner_key>.ts next phase and registers via registerRunner(). */
export type CheckRunner = (ctx: CheckRunContext, row: RegistryRow) => Promise<CheckResult>;

// ── Dispatch registry (§18 one home) ─────────────────────────────────────────────────────────────
// The 10 runner modules register here next phase (a barrel ./systems-check-runners/index.ts imports them
// and calls registerRunner). Keeping the map mutable + registration-based means THIS core compiles and
// runs with zero imports of not-yet-written modules (§32: a green build that actually runs). A runner_key
// with no registered runner is reported as an 'error' finding at scan time — fail-loud, never a silent skip.
export const SYSTEMS_CHECK_DISPATCH: Record<string, CheckRunner> = {};

/** Register (or override) the runner for a runner_key. Idempotent-by-last-write. */
export function registerRunner(runnerKey: string, runner: CheckRunner): void {
  SYSTEMS_CHECK_DISPATCH[runnerKey] = runner;
}

// ── Options ──────────────────────────────────────────────────────────────────────────────────────

export interface RunSystemsCheckOptions {
  /** Service-role client (the flavor edge fn builds it — §9 dual-client: JWT for authz/tenant-resolve,
   *  THIS for the writes). */
  admin: SupabaseClient;
  /** Server-resolved tenant (§9/§588). */
  tenantId: string;
  scanFlavor: ScanFlavor;
  /** Audit context stored on the run row (source, user_id, change_ref, …). */
  triggeredBy?: Record<string, unknown>;
  /** Restrict the catalog to these runner_keys (the 'change' flavor's applicable subset). Omit = the full
   *  enabled catalog (onboarding / scheduled). */
  runnerKeys?: string[];
  /** 'all' (default) files a remediation action for every fail. 'delta' files only for a fail that is NEW
   *  or newly-degraded vs the tenant's previous run (the 'scheduled' flavor's noise-control). */
  actionFiling?: "all" | "delta";
  /** Test seam: override the dispatch map (defaults to the shared SYSTEMS_CHECK_DISPATCH registry). */
  dispatch?: Record<string, CheckRunner>;
}

export interface RunSystemsCheckSummary {
  run_id: string;
  check_count: number;
  pass_count: number;
  fail_count: number;
  skip_count: number;
  error_count: number;
  actions_filed: number;
  findings: Array<{
    check_id: string;
    status: CheckStatus;
    finding_id: string;
    resolution_action_id: string | null;
  }>;
}

// ── Token resolution ───────────────────────────────────────────────────────────────────────────
// The registry remediation_prompt carries a `{{tenant.business_name}}` token. prompt-forge's own
// substitution ONLY matches `{{[a-z_]+}}` (no dot) — so `{{tenant.business_name}}` would pass through
// UNRESOLVED into the final prompt (a shipped placeholder = §15 violation). The core therefore resolves
// it here BEFORE handing the brief to forge, and strips any other stray `{{…}}` token so no placeholder
// can ever ship (§15).
function resolveRemediationBrief(remediationPrompt: string, tenantName: string): string {
  const safeName = tenantName?.trim() || "your business";
  return remediationPrompt
    .replace(/\{\{\s*tenant\.business_name\s*\}\}/gi, safeName)
    .replace(/\{\{[^}]*\}\}/g, "")        // strip any remaining token — never ship a bracket (§15)
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:])/g, "$1")
    .trim();
}

function priorityForSeverity(severity: RegistryRow["severity"]): "low" | "normal" | "high" | "urgent" {
  switch (severity) {
    case "blocking": return "urgent";
    case "high":     return "high";
    case "medium":   return "normal";
    default:         return "low";
  }
}

// ── The core ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Run the Systems Check catalog for ONE tenant, persist the run + findings, and (per actionFiling) file a
 * remediation action for each qualifying fail. Returns a summary the edge fn can echo back.
 *
 * Order (delta-safe): resolve tenant name → (delta) snapshot the previous run's per-check statuses →
 * insert the run row → dispatch each check, insert its finding, and on a qualifying fail forge+file+link →
 * update the run counts.
 */
export async function runSystemsCheck(opts: RunSystemsCheckOptions): Promise<RunSystemsCheckSummary> {
  const { admin, tenantId, scanFlavor } = opts;
  if (!tenantId) throw new Error("SYSTEMS_CHECK_NO_TENANT: tenantId is required (server-resolved, §9/§588)");
  const dispatch = opts.dispatch ?? SYSTEMS_CHECK_DISPATCH;
  const actionFiling = opts.actionFiling ?? "all";

  // Resolve the tenant display name for the remediation brief's business-name token (§15 — no placeholder).
  let tenantName = "your business";
  try {
    const { data: tRow } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    if (tRow && typeof (tRow as { name?: string }).name === "string") {
      tenantName = (tRow as { name?: string }).name || tenantName;
    }
  } catch (e) {
    console.error("[systems-check] tenant name lookup failed:", (e as Error)?.message);
  }

  // Read the applicable catalog rows (operator-authored, enabled). §18: dispatch on runner_key.
  let q = admin
    .from("paige_systems_check_registry")
    .select("check_id, check_name, domain, severity, department, data_source, runner_key, nl_prompt, remediation_prompt, priority")
    .eq("enabled_by_default", true)
    .order("priority", { ascending: true });
  if (opts.runnerKeys && opts.runnerKeys.length > 0) {
    q = q.in("runner_key", opts.runnerKeys);
  }
  const { data: catalog, error: catErr } = await q;
  if (catErr) {
    throw new Error(`SYSTEMS_CHECK_CATALOG_READ_FAILED: ${catErr.message}`);
  }
  const rows = (Array.isArray(catalog) ? catalog : []) as RegistryRow[];

  // Delta mode: snapshot the tenant's PREVIOUS run's per-check statuses BEFORE we insert the new run.
  const prevStatus: Record<string, CheckStatus> = {};
  if (actionFiling === "delta") {
    try {
      const { data: prevRun } = await admin
        .from("paige_systems_check_run")
        .select("id")
        .eq("tenant_id", tenantId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const prevRunId = (prevRun as { id?: string } | null)?.id;
      if (prevRunId) {
        const { data: prevFindings } = await admin
          .from("paige_systems_check_finding")
          .select("check_id, status")
          .eq("run_id", prevRunId);
        for (const f of (prevFindings ?? []) as Array<{ check_id: string; status: CheckStatus }>) {
          prevStatus[f.check_id] = f.status;
        }
      }
    } catch (e) {
      // A delta-snapshot miss must not abort or fabricate — degrade to filing all fails (safe, noisier).
      console.error("[systems-check] delta snapshot failed; filing all fails:", (e as Error)?.message);
    }
  }

  // Insert the run row up-front so findings can reference it; counts are patched at the end.
  const { data: runRow, error: runErr } = await admin
    .from("paige_systems_check_run")
    .insert({
      tenant_id: tenantId,                 // EXPLICIT (§9)
      scan_flavor: scanFlavor,
      check_count: rows.length,
      triggered_by: opts.triggeredBy ?? null,
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    throw new Error(`SYSTEMS_CHECK_RUN_INSERT_FAILED: ${runErr?.message ?? "no row returned"}`);
  }
  const runId = (runRow as { id: string }).id;

  const ctx: CheckRunContext = { admin, tenantId, tenantName, scanFlavor };
  const summary: RunSystemsCheckSummary = {
    run_id: runId,
    check_count: rows.length,
    pass_count: 0,
    fail_count: 0,
    skip_count: 0,
    error_count: 0,
    actions_filed: 0,
    findings: [],
  };

  for (const row of rows) {
    // 1) Dispatch — fail-loud on a missing runner OR a runner throw (§32: never a silent pass).
    let result: CheckResult;
    const runner = dispatch[row.runner_key];
    if (!runner) {
      result = {
        status: "error",
        evidence: { error_class: "no_runner_registered", runner_key: row.runner_key },
        interpretation: `No runner is registered for '${row.runner_key}' yet — this check could not be evaluated.`,
      };
    } else {
      try {
        result = await runner(ctx, row);
        // Defensive: a runner that returns a malformed status is treated as an error, not trusted.
        if (!result || !["pass", "fail", "skip", "error"].includes(result.status)) {
          result = {
            status: "error",
            evidence: { error_class: "runner_bad_result", runner_key: row.runner_key, got: result?.status ?? null },
          };
        }
      } catch (e) {
        result = {
          status: "error",
          evidence: {
            error_class: (e as Error)?.name ?? "Error",
            message: (e as Error)?.message ?? "runner threw",
            runner_key: row.runner_key,
          },
        };
      }
    }

    // Tally.
    if (result.status === "pass") summary.pass_count++;
    else if (result.status === "fail") summary.fail_count++;
    else if (result.status === "skip") summary.skip_count++;
    else summary.error_count++;

    // 2) On a fail, draft the fix FIRST (so the finding row carries it). Honest: a needs_config/failed
    //    forge stores a truthful marker, never a fabricated draft — and the action is still filed so the
    //    work is tracked and Paige can draft later (§13).
    let draftedFix: Record<string, unknown> | null = null;
    if (result.status === "fail") {
      const brief = resolveRemediationBrief(row.remediation_prompt, tenantName);
      try {
        const forged = await forge({
          tenantId,
          modality: "text",
          tier: REMEDIATION_TIER,
          userIntent: brief,
          callerFunction: RUNNER_AGENT,
          remember: false,                 // a remediation draft is not a reusable design memory (§26)
          metadata: { systems_check_id: row.check_id, run_id: runId },
        });
        const content = typeof forged.result.content === "string" ? forged.result.content.trim() : "";
        if (!forged.result.needs_config && content) {
          draftedFix = { brief, content, model: forged.result.model ?? null };
        } else {
          // Honest degrade — the fix is NEEDED but not draftable right now; record why, don't fake it.
          draftedFix = { brief, needs_config: true, reason: forged.result.needs_config ? "model_needs_config" : "empty_draft" };
        }
      } catch (e) {
        console.error(`[systems-check] forge failed for ${row.check_id}:`, (e as Error)?.message);
        draftedFix = { brief, error: (e as Error)?.message ?? "forge_failed" };
      }
    }

    // 3) Insert the finding (service-role; the SOLE writer of this table, §37). tenant_id EXPLICIT (§9);
    //    department_id denormalized from the registry row for §16 routing history.
    const { data: findingRow, error: findErr } = await admin
      .from("paige_systems_check_finding")
      .insert({
        run_id: runId,
        check_id: row.check_id,
        tenant_id: tenantId,                          // EXPLICIT (§9)
        status: result.status,
        severity_at_finding: row.severity,
        evidence: result.evidence ?? {},
        paige_interpretation: result.interpretation ?? null,
        paige_drafted_fix: draftedFix,
        department_id: row.department ?? null,
      })
      .select("id")
      .single();
    if (findErr || !findingRow) {
      // A finding-insert failure is loud but must not abort the whole scan — record and continue (§13).
      console.error(`[systems-check] finding insert failed for ${row.check_id}:`, findErr?.message);
      summary.findings.push({ check_id: row.check_id, status: result.status, finding_id: "", resolution_action_id: null });
      continue;
    }
    const findingId = (findingRow as { id: string }).id;

    // 4) File a remediation action for a qualifying fail, then link it back onto the finding.
    let resolutionActionId: string | null = null;
    const shouldFile = result.status === "fail" &&
      (actionFiling !== "delta" || prevStatus[row.check_id] !== "fail"); // delta: only NEW/newly-degraded
    if (shouldFile) {
      try {
        const { data: filed, error: fileErr } = await admin.rpc("file_action", {
          p_action_kind: REMEDIATE_ACTION_KIND,
          p_title: `Fix: ${row.check_name}`,
          p_summary: result.interpretation ?? `Systems Check "${row.check_name}" failed and needs attention.`,
          p_payload: {
            check_id: row.check_id,
            run_id: runId,
            finding_id: findingId,
            severity: row.severity,
            domain: row.domain,
            scan_flavor: scanFlavor,
          },
          // Route to the finding's owning desk; null → the systems.remediate kind default (§16).
          p_to_department: row.department ?? null,
          p_priority: priorityForSeverity(row.severity),
          p_created_by_agent: RUNNER_AGENT,
          p_tenant_id: tenantId,                       // EXPLICIT — service-role path (§9)
        });
        if (fileErr) {
          console.error(`[systems-check] file_action failed for ${row.check_id}:`, fileErr.message);
        } else if (filed && (filed as { ok?: boolean }).ok) {
          resolutionActionId = ((filed as { action_id?: string }).action_id) ?? null;
        }
      } catch (e) {
        console.error(`[systems-check] file_action threw for ${row.check_id}:`, (e as Error)?.message);
      }

      if (resolutionActionId) {
        summary.actions_filed++;
        const { error: linkErr } = await admin
          .from("paige_systems_check_finding")
          .update({ resolution_action_id: resolutionActionId })
          .eq("id", findingId);
        if (linkErr) console.error(`[systems-check] link resolution_action_id failed for ${row.check_id}:`, linkErr.message);
      }
    }

    summary.findings.push({
      check_id: row.check_id,
      status: result.status,
      finding_id: findingId,
      resolution_action_id: resolutionActionId,
    });
  }

  // 5) Patch the run row with the final counts + completion time.
  const { error: patchErr } = await admin
    .from("paige_systems_check_run")
    .update({
      completed_at: new Date().toISOString(),
      check_count: summary.check_count,
      pass_count: summary.pass_count,
      fail_count: summary.fail_count,
    })
    .eq("id", runId);
  if (patchErr) console.error("[systems-check] run finalize failed:", patchErr.message);

  return summary;
}
