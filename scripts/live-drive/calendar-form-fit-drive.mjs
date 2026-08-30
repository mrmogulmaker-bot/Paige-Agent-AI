/**
 * Form-fit + interaction proof for the Solo-native Calendar.
 *
 * Drives the LOCAL harness mount (scripts/live-drive/harness/calendar-mount) — the
 * shipped component, hook and CSS against a stubbed Supabase transport. It measures
 * GEOMETRY and INTERACTION at every required frame, in both themes, with the PAIGE
 * column folded and open.
 *
 * WHAT THIS IS NOT (§13/§32.c): not a deployed render, and not production data. The
 * rows are visibly synthetic by design. An authenticated live drive of the deployed
 * surface remains owed to a session that holds credentials and a browser.
 *
 *   node scripts/live-drive/calendar-form-fit-drive.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_ARTIFACTS_DIR, buildLaunchOptions, resolvePlaywright } from "./live-drive.mjs";

const BASE = process.env.CAL_HARNESS_URL || "http://127.0.0.1:5200";
const OUT = path.join(DEFAULT_ARTIFACTS_DIR, "calendar-form-fit");

/** The frames the Calendar authorization names, verbatim. */
const FRAMES = [
  { name: "1536x770", width: 1536, height: 770 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "900x1000", width: 900, height: 1000 },
];
const THEMES = ["dark", "light"];
const PAIGE = [
  { name: "paige-folded", q: "" },
  { name: "paige-open", q: "&paige=open" },
];

const failures = [];
const notes = [];
function check(ok, label, detail) {
  if (!ok) failures.push(detail ? `${label} — ${detail}` : label);
  return ok;
}

