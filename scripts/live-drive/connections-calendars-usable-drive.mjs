#!/usr/bin/env node
/**
 * connections-calendars-usable-drive — STRUCTURAL-HARNESS proof, not owner proof (§70.1).
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
 * drive their own contract correctly against a faithful in-memory store. That is
 * STRUCTURAL-HARNESS evidence — a class BELOW authenticated runtime, and it must
 * never be reported as the owner being able to use the feature (§70.1).
 * WHAT IT DOES NOT PROVE (§13/§32.c): production RLS, Postgres constraints, or any
 * provider. The rows are synthetic; the authenticated drive of the DEPLOYED
 * surface remains owed to a session that holds credentials.
 *
 *   node scripts/live-drive/connections-calendars-usable-drive.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";
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

/**
 * Refuse to run against a server this drive did not start.
 *
 * The harness pins port 5201, and the geometry drive uses the same one. When
 * both run at once the second `vite` exits on `strictPort` and the browser
 * quietly talks to the FIRST one — a different module graph, possibly built
 * from a different working tree. That cost a full debugging cycle: assertions
 * were read against a stale build of the stub and reported as product defects.
 * A foreign listener is now a hard stop, not a silent substitution.
 */
async function assertPortFree() {
  const free = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(5201, "127.0.0.1");
  });
  if (!free) {
    throw new Error(
      "port 5201 is already serving — another harness (likely connections-calendars-drive) " +
      "is running. Stop it first; this drive must own the server it measures.",
    );
  }
}

