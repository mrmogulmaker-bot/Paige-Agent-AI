// Paige Visual Renderer — a tiny Playwright screenshot service for the Studio visual-critique loop (§33).
// The design agent renders its own output here, screenshots it, and feeds the PNG to Claude vision so it
// SEES what it built before marking it done. Deployed to Fly.io (shared-cpu-1x); one warm browser so an
// iteration loop isn't paying cold-start each call (the reason we don't use Vercel serverless Chromium).
//
// §18 — this is a NEW home on purpose. The repo's only other headless-browser seam is `browser-use`
// (a Browserbase, goal-driven, STATEFUL agent that writes browser_use_sessions). This service is the
// opposite shape: a stateless, warm-browser, screenshot-ONE-thing loop. Reusing browser-use would fork
// a stateful agent into a per-call screenshotter; a dedicated stateless renderer is the right seam.
//
// Endpoints (both require the X-Renderer-Secret header == FLY_RENDERER_SHARED_SECRET):
//   POST /render       { url, viewport?, waitForSelector?, waitMs? }  -> image/png
//   POST /render-html  { html, viewport?, waitMs? }                   -> image/png  (preview non-deployed code)
//   GET  /healthz                                                     -> 200 ok
//
// §13 SSRF — every request the browser makes (the top-level url AND any sub-resource an HTML page
// pulls) is filtered against private/link-local/cloud-metadata ranges via a page.route interceptor,
// so neither /render nor /render-html can be steered into internal infrastructure.
import express from "express";
import { chromium } from "playwright";
import dns from "node:dns/promises";
import net from "node:net";
import crypto from "node:crypto";

const PORT = process.env.PORT || 8080;
const SECRET = process.env.FLY_RENDERER_SHARED_SECRET || "";
const MAX_W = 2000, MAX_H = 2000, DEFAULT_VP = { width: 1280, height: 800 };

// ── SSRF egress guard ───────────────────────────────────────────────────────
function isPrivateIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;   // link-local / cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === "::1" || s === "::") return true;
    if (s.startsWith("fe80")) return true;              // link-local
    if (s.startsWith("fc") || s.startsWith("fd")) return true; // unique-local
    const mapped = s.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return false;
}

const _dnsCache = new Map(); // host -> {private:boolean, at:number}
async function hostIsPrivate(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (net.isIP(h)) return isPrivateIp(h);
  const hit = _dnsCache.get(h);
  if (hit && Date.now() - hit.at < 30_000) return hit.private;
  let priv = true; // fail-closed if we can't resolve
  try {
    const addrs = await dns.lookup(h, { all: true });
    priv = addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address));
  } catch {
    priv = true;
  }
  _dnsCache.set(h, { private: priv, at: Date.now() });
  return priv;
}

async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new Error("invalid url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("only http(s) is allowed");
  if (await hostIsPrivate(u.hostname)) throw new Error("blocked private/internal host");
}

// One long-lived browser, launched lazily and relaunched if it ever dies — keeps the loop warm.
// A FAILED launch nulls the cached promise so the next request retries instead of awaiting a
// permanently-rejected promise (which would brick the service until a restart).
let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
      .catch((e) => { browserPromise = null; throw e; });
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
  // §13 SSRF: block EVERY request (navigation + sub-resource) to a private/internal host. This covers
  // a redirect from a public url into an internal one AND any internal fetch an HTML page tries.
  await page.route("**/*", async (route) => {
    try {
      const host = new URL(route.request().url()).hostname;
      if (await hostIsPrivate(host)) return route.abort("blockedbyclient");
      return route.continue();
    } catch {
      return route.abort("blockedbyclient");
    }
  });
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

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function auth(req, res) {
  if (!SECRET) { res.status(500).json({ error: "renderer misconfigured: no shared secret set" }); return false; }
  if (!timingSafeEqual(req.get("X-Renderer-Secret") || "", SECRET)) { res.status(401).json({ error: "bad secret" }); return false; }
  return true;
}

app.post("/render", async (req, res) => {
  if (!auth(req, res)) return;
  const { url, viewport, waitForSelector, waitMs } = req.body || {};
  if (!url || !/^https?:\/\//i.test(String(url))) return res.status(400).json({ error: "valid http(s) url required" });
  try {
    await assertPublicUrl(url);
  } catch (e) {
    return res.status(400).json({ error: "url rejected", detail: String(e?.message || e) });
  }
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
