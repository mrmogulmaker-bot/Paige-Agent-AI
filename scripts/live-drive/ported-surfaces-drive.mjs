#!/usr/bin/env node
/**
 * ported-surfaces-drive — every ported operator surface, rendered in a REAL browser, in BOTH
 * themes, and asserted.
 *
 * Owner, 2026-08-24: *"make sure we are using Playwright to confirm our work."*
 *
 * WHY THIS EXISTS AND WHAT IT CATCHES THAT NOTHING ELSE DOES. Every defect this console has been
 * rejected for passed `tsc`, `eslint` and the whole vitest suite first: 78 tabs rendering one
 * empty card, six purpose-built surfaces imported and never rendered, four v3 ports reachable
 * only from their own tests. A green suite and a working screen are different claims (§32), and
 * a jsdom test cannot tell them apart — it has no layout, no CSS cascade, and no paint.
 *
 * So this drives the shipped components through the shell's own dispatch, in Chromium, and
 * asserts the four things a jsdom render structurally cannot see:
 *
 *   1. NO PAGE ERROR. A surface that throws during render is the silent-blank failure §32 exists
 *      to kill. A thrown error here fails the address outright.
 *   2. THE SURFACE ACTUALLY RENDERED. Measured as text length inside `[data-surface-slot]`
 *      against a floor, because "resolves an address" and "puts something on screen" are the two
 *      claims this console has already confused once, at the cost of 78 blank tabs.
 *   3. NO DOCUMENT-LEVEL HORIZONTAL SCROLL. A `min-width: 0` missing anywhere inside a grid
 *      track gives the whole page a horizontal scrollbar, which typechecks perfectly and looks
 *      like nothing until you see it. The pack's own builders carry `minWidth:0` comments at the
 *      exact sites where CD hit this.
 *   4. IT SURVIVES A NARROW VIEWPORT. Every ported surface folds — panes collapse, columns drop,
 *      a back step appears. A fold that renders nothing is worse than no fold, so the narrow pass
 *      re-asserts (1)–(3) at 720px.
 *
 * WHAT IT DOES NOT PROVE (§13, and this is not a formality). It renders against the LOCAL dev
 * harness with auth and data mocked. It is not the deployed bundle, it exercises no auth, no RLS
 * and no read, and it is not a look at the screen. **It does not discharge the §32.c owner
 * live-drive**, which stays owed on the deployed surface. And it measures; it does not judge
 * (§00) — geometry, errors, whether a surface rendered at all are facts about whether it WORKS.
 *
 * Run:
 *   npx vite --config scripts/live-drive/harness/mount/vite.config.ts &
 *   node scripts/live-drive/ported-surfaces-drive.mjs
 *
 * Exits non-zero on any failed assertion, so it can gate a slice.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.HARNESS_BASE || "http://127.0.0.1:5199";
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const SHOOT = process.argv.includes("--shoot");
const ART = path.resolve(import.meta.dirname, "artifacts/ported");

/**
 * Every BESPOKE address, with the floor its content must clear.
 *
 * The floor is per-address on purpose. A uniform floor would either be so low it proves nothing
 * on a dense surface, or so high it fails an honest absence — and an honest absence IS the
 * finished Layer 3 state for most of these, so failing it would punish the correct behaviour.
 * Each floor is set below what the surface renders empty and well above a blank card.
 */