/** Geometry read inside the page. Every number comes from the live layout. */
const measure = () => {
  const de = document.documentElement;
  const root = document.querySelector(".sc-root");
  const grid = document.querySelector(".sc-grid, .sc-week, .sc-scroll, [data-scroll-owner]");
  const overflowX = de.scrollWidth - de.clientWidth;
  const overflowY = de.scrollHeight - de.clientHeight;
  // Any element whose right edge lies past the viewport is clipped horizontally.
  const clipped = [...document.querySelectorAll(".sc-root *")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1);
    })
    .slice(0, 6)
    .map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}`);
  // The internal scroller: an element that scrolls while the document does not.
  const scrollers = [...document.querySelectorAll(".sc-root *")]
    .filter((el) => el.scrollHeight - el.clientHeight > 4 && getComputedStyle(el).overflowY !== "visible")
    .map((el) => (el.className || "").toString().split(" ")[0]);
  // Chip legibility. Whatever a grid chip SHOWS must fit; a title clipped mid-word
  // or collapsed to zero width is not a finished responsive state.
  const vis = (el) => !!el && getComputedStyle(el).display !== "none";
  const gridChips = [...document.querySelectorAll("button.sc-ev--grid")];
  const chipReport = gridChips.map((c) => {
    const t = c.querySelector(".sc-ev-title");
    const k = c.querySelector(".sc-ev-compact");
    const m = c.querySelector(".sc-ev-time");
    const shown = vis(t) ? t : (vis(k) ? k : (vis(m) ? m : null));
    const width = shown ? shown.clientWidth : 0;
    // Overflow is measured against the CHIP's content box, not the span's own scroll
    // width. A span with `flex: none` never clips ITSELF — it spills past its parent,
    // which is exactly the defect the first version of this check reported as clean.
    const cs = getComputedStyle(c);
    const cr = c.getBoundingClientRect();
    const inner = cr.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    const spills = shown ? shown.getBoundingClientRect().right - inner : 0;
    return {
      spills: +spills.toFixed(1),
      compactTruncated: vis(k) && k.scrollWidth > k.clientWidth + 0.5,
      shows: vis(t) ? "title" : (vis(k) ? "compact" : (vis(m) ? "time" : "nothing")),
      // LEGIBLE, not "never ellipsised". A long title trimmed with an ellipsis in a
      // roomy chip is ordinary and fine; the defect is a starved chip showing a
      // fragment. 44px is about seven characters at this size — below that the text
      // has stopped saying anything and the compact treatment should have taken over.
      illegible: shown ? (shown.scrollWidth > shown.clientWidth + 0.5 && width < 44) : true,
      width,
      named: (c.getAttribute("aria-label") || "").length > 0,
    };
  });
  const railEl = document.querySelector(".sc-rail");
  const railCollapsed = !railEl || getComputedStyle(railEl).display === "none";
  const cogEls = [...document.querySelectorAll("button.sc-cog")];
  const cogsVisible = cogEls.filter((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return parseFloat(cs.opacity) > 0.2 && cs.visibility !== "hidden" && r.width > 0;
  }).length;
  const hourCells = document.querySelectorAll(".sc-hour-cell, .sc-hour").length;
  const events = document.querySelectorAll("button.sc-ev").length;
  return {
    overflowX, overflowY, clipped, scrollers, hourCells, events,
    chipShows: [...new Set(chipReport.map((c) => c.shows))].sort().join("+"),
    chipsIllegible: chipReport.filter((c) => c.illegible).length,
    chipsSpilling: chipReport.filter((c) => c.spills > 1).length,
    compactTruncated: chipReport.filter((c) => c.compactTruncated).length,
    worstSpillPx: chipReport.length ? Math.max(0, ...chipReport.map((c) => c.spills)) : 0,
    narrowestChipText: chipReport.length ? Math.min(...chipReport.map((c) => c.width)) : 0,
    chipsUnnamed: chipReport.filter((c) => !c.named).length,
    chipsBlank: chipReport.filter((c) => c.width <= 0).length,
    gridChips: chipReport.length,
    cogs: cogEls.length, cogsVisible, railCollapsed,
    rootWidth: (() => {
      // The mount that DECLARES the container query context — the width every
      // responsive rule in this surface actually resolves against.
      const mount = document.querySelector(".trc-canonical-mount--direct") || root;
      return mount ? Math.round(mount.getBoundingClientRect().width) : 0;
    })(),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    dataPg: de.getAttribute("data-pg"),
  };
};

/** The shared launch options wire the agent proxy, which only tunnels HTTPS — a
 *  plain-HTTP request to the local harness comes back as the proxy's own 405 page.
 *  Bypassing loopback is what makes a LOCAL drive possible at all; the proxy is left
 *  in place for everything else so no other host is reached unproxied. */
function launchOptions() {
  const o = buildLaunchOptions();
  return o.proxy ? { ...o, proxy: { ...o.proxy, bypass: "127.0.0.1,localhost,::1" } } : o;
}

const pw = await resolvePlaywright();
const browser = await pw.chromium.launch(launchOptions());
fs.mkdirSync(OUT, { recursive: true });

// Warm the dev server once. Vite pre-bundles dependencies on first request, and a
// request that races that pass 404s — harness noise that would otherwise be recorded
// as a console error against the surface. Measuring starts from a warm server.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=dark&data=dense`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sc-root", { timeout: 30000 });
  await ctx.close();
}

