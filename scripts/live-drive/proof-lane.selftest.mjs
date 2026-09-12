// scripts/live-drive/proof-lane.selftest.mjs
//
// PROOF-LANE MECHANICS PROOF (§32). Runnable in the pre-provisioned sandbox (CI has no browser, so
// this is NOT a ci.yml step — its pure logic is covered by __tests__/proof-lane.test.mjs via
// `node --test`, which DOES run in CI). Mirrors example-a: it drives self-contained data: URLs (NO
// network, NO auth, NO prod data — nobody's information is touched) to prove the FRAMEWORK's
// mechanics end to end: runFlow resolves capability, drives real Chromium through liveDrive per step,
// classifies positive AND negative steps, folds a status, captures attribution, and writes a record.
//
// It also proves the two honest-core behaviors against the real runner: (1) with no creds the run is
// PROOF_OWED and launches no browser; (2) a negative "denied" step that the page does NOT refuse
// fails the flow. And it proves secret redaction strips a configured secret value from a record.
//
// Run:  node scripts/live-drive/proof-lane.selftest.mjs
// Exit: 0 = framework mechanics verified; non-zero = broken.

import { runFlow, redactProofRecord, PROOF_STATUS, STEP_EXPECT, ENV } from "./proof-lane.mjs";
import { liveDrive } from "./live-drive.mjs";

let failures = 0;
const ok = (cond, label) => { if (cond) { console.log(`  ok  ${label}`); } else { failures++; console.error(`  ✗   ${label}`); } };

// A self-contained page that renders a marker (like example-a). Used as the "surface" a step drives.
const page = (marker) =>
  "data:text/html," + encodeURIComponent(
    `<!doctype html><html><body style="margin:0;background:#0b0b14;color:#E9C989;` +
    `font:600 36px system-ui;display:grid;place-items:center;height:100vh">${marker}</body></html>`);

// Dummy, obviously-fake creds so resolveCapability returns runnable for the MECHANICS path only.
// These are not real credentials and reach no real surface (every step drives a data: URL).
const MECH_ENV = {
  [ENV.URL]: page("proof-lane base"),
  [ENV.EMAIL]: "not-a-real-account@example.test",
  [ENV.PASSWORD]: "not-a-real-password",
  [ENV.TENANT_REF]: "solo-test-tenant",
  [ENV.ACTOR_REF]: "solo-test-owner",
  GITHUB_SHA: "mech00f",
};

// A step driver that hits a data: URL through the REAL liveDrive and sets a marker from the render.
const driveData = (marker, markerOut = {}) => async () => {
  const res = await liveDrive({
    url: page(marker),
    assert: async (p) => {
      const text = await p.textContent("body");
      markerOut.rendered = Boolean(text && text.includes(marker));
    },
  });
  return { ...res, markers: markerOut };
};

console.log("proof-lane mechanics proof\n");

// 1) Runnable happy path: a positive RENDER + a negative DENIED (page returns a refusal marker).
{
  const flow = {
    id: "mech-verified", title: "mechanics: verified path", actor: "solo-test-owner",
    steps: [
      { name: "render a surface", expect: STEP_EXPECT.RENDER,
        drive: async () => { const m = {}; const r = await driveData("STEP RENDER OK", m)(); return { ...r, ok: r.ok && m.rendered }; } },
      { name: "guard refuses foreign access", expect: STEP_EXPECT.DENIED,
        drive: async () => { const r = await driveData("STEP DENIED OK")(); return { ...r, markers: { refused: true } }; } },
    ],
  };
  const rec = await runFlow(flow, { env: MECH_ENV, liveDrive });
  ok(rec.status === PROOF_STATUS.VERIFIED, `runnable flow → VERIFIED (got ${rec.status})`);
  ok(rec.attribution?.buildSha === "mech00f", "attribution carries the build SHA");
  ok(rec.attribution?.tenantRef === "solo-test-tenant", "attribution carries the tenant ref");
  ok(rec.steps.length === 2 && rec.steps[0].screenshotPath, "a real screenshot path was captured");
  ok(!JSON.stringify(rec).includes("not-a-real-password"), "no credential value in the record");
}

// 2) No-creds path: PROOF_OWED, and the browser is never launched (drive would throw if called).
{
  const flow = {
    id: "mech-owed", title: "mechanics: owed path", actor: "solo-test-owner",
    steps: [{ name: "would render", expect: STEP_EXPECT.RENDER, drive: async () => { throw new Error("must not run"); } }],
  };
  const rec = await runFlow(flow, { env: {}, liveDrive });
  ok(rec.status === PROOF_STATUS.PROOF_OWED, `no creds → PROOF_OWED (got ${rec.status})`);
  ok(rec.reason?.includes(ENV.EMAIL), "owed reason names the missing secret");
}

// 3) Negative step that did NOT refuse → the flow fails (an authority hole is never a pass).
{
  const flow = {
    id: "mech-hole", title: "mechanics: unenforced denial", actor: "solo-test-owner",
    steps: [{ name: "foreign access should be denied", expect: STEP_EXPECT.DENIED,
      drive: async () => { const r = await driveData("LEAK: served foreign data")(); return { ...r, ok: true, markers: { refused: false } }; } }],
  };
  const rec = await runFlow(flow, { env: MECH_ENV, liveDrive });
  ok(rec.status === PROOF_STATUS.UNVERIFIED, `unenforced denial → not a pass (got ${rec.status})`);
  ok(rec.steps[0].failed === true, "the un-refused denial step is marked failed");
}

// 4) Redaction barrier.
{
  const out = redactProofRecord({ note: "leaked secretval here" }, { [ENV.PASSWORD]: "secretval" });
  ok(!out.note.includes("secretval"), "redactProofRecord strips a configured secret value");
}

console.log("");
if (failures > 0) { console.error(`✗ proof-lane mechanics proof FAILED (${failures} failure(s))`); process.exit(1); }
console.log("✓ proof-lane mechanics verified — runnable/owed/negative paths, attribution, screenshot, redaction.");
process.exit(0);
