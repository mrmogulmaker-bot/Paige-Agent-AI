#!/usr/bin/env node
// Business Game Plan — SCROLL proof (owner bug 2026-09-06: "I cannot scroll up and down the screen").
//
// Mounts the REAL SoloGamePlanWorkspace + real CSS inside a faithful reproduction of the production
// CommandHub chain (content div → tabpanel → .gp). The `?wrap=` toggle reproduces the shipped bug
// (`block` = the plain block tabpanel that never bounds `.gp`'s flex height) and the fix (`flex` =
// the flex-column tabpanel now in src/solo/CommandCenter.tsx). At viewport heights where the grounded
// content overflows, this asserts:
//   • wrap=block  → the intended scroll owner CANNOT scroll and a below-the-fold priority-row control
//                    is UNREACHABLE (the owner's exact bug reproduced).
//   • wrap=flex   → the scroll owner scrolls (scrollHeight > clientHeight), scrollTop actually moves,
//                    and the below-the-fold control is brought into view — the buttons are reachable.
// This closes the §32/§70 harness gap: the prior harness always mounted `.gp` in a correct flex
// column, so it could never catch a shell-only regression. It is dev tooling, not shipped.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 5219; // must match the harness vite.config.ts (strictPort)
const BASE = `http://127.0.0.1:${PORT}/`;
const MOUNT = path.resolve(import.meta.dirname, "harness/game-plan-mount");

// Heights small enough that the grounded content (tall best-move card + priority path + foundation +
// work-in-motion) overflows — matching the owner's real, over-full laptop viewport.
const FRAMES = [
  { name: "desktop-1440x680", width: 1440, height: 680 },
  { name: "narrow-900x680", width: 900, height: 680 },
  // Paige-dock-open, done FAITHFULLY (Codex #980 P1): a 1366px viewport keeps the real two-column
  // path (media query keys on the viewport, not the 956px content column the dock leaves).
  { name: "dock-open-1366vp-956content", width: 1366, height: 680, dock: 956 },
];

