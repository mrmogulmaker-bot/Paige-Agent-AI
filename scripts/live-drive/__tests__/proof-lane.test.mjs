// scripts/live-drive/__tests__/proof-lane.test.mjs
//
// Unit tests for the proof-lane PURE core + the runFlow IO shell with an INJECTED in-memory
// liveDrive double (no browser, no network, no prod — runs in CI via `node --test`). The browser
// mechanics are proved separately by ../proof-lane.selftest.mjs in the pre-provisioned sandbox.
//
// The load-bearing assertions here are the HONEST-CORE ones: a run with no credentials is
// PROOF_OWED and never launches a drive; a negative step whose guard HELD is VERIFIED; a negative
// step whose action unexpectedly SUCCEEDED fails the flow (an authority/isolation hole is never a
// pass); and no credential value survives into a record.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROOF_STATUS, STEP_EXPECT, ENV, resolveCapability, buildAttribution, classifyStep,
  computeFlowStatus, validateFlowDef, redactProofRecord, runFlow, isNegativeExpect,
} from "../proof-lane.mjs";

const CREDS = { [ENV.URL]: "https://example.test/login", [ENV.EMAIL]: "t@test", [ENV.PASSWORD]: "pw" };

test("resolveCapability: PROOF_OWED + names every missing input when creds/url absent", () => {
  const r = resolveCapability({});
  assert.equal(r.runnable, false);
  assert.equal(r.status, PROOF_STATUS.PROOF_OWED);
  for (const k of [ENV.URL, ENV.EMAIL, ENV.PASSWORD]) assert.ok(r.reason.includes(k), `names ${k}`);
});

test("resolveCapability: runnable when url+email+password all present", () => {
  const r = resolveCapability(CREDS);
  assert.equal(r.runnable, true);
});

test("buildAttribution: carries non-secret refs + build fallback, never a credential value", () => {
  const a = buildAttribution(
    { ...CREDS, [ENV.TENANT_REF]: "solo-test-tenant", [ENV.ACTOR_REF]: "solo-test-owner", GITHUB_SHA: "abc123" },
    new Date("2026-09-12T00:00:00Z"),
  );
  assert.equal(a.buildSha, "abc123");
  assert.equal(a.tenantRef, "solo-test-tenant");
  assert.equal(a.actorRef, "solo-test-owner");
  assert.equal(a.timestamp, "2026-09-12T00:00:00.000Z");
  assert.ok(!JSON.stringify(a).includes("pw"), "no password value in attribution");
});

test("classifyStep: positive render verified on ok, unverified otherwise", () => {
  assert.equal(classifyStep({ expect: STEP_EXPECT.RENDER }, { ok: true }).status, PROOF_STATUS.VERIFIED);
  assert.equal(classifyStep({ expect: STEP_EXPECT.RENDER }, { ok: false }).status, PROOF_STATUS.UNVERIFIED);
});

test("classifyStep: DENIED is VERIFIED only when a denial actually happened", () => {
  assert.equal(classifyStep({ expect: STEP_EXPECT.DENIED }, { status: 403 }).status, PROOF_STATUS.VERIFIED);
  assert.equal(classifyStep({ expect: STEP_EXPECT.DENIED }, { markers: { refused: true } }).status, PROOF_STATUS.VERIFIED);
});

test("classifyStep: DENIED that SUCCEEDED is a FAIL (authority hole), never a pass", () => {
  const v = classifyStep({ expect: STEP_EXPECT.DENIED }, { ok: true, markers: { refused: false } });
  assert.equal(v.failed, true);
  assert.notEqual(v.status, PROOF_STATUS.VERIFIED);
});

test("classifyStep: APPROVAL_REQUIRED fails if a high-risk act executed unattended", () => {
  assert.equal(classifyStep({ expect: STEP_EXPECT.APPROVAL_REQUIRED }, { markers: { approvalShown: true } }).status, PROOF_STATUS.VERIFIED);
  assert.equal(classifyStep({ expect: STEP_EXPECT.APPROVAL_REQUIRED }, { markers: { executed: true } }).failed, true);
});

