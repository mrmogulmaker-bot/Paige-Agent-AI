// Visual-renderer runtime smoke test (§32 — a green build is NOT a working render).
//
// Proves the render engine actually RUNS: launches Chromium, renders inline HTML through the exact
// code path /render-html uses (page.setContent), and asserts a non-empty PNG comes back. Catches
// "the service compiles but Chromium can't launch / can't screenshot" BEFORE a deploy, headless.
//
// Run:  node smoke.mjs
// Exit: 0 = the render engine runs + produces a real PNG; non-zero = it would fail live.
//
// Chromium resolution: in the sandbox the pre-installed browser is under /opt/pw-browsers; elsewhere
// we let Playwright resolve its own. Outbound Chromium network is blocked in the sandbox, so we render
// inline HTML (the /render-html path) — the live-URL /render path is exercised once deployed to Fly.
import { chromium } from "playwright";
import fs from "fs";

function findSandboxChromium() {
  const base = "/opt/pw-browsers";
  try {
    for (const d of fs.readdirSync(base)) {
      if (d.startsWith("chromium")) {
        const p = `${base}/${d}/chrome-linux/chrome`;
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {
    // not the sandbox — fall through to Playwright's own resolution
  }
  return undefined;
}

const HTML = `<!doctype html><html><body style="margin:0;background:#0b0b14;color:#E9C989;
  font:600 42px system-ui;display:grid;place-items:center;height:100vh">Paige Visual Renderer ✓</body></html>`;

const executablePath = findSandboxChromium();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    ...(executablePath ? { executablePath } : {}),
  });
} catch (e) {
  console.error("✗ Chromium failed to launch:", e?.message || e);
  process.exit(1);
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(HTML, { waitUntil: "networkidle", timeout: 20000 });
  const png = await page.screenshot({ type: "png" });
  await browser.close();
  if (!png || png.length < 1000) {
    console.error(`✗ screenshot came back empty/tiny (${png?.length ?? 0} bytes)`);
    process.exit(1);
  }
  console.log(`✓ render engine runs — produced a ${png.length}-byte PNG${executablePath ? " (sandbox Chromium)" : ""}`);
  console.log("✓✓ visual-renderer render path is live-safe.");
  process.exit(0);
} catch (e) {
  console.error("✗ render threw:", e?.message || e);
  try { await browser.close(); } catch { /* already down */ }
  process.exit(1);
}