const rows = [];
for (const frame of FRAMES) {
  for (const theme of THEMES) {
    for (const paige of PAIGE) {
      const ctx = await browser.newContext({ viewport: { width: frame.width, height: frame.height } });
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
      page.on("pageerror", (e) => consoleErrors.push(String(e)));
      await page.goto(`${BASE}/?theme=${theme}&data=dense${paige.q}`, { waitUntil: "networkidle" });
      await page.waitForSelector(".sc-root", { timeout: 15000 });
      const m = await page.evaluate(measure);
      const id = `${frame.name}-${theme}-${paige.name}`;
      await page.screenshot({ path: path.join(OUT, `${id}.png`), fullPage: false });

      check(m.overflowX <= 0, `${id}: document horizontal overflow`, `${m.overflowX}px`);
      check(m.clipped.length === 0, `${id}: element past the viewport`, m.clipped.join(", "));
      check(m.events > 0, `${id}: no events rendered`);
      check(m.hourCells > 0, `${id}: no hour cells rendered`);
      check(consoleErrors.length === 0, `${id}: console error`, consoleErrors[0]);
      check(m.dataPg === theme, `${id}: theme did not apply`, `data-pg=${m.dataPg}`);
      // The document must not own the vertical scroll — the grid does.
      check(m.overflowY <= 0, `${id}: document owns vertical scroll`, `${m.overflowY}px`);
      check(m.scrollers.length > 0, `${id}: no internal scroll owner`);
      // The cog is the only route to a calendar's configuration, so it must be
      // visible without a hover the user has no reason to attempt.
      // Below the rail breakpoint the rail is display:none BY DESIGN and every rail
      // control — the settings cog included — moves into the View options drawer. That
      // drawer path is asserted separately below; here the cog is only required to be
      // visible when the rail itself is on screen.
      if (!m.railCollapsed) {
        check(m.cogsVisible === m.cogs && m.cogs > 0, `${id}: per-calendar settings cog not visible`, `${m.cogsVisible}/${m.cogs}`);
      }
      // Whatever the chip shows must be READABLE — never a fragment cut mid-word, and
      // never an element collapsed to zero width, at any of the required frames.
      check(m.chipsIllegible === 0, `${id}: grid chip text starved to a fragment`, `${m.chipsIllegible}/${m.gridChips}, narrowest ${m.narrowestChipText}px`);
      // Text must sit INSIDE its chip. This is the check that catches a non-shrinking
      // span painting over the chip border and the cell beside it.
      check(m.chipsSpilling === 0, `${id}: grid chip text spills past the chip`, `${m.chipsSpilling}/${m.gridChips}, worst ${m.worstSpillPx}px`);
      // The compact label is already the short form. Ellipsising it destroys the very
      // detail it exists to carry (the minute that separates an overlap), so ANY
      // truncation of it is a failure — no tolerance, unlike a long title.
      check(m.compactTruncated === 0, `${id}: compact chip label truncated`, `${m.compactTruncated}/${m.gridChips}`);
      check(m.chipsBlank === 0, `${id}: grid chip shows nothing`, `${m.chipsBlank}/${m.gridChips}`);
      // The accessible name must survive the compact swap — it is where the full
      // title, time and status live once the visible text is abbreviated.
      check(m.chipsUnnamed === 0, `${id}: grid chip has no accessible name`, `${m.chipsUnnamed}/${m.gridChips}`);
      // The swap is width-driven and must fire ONLY where it was measured to be
      // needed: the two constrained mounts (644px and 520px), never the roomy ones.
      const constrained = m.rootWidth <= 700;
      check(
        constrained ? m.chipShows === "compact" : m.chipShows === "title",
        `${id}: wrong chip treatment at ${m.rootWidth}px mount`,
        `shows ${m.chipShows}`,
      );
      rows.push({ id, ...m, bodyBg: m.bodyBg });
      await ctx.close();
    }
  }
}

