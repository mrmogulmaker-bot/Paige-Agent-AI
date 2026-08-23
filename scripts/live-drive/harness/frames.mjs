#!/usr/bin/env node
/**
 * frames — render the operator console and hand the owner something to LOOK at.
 *
 * WHY THIS EXISTS SEPARATELY FROM shell-harness.mjs. The harness answers "does it measure
 * correctly?" This answers "does it READ as the design?" — and that is the one question no check
 * in this repo owns. The console shipped painted in the wrong system with tsc, eslint and the
 * harness all green: every gate was correct inside its own jurisdiction, and none of them was
 * responsible for whether it was the right design. A screenshot caught it.
 *
 * THE FONT PROBLEM, WHICH IS THE WHOLE POINT. The faces load from Google Fonts. The harness
 * aborts every request that is not file://, so a frame taken through it would render in fallback
 * system faces — and a frame that shows the wrong typeface BECAUSE THE CAPTURE BLOCKED THE CDN
 * is worse than no frame, since the reader cannot tell that from a real regression. So the font
 * hosts are allowed, and then the frame does not TRUST that: it asks `document.fonts.check`
 * whether each intended face actually painted, and burns the answer into the image. A frame that
 * silently lost its typeface would otherwise look exactly like a port that never applied it.
 *
 * Everything else off-origin is still aborted, so a stray Supabase call fails loudly.
 *
 * The label is burned in AFTER measurement, and the run refuses to write an unlabelled frame —
 * metadata dies the moment an image is pasted into a conversation, which is how a mislabelled
 * theme frame reached the owner once already.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  aaAgainstEnv, collapseOrder, goldOnlyOnAct, minWidthZero,
  noDocumentScrollbar, shellGrid, slotsInOrder, spineFloor, typeLadder,
} from "./assertions.mjs";

const ART = path.resolve(import.meta.dirname, "../artifacts/frames");
const BASE = process.env.FRAMES_URL || "http://127.0.0.1:5199";
const SLOTS = ["fleet", "relationships", "campaigns", "marketplace", "analytics", "settings"];

/** The pack's faces. `editorial` is listed so its ABSENCE is reported rather than assumed away. */
const FACES = [
  ["Schibsted Grotesk", "display + UI"],
  ["JetBrains Mono", "data"],
  ["Gambetta", "editorial"],
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "api.fontshare.com"];

function chromePath() {
  if (process.env.PW_EXECUTABLE_PATH) return process.env.PW_EXECUTABLE_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  return fs.readdirSync(base).filter((d) => d.startsWith("chromium-"))
    .map((d) => path.join(base, d, "chrome-linux/chrome")).find((p) => fs.existsSync(p));
}

