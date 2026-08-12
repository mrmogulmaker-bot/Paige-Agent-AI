// Paige Browser — a self-hosted, warm-browser Playwright service that DRIVES a URL headless and
// returns an HONEST STRUCTURED OBSERVATION (§32.c). It is the "eyes" Paige uses to self-verify her
// OWN deployed platform surfaces — the killer of the owner-owed live-walk: instead of asking the
// owner to eyeball a shipped surface, Paige drives it here and reads back title/text/status/steps +
// a screenshot. Deployed to Fly.io (shared-cpu-1x); one warm browser so a verify loop isn't paying
// cold-start each call (the reason we don't use Vercel serverless Chromium).
//
// §18 — this is a NEW home ON PURPOSE, distinct from BOTH existing browser seams:
//   • services/visual-renderer = a STATELESS screenshot-ONE-thing service (url/html -> PNG). This
//     service is the OPPOSITE shape: it DRIVES and OBSERVES, returning a structured JSON observation
//     (title, final_url, http_status, text excerpt, per-step results) — not a bare image.
//   • supabase/functions/browser-use = a Browserbase (3rd-party, edge-can't-drive-Playwright)
//     stateful stub. paige-browser is SELF-HOSTED real Playwright (§34 moat — tenant session tokens
//     will eventually flow through this host in a later slice, so it must NOT be a 3rd party).
//
// §9/§34 — this host is DB-FREE by construction: it holds NO Supabase creds and writes NO DB rows.
// The browser_use_sessions ledger write + tenant-scope resolution live in the CALLING edge function
// (Slice 1b). Keeping the browser host DB-free is a deliberate posture — the eyes never hold tenant
// data; the caller resolves scope and records the run.
//
// Slice 1a scope: SELF-VERIFY ONLY. READ-ONLY navigation/observation, NO tenant authentication
// (that is Slice 4), NO interpreter dispatch (that is Slice 1b). Only read-only observation steps
// (assertSelector / assertText / readText) are permitted; any click/submit/type/download step is
// REJECTED with an honest error — those are gated behind the §16 autonomy clamp in a later slice,
// never run silently here.
//
// Endpoints:
//   GET  /healthz                                                         -> 200 "ok"
//   POST /self-verify  (requires X-Browser-Secret == PAIGE_BROWSER_SHARED_SECRET, timing-safe)
//        body: { url, viewport?, waitForSelector?, waitMs?, steps? }      -> 200 JSON observation
//
// §13 SSRF — every request the browser makes (the top-level url AND any sub-resource) is filtered
// against private/link-local/cloud-metadata ranges via a page.route interceptor; the final_url is
// re-checked public after redirects. Fork 7 guard, owner-signed-off, NON-NEGOTIABLE.
import express from "express";
import { chromium } from "playwright";
import dns from "node:dns/promises";
import net from "node:net";
import crypto from "node:crypto";

const PORT = process.env.PORT || 8080;
const SECRET = process.env.PAIGE_BROWSER_SHARED_SECRET || "";
const MAX_W = 2000, MAX_H = 2000, DEFAULT_VP = { width: 1280, height: 800 };

// Concurrency + timing caps (Fork 5 v1 soft cap + hard per-run timeouts).
const MAX_CONCURRENT = Math.max(1, Number(process.env.PAIGE_BROWSER_MAX_CONCURRENT) || 3);
const NAV_TIMEOUT_MS = Math.max(1000, Number(process.env.PAIGE_BROWSER_NAV_TIMEOUT_MS) || 30000);
const RUN_CAP_MS = Math.max(NAV_TIMEOUT_MS, Number(process.env.PAIGE_BROWSER_RUN_CAP_MS) || 45000);
// Per-page-operation timeout: bounds selector/handle reads (via page.setDefaultTimeout) AND the
// page.evaluate calls (via withTimeout) so a wedged JS execution context can't hold the observe
// context open past the HTTP hard cap — the context releases promptly instead (peer-gate finding).
const STEP_TIMEOUT_MS = Math.max(1000, Number(process.env.PAIGE_BROWSER_STEP_TIMEOUT_MS) || 10000);

// Observation output caps.
const MAX_TEXT_EXCERPT = 2000;         // chars of tag-stripped page text
const MAX_STEP_TEXT = 2000;            // chars returned by a readText step
const MAX_SCREENSHOT_BYTES = 4_500_000; // png bytes before base64 (~6mb b64); over -> omit + log

// Only these READ-ONLY observation step kinds are permitted in Slice 1a.
const ALLOWED_STEP_KINDS = new Set(["assertSelector", "assertText", "readText"]);

// ── SSRF egress guard (verbatim from services/visual-renderer — Fork 7, NON-NEGOTIABLE) ──────────
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

