// Sub-Agent: Fundability Diagnostician
// Maps a client record against the BUILD-to-FUND Phase 0/1/2/3 checklist
// and the Data Consistency 7-channel standard. Returns specific gaps.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface Input {
  contact_id?: string;
  client_id?: string;
}

interface Finding {
  phase: "Phase 0 Intake" | "Phase 1 BUILD" | "Data Consistency Layer" | "Phase 2 STACK" | "Phase 3 FUND";
  gap: string;
  severity: "blocker" | "warning" | "info";
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const { input, context } = (await req.json()) as {
    input: Input;
    context?: { contact_id?: string };
  };

  const contactId = input?.contact_id ?? input?.client_id ?? context?.contact_id;
  if (!contactId) {
    return ok({
      ok: false,
      error: "contact_id required",
      hint: "Pass input.contact_id (or client_id) to diagnose a specific client.",
    });
  }

  // Pull the client record + adjacent BTF context
  const [clientRes, businessRes, bankRes, creditRes, intakeRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", contactId).maybeSingle(),
    supabase.from("businesses").select("*").eq("client_id", contactId).maybeSingle(),
    supabase.from("banking_relationships").select("id,bank_name,account_type,opened_at").eq("client_id", contactId),
    supabase.from("funding_readiness_scores").select("*").eq("client_id", contactId).maybeSingle(),
    supabase.from("paige_client_intake_submissions").select("*").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const client = clientRes.data;
  const biz = businessRes.data;
  const banks = bankRes.data ?? [];
  const readiness = creditRes.data;

  if (!client) {
    return ok({
      ok: false,
      error: `Client ${contactId} not found`,
    });
  }

  const findings: Finding[] = [];

  // ---- PHASE 0 ----
  if (!intakeRes.data) {
    findings.push({ phase: "Phase 0 Intake", gap: "Intake submission not on file — Phase 0 questionnaire not completed.", severity: "blocker" });
  }
  if (!readiness) {
    findings.push({ phase: "Phase 0 Intake", gap: "No funding readiness baseline captured (3-bureau personal credit pull missing).", severity: "blocker" });
  } else {
    const minFico = Math.min(
      readiness.estimated_fico_experian ?? 999,
      readiness.estimated_fico_equifax ?? 999,
      readiness.estimated_fico_transunion ?? 999,
    );
    if (minFico === 999) {
      findings.push({ phase: "Phase 0 Intake", gap: "Personal FICO scores not documented across all three bureaus.", severity: "warning" });
    }
  }
  // Funding path decision
  const fundingPath = (client as Record<string, unknown>).funding_path as string | undefined;
  if (!fundingPath) {
    findings.push({ phase: "Phase 0 Intake", gap: "Funding Path Decision not set (Path A PG / Path B EIN-only / Path C Combination). This is the most important intake call.", severity: "blocker" });
  }

  // ---- PHASE 1 BUILD ----
  if (!biz) {
    findings.push({ phase: "Phase 1 BUILD", gap: "No business entity record on file — Phase 1 has not started.", severity: "blocker" });
  } else {
    if (!biz.entity_name) findings.push({ phase: "Phase 1 BUILD", gap: "Legal business name missing.", severity: "blocker" });
    if (!biz.entity_type) findings.push({ phase: "Phase 1 BUILD", gap: "Entity type (LLC/Corp) not confirmed.", severity: "blocker" });
    if (!biz.state_of_formation) findings.push({ phase: "Phase 1 BUILD", gap: "State of formation not recorded.", severity: "blocker" });
    if (!biz.ein) findings.push({ phase: "Phase 1 BUILD", gap: "EIN not obtained or not stored.", severity: "blocker" });
    if (!biz.business_address || !biz.business_address_line1) findings.push({ phase: "Phase 1 BUILD", gap: "Business address missing — must be commercial/virtual/registered, not residential.", severity: "blocker" });
    if (!biz.business_phone) findings.push({ phase: "Phase 1 BUILD", gap: "Dedicated business phone line missing (not personal cell).", severity: "blocker" });
    if (!biz.business_email || /gmail|yahoo|hotmail/i.test(biz.business_email)) {
      findings.push({ phase: "Phase 1 BUILD", gap: "Business email is missing or on a free provider — lenders expect a domain email.", severity: "warning" });
    }
    if (!biz.website_url) findings.push({ phase: "Phase 1 BUILD", gap: "No business website on file — lenders check this.", severity: "warning" });
    if (!biz.naics_code) findings.push({ phase: "Phase 1 BUILD", gap: "NAICS code not selected (some codes auto-decline).", severity: "warning" });
  }

  // Banking — clock starts on first open
  if (banks.length === 0) {
    findings.push({ phase: "Phase 1 BUILD", gap: "No business banking relationship on file. Banking history clock has not started (lenders want 3+ months).", severity: "blocker" });
  } else {
    const oldest = banks
      .map((b) => (b.opened_at ? new Date(b.opened_at).getTime() : 0))
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    if (oldest) {
      const months = (Date.now() - oldest) / (1000 * 60 * 60 * 24 * 30);
      if (months < 3) {
        findings.push({
          phase: "Phase 1 BUILD",
          gap: `Banking history is only ~${months.toFixed(1)} months old. Most lenders want 3+ months before serious applications.`,
          severity: "warning",
        });
      }
    }
  }

  // ---- DATA CONSISTENCY LAYER ----
  // Without an explicit audit record, flag as "needs audit" for any existing entity
  if (biz?.entity_name) {
    findings.push({
      phase: "Data Consistency Layer",
      gap: "Run the 7-channel exact-match audit (SOS · IRS · Bank · 411 · Google · Yelp · LexisNexis) via the Data Consistency Auditor sub-agent before STACK begins.",
      severity: "warning",
    });
  }

  // ---- PHASE 2 STACK ----
  if (!biz?.duns_number) {
    findings.push({ phase: "Phase 2 STACK", gap: "D-U-N-S number not registered with Dun & Bradstreet — required identifier before opening tradelines.", severity: "blocker" });
  }
  // Tradelines tally
  const { data: tradelines } = await supabase
    .from("business_vendors")
    .select("id,vendor_name,tier,reporting_confirmed")
    .eq("client_id", contactId);
  const t1 = (tradelines ?? []).filter((t) => t.tier === 1 && t.reporting_confirmed).length;
  const t2 = (tradelines ?? []).filter((t) => t.tier === 2 && t.reporting_confirmed).length;
  const t3 = (tradelines ?? []).filter((t) => t.tier === 3 && t.reporting_confirmed).length;
  if (t1 < 3) findings.push({ phase: "Phase 2 STACK", gap: `Only ${t1} of recommended 5 Tier 1 vendor tradelines reporting. Vendor must report before retail.`, severity: "blocker" });
  if (t1 >= 3 && t2 < 2) findings.push({ phase: "Phase 2 STACK", gap: `Tier 1 ready — open Tier 2 retail tradelines next (Amazon Business, Dell, Newegg, Staples).`, severity: "info" });
  if (t2 >= 2 && t3 < 1) findings.push({ phase: "Phase 2 STACK", gap: `Tier 2 ready — open Tier 3 financial tradelines (Credit Strong Business + BizMotus via PME affiliate link).`, severity: "info" });

  // ---- PHASE 3 FUND ----
  if (readiness?.composite_score && readiness.composite_score < 70) {
    findings.push({
      phase: "Phase 3 FUND",
      gap: `Composite readiness score is ${readiness.composite_score}/100. FUND applications should wait until the gaps above are closed.`,
      severity: "warning",
    });
  }

  // Determine current phase
  let currentPhase: Finding["phase"] = "Phase 0 Intake";
  const has0 = !findings.some((f) => f.phase === "Phase 0 Intake" && f.severity === "blocker");
  const has1 = has0 && biz && !findings.some((f) => f.phase === "Phase 1 BUILD" && f.severity === "blocker");
  const hasStack = has1 && !findings.some((f) => f.phase === "Phase 2 STACK" && f.severity === "blocker");
  if (hasStack) currentPhase = "Phase 3 FUND";
  else if (has1) currentPhase = "Phase 2 STACK";
  else if (has0 && biz) currentPhase = "Phase 1 BUILD";
  else if (has0) currentPhase = "Phase 1 BUILD";

  const blockers = findings.filter((f) => f.severity === "blocker");
  const warnings = findings.filter((f) => f.severity === "warning");

  const nextGate =
    blockers.length > 0
      ? `${blockers[0].phase} — close: "${blockers[0].gap}"`
      : `${currentPhase} sign-off`;

  return ok({
    ok: true,
    subagent: "fundability-diagnostician",
    summary: `${client.first_name ?? "Client"} is currently in ${currentPhase}. ${blockers.length} blocker(s) and ${warnings.length} warning(s) to address. Next gate: ${nextGate}.`,
    current_phase: currentPhase,
    funding_path: fundingPath ?? "UNSET",
    findings,
    recommended_actions: blockers.slice(0, 5).map((f) => f.gap),
    confidence: blockers.length > 0 ? "high" : warnings.length > 0 ? "medium" : "high",
    requires_approval: false,
    sources: ["BUILD-to-FUND Master Checklist", "PME KB Section 17"],
  });
});
