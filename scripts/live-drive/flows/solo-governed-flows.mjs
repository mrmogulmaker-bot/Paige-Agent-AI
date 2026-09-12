// scripts/live-drive/flows/solo-governed-flows.mjs
//
// The concrete governed-flow DEFINITIONS for the Solo test tenant, plus a runner entry.
//
// These are DATA (id/title/actor/tenantRef/steps) expressed in the proof-lane vocabulary. Each step
// names what the authenticated run must prove (`intent`), the surface `path` it drives (resolved
// against LIVE_DRIVE_URL — never a hardcoded prod host), and the `expect` the runner classifies.
// The negative flows (tenant isolation, approval, account switch) assert that a GUARD HELD, which is
// how they prove isolation rather than hide a hole.
//
// WHAT RUNNING THIS DOES (§13/§32.c). With the approved CI secrets set (LIVE_DRIVE_URL +
// LIVE_DRIVE_EMAIL + LIVE_DRIVE_PASSWORD for the least-privilege Solo test tenant), a capable
// session gets a real authenticated drive per flow and a VERIFIED/PARTIAL record. WITHOUT them — the
// headless CI/remote case — `runFlow` returns PROOF_OWED for every flow WITHOUT launching a browser,
// and this entry writes those owed records so the gap is visible and attributable, never a fake pass.
// A capable session fills each step's `assert(page, markers)` with the real marker logic when it
// first drives the provisioned tenant; the definitions and the honest owed records exist now.
//
// SCOPE FENCE (owner rule, 2026-09-12). No step sends, publishes, spends, bills, calls a paid
// provider, or mutates real-client data. Mutations are confined to clearly test-only records on the
// isolated Solo test tenant, each with a cleanup path. External comms/publication/payments/provider
// actions are OUTSIDE this automated proof scope unless separately authorized.

import { runFlow, writeProofRecord, summarize, STEP_EXPECT, ENV } from "../proof-lane.mjs";
import { liveDrive } from "../live-drive.mjs";

/**
 * The flow library. Each flow is a pure data definition. `path` is relative and resolved against
 * LIVE_DRIVE_URL by the authenticated run; `intent` is the assertion a capable session wires.
 */
