import fs from "node:fs";
import path from "node:path";
import { DEFAULT_ARTIFACTS_DIR, buildLaunchOptions, resolvePlaywright } from "./live-drive.mjs";

const BASE = process.env.MARKETPLACE_HARNESS_URL || "http://127.0.0.1:5202";
const AXE_PATH = process.env.AXE_PATH || "";
const OUT = path.join(DEFAULT_ARTIFACTS_DIR, "marketplace-a11y");
const frames = [{ name: "1536x770", width: 1536, height: 770 }, { name: "1366x768", width: 1366, height: 768 }, { name: "1024x768", width: 1024, height: 768 }, { name: "900x1000", width: 900, height: 1000 }];
const themes = ["dark", "light"];
const tabLabels = ["Today", "Browse", "Installed", "Updates"];
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

if (!AXE_PATH || !fs.existsSync(AXE_PATH)) {
  console.error("axe-core not found. Set AXE_PATH to a standalone axe.min.js. AUDIT DID NOT RUN.");
  process.exit(2);
}

const options = buildLaunchOptions();
const launch = options.proxy ? { ...options, proxy: { ...options.proxy, bypass: "127.0.0.1,localhost,::1" } } : options;
const pw = await resolvePlaywright();
const browser = await pw.chromium.launch(launch);
const results = [];
fs.mkdirSync(OUT, { recursive: true });

async function scan(page, label, scope = ".mk-workspace") {
  await page.addScriptTag({ path: AXE_PATH });
  const violations = await page.evaluate(async ({ runTags, scopeSelector }) => {
    const scopeNode = document.querySelector(scopeSelector);
    if (!scopeNode) throw new Error(`Missing axe scope: ${scopeSelector}`);
    const report = await window.axe.run(scopeNode, { runOnly: { type: "tag", values: runTags } });
    return report.violations.map(({ id, impact, help, nodes }) => ({ id, impact, help, nodes: nodes.map((node) => node.target.join(" ")) }));
  }, { runTags: tags, scopeSelector: scope });
  results.push({ label, violations });
}

for (const frame of frames) for (const theme of themes) {
  const ctx = await browser.newContext({ viewport: { width: frame.width, height: frame.height } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=${theme}&paige=folded`, { waitUntil: "networkidle" });
  await page.waitForSelector(".mk-workspace");
  for (const label of tabLabels) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await scan(page, `${frame.name}-${theme}-${label.toLowerCase()}`);
  }
  await ctx.close();
}

for (const theme of themes) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=${theme}&paige=folded`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Synthetic workflow proof/i }).click();
  await page.waitForSelector('[role="dialog"]');
  await scan(page, `detail-900x1000-${theme}`, '[role="dialog"]');
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ tags, results }, null, 2));
const failing = results.filter((result) => result.violations.length);
if (failing.length) {
  console.error(JSON.stringify({ status: "FAIL", failing }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "PASS", scans: results.length, output: OUT }, null, 2));
