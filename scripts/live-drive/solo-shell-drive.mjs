// scripts/live-drive/solo-shell-drive.mjs
//
// §32.c RENDER-FIDELITY DRIVE for the Claude Design Solo shell (src/solo/SoloApp).
//
// SoloApp is a self-contained FIXTURE SPA (no auth, no backend, no tenant resolution — the
// auth+tier mount gate lives in Admin.tsx and was §39-peer-gated separately). So this drive mounts
// the REAL merged <SoloApp/> via the throwaway harness (solo-drive.html) on a local Vite dev server
// and walks every fixture surface headlessly, screenshotting each — the render-fidelity signal a
// green build cannot give. It does NOT exercise the Vercel deploy or the Admin.tsx mount gate
// (reported honestly, §13). Reuses the live-drive helper's Chromium resolution (§18), proxy-free
// because the target is localhost.
//
// Run: (vite dev on :8080 first)  node scripts/live-drive/solo-shell-drive.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, resolveExecutablePath, DEFAULT_ARTIFACTS_DIR } from "./live-drive.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.SOLO_DRIVE_URL || "http://localhost:8080/solo-drive.html";
const OUT = DEFAULT_ARTIFACTS_DIR;
fs.mkdirSync(OUT, { recursive: true });

// Top-level nav surfaces (label = the button title in the Rail). Order per smoke script.
const SURFACES = [
  ["home", "Command Center"], ["paige", "Paige"], ["compass", "Trust Compass"],
  ["auto", "Automations"], ["clients", "Clients"], ["cal", "Calendar"],
  ["growth", "Growth"], ["analytics", "Analytics"], ["market", "Marketplace"],
  ["vault", "Business Vault"], ["integrations", "Integrations"], ["team", "Team"],
  ["setup", "Setup"],
];
// Sub-tabs to walk within a surface (surface label → [tab visible-text...]). Best-effort.
const SUBTABS = {
  "Calendar": ["Schedule", "Booking links", "Routing", "Availability", "Requests", "Settings"],
  "Command Center": ["Systems"],
  "Paige": ["Chat", "Knowledge", "Sub-Agents", "Actions", "Skills", "Paige Team"],
  "Team": ["Roster", "Directory", "Roles", "Workload", "Performance", "Activity"],
};

const report = { base: BASE, startedAt: null, surfaces: [], consoleErrors: [], pageErrors: [], ok: false };
let idx = 0;
const shot = async (page, name) => {
  const file = path.join(OUT, `solo-${String(++idx).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const bytes = fs.statSync(file).size;
  return { name, screenshot: path.basename(file), bytes };
};

const pw = await resolvePlaywright();
const executablePath = resolveExecutablePath();
const browser = await pw.chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  ...(executablePath ? { executablePath } : {}),
  // NO proxy: target is localhost (HTTPS_PROXY would break loopback).
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") report.consoleErrors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => report.pageErrors.push(String(e).slice(0, 300)));

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 45000 });
  // Proof the real SoloApp mounted (its wrapper is .paige-solo).
  await page.waitForSelector(".paige-solo", { timeout: 30000 });

  for (const [route, label] of SURFACES) {
    const s = { route, label, ok: false, shots: [], error: null };
    try {
      await page.click(`button[title="${label}"]`, { timeout: 8000 });
      await page.waitForTimeout(700);
      s.shots.push(await shot(page, route));
      // Best-effort sub-tabs
      for (const tab of (SUBTABS[label] || [])) {
        try {
          await page.locator(`main button:has-text("${tab}"), main [role="tab"]:has-text("${tab}")`).first().click({ timeout: 4000 });
          await page.waitForTimeout(450);
          s.shots.push(await shot(page, `${route}-${tab.toLowerCase().replace(/[^a-z0-9]+/g, "")}`));
        } catch (e) { s.shots.push({ name: `${route}-${tab}`, error: `subtab click failed: ${String(e).slice(0, 120)}` }); }
      }
      s.ok = true;
    } catch (e) { s.error = String(e).slice(0, 200); }
    report.surfaces.push(s);
  }

  // Dark theme on home (§23 dual-theme).
  try {
    await page.click(`button[title="Command Center"]`, { timeout: 5000 });
    await page.click(`button[title="Theme"]`, { timeout: 5000 });
    await page.waitForTimeout(500);
    report.surfaces.push({ route: "home-dark", label: "Command Center (dark)", ok: true, shots: [await shot(page, "home-dark")], error: null });
  } catch (e) { report.surfaces.push({ route: "home-dark", ok: false, error: String(e).slice(0, 200), shots: [] }); }

  report.ok = report.surfaces.filter((s) => s.ok).length >= SURFACES.length && report.pageErrors.length === 0;
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, "solo-drive-report.json"), JSON.stringify(report, null, 2));
const okCount = report.surfaces.filter((s) => s.ok).length;
const shotCount = report.surfaces.reduce((n, s) => n + s.shots.filter((x) => x.screenshot).length, 0);
console.log(`\n=== SOLO SHELL DRIVE ===`);
console.log(`surfaces ok: ${okCount}/${report.surfaces.length} · screenshots: ${shotCount} · pageErrors: ${report.pageErrors.length} · consoleErrors: ${report.consoleErrors.length}`);
for (const s of report.surfaces) console.log(`  ${s.ok ? "✓" : "✗"} ${s.route}${s.error ? "  ERROR: " + s.error : ""}`);
if (report.pageErrors.length) { console.log("PAGE ERRORS:"); report.pageErrors.forEach((e) => console.log("  ! " + e)); }
if (report.consoleErrors.length) { console.log(`CONSOLE ERRORS (first 8):`); report.consoleErrors.slice(0, 8).forEach((e) => console.log("  ~ " + e)); }
console.log(`report: ${path.join(OUT, "solo-drive-report.json")}`);
process.exit(report.ok ? 0 : 1);
