// scripts/live-drive/proof-lane.mjs
//
// PROOF LANE — the reusable authenticated-proof framework (Paige Runtime Harness, Layer G).
//
// WHY THIS EXISTS. There are ~40 bespoke `*-drive.mjs` scripts, each hand-rolling a `liveDrive`
// call, its own assertions, and its own ad-hoc pass/skip logic. There was no shared way to (a)
// DEFINE an authenticated governed flow as data, (b) attach build/tenant/actor/timestamp
// attribution to its evidence, (c) report a TRUTHFUL proof status from one vocabulary, or (d)
// express the negative paths (denied authority, missing approval, unavailable connection, failed
// provider, retry, cancellation, account-switch) as first-class, assertable steps. This module is
// that shared layer. It EXTENDS `live-drive.mjs` (§18/§30 — it calls `liveDrive`, it never forks
// the Chromium launch/resolve dance).
//
// THE HONEST CORE (§13/§32/§32.c). The single most important property: `runFlow` returns VERIFIED
// only when a real authenticated drive actually executed AND every assertion (positive and
// negative) passed. When this session lacks the capability to run it — no credentials, target
// unreachable, no browser — it returns PROOF_OWED with the exact missing capability named, and it
// does NOT launch a browser against prod (a reachability failure would muddy the signal). A
// reachability failure is never reported as a broken surface, and a missing capability is never
// reported as a pass. Absence of proof is reported as absence, never as proof.
//
// SECRET HYGIENE (owner rule, 2026-09-12). Credentials live ONLY in the approved CI secret env
// (`LIVE_DRIVE_EMAIL` / `LIVE_DRIVE_PASSWORD`). This module never reads their VALUES into a proof
// record — attribution carries only non-secret REFERENCES (a tenant label, an actor label, the
// build SHA). `redactProofRecord` is a defense-in-depth barrier that strips any configured secret
// value that somehow reached a record before it is written or logged.
//
// PURE / IO SPLIT (so CI can prove the logic without a browser). Everything that decides a verdict
// is a pure function (`resolveCapability`, `buildAttribution`, `classifyStep`, `computeFlowStatus`,
// `validateFlowDef`, `redactProofRecord`) and is unit-tested under `__tests__/proof-lane.test.mjs`
// via `node --test` (no browser, runs in CI). `runFlow` is the thin IO shell that wires those pure
// functions to an injected `liveDrive` — the unit test injects an in-memory double; the real
// entrypoints inject the real helper. The browser mechanics are proved separately by
// `proof-lane.selftest.mjs` in the pre-provisioned sandbox (CI has no browser — §README).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROOF_DIR = path.join(__dirname, "artifacts", "proof-lane");

/**
 * The ONE proof-status vocabulary. A flow, and each of its steps, reports exactly one of these.
 * Ordered from strongest to weakest so `computeFlowStatus` can fold a set of step verdicts.
 */
export const PROOF_STATUS = Object.freeze({
  VERIFIED: "VERIFIED", // ran, asserted, passed — with evidence captured
  PARTIAL: "PARTIAL", // some steps verified, at least one owed/unavailable (none failed)
  PROOF_OWED: "PROOF_OWED", // could run, but this session lacked the capability (creds/reachability/browser)
  UNAVAILABLE: "UNAVAILABLE", // cannot run: a required contract/surface does not exist yet (honest absence)
  UNVERIFIED: "UNVERIFIED", // not attempted / unknown — the default, never a silent pass
});
const ALL_STATUSES = new Set(Object.values(PROOF_STATUS));

/**
 * The expectation vocabulary a flow step declares. Positive expectations assert the surface DID the
 * thing; negative expectations assert a guard HELD (the denial/interruption actually occurred) —
 * which is exactly how a negative test proves isolation rather than hiding a hole.
 */