// Race a promise against a timeout so an unbounded page.evaluate (which page.setDefaultTimeout does
// NOT govern) can't hang the observe context. Clears the timer on settle so it never leaks.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(timer)), timeout]);
}

// Read the document body text inside the page, bounded by STEP_TIMEOUT_MS. Returns "" on any failure.
function readBodyText(page) {
  return withTimeout(
    page.evaluate(() => (document.body ? document.body.innerText : "")),
    STEP_TIMEOUT_MS,
    "readBodyText",
  );
}

// Capture a viewport screenshot as base64 png. NEVER throws and NEVER returns undefined on a
// failure path — a null (with a loud log) is the honest "couldn't capture" signal; the caller uses
// whatever this returns as the VISIBLE FALLBACK (§32) so a failed observation still shows something.
async function captureScreenshotB64(page) {
  try {
    const png = await page.screenshot({ type: "png" });
    if (!png || png.length === 0) return null;
    if (png.length > MAX_SCREENSHOT_BYTES) {
      console.error(`[paige-browser] screenshot ${png.length}B exceeds cap ${MAX_SCREENSHOT_BYTES}B; omitting b64`);
      return null;
    }
    return png.toString("base64");
  } catch (e) {
    console.error("[paige-browser] screenshot capture failed:", e?.message || e);
    return null;
  }
}

// Extract tag-stripped, whitespace-collapsed body text, capped. Never throws.
async function extractText(page) {
  try {
    const raw = await readBodyText(page);
    return String(raw || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_EXCERPT);
  } catch (e) {
    console.error("[paige-browser] text extraction failed:", e?.message || e);
    return "";
  }
}

// Run the READ-ONLY observation steps. A non-read-only kind is REJECTED (ok:false + honest detail),
// never silently executed — write/interact steps are gated behind the §16 clamp in a later slice.
async function runSteps(page, steps) {
  if (!Array.isArray(steps) || steps.length === 0) return [];
  const out = [];
  for (const step of steps) {
    const kind = step?.kind;
    if (!ALLOWED_STEP_KINDS.has(kind)) {
      console.error(`[paige-browser] rejected non-read-only step kind: ${JSON.stringify(kind)}`);
      out.push({
        kind: kind ?? null,
        ok: false,
        detail: `rejected: step kind "${kind}" is not permitted in self-verify (Slice 1a is read-only: assertSelector, assertText, readText)`,
      });
      continue;
    }
    try {
      if (kind === "assertSelector") {
        if (!step.selector) { out.push({ kind, ok: false, detail: "assertSelector requires a selector" }); continue; }
        const found = (await page.$(String(step.selector))) != null;
        out.push({ kind, ok: found, detail: found ? `selector present: ${step.selector}` : `selector not found: ${step.selector}` });
      } else if (kind === "assertText") {
        const needle = String(step.text ?? "");
        if (!needle) { out.push({ kind, ok: false, detail: "assertText requires text" }); continue; }
        let hay;
        if (step.selector) {
          const el = await page.$(String(step.selector));
          if (!el) { out.push({ kind, ok: false, detail: `selector not found: ${step.selector}` }); continue; }
          hay = await el.innerText().catch(() => "");
        } else {
          hay = await readBodyText(page).catch(() => "");
        }
        const ok = String(hay).includes(needle);
        out.push({ kind, ok, detail: ok ? `text found: "${needle}"` : `text not found: "${needle}"` });
      } else if (kind === "readText") {
        let text;
        if (step.selector) {
          const el = await page.$(String(step.selector));
          if (!el) { out.push({ kind, ok: false, detail: `selector not found: ${step.selector}` }); continue; }
          text = await el.innerText().catch(() => "");
        } else {
          text = await readBodyText(page).catch(() => "");
        }
        out.push({ kind, ok: true, detail: String(text || "").replace(/\s+/g, " ").trim().slice(0, MAX_STEP_TEXT) });
      }
    } catch (e) {
      out.push({ kind, ok: false, detail: `step error: ${String(e?.message || e)}` });
    }
  }
  return out;
}

