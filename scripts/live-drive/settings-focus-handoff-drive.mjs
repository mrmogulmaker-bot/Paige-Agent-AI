#!/usr/bin/env node
/**
 * THE SETTINGS NAVIGATION FOCUS HANDOFF — both sides of it.
 *
 * The shell restores focus to the PAIGE command field on every `location.pathname`
 * change while the rail is COLLAPSED, on a frame and again at 150ms. That override
 * used to land on top of the focus `SoloSettings` had just placed on the element
 * that actually scrolls it. Measured focus sequence at 1024x768 before the guard:
 *
 *     A.<rail link>  ->  MAIN.tcs-main--settings-scroll…  ->  BUTTON.tcs-command-field
 *
 * so after navigating to a Settings destination, End / PageDown / Space did nothing
 * until the human clicked or Tabbed back into the page. The rail-EXPANDED case never
 * had it, because the shell effect returns early there.
 *
 * The fix is one guard: the restore SKIPS when focus already sits on the Settings
 * scroll owner. It can only ever skip for Settings, because it keys on the class
 * `SoloSettings` puts on the owner it resolves and on nothing else.
 *
 * THIS DRIVE PROVES BOTH DIRECTIONS, because a guard that is too broad is as wrong
 * as no guard: Settings must keep focus, and everything else must still get the
 * command field.
 *
 *   1. Rail COLLAPSED and rail EXPANDED -> a long Settings destination.
 *   2. Keyboard scrolls immediately after navigation, with NO click and NO Tab.
 *   3. long -> short -> long destination changes: no stale scroll position, and
 *      focus never trapped outside the owner.
 *   4. Direct PAIGE command focus still works.
 *   5. Locked surfaces stay non-scrollable AND still receive the command field.
 *
 * HONESTY (§13/§32.c): a LOCAL mount of the real merged `SoloApp` with a stubbed
 * Supabase transport, so rows are synthetic. It proves FOCUS and SCROLL behaviour,
 * which are decided by the shell and the route rather than by the data. It is not
 * the deployed app. Run it against a settled tree — the harness is a Vite dev
 * server and editing source mid-run silently measures a different build.
 */
import { chromium } from "playwright";
import { assertHarnessServesWorkingTree } from "./harness-freshness.mjs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.CAL_HARNESS_URL || "http://127.0.0.1:5203";
const EXE = process.env.PW_EXECUTABLE_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = path.resolve("scripts/live-drive/artifacts/settings-focus-handoff");
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [{ w: 1536, h: 770 }, { w: 1366, h: 768 }, { w: 1024, h: 768 }, { w: 900, h: 1000 }];
const THEMES = ["dark", "light"];
const HOST = "[data-solo-screen-host]";

const results = [];
const record = (viewport, name, ok, detail) => {
  results.push({ viewport, name, ok, detail });
  console.log(`   ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`);
};

const owner = (page) => page.evaluate((s) => {
  const h = document.querySelector(s);
  return {
    inOwner: h.contains(document.activeElement),
    focus: document.activeElement.tagName + "." + String(document.activeElement.className || "").slice(0, 30),
    scrollTop: h.scrollTop, extent: h.scrollHeight - h.clientHeight,
  };
}, HOST);

const settle = async (page) => {
  let last = -1, still = 0;
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate((s) => document.querySelector(s).scrollTop, HOST);
    still = now === last ? still + 1 : 0;
    if (still >= 3) return now;
    last = now;
    await page.waitForTimeout(40);
  }
  return last;
};

/**
 * Fold PAIGE via the control a human actually uses — the icon button INSIDE the
 * panel, which exists at every width.
 *
 * The previous version clicked `.tcs-paige-backdrop`, which is `display: none`
 * globally and only enabled inside `@media (max-width: 1080px)`. So at 1536x770
 * and 1366x768 it silently did nothing, the rail stayed EXPANDED, and the shell's
 * restore effect returned early — meaning the row named "rail COLLAPSED" was
 * identical to the expanded case at half the viewports and passed with or without
 * the guard under test. An independent review measured that directly.
 *
 * Folding this way also arms the effect: `paigeFocusToken` is bumped by the fold
 * handler, and the restore is a no-op without it. Returns whether the rail was
 * actually folded, so a caller can assert rather than assume.
 */
