/* eslint-disable @typescript-eslint/no-explicit-any -- Executed edge helper, loaded through a transpile port. */
// @vitest-environment node
//
// PHASE 2 · S1 — Pipeline write acts (deal_move_stage) record an honest Rail outcome.
//
// Two halves, exactly like the comms contract test, because two different things can be wrong:
//   1. The MAPPING — does deal_move_stage's real result shape land in an outcome whose
//      owner-facing sentence is TRUE (§947 governing rule: never claim "nothing changed"
//      unless we positively know it)? This half runs the real module.
//   2. The WIRING — is recordPipelineRun reachable from BOTH the result path and the throw
//      path, holding the service-role client, attributing to the acted-on tenant? The 11k-line
//      `serve()` handler cannot be imported, so this half asserts on its source. Weaker than
//      execution, and stated as such: it catches the regressions that make the feature
//      silently write nothing (the exact class #947 documents).
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";

function load() {
  const src = readFileSync("supabase/functions/_shared/pipeline-capability-outcome.ts", "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const out: any = {};
  // The module's ONLY import is `import type`, which TypeScript erases. A value import here
  // would throw rather than silently resolve to undefined.
  new Function("require", "exports", js)((k: string) => { throw new Error(`unexpected runtime import: ${k}`); }, out);
  return out;
}

const { classifyPipelineRun, PIPELINE_WRITE_CAPABILITIES } = load();
const move = (input: { result?: unknown; thrown?: unknown; threw?: boolean; writeAttempted?: boolean }) =>
  classifyPipelineRun({ capability: "deal_move_stage", ...input });

describe("Pipeline capability runs — what the Rail is told (S1)", () => {
  it("covers deal_move_stage as a write act", () => {
    expect([...PIPELINE_WRITE_CAPABILITIES]).toContain("deal_move_stage");
  });

  it("records nothing for a non-pipeline capability", () => {
    expect(classifyPipelineRun({ capability: "crm_list_deals", result: { success: true } })).toBeNull();
    expect(classifyPipelineRun({ capability: "comms_buy_number", result: { success: true } })).toBeNull();
  });

  it("a real stage move is capability_succeeded", () => {
    expect(move({ result: { success: true, deal_id: "d1", stage: "Won", status: "won" } }))
      .toBe("capability_succeeded");
  });

  it("a pre-UPDATE guard rejection is capability_refused (nothing changed is TRUE)", () => {
    expect(move({ result: { success: false, error: "That deal isn't in your workspace." } }))
      .toBe("capability_refused");
    expect(move({ result: { success: false, error: "That stage isn't in your workspace." } }))
      .toBe("capability_refused");
    expect(move({ result: { success: false, error: "No workspace in context — pick a workspace first." } }))
      .toBe("capability_refused");
  });

  it("a POST-write throw is capability_outcome_unknown — the UPDATE may have already applied", () => {
    // §947 governing rule: a thrown UPDATE/transport error, once the write was DISPATCHED, is not
    // provably non-applied (a transport throw can land after commit), so it must never assert
    // "nothing changed". writeAttempted:true is the "we got as far as the deals UPDATE" signal.
    expect(move({ thrown: new Error("db exploded"), threw: true, writeAttempted: true }))
      .toBe("capability_outcome_unknown");
    // NEGATIVE CONTROL: the one wrong answer that would falsely claim "nothing changed" post-write.
    expect(move({ thrown: new Error("db exploded"), threw: true, writeAttempted: true })).not.toBe("capability_failed");
    expect(move({ thrown: new Error("db exploded"), threw: true, writeAttempted: true })).not.toBe("capability_refused");
    expect(move({ thrown: new Error("db exploded"), threw: true, writeAttempted: true })).not.toBe("capability_succeeded");
  });

  it("a PRE-write throw is capability_failed, never a false 'was sent' (Codex P2)", () => {
    // A malformed-args JSON.parse, the service-client construction, or the pre-UPDATE stage-lookup
    // error the handler now re-throws all land here with writeAttempted absent/false. No external
    // effect was attempted, so "nothing changed" is TRUE → capability_failed.
    expect(move({ thrown: new Error("SyntaxError: bad json"), threw: true })).toBe("capability_failed");
    expect(move({ thrown: new Error("22P02 invalid input syntax for type uuid"), threw: true, writeAttempted: false }))
      .toBe("capability_failed");
    // NEGATIVE CONTROLS: the two false-Rail statements this split exists to kill.
    // - outcome_unknown would tell the owner "it was sent, may have taken effect" about an act that never ran.
    // - refused would tell the owner "Not allowed" about an operational failure with no guard decision.
    expect(move({ thrown: new Error("db"), threw: true })).not.toBe("capability_outcome_unknown");
    expect(move({ thrown: new Error("db"), threw: true })).not.toBe("capability_refused");
    expect(move({ thrown: new Error("db"), threw: true })).not.toBe("capability_succeeded");
  });

  it("an unrecognised/empty result shape is capability_outcome_unknown, never a claim", () => {
    expect(move({ result: null })).toBe("capability_outcome_unknown");
    expect(move({ result: "oops" })).toBe("capability_outcome_unknown");
    expect(move({})).toBe("capability_outcome_unknown");
  });
});

describe("Pipeline capability run WIRING in paige-ai-chat (source assertions)", () => {
  const src = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");

  it("imports the pipeline classifier", () => {
    expect(src).toContain('import { classifyPipelineRun } from "../_shared/pipeline-capability-outcome.ts"');
  });

  it("declares recordPipelineRun that records via the service-role client, attributed to the acted-on tenant", () => {
    expect(src).toMatch(/const recordPipelineRun = async/);
    // service-role client is `supabase` (NOT supabaseClient); attribution is personaCtx.tenant_id.
    const block = src.slice(src.indexOf("const recordPipelineRun = async"), src.indexOf("const recordPipelineRun = async") + 900);
    expect(block).toContain("classifyPipelineRun({");
    expect(block).toContain("await recordCapabilityRun(supabase, {");
    expect(block).toContain("tenantId: personaCtx?.tenant_id ?? null");
    expect(block).toContain("actorId: user.id");
    // it must NOT use the anon/JWT client, which would silently write nothing (§947 defect 1).
    expect(block).not.toContain("recordCapabilityRun(supabaseClient");
  });

  it("is reachable from BOTH the result path and the throw path, threading writeAttempted", () => {
    expect(src).toContain("await recordPipelineRun({ result })");
    // The catch MUST pass writeAttempted so a pre-write throw is failed, not a false outcome_unknown.
    expect(src).toContain("await recordPipelineRun({ thrown: err, threw: true, writeAttempted: pipelineWriteAttempted })");
  });

  it("sets the pre/post-write boundary and re-throws the stage-lookup error (Codex P2)", () => {
    // The flag is declared per-iteration (default false = pre-write) and flipped true right before
    // the external UPDATE, so a throw's honesty (failed vs outcome_unknown) tracks reality.
    expect(src).toContain("let pipelineWriteAttempted = false");
    expect(src).toContain("pipelineWriteAttempted = true");
    // deal_move_stage's stage lookup must PROPAGATE its query error, not swallow it into a false
    // `refused` — an operational lookup failure is a pre-write throw → capability_failed.
    expect(src).toContain("const { data: stage, error: stageErr } = await admin.from(\"pipeline_stages\")");
    expect(src).toContain("if (stageErr) throw stageErr");
  });

  it("orders the boundary correctly: stageErr throw BEFORE the flag, flag BEFORE the deals UPDATE (§39 peer-gate)", () => {
    // POSITION matters, not just presence (the §39 MINOR): if `pipelineWriteAttempted = true` moved
    // AFTER the deals UPDATE, a merr throw would misclassify as capability_failed instead of
    // outcome_unknown — a false "nothing changed" on a possibly-applied write. Lock the order so a
    // future refactor can't silently break it. Anchor on the move-specific UPDATE (unique to
    // deal_move_stage; deal_create INSERTs, it does not UPDATE stage_id+pipeline_id).
    const idxStageErrThrow = src.indexOf("if (stageErr) throw stageErr");
    const idxFlagSet = src.indexOf("pipelineWriteAttempted = true");
    const idxMoveUpdate = src.indexOf(".update({ stage_id: stage.id, pipeline_id: stage.pipeline_id, status");
    expect(idxStageErrThrow).toBeGreaterThan(0);
    expect(idxFlagSet).toBeGreaterThan(0);
    expect(idxMoveUpdate).toBeGreaterThan(0);
    // pre-write lookup throw → flag flip → external write, in that source order.
    expect(idxStageErrThrow).toBeLessThan(idxFlagSet);
    expect(idxFlagSet).toBeLessThan(idxMoveUpdate);
  });
});
