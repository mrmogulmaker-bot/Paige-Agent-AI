/* eslint-disable @typescript-eslint/no-explicit-any -- Executed edge helper, loaded through a transpile port. */
// @vitest-environment node
//
// Piece 3b — the capability SIGNAL builder + decision core, the manifest Paige answers "what can
// you do here?" from (§13/§36/§70). The P0 Defect-1 fix EXPANDED this past the original 3-capability
// MVP to the families Paige's tool list/persona over-claim (social, comms/SMS, team, pipeline,
// campaigns, workflows). The load-bearing honesty property: an ACTION family whose governed seam is
// NOT registered in the Spine (social publish, SMS send, team management) resolves through a `null`
// maturity → UNAVAILABLE → "planned" — so Paige says it's not something she can do here yet, never
// implies she can do it (and never falsely asserts it flatly doesn't exist — §13/§70).
//
// Tested on the REAL pure modules loaded through the transpile port (both import ONLY types).
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";

function port(path: string) {
  const src = readFileSync(path, "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const out: any = {};
  // Both modules import ONLY types (erased by TS). A value import here would throw.
  new Function("require", "exports", js)((k: string) => { throw new Error(`unexpected runtime import: ${k}`); }, out);
  return out;
}

const { buildCapabilitySignals } = port("supabase/functions/_shared/paige-capability-status/signals.ts");
const { resolveCapabilityStatus } = port("supabase/functions/_shared/paige-capability-status/resolver.ts");

// The facts a FRESH SOLO TENANT actually produces: a non-client tier, every mutating lane on the
// safe default (confirm), every REGISTERED read/mutate seam PARTIAL (their real registry maturity),
// every UNREGISTERED action family null (no governed seam), and n8n not yet connected. The edge
// dispatch resolves these from the verified JWT; here they are spelled out so the assertions below
// are about the HONEST ANSWER a fresh Solo owner is actually told.
const freshSolo = (over: Record<string, unknown> = {}) => ({
  callerTier: "tenant",
  contactCreateLane: "confirm",
  campaignCreateLane: "confirm",
  workflowsLane: "confirm",
  integrationsListMaturity: "PARTIAL",
  pipelineEvidenceMaturity: "PARTIAL",
  commsReadMaturity: "PARTIAL",
  commsSendMaturity: null,          // comms.send — unregistered governed seam
  socialPresenceMaturity: "PARTIAL",
  socialPublishMaturity: null,      // social.publish — unregistered governed seam
  teamAuthorityMaturity: "PARTIAL",
  teamManageMaturity: null,         // team.manage — unregistered governed seam
  campaignListMaturity: "PARTIAL",
  campaignCreateMaturity: "PARTIAL",
  workflowsMaturity: "PARTIAL",     // integrations.n8n_run_workflow is registered…
  workflowsConnected: false,        // …but the tenant's n8n is not connected yet
  ...over,
});
const byKey = (rows: any[]) => Object.fromEntries(rows.map((r) => [r.key, r]));
const answer = (over: Record<string, unknown> = {}) =>
  byKey(resolveCapabilityStatus(buildCapabilitySignals(freshSolo(over))));

describe("buildCapabilitySignals — the manifest shape (§13/§947)", () => {
  it("emits every modeled family and ONLY families with a real backing key — no fabricated ones", () => {
    const keys = buildCapabilitySignals(freshSolo()).map((r: any) => r.key).sort();
    expect(keys).toEqual([
      "campaign.create",
      "campaign.list",
      "comms.messages_read",
      "comms.send",
      "crm.create_contact",
      "crm.search_contacts",
      "integrations.list",
      "integrations.n8n_run_workflow",
      "pipeline.deal_stage_evidence",
      "social.presence",
      "social.publish",
      "team.authority",
      "team.manage",
    ]);
  });

  it("models reads as reads, the writes as create/update, and the dangerous acts as external effects", () => {
    const m = byKey(buildCapabilitySignals(freshSolo()));
    for (const k of ["crm.search_contacts", "integrations.list", "pipeline.deal_stage_evidence", "comms.messages_read", "social.presence", "team.authority", "campaign.list"]) {
      expect(m[k].actionKind, k).toBe("read");
    }
    expect(m["crm.create_contact"].actionKind).toBe("create");
    expect(m["campaign.create"].actionKind).toBe("create");
    expect(m["team.manage"].actionKind).toBe("update");
    expect(m["comms.send"].actionKind).toBe("external_effect");
    expect(m["social.publish"].actionKind).toBe("external_effect");
    expect(m["integrations.n8n_run_workflow"].actionKind).toBe("external_effect");
  });

  it("GROUNDING GUARD — only the two documented CRM seams are hardcoded LIVE; every other maturity comes from the fact", () => {
    // With every passed maturity null, nothing may be LIVE except the CRM synthesis. This is the
    // guard against a future edit hardcoding a cheerful LIVE for a seam we cannot confirm ships.
    const allNull = byKey(buildCapabilitySignals(freshSolo({
      integrationsListMaturity: null, pipelineEvidenceMaturity: null, commsReadMaturity: null,
      socialPresenceMaturity: null, teamAuthorityMaturity: null, campaignListMaturity: null,
      campaignCreateMaturity: null, workflowsMaturity: null,
    })));
    const live = Object.values(allNull).filter((r: any) => r.maturity === "LIVE").map((r: any) => r.key).sort();
    expect(live).toEqual(["crm.create_contact", "crm.search_contacts"]);
    // and every other family degraded its null to UNAVAILABLE (never undefined, never faked)
    for (const k of ["integrations.list", "pipeline.deal_stage_evidence", "comms.messages_read", "social.presence", "team.authority", "campaign.list", "campaign.create", "integrations.n8n_run_workflow"]) {
      expect(allNull[k].maturity, k).toBe("UNAVAILABLE");
    }
  });

  it("threads the ceiling-clamped lane onto each mutating write verbatim", () => {
    const m = byKey(buildCapabilitySignals(freshSolo({ contactCreateLane: "auto", campaignCreateLane: "off" })));
    expect(m["crm.create_contact"].autonomyLane).toBe("auto");
    expect(m["campaign.create"].autonomyLane).toBe("off");
  });

  it("marks only the real connection-gated family as requiresConnection", () => {
    const m = byKey(buildCapabilitySignals(freshSolo()));
    expect(m["integrations.n8n_run_workflow"].requiresConnection).toBe(true);
    expect(m["integrations.n8n_run_workflow"].connected).toBe(false);
    expect(m["crm.create_contact"].requiresConnection).toBe(false);
    expect(m["campaign.create"].requiresConnection).toBe(false);
  });

  it("a non-client tier is eligible for everything; a sealed client seat is eligible for nothing", () => {
    for (const tier of ["tenant", "subaccount", "agency", "god"]) {
      for (const r of buildCapabilitySignals(freshSolo({ callerTier: tier }))) expect(r.tierEligible).toBe(true);
    }
    for (const r of buildCapabilitySignals(freshSolo({ callerTier: "client" }))) expect(r.tierEligible).toBe(false);
  });
});

describe("the honest answer a FRESH SOLO owner is told (the P0 Defect-1 anti-over-claim)", () => {
  it("the over-claimed ACTIONS are never live: posting, texting, and team management are PLANNED", () => {
    const a = answer();
    for (const k of ["social.publish", "comms.send", "team.manage"]) {
      expect(a[k].availability, k).toBe("planned");
      expect(a[k].reason, k).toBeTruthy();
      // §13/§70 (SF-1): the reason must NOT falsely assert the capability doesn't exist / "isn't
      // built" — raw tools exist for some of these; the honest claim is "no governed path here yet".
      expect(a[k].reason, k).not.toMatch(/not built/i);
      expect(a[k].reason, k).toMatch(/governed/i);
    }
  });

  it("running automations is NEEDS_SETUP until n8n is connected — not a claim that Paige can run them", () => {
    expect(answer()["integrations.n8n_run_workflow"].availability).toBe("needs_setup");
    // once connected, it is governed-but-gated (external effect → prepared for approval), never silently auto
    expect(answer({ workflowsConnected: true })["integrations.n8n_run_workflow"].availability).toBe("needs_approval");
  });

  it("the reads ARE live — seeing contacts, connections, pipeline, inbox, social accounts, team, campaigns", () => {
    const a = answer();
    for (const k of ["crm.search_contacts", "integrations.list", "pipeline.deal_stage_evidence", "comms.messages_read", "social.presence", "team.authority", "campaign.list"]) {
      expect(a[k].availability, k).toBe("live");
    }
  });

  it("the governed writes are prepared for approval on a confirm lane; an auto lane makes them live", () => {
    expect(answer()["crm.create_contact"].availability).toBe("needs_approval");
    expect(answer()["campaign.create"].availability).toBe("needs_approval");
    expect(answer({ contactCreateLane: "auto" })["crm.create_contact"].availability).toBe("live");
    expect(answer({ campaignCreateLane: "auto" })["campaign.create"].availability).toBe("live");
  });

  it("a sealed client seat is told NOT_FOR_TIER on every capability, with a reason", () => {
    const a = answer({ callerTier: "client" });
    for (const k of Object.keys(a)) {
      expect(a[k].availability, k).toBe("not_for_tier");
      expect(a[k].reason, k).toBeTruthy();
    }
  });

  it("an unregistered integrations read seam degrades to PLANNED, never a fabricated claim", () => {
    expect(answer({ integrationsListMaturity: null })["integrations.list"].availability).toBe("planned");
  });
});