const ADDRESSES = [
  // Layer 3a — Relationships
  { at: "/operator/relationships/people", floor: 300, must: ["Drawn, not wired", "Lifecycle"] },
  { at: "/operator/relationships/conversations", floor: 300, must: ["Threads", "channels live"] },
  { at: "/operator/relationships/segments", floor: 300, must: ["Describe one to her", "New segment"] },
  // Calendar renders CD's field with no read behind it; its honest empty state is genuinely
  // short, so the floor is set to what a real render produces rather than to a round number.
  { at: "/operator/relationships/calendar", floor: 90, must: [] },
  // Layer 3b — Campaigns
  { at: "/operator/campaigns/active", floor: 300, must: ["Everything", "campaigns"] },
  { at: "/operator/campaigns/catalog", floor: 200, must: [] },
  { at: "/operator/campaigns/sales", floor: 200, must: ["No target is set"] },
  // Layer 3c — Marketplace
  // "Search the marketplace" is a PLACEHOLDER attribute, not text — asserting it as content was
  // the drive being wrong about the DOM, not the surface being wrong. Placeholders are checked
  // separately below.
  { at: "/operator/marketplace/storefront", floor: 300, must: ["capped by your ceiling"], placeholders: ["Search the marketplace"] },
  { at: "/operator/marketplace/catalog", floor: 300, must: ["held below grant", "your ceiling, not their code"] },
  { at: "/operator/marketplace/submissions", floor: 200, must: [] },
  { at: "/operator/marketplace/publishers", floor: 300, must: ["Verified agency", "widest reach"] },
  // Layer 3d — Settings
  {
    at: "/operator/settings/setup",
    floor: 600,
    must: [
      // The §38 money line is step-dependent — it renders when that step is SELECTED — so it is
      // asserted by clicking to it further down rather than here. Asserting it on arrival was the
      // first version of this entry and it failed correctly: the drive was wrong, not the surface.
      // The absence arms: no state read, so every figure is an em-dash inside CD's sentence.
      "—% set up",
      "— done · — left · — waiting on something we have not built",
      "Nothing left for her",
      "Everything else",
    ],
  },
  {
    /**
     * Capabilities is WIRED, and the harness has no real Supabase — so what this address proves
     * is the FAILURE arm, which is the one that matters most on a governance surface. A read that
     * fails must say it failed; rendering an empty catalogue would read as "she can do nothing",
     * and on a page about what Paige is allowed to do that is the more dangerous of the two lies.
     */
    at: "/operator/settings/capabilities",
    floor: 120,
    must: ["it is an unread one"],
  },
  // Already wired
  { at: "/operator/fleet/systems-check", floor: 300, must: [] },
  { at: "/operator/fleet/directory", floor: 100, must: [] },
];

function chromePath() {
  if (process.env.PW_EXECUTABLE_PATH) return process.env.PW_EXECUTABLE_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  return fs
    .readdirSync(base)
    .filter((d) => d.startsWith("chromium-"))
    .map((d) => path.join(base, d, "chrome-linux/chrome"))
    .find((p) => fs.existsSync(p));
}

/**
 * Backend noise is EXPECTED and is never asserted on: the harness points at a deliberately fake
 * Supabase URL, so every read fails by design. Asserting on it would fail the drive for a reason
 * that has nothing to do with the rendering it exists to prove. A real render crash arrives as a
 * `pageerror`, which IS asserted.
 */
const isBackendNoise = (t) =>
  /harness\.invalid|ERR_CERT|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|Failed to load resource|supabase|NetworkError|Failed to fetch/i.test(
    t,
  );

const fails = [];
const rows = [];

const browser = await chromium.launch({ executablePath: chromePath() });