export const STEP_EXPECT = Object.freeze({
  RENDER: "render", // the surface renders / the action succeeds (positive)
  READBACK: "readback", // a fresh re-read shows the change persisted (positive)
  DENIED: "denied", // authority refused (401/403/explicit refusal) — a denial that MUST happen
  APPROVAL_REQUIRED: "approval_required", // a high-risk act is gated: an approval card appears, nothing executes
  UNAVAILABLE_CONNECTION: "unavailable_connection", // a missing provider/connection degrades honestly, no crash
  PROVIDER_FAILURE: "provider_failure", // an external failure is reported as failure, never a faked success
  RETRY_SUCCEEDS: "retry_succeeds", // a transient failure recovers on retry (idempotent, no double effect)
  CANCELLED: "cancelled", // a cancelled action leaves no effect
  ACCOUNT_SWITCH_ISOLATED: "account_switch_isolated", // switching actor/tenant shows no cross-tenant bleed
});
const NEGATIVE_EXPECTS = new Set([
  STEP_EXPECT.DENIED,
  STEP_EXPECT.APPROVAL_REQUIRED,
  STEP_EXPECT.UNAVAILABLE_CONNECTION,
  STEP_EXPECT.PROVIDER_FAILURE,
  STEP_EXPECT.CANCELLED,
  STEP_EXPECT.ACCOUNT_SWITCH_ISOLATED,
]);
const ALL_EXPECTS = new Set(Object.values(STEP_EXPECT));

