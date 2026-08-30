#!/usr/bin/env node
/**
 * connections-calendars-drive — measure the REAL Connections › Calendars render.
 *
 * WHY THIS EXISTS. A green `tsc` proves the surface type-checks; it proves nothing
 * about whether it renders, whether the page scrolls once instead of five times,
 * or whether a control ends up parked off the edge of something (§32). This drive
 * is pointed squarely at the claims the density pass makes, and every one of them
 * is a MEASUREMENT rather than a reading:
 *
 *   · the document never scrolls sideways, at any measured width;
 *   · no element inside the surface owns a scrollbar — the page is the one scroll
 *     owner, which is the whole point of the shape;
 *   · all ten configuration areas exist, collapse, and expand;
 *   · a closed area still carries its answer, and a broken one carries a tone;
 *   · the sub-navigation actually stays put once the page moves;
 *   · the intended typefaces painted rather than silently falling back.
 *
 * WHAT IT DOES NOT PROVE (§13/§32.c): the rows are synthetic and this is a LOCAL
 * render, not the deployed one. The authenticated live drive of the deployed
 * surface is still owed to a session that holds credentials.
 *
 *   node scripts/live-drive/connections-calendars-drive.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, "../..");
const ART = path.join(HERE, "artifacts", "connections-calendars");
const BASE = "http://127.0.0.1:5201";

const WIDTHS = [
  { w: 1440, h: 1000, label: "desk" },
  { w: 1024, h: 900, label: "laptop" },
  { w: 720, h: 900, label: "narrow" },
];
const FACES = ["Schibsted Grotesk", "JetBrains Mono"];

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
      if (line.includes("ready in") || line.includes("Local:")) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on("data", watch);
    child.stderr.on("data", watch);
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`vite exited ${code}`)); });
  });
}

/** Every failed expectation is collected; the run reports all of them, not the first. */
const failures = [];
const check = (name, pass, detail) => {
  if (!pass) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  return pass;
};

const FACTS = (faces) => {
  const doc = document.documentElement;
  const owner = document.getElementById("tenant-shell-main");

  // Anything inside the surface that scrolls is a nested scroll trap. The shell's
  // own main is the ONE permitted scroll owner.
  const nested = [];
  for (const el of document.querySelectorAll(".solo-settings *")) {
    const cs = getComputedStyle(el);
    const scrollsX = el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(cs.overflowX);
    const scrollsY = el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(cs.overflowY);
    if (scrollsX || scrollsY) nested.push(`${el.className || el.tagName}${scrollsX ? " x" : ""}${scrollsY ? " y" : ""}`);
  }

  // Nothing may stick out past the right edge of the surface.
  const surface = document.querySelector(".solo-settings");
  const right = surface.getBoundingClientRect().right;
  const clipped = [];
  for (const el of document.querySelectorAll(".cc button, .cc input, .cc select, .cc a")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > right + 1) clipped.push(el.className || el.tagName);
  }

  const areas = [...document.querySelectorAll(".cc-area")];
  return {
    docScrollsX: doc.scrollWidth > doc.clientWidth + 1,
    ownerScrollsY: owner.scrollHeight > owner.clientHeight,
    canvas: getComputedStyle(document.body).backgroundColor,
    nested,
    clipped: [...new Set(clipped)],
    areaCount: areas.length,
    areaNumbers: areas.map((a) => a.querySelector(".cc-area-n")?.textContent),
    closedAnswers: [...document.querySelectorAll(".cc-area-v")].map((v) => v.textContent),
    tonedAreas: areas.filter((a) => a.dataset.tone).map((a) => `${a.querySelector(".cc-area-n")?.textContent}:${a.dataset.tone}`),
    presetCards: document.querySelectorAll(".cc-preset-card").length,
    issueControls: [...document.querySelectorAll(".cc-issue")].map((i) => i.textContent),
    glanceRows: document.querySelectorAll(".cc-glance > div").length,
    indexItems: document.querySelectorAll(".cc-index-i").length,
    subnavPosition: getComputedStyle(document.querySelector(".ss-subnav")).position,
    facesLoaded: faces.map((f) => [f, document.fonts.check(`12px "${f}"`)]),
  };
};

async function measure(page, { w, h, label }, theme, data) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE}/?theme=${theme}&data=${data}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".cc-area", { timeout: 20_000 });

  const tag = `${data}-${theme}-${label}`;
  const facts = await page.evaluate(FACTS, FACES);

  check(`${tag}: document does not scroll sideways`, !facts.docScrollsX);
  check(`${tag}: no nested scroller inside the surface`, facts.nested.length === 0, facts.nested.join(", "));
  check(`${tag}: no control clipped past the surface edge`, facts.clipped.length === 0, facts.clipped.join(", "));
  check(`${tag}: ten configuration areas`, facts.areaCount === 10, `saw ${facts.areaCount}`);
  check(`${tag}: sub-navigation is sticky`, facts.subnavPosition === "sticky", facts.subnavPosition);
  check(`${tag}: the page is the scroll owner`, facts.ownerScrollsY);
  for (const [face, loaded] of facts.facesLoaded) check(`${tag}: ${face} painted`, loaded);

  fs.writeFileSync(path.join(ART, `${tag}.json`), JSON.stringify(facts, null, 2));
  await page.screenshot({ path: path.join(ART, `${tag}.png`), fullPage: true });
  return facts;
}