function startVite() {
  const child = spawn(
    "npx",
    ["vite", "--config", "scripts/live-drive/harness/connections-mount/vite.config.ts"],
    // Own process group. `npx` forks the real `vite`, so without this the
    // teardown kills the wrapper and leaves the server holding 5201 — the exact
    // condition `assertPortFree` now refuses to run against.
    { cwd: REPO, stdio: ["ignore", "pipe", "pipe"], detached: true },
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
  // Read the STORE, not the DOM, and not a window hook that may not be reachable.
  // Session storage is what a reload actually rehydrates from, so this is the
  // only place that answers "did the write land?" without inference.
  try {
    // Key on the state currently being driven. Taking the FIRST matching key
    // read a previous flow's table — `:empty` while `?data=dense` was on screen
    // — so the diagnostic described rows the surface was not looking at.
    const st = new URLSearchParams(location.search).get("data") || "dense";
    const key = `paige-harness-store:${st}`;
    if (!sessionStorage.getItem(key)) return { store: "absent", key };
    const db = JSON.parse(sessionStorage.getItem(key));
    const c = (db.calendars || [])[0];
    return c ? { key, title: c.title, type: c.type, buf: c.buffer_before_min } : { key, rows: 0 };
  } catch (e) { return { error: String(e).slice(0, 80) }; }
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

  // Creation is a two-step disclosure: a button in the empty body opens the name
  // field. Reaching straight for the input asserted a one-step form the surface
  // never claimed to have and reported the miss as "no create field offered" —
  // an instrument defect, not a product one. Drive it the way a person does.
  const opener = empty.locator("button", { hasText: /New preset/i }).first();
  if (!(await opener.count())) {
    return record("1 · first preset from the empty state", false, "empty state offers no way to start one");
  }
  await opener.click();

  const input = empty.locator(".cc-new .cc-in").first();
  await input.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  if (!(await input.count())) return record("1 · first preset from the empty state", false, "no name field after opening the form");

  const NAME = "Harness intro call";
  await input.fill(NAME);
  await empty.locator(".cc-new button", { hasText: /Create/i }).first().click();
  await page.waitForTimeout(900);

  // The proof is not the click. It is that the calendar EXISTS afterwards — on
  // screen, and still there when the page is re-read from the store rather than
  // from the component state that just created it.
  const onScreen = await page.getByText(NAME).count();
  const areas = await page.locator(".cc-area").count();
  await open(page, "?data=empty");
  const stored = await page.evaluate((wanted) => {
    try {
      const st = new URLSearchParams(location.search).get("data") || "dense";
      const key = `paige-harness-store:${st}`;
      if (!sessionStorage.getItem(key)) return "no store";
      const db = JSON.parse(sessionStorage.getItem(key));
      return (db.calendars || []).some((c) => c.title === wanted) ? "yes" : "no";
    } catch (e) { return String(e).slice(0, 60); }
  }, NAME);
  const afterReload = await page.getByText(NAME).count();
  record("1 · first preset from the empty state", onScreen > 0 && stored === "yes" && afterReload > 0,
    `onScreen=${onScreen} areas=${areas} stored=${stored} afterReload=${afterReload}`);
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

  // Scope to the "Buffer before" FIELD, not to `.cc-chip` text. Booking rules
  // renders several chip rows — duration, buffer before, buffer after — and all
  // of them carry a `30m` and a `15m`. Matching by text alone clicked whichever
  // came first, so a green result was no evidence that a BUFFER had changed.
  const bufferField = (area) => area.locator(".cc-f").filter({ has: page.locator("span", { hasText: /^Buffer before$/ }) }).first();

  const area = await openArea(page, "Booking rules");
  if (!(await bufferField(area).locator(".cc-chip", { hasText: /^15m$/ }).count())) {
    return record("4 · booking rules · 15-minute buffer", false, "no 15m buffer chip offered");
  }

  // The seed already holds 15m, so clicking 15m alone would assert nothing.
  // Move to a value the row does NOT have, prove that landed IN THE STORED ROW,
  // then set 15m — the buffer the assignment names — and prove that too.
  const set = async (label) => {
    const a = await openArea(page, "Booking rules");
    await bufferField(a).locator(".cc-chip", { hasText: new RegExp(`^${label}$`) }).first().click();
    await save(page);
    await open(page);
    const b = await openArea(page, "Booking rules");
    const pressed = await bufferField(b).locator('.cc-chip[aria-pressed="true"]').innerText().catch(() => "<none>");
    const stored = await page.evaluate(() => {
      try {
        const st = new URLSearchParams(location.search).get("data") || "dense";
        const db = JSON.parse(sessionStorage.getItem(`paige-harness-store:${st}`) || "{}");
        return (db.calendars || [])[0]?.buffer_before_min ?? "<no row>";
      } catch (e) { return String(e).slice(0, 40); }
    });
    return { pressed, stored };
  };

  const moved = await set("30m");
  const back = await set("15m");
  record("4 · booking rules · 15-minute buffer",
    moved.pressed === "30m" && moved.stored === 30 && back.pressed === "15m" && back.stored === 15,
    `30m → chip=${moved.pressed} stored=${moved.stored} · 15m → chip=${back.pressed} stored=${back.stored}`);
}

/**
 * 3b · The hours a calendar is open can be changed, and they hold.
 *
 * The assignment names "supported availability" alongside the buffer, and it was
 * the one editable thing on this surface no flow here touched. A weekly pattern
 * that silently refuses an edit is the same class of failure as a save that lies,
 * and it costs the tenant bookings rather than a field.
 */
async function flowAvailability(page) {
  await open(page);
  const area = await openArea(page, "Schedule & availability");
  const opens = area.locator('input[aria-label="Mon opens"]').first();
  if (!(await opens.count())) {
    return record("3b · opening hours can be changed", false, "Monday has no editable opening time");
  }
  const before = await opens.inputValue();
  const wanted = before === "08:00" ? "10:00" : "08:00";
  await opens.fill(wanted);
  await save(page);

  await open(page);
  const after = await openArea(page, "Schedule & availability");
  const held = await after.locator('input[aria-label="Mon opens"]').first().inputValue();
  const stored = await page.evaluate(() => {
    try {
      const st = new URLSearchParams(location.search).get("data") || "dense";
      const db = JSON.parse(sessionStorage.getItem(`paige-harness-store:${st}`) || "{}");
      const row = (db.calendars || [])[0];
      return (row?.availability_json || []).find((w) => w.day === 1)?.start ?? "<no monday>";
    } catch (e) { return String(e).slice(0, 40); }
  });
  record("3b · opening hours can be changed", held === wanted && stored === wanted,
    `monday ${before} → asked ${wanted} · field=${held} stored=${stored}`);
}

/**
 * 7c · An edit can be abandoned, and abandoning it restores what was there.
 *
 * "Safely abandon or retry" is in the assignment, and Discard is the half a
 * person reaches for when they change their mind mid-edit. A Discard that leaves
 * the typed value on screen — or writes it anyway — is worse than none.
 */
async function flowDiscard(page) {
  await open(page);
  const details = await openArea(page, "Details");
  const title = details.locator(".cc-area-b input.cc-in").first();
  const before = await title.inputValue();
  await title.fill(`Harness abandoned ${Date.now() % 100000}`);
  await page.waitForTimeout(150);

  const discard = page.locator(".cc-bar button", { hasText: /Discard/i }).first();
  if (!(await discard.count())) return record("7c · an edit can be abandoned", false, "no way to discard an edit");
  await discard.click();
  await page.waitForTimeout(400);

  const restored = await openArea(page, "Details")
    .then((a) => a.locator(".cc-area-b input.cc-in").first().inputValue());
  const barGone = (await page.locator(".cc-bar").count()) === 0;

  // And nothing was written: the store still holds what it held before.
  await open(page);
  const stored = await page.evaluate(() => {
    try {
      const st = new URLSearchParams(location.search).get("data") || "dense";
      const db = JSON.parse(sessionStorage.getItem(`paige-harness-store:${st}`) || "{}");
      return (db.calendars || [])[0]?.title ?? "<no row>";
    } catch (e) { return String(e).slice(0, 40); }
  });
  record("7c · an edit can be abandoned", restored === before && barGone && stored === before,
    `field back to "${restored}" (was "${before}") saveBarGone=${barGone} stored="${stored}"`);
}

/**
 * 3c · The owner can say WHO takes the bookings — add a host, and it holds.
 *
 * Round-robin without a roster editor is a dead control: the type saves, and
 * every booking still lands on whoever created the calendar. Until this shipped,
 * the fold-out was read-only and pointed at the calendar workspace — which has
 * no host management in it — so the instruction was a dead end.
 */
async function flowHostRoster(page) {
  await open(page);
  // A collective calendar, deliberately: only round-robin and collective read
  // the whole roster, so this is where adding a host actually changes who gets
  // booked. On a one-on-one the picker is absent BY DESIGN (flow 3d).
  const collective = page.locator(".cc-preset-card", { hasText: /quarterly review/i }).first();
  if (await collective.count()) await collective.click();
  const area = await openArea(page, "Team & hosts");

  const before = await area.locator(".cc-host").count();
  const picker = area.locator('select[aria-label="Teammate to add as a host"]');
  if (!(await picker.count())) {
    return record("3c · add a host to the rotation", false, "no way to add a host is offered");
  }
  const options = await picker.locator("option").evaluateAll((els) =>
    els.map((e) => e.value).filter(Boolean));
  if (options.length === 0) {
    return record("3c · add a host to the rotation", false, "the picker offers nobody to add");
  }
  await picker.selectOption(options[0]);
  await area.locator("button", { hasText: /Add host/i }).first().click();
  await page.waitForTimeout(900);

  // Proof is the re-read, not the click: the roster is rewritten by an RPC, and
  // the stored priorities are what the rotation actually follows.
  await open(page);
  const back = page.locator(".cc-preset-card", { hasText: /quarterly review/i }).first();
  if (await back.count()) await back.click();
  const after = await openArea(page, "Team & hosts");
  const now = await after.locator(".cc-host").count();
  // Names, not just a count. `profiles` is own-row under RLS, so unless the
  // roster carries the RPC's names every host reads "Team member" — and a
  // roster of anonymous rows cannot answer who takes the bookings.
  const named = await after.locator(".cc-host strong").allTextContents();
  const stored = await page.evaluate(() => {
    try {
      const st = new URLSearchParams(location.search).get("data") || "dense";
      const db = JSON.parse(sessionStorage.getItem(`paige-harness-store:${st}`) || "{}");
      // The COLLECTIVE calendar this flow edited, not simply the first row —
      // reading calendars[0] here reported another calendar's roster as if it
      // were the one just changed.
      const cal = (db.calendars || []).find((c) => /quarterly review/i.test(c.title || ""))?.id;
      return (db.calendar_hosts || [])
        .filter((h) => h.calendar_id === cal)
        .sort((a, b) => a.priority - b.priority)
        .map((h) => `${h.user_id}@${h.priority}`)
        .join(",");
    } catch (e) { return String(e).slice(0, 40); }
  });
  const anonymous = named.filter((n) => /^Team member$/i.test(n.trim())).length;
  record("3c · add a host to the rotation, by name", now === before + 1 && anonymous === 0,
    `hosts ${before} → ${now} after reload · names=[${named.join("|")}] · stored roster = ${stored}`);
}

/**
 * 3d · A single-host calendar does NOT offer to add a host — it says why.
 *
 * `public-booking` books `hostIds[0]` for personal and class calendars and
 * ignores the rest, so an "Add a host" control there promises a booking that
 * never arrives. Hiding it silently would be a dead end of a different kind, so
 * the surface states the reason instead.
 */
async function flowSingleHostNoAdd(page) {
  await open(page);
  const cls = page.locator(".cc-preset-card", { hasText: /workshop/i }).first();
  if (await cls.count()) await cls.click();
  const area = await openArea(page, "Team & hosts");
  const picker = await area.locator('select[aria-label="Teammate to add as a host"]').count();
  const text = (await area.textContent()) ?? "";
  const explains = /would never be given a booking/i.test(text);
  record("3d · a single-host calendar explains instead of offering a dead add",
    picker === 0 && explains, `picker=${picker} explains=${explains}`);
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

  // Walk the account CARDS, not the buttons. The previous version climbed to the
  // nearest ancestor matching `cc-acct` — which is `.cc-acct-row`, whose whole
  // text is "Connect". It never saw the provider name, so it read `null` for
  // every card and reported a product failure that was purely its own.
  const state = async (name) => {
    const cards = accounts.locator(".cc-acct");
    for (let i = 0; i < (await cards.count()); i++) {
      const card = cards.nth(i);
      if (!new RegExp(name, "i").test(await card.innerText().catch(() => ""))) continue;
      const btn = card.locator("button", { hasText: /Connect/i }).first();
      if (!(await btn.count())) return "no connect control";
      return (await btn.isDisabled()) ? "disabled" : "live";
    }
    return "card absent";
  };

  const apple = await state("Apple");
  const google = await state("Google");
  const zoom = await state("Zoom");
  const mentionsOutlook = /outlook/i.test(text);

  // Real paths are reachable; the one with no path is visibly inert rather than
  // a button that would do nothing; nothing claims a provider we cannot run.
  record("5 · providers: real paths only, others honestly unavailable",
    google === "live" && zoom === "live" && apple === "disabled" && !mentionsOutlook,
    `google=${google} zoom=${zoom} apple=${apple} mentionsOutlook=${mentionsOutlook}`);
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
  await assertPortFree();
  const vite = await startVite();
  const browser = await chromium.launch({
    executablePath: process.env.PW_EXECUTABLE_PATH || "/opt/pw-browsers/chromium",
  });
  const page = await browser.newPage({ viewport: { width: 1536, height: 770 } });
  page.on("pageerror", (e) => console.log(`  ! page error: ${e.message}`));
  page.on("console", (m) => { const t = m.text(); if (t.startsWith("[stub]")) console.log(`      ${t}`); });

  try {
    await flowFirstPreset(page);
    await flowEditPersists(page);
    await flowRoundRobin(page);
    await flowAvailability(page);
    await flowHostRoster(page);
    await flowSingleHostNoAdd(page);
    await flowBufferAndRules(page);
    await flowNotifications(page);
    await flowProviders(page);
    await flowPermissions(page);
    await flowDiscard(page);
    await flowFailureRetry(page);
    await flowShapeAtFrames(page);
  } finally {
    await browser.close();
    // `npx` forks the real `vite`; killing only the wrapper leaves the server
    // holding 5201, and the NEXT run then reads a stale module graph. Take the
    // whole process group down.
    try { process.kill(-vite.pid, "SIGTERM"); } catch { vite.kill("SIGTERM"); }
  }

  fs.writeFileSync(path.join(ART, "flows.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log("");
  if (failed.length) {
    console.log(`✗ usable-drive: ${failed.length} of ${results.length} harness check(s) FAIL`);
    for (const f of failed) console.log(`   · ${f.flow} — ${f.detail}`);
    process.exit(1);
  }
  console.log(`✓ usable-drive: all ${results.length} STRUCTURAL-HARNESS checks pass. Evidence in ${ART}`);
  console.log(
    "  NOT owner proof (§70.1): this is the shipped component, hook and CSS against an in-memory\n" +
    "  double. It says nothing about real-tenant RLS, real persistence, rendered account switching\n" +
    "  or any provider handshake. Those stay UNVERIFIED until an authenticated drive runs:\n" +
    "    node scripts/live-drive/connections-calendars-authed-drive.mjs",
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