/** The env var NAMES this lane reads. Values are never copied into a record (§ secret hygiene). */
export const ENV = Object.freeze({
  EMAIL: "LIVE_DRIVE_EMAIL",
  PASSWORD: "LIVE_DRIVE_PASSWORD",
  URL: "LIVE_DRIVE_URL",
  TENANT_REF: "LIVE_DRIVE_TENANT_REF", // a NON-secret label, e.g. "solo-test-tenant" — never a secret
  ACTOR_REF: "LIVE_DRIVE_ACTOR_REF", // a NON-secret label, e.g. "solo-test-owner" — never a secret
  BUILD_SHA: "LIVE_DRIVE_BUILD_SHA",
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PURE CORE — no IO, no browser. Unit-tested in CI.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Decide whether THIS session can run an authenticated flow, purely from the env it was given.
 * Returns the honest status when it cannot — never a guess that it can. Browser presence and target
 * reachability are NOT knowable purely (they are IO); `runFlow` downgrades to PROOF_OWED at IO time
 * if the launch or navigation fails for an environment reason, so a pure "runnable: true" here means
 * only "the inputs a run needs are present", not "a run will certainly succeed".
 */
export function resolveCapability(env = {}) {
  const missing = [];
  if (!env[ENV.URL]) missing.push(ENV.URL);
  if (!env[ENV.EMAIL]) missing.push(ENV.EMAIL);
  if (!env[ENV.PASSWORD]) missing.push(ENV.PASSWORD);
  if (missing.length > 0) {
    return {
      runnable: false,
      status: PROOF_STATUS.PROOF_OWED,
      reason:
        `authenticated run owed: missing ${missing.join(", ")}. Provision the least-privilege Solo ` +
        `test tenant + set these in the approved CI secret mechanism (never printed/committed/logged).`,
    };
  }
  return { runnable: true, status: PROOF_STATUS.UNVERIFIED, reason: "inputs present; run to determine" };
}

/**
 * Build the evidence attribution block. Carries only NON-secret references: the build identity, a
 * tenant label, an actor label, the environment kind, and a timestamp. It deliberately reads no
 * credential value. `buildSha` falls back across the CI providers Paige uses.
 */
export function buildAttribution(env = {}, now = new Date()) {
  const buildSha =
    env[ENV.BUILD_SHA] || env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || null;
  return {
    buildSha: buildSha || "unknown",
    tenantRef: env[ENV.TENANT_REF] || "unspecified-test-tenant",
    actorRef: env[ENV.ACTOR_REF] || "unspecified-test-actor",
    targetConfigured: Boolean(env[ENV.URL]),
    env: env.GITHUB_ACTIONS ? "ci" : env.LIVE_DRIVE_ENV || "local",
    timestamp: now.toISOString(),
  };
}

/**
 * Classify ONE step's verdict from its declared expectation and what the drive observed.
 * `observed` is `{ ok, status, error, markers }` where `markers` is a small set of boolean flags an
 * assert callback set (e.g. `{ refused: true }`) — never page text, so no content/secret leaks in.
 *
 * The asymmetry is the point: a NEGATIVE expectation is VERIFIED only when the guard demonstrably
 * held (e.g. a `denied` step that observed a refusal). A negative step whose action unexpectedly
 * SUCCEEDED is a FAIL — that is a real authority/isolation defect, not a pass.
 */
export function classifyStep(step, observed = {}) {
  const expect = step?.expect;
  if (!ALL_EXPECTS.has(expect)) {
    return { status: PROOF_STATUS.UNVERIFIED, note: `unknown expectation "${expect}"` };
  }
  const m = observed.markers || {};

  switch (expect) {
    case STEP_EXPECT.RENDER:
      if (!observed.ok) return { status: PROOF_STATUS.UNVERIFIED, note: observed.error || "did not render" };
      // A step whose intent requires proving something BEYOND mere reachability — a login actually
      // opened a session, a create actually happened, a capability claim is honest — is marked
      // `semantic: true`. It is VERIFIED only when its assert set an affirmative `markers.rendered`.
      // Bare navigation success on a semantic step stays UNVERIFIED, so a silently-failed login or
      // an unchecked claim can never fold to a hollow VERIFIED (§13, §39 Finding 1). Set
      // `auth.successSelector` and/or an assert that sets `markers.rendered=true` to satisfy it.
      if (step.semantic === true && m.rendered !== true)
        return { status: PROOF_STATUS.UNVERIFIED, note: "semantic assertion owed: navigation alone does not prove this step; wire an assert that sets markers.rendered" };
      return { status: PROOF_STATUS.VERIFIED, note: "rendered/succeeded" };
    case STEP_EXPECT.READBACK:
      return observed.ok && m.persisted === true
        ? { status: PROOF_STATUS.VERIFIED, note: "change persisted on fresh read" }
        : { status: PROOF_STATUS.UNVERIFIED, note: observed.error || "persistence not confirmed" };
    case STEP_EXPECT.DENIED:
      // A denial MUST have happened. A success here is a real authority hole.
      if (m.refused === true || observed.status === 401 || observed.status === 403)
        return { status: PROOF_STATUS.VERIFIED, note: "authority refused as required" };
      if (m.refused === false || observed.ok === true)
        return { status: PROOF_STATUS.UNVERIFIED, note: "FAIL: action was NOT denied (authority hole)", failed: true };
      return { status: PROOF_STATUS.UNVERIFIED, note: observed.error || "denial not observed" };
    case STEP_EXPECT.APPROVAL_REQUIRED:
      if (m.approvalShown === true && m.executed !== true)
        return { status: PROOF_STATUS.VERIFIED, note: "approval gate held; nothing executed unattended" };
      if (m.executed === true)
        return { status: PROOF_STATUS.UNVERIFIED, note: "FAIL: high-risk act executed without approval", failed: true };
      return { status: PROOF_STATUS.UNVERIFIED, note: observed.error || "approval behavior not observed" };
    case STEP_EXPECT.UNAVAILABLE_CONNECTION:
      if (m.degradedHonestly === true && m.crashed !== true)
        return { status: PROOF_STATUS.VERIFIED, note: "missing connection degraded honestly" };
      if (m.crashed === true || m.fakedSuccess === true)
        return { status: PROOF_STATUS.UNVERIFIED, note: "FAIL: crashed or faked success on missing connection", failed: true };
      return { status: PROOF_STATUS.UNVERIFIED, note: observed.error || "degrade behavior not observed" };
    case STEP_EXPECT.PROVIDER_FAILURE:
      if (m.reportedFailure === true && m.fakedSuccess !== true)
        return { status: PROOF_STATUS.VERIFIED, note: "provider failure reported, not faked" };
      if (m.fakedSuccess === true)
        return { status: PROOF_STATUS.UNVERIFIED, note: "FAIL: provider failure reported as success", failed: true };
      return { status: PROOF_STATUS.UNVERIFIED, note: observed.error || "failure handling not observed" };
    case STEP_EXPECT.RETRY_SUCCEEDS:
      if (m.recovered === true && m.doubleEffect !== true)
        return { status: PROOF_STATUS.VERIFIED, note: "retry recovered with no double effect" };
      if (m.doubleEffect === true)
        return { status: PROOF_STATUS.UNVERIFIED, note: "FAIL: retry caused a double effect", failed: true };
      return { status: PROOF_STATUS.UNVERIFIED, note: observed.error || "retry behavior not observed" };
    case STEP_EXPECT.CANCELLED:
      if (m.noEffect === true)
        return { status: PROOF_STATUS.VERIFIED, note: "cancelled action left no effect" };
      if (m.noEffect === false)
        return { status: PROOF_STATUS.UNVERIFIED, note: "FAIL: cancelled action still took effect", failed: true };
      return { status: PROOF_STATUS.UNVERIFIED, note: observed.error || "cancellation not observed" };
    case STEP_EXPECT.ACCOUNT_SWITCH_ISOLATED:
      if (m.crossTenantBleed === false)
        return { status: PROOF_STATUS.VERIFIED, note: "no cross-tenant bleed after account switch" };
      if (m.crossTenantBleed === true)
        return { status: PROOF_STATUS.UNVERIFIED, note: "FAIL: cross-tenant data visible after switch", failed: true };
      return { status: PROOF_STATUS.UNVERIFIED, note: observed.error || "isolation not observed" };
    default:
      return { status: PROOF_STATUS.UNVERIFIED, note: "unhandled expectation" };
  }
}

/** True when a step expectation is a negative/guard assertion (used by docs + the runner summary). */
export function isNegativeExpect(expect) {
  return NEGATIVE_EXPECTS.has(expect);
}

/**
 * Fold per-step verdicts into one flow status. A single failed step fails the flow (→ UNVERIFIED,
 * its verdict surfaced). All-verified is VERIFIED. All-owed is PROOF_OWED. All-unavailable is
 * UNAVAILABLE. Any mix that contains ≥1 VERIFIED and ≥1 weaker-but-unfailed verdict (PROOF_OWED,
 * UNAVAILABLE, or a plain UNVERIFIED such as a semantic step whose assert was not wired) is PARTIAL —
 * strictly weaker than VERIFIED, so a mix never overclaims a pass. Empty/all-unknown is UNVERIFIED.
 */
export function computeFlowStatus(stepResults = []) {
  if (!Array.isArray(stepResults) || stepResults.length === 0) return PROOF_STATUS.UNVERIFIED;
  if (stepResults.some((r) => r.failed === true)) return PROOF_STATUS.UNVERIFIED;
  const statuses = stepResults.map((r) => r.status);
  const every = (s) => statuses.every((x) => x === s);
  if (every(PROOF_STATUS.VERIFIED)) return PROOF_STATUS.VERIFIED;
  if (every(PROOF_STATUS.PROOF_OWED)) return PROOF_STATUS.PROOF_OWED;
  if (every(PROOF_STATUS.UNAVAILABLE)) return PROOF_STATUS.UNAVAILABLE;
  if (statuses.some((s) => s === PROOF_STATUS.VERIFIED)) return PROOF_STATUS.PARTIAL;
  if (statuses.some((s) => s === PROOF_STATUS.PROOF_OWED)) return PROOF_STATUS.PROOF_OWED;
  return PROOF_STATUS.UNVERIFIED;
}

/** Structural validation of a flow definition. Returns a list of problems (empty = valid). */
export function validateFlowDef(flow) {
  const problems = [];
  if (!flow || typeof flow !== "object") return ["flow must be an object"];
  if (!flow.id || typeof flow.id !== "string") problems.push("flow.id (string) is required");
  if (!flow.title || typeof flow.title !== "string") problems.push("flow.title (string) is required");
  if (!flow.actor || typeof flow.actor !== "string") problems.push("flow.actor (string) is required");
  if (!Array.isArray(flow.steps) || flow.steps.length === 0) problems.push("flow.steps must be a non-empty array");
  for (const [i, step] of (flow.steps || []).entries()) {
    if (!step || typeof step !== "object") { problems.push(`step[${i}] must be an object`); continue; }
    if (!step.name) problems.push(`step[${i}].name is required`);
    if (!ALL_EXPECTS.has(step.expect)) problems.push(`step[${i}].expect "${step.expect}" is not a known expectation`);
  }
  return problems;
}

/**
 * Strip any configured secret VALUE from a proof record before it is written or logged. Records are
 * built to contain no secrets; this is the defense-in-depth barrier (§ secret hygiene, mirrors
 * live-drive's `redactSecrets`). Returns a deep-cloned, scrubbed copy.
 */
export function redactProofRecord(record, env = process.env) {
  const secrets = [env[ENV.PASSWORD], env[ENV.EMAIL]].filter((s) => typeof s === "string" && s.length > 0);
  const scrub = (v) => {
    if (typeof v === "string") {
      let out = v;
      for (const s of secrets) out = out.split(s).join("***");
      return out;
    }
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === "object") {
      const o = {};
      for (const [k, val] of Object.entries(v)) o[k] = scrub(val);
      return o;
    }
    return v;
  };
  return scrub(record);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// IO SHELL — wires the pure core to an injected `liveDrive`. Browser mechanics proved by the
// sandbox selftest; the runnable path is unit-tested via an in-memory `liveDrive` double.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Run a flow definition and return a truthful proof record. `deps.liveDrive` is injected so the
 * logic is testable without a browser; `deps.env` defaults to `process.env`; `deps.now` to the
 * clock. When `resolveCapability` says the run is not possible, returns a PROOF_OWED record WITHOUT
 * launching a browser (a reachability failure must not be mistaken for a broken surface).
 */
export async function runFlow(flow, deps = {}) {
  const env = deps.env || process.env;
  const liveDrive = deps.liveDrive; // required for a runnable flow; absent is fine for a PROOF_OWED record
  const now = deps.now || new Date();

  const attribution = buildAttribution(env, now);
  const problems = validateFlowDef(flow);
  if (problems.length > 0) {
    return redactProofRecord(
      { flowId: flow?.id || "invalid", title: flow?.title || null, status: PROOF_STATUS.UNVERIFIED,
        attribution, steps: [], problems },
      env,
    );
  }

  const cap = resolveCapability(env);
  if (!cap.runnable) {
    // Honest absence of proof — do NOT launch a browser against an unreachable/credential-less target.
    return redactProofRecord(
      { flowId: flow.id, title: flow.title, actor: flow.actor, tenantRef: attribution.tenantRef,
        status: PROOF_STATUS.PROOF_OWED, reason: cap.reason, attribution,
        steps: flow.steps.map((s) => ({ name: s.name, expect: s.expect, negative: isNegativeExpect(s.expect),
          status: PROOF_STATUS.PROOF_OWED, note: "owed — authenticated run not possible in this session" })) },
      env,
    );
  }

  if (typeof liveDrive !== "function") {
    return redactProofRecord(
      { flowId: flow.id, title: flow.title, status: PROOF_STATUS.UNVERIFIED, attribution,
        steps: [], problems: ["runFlow needs deps.liveDrive to execute a runnable flow"] },
      env,
    );
  }

  const steps = [];
  for (const step of flow.steps) {
    let observed;
    try {
      // Each step either drives a URL (default form login handled by liveDrive via env auth) or runs
      // a caller-supplied `drive(page)` — both return an `observed` shape. A step's `assert` sets
      // boolean markers ONLY (never page text), keeping the record content/secret-free.
      observed = await step.drive?.({ liveDrive, env, flow, step }) ??
        await defaultStepDrive(step, { liveDrive, env });
    } catch (e) {
      observed = { ok: false, error: String(e?.message || e), markers: {} };
    }
    const verdict = classifyStep(step, observed);
    steps.push({
      name: step.name, expect: step.expect, negative: isNegativeExpect(step.expect),
      status: verdict.status, failed: Boolean(verdict.failed), note: verdict.note,
      // Evidence pointers only — never page content.
      screenshotPath: observed.screenshotPath ?? null, httpStatus: observed.status ?? null,
    });
  }

  const status = computeFlowStatus(steps);
  return redactProofRecord(
    { flowId: flow.id, title: flow.title, actor: flow.actor, tenantRef: attribution.tenantRef,
      status, attribution, steps },
    env,
  );
}

/** Default step driver: navigate `step.url` with env auth and let `step.assert(page)` set markers. */
async function defaultStepDrive(step, { liveDrive, env }) {
  if (!step.url) return { ok: false, error: "step has no url and no drive()", markers: {} };
  const markers = {};
  const res = await liveDrive({
    url: step.url,
    auth: env[ENV.EMAIL] && env[ENV.PASSWORD] ? {} : undefined,
    assert: step.assert ? async (page) => { await step.assert(page, markers); } : undefined,
    screenshotPath: step.screenshotPath,
  });
  return { ...res, markers };
}

/** Write a proof record to disk (gitignored artifacts by default). Returns the path written. */
export function writeProofRecord(record, dir = DEFAULT_PROOF_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  const safe = String(record.flowId || "flow").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80);
  const out = path.join(dir, `${safe}.proof.json`);
  fs.writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
  return out;
}

/** A compact one-line summary safe to log (status + counts only; no page content, no secrets). */
export function summarize(record) {
  const byStatus = {};
  for (const s of record.steps || []) byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  const counts = Object.entries(byStatus).map(([k, v]) => `${k}:${v}`).join(" ");
  return `proof-lane[${record.flowId}] status=${record.status} build=${record.attribution?.buildSha ?? "?"} ` +
    `tenant=${record.attribution?.tenantRef ?? "?"} steps(${record.steps?.length ?? 0}) ${counts}`.trim();
}

export default { PROOF_STATUS, STEP_EXPECT, ENV, resolveCapability, buildAttribution, classifyStep,
  isNegativeExpect, computeFlowStatus, validateFlowDef, redactProofRecord, runFlow, writeProofRecord, summarize };
