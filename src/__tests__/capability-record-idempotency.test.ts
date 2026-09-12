/* eslint-disable @typescript-eslint/no-explicit-any -- Executed edge helper, loaded through a transpile port. */
// @vitest-environment node
//
// Piece 2c — stable idempotency for capability runs. recordCapabilityRun dedupes on a UNIQUE key
// (tenant, source_kind, source_id=run_id, source_revision, outcome); a caller that mints a fresh
// crypto.randomUUID() per call can NEVER collapse a retry, so the same act writes two rows. A
// stable run id keyed on (capability, tenant, natural-act-key) makes a retry fold to ONE row —
// no duplicate outcome, receipt, or Rail record. This tests the pure key generator.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";

function load() {
  const src = readFileSync("supabase/functions/_shared/capability-record.ts", "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const out: any = {};
  // capability-record.ts has no runtime imports; a value import here would throw.
  new Function("require", "exports", js)((k: string) => { throw new Error(`unexpected runtime import: ${k}`); }, out);
  return out;
}

const { stableRunId } = load();
const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("stableRunId — deterministic, collision-resistant idempotency key", () => {
  it("produces an RFC-4122 v5-shaped uuid", async () => {
    expect(await stableRunId(["crm_create_contact", "t1", "jane@x.com"])).toMatch(UUID_V5);
  });

  it("is deterministic for identical parts (a retry folds to the same id)", async () => {
    const a = await stableRunId(["crm_create_contact", "t1", "jane@x.com"]);
    const b = await stableRunId(["crm_create_contact", "t1", "jane@x.com"]);
    expect(a).toBe(b);
  });

  it("differs across capability, tenant, and natural-act key", async () => {
    const base = await stableRunId(["crm_create_contact", "t1", "jane@x.com"]);
    expect(await stableRunId(["crm_create_contact", "t2", "jane@x.com"])).not.toBe(base); // different tenant
    expect(await stableRunId(["crm_update_contact", "t1", "jane@x.com"])).not.toBe(base);  // different capability
    expect(await stableRunId(["crm_create_contact", "t1", "john@x.com"])).not.toBe(base);  // different key
  });

  it("treats null/undefined parts as empty rather than crashing, and stays unambiguous", async () => {
    expect(await stableRunId(["crm_create_contact", null, undefined])).toMatch(UUID_V5);
    // a null middle part must not collide with an empty-string one shifting the delimiters
    expect(await stableRunId(["a", "", "b"])).not.toBe(await stableRunId(["a", "b", ""]));
  });
});
