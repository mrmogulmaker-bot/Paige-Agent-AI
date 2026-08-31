#!/usr/bin/env node
/**
 * connections-calendars-usable-drive — prove a HUMAN can finish the job (§70).
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT THE OTHER DRIVE. `connections-calendars-drive`
 * measures GEOMETRY: does the page scroll once, does anything own a scrollbar, do
 * the fold-outs open. Every one of its checks can pass on a surface where a person
 * types a new name, presses Save, and nothing whatsoever happens. That gap is what
 * §70 exists to close: reading `onChange={set("type", …)}` proves a handler is
 * bound; it proves nothing about whether the owner can create a calendar, change
 * it, save it, and see it hold.
 *
 * So this drive CLICKS and TYPES, and — the part that actually matters — asserts
 * the value SURVIVES A RE-READ. The harness store persists writes, so a save that
 * silently discarded its patch fails here instead of passing quietly.
 *
 * WHAT IT PROVES: the shipped component, the shipped hook and the shipped CSS
 * carry a real person through each flow against a faithful in-memory store.
 * WHAT IT DOES NOT PROVE (§13/§32.c): production RLS, Postgres constraints, or any
 * provider. The rows are synthetic; the authenticated drive of the DEPLOYED
 * surface remains owed to a session that holds credentials.
 *
 *   node scripts/live-drive/connections-calendars-usable-drive.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, "../..");
const ART = path.join(HERE, "artifacts", "connections-calendars-usable");
const BASE = "http://127.0.0.1:5201";

/** The frames the assignment names, all desktop. */
const FRAMES = [
  { w: 1536, h: 770 },
  { w: 1366, h: 768 },
  { w: 1024, h: 768 },
  { w: 900, h: 1000 },
];

function startVite() {
  const child = spawn(
    "npx",
    ["vite", "--config", "scripts/live-drive/harness/connections-mount/vite.config.ts"],
    { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] },
  );
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("vite did not start in 90s")), 90_000);
    const watch = (buf) => {
      const line = String(buf);
      if (line.includes("ready in") || line.includes("Local:")) { clearTimeout(timer); resolve(child); }
    };
    child.stdout.on("data", watch);
    child.stderr.on("data", watch);
    child.on("exit", (c) => { clearTimeout(timer); reject(new Error(`vite exited ${c}`)); });
  });
}

const peek = (page) => page.evaluate(() => {
  const db = window.__harnessStore;
  if (!db) return { hook: typeof window.__harnessStore, keys: Object.keys(window).filter((k) => k.startsWith("__")) };
  const c = (db.calendars || [])[0];
  const ss = (() => { try { return Object.keys(sessionStorage).filter((k) => k.includes("harness")); } catch { return "blocked"; } })();
  return c ? { id: c.id, title: c.title, type: c.type, buf: c.buffer_before_min, ss } : { rows: (db.calendars || []).length, ss };
});