const foldPaige = async (page) => {
  const inPanel = await page.$('button.tcs-icon-button[aria-label="Fold PAIGE conversation"]');
  if (inPanel && await inPanel.isVisible()) { await inPanel.click(); await page.waitForTimeout(300); }
  else {
    const backdrop = await page.$(".tcs-paige-backdrop");
    if (backdrop && await backdrop.isVisible()) { await backdrop.click(); await page.waitForTimeout(300); }
  }
  return page.evaluate(() =>
    document.querySelector("[data-tenant-shell]")?.getAttribute("data-paige") !== "open");
};

const navTo = async (page, label) => {
  const link = await page.$(`a:has-text("${label}")`);
  if (!link) return false;
  await link.click();
  await page.waitForTimeout(900);
  return true;
};

async function run() {
  await assertHarnessServesWorkingTree(BASE, [
    { file: "src/components/tenant-shell/TenantCommandCenterShell.tsx", markers: ["holdsSettingsScrollFocus(document.activeElement)"] },
    { file: "src/components/tenant-shell/settings-scroll-contract.ts", markers: ["holdsSettingsScrollFocus"] },
    { file: "src/solo/settings.tsx", markers: ["tcs-main--settings-scrollbar-hidden", "scrollOwner.contains(document.activeElement)"] },
    { file: "src/solo/solo-tokens.css", markers: ["main[data-solo-screen-host].tcs-main--settings-scrollbar-hidden"] },
  ]);
  const browser = await chromium.launch({ executablePath: EXE });
  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) {
      const tag = `${vp.w}x${vp.h}-${theme}`;
      console.log(`\n── ${tag} ──────────────────`);

      // ---- FLOW 1a + 2: rail COLLAPSED -> long Settings destination, keyboard now
      let page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
      await page.goto(`${BASE}/?route=settings-setup&theme=${theme}`, { waitUntil: "networkidle" });
      await page.waitForSelector(".solo-settings", { timeout: 15000 });
      await page.waitForTimeout(1000);
      const folded = await foldPaige(page);
      await navTo(page, "Connections");
      const collapsed = await owner(page);
      // Asserted, not assumed: if the fold silently failed the shell's restore
      // returns early and every row below it is vacuous.
      record(tag, "rail actually folded, so the shell's restore is armed",
             folded, "the fold control did not fold the rail — rows below are vacuous");
      record(tag, "rail COLLAPSED: focus lands on the Settings scroll owner",
             collapsed.inOwner, `focus ${collapsed.focus}`);
      await page.keyboard.press("End");
      const reachedCollapsed = await settle(page);
      record(tag, "rail COLLAPSED: End scrolls immediately — no click, no Tab",
             collapsed.extent <= 1 || reachedCollapsed >= collapsed.extent - 2,
             `scrollTop ${reachedCollapsed} of ${collapsed.extent}`);
      await page.screenshot({ path: path.join(OUT, `${tag}-collapsed.png`) });
      await page.close();

      // ---- FLOW 1b: rail EXPANDED -> long Settings destination
      page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
      await page.goto(`${BASE}/?route=settings-setup&theme=${theme}`, { waitUntil: "networkidle" });
      await page.waitForSelector(".solo-settings", { timeout: 15000 });
      await page.waitForTimeout(1000);
      await navTo(page, "Connections");          // rail left EXPANDED on purpose
      const expanded = await owner(page);
      record(tag, "rail EXPANDED: focus lands on the Settings scroll owner",
             expanded.inOwner, `focus ${expanded.focus}`);
      await page.keyboard.press("PageDown");
      const reachedExpanded = await settle(page);
      record(tag, "rail EXPANDED: PageDown scrolls immediately — no click, no Tab",
             expanded.extent <= 1 || reachedExpanded > 0, `scrollTop ${reachedExpanded} of ${expanded.extent}`);

      // ---- FLOW 3: long -> short -> long, no stale position, no focus trap
      await page.keyboard.press("End");
      await settle(page);
      await navTo(page, "Vault");                             // short
      const short = await owner(page);
      record(tag, "long -> short: no stale scroll position",
             short.scrollTop === 0, `scrollTop ${short.scrollTop}`);
      record(tag, "long -> short: focus is not trapped outside the owner",
             short.inOwner, `focus ${short.focus}`);
      await navTo(page, "Connections");                        // long again
      const backLong = await owner(page);
      record(tag, "short -> long: lands at the top, focus in the owner",
             backLong.scrollTop === 0 && backLong.inOwner,
             `scrollTop ${backLong.scrollTop} · focus ${backLong.focus}`);
      await page.keyboard.press("Space");
      const reachedAgain = await settle(page);
      record(tag, "short -> long: Space still scrolls, no click or Tab",
             backLong.extent <= 1 || reachedAgain > 0, `scrollTop ${reachedAgain} of ${backLong.extent}`);
      await page.close();

      // ---- FLOW 4: direct PAIGE command focus still works
      page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
      await page.goto(`${BASE}/?route=settings-setup&theme=${theme}`, { waitUntil: "networkidle" });
      await page.waitForSelector(".solo-settings", { timeout: 15000 });
      await page.waitForTimeout(1000);
      await foldPaige(page);
      const cmd = await page.$("[data-tenant-paige-command]");
      let cmdOk = false, cmdDetail = "no command field rendered";
      if (cmd) {
        await cmd.click();
        await page.waitForTimeout(200);
        const st = await page.evaluate(() =>
          document.activeElement?.getAttribute("data-tenant-paige-command") !== null
          || String(document.activeElement?.className || "").includes("tcs-command-field"));
        cmdOk = st;
        cmdDetail = await page.evaluate(() => document.activeElement.tagName + "." + String(document.activeElement.className || "").slice(0, 30));
      }
      record(tag, "direct PAIGE command focus still works", cmdOk, cmdDetail);
      await page.close();

      // ---- FLOW 5: locked surfaces keep non-scroll AND command-field restore
      for (const locked of ["clients", "growth", "compass"]) {
        page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
        await page.goto(`${BASE}/?route=${locked}&theme=${theme}`, { waitUntil: "networkidle" });
        await page.waitForSelector(HOST, { timeout: 15000 });
        await page.waitForTimeout(1000);
        await foldPaige(page);
        const g = await page.evaluate((s) => {
          const h = document.querySelector(s);
          return { ov: getComputedStyle(h).overflowY, sh: h.scrollHeight, ch: h.clientHeight,
                   cls: String(h.className) };
        }, HOST);
        record(tag, `${locked}: still form-fitting, not document-scrollable`,
               g.ov === "hidden" && g.sh <= g.ch + 1 && !g.cls.includes("settings-scrollbar"),
               `overflow-y:${g.ov} ${g.sh}/${g.ch} class:"${g.cls}"`);
        await page.keyboard.press("End");
        await page.waitForTimeout(400);
        const moved = await page.evaluate((s) => document.querySelector(s).scrollTop, HOST);
        record(tag, `${locked}: End does not scroll it`, moved === 0, `scrollTop ${moved}`);

        // THE OTHER HALF, which this drive previously claimed and never checked:
        // a locked surface must still RECEIVE the command field. A guard that is
        // too broad would silently stop that, and every row above would stay green.
        // Navigating between two locked surfaces re-runs the shell restore.
        const other = locked === "clients" ? "Campaigns" : "Clients";
        const otherLink = await page.$(`a:has-text("${other}")`);
        if (otherLink) {
          await otherLink.click();
          await page.waitForTimeout(900);
          const cmdFocused = await page.evaluate(() =>
            String(document.activeElement?.className || "").includes("tcs-command-field")
            || document.activeElement?.hasAttribute("data-tenant-paige-command") === true);
          const finalFocus = await page.evaluate(() =>
            document.activeElement.tagName + "." + String(document.activeElement.className || "").slice(0, 30));
          record(tag, `${locked} -> ${other}: the command field is still restored`,
                 cmdFocused, `focus ${finalFocus}`);
        }
      }
    }
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n═══════════════════════════════════════════\n  ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log(`\n  FAILURES (${failed.length}):`);
    for (const f of failed) console.log(`   ✗ [${f.viewport}] ${f.name} — ${f.detail}`);
  }
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
  console.log(`\n  frames + results.json → ${OUT}`);
}
run().catch((e) => { console.error("DRIVE ERROR:", e); process.exit(1); });
