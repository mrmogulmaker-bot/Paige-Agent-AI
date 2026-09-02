/**
 * Rendered proof for the PAIGE Spine #728 hotfix — a REAL Chromium driving the two flows the
 * review named: a scope switch while the rail history is in flight, and Skip failing then
 * retrying.
 *
 * WHY THIS EXISTS ALONGSIDE THE UNIT SUITES. Those suites resolve a fake promise. This one issues
 * a genuine PostgREST request through the shipped Supabase client and answers it at the network
 * layer, in the order the defect depended on — the previous scope replying AFTER the new one. If
 * the repair only worked because of how a test double was shaped, this is what would catch it.
 *
 * WHAT IT IS NOT (§13/§32): a local render is not a deployed one. No session, RLS policy, tenant
 * record or edge function is exercised. The authenticated production drive remains owed.
 *
 * Run (from the repo root, with the harness server already up on 5198):
 *   npm run harness:serve-hotfix &
 *   node scripts/live-drive/harness/spine-hotfix/drive.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readdirSync, existsSync } from "node:fs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(HERE, "artifacts");
const BASE = process.env.HARNESS_URL || "http://127.0.0.1:5198/";

const { chromium } = await import("playwright");

let passed = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`); }
};

mkdirSync(ARTIFACTS, { recursive: true });

/**
 * Resolve a Chromium the way `scripts/live-drive/live-drive.mjs` does, and for the same reason:
 * the installed Playwright and the sandbox's pre-provisioned browsers are pinned to different
 * builds, so Playwright's own default path points at a binary that is not there. Explicit
 * override first, then the provisioned full Chromium, then Playwright's bundled default.
 */
function resolveChromium() {
  if (process.env.PW_EXECUTABLE_PATH) return process.env.PW_EXECUTABLE_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  let entries = [];
  try { entries = readdirSync(root); } catch { return undefined; }
  const candidates = entries
    .filter((d) => d.startsWith("chromium-"))
    .map((d) => path.join(root, d, "chrome-linux", "chrome"))
    .filter((p) => existsSync(p));
  return candidates[0];
}

const executablePath = resolveChromium();
console.log(`chromium: ${executablePath ?? "playwright default"}`);
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
page.on("pageerror", (e) => console.log(`  [page error] ${e.message}`));

// ── Network control. The hook's history read is a real PostgREST GET; the card's skip is a real
// POST. Both are answered here, on the driver's schedule, so ordering is genuinely under test.
const railGates = new Map();   // filter value -> { resolve }
let skipAttempts = 0;
let skipShouldFail = true;

await page.route("**/rest/v1/paige_client_events**", async (route) => {
  const url = new URL(route.request().url());
  // supabase-js encodes an equality filter as `tenant_id=eq.<uuid>`.
  const raw = url.searchParams.get("tenant_id") || url.searchParams.get("contact_id") || "";
  const value = raw.replace(/^eq\./, "");
  const rows = await new Promise((resolve) => railGates.set(value, { resolve }));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(rows),
  });
});

await page.route("**/functions/v1/paige-apply-extraction", async (route) => {
  skipAttempts += 1;
  if (skipShouldFail) {
    return route.fulfill({
      status: 502, contentType: "application/json",
      body: JSON.stringify({ error: "I couldn't record that just now. Nothing was changed — try again.", retryable: true }),
    });
  }
  return route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, declined: true, applied_keys: [] }),
  });
});

/** Wait until the page has actually issued the read for `value`. */
async function awaitRead(value, timeoutMs = 15000) {
  const started = Date.now();
  while (!railGates.has(value)) {
    if (Date.now() - started > timeoutMs) throw new Error(`no read for ${value} within ${timeoutMs}ms`);
    await page.waitForTimeout(50);
  }
  return railGates.get(value);
}

function railRow(id, title) {
  return {
    id, event_kind: "owner.action_taken", surface: "your_paige", actor_type: "paige_agent",
    audience: "owner", visibility: "owner_internal", title, summary: null,
    occurred_at: "2026-09-02T10:00:00.000Z", contact_id: null,
  };
}

const railTitles = () => page.$$eval('[data-testid="rail-event"]', (els) => els.map((e) => e.textContent));
const text = () => page.textContent("body");

console.log(`\n--- rendered proof against ${BASE} (real Chromium ${browser.version()}) ---\n`);
await page.goto(BASE, { waitUntil: "domcontentloaded" });

// ── FLOW 1: a tenant switch while the previous scope's history is still in flight. ──────────────
console.log("FLOW 1 · rail scope switch mid-flight");
const readA = await awaitRead("aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa");

await page.click('[data-testid="to-b"]');                       // switch BEFORE A has answered
const readB = await awaitRead("bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb");

readB.resolve([railRow("b-1", "B activity")]);                  // B answers first
await page.waitForFunction(
  () => document.body.textContent.includes("B activity"), null, { timeout: 15000 });

readA.resolve([railRow("a-1", "A activity")]);                  // A answers late, from the old scope
await page.waitForTimeout(600);                                 // give a leak every chance to land

const titles = await railTitles();
check("1.1 the current scope's history is rendered", titles.includes("B activity"), JSON.stringify(titles));
check("1.2 the PREVIOUS scope's history never appears in it",
  !titles.includes("A activity"), JSON.stringify(titles));
check("1.3 the feed shows nothing but the current scope",
  titles.length === 1, JSON.stringify(titles));
check("1.4 the surface reports itself loaded, not stuck",
  (await page.textContent('[data-testid="rail-loaded"]')) === "true");
check("1.5 …and carries no error from the abandoned scope",
  (await page.textContent('[data-testid="rail-error"]')) === "none",
  await page.textContent('[data-testid="rail-error"]'));
await page.screenshot({ path: path.join(ARTIFACTS, "flow1-rail-scope-switch.png"), fullPage: true });

// ── FLOW 2: Skip refused by the server, then retried. ───────────────────────────────────────────
console.log("\nFLOW 2 · Skip refused, then retried");
const skipButton = () => page.locator('button:has-text("Skip all")');
check("2.0 the proposal offers Skip", await skipButton().count() === 1);

await skipButton().click();
await page.waitForFunction(() => document.body.textContent.includes("Nothing was changed"), null, { timeout: 15000 });

const afterFailure = await text();
check("2.1 the server was actually asked", skipAttempts === 1, `attempts=${skipAttempts}`);
check("2.2 the card does NOT claim the proposal was skipped",
  !afterFailure.includes("just let me know if you want to save it later"));
check("2.3 the person is told what happened, in the server's own words",
  afterFailure.includes("Nothing was changed — try again."));
check("2.4 the controls are still reachable, so it is genuinely retryable",
  await skipButton().count() === 1 && await skipButton().isEnabled());
await page.screenshot({ path: path.join(ARTIFACTS, "flow2a-skip-refused.png"), fullPage: true });

skipShouldFail = false;
await skipButton().click();
await page.waitForFunction(
  () => document.body.textContent.includes("just let me know if you want to save it later"),
  null, { timeout: 15000 });

check("2.5 the retry reached the server", skipAttempts === 2, `attempts=${skipAttempts}`);
check("2.6 only now does the card settle as skipped", await skipButton().count() === 0);
check("2.7 the stale error is gone once it succeeded",
  !(await text()).includes("Nothing was changed — try again."));
await page.screenshot({ path: path.join(ARTIFACTS, "flow2b-skip-retry-accepted.png"), fullPage: true });

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
console.log(`screenshots: ${ARTIFACTS}`);
process.exit(failures.length === 0 ? 0 : 1);
