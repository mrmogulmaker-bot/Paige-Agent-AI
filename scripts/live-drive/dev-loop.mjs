#!/usr/bin/env node
/**
 * dev-loop — shoot CD's reference and our build side by side, same viewport, same theme.
 *
 * Owner, 2026-08-23: *"make sure that you write a command for yourself to keep looping any time
 * we are in development… you're going to always have to keep looping back and forth because if
 * not, then you're just strictly working from memory, and that never works out too well."*
 *
 * That is the whole reason this file exists, and it is worth stating as a rule rather than a
 * convenience: **a change to an operator surface is not done until it has been driven.** Every
 * defect this console has been rejected for — 78 blank tabs, six imported-and-never-rendered
 * components, a spine collapsed to nothing — passed typecheck, lint and the test suite. None of
 * them survives a screenshot.
 *
 *   node scripts/live-drive/dev-loop.mjs                      both, dark, 1600
 *   node scripts/live-drive/dev-loop.mjs --at /operator/settings --theme light --w 900
 *   node scripts/live-drive/dev-loop.mjs --ref-only           just CD's reference
 *
 * THE REFERENCE IS FILE://, AND THAT IS THE POINT (Claude Design, 2026-08-23). The pack's own
 * `.dc.html` pulls React and Babel from a CDN, which no sandbox here can reach — that blocker
 * cost real time. `PAIGE Platform Operator - standalone.html` is the same design compiled with
 * every script, font and asset inlined: it drives from `file://`, offline, forever. CD: *"it's a
 * compiled artifact, so never edit it. When the pack changes I rebuild it and re-deliver."*
 *
 * OUR SIDE needs a dev server (`npm run dev`, 127.0.0.1:5199). Everything off-origin is aborted
 * except the three font hosts, so a frame can never be flattered by a resource prod would not
 * serve — the same fence `harness/frames.mjs` uses.
 *
 * IT MEASURES, IT DOES NOT JUDGE (root `CLAUDE.md` §00). Geometry, faces, page errors, whether a
 * surface rendered at all. Those are facts about whether it WORKS. What to do about how it LOOKS
 * is Claude Design's, and this tool has no opinion.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ARG = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const AT = ARG("--at", "/operator/fleet/systems-check");
const THEME = ARG("--theme", "dark");
const W = Number(ARG("--w", "1600"));
const H = Number(ARG("--h", "1000"));
const BASE = process.env.DEV_LOOP_BASE || "http://127.0.0.1:5199";
const OUT = "scripts/live-drive/artifacts";
const REF = "file://" + encodeURI(path.resolve(
  "docs/design-references/cd-packs/super-admin-shell-v3/PAIGE Platform Operator - standalone.html"));
const FONTS = ["fonts.googleapis.com", "fonts.gstatic.com", "api.fontshare.com"];

/** Resolve Chromium the way live-drive.mjs does — env, then the sandbox scan, then bundled. */
function chromePath() {
  if (process.env.PW_EXECUTABLE_PATH) return process.env.PW_EXECUTABLE_PATH;
  const b = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(b)) return undefined;
  return fs.readdirSync(b).filter((d) => d.startsWith("chromium-"))
    .map((d) => path.join(b, d, "chrome-linux/chrome")).find((p) => fs.existsSync(p));
}

/** Read back what actually painted. Every number here is measured at capture time, never typed. */
const MEASURE = () => {
  const grid = document.querySelector("[data-shell-grid]");
  const spine = document.querySelector("[data-operator-spine]") || document.querySelector("aside");
  const rail = document.querySelector("[data-operator-rail]") || document.querySelector("nav");
  const root = document.querySelector("[data-pg]");
  return {
    theme: root ? root.getAttribute("data-pg") : null,
    cols: grid ? getComputedStyle(grid).gridTemplateColumns : null,
    spineW: spine ? Math.round(spine.getBoundingClientRect().width) : null,
    railW: rail ? Math.round(rail.getBoundingClientRect().width) : null,
    faces: [...document.querySelectorAll("[data-operator-spine] [role='tab'], [data-operator-spine] button")]
      .map((b) => b.textContent.trim()).filter(Boolean).slice(0, 10),
    // CD's standing rule: no surface may show a DOCUMENT scrollbar. Regions scroll; the page does not.
    docScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    faceCount: document.fonts ? [...document.fonts].filter((f) => f.status === "loaded")
      .map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i) : [],
  };
};

async function shoot(browser, { url, label, wait }) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    colorScheme: THEME === "light" ? "light" : "dark",
  });
  const origin = url.startsWith("file://") ? "file://" : new URL(url).origin;
  await ctx.route("**://**", (r) => {
    const u = r.request().url();
    if (u.startsWith(origin) || u.startsWith("file://")) return r.continue();
    if (FONTS.some((h) => u.includes(h))) return r.continue();
    return r.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
  let ok = true, why = null;
  try {
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(wait);
  } catch (e) { ok = false; why = e.message.split("\n")[0]; }
  const measured = ok ? await page.evaluate(MEASURE) : null;
  const file = path.join(OUT, `${label}-${THEME}-${W}.png`);
  if (ok) { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: file }); }
  await ctx.close();
  return { ok, why, measured, file: ok ? file : null, errors };
}

const browser = await chromium.launch(chromePath() ? { executablePath: chromePath() } : {});
const jobs = [{ url: REF, label: "REF", wait: 4000 }];
if (!process.argv.includes("--ref-only")) jobs.push({ url: BASE + AT, label: "OURS", wait: 2500 });

console.log(`dev-loop · ${AT} · ${THEME} · ${W}×${H}\n`);
const results = {};
for (const job of jobs) {
  const r = await shoot(browser, job);
  results[job.label] = r;
  if (!r.ok) {
    console.log(`${job.label}: COULD NOT LOAD — ${r.why}`);
    if (job.label === "OURS") console.log(`   (is the dev server up? \`npm run dev\` → ${BASE})`);
    continue;
  }
  const m = r.measured;
  console.log(`${job.label}  ${r.file}`);
  console.log(`   theme=${m.theme}  cols=${m.cols}  rail=${m.railW}  spine=${m.spineW}`);
  console.log(`   faces=[${m.faces.join(", ")}]`);
  console.log(`   docScroll=${m.docScroll ? "YES — that is a defect" : "no"}  errors=${r.errors.length || "none"}`);
  if (r.errors.length) r.errors.slice(0, 3).forEach((e) => console.log(`     ! ${e}`));
  console.log("");
}
await browser.close();

/** The one comparison worth printing: does our geometry match the design's. */
if (results.REF?.ok && results.OURS?.ok) {
  const a = results.REF.measured, b = results.OURS.measured;
  const same = (x, y) => (x === y ? "match" : `REF ${x} vs OURS ${y}`);
  console.log("geometry —");
  console.log(`   spine  ${same(a.spineW, b.spineW)}`);
  console.log(`   rail   ${same(a.railW, b.railW)}`);
}