test("classifyStep: account-switch isolation fails on cross-tenant bleed", () => {
  assert.equal(classifyStep({ expect: STEP_EXPECT.ACCOUNT_SWITCH_ISOLATED }, { markers: { crossTenantBleed: false } }).status, PROOF_STATUS.VERIFIED);
  assert.equal(classifyStep({ expect: STEP_EXPECT.ACCOUNT_SWITCH_ISOLATED }, { markers: { crossTenantBleed: true } }).failed, true);
});

test("classifyStep: unknown expectation is UNVERIFIED, never verified", () => {
  assert.equal(classifyStep({ expect: "not-a-real-expect" }, { ok: true }).status, PROOF_STATUS.UNVERIFIED);
});

test("classifyStep: a SEMANTIC render needs a marker — bare navigation is not a pass (§39 F1)", () => {
  // ok with no rendered marker: a plain render passes, but a semantic one stays UNVERIFIED.
  assert.equal(classifyStep({ expect: STEP_EXPECT.RENDER }, { ok: true }).status, PROOF_STATUS.VERIFIED);
  assert.equal(classifyStep({ expect: STEP_EXPECT.RENDER, semantic: true }, { ok: true }).status, PROOF_STATUS.UNVERIFIED);
  assert.equal(classifyStep({ expect: STEP_EXPECT.RENDER, semantic: true }, { ok: true, markers: { rendered: true } }).status, PROOF_STATUS.VERIFIED);
});

test("classifyStep: READBACK is UNVERIFIED without a persisted marker (guards 'Saved.' that discards)", () => {
  assert.equal(classifyStep({ expect: STEP_EXPECT.READBACK }, { ok: true }).status, PROOF_STATUS.UNVERIFIED);
  assert.equal(classifyStep({ expect: STEP_EXPECT.READBACK }, { ok: true, markers: { persisted: true } }).status, PROOF_STATUS.VERIFIED);
});

test("classifyStep: UNAVAILABLE_CONNECTION — honest degrade verifies, crash/fake fails", () => {
  assert.equal(classifyStep({ expect: STEP_EXPECT.UNAVAILABLE_CONNECTION }, { markers: { degradedHonestly: true } }).status, PROOF_STATUS.VERIFIED);
  assert.equal(classifyStep({ expect: STEP_EXPECT.UNAVAILABLE_CONNECTION }, { markers: { crashed: true } }).failed, true);
  assert.equal(classifyStep({ expect: STEP_EXPECT.UNAVAILABLE_CONNECTION }, { markers: { fakedSuccess: true } }).failed, true);
});

test("classifyStep: PROVIDER_FAILURE — reported failure verifies, faked success fails", () => {
  assert.equal(classifyStep({ expect: STEP_EXPECT.PROVIDER_FAILURE }, { markers: { reportedFailure: true } }).status, PROOF_STATUS.VERIFIED);
  assert.equal(classifyStep({ expect: STEP_EXPECT.PROVIDER_FAILURE }, { markers: { fakedSuccess: true } }).failed, true);
});

test("classifyStep: RETRY_SUCCEEDS — recovery verifies, a double effect fails", () => {
  assert.equal(classifyStep({ expect: STEP_EXPECT.RETRY_SUCCEEDS }, { markers: { recovered: true } }).status, PROOF_STATUS.VERIFIED);
  assert.equal(classifyStep({ expect: STEP_EXPECT.RETRY_SUCCEEDS }, { markers: { recovered: true, doubleEffect: true } }).failed, true);
});

test("classifyStep: CANCELLED — no-effect verifies, an effect that survived cancel fails", () => {
  assert.equal(classifyStep({ expect: STEP_EXPECT.CANCELLED }, { markers: { noEffect: true } }).status, PROOF_STATUS.VERIFIED);
  assert.equal(classifyStep({ expect: STEP_EXPECT.CANCELLED }, { markers: { noEffect: false } }).failed, true);
});

test("isNegativeExpect: guard expectations are negative, render/readback are not", () => {
  assert.equal(isNegativeExpect(STEP_EXPECT.DENIED), true);
  assert.equal(isNegativeExpect(STEP_EXPECT.RENDER), false);
});

