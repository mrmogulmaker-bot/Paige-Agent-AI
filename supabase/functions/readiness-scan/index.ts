// Ship #2 — Scheduled Credit + Funding Readiness Proposals scanner.
//
// Two modes:
//   1. Cron dispatch — no `tenant_id`. Iterates tenants where
//      tenant_features.credit_services_enabled = true AND the cadence
//      window has elapsed since last scan. Fans out one HTTP call per
//      tenant back to this same function (§189 gated).
//   2. Per-tenant scan — `tenant_id` provided. Loads the cohort, creates
//      a paige_readiness_scan_runs row, iterates contacts with a 20/min
//      throttle (§304), computes readiness delta from existing
//      readiness/credit tables, inserts a paige_readiness_proposals row
//      per contact, and dispatches each proposal to the n8n webhook
//      using the §191 envelope with event_kind = 'readiness_scan'.
//
// Manual triggers may pass `contact_ids` to run against arbitrary
// BTF-tagged contacts (including BTF Lead for sales re-qualification).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { resolveCreditDataProvider } from "./credit-data-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// §304 throttle for credit provider API calls
const THROTTLE_RATE_PER_MIN = 20;
const THROTTLE_DELAY_MS = Math.ceil(60_000 / THROTTLE_RATE_PER_MIN);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ScanPayload {
  tenant_id?: string;
  contact_ids?: string[];
  trigger_source?: "cron" | "manual" | "backfill";
  dry_run?: boolean;
}

async function getInternalSecret(key: string): Promise<string | null> {
  const { data } = await admin
    .from("_internal_secrets")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data as { value?: string } | null)?.value ?? null;
}

async function loadCohort(tenantId: string, contactIds?: string[]) {
  // Scheduled cohort: BTF Active AND lifecycle in (STACK, FUND).
  // Manual cohort (contact_ids provided): any BTF-tagged contact incl. BTF Lead.
  let q = admin
    .from("clients")
    .select("id, first_name, last_name, email, tags, lifecycle_stage, linked_user_id, assigned_coach_user_id")
    .eq("tenant_id", tenantId);
  if (contactIds && contactIds.length) {
    q = q.in("id", contactIds).overlaps("tags", ["BTF Active", "BTF Lead", "BTF Interested"]);
  } else {
    q = q.contains("tags", ["BTF Active"]).in("lifecycle_stage", ["STACK", "FUND"]);
  }
  const { data, error } = await q.limit(1000);
  if (error) throw new Error(`cohort_load_failed:${error.message}`);
  return data ?? [];
}

