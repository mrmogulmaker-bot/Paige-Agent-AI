/**
 * Settings › Connections › Calendars — CAN A HUMAN REACH THE LAST CONTROL?
 *
 * STRUCTURAL-HARNESS proof (§13/§32.c). It renders the shipped surface inside the
 * shipped tenant-shell chain AND the shipped SoloApp screen host, in a real
 * browser, at the four laptop/tablet widths the owner works at. It is NOT
 * authenticated production and says nothing about real tenant data.
 *
 * WHY THIS EXISTS. The geometry drive asserted "no horizontal overflow, no nested
 * scrollers" and passed while the surface was, in production, unscrollable: the
 * SoloApp screen host rendered `overflow:hidden` at `height:100%` for the
 * `settings` route, so the canvas was clipped at the fold and the shell's own
 * scroll owner never overflowed either. Nothing was nested and nothing scrolled
 * sideways, so both old checks were satisfied by a surface a human could not use.
 *
 * The check that would have caught it is the only one that matters here: TAKE THE
 * LAST ACTIONABLE CONTROL AND REACH IT. By wheel. By keyboard. By focus. With a
 * real scrollbar. That is what this drive does, and `?host=clipped` re-creates the
 * broken host so the check is shown to FAIL when the scroll owner is removed.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import net from "node:net";

const BASE = "http://127.0.0.1:5201";
const OUT = path.resolve("scripts/live-drive/artifacts/connections-calendars-scroll");
const VIEWPORTS = [[1536, 770], [1366, 768], [1024, 768], [900, 1000]];
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

/** The port must be ours, or we measure someone else's stale module graph. */
function assertPortFree() {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host: "127.0.0.1", port: 5201 }, () => {
      s.destroy();
      reject(new Error("port 5201 is already serving — stop the other harness first; this drive must own the server it measures."));
    });
    s.on("error", () => resolve());
  });
}

/** Every actionable control in the Calendar canvas, in document order. */
const CONTROLS = ".cc button:not([disabled]), .cc input, .cc select, .cc textarea, .cc a[href]";

async function openFullSurface(page, clipped) {
  await page.goto(`${BASE}/${clipped ? "?host=clipped" : ""}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".cc-area", { timeout: 20_000 });
  // Every fold-out open: the owner configuring a preset is the tallest real state,
  // and a surface that scrolls while collapsed can still trap them when expanded.
  const expand = page.locator("button", { hasText: /Expand all/i }).first();
  if (await expand.count()) { await expand.click(); await page.waitForTimeout(600); }
}

const lastControlReach = () => {
  const all = [...document.querySelectorAll(".cc button:not([disabled]), .cc input, .cc select, .cc textarea, .cc a[href]")]
    .filter((e) => e.offsetParent !== null);
  const last = all[all.length - 1];
  if (!last) return { none: true };
  const r = last.getBoundingClientRect();
  return {
    label: (last.getAttribute("aria-label") || last.textContent || "").trim().slice(0, 40),
    reachable: r.bottom <= window.innerHeight + 1 && r.top >= -1,
    top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight,
    count: all.length,
  };
};

/** Elements that actually scroll vertically — declared AND overflowing. */
const liveScrollers = () => [...document.querySelectorAll("*")].filter((e) => {
  const s = getComputedStyle(e);
  return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2;
}).map((e) => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : e.className ? `.${String(e.className).split(" ")[0]}` : ""));

async function driveViewport(page, w, h) {
  const tag = `${w}×${h}`;
  await openFullSurface(page, false);

  // 1 · initial viewport
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${w}x${h}-01-initial.png`) });

  const start = await page.evaluate(lastControlReach);
  const scrollers = await page.evaluate(liveScrollers);

  // 4 · exactly one intended vertical scroll owner, and no sideways scroll
  record(`${tag} · one vertical scroll owner`, scrollers.length === 1, `scrollers=[${scrollers.join(", ")}]`);
  const hOverflow = await page.evaluate(() => {
    const d = document.documentElement;
    const wide = [...document.querySelectorAll(".cc *")].filter((e) => e.scrollWidth > e.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowX)).length;
    return { doc: d.scrollWidth > d.clientWidth + 1, nestedX: wide };
  });
  record(`${tag} · no horizontal overflow, no sideways trap`, !hOverflow.doc && hOverflow.nestedX === 0,
    `docScrollsX=${hOverflow.doc} nestedXScrollers=${hOverflow.nestedX}`);

  // 2/3 · a real wheel scroll to the final actionable control
  await page.mouse.move(w / 2, h / 2);
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(25); }
  await page.waitForTimeout(400);
  const byWheel = await page.evaluate(lastControlReach);
  await page.screenshot({ path: path.join(OUT, `${w}x${h}-02-wheel-bottom.png`) });
  record(`${tag} · wheel reaches the last control`, byWheel.reachable,
    `"${byWheel.label}" was at y≈${start.top}, now ${byWheel.top}–${byWheel.bottom} in ${byWheel.vh}px · ${byWheel.count} controls`);

  // 3 · keyboard: End, then PageDown/Space from the top
  await page.evaluate(() => { const s = document.querySelector("[data-solo-screen-host]"); if (s) s.scrollTop = 0; });
  await page.locator(CONTROLS).first().focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(400);
  const byEnd = await page.evaluate(lastControlReach);
  record(`${tag} · keyboard End reaches the last control`, byEnd.reachable, `rect ${byEnd.top}–${byEnd.bottom}`);

  await page.evaluate(() => { const s = document.querySelector("[data-solo-screen-host]"); if (s) s.scrollTop = 0; });
  await page.locator(CONTROLS).first().focus();
  let paged = 0;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(i % 2 ? "Space" : "PageDown");
    await page.waitForTimeout(35);
    paged = await page.evaluate(() => document.querySelector("[data-solo-screen-host]")?.scrollTop ?? 0);
    if (await page.evaluate(() => lastControlReachInline())) break;
  }
  const byPage = await page.evaluate(lastControlReach);
  record(`${tag} · PageDown / Space reach the last control`, byPage.reachable, `scrollTop=${Math.round(paged)}`);

  // 3 · focusing the last control scrolls it into view on its own
  await page.evaluate(() => { const s = document.querySelector("[data-solo-screen-host]"); if (s) s.scrollTop = 0; });
  await page.locator(CONTROLS).last().focus();
  await page.waitForTimeout(300);
  const byFocus = await page.evaluate(lastControlReach);
  record(`${tag} · focusing the last control brings it into view`, byFocus.reachable, `rect ${byFocus.top}–${byFocus.bottom}`);

  // browser scrollbar behaviour: setting scrollTop to max must land at the bottom
  const bar = await page.evaluate(() => {
    const s = document.querySelector("[data-solo-screen-host]");
    if (!s) return null;
    s.scrollTop = s.scrollHeight;
    return { at: Math.round(s.scrollTop), max: Math.round(s.scrollHeight - s.clientHeight) };
  });
  await page.waitForTimeout(200);
  const byBar = await page.evaluate(lastControlReach);
  record(`${tag} · scrollbar travel reaches the end`, !!bar && Math.abs(bar.at - bar.max) <= 1 && byBar.reachable,
    `scrollTop=${bar?.at}/${bar?.max}`);

  // 5 · nothing is clipped away: the canvas is fully inside the scrollable extent
  const clip = await page.evaluate(() => {
    const host = document.querySelector("[data-solo-screen-host]");
    const cc = document.querySelector(".cc");
    if (!host || !cc) return null;
    return { canvas: Math.round(cc.getBoundingClientRect().height), extent: Math.round(host.scrollHeight) };
  });
  record(`${tag} · the whole canvas is inside the scrollable extent`, !!clip && clip.extent >= clip.canvas,
    `canvas=${clip?.canvas}px extent=${clip?.extent}px`);
}

