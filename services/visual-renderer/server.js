// Paige Visual Renderer — a tiny Playwright screenshot service for the Studio visual-critique loop (§33).
// The design agent renders its own output here, screenshots it, and feeds the PNG to Claude vision so it
// SEES what it built before marking it done. Deployed to Fly.io (shared-cpu-1x); one warm browser so an
// iteration loop isn't paying cold-start each call (the reason we don't use Vercel serverless Chromium).
//
// Endpoints (both require the X-Renderer-Secret header == FLY_RENDERER_SHARED_SECRET):
//   POST /render       { url, viewport?, waitForSelector?, waitMs? }  -> image/png
//   POST /render-html  { html, viewport?, waitMs? }                   -> image/png  (preview non-deployed code)
//   GET  /healthz                                                     -> 200 ok
import express from "express";
import { chromium } from "playwright";

const PORT = process.env.PORT || 8080;
const SECRET = process.env.FLY_RENDERER_SHARED_SECRET || "";
const MAX_W = 2000, MAX_H = 2000, DEFAULT_VP = { width: 1280, height: 800 };

// One long-lived browser, launched lazily and relaunched if it ever dies — keeps the loop warm.
let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }
  const b = await browserPromise;
  if (!b.isConnected()) { browserPromise = null; return getBrowser(); }
  return b;
}

const clampVp = (vp) => ({
  width: Math.min(MAX_W, Math.max(320, Number(vp?.width) || DEFAULT_VP.width)),
  height: Math.min(MAX_H, Math.max(240, Number(vp?.height) || DEFAULT_VP.height)),
});

async function shoot({ url, html, viewport, waitForSelector, waitMs }) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: clampVp(viewport), deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  try {
    if (html) await page.setContent(String(html), { waitUntil: "networkidle", timeout: 20000 });
    else await page.goto(String(url), { waitUntil: "networkidle", timeout: 30000 });
    if (waitForSelector) await page.waitForSelector(String(waitForSelector), { timeout: 10000 }).catch(() => {});
    if (waitMs) await page.waitForTimeout(Math.min(8000, Math.max(0, Number(waitMs) || 0)));
    return await page.screenshot({ type: "png" });
  } finally {
    await ctx.close();
  }
}

const app = express();
app.use(express.json({ limit: "8mb" }));

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

function auth(req, res) {
  if (!SECRET) { res.status(500).json({ error: "renderer misconfigured: no shared secret set" }); return false; }
  if (req.get("X-Renderer-Secret") !== SECRET) { res.status(401).json({ error: "bad secret" }); return false; }
  return true;
}

app.post("/render", async (req, res) => {
  if (!auth(req, res)) return;
  const { url, viewport, waitForSelector, waitMs } = req.body || {};
  if (!url || !/^https?:\/\//i.test(String(url))) return res.status(400).json({ error: "valid http(s) url required" });
  try {
    const png = await shoot({ url, viewport, waitForSelector, waitMs });
    res.set("Content-Type", "image/png").send(png);
  } catch (e) {
    res.status(502).json({ error: "render failed", detail: String(e?.message || e) });
  }
});

app.post("/render-html", async (req, res) => {
  if (!auth(req, res)) return;
  const { html, viewport, waitMs } = req.body || {};
  if (!html || typeof html !== "string") return res.status(400).json({ error: "html string required" });
  try {
    const png = await shoot({ html, viewport, waitMs });
    res.set("Content-Type", "image/png").send(png);
  } catch (e) {
    res.status(502).json({ error: "render failed", detail: String(e?.message || e) });
  }
});

app.listen(PORT, () => console.log(`[visual-renderer] listening on :${PORT}`));