// Drive the url and build the structured observation. NEVER throws — every failure path returns an
// { ok:false, ... } result WITH a visible-fallback screenshot where one can be captured (§13/§32).
// Loud console.error on every failure path (never a silent swallow).
async function observe({ url, viewport, waitForSelector, waitMs, steps }, navTimeout) {
  const start = Date.now();
  const browser = await getBrowser();
  // ctx/page are created INSIDE the try so a throw from newContext/newPage/page.route still hits the
  // finally and closes the context — otherwise a setup failure under memory pressure leaks a
  // BrowserContext per call and can OOM the warm browser (peer-gate finding).
  let ctx = null, page = null, screenshot_b64 = null;
  try {
    ctx = await browser.newContext({ viewport: clampVp(viewport), deviceScaleFactor: 2 });
    page = await ctx.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS); // bound selector/handle ops; evaluate is bounded via withTimeout
    // §13 SSRF: block EVERY request (navigation + sub-resource) to a private/internal host. Covers a
    // redirect from a public url into an internal one AND any internal fetch the page tries.
    await page.route("**/*", async (route) => {
      try {
        const host = new URL(route.request().url()).hostname;
        if (await hostIsPrivate(host)) return route.abort("blockedbyclient");
        return route.continue();
      } catch {
        return route.abort("blockedbyclient");
      }
    });

    let response;
    try {
      response = await page.goto(String(url), { waitUntil: "networkidle", timeout: navTimeout });
    } catch (e) {
      console.error(`[paige-browser] navigation failed for ${url}:`, e?.message || e);
      screenshot_b64 = await captureScreenshotB64(page); // visible fallback of whatever rendered
      return { ok: false, url, error: `navigation failed: ${String(e?.message || e)}`, http_status: null, screenshot_b64, duration_ms: Date.now() - start };
    }

    const http_status = response ? response.status() : null;
    const final_url = page.url();
    // Re-assert the post-redirect url is public — a public start url can 30x into an internal host.
    try {
      await assertPublicUrl(final_url);
    } catch (e) {
      console.error(`[paige-browser] final_url blocked ${final_url}:`, e?.message || e);
      return { ok: false, url, final_url, error: `blocked redirect to private/internal host: ${String(e?.message || e)}`, http_status, screenshot_b64: null, duration_ms: Date.now() - start };
    }

    if (waitForSelector) await page.waitForSelector(String(waitForSelector), { timeout: 10000 }).catch(() => {});
    if (waitMs) await page.waitForTimeout(Math.min(8000, Math.max(0, Number(waitMs) || 0)));

    const title = await page.title().catch(() => "");
    const text_excerpt = await extractText(page);
    screenshot_b64 = await captureScreenshotB64(page);
    const stepResults = await runSteps(page, steps);

    return { ok: true, url, final_url, http_status, title, text_excerpt, screenshot_b64, steps: stepResults, duration_ms: Date.now() - start };
  } catch (e) {
    console.error(`[paige-browser] observe error for ${url}:`, e?.message || e);
    if (!screenshot_b64 && page) screenshot_b64 = await captureScreenshotB64(page);
    return { ok: false, url, error: String(e?.message || e), screenshot_b64, duration_ms: Date.now() - start };
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}

// Hard overall run cap: race the observation against a backstop timer that resolves to an honest
// ok:false. observe() bounds itself with nav/step timeouts; this is the last-resort ceiling. observe
// still closes its own context via its finally even if the timer wins the race.
function withHardCap(promise, ms, url, start) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.error(`[paige-browser] run exceeded hard cap ${ms}ms for ${url}`);
      resolve({ ok: false, url, error: `run exceeded hard cap ${ms}ms`, duration_ms: Date.now() - start });
    }, ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function auth(req, res) {
  if (!SECRET) { res.status(500).json({ error: "misconfigured: no shared secret" }); return false; }
  if (!timingSafeEqual(req.get("X-Browser-Secret") || "", SECRET)) { res.status(401).json({ error: "bad secret" }); return false; }
  return true;
}

// In-process concurrency counter (soft cap). Over the cap -> 429 so the caller retries rather than
// piling work onto one shared-cpu-1x machine.
let inFlight = 0;

app.post("/self-verify", async (req, res) => {
  if (!auth(req, res)) return;
  const { url } = req.body || {};
  if (!url || !/^https?:\/\//i.test(String(url))) return res.status(400).json({ ok: false, error: "valid http(s) url required" });
  try {
    await assertPublicUrl(url);
  } catch (e) {
    return res.status(400).json({ ok: false, url, error: `url rejected: ${String(e?.message || e)}` });
  }

  if (inFlight >= MAX_CONCURRENT) {
    return res.status(429).json({ ok: false, error: "busy, retry" });
  }

  inFlight++;
  const start = Date.now();
  try {
    const result = await withHardCap(observe(req.body, NAV_TIMEOUT_MS), RUN_CAP_MS, String(url), start);
    return res.status(200).json(result);
  } catch (e) {
    // observe() is written not to throw, but a truly unexpected error still returns a structured
    // honest result (200 ok:false) — the caller always needs the observation shape, never a 5xx.
    console.error(`[paige-browser] /self-verify unexpected error for ${url}:`, e?.message || e);
    return res.status(200).json({ ok: false, url, error: String(e?.message || e), duration_ms: Date.now() - start });
  } finally {
    inFlight--;
  }
});

app.listen(PORT, () => console.log(`[paige-browser] listening on :${PORT}`));
