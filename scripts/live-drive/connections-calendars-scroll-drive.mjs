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
async function stopProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
    return;
  }
  const exited = new Promise((resolve) => child.once("exit", resolve));
  try { process.kill(-child.pid, "SIGTERM"); } catch { return; }
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (child.exitCode === null) {
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ }
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
}

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
  const query = new URLSearchParams({ theme: "light" });
  if (clipped) query.set("host", "clipped");
  await page.goto(`${BASE}/solo/1971670/settings/connections?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".solo-settings", { timeout: 20_000 });
  const foldPaige = page.locator('#tenant-paige-workspace button[aria-label="Fold PAIGE conversation"]');
  if (await foldPaige.isVisible()) await foldPaige.click();
  await page.click('.ss-segment button:text-is("Calendars")');
  await page.waitForSelector(".cc-area", { timeout: 20_000 });
  await page.waitForTimeout(600);
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

/**
 * THE CONTROLS — and why the clipped-host one changed meaning (2026-08-31).
 *
 * `?host=clipped` used to be the proof that this drive could fail: it put the screen
 * host back to inline `overflow:hidden`, the surface lost its scroll owner, and the
 * reachability check went red.
 *
 * Settings' scroll ownership is now decided by an !important, Settings-scoped rule in
 * settings.css, which outranks ANY inline style on the host — the clipped one
 * included. So the clipped host can no longer take the scroll owner away, and keeping
 * the old assertion would mean asserting something that is now false to make a drive
 * look rigorous. It measured the inline style; the inline style is no longer what
 * decides.
 *
 * So this control now asserts the HARDENING (Settings stays reachable even under the
 * clipped host — the regression class that shipped as #681 cannot come back through a
 * route-list edit), and the can-this-fail duty moves to deleting the opt-out rule from
 * the live stylesheet, which still turns the surface red on demand.
 */
async function proveCheckCanFail(page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openFullSurface(page, true);
  await page.mouse.move(683, 384);
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(20); }
  const r = await page.evaluate(lastControlReach);
  const scrollers = await page.evaluate(liveScrollers);
  await page.screenshot({ path: path.join(OUT, "negative-control-clipped-host.png") });
  record("hardening · a clipped host can no longer remove the scroll owner",
    r.reachable && scrollers.length === 1,
    `scrollers=[${scrollers.join(", ")}] lastControlBottom=${r.bottom} vh=${r.vh} (expected reachable)`);

  // The control that CAN still fail: take the Settings-scoped opt-out out of the live
  // stylesheet and the surface must stop scrolling.
  await openFullSurface(page, false);
  const killed = await page.evaluate(() => {
    let deleted = 0;
    for (const sheet of [...document.styleSheets]) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (let i = rules.length - 1; i >= 0; i--) {
        const sel = rules[i].selectorText || "";
        if (!/(^|,)\s*\.paige-solo main/.test(sel)) continue;
        if (!/\.solo-settings|tcs-main--settings-scrollbar/.test(sel)) continue;
        sheet.deleteRule(i); deleted += 1;
      }
    }
    const host = document.querySelector("[data-solo-screen-host]");
    return { deleted, overflowY: host ? getComputedStyle(host).overflowY : null };
  });
  await page.waitForTimeout(200);

  // The control must fail the way the BATTERY fails. `overflow-y: hidden` on the host
  // is only a proxy for that: if `lastControlReach` or `liveScrollers` themselves
  // regressed, or another ancestor became the scroller, the battery could stay
  // false-green while a computed-style assertion still passed. So re-run the drive's
  // own predicates and require the verdict the clipped host used to produce.
  const deadReach = await page.evaluate(lastControlReach);
  const deadScrollers = await page.evaluate(liveScrollers);
  record("negative control · removing the Settings opt-out stops the scroll",
    killed.deleted > 0 && killed.overflowY === "hidden"
      && !deadReach.reachable && deadScrollers.length === 0,
    `rules deleted=${killed.deleted} → computed overflow-y=${killed.overflowY} · `
    + `scrollers=[${deadScrollers.join(", ")}] · lastControlBottom=${deadReach.bottom} vh=${deadReach.vh}`);
}

async function main() {
  await assertPortFree();
  mkdirSync(OUT, { recursive: true });
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--config", "scripts/live-drive/harness/settings-mount/vite.config.ts", "--port", "5201", "--strictPort"],
    { cwd: process.cwd(), detached: true, stdio: "ignore" });
  // The launch belongs INSIDE the cleanup scope. A Chromium that cannot start —
  // a missing or wrong `PW_EXECUTABLE_PATH` — used to reject before the `try`,
  // leaving the detached server holding port 5201 and failing the next run's
  // `assertPortFree` for a reason that had nothing to do with the next run.
  let browser;
  try {
    browser = await chromium.launch({ ...(process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : {}), args: ["--no-sandbox"], ignoreDefaultArgs: ["--hide-scrollbars"] });
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
    await stopProcessTree(vite);
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