// Every RENDER step below is `semantic: true` — its intent (a session actually opened, a contact
// was actually created, a capability claim is honest, a save actually succeeded) is NOT proven by
// mere navigation. A capable session must wire an assert that sets `markers.rendered=true` (and an
// `auth.successSelector`) for these to reach VERIFIED; until then they stay UNVERIFIED/PARTIAL, never
// a hollow pass (§39 Finding 1 / §13). Negative steps prove a guard held and need their own markers.
export const FLOWS = [
  {
    id: "contact-create-governed",
    title: "Governed contact create → readback → receipt/Rail (the reference vertical)",
    actor: "solo-test-owner",
    steps: [
      { name: "sign in to the Solo surface", expect: STEP_EXPECT.RENDER, semantic: true, path: "/login",
        intent: "the authenticated session opens for the least-privilege test owner" },
      { name: "create a test-only contact via the governed tool", expect: STEP_EXPECT.RENDER, semantic: true, path: "/command-center",
        intent: "crm_create_contact runs through the governed door; a genuine insert is reported as created (§947)" },
      { name: "fresh readback shows the contact persisted", expect: STEP_EXPECT.READBACK, path: "/clients",
        intent: "a re-read (not the toast) shows the test contact; marker persisted=true" },
      { name: "owner-visible receipt + client Rail row", expect: STEP_EXPECT.RENDER, semantic: true, path: "/clients",
        intent: "the per-client Rail row + capability-run receipt for the create are visible to the owner" },
    ],
  },
  {
    id: "tenant-isolation",
    title: "Authenticated tenant isolation — another tenant's record is denied",
    actor: "solo-test-owner",
    steps: [
      { name: "sign in to the Solo surface", expect: STEP_EXPECT.RENDER, semantic: true, path: "/login",
        intent: "the test owner's session opens" },
      { name: "attempt to read a record owned by a DIFFERENT tenant", expect: STEP_EXPECT.DENIED, path: "/clients",
        intent: "by-id access to a foreign tenant's contact is refused (401/403/empty) — marker refused=true; a SUCCESS is a §9 hole" },
    ],
  },
  {
    id: "capability-truth",
    title: "Capability truth — Paige reports honest availability, never a fabricated capability",
    actor: "solo-test-owner",
    steps: [
      { name: "sign in", expect: STEP_EXPECT.RENDER, semantic: true, path: "/login", intent: "session opens" },
      { name: "ask what Paige can do here", expect: STEP_EXPECT.RENDER, semantic: true, path: "/",
        intent: "capability_status returns live/needs_approval/needs_setup/unavailable honestly for real tools only" },
    ],
  },
  {
    id: "approval-behavior",
    title: "Approval behavior — a high-risk act is gated, nothing executes unattended",
    actor: "solo-test-owner",
    steps: [
      { name: "sign in", expect: STEP_EXPECT.RENDER, semantic: true, path: "/login", intent: "session opens" },
      { name: "ask Paige to take a high-risk governed action", expect: STEP_EXPECT.APPROVAL_REQUIRED, path: "/",
        intent: "a rendered approval card appears and the act does NOT execute until approved — marker approvalShown=true, executed=false" },
    ],
  },
  {
    id: "readback-persistence",
    title: "Readback — a saved change survives a reload, not just a toast",
    actor: "solo-test-owner",
    steps: [
      { name: "sign in", expect: STEP_EXPECT.RENDER, semantic: true, path: "/login", intent: "session opens" },
      { name: "change a test-only setting and save", expect: STEP_EXPECT.RENDER, semantic: true, path: "/settings",
        intent: "a governed write on a test-only field succeeds" },
      { name: "reload and confirm the value held", expect: STEP_EXPECT.READBACK, path: "/settings",
        intent: "fresh read shows the saved value; marker persisted=true (guards the 'Saved.' that discards the write)" },
    ],
  },
  {
    id: "retry-idempotency",
    title: "Retry — a transient failure recovers with no double effect",
    actor: "solo-test-owner",
    steps: [
      { name: "sign in", expect: STEP_EXPECT.RENDER, semantic: true, path: "/login", intent: "session opens" },
      { name: "retry a governed action after a simulated transient failure", expect: STEP_EXPECT.RETRY_SUCCEEDS, path: "/command-center",
        intent: "the retry succeeds and the idempotency key folds it to ONE effect — marker recovered=true, doubleEffect=false" },
    ],
  },
  {
    id: "account-switch-isolation",
    title: "Account switch — switching workspace shows no cross-tenant bleed",
    actor: "solo-test-owner",
    steps: [
      { name: "sign in", expect: STEP_EXPECT.RENDER, semantic: true, path: "/login", intent: "session opens" },
      { name: "switch the active workspace and re-read", expect: STEP_EXPECT.ACCOUNT_SWITCH_ISOLATED, path: "/command-center",
        intent: "after the switch, no record from the prior tenant is visible — marker crossTenantBleed=false" },
    ],
  },
];

/** Resolve each step's relative `path` against the configured base URL for the authenticated run. */
function withResolvedUrls(flow, baseUrl) {
  if (!baseUrl) return flow;
  const base = baseUrl.replace(/\/+$/, "");
  return { ...flow, steps: flow.steps.map((s) => ({ ...s, url: s.path ? base + s.path : s.url })) };
}

/** Run every flow and write its proof record. Honest: PROOF_OWED when this session cannot drive. */
export async function runAll(env = process.env) {
  const baseUrl = env[ENV.URL];
  const records = [];
  for (const def of FLOWS) {
    const rec = await runFlow(withResolvedUrls(def, baseUrl), { env, liveDrive });
    const out = writeProofRecord(rec);
    records.push({ rec, out });
    console.log(summarize(rec) + `  → ${out}`);
  }
  return records;
}

// Entry: `node scripts/live-drive/flows/solo-governed-flows.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  const records = await runAll();
  const verified = records.filter((r) => r.rec.status === "VERIFIED").length;
  const owed = records.filter((r) => r.rec.status === "PROOF_OWED").length;
  console.log(`\nproof-lane: ${records.length} flows · VERIFIED ${verified} · PROOF_OWED ${owed}`);
  if (owed > 0 && verified === 0) {
    console.log(
      "↷ All flows PROOF_OWED — no authenticated run was possible in this session. This is the honest\n" +
      "  outcome (§13) when the Solo test tenant creds are not set / the surface is unreachable headless.\n" +
      "  Unblock: provision the least-privilege Solo test tenant and set LIVE_DRIVE_URL + LIVE_DRIVE_EMAIL +\n" +
      "  LIVE_DRIVE_PASSWORD in the approved CI secret mechanism, then re-run from a capable session.",
    );
  }
  // Exit 0 regardless: an owed proof is a truthful record, not a build failure. A capable session's
  // run turns PROOF_OWED into VERIFIED/PARTIAL and a real failure there exits non-zero via its own gate.
  process.exit(0);
}