async function main() {
  fs.rmSync(ART, { recursive: true, force: true });
  fs.mkdirSync(ART, { recursive: true });

  const vite = await startVite();
  const browser = await chromium.launch({
    executablePath: process.env.PW_EXECUTABLE_PATH || "/opt/pw-browsers/chromium",
  });
  try {
    const page = await browser.newPage();
    // Off-origin is aborted so a stray call fails loudly, except the font hosts —
    // a frame that lost its typeface BECAUSE the capture blocked the CDN looks
    // exactly like a port that never applied it.
    await page.route("**/*", (route) => {
      const url = route.request().url();
      const allowed = url.startsWith(BASE) || url.startsWith("data:")
        || url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com");
      return allowed ? route.continue() : route.abort();
    });

    const canvases = {};
    for (const theme of ["light", "dark"]) {
      for (const size of WIDTHS) {
        const facts = await measure(page, size, theme, "dense");
        canvases[theme] = facts.canvas;
      }
    }
    check("light and dark are genuinely different grounds", canvases.light !== canvases.dark,
      `${canvases.light} vs ${canvases.dark}`);

    // The broken-configuration state: a fault must be legible on the closed plate
    // and reachable as a control, not only after opening ten panels.
    const issues = await measure(page, WIDTHS[0], "dark", "issues");
    check("a broken configuration tones its closed plate", issues.tonedAreas.length > 0, JSON.stringify(issues.tonedAreas));
    check("every fault is offered as a control", issues.issueControls.length > 0, JSON.stringify(issues.issueControls));

    // A failed host read is reported as unreadable, never as "no host".
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${BASE}/?theme=dark&data=hostserror`, { waitUntil: "networkidle" });
    await page.waitForSelector(".cc-area");
    const hostText = await page.evaluate(() => document.body.textContent ?? "");
    check("a failed host read says so", /could not be read/i.test(hostText));
    check("a failed host read is not reported as no host", !/No host is registered/i.test(hostText));

    // Expand / collapse actually drives the plates.
    await page.goto(`${BASE}/?theme=dark&data=dense`, { waitUntil: "networkidle" });
    await page.waitForSelector(".cc-area");
    const openCount = () => page.evaluate(() => document.querySelectorAll('.cc-area[data-open="true"]').length);
    check("one area is open on arrival", (await openCount()) === 1);
    await page.getByRole("button", { name: /Expand all/ }).click();
    check("expand all opens every area", (await openCount()) === 10);
    await page.getByRole("button", { name: /Collapse all/ }).click();
    check("collapse all closes every area", (await openCount()) === 0);
    const answers = await page.evaluate(() => [...document.querySelectorAll(".cc-area-v")].map((v) => v.textContent));
    check("every closed area still answers", answers.length === 10 && answers.every((a) => a && a.trim().length > 0),
      JSON.stringify(answers));

    // The sub-navigation genuinely pins. It starts below the page heading, rises
    // to the top of the scroll port, and then does not move again however much
    // further the page travels — which is the behaviour, not merely the property.
    const subnavTop = () => page.evaluate(() => document.querySelector(".ss-subnav").getBoundingClientRect().top);
    const atRest = await subnavTop();
    const scrollTo = async (y) => {
      await page.evaluate((v) => { document.getElementById("tenant-shell-main").scrollTop = v; }, y);
      await page.waitForTimeout(150);
    };
    await scrollTo(900);
    const pinned = await subnavTop();
    await scrollTo(1800);
    const stillPinned = await subnavTop();
    check("the sub-navigation starts below the page heading", atRest > 40, String(atRest));
    check("the sub-navigation pins to the top of the scroll port", Math.abs(pinned) < 2, String(pinned));
    check("it stays pinned however far the page travels", Math.abs(stillPinned - pinned) < 2, `${pinned} → ${stillPinned}`);
    await page.screenshot({ path: path.join(ART, "scrolled-dark-desk.png") });
  } finally {
    await browser.close();
    vite.kill("SIGTERM");
  }

  if (failures.length) {
    console.error(`\n✗ connections-calendars-drive: ${failures.length} failure(s)`);
    for (const f of failures) console.error(`   · ${f}`);
    process.exit(1);
  }
  console.log(`\n✓ connections-calendars-drive: all checks passed. Frames in ${path.relative(REPO, ART)}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