async function frame(browser, { at, theme, width, height = 1000, name, note, press }) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  const origin = new URL(BASE).origin;
  await ctx.route("**://**", (r) => {
    const u = r.request().url();
    if (u.startsWith(origin) || u.startsWith("file://")) return r.continue();
    if (FONT_HOSTS.some((h) => u.includes(h))) return r.continue();
    return r.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`${BASE}/?at=${encodeURIComponent(at)}&theme=${theme}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  // `press` drives a real interaction before capture — the command palette is only visible in
  // its open state, and a frame of the closed bar cannot show what landed in the row.
  if (press) { await page.keyboard.press(press); await page.waitForTimeout(450); }

  // Which faces ACTUALLY painted. Asked of the browser, never inferred from the <link> tags —
  // a stylesheet can 200 and the face still not be applied to a single element.
  const faces = await page.evaluate((wanted) => {
    const loaded = {};
    for (const [family] of wanted) loaded[family] = document.fonts.check(`14px "${family}"`);
    const used = new Set();
    for (const el of document.querySelectorAll("*")) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      used.add(cs.fontFamily.split(",")[0].replace(/["']/g, "").trim());
    }
    return { loaded, used: [...used].sort() };
  }, FACES);

  // MEASURE FIRST — before the label exists. collapseOrder resizes, so it runs last of all.
  const checks = {
    slots: await slotsInOrder(page, SLOTS),
    grid: await shellGrid(page),
    minWidth: await minWidthZero(page),
    scrollbar: await noDocumentScrollbar(page),
    contrast: await aaAgainstEnv(page),
    spineFloor: await spineFloor(page),
    typeLadder: await typeLadder(page),
    goldOnlyOnAct: await goldOnlyOnAct(page),
  };
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(400);

  // MEASURE the geometry at the capture width. The first version of this took a hand-written
  // `note` ("collapse: spine 0, rail 72, band thinned") and burned it into the frame — and at
  // 900px the shell had NOT collapsed, so the image carried a confident false caption over a
  // render that showed the opposite. An asserting label on a visual artifact is worse than no
  // label: the reader has no way to tell it apart from a measured one. The note is now derived.
  const geo = await page.evaluate(() => {
    const grid = document.querySelector("[data-shell-grid]");
    const band = document.querySelector("[data-scope-band]");
    const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").map((v) => Math.round(parseFloat(v))) : [];
    return { cols, band: band ? Math.round(band.getBoundingClientRect().height) : null };
  });
  const [rail, , spine] = geo.cols.length >= 3 ? geo.cols : [null, null, null];
  const geoNote = geo.cols.length
    ? `rail ${rail}px · spine ${spine}px · band ${geo.band}px`
    : "grid not found";

  const missing = FACES.filter(([f]) => !faces.loaded[f]).map(([f]) => f);
  const label = `harness render · not live   ${at}   ${theme}   ${width}×${height}` +
    (missing.length ? `   ⚠ FACE NOT LOADED: ${missing.join(", ")}` : "   faces ok") +
    `   ${geoNote}` + (note ? `   ${note}` : "");

  await page.evaluate((text) => {
    const el = document.createElement("div");
    el.textContent = text;
    el.setAttribute("data-harness-label", "");
    Object.assign(el.style, {
      position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "2147483647",
      background: "repeating-linear-gradient(45deg,#7a1020,#7a1020 12px,#5c0c18 12px,#5c0c18 24px)",
      color: "#fff", font: "700 11px/26px ui-monospace,monospace", letterSpacing: ".08em",
      textAlign: "center", textTransform: "uppercase", pointerEvents: "none",
    });
    document.body.appendChild(el);
  }, label);

  const ok = await page.evaluate(() => {
    const el = document.querySelector("[data-harness-label]");
    if (!el) return null;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return { w: Math.round(r.width), h: Math.round(r.height),
      on: r.bottom <= innerHeight + 1 && r.top >= 0 && r.width > 0 && r.height > 0,
      vis: cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.9 };
  });
  if (!ok || !ok.on || !ok.vis || ok.w < width * 0.9) {
    throw new Error(`refusing to write an unlabelled frame: ${JSON.stringify(ok)}`);
  }

  fs.mkdirSync(ART, { recursive: true });
  const file = path.join(ART, `${name}.png`);
  await page.screenshot({ path: file });

  // collapseOrder LAST, after the frame is on disk — it sweeps the viewport, so running it
  // before the capture would photograph whatever width it happened to leave behind.
  checks.collapseOrder = await collapseOrder(page);
  await ctx.close();

  const failed = Object.entries(checks).filter(([, v]) => !v.ok).map(([k]) => k);
  return { file, name, at, theme, width, faces, geo, checks, failed, errors };
}

const browser = await chromium.launch(chromePath() ? { executablePath: chromePath() } : {});
const plan = [
  { name: "1-directory-dark-1600",     at: "/operator/fleet/directory",     theme: "dark",  width: 1600 },
  { name: "2-directory-light-1600",    at: "/operator/fleet/directory",     theme: "light", width: 1600 },
  { name: "3-systems-check-dark-1600", at: "/operator/fleet/systems-check", theme: "dark",  width: 1600 },
  { name: "4-systems-check-light-1600",at: "/operator/fleet/systems-check", theme: "light", width: 1600 },
  { name: "5-collapse-dark-1600",      at: "/operator/fleet/directory",     theme: "dark",  width: 1600 },
  { name: "6-collapse-dark-900",       at: "/operator/fleet/directory",     theme: "dark",  width: 900 },
  { name: "7-collapse-light-900",      at: "/operator/fleet/directory",     theme: "light", width: 900,  note: "light at narrow width" },
  // 820 is where collapseOrder's own sweep expects the compact state. 900 turned out to be
  // ABOVE the breakpoint — which the hand-written label had claimed otherwise — so the narrow
  // frame is taken where the shell actually collapses, and 900 is kept to show it does not.
  { name: "8-collapse-dark-820",       at: "/operator/fleet/directory",     theme: "dark",  width: 820 },
  { name: "9-collapse-dark-640",       at: "/operator/fleet/directory",     theme: "dark",  width: 640 },
  { name: "10-palette-open-dark",      at: "/operator/fleet/directory",     theme: "dark",  width: 1600, press: "Meta+k", note: "palette open" },
  { name: "11-palette-open-light",     at: "/operator/fleet/directory",     theme: "light", width: 1600, press: "Meta+k", note: "palette open" },
];
const out = [];
for (const p of plan) out.push(await frame(browser, p));
await browser.close();

for (const r of out) {
  console.log(`\n=== ${r.name}  ${r.at}  ${r.theme}  ${r.width}px`);
  console.log(`    ${r.file}`);
  console.log(`    faces loaded: ${Object.entries(r.faces.loaded).map(([f, v]) => `${f}=${v ? "yes" : "NO"}`).join("  ")}`);
  console.log(`    faces rendered: ${r.faces.used.join(", ")}`);
  console.log(`    geometry: rail ${r.geo.cols[0]}px · spine ${r.geo.cols[2]}px · band ${r.geo.band}px`);
  console.log(`    failed checks: ${r.failed.length ? r.failed.join(", ") : "none"}`);
  for (const k of r.failed) console.log(`      ${k}: ${r.checks[k].detail}`);
  console.log(`    typeLadder: ${r.checks.typeLadder.detail}`);
  if (r.errors.length) console.log(`    PAGE ERRORS: ${r.errors.join(" | ")}`);
}
fs.writeFileSync(path.join(ART, "report.json"), JSON.stringify(out, null, 2));
