/* eslint-disable @typescript-eslint/no-explicit-any -- Executed edge helper, loaded through a transpile port. */
// @vitest-environment node
//
// CAPABILITY SYSTEM · SLICE 3 (F05) — CRM/scheduling write receipts record an honest Rail outcome.
//
// crm_log_activity / calendar_book_meeting / crm_create_task previously recorded ONLY to
// paige_audit_log; now they also file a capability-Rail row. Two halves, like the pipeline/comms
// contract tests, because two different things can be wrong:
//   1. The MAPPING — does each handler's real result shape land in an outcome whose owner-facing
//      sentence is TRUE (§947: never claim "nothing changed" unless positively known)? Runs the real module.
//   2. The WIRING — is recordCrmRun reachable from BOTH the result and throw paths, holding the
//      service-role client, attributed to the acted-on tenant, and threading crmWriteAttempted set
//      immediately before each of the three writes? Asserted on the 11k-line handler's source.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";

function load() {
  const src = readFileSync("supabase/functions/_shared/crm-capability-outcome.ts", "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const out: any = {};
  // The module's ONLY import is `import type`, erased by TS. A value import here would throw.
  new Function("require", "exports", js)((k: string) => { throw new Error(`unexpected runtime import: ${k}`); }, out);
  return out;
}

const { classifyCrmRun, CRM_WRITE_CAPABILITIES } = load();
const CAPS = ["crm_log_activity", "calendar_book_meeting", "crm_create_task"] as const;
const run = (cap: string, input: { result?: unknown; thrown?: unknown; threw?: boolean; writeAttempted?: boolean }) =>
  classifyCrmRun({ capability: cap, ...input });

describe("CRM capability runs — what the Rail is told (slice 3 / F05)", () => {
  it("covers exactly the three write receipts", () => {
    expect([...CRM_WRITE_CAPABILITIES].sort()).toEqual([...CAPS].sort());
  });

  it("records nothing for a non-CRM capability", () => {
    expect(classifyCrmRun({ capability: "deal_move_stage", result: { success: true } })).toBeNull();
    expect(classifyCrmRun({ capability: "comms_buy_number", result: { success: true } })).toBeNull();
    expect(classifyCrmRun({ capability: "crm_search_contacts", result: { success: true } })).toBeNull();
  });

  it("a real write is capability_succeeded for each receipt", () => {
    expect(run("crm_create_task", { result: { success: true, task_id: "t1" } })).toBe("capability_succeeded");
    expect(run("calendar_book_meeting", { result: { success: true, booking_id: "b1" } })).toBe("capability_succeeded");
    expect(run("crm_log_activity", { result: { success: true, log_id: "l1" } })).toBe("capability_succeeded");
  });

  it("a POST-write throw is capability_outcome_unknown — the row may have already been written", () => {
    for (const cap of CAPS) {
      expect(run(cap, { thrown: new Error("db exploded"), threw: true, writeAttempted: true }))
        .toBe("capability_outcome_unknown");
      // negative controls: the answers that would falsely claim "nothing changed" post-write
      expect(run(cap, { thrown: new Error("x"), threw: true, writeAttempted: true })).not.toBe("capability_failed");
      expect(run(cap, { thrown: new Error("x"), threw: true, writeAttempted: true })).not.toBe("capability_refused");
      expect(run(cap, { thrown: new Error("x"), threw: true, writeAttempted: true })).not.toBe("capability_succeeded");
    }
  });

  it("a PRE-write throw is capability_failed (nothing was dispatched), never a false 'was sent'", () => {
    for (const cap of CAPS) {
      expect(run(cap, { thrown: new Error("SyntaxError: bad json"), threw: true })).toBe("capability_failed");
      expect(run(cap, { thrown: new Error("x"), threw: true, writeAttempted: false })).toBe("capability_failed");
      expect(run(cap, { thrown: new Error("x"), threw: true })).not.toBe("capability_outcome_unknown");
      expect(run(cap, { thrown: new Error("x"), threw: true })).not.toBe("capability_refused");
    }
  });

  it("an UNEXPECTED success:false is outcome_unknown, NOT refused (these handlers have no refusal branch)", () => {
    // deliberate difference from pipeline: deal_move_stage genuinely refuses; these three never emit
    // success:false, so if one appeared it is an unrecognised state, not a "nothing changed" decision.
    for (const cap of CAPS) {
      expect(run(cap, { result: { success: false, error: "unexpected" } })).toBe("capability_outcome_unknown");
      expect(run(cap, { result: { success: false } })).not.toBe("capability_refused");
    }
  });

  it("an unrecognised/empty result shape is capability_outcome_unknown, never a claim", () => {
    expect(run("crm_create_task", { result: null })).toBe("capability_outcome_unknown");
    expect(run("crm_log_activity", { result: "oops" })).toBe("capability_outcome_unknown");
    expect(run("calendar_book_meeting", {})).toBe("capability_outcome_unknown");
  });
});

describe("CRM capability run WIRING in paige-ai-chat (source assertions)", () => {
  const src = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");

  it("imports the CRM classifier", () => {
    expect(src).toContain('import { classifyCrmRun } from "../_shared/crm-capability-outcome.ts"');
  });

  it("declares recordCrmRun via the service-role client, attributed to the acted-on tenant", () => {
    expect(src).toMatch(/const recordCrmRun = async/);
    const at = src.indexOf("const recordCrmRun = async");
    const block = src.slice(at, at + 900);
    expect(block).toContain("classifyCrmRun({");
    expect(block).toContain("await recordCapabilityRun(supabase, {");
    expect(block).toContain("tenantId: personaCtx?.tenant_id ?? null");
    expect(block).toContain("actorId: user.id");
    // never the anon/JWT client, which would silently write nothing
    expect(block).not.toContain("recordCapabilityRun(supabaseClient");
  });

  it("is reachable from BOTH the result path and the throw path, threading crmWriteAttempted", () => {
    expect(src).toContain("await recordCrmRun({ result })");
    expect(src).toContain("await recordCrmRun({ thrown: err, threw: true, writeAttempted: crmWriteAttempted })");
    // the flag is declared once (per iteration) and set before EACH of the three external writes
    expect(src).toContain("let crmWriteAttempted = false;");
    expect((src.match(/crmWriteAttempted = true;/g) ?? []).length).toBe(3);
  });

  it("does not disturb the pipeline recorder's verbatim wiring (shared catch)", () => {
    // slice 3 only ADDS a line; the pipeline catch literal a sibling test hard-codes must remain.
    expect(src).toContain("await recordPipelineRun({ thrown: err, threw: true, writeAttempted: false })");
  });
});