// The collapsed-rail path. Below the breakpoint the rail is gone, so the ONLY route to
// a calendar's configuration is the View options drawer — if the cog did not travel
// with the rail body, per-calendar settings would be unreachable at these widths.
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=dark&data=dense&paige=open`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sc-root");
  const railGone = await page.evaluate(() => {
    const r = document.querySelector(".sc-rail");
    return !r || getComputedStyle(r).display === "none";
  });
  check(railGone, "900x1000+paige: rail expected to be collapsed at this width");
  await page.getByRole("button", { name: /View options/i }).click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(300);
  const inDrawer = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const cogs = [...d.querySelectorAll("button.sc-cog")];
    return cogs.filter((c) => getComputedStyle(c).display !== "none" && c.getBoundingClientRect().width > 0).length;
  });
  check(inDrawer > 0, "collapsed rail: settings cog unreachable in View options", `${inDrawer} visible`);
  await page.screenshot({ path: path.join(OUT, "collapsed-rail-view-options.png") });
  await ctx.close();
}

// Theme parity: the two themes must actually differ on the painted ground.
const darkBg = rows.find((r) => r.id.startsWith("1366x768-dark"))?.bodyBg;
const lightBg = rows.find((r) => r.id.startsWith("1366x768-light"))?.bodyBg;
check(!!darkBg && !!lightBg && darkBg !== lightBg, "Mineral/Obsidian parity: body ground identical", `${darkBg} vs ${lightBg}`);
notes.push(`grounds: dark ${darkBg} / light ${lightBg}`);

// ---- Interaction pass, at the tightest frame ----
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=dark&data=dense`, { waitUntil: "networkidle" });
  await page.waitForSelector("button.sc-ev");

  // Drawer opens, traps focus, closes on Escape, restores focus to its opener.
  await page.locator("button.sc-ev").first().focus();
  const openerTitle = await page.evaluate(() => document.activeElement?.getAttribute("title") ?? "");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[role="dialog"]');
  check(true, "detail drawer opens");
  const modal = await page.getAttribute('[role="dialog"]', "aria-modal");
  check(modal === "true", "detail drawer is aria-modal");
  const inside = await page.evaluate(() => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement));
  check(inside, "focus moves into the drawer");
  // Tab many times: focus must never escape the dialog.
  for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
  const stillInside = await page.evaluate(() => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement));
  check(stillInside, "focus trap holds through a full tab cycle");
  // A visible focus ring, not a suppressed outline.
  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement);
    return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
  });
  check(ring.outline !== "none" || (ring.shadow && ring.shadow !== "none"), "focused control has a visible ring", JSON.stringify(ring));
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  const restored = await page.evaluate(() => document.activeElement?.getAttribute("title") ?? "");
  check(restored === openerTitle, "Escape restores focus to the opening event", `${restored} vs ${openerTitle}`);

  // The per-calendar config drawer, and the conditional Connections remediation.
  await page.locator("button.sc-cog").first().click();
  await page.waitForSelector('[role="dialog"]');
  const cfg = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return { text: d?.textContent ?? "", link: !!d?.querySelector('a[href*="integrations"]') };
  });
  check(/Confirmations and reminders/i.test(cfg.text), "config drawer renders the notification section");
  check(/1 day before/i.test(cfg.text) && /2 hours before/i.test(cfg.text), "reminder offsets read from the stored config");
  check(cfg.link, "SMS-configured calendar offers the Connections remediation");
  await page.waitForTimeout(400); // let the open animation settle — a mid-fade frame is not evidence
  await page.screenshot({ path: path.join(OUT, "config-drawer-sms.png") });
  await page.keyboard.press("Escape");

  // The email-only calendar must NOT offer it.
  await page.locator("button.sc-cog").nth(1).click();
  await page.waitForSelector('[role="dialog"]');
  const cfg2 = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return { text: d?.textContent ?? "", link: !!d?.querySelector('a[href*="integrations"]') };
  });
  check(!cfg2.link, "email-only calendar offers no Connections path");
  await page.keyboard.press("Escape");

  // The calendar that stores nothing says so.
  await page.locator("button.sc-cog").nth(2).click();
  await page.waitForSelector('[role="dialog"]');
  const cfg3 = await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? "");
  check(/stores no notification settings/i.test(cfg3), "unconfigured calendar states the absence honestly");
  await page.keyboard.press("Escape");
  await ctx.close();
}