/** The negative control: with the scroll owner removed, the check MUST fail. */
async function proveCheckCanFail(page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openFullSurface(page, true);
  await page.mouse.move(683, 384);
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(20); }
  const r = await page.evaluate(lastControlReach);
  const scrollers = await page.evaluate(liveScrollers);
  await page.screenshot({ path: path.join(OUT, "negative-control-clipped-host.png") });
  record("negative control · a clipped host FAILS this drive",
    !r.reachable && scrollers.length === 0,
    `scrollers=[${scrollers.join(", ")}] lastControlBottom=${r.bottom} vh=${r.vh} (expected unreachable)`);
}

async function main() {
  await assertPortFree();
  mkdirSync(OUT, { recursive: true });
  const vite = spawn("npx", ["vite", "--config", "scripts/live-drive/harness/connections-mount/vite.config.ts"],
    { cwd: process.cwd(), detached: true, stdio: "ignore" });
  // The launch belongs INSIDE the cleanup scope. A Chromium that cannot start —
  // a missing or wrong `PW_EXECUTABLE_PATH` — used to reject before the `try`,
  // leaving the detached server holding port 5201 and failing the next run's
  // `assertPortFree` for a reason that had nothing to do with the next run.
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
    await new Promise((r) => setTimeout(r, 9000));
    const page = await browser.newPage({ viewport: { width: 1536, height: 770 } });
    await page.addInitScript(() => {
      window.lastControlReachInline = () => {
        const all = [...document.querySelectorAll(".cc button:not([disabled]), .cc input, .cc select, .cc textarea, .cc a[href]")].filter((e) => e.offsetParent !== null);
        const last = all[all.length - 1];
        if (!last) return false;
        const r = last.getBoundingClientRect();
        return r.bottom <= window.innerHeight + 1 && r.top >= -1;
      };
    });
    for (const [w, h] of VIEWPORTS) {
      console.log(`\n### ${w}×${h}`);
      await page.setViewportSize({ width: w, height: h });
      await driveViewport(page, w, h);
    }
    console.log("");
    await proveCheckCanFail(page);
    await page.close();
  } finally {
    await browser?.close();
    try { process.kill(-vite.pid); } catch { /* already gone */ }
  }
  const failed = results.filter((r) => !r.ok);
  console.log("");
  if (failed.length) {
    console.error(`✗ scroll-drive: ${failed.length}/${results.length} checks FAILED`);
    for (const f of failed) console.error(`   · ${f.name} — ${f.detail}`);
    process.exit(1);
  }
  console.log(`✓ scroll-drive: all ${results.length} STRUCTURAL-HARNESS checks pass. Frames in ${OUT}`);
  console.log("  NOT owner proof (§70.1): the shipped surface inside the shipped shell and SoloApp");
  console.log("  host, against an in-memory double. Real tenant data and authenticated production");
  console.log("  behaviour stay UNVERIFIED.");
}

main().catch((e) => { console.error(e); process.exit(1); });
