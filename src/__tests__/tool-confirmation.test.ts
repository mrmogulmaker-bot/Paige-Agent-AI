/**
 * The confirm gate's authorization property, tested directly.
 *
 * Before this binding, `paige-ai-chat`'s gate was `if (autoMode === "confirm" && gateArgs.confirm
 * !== true) { propose }` — and `gateArgs` is the MODEL'S OWN OUTPUT. Every test below marked
 * "REGRESSION" would have PASSED against that implementation for the wrong reason, or failed
 * because it executed. They are written so the old behaviour cannot satisfy them.
 *
 * WHERE THIS SITS IN THE EVIDENCE
 *
 * `scripts/comms-purchase-safety-smoke.mjs` says paige-ai-chat "has no runtime harness". That is
 * out of date: `scripts/client-memory-authz/check.mjs` transpiles and IMPORTS the real handler
 * under Node and invokes it (71 checks, wired into CI). It does not cover this gate, though —
 * unconfigured RPCs in its fake return `{data: null}`, so every mutating tool simply proposes, and
 * none of its assertions depend on one executing. A check that wanted to exercise an EXECUTION
 * would have to configure `paige_tool_confirmation_claim` in its scenario.
 *
 * So the decision lives in a pure module: it can be exercised for real here, rather than asserted
 * as source text, without needing the whole handler booted.
 */
import { describe, it, expect } from "vitest";
import {
  canonicalizeToolArgs,
  toolArgsHash,
  decideToolConfirmation,
} from "../../supabase/functions/_shared/toolConfirmation.ts";

describe("decideToolConfirmation — the flag alone can never execute", () => {
  it("REGRESSION: confirm:true with NO server-held proposal does NOT execute", () => {
    // This is the defect. The old gate returned execute here.
    expect(decideToolConfirmation({ autoMode: "confirm", confirmFlag: true })).toEqual({
      kind: "propose",
      revalidate: true,
    });
  });

  it.each([
    ["no_open_confirmation"],
    ["same_turn"],
    ["expired"],
    ["already_used"],
    ["error"],
  ] as const)("REGRESSION: confirm:true refused when the claim fails (%s)", (reason) => {
    const decision = decideToolConfirmation({
      autoMode: "confirm",
      confirmFlag: true,
      claim: { ok: false, reason },
    });
    expect(decision).toEqual({ kind: "propose", revalidate: true });
  });

  it("executes ONLY when a real proposal was consumed", () => {
    expect(
      decideToolConfirmation({ autoMode: "confirm", confirmFlag: true, claim: { ok: true } }),
    ).toEqual({ kind: "execute" });
  });

  it("a claim that succeeded is required — a truthy-but-not-ok claim is not enough", () => {
    // Guards against a future `if (claim)` refactor.
    expect(
      decideToolConfirmation({ autoMode: "confirm", confirmFlag: true, claim: { ok: false } }),
    ).toEqual({ kind: "propose", revalidate: true });
  });

  it("first call (no flag) proposes, and is NOT flagged as a failed revalidation", () => {
    expect(decideToolConfirmation({ autoMode: "confirm", confirmFlag: undefined })).toEqual({
      kind: "propose",
      revalidate: false,
    });
  });

  it.each([[false], ["true"], [1], [null], [{}]])(
    "a non-true confirm flag (%s) proposes rather than executes",
    (flag) => {
      expect(decideToolConfirmation({ autoMode: "confirm", confirmFlag: flag })).toEqual({
        kind: "propose",
        revalidate: false,
      });
    },
  );

  it("an ok claim cannot rescue a call that never asserted confirm", () => {
    // The propose branch must not consult the claim at all.
    expect(
      decideToolConfirmation({ autoMode: "confirm", confirmFlag: undefined, claim: { ok: true } }),
    ).toEqual({ kind: "propose", revalidate: false });
  });

  it("auto executes without any proposal — the workspace already granted it", () => {
    expect(decideToolConfirmation({ autoMode: "auto", confirmFlag: undefined })).toEqual({
      kind: "execute",
    });
  });

  it("off is disabled even with a valid claim", () => {
    expect(
      decideToolConfirmation({ autoMode: "off", confirmFlag: true, claim: { ok: true } }),
    ).toEqual({ kind: "disabled" });
  });
});

describe("toolArgsHash — binds an approval to ONE action", () => {
  it("CRITICAL: the confirm flag itself does not change the hash", async () => {
    // If it did, the proposal (confirm absent) could never match the confirmation (confirm true)
    // and every confirm-gated tool would dead-end.
    const proposed = await toolArgsHash("crm_delete_contact", { contact_id: "abc" });
    const confirmed = await toolArgsHash("crm_delete_contact", { contact_id: "abc", confirm: true });
    expect(confirmed).toBe(proposed);
  });

  it("key order does not change the hash", async () => {
    const a = await toolArgsHash("member_grant_role", { role: "admin", user_id: "u1" });
    const b = await toolArgsHash("member_grant_role", { user_id: "u1", role: "admin" });
    expect(b).toBe(a);
  });

  it("nested key order does not change the hash", async () => {
    const a = await toolArgsHash("pipeline_configure", { command: { type: "x", name: "n" } });
    const b = await toolArgsHash("pipeline_configure", { command: { name: "n", type: "x" } });
    expect(b).toBe(a);
  });

  it("REGRESSION: approving one action does not approve a different one", async () => {
    const approved = await toolArgsHash("comms_buy_number", { phone_number: "+15550001111" });
    const swapped = await toolArgsHash("comms_buy_number", { phone_number: "+15559998888" });
    expect(swapped).not.toBe(approved);
  });

  it("REGRESSION: the same arguments to a different tool do not share an approval", async () => {
    const a = await toolArgsHash("n8n_archive_workflow", { id: "w1" });
    const b = await toolArgsHash("n8n_delete_workflow", { id: "w1" });
    expect(b).not.toBe(a);
  });

  it("array order is significant — it carries meaning", async () => {
    const a = await toolArgsHash("plan_create", { steps: ["one", "two"] });
    const b = await toolArgsHash("plan_create", { steps: ["two", "one"] });
    expect(b).not.toBe(a);
  });

  it("produces a hex sha-256", async () => {
    expect(await toolArgsHash("crm_create_task", { title: "t" })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("canonicalizeToolArgs", () => {
  it("drops confirm at the top level and orders keys", () => {
    expect(canonicalizeToolArgs({ b: 1, confirm: true, a: 2 })).toEqual({ a: 2, b: 1 });
    expect(Object.keys(canonicalizeToolArgs({ b: 1, a: 2 }) as object)).toEqual(["a", "b"]);
  });

  it("drops a nested field literally named confirm too", () => {
    // Deliberate: the canonicaliser is uniform, so no nesting depth can smuggle the flag in.
    expect(canonicalizeToolArgs({ outer: { confirm: true, keep: 1 } })).toEqual({
      outer: { keep: 1 },
    });
  });

  it("passes primitives and null through untouched", () => {
    expect(canonicalizeToolArgs("s")).toBe("s");
    expect(canonicalizeToolArgs(7)).toBe(7);
    expect(canonicalizeToolArgs(null)).toBe(null);
    expect(canonicalizeToolArgs(undefined)).toBe(undefined);
  });

  it("recurses through arrays without reordering them", () => {
    expect(canonicalizeToolArgs([{ b: 1, a: 2 }, "z"])).toEqual([{ a: 2, b: 1 }, "z"]);
  });
});
