#!/usr/bin/env node
/**
 * solo-calendar-frames — render Solo → Clients → Calendar and hand the owner something to LOOK at.
 *
 * The surface is auth-gated, so the alternative to this is the owner logging in to judge it, or
 * nobody judging it at all. It drives the SHIPPED shell and the SHIPPED workspace; only the HTTP
 * responses are deterministic, fulfilled here at the network layer so the real hook does its real
 * parsing, conflict detection and colour resolution on the way to the pixels.
 *
 * THE CLOCK IS PINNED. `new Date()` returns a fixed instant, so the week under review is always
 * Sun 23 – Sat 29 Aug 2026. Without this the frames drift with the day they were captured and two
 * runs cannot be compared.
 *
 * EVERY FRAME IS LABELLED, and the run REFUSES to write an unlabelled one — image metadata dies
 * the moment a PNG is pasted into a conversation, and an unlabelled theme frame has misled a
 * reader here before.
 *
 * WHAT THIS IS NOT (§13/§32.c): not a deployed render, not an authenticated one. No RLS, no real
 * row, no real tenant. The authenticated live drive on the deployed surface stays OWED.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { BOOKINGS, CALENDARS, FIXED_NOW, USER } from "./solo-calendar-fixtures.mjs";

const ART = path.resolve(import.meta.dirname, "../artifacts/solo-calendar");
const BASE = process.env.FRAMES_URL || "http://127.0.0.1:5199";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "api.fontshare.com"];
const FACES = [["Schibsted Grotesk", "display + UI"], ["JetBrains Mono", "data"]];

/** The four Solo desktop/tablet frames the form-fit standard names. */
const VIEWPORTS = [
  { w: 1536, h: 770 }, { w: 1366, h: 768 }, { w: 1024, h: 768 }, { w: 900, h: 1000 },
];

function chromePath() {
  if (process.env.PW_EXECUTABLE_PATH) return process.env.PW_EXECUTABLE_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  return fs.readdirSync(base).filter((d) => d.startsWith("chromium-"))
    .map((d) => path.join(base, d, "chrome-linux/chrome")).find((p) => fs.existsSync(p));
}

const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

/** Pins the clock BEFORE any app module evaluates, leaving timers and date arithmetic intact. */
function clockScript(now) {
  return `(() => {
    const FIXED = ${now};
    const Real = Date;
    function D(...a) {
      if (!(this instanceof D)) return new Real(FIXED).toString();
      return a.length === 0 ? new Real(FIXED) : new Real(...a);
    }
    D.prototype = Real.prototype;
    D.now = () => FIXED;
    D.parse = Real.parse;
    D.UTC = Real.UTC;
    globalThis.Date = D;
  })();`;
}

async function openPage(browser, { w, h, theme, reducedMotion }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    colorScheme: theme,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  const origin = new URL(BASE).origin;

  // The wire, made deterministic. Everything else off-origin is aborted, so a stray call is loud.
  await ctx.route("**://**", (route) => {
    const url = route.request().url();
    if (url.includes("/rest/v1/rpc/list_team_bookings")) return route.fulfill(json(BOOKINGS));
    if (url.includes("/rest/v1/rpc/admin_set_booking_status")) return route.fulfill(json(null));
    if (url.includes("/rest/v1/rpc/create_internal_booking")) return route.fulfill(json(null));
    if (url.includes("/rest/v1/calendars")) return route.fulfill(json(CALENDARS));
    if (url.includes("/auth/v1/user")) return route.fulfill(json(USER));
    if (url.startsWith(origin) || url.startsWith("file://")) return route.continue();
    if (FONT_HOSTS.some((host) => url.includes(host))) return route.continue();
    return route.abort();
  });

  const page = await ctx.newPage();
  await page.addInitScript(clockScript(FIXED_NOW));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${BASE}/solo-calendar.html?theme=${theme}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  return { ctx, page, errors };
}

/** Every invariant the form-fit standard requires, measured rather than asserted from source. */
async function measure(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const scrollers = [...document.querySelectorAll("*")].filter((el) => {
      const cs = getComputedStyle(el);
      return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight - el.clientHeight > 4;
    }).map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === "string" ? el.className : "").split(/\s+/).filter(Boolean).slice(0, 3).join("."),
      range: el.scrollHeight - el.clientHeight,
    }));
    const pg = document.querySelector("[data-pg]");
    const events = [...document.querySelectorAll(".sc-ev")];
    const tints = [...new Set(events.map((el) => getComputedStyle(el).backgroundColor)
      .concat(events.map((el) => el.style.getPropertyValue("--sc-ev-color"))))].filter(Boolean);
    return {
      docOverflowX: de.scrollWidth - de.clientWidth,
      docOverflowY: de.scrollHeight - de.clientHeight,
      bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
      h1: document.querySelectorAll("h1").length,
      pgAttr: pg ? pg.getAttribute("data-pg") : null,
      pgBg: pg ? getComputedStyle(pg).backgroundColor : null,
      scrollers,
      eventCount: events.length,
      distinctTints: tints.length,
      mountWidth: (() => { const m = document.querySelector(".trc-canonical-mount--direct");
        return m ? Math.round(m.getBoundingClientRect().width) : null; })(),
      paigeVisible: (() => { const p = document.getElementById("tenant-paige-workspace");
        return !!p && p.offsetWidth > 0 && p.offsetHeight > 0; })(),
      paigeWidth: (() => { const p = document.getElementById("tenant-paige-workspace");
        return p ? Math.round(p.getBoundingClientRect().width) : 0; })(),
      rangeLabel: (document.querySelector(".sc-range") || {}).textContent || null,
      conflictFlags: document.querySelectorAll(".sc-ev--conflict").length,
      offEvents: document.querySelectorAll(".sc-ev--off").length,
      bodyText: document.body.innerText.slice(0, 400),
    };
  });
}

