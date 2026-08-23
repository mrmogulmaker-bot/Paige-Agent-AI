#!/usr/bin/env node
/**
 * pack-shoot — render the Claude Design pack and capture every surface.
 *
 * TARGET: `PAIGE Platform Operator - standalone.html` — a COMPILED artifact with React,
 * the DC runtime, the IA, the Mind and both webfont families inlined as base64. Zero
 * network. CD regenerates it from the source on every revision.
 *
 * SOURCE OF TRUTH is a DIFFERENT FILE: `PAIGE Super Admin Shell v3.dc.html` + `paige-ia.js`
 * + `mind-brain.js` + `support.js`. Diff against those. NEVER edit or diff the standalone.
 *
 * This replaces an earlier workaround that vendored React and intercepted the CDN calls.
 * CD supplied the standalone specifically to remove that, and theirs is the better fix:
 * the workaround had to be re-applied whenever the pack was re-delivered.
 *
 * §24 automation of a repeat · §25 "see it before you ship it" in a headless session ·
 * §13 a surface that fails to boot is REPORTED as a failure, never screenshotted blank.
 *
 * Usage:
 *   node scripts/live-drive/pack-shoot.mjs                      # all surfaces, both themes, 1600x1000
 *   node scripts/live-drive/pack-shoot.mjs --only camp          # just Campaigns
 *   node scripts/live-drive/pack-shoot.mjs --width 900          # check the width-driven folds
 *   node scripts/live-drive/pack-shoot.mjs --fold               # fold the conversation panel first
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PACK_DIR = path.join(ROOT, 'docs/design-references/cd-packs/super-admin-shell-v3');
const TARGET = path.join(PACK_DIR, 'PAIGE Platform Operator - standalone.html');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);

const WIDTH = Number(arg('--width', 1600));
const HEIGHT = Number(arg('--height', 1000));
const OUT = path.resolve(arg('--out', path.join(ROOT, `scripts/live-drive/artifacts/pack-${WIDTH}`)));
const THEMES = arg('--theme', 'both') === 'both' ? ['dark', 'light'] : [arg('--theme', 'dark')];
const ONLY = arg('--only', null);
const FOLD = has('--fold');
const SETTLE = Number(arg('--settle', 450));   // CD: ~400ms; surfaces transition on grid-template-columns

function chromePath() {
  if (process.env.PW_EXECUTABLE_PATH) return process.env.PW_EXECUTABLE_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    return fs.readdirSync(base).filter((d) => d.startsWith('chromium-'))
      .map((d) => path.join(base, d, 'chrome-linux/chrome')).find((p) => fs.existsSync(p));
  } catch { return undefined; }
}

// [rail label, view label, file label]
const SLOTS = {
  Fleet: ['Systems check', 'Directory', 'History'],
  Relationships: ['People', 'Conversations', 'Calendar', 'Segments'],
  Campaigns: ['Active', 'Catalog', 'Sales', 'Pipeline', 'Social', 'Performance'],
  Marketplace: ['Storefront', 'Catalog', 'Submissions', 'Publishers'],
  Analytics: ['Fleet', 'Relationships', 'Campaigns', 'Autonomy', 'Platform health'],
  Settings: ['Setup', 'Platform', 'Integrations', 'Mind', 'Automations', 'Alerts',
             'Capabilities', 'Vault', 'Governance', 'Team'],
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

if (!fs.existsSync(TARGET)) {
  console.error(`standalone not found: ${TARGET}\nAsk CD to regenerate it — it is the screenshot target.`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});

const report = [];
for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
  // Hard-block ALL network. If the standalone is truly self-contained this changes nothing,
  // and if it ever regresses to a CDN we find out here rather than in a blank screenshot.
  await ctx.route('**://**', (route) =>
    route.request().url().startsWith('file://') ? route.continue() : route.abort());

  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 180)));

  await page.goto(pathToFileURL(TARGET).href, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.trim().length > 200, { timeout: 30000 })
    .catch(() => { throw new Error(`shell never booted (${theme}) — body stayed empty`); });

  const clickText = (re) => page.evaluate((src) => {
    const rx = new RegExp(src);
    const hit = [...document.querySelectorAll('button')].find((b) => rx.test(b.textContent));
    if (!hit) return false; hit.click(); return true;
  }, re.source);

  // Set the theme, then VERIFY it — do not trust the click. The toggle's label names the
  // theme you would switch TO, so a naive click is a coin flip depending on the boot theme,
  // and a mislabelled screenshot is worse than a missing one (it gets read as evidence).
  for (let attempt = 0; attempt < 2; attempt++) {
    const now = await page.evaluate(() =>
      document.querySelector('[data-pg]')?.getAttribute('data-pg') || null);
    if (now === theme) break;
    // Click the toggle regardless of its label. The label names the CURRENT theme, not the
    // target, so matching on the target word inverts the switch — which is exactly how 64
    // frames got mislabelled before this guard existed.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => /^(Mineral|Obsidian)$/.test(x.textContent.trim()));
      if (b) b.click();
    });
    await page.waitForTimeout(SETTLE);
  }
  const applied = await page.evaluate(() =>
    document.querySelector('[data-pg]')?.getAttribute('data-pg') || null);
  if (applied !== theme) {
    throw new Error(`theme "${theme}" requested but "${applied}" applied — refusing to mislabel ${THEMES.length * 32} frames`);
  }
  await page.waitForTimeout(SETTLE);
  if (FOLD) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => /^Fold/.test(x.getAttribute('aria-label') || ''));
      if (b) b.click();
    });
    await page.waitForTimeout(SETTLE);
  }

  for (const [rail, views] of Object.entries(SLOTS)) {
    for (const view of views) {
      const label = `${slug(rail)}-${slug(view)}`;
      if (ONLY && !label.startsWith(ONLY)) continue;

      if (!await clickText(new RegExp(rail))) {
        report.push({ theme, label, ok: false, why: `rail "${rail}" not found` }); continue;
      }
      await page.waitForTimeout(SETTLE);
      const switched = await page.evaluate((v) => {
        const hit = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === v);
        if (!hit) return false; hit.click(); return true;
      }, view);
      if (!switched) { report.push({ theme, label, ok: false, why: `view "${view}" not found` }); continue; }
      await page.waitForTimeout(SETTLE);

      // CD: "No page scrolls. A document scrollbar in a screenshot is a defect."
      const docScroll = await page.evaluate(() =>
        document.documentElement.scrollHeight > document.documentElement.clientHeight + 2);

      const file = path.join(OUT, `${theme}-${label}.png`);
      await page.screenshot({ path: file });
      const bytes = fs.statSync(file).size;
      report.push({ theme, label, ok: bytes > 15000, bytes, docScroll: docScroll || undefined });
    }
  }
  if (pageErrors.length) report.push({ theme, label: '(page errors)', ok: false, why: pageErrors.slice(0, 3).join(' | ') });
  await ctx.close();
}
await browser.close();

const failed = report.filter((r) => !r.ok);
const scrollers = report.filter((r) => r.docScroll);
console.log(JSON.stringify({
  target: path.basename(TARGET), viewport: `${WIDTH}x${HEIGHT}`, out: OUT,
  captured: report.filter((r) => r.ok).length,
  failed: failed.length, failures: failed.slice(0, 8),
  documentScrollbars: scrollers.length ? scrollers.map((s) => `${s.theme}-${s.label}`) : 'none',
}, null, 2));
process.exit(failed.length ? 1 : 0);
