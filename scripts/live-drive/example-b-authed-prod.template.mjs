// scripts/live-drive/example-b-authed-prod.template.mjs
//
// EXAMPLE B — AUTH-GATED PROD LIVE-DRIVE (TEMPLATE). §32 post-deploy verification pattern.
//
// This is the shape a future capable session uses to DRIVE a deployed, auth-gated Paige surface
// itself (§32 capability-conditional post-deploy scan) instead of owing the owner's eyes. It is a
// TEMPLATE: it runs ONLY where prod is reachable from the session's env AND credentials are provided
// via environment variables. In this CI sandbox it self-skips (exit 0 with a clear message) because
// live prod was NOT reachable headless here even via the proxy — that is the honest env constraint
// (§13), not a code failure.
//
// REQUIRED ENV (never hardcode credentials):
//   LIVE_DRIVE_URL       e.g. https://paigeagent.ai/login   (the deployed surface to drive)
//   LIVE_DRIVE_EMAIL     the test-tenant login email        (a scoped test account, NOT owner PII)
//   LIVE_DRIVE_PASSWORD  the test-tenant login password
//   (optional) HTTPS_PROXY, PW_EXECUTABLE_PATH — see README.
//
// Run:  node scripts/live-drive/example-b-authed-prod.template.mjs

import { liveDrive } from "./live-drive.mjs";

const url = process.env.LIVE_DRIVE_URL;
const hasCreds = Boolean(process.env.LIVE_DRIVE_EMAIL && process.env.LIVE_DRIVE_PASSWORD);

if (!url || !hasCreds) {
  console.log(
    "↷ SKIP (template): set LIVE_DRIVE_URL + LIVE_DRIVE_EMAIL + LIVE_DRIVE_PASSWORD to run this " +
      "auth-gated live-drive. Skipping is the honest outcome when prod/creds are unavailable (§13)."
  );
  process.exit(0);
}

const result = await liveDrive({
  url,
  // Auth via the default email/password form login. Override selectors here if the real login
  // form differs, e.g. { emailSelector: '#email', passwordSelector: '#password',
  // submitSelector: '[data-testid="signin"]', successSelector: '[data-testid="command-center"]' }.
  auth: {
    successSelector: undefined, // set to a post-login element to assert the session actually opened
  },
  // Post-login interactions the crew wants to verify on the DEPLOYED surface.
  steps: async (page) => {
    // e.g. await page.goto(new URL("/command-center", page.url()).href, { waitUntil: "networkidle" });
  },
  // Adversarial assertion — throw to fail the drive. Prove the intended thing actually rendered.
  assert: async (page) => {
    const title = await page.title();
    if (!title) throw new Error("deployed surface returned an empty <title> after login");
  },
});

console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  console.error(`✗ live-drive FAILED: ${result.error}`);
  console.error(
    "  NOTE: a failure here can mean the SURFACE is broken, OR that prod is unreachable from this " +
      "env (proxy/DNS). Distinguish before reporting (§13) — do not claim a broken surface on an " +
      "env-reachability failure, and do not claim a pass that did not happen."
  );
  process.exit(1);
}
console.log(`✓ auth-gated live-drive OK — "${result.title}" · screenshot ${result.screenshotPath}`);
process.exit(0);