async function fetchReadinessSnapshot(contactUserId: string | null) {
  // Sources: funding_readiness_scores, credit_factor_scores, build_scores.
  // Insufficient data if the linked user is missing OR every source is null.
  if (!contactUserId) return null;
  const [{ data: readiness }, { data: credit }, { data: build }] = await Promise.all([
    admin.from("funding_readiness_scores").select("*").eq("user_id", contactUserId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("credit_factor_scores").select("*").eq("user_id", contactUserId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("build_scores").select("*").eq("user_id", contactUserId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!readiness && !credit && !build) return null;
  return { readiness, credit, build };
}

function computeDelta(current: any, previous: any) {
  const cur = current?.readiness?.total_score ?? current?.readiness?.overall_score ?? null;
  const prev = previous?.readiness?.total_score ?? previous?.readiness?.overall_score ?? null;
  const delta = cur != null && prev != null ? Number(cur) - Number(prev) : null;
  return {
    readiness_score_current: cur,
    readiness_score_previous: prev,
    readiness_score_delta: delta,
    credit_snapshot: current?.credit ?? null,
    build_snapshot: current?.build ?? null,
    computed_at: new Date().toISOString(),
  };
}

function recommendActions(delta: any): Array<{ code: string; label: string; priority: string }> {
  const actions: Array<{ code: string; label: string; priority: string }> = [];
  const d = delta.readiness_score_delta;
  if (d != null && d < -5) {
    actions.push({ code: "readiness_regression", label: "Readiness score dropped materially — schedule coaching call", priority: "high" });
  }
  if (delta.readiness_score_current != null && delta.readiness_score_current >= 80) {
    actions.push({ code: "graduate_to_fund", label: "Client is FUND-ready — advance stage and open capital stack", priority: "high" });
  } else if (delta.readiness_score_current != null && delta.readiness_score_current >= 60) {
    actions.push({ code: "recommend_next_build", label: "Recommend next BUILD milestone to unlock FUND eligibility", priority: "medium" });
  }
  if (!actions.length) {
    actions.push({ code: "monitor", label: "Readiness stable — continue monthly monitoring", priority: "low" });
  }
  return actions;
}

async function dispatchEnvelope(args: {
  tenantId: string;
  ruleId: string; // reuse scan_run_id as rule_id surrogate for §191 shape
  proposalId: string;
  contact: any;
  delta: any;
  actions: any[];
}) {
  const webhookUrl = await getInternalSecret("platform_stage_change_webhook_url");
  if (!webhookUrl) return { skipped: true, reason: "no_webhook" };
  const envelope = {
    event_id: crypto.randomUUID(),
    event_kind: "readiness_scan",
    tenant_id: args.tenantId,
    rule_id: args.ruleId,
    dispatched_at: new Date().toISOString(),
    consent_status: "granted", // §122 phase 1: proposal only, not send
    compose_intent: "transactional",
    proposal: {
      id: args.proposalId,
      readiness_delta: args.delta,
      recommended_actions: args.actions,
    },
    contact: {
      id: args.contact.id,
      email: args.contact.email,
      first_name: args.contact.first_name,
      last_name: args.contact.last_name,
    },
  };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    });
    return { ok: res.ok, status: res.status, envelope };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "dispatch_failed", envelope };
  }
}