const results = [];
const check = (ok, name, detail = "") => { results.push({ ok, name, detail }); console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`); };

function chromePath() {
  if (process.env.PW_EXECUTABLE_PATH) return process.env.PW_EXECUTABLE_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  return fs.readdirSync(base).filter((d) => d.startsWith("chromium-"))
    .map((d) => path.join(base, d, "chrome-linux/chrome")).find((p) => fs.existsSync(p));
}
const portFree = () => new Promise((res, rej) => {
  const p = net.createServer();
  p.once("error", () => rej(new Error(`Port ${PORT} in use`)));
  p.once("listening", () => p.close(res));
  p.listen(PORT, "127.0.0.1");
});
const waitServer = async () => {
  for (let i = 0; i < 120; i++) {
    const ok = await new Promise((r) => http.get(BASE, (res) => { res.resume(); r(res.statusCode === 200); }).on("error", () => r(false)));
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("vite server did not start");
};
async function stopTree(child) {
  if (!child?.pid) return;
  const gone = () => { try { process.kill(-child.pid, 0); return false; } catch { return true; } };
  try { process.kill(-child.pid, "SIGTERM"); } catch {}
  for (let i = 0; i < 20 && !gone(); i++) await new Promise((r) => setTimeout(r, 100));
  if (!gone()) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
}

// The size-independent signal: does `.gp` overflow its tabpanel container (bug — clipped, unreachable)
// or fit it (fix — bounded, so the internal scrollers reach every region)? Plus, for the fix, prove
// each intended scroll owner can bring its bottom-most content into view.
function probe() {
  const tp = document.querySelector("[data-gp-tabpanel]");
  const gp = document.querySelector(".gp");
  const b = document.body;
  const vh = window.innerHeight;
  const tpH = tp ? Math.round(tp.getBoundingClientRect().height) : -1;
  const gpH = gp ? Math.round(gp.getBoundingClientRect().height) : -1;
  const bodyOX = b.scrollWidth - b.clientWidth;
  const gpOX = gp ? gp.scrollWidth - gp.clientWidth : -1;
  // `.gp` taller than its container ⇒ the excess is clipped by the overflow:hidden ancestor and
  // no ancestor scrolls to reveal it — the owner's unreachable-content bug.
  const gpOverflowsParent = gpH > tpH + 1;
  const wide = window.innerWidth > 1040;
  const owners = wide ? [".sd-col", ".sd-rail"] : [".sd-field"];
  const regions = owners.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, present: false, bottomReachable: false };
    el.scrollTop = el.scrollHeight; // drive it to the bottom
    const last = el.lastElementChild;
    const r = last ? last.getBoundingClientRect() : null;
    return {
      sel, present: true,
      canScroll: el.scrollHeight - el.clientHeight,
      scrolledTo: Math.round(el.scrollTop),
      // its bottom-most content sits within the viewport after scrolling (already-in-view counts).
      bottomReachable: r ? r.bottom <= vh + 3 : true,
      lastBottom: r ? Math.round(r.bottom) : -1,
    };
  });
  return { tpH, gpH, gpOverflowsParent, bodyOX, gpOX, wide, vh, regions, rows: document.querySelectorAll(".sd-card").length };
}

(async () => {
  await portFree();
  const vite = spawn("npx", ["vite", "--clearScreen", "false"], { cwd: MOUNT, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  vite.stderr.on("data", (d) => { const s = String(d); if (/error/i.test(s)) process.stderr.write(s); });
  try {
    await waitServer();
    const exe = chromePath();
    const browser = await chromium.launch(exe ? { executablePath: exe, args: ["--no-sandbox"] } : { args: ["--no-sandbox"] });
    for (const frame of FRAMES) {
      const ctx = await browser.newContext({ viewport: { width: frame.width, height: frame.height }, deviceScaleFactor: 1 });
      await ctx.route("**://**", (r) => {
        const u = r.request().url();
        if (u.startsWith("file://") || u.startsWith(BASE) || u.startsWith(`http://127.0.0.1:${PORT}`)) return r.continue();
        return r.abort();
      });
      const page = await ctx.newPage();

      const dockQ = frame.dock ? `&dock=${frame.dock}` : "";

      // 1) Reproduce the bug: the plain-block tabpanel leaves `.gp` unbounded, so it grows taller
      //    than its container and the excess is clipped with no way to scroll to it.
      await page.goto(`${BASE}?mode=grounded&theme=light&wrap=block${dockQ}`, { waitUntil: "load" });
      await page.waitForTimeout(450);
      const bug = await page.evaluate(probe);
      check(
        bug.rows > 0 && bug.gpOverflowsParent,
        `${frame.name} · block(bug) reproduces: .gp overflows its container (clipped, unreachable)`,
        `gpH=${bug.gpH} tpH=${bug.tpH} overflows=${bug.gpOverflowsParent} vh=${bug.vh}`,
      );

      // 2) Prove the fix: the flex-column tabpanel bounds `.gp` to its container, every intended
      //    scroll region can bring its bottom-most content into view (buttons reachable), AND the
      //    surface never scrolls horizontally (incl. the dock's narrow two-column content column).
      await page.goto(`${BASE}?mode=grounded&theme=light&wrap=flex${dockQ}`, { waitUntil: "load" });
      await page.waitForTimeout(450);
      const fixed = await page.evaluate(probe);
      const allReachable = fixed.regions.every((r) => r.present && r.bottomReachable);
      const detail = fixed.regions.map((r) => `${r.sel}[canScroll=${r.canScroll} to=${r.scrolledTo} bottom=${r.lastBottom} reach=${r.bottomReachable}]`).join(" ");
      check(
        fixed.rows > 0 && !fixed.gpOverflowsParent && allReachable && fixed.bodyOX <= 0 && fixed.gpOX <= 0,
        `${frame.name} · flex(fix): .gp bounded, every region reachable, no h-overflow`,
        `gpH=${fixed.gpH} tpH=${fixed.tpH} overflows=${fixed.gpOverflowsParent} bodyOX=${fixed.bodyOX} gpOX=${fixed.gpOX} wide=${fixed.wide} vh=${fixed.vh} ${detail}`,
      );

      await ctx.close();
    }
    await browser.close();
  } finally {
    await stopTree(vite);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} scroll checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.stack || e.message); process.exit(1); });