test("computeFlowStatus: folds verdicts honestly", () => {
  const V = { status: PROOF_STATUS.VERIFIED }, O = { status: PROOF_STATUS.PROOF_OWED }, F = { failed: true, status: PROOF_STATUS.UNVERIFIED };
  assert.equal(computeFlowStatus([V, V]), PROOF_STATUS.VERIFIED);
  assert.equal(computeFlowStatus([V, F]), PROOF_STATUS.UNVERIFIED, "any failure fails the flow");
  assert.equal(computeFlowStatus([V, O]), PROOF_STATUS.PARTIAL);
  assert.equal(computeFlowStatus([O, O]), PROOF_STATUS.PROOF_OWED);
  assert.equal(computeFlowStatus([]), PROOF_STATUS.UNVERIFIED, "empty is never a pass");
});

test("validateFlowDef: catches missing fields and bad expectations", () => {
  assert.ok(validateFlowDef({}).length >= 3);
  assert.ok(validateFlowDef({ id: "f", title: "t", actor: "a", steps: [{ name: "s", expect: "bogus" }] })
    .some((p) => p.includes("bogus")));
  assert.equal(validateFlowDef({ id: "f", title: "t", actor: "a", steps: [{ name: "s", expect: STEP_EXPECT.RENDER }] }).length, 0);
});

test("redactProofRecord: strips a credential value that reached a nested string", () => {
  const out = redactProofRecord({ a: { b: "leaked pw here" }, c: ["x pw y"] }, { [ENV.PASSWORD]: "pw" });
  assert.ok(!JSON.stringify(out).includes(" pw "), "bare secret scrubbed");
  assert.ok(JSON.stringify(out).includes("***"));
});

test("runFlow: NO creds → PROOF_OWED record, and the drive is NEVER called", async () => {
  let driveCalled = false;
  const fakeDrive = async () => { driveCalled = true; return { ok: true }; };
  const flow = { id: "x", title: "X", actor: "owner", steps: [{ name: "s1", expect: STEP_EXPECT.RENDER, url: "https://x" }] };
  const rec = await runFlow(flow, { env: {}, liveDrive: fakeDrive, now: new Date("2026-09-12T00:00:00Z") });
  assert.equal(rec.status, PROOF_STATUS.PROOF_OWED);
  assert.equal(driveCalled, false, "must not launch a drive when the run is not possible");
  assert.ok(rec.reason.includes(ENV.EMAIL));
});

test("runFlow: runnable + all steps pass → VERIFIED, with attribution", async () => {
  const fakeDrive = async ({ assert: a }) => { const markers = {}; if (a) await a({}, markers); return { ok: true, status: 200, markers }; };
  // Wrap so step.assert markers flow through the default driver path.
  const flow = {
    id: "contact-create", title: "Contact create", actor: "solo-owner",
    steps: [
      { name: "create", expect: STEP_EXPECT.RENDER, drive: async () => ({ ok: true, status: 200, markers: {} }) },
      { name: "readback", expect: STEP_EXPECT.READBACK, drive: async () => ({ ok: true, markers: { persisted: true } }) },
      { name: "cross-tenant denied", expect: STEP_EXPECT.DENIED, drive: async () => ({ status: 403, markers: { refused: true } }) },
    ],
  };
  const rec = await runFlow(flow, { env: { ...CREDS, [ENV.TENANT_REF]: "solo-test-tenant", GITHUB_SHA: "deadbeef" }, liveDrive: fakeDrive });
  assert.equal(rec.status, PROOF_STATUS.VERIFIED);
  assert.equal(rec.attribution.buildSha, "deadbeef");
  assert.equal(rec.steps.length, 3);
  void fakeDrive;
});

test("runFlow: a negative step whose action SUCCEEDED fails the whole flow", async () => {
  const flow = {
    id: "leak", title: "Isolation", actor: "solo-owner",
    steps: [
      { name: "create", expect: STEP_EXPECT.RENDER, drive: async () => ({ ok: true, markers: {} }) },
      { name: "other tenant must be denied", expect: STEP_EXPECT.DENIED, drive: async () => ({ ok: true, markers: { refused: false } }) },
    ],
  };
  const rec = await runFlow(flow, { env: CREDS, liveDrive: async () => ({ ok: true }) });
  assert.equal(rec.status, PROOF_STATUS.UNVERIFIED, "an un-enforced denial is never a pass");
  assert.ok(rec.steps.find((s) => s.name.includes("denied")).failed);
});
