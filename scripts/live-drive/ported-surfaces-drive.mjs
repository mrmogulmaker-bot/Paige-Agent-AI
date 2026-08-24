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
