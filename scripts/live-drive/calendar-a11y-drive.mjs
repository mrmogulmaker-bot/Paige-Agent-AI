/**
 * Accessibility audit for the Solo-native Calendar.
 *
 * Runs axe-core against the LOCAL harness mount at every required frame, in both
 * themes, and — separately — against each modal state, because a drawer's contrast,
 * naming and focus semantics are not exercised by a scan of the page behind it.
 *
 * axe-core is NOT a repository dependency and is not added as one: point AXE_PATH at
 * a standalone `axe.min.js` on disk. Without it this script exits non-zero and says
 * the audit did not run, rather than reporting a pass it never performed (§13).
 *
 *   npm pack axe-core && tar xzf axe-core-*.tgz     # anywhere outside the repo
 *   AXE_PATH=/path/to/package/axe.min.js node scripts/live-drive/calendar-a11y-drive.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_ARTIFACTS_DIR, buildLaunchOptions, resolvePlaywright } from "./live-drive.mjs";

const BASE = process.env.CAL_HARNESS_URL || "http://127.0.0.1:5200";
const AXE_PATH = process.env.AXE_PATH || "";
const OUT = path.join(DEFAULT_ARTIFACTS_DIR, "calendar-a11y");

if (!AXE_PATH || !fs.existsSync(AXE_PATH)) {
  console.error("axe-core not found. Set AXE_PATH to a standalone axe.min.js. AUDIT DID NOT RUN.");
  process.exit(2);
}

const FRAMES = [
  { name: "1536x770", width: 1536, height: 770 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "900x1000", width: 900, height: 1000 },
];
const THEMES = ["dark", "light"];
/** The WCAG tags a shipped tenant surface is held to. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function launchOptions() {
  const o = buildLaunchOptions();
  return o.proxy ? { ...o, proxy: { ...o.proxy, bypass: "127.0.0.1,localhost,::1" } } : o;
}

/** Runs axe in the page and returns only what a reader needs to act. */
async function scan(page, label) {
  const res = await page.evaluate(
    async (tags) => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
      return r.violations.map((v) => ({
        id: v.id, impact: v.impact, help: v.help, count: v.nodes.length,
        nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(" "), summary: n.failureSummary })),
      }));
    },
    TAGS,
  );
  return { label, violations: res };
}

const pw = await resolvePlaywright();
const browser = await pw.chromium.launch(launchOptions());
fs.mkdirSync(OUT, { recursive: true });

const results = [];

// Warm the dev server so a first-load pre-bundle round trip never lands mid-scan.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=dark&data=dense`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sc-root", { timeout: 30000 });
  await ctx.close();
}

for (const frame of FRAMES) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: frame.width, height: frame.height } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?theme=${theme}&data=dense`, { waitUntil: "networkidle" });
    await page.waitForSelector(".sc-root");
    await page.addScriptTag({ path: AXE_PATH });
    results.push(await scan(page, `${frame.name}-${theme}`));
    await ctx.close();
  }
}

// Modal states. A drawer sits above the surface, so its own contrast and naming are
// a separate scan, not something the page-behind scan covers.
for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=${theme}&data=dense`, { waitUntil: "networkidle" });
  await page.waitForSelector("button.sc-ev");
  await page.addScriptTag({ path: AXE_PATH });

  await page.locator("button.sc-ev").first().click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(400);
  results.push(await scan(page, `detail-drawer-${theme}`));
  await page.keyboard.press("Escape");

  await page.locator("button.sc-cog").first().click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(400);
  results.push(await scan(page, `config-drawer-${theme}`));
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /New appointment/i }).click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(400);
  results.push(await scan(page, `create-drawer-${theme}`));
  await ctx.close();
}

// Empty and failure states carry their own copy, so they carry their own contrast.
for (const data of ["empty", "error", "calendars-error"]) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=dark&data=${data}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sc-root");
  await page.addScriptTag({ path: AXE_PATH });
  results.push(await scan(page, `state-${data}`));
  await ctx.close();
}

await browser.close();

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ tags: TAGS, results }, null, 2));

const failing = results.filter((r) => r.violations.length > 0);
console.log(`scans: ${results.length} (tags: ${TAGS.join(", ")})`);
if (failing.length === 0) {
  console.log("✓ no WCAG A/AA violations in any scanned state");
  process.exit(0);
}
for (const r of failing) {
  console.log(`\n${r.label}:`);
  for (const v of r.violations) {
    console.log(`  [${v.impact}] ${v.id} — ${v.help} (${v.count} node${v.count === 1 ? "" : "s"})`);
    for (const n of v.nodes) console.log(`      ${n.target}`);
  }
}
process.exit(1);
