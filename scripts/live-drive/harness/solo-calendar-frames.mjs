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

  // The wire, made deterministic.
  //
  // An ABORTED request is not a neutral no-op: the shell's own reads (the notifications bell, for
  // one) fail, and a half-rendered shell is then photographed as though it were the surface. So
  // any Supabase call this harness does not have a fixture for is answered with an empty result
  // AND RECORDED, rather than aborted. Recording matters — an empty answer that nobody can see is
  // how a missing fixture turns into "the feature has no data" in a reviewer's mind.
  const unfixtured = [];
  await ctx.route("**://**", (route) => {
    const url = route.request().url();
    if (url.includes("/rest/v1/rpc/list_team_bookings")) return route.fulfill(json(BOOKINGS));
    if (url.includes("/rest/v1/rpc/admin_set_booking_status")) return route.fulfill(json(null));
    if (url.includes("/rest/v1/rpc/create_internal_booking")) return route.fulfill(json(null));
    if (url.includes("/rest/v1/calendars")) return route.fulfill(json(CALENDARS));
    if (url.includes("/auth/v1/user")) return route.fulfill(json(USER));
    if (url.includes("harness.invalid")) { unfixtured.push(new URL(url).pathname); return route.fulfill(json([])); }
    if (url.startsWith(origin) || url.startsWith("file://")) return route.continue();
    if (FONT_HOSTS.some((host) => url.includes(host))) return route.continue();
    return route.abort();
  });

  const page = await ctx.newPage();
  await page.addInitScript(clockScript(FIXED_NOW));
  // `pageerror` alone is blind to how this harness actually fails. A 404 on the entry module, an
  // aborted fetch, and a React error-boundary catch all surface as CONSOLE errors and never reach
  // window.onerror — so a run could report `errors: []` over a blank page.
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 180)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 180)); });
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url().slice(0, 120) + " " + (r.failure()?.errorText || "")));
  await page.goto(`${BASE}/solo-calendar.html?theme=${theme}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  return { ctx, page, errors, unfixtured };
}

/**
 * Every invariant the form-fit standard requires, measured rather than asserted from source.
 *
 * DO NOT MEASURE `documentElement` FOR HORIZONTAL OVERFLOW. `src/index.css:737` sets
 * `body { overflow-x: hidden }`, which clamps `documentElement.scrollWidth` to its client width —
 * so a documentElement-based check reports 0 for a surface that genuinely overflows and is being
 * silently clipped. That assertion cannot fail, and it was the headline claim of this harness
 * until an adversarial read caught it. Body scroll width still grows, and per-container overflow
 * is the only way to find the element actually doing it, so both are measured and both are
 * asserted.
 */
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
    // Any element that clips or scrolls horizontally AND has content wider than its box —
    // i.e. content the reader cannot get to. Two things are NOT that, and are excluded because
    // flagging them buries the real finding under noise:
    //   - `text-overflow: ellipsis`, which is truncation the design chose and SIGNALS with an
    //     ellipsis (the full value is reachable elsewhere, e.g. the detail drawer);
    //   - visually-hidden live regions (the 1x1px `clip` pattern), whose box is not a layout.
    const hOverflow = [...document.querySelectorAll("*")].filter((el) => {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll|hidden)/.test(cs.overflowX)) return false;
      if (cs.textOverflow === "ellipsis") return false;
      if (el.clientWidth <= 1 || el.clientHeight <= 1) return false;
      return el.scrollWidth - el.clientWidth > 1;
    }).map((el) => ({
      cls: (typeof el.className === "string" ? el.className : "").split(/\s+/).filter(Boolean).slice(0, 3).join(".") || el.tagName.toLowerCase(),
      by: el.scrollWidth - el.clientWidth,
    }));
    const pg = document.querySelector("[data-pg]");
    const events = [...document.querySelectorAll(".sc-ev")];
    const tints = [...new Set(events.map((el) => el.style.getPropertyValue("--sc-ev-color").trim()))].filter(Boolean).sort();
    // Which faces ACTUALLY painted. `document.fonts.check()` is NOT usable here: it returns true
    // for a family that does not exist at all, so it reported "faces ok" on every frame including
    // ones rendered entirely in fallback. Ask the font set what loaded, and ask the element what
    // it is actually painted in.
    const loadedFaces = [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family))].sort();
    const paintedOn = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim() : null;
    };
    return {
      docOverflowX: de.scrollWidth - de.clientWidth,
      docOverflowY: de.scrollHeight - de.clientHeight,
      bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
      hOverflow,
      h1: document.querySelectorAll("h1").length,
      pgAttr: pg ? pg.getAttribute("data-pg") : null,
      pgBg: pg ? getComputedStyle(pg).backgroundColor : null,
      scrollers,
      eventCount: events.length,
      tints,
      loadedFaces,
      paintedRange: paintedOn(".sc-range"),
      mountWidth: (() => { const m = document.querySelector(".trc-canonical-mount--direct");
        return m ? Math.round(m.getBoundingClientRect().width) : null; })(),
      paigeVisible: (() => { const p = document.getElementById("tenant-paige-workspace");
        return !!p && p.offsetWidth > 0 && p.offsetHeight > 0; })(),
      paigeWidth: (() => { const p = document.getElementById("tenant-paige-workspace");
        return p ? Math.round(p.getBoundingClientRect().width) : 0; })(),
      rangeLabel: (document.querySelector(".sc-range") || {}).textContent || null,
      conflictFlags: document.querySelectorAll(".sc-ev--conflict").length,
      offEvents: document.querySelectorAll(".sc-ev--off").length,
      errorState: /couldn.{0,3}t load this range/i.test(document.body.innerText),
      bodyText: document.body.innerText.slice(0, 400),
    };
  });
}

/**
 * Can the calendar's own controls be REACHED at this width?
 *
 * Counts controls, not boxes. `.sc-rail` keeps a non-zero offsetWidth even when its body is
 * hidden, so a 204px empty column would otherwise pass as "rail visible".
 */
async function controlsReachable(page) {
  return page.evaluate(() => {
    const rail = document.querySelector(".sc-rail");
    const railChecks = rail ? rail.querySelectorAll(".sc-check").length : 0;
    const railVisible = !!rail && rail.offsetWidth > 0 && railChecks > 0;
    const optionBtn = [...document.querySelectorAll("button")]
      .find((b) => /view options/i.test(b.textContent || ""));
    const viewOptionsOffered = !!optionBtn && optionBtn.offsetWidth > 0;
    return {
      railVisible, railChecks,
      railWidth: rail ? rail.offsetWidth : 0,
      viewOptionsOffered,
      ok: railVisible || viewOptionsOffered,
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

/** Opens PAIGE and lets a failure THROW. A swallowed click produced 8 frames labelled
 *  "paige open" that were byte-identical to the folded ones. */
async function openPaige(page) {
  const btn = page.locator("[data-tenant-paige-command]").first();
  if (!(await btn.count())) throw new Error("PAIGE command field not found — cannot capture the open state");
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(800);
}

const results = [];
const browser = await chromium.launch(chromePath() ? { executablePath: chromePath() } : {});
fs.mkdirSync(ART, { recursive: true });

const EXPECT = { events: 10, conflicts: 2, off: 2, range: /^Aug 23 – 29, 2026$/, tints: 4 };

for (const vp of VIEWPORTS) {
  for (const theme of ["dark", "light"]) {
    for (const paige of [false, true]) {
      const name = `${vp.w}x${vp.h}-${theme}-paige-${paige ? "open" : "folded"}`;
      const { ctx, page, errors, unfixtured } = await openPage(browser, { ...vp, theme });
      if (paige) await openPaige(page);
      const m = await measure(page);
      const controls = await controlsReachable(page);

      // The label reports MEASURED state, never requested state. A theme that failed to resolve
      // would otherwise be captured under the name of the theme that was asked for.
      const facesOk = m.loadedFaces.includes("Schibsted Grotesk");
      await label(page, `harness render · not live   solo/clients/calendar   ` +
        `${m.pgAttr === "dark" ? "obsidian" : "mineral"} (measured)   ${vp.w}x${vp.h}   ` +
        `paige ${m.paigeVisible ? m.paigeWidth + "px" : "closed"}   ` +
        `body overflow-x ${m.bodyOverflowX}   ` +
        `${m.eventCount} events / ${m.conflictFlags} conflicts   ` +
        `${facesOk ? "faces loaded" : "⚠ FACES NOT LOADED — fallback type"}`);
      const file = path.join(ART, `${name}.png`);
      await page.screenshot({ path: file });
      results.push({ name, file, viewport: vp, theme, paige, measure: m, controls, facesOk, errors, unfixtured: [...new Set(unfixtured)] });
      await ctx.close();
    }
  }
}
await browser.close();

let failures = 0;
for (const r of results) {
  const m = r.measure, bad = [];
  // Horizontal overflow, measured where it can actually be non-zero.
  if (m.bodyOverflowX > 0) bad.push(`body overflow-x +${m.bodyOverflowX}`);
  if (m.hOverflow.length) bad.push(`clipped: ${m.hOverflow.map((h) => h.cls + " +" + h.by).join(", ")}`);
  // The surface actually RENDERED. Without these, an error state or an empty [] passes every frame.
  if (m.errorState) bad.push("error state rendered");
  if (m.eventCount !== EXPECT.events) bad.push(`${m.eventCount} events, expected ${EXPECT.events}`);
  if (m.conflictFlags !== EXPECT.conflicts) bad.push(`${m.conflictFlags} conflicts, expected ${EXPECT.conflicts}`);
  if (m.offEvents !== EXPECT.off) bad.push(`${m.offEvents} released, expected ${EXPECT.off}`);
  if (!EXPECT.range.test((m.rangeLabel || "").trim())) bad.push(`range "${(m.rangeLabel || "").trim()}"`);
  // The theme that rendered is the theme that was asked for.
  if (m.pgAttr !== r.theme) bad.push(`pg=${m.pgAttr}, requested ${r.theme}`);
  // The PAIGE state the frame is named after.
  if (m.paigeVisible !== r.paige) bad.push(`paige ${m.paigeVisible ? "open" : "closed"}, requested ${r.paige ? "open" : "closed"}`);
  if (m.h1 > 0) bad.push(`${m.h1} h1`);
  if (!r.controls.ok) bad.push("controls unreachable");
  if (!r.facesOk) bad.push("intended faces not loaded — type in these frames is fallback");
  if (r.errors.length) bad.push(`errors: ${r.errors[0]}`);
  if (bad.length) failures++;
  console.log(`${bad.length ? "FAIL" : "PASS"}  ${r.name}`);
  console.log(`      bodyX ${m.bodyOverflowX}  docX ${m.docOverflowX} (clamped by body overflow-x:hidden — not evidence)` +
    `  h1 ${m.h1}  events ${m.eventCount}  conflicts ${m.conflictFlags}  off ${m.offEvents}`);
  console.log(`      pg=${m.pgAttr} ${m.pgBg}  mount ${m.mountWidth}px  paige ${m.paigeVisible ? m.paigeWidth + "px" : "closed"}` +
    `  rail ${r.controls.railWidth}px/${r.controls.railChecks} checks  viewOptions ${r.controls.viewOptionsOffered}`);
  if (r.unfixtured.length) console.log(`      note: answered empty (no fixture): ${r.unfixtured.join(", ")}`);
  console.log(`      tints ${JSON.stringify(m.tints)}  faces ${JSON.stringify(m.loadedFaces)}  range="${(m.rangeLabel||"").trim()}"  painted=${m.paintedRange}`);
  if (bad.length) console.log(`      >>> ${bad.join(" | ")}`);
}

// Cross-frame assertions. Individually every frame can pass while the SET proves nothing:
// if the container query never fires, the rail is visible at all four widths and "controls
// reachable" is true everywhere without the narrow case ever being exercised.
const railHidden = results.filter((r) => !r.controls.railVisible && r.controls.viewOptionsOffered);
const railShown = results.filter((r) => r.controls.railVisible);
const suite = [];
if (!railHidden.length) suite.push("the container breakpoint NEVER fired — no frame hid the rail, so the narrow fallback is unexercised");
if (!railShown.length) suite.push("no frame showed the rail");
if (results.some((r) => r.measure.mountWidth == null)) suite.push("the .trc-canonical-mount--direct wrapper is missing — container queries are dead");
for (const vp of VIEWPORTS) {
  const d = results.find((r) => r.viewport.w === vp.w && r.theme === "dark" && !r.paige);
  const l = results.find((r) => r.viewport.w === vp.w && r.theme === "light" && !r.paige);
  if (d && l && d.measure.pgBg === l.measure.pgBg) suite.push(`${vp.w}px: Obsidian and Mineral resolved to the SAME ground ${d.measure.pgBg}`);
}
for (const s2 of suite) console.log(`FAIL  suite: ${s2}`);
failures += suite.length;

fs.writeFileSync(path.join(ART, "report.json"), JSON.stringify({ results, suite }, null, 2));
console.log(`\n${results.length} frames, ${failures} failing (incl. ${suite.length} suite-level)`);
if (failures) process.exitCode = 1;