/** Can the calendar's own controls be reached at this width — rail visible, or drawer offered? */
async function controlsReachable(page) {
  return page.evaluate(() => {
    const rail = document.querySelector(".sc-rail");
    const railVisible = !!rail && rail.offsetWidth > 0 && rail.offsetHeight > 0;
    const optionBtn = [...document.querySelectorAll("button")]
      .find((b) => /view options/i.test(b.textContent || ""));
    return {
      railVisible,
      railWidth: rail ? rail.offsetWidth : 0,
      viewOptionsOffered: !!optionBtn && optionBtn.offsetWidth > 0,
      ok: railVisible || (!!optionBtn && optionBtn.offsetWidth > 0),
    };
  });
}

async function label(page, text) {
  await page.evaluate((t) => {
    document.querySelectorAll("[data-harness-label]").forEach((n) => n.remove());
    const el = document.createElement("div");
    el.textContent = t;
    el.setAttribute("data-harness-label", "");
    Object.assign(el.style, {
      position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "2147483647",
      background: "repeating-linear-gradient(45deg,#7a1020,#7a1020 12px,#5c0c18 12px,#5c0c18 24px)",
      color: "#fff", font: "700 11px/24px ui-monospace,monospace", letterSpacing: ".06em",
      textAlign: "center", textTransform: "uppercase", pointerEvents: "none",
    });
    document.body.appendChild(el);
  }, text);
  const ok = await page.evaluate(() => {
    const el = document.querySelector("[data-harness-label]");
    if (!el) return null;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return { w: Math.round(r.width), on: r.bottom <= innerHeight + 1 && r.height > 0,
      vis: cs.visibility !== "hidden" && Number(cs.opacity) > 0.9 };
  });
  const vw = page.viewportSize().width;
  if (!ok || !ok.on || !ok.vis || ok.w < vw * 0.9) {
    throw new Error(`refusing to write an unlabelled frame: ${JSON.stringify(ok)}`);
  }
}

async function openPaige(page) {
  const btn = page.locator("[data-tenant-paige-command]").first();
  if (await btn.count()) { await btn.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(700); }
}

const results = [];
const browser = await chromium.launch(chromePath() ? { executablePath: chromePath() } : {});
fs.mkdirSync(ART, { recursive: true });

for (const vp of VIEWPORTS) {
  for (const theme of ["dark", "light"]) {
    for (const paige of [false, true]) {
      const name = `${vp.w}x${vp.h}-${theme}-paige-${paige ? "open" : "folded"}`;
      const { ctx, page, errors } = await openPage(browser, { ...vp, theme });
      if (paige) await openPaige(page);
      const m = await measure(page);
      const controls = await controlsReachable(page);
      const faces = await page.evaluate((wanted) => Object.fromEntries(
        wanted.map(([f]) => [f, document.fonts.check(`14px "${f}"`)])), FACES);
      const missing = Object.entries(faces).filter(([, v]) => !v).map(([f]) => f);
      await label(page, `harness render · not live   solo/clients/calendar   ${theme === "dark" ? "obsidian" : "mineral"}   ` +
        `${vp.w}x${vp.h}   paige ${paige ? "open" : "folded"}   ` +
        `overflowX ${m.docOverflowX}   controls ${controls.ok ? "reachable" : "UNREACHABLE"}   ` +
        (missing.length ? `FACE MISSING: ${missing.join(",")}` : "faces ok"));
      const file = path.join(ART, `${name}.png`);
      await page.screenshot({ path: file });
      results.push({ name, file, viewport: vp, theme, paige, measure: m, controls, faces, errors });
      await ctx.close();
    }
  }
}
await browser.close();

let failures = 0;
for (const r of results) {
  const bad = [];
  if (r.measure.docOverflowX > 0) bad.push(`documentX +${r.measure.docOverflowX}`);
  if (r.measure.h1 > 0) bad.push(`${r.measure.h1} h1`);
  if (!r.controls.ok) bad.push("controls unreachable");
  if (r.errors.length) bad.push(`page errors: ${r.errors[0]}`);
  if (bad.length) failures++;
  console.log(`${bad.length ? "FAIL" : "PASS"}  ${r.name}`);
  console.log(`      overflowX ${r.measure.docOverflowX}  overflowY ${r.measure.docOverflowY}  h1 ${r.measure.h1}` +
    `  events ${r.measure.eventCount}  tints ${r.measure.distinctTints}  conflicts ${r.measure.conflictFlags}` +
    `  off ${r.measure.offEvents}  pg=${r.measure.pgAttr}  mount ${r.measure.mountWidth}px` +
    `  paige ${r.measure.paigeVisible ? r.measure.paigeWidth + "px" : "closed"}  range="${(r.measure.rangeLabel||'').trim()}"`);
  console.log(`      rail ${r.controls.railWidth}px  viewOptions ${r.controls.viewOptionsOffered}  scrollers ${JSON.stringify(r.measure.scrollers.slice(0, 3))}`);
  if (bad.length) console.log(`      >>> ${bad.join(" | ")}`);
}
fs.writeFileSync(path.join(ART, "report.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.length} frames, ${failures} failing -> ${ART}`);
