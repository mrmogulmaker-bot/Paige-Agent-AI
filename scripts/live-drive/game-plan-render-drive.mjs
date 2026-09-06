#!/usr/bin/env node
// Render the REAL Business Game Plan (SoloGamePlanWorkspace) + its real CSS with only the composed
// reads stubbed, and check what it actually shows across every state, both palettes and the four
// Solo viewports. Proves GEOMETRY + STATE RENDERING; it does NOT prove the authenticated
// production surface — §32.c stays owed to a session that can drive the deployed app.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 5219;
const BASE = `http://127.0.0.1:${PORT}/`;
const MOUNT = path.resolve(import.meta.dirname, "harness/game-plan-mount");
const OUT = path.resolve(import.meta.dirname, "artifacts/game-plan");
fs.mkdirSync(OUT, { recursive: true });

const FRAMES = [
  // Paige-CLOSED — the four Solo viewports (the panel owns the full content width).
  { name: "1536x770", width: 1536, height: 770 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "900x1000", width: 900, height: 1000 },
  // Paige-OPEN — the same four viewports minus the ~410px Paige rail, i.e. the narrower content
  // column the panel actually gets when the Solo Paige dock is open. Proves the panel reflows
  // without horizontal overflow down to a 490px content column (the narrowest real Solo case).
  { name: "open-1126x770", width: 1126, height: 770 },
  { name: "open-956x768", width: 956, height: 768 },
  { name: "open-614x768", width: 614, height: 768 },
  { name: "open-490x1000", width: 490, height: 1000 },
];
const MODES = ["grounded", "partial", "empty", "blocked", "proposal", "motion", "loading", "error"];
const THEMES = ["light", "dark"];

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
      // No network reaching out: same-origin only, so a blocked Google font falls back to system
      // and never makes a frame depend on the network.
      await ctx.route("**://**", (r) => {
        const u = r.request().url();
        if (u.startsWith("file://") || u.startsWith(BASE) || u.startsWith(`http://127.0.0.1:${PORT}`)) return r.continue();
        return r.abort();
      });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e.message)));
      for (const theme of THEMES) {
        for (const mode of MODES) {
          await page.goto(`${BASE}?mode=${mode}&theme=${theme}`, { waitUntil: "load" });
          await page.waitForTimeout(450);
          const m = await page.evaluate(() => {
            const b = document.body;
            const gp = document.querySelector(".gp");
            const boundary = document.querySelector("[data-harness-error]");
            return {
              bodyOX: b.scrollWidth - b.clientWidth,
              gpOX: gp ? gp.scrollWidth - gp.clientWidth : -1,
              rendered: !!document.querySelector(".gp"),
              crashed: !!boundary,
            };
          });
          const label = `${mode}-${theme}-${frame.name}`;
          if (theme === "light" && frame.name === "1536x770") {
            await page.screenshot({ path: path.join(OUT, `${label}.png`) });
          } else if (theme === "dark" && frame.name === "1536x770") {
            await page.screenshot({ path: path.join(OUT, `${label}.png`) });
          } else if (mode === "grounded") {
            await page.screenshot({ path: path.join(OUT, `${label}.png`) });
          }
          check(!m.crashed && m.rendered && m.bodyOX <= 0 && m.gpOX <= 0, label,
            `bodyOX=${m.bodyOX} gpOX=${m.gpOX} rendered=${m.rendered} crashed=${m.crashed}`);
        }
      }
      if (errs.length) check(false, `${frame.name} page errors`, errs.join(" | "));
      await ctx.close();
    }
    await browser.close();
  } finally {
    await stopTree(vite);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed → ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.stack || e.message); process.exit(1); });
