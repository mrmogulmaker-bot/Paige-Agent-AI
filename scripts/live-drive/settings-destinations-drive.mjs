#!/usr/bin/env node
/**
 * EVERY SETTINGS DESTINATION HAS ONE VISIBLE, USABLE SCROLL OWNER.
 *
 * Owner requirement (2026-08-31), first half of the scroll policy. The Calendars
 * drive proves the longest destination in depth; this proves the repair reaches
 * ALL of them, which is the part a Calendars-only proof structurally cannot show.
 * It matters because the fix used to live in `CalendarsView` — where it delivered
 * "one visible, usable scroll owner" to one segment of one destination — before it
 * moved up into `SoloSettings`.
 *
 * Per destination, per viewport, per theme:
 *   1. The resolved owner is SoloApp's screen host, and it computes `overflow-y: auto`.
 *   2. Its scrollbar is suppressed in NEITHER lane (`scrollbar-width`, `::-webkit-scrollbar`).
 *   3. It is focusable (`tabindex="-1"`) so scroll keys reach it.
 *   4. A destination that overflows can be scrolled to its end by keyboard; one
 *      that fits reports `fits` and is not asserted against — a short page having
 *      nothing to scroll is correct, not a defect.
 *   5. No horizontal overflow.
 *
 * HONESTY (§13/§32.c): a LOCAL mount of the real merged `SoloApp` with a stubbed
 * Supabase transport, so several destinations render their empty or error state
 * and are SHORTER than in production. Check 4 reports `fits` for those rather than
 * pretending to have proven a scroll that had no distance to cover. Checks 1-3 and
 * 5 are containment and dressing, decided by the shell and route, not by the data.
 * This is not the deployed app.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.CAL_HARNESS_URL || "http://127.0.0.1:5203";
const EXE = process.env.PW_EXECUTABLE_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = path.resolve("scripts/live-drive/artifacts/settings-destinations");
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [{ w: 1536, h: 770 }, { w: 1366, h: 768 }, { w: 1024, h: 768 }, { w: 900, h: 1000 }];
const THEMES = ["dark", "light"];
const DESTINATIONS = [
  "settings", "settings-setup", "settings-team", "settings-integrations",
  "settings-notifications", "settings-security", "settings-vault", "settings-billing",
];

const results = [];
const record = (dest, viewport, name, ok, detail) => {
  results.push({ dest, viewport, name, ok, detail });
  console.log(`   ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`);
};
const HOST = "[data-solo-screen-host]";

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

async function run() {
  const browser = await chromium.launch({ executablePath: EXE });
  for (const dest of DESTINATIONS) {
    for (const theme of THEMES) {
      for (const vp of VIEWPORTS) {
        const tag = `${vp.w}x${vp.h}-${theme}`;
        console.log(`\n── ${dest} · ${tag} ──────────────────`);
        const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
        await page.goto(`${BASE}/?route=${dest}&theme=${theme}`, { waitUntil: "networkidle" });
        await page.waitForSelector(".solo-settings", { timeout: 15000 });
        await page.waitForTimeout(900);

        const backdrop = await page.$(".tcs-paige-backdrop");
        if (backdrop && await backdrop.isVisible()) {
          await backdrop.click();
          await page.waitForTimeout(200);
          const b = await page.evaluate((s) => {
            const r = document.querySelector(s).getBoundingClientRect();
            return { x: Math.round(r.left + 6), y: Math.round(r.top + r.height / 2) };
          }, HOST);
          await page.mouse.click(b.x, b.y);
          await page.waitForTimeout(120);
        }

        const g = await page.evaluate((s) => {
          const h = document.querySelector(s);
          const cs = getComputedStyle(h);
          const sb = getComputedStyle(h, "::-webkit-scrollbar");
          return {
            ov: cs.overflowY, sw: cs.scrollbarWidth, sbD: sb.display, sbW: sb.width,
            ti: h.getAttribute("tabindex"), sh: h.scrollHeight, ch: h.clientHeight,
            scrollW: h.scrollWidth, clientW: h.clientWidth,
            cls: String(h.className),
          };
        }, HOST);

        record(dest, tag, "the screen host is the scroll owner (overflow-y: auto)",
               g.ov === "auto", `overflow-y:${g.ov} · class:"${g.cls}"`);

        const trackShown = g.sbW === "auto" || parseFloat(g.sbW) > 0;
        record(dest, tag, "the scrollbar is suppressed in neither lane",
               g.sw !== "none" && g.sbD !== "none" && trackShown,
               `scrollbar-width:${g.sw} · ::-webkit-scrollbar display:${g.sbD} width:${g.sbW}`);

        record(dest, tag, "the owner is focusable, so scroll keys reach it",
               g.ti === "-1", `tabindex:${g.ti}`);

        record(dest, tag, "no horizontal overflow",
               g.scrollW <= g.clientW + 1, `scrollWidth ${g.scrollW} vs ${g.clientW}`);

        const extent = g.sh - g.ch;
        if (extent > 1) {
          await page.keyboard.press("End");
          const reached = await settle(page);
          record(dest, tag, "keyboard reaches the end of the destination",
                 reached >= extent - 2, `scrollTop ${reached} of ${extent}`);
        } else {
          // Not asserted: a destination that fits has no scroll to prove. Recorded
          // so a reader can see WHICH rows were exercised and which were short.
          record(dest, tag, "keyboard reaches the end of the destination",
                 true, `fits (${g.sh}px in ${g.ch}px) — nothing to scroll, not asserted`);
        }

        await page.screenshot({ path: path.join(OUT, `${dest}-${tag}.png`) });
        await page.close();
      }
    }
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n═══════════════════════════════════════════\n  ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log(`\n  FAILURES (${failed.length}):`);
    for (const f of failed) console.log(`   ✗ [${f.dest} ${f.viewport}] ${f.name} — ${f.detail}`);
  }
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
  console.log(`\n  frames + results.json → ${OUT}`);
}
run().catch((e) => { console.error("DRIVE ERROR:", e); process.exit(1); });