const results = [];
const record = (flow, ok, detail) => {
  results.push({ flow, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${flow}${detail ? ` — ${detail}` : ""}`);
};

/** Open the surface and wait for it to actually be there. */
async function open(page, query = "") {
  await page.goto(`${BASE}/${query}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".cc-area, .cc-empty", { timeout: 20_000 });
}

const areaByTitle = (page, title) =>
  page.locator(".cc-area").filter({ has: page.locator(".cc-area-t", { hasText: title }) });

/** Open a fold-out by its title, so a body's controls are reachable. */
async function openArea(page, title) {
  const area = areaByTitle(page, title).first();
  const body = area.locator(".cc-area-b");
  if (!(await body.count()) || !(await body.first().isVisible())) {
    await area.locator(".cc-area-t").first().click();
  }
  await area.locator(".cc-area-b").first().waitFor({ state: "visible", timeout: 10_000 });
  return area;
}

/** Press the save bar's primary action and wait for it to settle. */
async function save(page) {
  const act = page.locator(".cc-bar button", { hasText: /^\s*Save/ }).first();
  if (!(await act.count())) return { pressed: false };
  if (await act.isDisabled()) return { pressed: false, disabled: true };
  await act.click();
  await page.waitForTimeout(400);
  return { pressed: true };
}

/* ------------------------------------------------------------------ flows */

/** 1 · A person with no calendars at all can make their first one. */
async function flowFirstPreset(page) {
  await open(page, "?data=empty");
  const empty = page.locator(".cc-empty");
  if (!(await empty.count())) return record("1 · first preset from the empty state", false, "no empty state rendered");

  const input = page.locator(".cc-new .cc-in").first();
  if (!(await input.count())) return record("1 · first preset from the empty state", false, "no create field offered");

  await input.fill("Harness intro call");
  await page.locator(".cc-new button", { hasText: /Create/i }).first().click();
  await page.waitForTimeout(700);

  // The proof is not the click — it is that the surface now HOLDS the calendar.
  const areas = await page.locator(".cc-area").count();
  const named = await page.getByText("Harness intro call").count();
  record("1 · first preset from the empty state", areas >= 10 && named > 0,
    `areas=${areas} nameOnScreen=${named}`);
}

/** 2 · An existing preset can be edited and the edit SURVIVES a re-read. */
async function flowEditPersists(page) {
  await open(page);
  const details = await openArea(page, "Details");
  const title = details.locator(".cc-area-b input.cc-in").first();
  const before = await title.inputValue().catch(() => "<no input>");
  const fresh = `Harness renamed ${Date.now() % 100000}`;
  await title.fill(fresh);
  await page.waitForTimeout(150);
  const after = await title.inputValue().catch(() => "<no input>");
  const barSeen = await page.locator(".cc-bar").count();
  const actDisabled = await page.locator(".cc-bar button", { hasText: /^\s*Save/ }).first()
    .isDisabled().catch(() => "<no save button>");
  console.log(`      diag: before="${before}" after="${after}" saveBar=${barSeen} saveDisabled=${actDisabled}`);
  console.log(`      store BEFORE save: ${JSON.stringify(await peek(page))}`);
  const s = await save(page);
  console.log(`      store AFTER  save: ${JSON.stringify(await peek(page))}`);
  const noticeAfter = (await page.locator(".cc-notice").allInnerTexts().catch(() => [])).join(" | ");
  console.log(`      diag: notice after save = "${noticeAfter.slice(0, 120)}"`);
  if (!s.pressed) return record("2 · edit an existing preset and save", false, `save unavailable (${JSON.stringify(s)})`);

  // Re-open the surface from scratch. A value that only lived in React state
  // disappears here, which is exactly the failure this flow exists to catch.
  await open(page);
  console.log(`      store AFTER reload: ${JSON.stringify(await peek(page))}`);
  const back = await openArea(page, "Details");
  const persisted = await back.locator(".cc-area-b input.cc-in").first().inputValue().catch(() => "<none>");
  const alsoOnCard = await page.getByText(fresh).count();
  record("2 · edit an existing preset and save", persisted === fresh,
    `input after reload="${persisted}" (wanted "${fresh}") cardText=${alsoOnCard}`);
}

/** 3 · Individual vs round-robin is a choice a person can actually make. */
async function flowRoundRobin(page) {
  await open(page);
  await openArea(page, "Details");
  const sel = page.locator(".cc-area-b select.cc-sel").first();
  if (!(await sel.count())) return record("3 · choose individual or round-robin", false, "no type control");
  const options = await sel.locator("option").allTextContents();
  const picked = await sel.selectOption("round_robin").then(() => "by-value").catch((e) => `FAILED:${e.message.slice(0,60)}`);
  const afterPick = await sel.inputValue();
  const s2 = await save(page);
  console.log(`      diag: pick=${picked} valueAfterPick=${afterPick} save=${JSON.stringify(s2)}`);
  await open(page);
  const d2 = await openArea(page, "Details");
  const now = await d2.locator(".cc-area-b select.cc-sel").first().inputValue();
  record("3 · choose individual or round-robin", now === "round_robin",
    `options=[${options.join("|")}] persisted=${now}`);
}

/** 4 · The scheduling settings a person actually tunes, including the 15m buffer. */
async function flowBufferAndRules(page) {
  await open(page);
  const area = await openArea(page, "Booking rules");
  const has15 = await area.locator(".cc-chip", { hasText: /^15m$/ }).count();
  if (has15 < 1) return record("4 · booking rules · 15-minute buffer", false, "no 15m buffer chip offered");

  // The seed already holds 15m, so clicking 15m would assert nothing. Move to a
  // value the row does NOT have, prove that lands, then set 15m and prove THAT
  // lands — the 15-minute buffer the assignment names, actually exercised.
  const set = async (label) => {
    const a = await openArea(page, "Booking rules");
    await a.locator(".cc-chip", { hasText: new RegExp(`^${label}$`) }).first().click();
    await save(page);
    await open(page);
    const b = await openArea(page, "Booking rules");
    return b.locator(`.cc-chip[aria-pressed="true"]`, { hasText: new RegExp(`^${label}$`) }).count();
  };
  const moved = await set("30m");
  const back = await set("15m");
  record("4 · booking rules · 15-minute buffer", moved > 0 && back > 0,
    `30m persisted=${moved} then 15m persisted=${back}`);
}

/** 4b · Notifications / follow-ups are editable, not a read-only summary. */
async function flowNotifications(page) {
  await open(page);
  const area = await openArea(page, "Notifications");
  const controls = await area.locator("input, select, textarea, button").count();
  const enabled = await area.locator("input:not([disabled]), select:not([disabled]), textarea:not([disabled])").count();
  record("4b · notifications / follow-ups are editable", enabled > 0,
    `controls=${controls} enabled=${enabled}`);
}

/** 5 · Only providers with a real path offer an action; the rest say why. */
async function flowProviders(page) {
  await open(page);
  const accounts = page.locator(".cc-accounts");
  const text = await accounts.innerText().catch(() => "");
  const appleBtn = accounts.locator("button", { hasText: /Connect/i });
  let appleDisabled = null;
  const n = await appleBtn.count();
  for (let i = 0; i < n; i++) {
    const row = appleBtn.nth(i);
    const near = await row.locator("xpath=ancestor::*[contains(@class,'cc-acct')][1]").innerText().catch(() => "");
    if (/Apple/i.test(near)) appleDisabled = await row.isDisabled();
  }
  const mentionsOutlook = /outlook/i.test(text);
  record("5 · providers: real paths only, others honestly unavailable",
    appleDisabled === true && !mentionsOutlook,
    `appleConnectDisabled=${appleDisabled} mentionsOutlook=${mentionsOutlook}`);
}

/** 7a · A person who may not write is told so, and cannot be tricked into trying. */
async function flowPermissions(page) {
  await open(page, "?data=readonly");
  const notice = await page.locator(".cc-notice").allInnerTexts().catch(() => []);
  const explains = notice.some((t) => /read this configuration but not change it/i.test(t));
  const why = notice.some((t) => /admin/i.test(t));
  await openArea(page, "Details").catch(() => {});
  const liveInputs = await page.locator(".cc-area-b input:not([disabled]), .cc-area-b select:not([disabled])").count();
  record("7a · staff see truth and cannot be tricked into a write",
    explains && liveInputs === 0,
    `explained=${explains} namesTheReason=${why} enabledControlsInBody=${liveInputs}`);
}

/** 7b · A failed read says so and offers a way back, instead of a blank page. */
async function flowFailureRetry(page) {
  await open(page, "?data=error").catch(() => {});
  const body = await page.locator("body").innerText();
  const named = /could not|refused|failed/i.test(body);
  const retry = await page.locator("button", { hasText: /retry|try again/i }).count();
  record("7b · a failed read is named, with a way back", named && retry > 0,
    `namesFailure=${named} retryControls=${retry}`);
}

/** 6 · The shape holds at every required frame: one scroll owner, no sideways. */
async function flowShapeAtFrames(page) {
  for (const f of FRAMES) {
    await page.setViewportSize({ width: f.w, height: f.h });
    await open(page);
    const m = await page.evaluate(() => {
      const d = document.documentElement;
      const nested = [...document.querySelectorAll(".cc-wrap *")]
        .filter((el) => el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)
        .map((el) => el.className).slice(0, 6);
      return { docScrollsX: d.scrollWidth > d.clientWidth + 1, nested };
    });
    const ok = !m.docScrollsX && m.nested.length === 0;
    record(`6 · shape at ${f.w}×${f.h}`, ok,
      `docScrollsX=${m.docScrollsX} nestedScrollers=${JSON.stringify(m.nested)}`);
    await page.screenshot({ path: path.join(ART, `usable-${f.w}x${f.h}.png`), fullPage: false });
  }
}

/* ------------------------------------------------------------------- main */

async function main() {
  fs.mkdirSync(ART, { recursive: true });
  const vite = await startVite();
  const browser = await chromium.launch({
    executablePath: process.env.PW_EXECUTABLE_PATH || "/opt/pw-browsers/chromium",
  });
  const page = await browser.newPage({ viewport: { width: 1536, height: 770 } });
  page.on("pageerror", (e) => console.log(`  ! page error: ${e.message}`));

  try {
    await flowFirstPreset(page);
    await flowEditPersists(page);
    await flowRoundRobin(page);
    await flowBufferAndRules(page);
    await flowNotifications(page);
    await flowProviders(page);
    await flowPermissions(page);
    await flowFailureRetry(page);
    await flowShapeAtFrames(page);
  } finally {
    await browser.close();
    vite.kill("SIGTERM");
  }

  fs.writeFileSync(path.join(ART, "flows.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log("");
  if (failed.length) {
    console.log(`✗ usable-drive: ${failed.length} of ${results.length} human flow(s) FAIL`);
    for (const f of failed) console.log(`   · ${f.flow} — ${f.detail}`);
    process.exit(1);
  }
  console.log(`✓ usable-drive: all ${results.length} human flows complete. Evidence in ${ART}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