// ---- Honest states: an empty book, and both read failures ----
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=dark&data=empty`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sc-root");
  const empty = await page.evaluate(() => ({
    events: document.querySelectorAll("button.sc-ev").length,
    text: document.querySelector(".sc-root")?.textContent ?? "",
  }));
  // An empty book renders empty: no chips, and no invented count anywhere.
  check(empty.events === 0, "empty book: events drawn for a book with none", `${empty.events}`);
  check(/No overlapping appointments in this range/i.test(empty.text), "empty book: conflict line missing");
  check(!/\b[1-9]\d* (appointments?|conflicts?)\b/i.test(empty.text), "empty book: a count was invented", empty.text.slice(0, 160));
  await page.screenshot({ path: path.join(OUT, "state-empty-week.png") });
  // Agenda is where an empty range has its own words.
  await page.getByRole("button", { name: /^Agenda$/ }).click();
  await page.waitForTimeout(150);
  const agenda = await page.evaluate(() => document.querySelector(".sc-root")?.textContent ?? "");
  check(/Nothing booked in the next two weeks/i.test(agenda), "empty book: agenda states the absence", agenda.slice(0, 160));
  await page.screenshot({ path: path.join(OUT, "state-empty-agenda.png") });
  await ctx.close();
}
{
  // The bookings read failing is total: nothing can be drawn, and the surface must
  // SAY so rather than presenting an empty week as a successful one.
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=dark&data=error`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sc-root");
  const r = await page.evaluate(() => ({
    text: document.querySelector(".sc-root")?.textContent ?? "",
    events: document.querySelectorAll("button.sc-ev").length,
  }));
  check(/refused/i.test(r.text), "bookings read failure was not surfaced", r.text.slice(0, 200));
  check(r.events === 0, "events drawn despite a failed bookings read", `${r.events}`);
  await page.screenshot({ path: path.join(OUT, "state-error.png") });
  await ctx.close();
}
{
  // The calendars read failing is PARTIAL: the appointments are still real and still
  // drawn — only the colour coding and the filter list degrade. The surface names that
  // degradation in its own words rather than echoing a provider message at the user.
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=dark&data=calendars-error`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sc-root");
  const r = await page.evaluate(() => ({
    text: document.querySelector(".sc-root")?.textContent ?? "",
    events: document.querySelectorAll("button.sc-ev").length,
    swatches: document.querySelectorAll(".sc-check-row").length,
  }));
  check(/calendars could not be loaded/i.test(r.text), "calendars read failure was not surfaced", r.text.slice(0, 240));
  check(/falls back to one tint/i.test(r.text), "the colour degradation was not named");
  check(r.events > 0, "appointments were dropped over a calendars-only failure", `${r.events}`);
  check(r.swatches === 0, "calendar toggles rendered despite a failed calendars read", `${r.swatches}`);
  await page.screenshot({ path: path.join(OUT, "state-calendars-error.png") });
  await ctx.close();
}

// ---- Reduced motion ----
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=dark&data=dense`, { waitUntil: "networkidle" });
  await page.waitForSelector("button.sc-ev");
  await page.locator("button.sc-ev").first().click();
  await page.waitForSelector('[role="dialog"]');
  const anim = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const s = getComputedStyle(d);
    return { dur: s.animationDuration, trans: s.transitionDuration };
  });
  // The platform's reduced-motion guard collapses durations to .01ms !important rather
  // than to a literal 0, so the bar is "imperceptible", not "exactly zero".
  const stilled = (v) => !v || v.split(",").every((x) => parseFloat(x) <= 0.001);
  check(stilled(anim.dur) && stilled(anim.trans), "reduced motion: drawer still animates", JSON.stringify(anim));
  await page.screenshot({ path: path.join(OUT, "reduced-motion.png") });
  await ctx.close();
}

await browser.close();

const report = { frames: rows, notes, failures, ok: failures.length === 0 };
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(`frames measured: ${rows.length}`);
for (const n of notes) console.log(`note: ${n}`);
if (failures.length) {
  console.log(`FAILURES (${failures.length}):`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("✓ all form-fit and interaction assertions passed");
