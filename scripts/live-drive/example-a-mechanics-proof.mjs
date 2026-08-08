// scripts/live-drive/example-a-mechanics-proof.mjs
//
// EXAMPLE A — HELPER MECHANICS PROOF (§32). Runnable in this CI sandbox.
//
// Drives a self-contained data: URL (NO network, NO auth, NO prod data — nobody's information is
// touched) purely to prove the helper's mechanics: playwright resolves, Chromium launches with the
// sandbox executable + args, a page renders, an assertion runs, and a real PNG is written to the
// gitignored artifacts dir. A data: URL is guaranteed reachable regardless of the agent proxy, so a
// GREEN here isolates "the helper works" from "prod is reachable from this env" (the latter is
// env-dependent and honestly not guaranteed — see README).
//
// Run:  node scripts/live-drive/example-a-mechanics-proof.mjs
// Exit: 0 = helper mechanics verified (launch → navigate → assert → screenshot); non-zero = broken.

import { liveDrive } from "./live-drive.mjs";

const MARKER = "Paige Live-Drive Helper OK";
const HTML = `<!doctype html><html><body style="margin:0;background:#0b0b14;color:#E9C989;
  font:600 40px system-ui;display:grid;place-items:center;height:100vh">${MARKER}</body></html>`;
const dataUrl = "data:text/html," + encodeURIComponent(HTML);

const result = await liveDrive({
  url: dataUrl,
  assert: async (page) => {
    const text = await page.textContent("body");
    if (!text || !text.includes(MARKER)) {
      throw new Error(`expected marker "${MARKER}" not found in rendered body`);
    }
  },
});

console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  console.error(`✗ helper mechanics FAILED: ${result.error}`);
  process.exit(1);
}
if (!result.bytes || result.bytes < 1000) {
  console.error(`✗ screenshot came back empty/tiny (${result.bytes ?? 0} bytes)`);
  process.exit(1);
}
console.log(
  `✓ helper mechanics verified — ${result.bytes}-byte PNG at ${result.screenshotPath} ` +
    `(executablePath resolved: ${result.executableResolved}, proxy wired: ${result.proxied})`
);
process.exit(0);
