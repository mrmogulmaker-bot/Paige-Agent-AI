/**
 * Settings › Connections › Calendars — the scroll flow, on the REAL app.
 *
 * There is no fake shell and no hand-built scroll container here. This drives
 * `solo-drive.html`, which mounts the REAL merged `SoloApp` with the REAL
 * stylesheets, at the REAL §65 address `/solo/{account}/settings/connections`,
 * and clicks the REAL Calendars segment. The scroll owner under measurement is
 * the one production ships.
 *
 * THE FLOW: a tenant owner opens Calendars, reaches the bottom of the sub-tab by
 * every input a person actually has, and gets back to the top.
 *
 * WHAT IT DOES NOT PROVE (§13): the rows are unauthenticated stubs and this is a
 * dev server, not the deployment. It proves SCROLL GEOMETRY and REACHABILITY —
 * never production data or an authenticated session.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { resolvePlaywright, resolveExecutablePath } from "./live-drive.mjs";

const PORT = 8080;
const BASE = `http://127.0.0.1:${PORT}`;
const ROUTE = "/solo/1971670/settings/connections";
const OUT = path.resolve("scripts/live-drive/artifacts/calendars-scroll");
const VIEWPORTS = [[1536, 770], [1366, 768], [1024, 768], [900, 1000]];

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "ok " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
};

function assertPortFree() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", () => reject(new Error(
      `port ${PORT} is already in use — a leaked dev server would serve stale code and this run would measure it`)));
    s.once("listening", () => s.close(() => resolve()));
    s.listen(PORT, "127.0.0.1");
  });
}

/** Open Calendars, with the PAIGE backdrop dismissed so clicks land. */
async function openCalendars(page) {
  await page.goto(`${BASE}/solo-drive.html?route=${encodeURIComponent(ROUTE)}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ss-segment button", { timeout: 20_000 });
  // At narrow widths the shell opens the PAIGE panel, whose backdrop swallows the
  // first click. Fold it the way a person would rather than forcing the click.
  await page.evaluate(() => document.querySelector(".tcs-paige-backdrop")?.click());
  await page.waitForTimeout(250);
  await page.click('.ss-segment button:text-is("Calendars")');
  await page.waitForSelector(".cc", { timeout: 10_000 });
  // Wait for the surface to stop growing, so geometry is read once it is settled.
  let last = -1;
  for (let i = 0; i < 24; i++) {
    const h = await page.evaluate(() => document.querySelector("[data-solo-screen-host]")?.scrollHeight ?? -1);
    if (h === last) break;
    last = h;
    await page.waitForTimeout(120);
  }
}

const measure = () => {
  const host = document.querySelector("[data-solo-screen-host]");
  const cc = document.querySelector(".cc");
  const controls = [...document.querySelectorAll(
    ".cc button:not([disabled]), .cc a[href], .cc input:not([disabled]), .cc select:not([disabled]), .cc textarea:not([disabled])")]
    .filter((el) => el.offsetParent !== null);
  // The DEEPEST control, which is a spatial fact — source order is not visual
  // order inside a grid, and the point is the furthest a human must reach.
  const top = host ? host.getBoundingClientRect().top : 0;
  const st = host ? host.scrollTop : 0;
  const last = controls
    .map((el) => ({ el, depth: el.getBoundingClientRect().bottom - top + st }))
    .sort((a, b) => b.depth - a.depth)[0]?.el ?? null;
  const cs = host ? getComputedStyle(host) : null;
  return {
    hasHost: !!host, hasCalendars: !!cc,
    overflowY: cs?.overflowY ?? null, overflowX: cs?.overflowX ?? null,
    scrollTop: st, scrollH: host?.scrollHeight ?? 0, clientH: host?.clientHeight ?? 0,
    travel: host ? host.scrollHeight - host.clientHeight : 0,
    gutter: host ? host.offsetWidth - host.clientWidth : 0,
    ccH: cc ? Math.round(cc.getBoundingClientRect().height) : 0,
    controls: controls.length,
    lastLabel: last ? (last.textContent || last.getAttribute("aria-label") || last.tagName).trim().slice(0, 40) : null,
    lastTop: last ? Math.round(last.getBoundingClientRect().top) : null,
    lastBottom: last ? Math.round(last.getBoundingClientRect().bottom) : null,
    docScrollsX: document.scrollingElement
      ? document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth + 1 : false,
    hostScrollsX: host ? host.scrollWidth > host.clientWidth + 1 : false,
    // Every element that both declares a vertical scroll AND actually overflows.
    liveScrollers: [...document.querySelectorAll("*")].filter((e) => {
      const s = getComputedStyle(e);
      return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1;
    }).map((e) => e.id || (e.getAttribute("data-solo-screen-host") !== null ? "solo-screen-host"
      : (typeof e.className === "string" && e.className ? `.${e.className.split(" ")[0]}` : e.tagName.toLowerCase()))),
  };
};

const inView = (m, h) => m.lastBottom !== null && m.lastBottom <= h + 1 && m.lastTop >= -1;
const toTop = (page) => page.evaluate(() => {
  const el = document.querySelector("[data-solo-screen-host]");
  if (el) el.scrollTop = 0;
});

async function driveViewport(page, w, h) {
  const vp = `${w}x${h}`;
  await openCalendars(page);
  let m = await page.evaluate(measure);

  record(`${vp} · Calendars renders`, m.hasHost && m.hasCalendars && m.ccH > 0,
    `canvas ${m.ccH}px, ${m.controls} controls`);

  // 1 — the surface has a scroll owner at all, and it is the screen host.
  record(`${vp} · the Calendars surface scrolls`, m.overflowY === "auto" && m.travel > 0,
    `computed overflow-y=${m.overflowY} · scrollHeight ${m.scrollH} vs clientHeight ${m.clientH} → ${m.travel}px of travel`);

  // 2 — exactly one owner. A second live scroller is a nested trap.
  record(`${vp} · exactly one vertical scroll owner`, m.liveScrollers.length === 1,
    `scrollers=[${m.liveScrollers.join(", ")}]`);

  // 3 — vertical only.
  record(`${vp} · no horizontal overflow`, !m.docScrollsX && !m.hostScrollsX && m.overflowX === "hidden",
    `doc=${m.docScrollsX} host=${m.hostScrollsX} overflow-x=${m.overflowX}`);

  // 4 — the scrollbar is VISIBLE and laid out, not an overlay that appears mid-gesture.
  record(`${vp} · the scrollbar is visible`, m.gutter > 0, `reserved gutter=${m.gutter}px`);

  // 5 — wheel/trackpad reaches the last control.
  await toTop(page);
  const box = await page.evaluate(() => {
    const r = document.querySelector("[data-solo-screen-host]").getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
             right: r.right, top: r.top, height: r.height };
  });
  await page.mouse.move(box.x, box.y);
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(25);
    if (inView(await page.evaluate(measure), h)) break;
  }
  m = await page.evaluate(measure);
  record(`${vp} · wheel/trackpad reaches the last control`, inView(m, h),
    `"${m.lastLabel}" rect ${m.lastTop}–${m.lastBottom} in ${h}px`);

  // 6 — End.
  await toTop(page);
  await page.click(".cc", { position: { x: 12, y: 12 } }).catch(() => {});
  await page.keyboard.press("End");
  await page.waitForTimeout(450);
  m = await page.evaluate(measure);
  record(`${vp} · End reaches the last control`, inView(m, h), `rect ${m.lastTop}–${m.lastBottom}`);

  // 7 — PageDown, the other key people actually use.
  await toTop(page);
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(40);
    if (inView(await page.evaluate(measure), h)) break;
  }
  m = await page.evaluate(measure);
  record(`${vp} · PageDown reaches the last control`, inView(m, h), `scrollTop=${m.scrollTop}`);

  // 8 — the scrollbar DRAGS. Real mouse events on the bar itself, in the reserved
  //     gutter — not `scrollTop = …`, which would pass just as happily with no bar.
  await toTop(page);
  const before = await page.evaluate(measure);
  const thumb = Math.max(20, Math.round((before.clientH / before.scrollH) * box.height));
  const x = Math.round(box.right - Math.max(2, before.gutter / 2));
  await page.mouse.move(x, box.top + Math.round(thumb / 2));
  await page.mouse.down();
  // Past the foot of the track: Chromium clamps the thumb, so a gesture that stops
  // short leaves the surface short, which is a fact about the gesture not the bar.
  await page.mouse.move(x, box.top + box.height + 240, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  m = await page.evaluate(measure);
  record(`${vp} · dragging the scrollbar moves the surface`,
    m.scrollTop >= before.travel * 0.75,
    `drag → ${m.scrollTop}/${before.travel} (${Math.round((m.scrollTop / Math.max(1, before.travel)) * 100)}%)`);

  // 9 — and the surface travels all the way to its end.
  await page.evaluate(() => {
    const el = document.querySelector("[data-solo-screen-host]");
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(200);
  m = await page.evaluate(measure);
  record(`${vp} · travel reaches the very end`, Math.abs(m.scrollTop - m.travel) <= 1,
    `${m.scrollTop}/${m.travel}`);

  // 10 — and the user can get BACK to the top, which is half the owner's ask.
  await page.mouse.move(box.x, box.y);
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(25);
    if ((await page.evaluate(measure)).scrollTop === 0) break;
  }
  m = await page.evaluate(measure);
  record(`${vp} · scrolling back returns to the top`, m.scrollTop === 0, `scrollTop=${m.scrollTop}`);

  await page.screenshot({ path: path.join(OUT, `calendars-${vp}.png`) });
}

/**
 * THE REGRESSION GUARD. The correction is scoped `:has(.cc)`, so it must be inert
 * everywhere Calendars is not. These walk the REAL surfaces the owner excluded and
 * require them still form-fitting — `overflow:hidden`, the Solo law untouched.
 */
async function proveScopedToCalendars(page) {
  for (const [route, label] of [
    ["/solo/1971670/command-center", "Command Center"],
    ["/solo/1971670/clients", "Clients"],
    ["/solo/1971670/growth", "Campaigns"],
    ["/solo/1971670/analytics", "Analytics"],
    ["/solo/1971670/marketplace", "Marketplace"],
    ["/solo/1971670/settings/integrations", "Settings › Integrations"],
    ["/solo/1971670/settings/billing", "Settings › Billing"],
  ]) {
    await page.goto(`${BASE}/solo-drive.html?route=${encodeURIComponent(route)}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-solo-screen-host]", { timeout: 20_000 });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const host = document.querySelector("[data-solo-screen-host]");
      return { overflowY: getComputedStyle(host).overflowY, gutter: host.offsetWidth - host.clientWidth,
               hasCalendars: !!document.querySelector(".cc") };
    });
    record(`scope · ${label} stays form-fitting`,
      r.overflowY === "hidden" && r.gutter === 0 && !r.hasCalendars,
      `computed overflow-y=${r.overflowY} gutter=${r.gutter}px .cc=${r.hasCalendars}`);
  }

  // And the sibling Connections segments, which share the destination but not `.cc`.
  await page.goto(`${BASE}/solo-drive.html?route=${encodeURIComponent(ROUTE)}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".ss-segment button", { timeout: 20_000 });
  await page.evaluate(() => document.querySelector(".tcs-paige-backdrop")?.click());
  await page.waitForTimeout(250);
  for (const seg of ["Communications", "Health", "Available"]) {
    await page.click(`.ss-segment button:text-is("${seg}")`).catch(() => {});
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const host = document.querySelector("[data-solo-screen-host]");
      return { overflowY: getComputedStyle(host).overflowY, hasCalendars: !!document.querySelector(".cc") };
    });
    record(`scope · Connections › ${seg} unchanged`, r.overflowY === "hidden" && !r.hasCalendars,
      `computed overflow-y=${r.overflowY} .cc=${r.hasCalendars}`);
  }
}

/**
 * THE NEGATIVE CONTROL. Delete the Calendars rule from the live stylesheet and the
 * Solo form-fit law takes the surface straight back to unreachable. A check that
 * cannot fail is a decoration, so this proves the battery above measures something.
 */
async function proveChecksCanFail(page, h) {
  await openCalendars(page);
  const killed = await page.evaluate(() => {
    let deleted = 0;
    for (const sheet of [...document.styleSheets]) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (let i = rules.length - 1; i >= 0; i--) {
        const sel = rules[i].selectorText || "";
        if (/\.paige-solo main:has\(\.cc\)/.test(sel)) { sheet.deleteRule(i); deleted += 1; }
      }
    }
    return deleted;
  });
  await page.waitForTimeout(250);
  const m = await page.evaluate(measure);
  // Assert the DEFECT, which is "content exists past the fold and nothing can reach
  // it" — not "the last control is off screen". Those are different claims, and on a
  // sparse surface the deepest control can sit high on the page while hundreds of
  // pixels below it are still lost. Measuring the control instead of the overflow is
  // how a broken surface reports healthy.
  record("negative control · removing the Calendars rule strands content below the fold",
    killed > 0 && m.overflowY === "hidden" && m.liveScrollers.length === 0 && m.scrollH > m.clientH + 1,
    `rules deleted=${killed} → overflow-y=${m.overflowY} · scrollers=[${m.liveScrollers.join(", ")}] · `
    + `${m.scrollH - m.clientH}px of Calendars past a ${m.clientH}px fold with nothing able to scroll to it`);
}

async function main() {
  await assertPortFree();
  fs.mkdirSync(OUT, { recursive: true });
  const vite = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", detached: true });
  let browser;
  try {
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`${BASE}/solo-drive.html`); if (r.ok) break; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    const pw = await resolvePlaywright();
    // `--hide-scrollbars` is a Playwright DEFAULT and it suppresses the native bar
    // entirely: with it on, a hidden and a visible scrollbar are indistinguishable
    // and every synthesized gesture on the bar is inert. Dropping it is what makes
    // "the scrollbar is visible" and "dragging it moves the surface" real claims.
    browser = await pw.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      ignoreDefaultArgs: ["--hide-scrollbars"],
      executablePath: resolveExecutablePath(),
    });

    for (const [w, h] of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
      await driveViewport(page, w, h);
      record(`${w}x${h} · no page errors`, errors.length === 0, errors.join(" | ") || "none");
      await page.close();
    }

    const scope = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await proveScopedToCalendars(scope);
    await scope.close();

    const neg = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await proveChecksCanFail(neg, 768);
    await neg.close();
  } finally {
    await browser?.close();
    try { process.kill(-vite.pid); } catch { /* already gone */ }
  }

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.name}  ${f.detail}`);
    process.exit(1);
  }
}

await main();
