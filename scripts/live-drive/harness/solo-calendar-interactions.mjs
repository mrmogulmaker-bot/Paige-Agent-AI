#!/usr/bin/env node
/**
 * solo-calendar-interactions — drive the surface, not just photograph it.
 *
 * The frame run answers "does it read right?". This answers "does it WORK?" — the detail drawer,
 * the keyboard contract, the narrow-width fallback, and whether reduced motion is actually
 * honoured rather than merely declared. Each step asserts, then captures the state it asserted,
 * so a reader can see the thing the assertion is about.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { BOOKINGS, CALENDARS, FIXED_NOW, USER } from "./solo-calendar-fixtures.mjs";

const ART = path.resolve(import.meta.dirname, "../artifacts/solo-calendar");
const BASE = process.env.FRAMES_URL || "http://127.0.0.1:5199";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "api.fontshare.com"];

function chromePath() {
  if (process.env.PW_EXECUTABLE_PATH) return process.env.PW_EXECUTABLE_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  return fs.readdirSync(base).filter((d) => d.startsWith("chromium-"))
    .map((d) => path.join(base, d, "chrome-linux/chrome")).find((p) => fs.existsSync(p));
}
const json = (b) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
const clockScript = (now) => `(() => { const F=${now}, R=Date;
  function D(...a){ if(!(this instanceof D)) return new R(F).toString(); return a.length?new R(...a):new R(F); }
  D.prototype=R.prototype; D.now=()=>F; D.parse=R.parse; D.UTC=R.UTC; globalThis.Date=D; })();`;

async function open(browser, { w, h, theme, reduced }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, colorScheme: theme,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const origin = new URL(BASE).origin;
  await ctx.route("**://**", (r) => {
    const u = r.request().url();
    if (u.includes("/rest/v1/rpc/list_team_bookings")) return r.fulfill(json(BOOKINGS));
    if (u.includes("/rest/v1/rpc/admin_set_booking_status")) return r.fulfill(json(null));
    if (u.includes("/rest/v1/rpc/create_internal_booking")) return r.fulfill(json(null));
    if (u.includes("/rest/v1/calendars")) return r.fulfill(json(CALENDARS));
    if (u.includes("/auth/v1/user")) return r.fulfill(json(USER));
    if (u.startsWith(origin) || u.startsWith("file://")) return r.continue();
    if (FONT_HOSTS.some((x) => u.includes(x))) return r.continue();
    return r.abort();
  });
  const page = await ctx.newPage();
  await page.addInitScript(clockScript(FIXED_NOW));
  await page.goto(`${BASE}/solo-calendar.html?theme=${theme}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  return { ctx, page };
}

async function label(page, text) {
  await page.evaluate((t) => {
    document.querySelectorAll("[data-harness-label]").forEach((n) => n.remove());
    const el = document.createElement("div");
    el.textContent = t; el.setAttribute("data-harness-label", "");
    Object.assign(el.style, { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2147483647,
      background: "repeating-linear-gradient(45deg,#7a1020,#7a1020 12px,#5c0c18 12px,#5c0c18 24px)",
      color: "#fff", font: "700 11px/24px ui-monospace,monospace", letterSpacing: ".06em",
      textAlign: "center", textTransform: "uppercase", pointerEvents: "none" });
    document.body.appendChild(el);
  }, text);
  const ok = await page.evaluate(() => !!document.querySelector("[data-harness-label]"));
  if (!ok) throw new Error("refusing to write an unlabelled frame");
}

const shot = async (page, name) => page.screenshot({ path: path.join(ART, `${name}.png`) });
const results = [];
const record = (step, ok, detail) => { results.push({ step, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${step}\n      ${detail}`); };

const browser = await chromium.launch(chromePath() ? { executablePath: chromePath() } : {});
fs.mkdirSync(ART, { recursive: true });

// ---- 1. Detail drawer + the keyboard contract, at the widest frame -------------------------
for (const theme of ["dark", "light"]) {
  const { ctx, page } = await open(browser, { w: 1536, h: 770, theme });
  const chip = page.locator(".sc-ev").first();
  await chip.evaluate((el) => el.setAttribute("data-harness-opener", ""));
  await chip.click();
  await page.waitForTimeout(500);
  const drawer = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return d ? { present: true, modal: d.getAttribute("aria-modal"), text: d.innerText.slice(0, 220) } : { present: false };
  });
  record(`drawer opens (${theme})`, drawer.present, `role=dialog present=${drawer.present} aria-modal=${drawer.modal}`);
  await label(page, `harness render · not live   detail drawer   ${theme === "dark" ? "obsidian" : "mineral"}   1536x770`);
  await shot(page, `interaction-drawer-${theme}`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    closed: !document.querySelector('[role="dialog"]'),
    focusRestored: document.activeElement?.hasAttribute("data-harness-opener") === true,
    activeTag: document.activeElement?.className || document.activeElement?.tagName,
  }));
  record(`escape closes + restores focus (${theme})`,
    after.closed && after.focusRestored, `closed=${after.closed} focusRestored=${after.focusRestored} active=${after.activeTag}`);
  await ctx.close();
}

// ---- 2. The narrow-width fallback actually carries the rail's controls ----------------------
{
  const { ctx, page } = await open(browser, { w: 900, h: 1000, theme: "dark" });
  const railHidden = await page.evaluate(() => {
    const r = document.querySelector(".sc-rail");
    return !r || r.offsetWidth === 0;
  });
  const opener = page.locator("button", { hasText: /view options/i }).first();
  await opener.click();
  await page.waitForTimeout(450);
  // Read the CONTROLS, not innerText. innerText applies `text-transform`, so the group head
  // "Settings" reads back as "SETTINGS" and a case-sensitive match reports a missing control
  // that is plainly there. That false failure happened here before this comment existed.
  const body = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return d ? [...d.querySelectorAll("button")].map((b) => (b.textContent || "").trim()) : [];
  });
  const carries = ["Calendars", "Colour by", "Settings"]
    .filter((want) => body.some((t) => t.toLowerCase() === want.toLowerCase()));
  record("narrow fallback carries the rail's controls",
    railHidden && carries.length === 3,
    `rail hidden=${railHidden}; drawer carries ${carries.join(", ") || "NOTHING"} (of 3)`);
  await label(page, "harness render · not live   view options (rail hidden)   obsidian   900x1000");
  await shot(page, "interaction-view-options-900");
  await ctx.close();
}

// ---- 3. Month view ---------------------------------------------------------------------------
{
  const { ctx, page } = await open(browser, { w: 1536, h: 770, theme: "dark" });
  const monthBtn = page.locator("button", { hasText: /^Month$/i }).first();
  if (await monthBtn.count()) { await monthBtn.click(); await page.waitForTimeout(500); }
  const m = await page.evaluate(() => ({
    range: (document.querySelector(".sc-range") || {}).textContent,
    events: document.querySelectorAll(".sc-ev").length,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  record("month view renders without horizontal overflow",
    m.overflowX === 0 && m.events > 0, `range="${m.range}" events=${m.events} overflowX=${m.overflowX}`);
  await label(page, `harness render · not live   month view   obsidian   1536x770   overflowX ${m.overflowX}`);
  await shot(page, "interaction-month-dark");
  await ctx.close();
}

// ---- 4. Reduced motion is HONOURED, not merely declared --------------------------------------
{
  const { ctx, page } = await open(browser, { w: 1536, h: 770, theme: "dark", reduced: true });
  const motion = await page.evaluate(() => {
    const durations = [];
    for (const el of document.querySelectorAll(".sc-ev, .sc-btn, .sc-group-head, .sc-rail")) {
      const cs = getComputedStyle(el);
      durations.push(cs.transitionDuration, cs.animationDuration);
    }
    // "Honoured" means effectively instant, not literally the string "0s". The reduce idiom in
    // this codebase resolves to 1e-05s, which a `!== "0s"` test reports as still animating.
    const parse = (v) => Math.max(...String(v).split(",").map((x) => parseFloat(x) || 0));
    const moving = durations.filter((d) => parse(d) > 0.001);
    return { total: durations.length, nonZero: moving.length,
      sample: [...new Set(moving)].slice(0, 4), observed: [...new Set(durations)].slice(0, 4) };
  });
  record("reduced motion honoured", motion.nonZero === 0,
    `${motion.total} declarations inspected, ${motion.nonZero} above 1ms; observed durations ${motion.observed.join(", ")}`);
  await label(page, "harness render · not live   prefers-reduced-motion: reduce   obsidian   1536x770");
  await shot(page, "interaction-reduced-motion");
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(ART, "interactions.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.length} interaction checks, ${failed.length} failing`);