async function drive(page, at, theme, width) {
  const errs = [];
  const onErr = (e) => {
    const t = String(e?.message ?? e);
    if (!isBackendNoise(t)) errs.push(t);
  };
  page.on("pageerror", onErr);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${BASE}/?at=${encodeURIComponent(at)}&theme=${theme}`, {
    waitUntil: "networkidle",
  });
  // The surfaces are code-split; a measurement taken before the chunk resolves measures the hold.
  await page
    .waitForFunction(
      () => {
        const s = document.querySelector("[data-surface-slot]");
        return s && !s.querySelector('[aria-busy="true"]');
      },
      { timeout: 8000 },
    )
    .catch(() => {});
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const sec = document.querySelector("[data-surface-slot]");
    const de = document.documentElement;
    return {
      found: !!sec,
      view: sec?.getAttribute("data-surface-view") ?? null,
      text: (sec?.textContent || "").replace(/\s+/g, " ").trim(),
      placeholders: [...(sec?.querySelectorAll("[placeholder]") ?? [])].map((e) =>
        e.getAttribute("placeholder"),
      ),
      hScroll: de.scrollWidth - de.clientWidth,
    };
  });
  page.off("pageerror", onErr);
  return { ...m, errs };
}

const list = ONLY.length ? ADDRESSES.filter((a) => ONLY.some((o) => a.at.includes(o))) : ADDRESSES;
if (SHOOT) fs.mkdirSync(ART, { recursive: true });

for (const spec of list) {
  for (const theme of ["dark", "light"]) {
    for (const width of [1600, 720]) {
      const page = await browser.newPage();
      const r = await drive(page, spec.at, theme, width);
      const tag = `${spec.at} · ${theme} · ${width}px`;
      const problems = [];

      if (r.errs.length) problems.push(`page error: ${r.errs[0]}`);
      if (!r.found) problems.push("no [data-surface-slot] in the document");
      if (r.text.length < spec.floor)
        problems.push(`rendered ${r.text.length} chars, floor is ${spec.floor}`);
      if (r.hScroll > 0) problems.push(`document scrolls horizontally by ${r.hScroll}px`);
      // Copy assertions run at the wide pass only: a fold legitimately drops a pane, and its
      // strings with it, so requiring them at 720px would fail correct folding behaviour.
      if (width === 1600) {
        for (const s of spec.must) {
          if (!r.text.includes(s)) problems.push(`missing authored string: "${s}"`);
        }
        for (const ph of spec.placeholders ?? []) {
          if (!r.placeholders.includes(ph)) problems.push(`missing placeholder: "${ph}"`);
        }
      }

      if (SHOOT && width === 1600) {
        const name = spec.at.replace(/\//g, "_").replace(/^_/, "") + `.${theme}.png`;
        await page.screenshot({ path: path.join(ART, name), fullPage: false });
      }

      rows.push({ tag, chars: r.text.length, ok: problems.length === 0 });
      if (problems.length) {
        fails.push(`${tag}\n      ${problems.join("\n      ")}`);
        console.log(`FAIL  ${tag}\n      ${problems.join("\n      ")}`);
      } else {
        console.log(`pass  ${tag}  (${r.text.length} chars)`);
      }
      await page.close();
    }
  }
}

/**
 * THE SPINE FOLD, DRIVEN. Owner, live, 2026-08-24: *"I cannot fold Paige's chat in."*
 *
 * The control was rendering `disabled` because the shell passed no `onFold`, so the console could
 * summon the spine open and had no way to shut it — a one-way door. `disabled` is not something a
 * jsdom assertion on the header would have caught either, because the header renders correctly
 * for the props it is given; the defect was at the call site. So this drives the actual round
 * trip: fold it, confirm the panel unmounts AND its grid track goes to zero (the pack has both
 * mechanisms and either alone is a visible defect), then summon it back.
 */
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${BASE}/?at=/operator/fleet/systems-check&theme=dark`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(600);
  const read = () =>
    page.evaluate(() => {
      const grid = document.querySelector("[data-shell-grid]");
      return {
        mounted: !!document.querySelector("[data-operator-spine]"),
        track: getComputedStyle(grid).gridTemplateColumns.split(" ").pop(),
        summon: !!document.querySelector('[aria-label="Summon PAIGE"]'),
      };
    });

  const problems = [];
  const open = await read();
  if (!open.mounted) problems.push("spine is not mounted to begin with");

  const fold = page.locator('[aria-label="Fold the conversation"]');
  if (await fold.isDisabled()) {
    problems.push("the fold control is DISABLED — the shell is passing no handler");
  } else {
    await fold.click();
    await page.waitForTimeout(450);
    const shut = await read();
    if (shut.mounted) problems.push("clicked fold and the spine is still mounted");
    if (shut.track !== "0px") problems.push(`clicked fold and the track is ${shut.track}, not 0px`);
    if (!shut.summon) problems.push("folded with no way to summon it back — a one-way door");
    else {
      await page.click('[aria-label="Summon PAIGE"]');
      await page.waitForTimeout(450);
      const back = await read();
      if (!back.mounted) problems.push("summoned and the spine did not come back");
    }
  }

  const tag = "spine fold · round trip";
  rows.push({ tag, ok: problems.length === 0 });
  if (problems.length) {
    fails.push(`${tag}\n      ${problems.join("\n      ")}`);
    console.log(`FAIL  ${tag}\n      ${problems.join("\n      ")}`);
  } else {
    console.log(`pass  ${tag}  (fold unmounts + collapses the track, summon restores it)`);
  }
  await page.close();
}

/**
 * THE FIVE SPINE FACES — BUILD-ORDER Layer 5. Owner, 2026-08-24, sending CD's reference frames:
 * *"This is what we want it to look like."* The strip had drawn ONE face because `OperatorSpine`
 * hides a region whose body is null, and only Chat had one. So this clicks every face and asserts
 * each renders a body, in both themes.
 *
 * CHAT IS EXEMPT FROM THE CONTENT FLOOR, and the reason is worth stating rather than hiding in a
 * number: its body is the Trust Compass strip over the transcript, and in this harness there is
 * no stored rung and no turn — so an EMPTY chat face is the correct render, not a broken one. It
 * is asserted to mount and to throw nothing; asserting text on it would be asserting fixtures.
 */