async function runTenantScan(payload: ScanPayload) {
  const tenantId = payload.tenant_id!;
  const triggerSource = payload.trigger_source ?? "manual";

  // §189 gate
  const { data: features } = await admin
    .from("tenant_features")
    .select("credit_services_enabled, readiness_scan_cadence, credit_data_provider")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!features?.credit_services_enabled) {
    return { skipped: true, reason: "credit_services_disabled", tenant_id: tenantId };
  }
  const provider = resolveCreditDataProvider(features?.credit_data_provider);

  const cohort = await loadCohort(tenantId, payload.contact_ids);

  // Open scan run
  const { data: run, error: runErr } = await admin
    .from("paige_readiness_scan_runs")
    .insert({
      tenant_id: tenantId,
      cadence: features.readiness_scan_cadence ?? "monthly",
      trigger_source: triggerSource,
    })
    .select()
    .single();
  if (runErr || !run) throw new Error(`scan_run_open_failed:${runErr?.message}`);

  const errors: any[] = [];
  let contactsScanned = 0;
  let proposalsGenerated = 0;
  let proposalsInsufficient = 0;
  let creditProviderCalls = 0;
  let creditProviderCostUsd = 0;

  for (const contact of cohort) {
    contactsScanned++;
    try {
      // §304 throttle
      await sleep(THROTTLE_DELAY_MS);

      const current = await fetchReadinessSnapshot(contact.linked_user_id);
      // Previous snapshot: most recent proposal for this contact
      const { data: prevProposal } = await admin
        .from("paige_readiness_proposals")
        .select("readiness_delta_json")
        .eq("contact_id", contact.id)
        .order("proposed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // §193 — delegate the actual credit re-pull to the tenant's configured
      // provider adapter. Cost/call counters are vendor-neutral.
      if (provider && contact.linked_user_id) {
        const pull = await provider.pullSnapshot(contact.linked_user_id);
        creditProviderCalls += pull.calls;
        creditProviderCostUsd += pull.cost_usd;
      }

      if (!current) {
        // Insufficient data — write proposal with insufficient_data status,
        // skip audit noise, flag for coach follow-up.
        const { data: proposal } = await admin
          .from("paige_readiness_proposals")
          .insert({
            tenant_id: tenantId,
            contact_id: contact.id,
            scan_run_id: run.id,
            status: "insufficient_data",
            readiness_delta_json: { reason: "no_readiness_or_credit_or_build_data" },
            recommended_actions_json: [{
              code: "collect_baseline",
              label: "Missing baseline data — coach to run intake",
              priority: "medium",
            }],
          })
          .select()
          .single();
        proposalsInsufficient++;
        // Skip envelope dispatch for insufficient_data proposals.
        continue;
      }

      const previous = prevProposal?.readiness_delta_json
        ? { readiness: { total_score: (prevProposal.readiness_delta_json as any).readiness_score_current } }
        : null;
      const delta = computeDelta(current, previous);
      const actions = recommendActions(delta);

      if (payload.dry_run) continue;

      const { data: proposal, error: propErr } = await admin
        .from("paige_readiness_proposals")
        .insert({
          tenant_id: tenantId,
          contact_id: contact.id,
          scan_run_id: run.id,
          status: "pending",
          readiness_delta_json: delta,
          recommended_actions_json: actions,
        })
        .select()
        .single();
      if (propErr || !proposal) throw new Error(propErr?.message ?? "proposal_insert_failed");
      proposalsGenerated++;

      // §191 dispatch — non-blocking envelope
      const dispatch = await dispatchEnvelope({
        tenantId,
        ruleId: run.id,
        proposalId: proposal.id,
        contact,
        delta,
        actions,
      });
      if (!dispatch.ok) {
        errors.push({ contact_id: contact.id, kind: "dispatch_failed", detail: dispatch });
      }
    } catch (e) {
      errors.push({
        contact_id: contact.id,
        kind: "scan_error",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const costTotal = isoftpullCalls * ISOFTPULL_UNIT_COST_USD;
  await admin.rpc("increment_readiness_scan_counters", {
    _run_id: run.id,
    _contacts_scanned: contactsScanned,
    _proposals_generated: proposalsGenerated,
    _proposals_insufficient_data: proposalsInsufficient,
    _isoftpull_calls: isoftpullCalls,
    _cost_usd: costTotal,
  });
  await admin
    .from("paige_readiness_scan_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: errors.length === 0 ? "succeeded" : (proposalsGenerated + proposalsInsufficient > 0 ? "partial" : "failed"),
      errors_json: errors.slice(0, 50),
    })
    .eq("id", run.id);

  return {
    ok: true,
    tenant_id: tenantId,
    scan_run_id: run.id,
    contacts_scanned: contactsScanned,
    proposals_generated: proposalsGenerated,
    proposals_insufficient_data: proposalsInsufficient,
    isoftpull_calls: isoftpullCalls,
    cost_usd_total: costTotal,
    errors: errors.length,
  };
}

async function runCronDispatch() {
  // Pick tenants due for a scan based on cadence + last completed run.
  const { data: features } = await admin
    .from("tenant_features")
    .select("tenant_id, credit_services_enabled, readiness_scan_cadence")
    .eq("credit_services_enabled", true);
  const eligible = features ?? [];

  const now = new Date();
  const dueTenants: string[] = [];
  for (const f of eligible) {
    const { data: lastRun } = await admin
      .from("paige_readiness_scan_runs")
      .select("started_at, cadence")
      .eq("tenant_id", f.tenant_id)
      .in("status", ["succeeded", "partial"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cadenceDays = f.readiness_scan_cadence === "quarterly" ? 90 : 30;
    if (!lastRun) {
      dueTenants.push(f.tenant_id);
    } else {
      const last = new Date(lastRun.started_at as any).getTime();
      if ((now.getTime() - last) / 86_400_000 >= cadenceDays) dueTenants.push(f.tenant_id);
    }
  }

  const results: any[] = [];
  for (const tenantId of dueTenants) {
    try {
      results.push(await runTenantScan({ tenant_id: tenantId, trigger_source: "cron" }));
    } catch (e) {
      results.push({ tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ok: true, dispatched: dueTenants.length, results };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const payload = (req.method === "POST" ? await req.json().catch(() => ({})) : {}) as ScanPayload;
    const result = payload.tenant_id ? await runTenantScan(payload) : await runCronDispatch();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "scan_failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