for (const theme of ["dark", "light"]) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errs = [];
  page.on("pageerror", (e) => {
    const t = String(e?.message ?? e);
    if (!isBackendNoise(t)) errs.push(t);
  });
  await page.goto(`${BASE}/?at=/operator/fleet/systems-check&theme=${theme}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(600);

  const faces = await page.$$eval("[data-spine-face]", (els) =>
    els.map((e) => e.getAttribute("data-spine-face")),
  );
  const problems = [];
  if (faces.length !== 5) problems.push(`the strip drew ${faces.length} face(s), expected 5`);

  for (const f of faces) {
    await page.click(`[data-spine-face="${f}"]`);
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const region = document.querySelector("[data-spine-region]");
      const de = document.documentElement;
      return {
        id: region?.getAttribute("data-spine-region") ?? null,
        chars: (region?.textContent || "").replace(/\s+/g, " ").trim().length,
        hScroll: de.scrollWidth - de.clientWidth,
      };
    });
    if (r.id !== f) problems.push(`clicked ${f} and the region is ${r.id}`);
    if (f !== "chat" && r.chars < 60) problems.push(`${f} rendered only ${r.chars} chars`);
    if (r.hScroll > 0) problems.push(`${f} scrolls the document by ${r.hScroll}px`);
  }
  if (errs.length) problems.push(`page error: ${errs[0]}`);

  const tag = `spine faces · ${theme} · all five`;
  rows.push({ tag, ok: problems.length === 0 });
  if (problems.length) {
    fails.push(`${tag}\n      ${problems.join("\n      ")}`);
    console.log(`FAIL  ${tag}\n      ${problems.join("\n      ")}`);
  } else {
    console.log(`pass  ${tag}  (${faces.join(" · ")})`);
  }
  await page.close();
}

/**
 * THE SCRATCH BUFFER, DRIVEN — the one part of the Code face that a jsdom test structurally
 * cannot reach. `SpineCode.test.tsx` says so itself: this repo has no RTL, its spine tests render
 * with `react-dom/server`, and a static render can prove the shape but never that `+` creates a
 * file, that typing marks the tab dirty, that Revert drops the buffer, or that × closes it. Those
 * are the whole capability on that face, so they are asserted here, in a browser, or nowhere.
 *
 * The RUN path is deliberately NOT driven. It is a 700ms timer ending in a refusal, and asserting
 * a refusal arrives on schedule would be timing the honest failure rather than the feature.
 */
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errs = [];
  page.on("pageerror", (e) => {
    const t = String(e?.message ?? e);
    if (!isBackendNoise(t)) errs.push(t);
  });
  await page.goto(`${BASE}/?at=/operator/fleet/systems-check&theme=dark`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(600);
  await page.click('[data-spine-face="code"]');
  await page.waitForTimeout(250);

  const problems = [];
  const region = '[data-spine-region="code"]';

  const before = await page.textContent(region);
  if (!before.includes("No file open")) {
    problems.push("the face did not open on its no-file arm");
  }

  await page.click(`${region} button[aria-label="New scratch file"]`);
  await page.waitForTimeout(250);
  const created = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    return {
      text: (root?.textContent || "").replace(/\s+/g, " ").trim(),
      editing: !!root?.querySelector('textarea[aria-label="Edit code"]'),
      tabs: root?.querySelectorAll('button[aria-label^="Close "]').length ?? 0,
    };
  }, region);
  if (!created.text.includes("scratch_1.py")) problems.push("`+` created no file");
  // `newScratch` sets `editing:true` — she opens the buffer for you, it is not a read-only add.
  if (!created.editing) problems.push("the new file did not open in the edit buffer");
  if (created.tabs !== 1) problems.push(`expected one tab, saw ${created.tabs}`);

  await page.fill(`${region} textarea[aria-label="Edit code"]`, "def f():\n    return 1\n");
  await page.waitForTimeout(200);
  const dirty = await page.evaluate((sel) => {
    const meta = (document.querySelector(sel)?.textContent || "");
    const mark = document.querySelector(`${sel} button i`);
    return {
      unsaved: meta.includes("unsaved"),
      gold: mark ? getComputedStyle(mark).backgroundColor : "",
    };
  }, region);
  if (!dirty.unsaved) problems.push("typing did not mark the file unsaved");
  if (!dirty.gold || dirty.gold === "rgba(0, 0, 0, 0)") {
    problems.push("the tab's dirty diamond stayed transparent while the buffer was dirty");
  }

  // Revert drops the buffer and returns to the tokenized read view.
  await page.click(`${region} button:has-text("Revert")`);
  await page.waitForTimeout(250);
  const reverted = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    return {
      editing: !!root?.querySelector('textarea[aria-label="Edit code"]'),
      text: (root?.textContent || "").replace(/\s+/g, " ").trim(),
      // The read view is a line-numbered grid; the seed file is two lines.
      numbered: (root?.textContent || "").includes("Empty scratch file"),
    };
  }, region);
  if (reverted.editing) problems.push("Revert left the edit buffer open");
  if (reverted.text.includes("unsaved")) problems.push("Revert left the file marked unsaved");
  if (!reverted.numbered) problems.push("the read view did not render the file's body");

  await page.click(`${region} button[aria-label="Close scratch_1.py"]`);
  await page.waitForTimeout(250);
  const closed = await page.textContent(region);
  if (!closed.includes("Every file was closed")) {
    problems.push("closing the last file did not return the closed-everything foot");
  }
  if (errs.length) problems.push(`page error: ${errs[0]}`);

  const tag = "spine · Code face · scratch buffer round trip";
  rows.push({ tag, ok: problems.length === 0 });
  if (problems.length) {
    fails.push(`${tag}\n      ${problems.join("\n      ")}`);
    console.log(`FAIL  ${tag}\n      ${problems.join("\n      ")}`);
  } else {
    console.log(`pass  ${tag}  (create · edit · dirty · revert · close)`);
  }
  await page.close();
}

/**
 * THE §38 LINE, REACHED THE WAY AN OPERATOR REACHES IT. `P.SETUP`'s Money group carries the money
 * boundary in CD's own words — *"we are never the merchant of record between you and your
 * client"* — on one step, so it renders when that step is selected and not before. It is the one
 * string on this surface that is doctrine rather than decoration, so it gets a real click-through
 * rather than a page-load assertion that would only prove the surface mounted.
 */
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errs = [];
  page.on("pageerror", (e) => {
    const t = String(e?.message ?? e);
    if (!isBackendNoise(t)) errs.push(t);
  });
  await page.goto(`${BASE}/?at=/operator/settings/setup&theme=dark`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const problems = [];
  const slot = "[data-surface-slot]";

  const onArrival = await page.textContent(slot);
  if (onArrival.includes("never the merchant of record")) {
    problems.push("the money line renders before its step is selected — it belongs to that step");
  }

  await page.click(`${slot} button:has-text("What your clients pay you")`);
  await page.waitForTimeout(250);
  const onMoney = (await page.textContent(slot)).replace(/\s+/g, " ");
  for (const line of [
    "Yours. Bring your own",
    "never the merchant of record between you and your client",
    "Lands in Settings",
    "Integrations",
  ]) {
    if (!onMoney.includes(line)) problems.push(`money step is missing: "${line}"`);
  }

  // A step CD marks as hers offers her act; one that is yours does not.
  await page.click(`${slot} button:has-text("Vendors and suppliers")`);
  await page.waitForTimeout(250);
  const onHers = await page.textContent(slot);
  if (!onHers.includes("she can do this")) problems.push("a PAIGE step did not say she can do it");
  if (!onHers.includes("Let her do it")) problems.push("a PAIGE step did not offer her act");
  if (errs.length) problems.push(`page error: ${errs[0]}`);

  const tag = "settings · Setup · the money boundary, reached by its step";
  rows.push({ tag, ok: problems.length === 0 });
  if (problems.length) {
    fails.push(`${tag}\n      ${problems.join("\n      ")}`);
    console.log(`FAIL  ${tag}\n      ${problems.join("\n      ")}`);
  } else {
    console.log(`pass  ${tag}  (§38 line renders on its step, and not before)`);
  }
  await page.close();
}

await browser.close();

console.log(
  `\n${rows.filter((r) => r.ok).length}/${rows.length} passes across ${list.length} address(es), 2 themes, 2 widths.`,
);
if (SHOOT) console.log(`frames → ${ART}`);
if (fails.length) {
  console.error(`\n${fails.length} failing.`);
  process.exit(1);
}
console.log(
  "Local harness render only — mocked auth and data, not the deployed bundle. The §32.c owner live-drive stays owed.",
);
