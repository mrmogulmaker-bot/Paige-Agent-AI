#!/usr/bin/env node
/**
 * THE OTHER HALF OF THE OWNER'S SCROLL POLICY (2026-08-31).
 *
 * Settings is the intentionally scrollable marketplace/browse class. Clients,
 * Campaigns/Growth and Compass are FORM-FITTING and design-locked, and must not
 * become document-scrollable as a side effect of repairing Settings.
 *
 * That half has no natural failing assertion. A repair that loosens a shared rule
 * to make Settings work does not break the locked surfaces loudly — they just
 * quietly start scrolling, and nothing notices. An earlier revision of this branch
 * did exactly that: it excluded `[data-solo-screen-host]` from
 * `.paige-solo main{overflow:hidden!important}` outright, which un-clipped the host
 * on clients, growth and compass too. This drive exists so that cannot recur
 * silently.
 *
 * WHAT IT ASSERTS, per surface, per viewport, per theme:
 *   1. The screen host still computes `overflow-y: hidden` — form-fitting intact.
 *   2. The host does not overflow: `scrollHeight <= clientHeight + 1`. A host that
 *      has BOTH `hidden` and real overflow is clipped content, which is the defect
 *      this policy is meant to avoid, not evidence of good form-fitting.
 *   3. No horizontal overflow.
 *   4. Wheel over the surface does not scroll the host or the document.
 *   5. Every focusable control is inside the host's box or inside a legitimate
 *      inner scroll region — nothing is stranded past a clip.
 *
 * HONESTY (§13/§32.c): this drives a LOCAL mount of the real merged `SoloApp` with
 * a stubbed Supabase transport and tenant context, so the rows are synthetic and
 * several surfaces will render their empty or error states. That is the point —
 * the assertions are about CONTAINMENT, which is decided by the shell and the
 * route, not by the data. It is not the deployed app and proves nothing about
 * production data or auth.
 *
 * RUN IT AGAINST A SETTLED TREE. The harness is a Vite dev server; editing a
 * source file mid-run hot-reloads the page under the drive and silently measures
 * a different build than the one on disk.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.CAL_HARNESS_URL || "http://127.0.0.1:5203";
const EXE = process.env.PW_EXECUTABLE_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = path.resolve("scripts/live-drive/artifacts/solo-locked-surfaces");
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { w: 1536, h: 770 }, { w: 1366, h: 768 }, { w: 1024, h: 768 }, { w: 900, h: 1000 },
];
const THEMES = ["dark", "light"];
const SURFACES = ["clients", "growth", "compass"];

const results = [];
const record = (surface, viewport, name, ok, detail) => {
  results.push({ surface, viewport, name, ok, detail });
  console.log(`   ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`);
};

const HOST = "[data-solo-screen-host]";

async function run() {
  const browser = await chromium.launch({ executablePath: EXE });
  for (const surface of SURFACES) {
    for (const theme of THEMES) {
      for (const vp of VIEWPORTS) {
        const tag = `${vp.w}x${vp.h}-${theme}`;
        console.log(`\n── ${surface} · ${tag} ──────────────────`);
        const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
        await page.goto(`${BASE}/?route=${surface}&theme=${theme}`, { waitUntil: "networkidle" });
        await page.waitForSelector(HOST, { timeout: 15000 });
        await page.waitForTimeout(1200);

        // The shell makes PAIGE modal at <=1080px and covers the page by design.
        // Clear it first so containment is measured on the surface, not the overlay.
        const backdrop = await page.$(".tcs-paige-backdrop");
        if (backdrop && await backdrop.isVisible()) {
          await backdrop.click();
          await page.waitForTimeout(250);
        }

        const geom = await page.evaluate((sel) => {
          const h = document.querySelector(sel);
          const cs = getComputedStyle(h);
          return {
            ov: cs.overflowY, ovx: cs.overflowX,
            sh: h.scrollHeight, ch: h.clientHeight, sw: h.scrollWidth, cw: h.clientWidth,
            docSh: document.documentElement.scrollHeight,
            docCh: document.documentElement.clientHeight,
            cls: String(h.className),
          };
        }, HOST);

        record(surface, tag, "screen host is still form-fitting (overflow-y: hidden)",
               geom.ov === "hidden", `overflow-y:${geom.ov} · class:"${geom.cls}"`);

        record(surface, tag, "screen host does not overflow — nothing is clipped past it",
               geom.sh <= geom.ch + 1, `scrollHeight ${geom.sh} vs clientHeight ${geom.ch}`);

        record(surface, tag, "no horizontal overflow",
               geom.sw <= geom.cw + 1, `scrollWidth ${geom.sw} vs clientWidth ${geom.cw}`);

        record(surface, tag, "the document itself does not scroll",
               geom.docSh <= geom.docCh + 1, `doc ${geom.docSh} vs ${geom.docCh}`);

        // 5 — wheel must not move anything at the page level.
        await page.mouse.move(vp.w / 2, vp.h / 2);
        await page.mouse.wheel(0, 1200);
        await page.waitForTimeout(300);
        const moved = await page.evaluate((sel) => ({
          host: document.querySelector(sel).scrollTop,
          doc: document.documentElement.scrollTop || document.body.scrollTop,
        }), HOST);
        record(surface, tag, "wheel does not scroll the page",
               moved.host === 0 && moved.doc === 0, JSON.stringify(moved));

        // 6 — nothing stranded outside the host, unless it sits in a real inner
        //     scroller the surface deliberately owns.
        const stranded = await page.evaluate((sel) => {
          const host = document.querySelector(sel);
          const hb = host.getBoundingClientRect();
          const out = [];
          const focusables = host.querySelectorAll(
            'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
          );
          for (const el of focusables) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            const below = r.top > hb.bottom + 1, right = r.left > hb.right + 1;
            if (!below && !right) continue;
            let n = el.parentElement, inScroller = false;
            while (n && n !== host) {
              const cs = getComputedStyle(n);
              if (/(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX)) { inScroller = true; break; }
              n = n.parentElement;
            }
            if (!inScroller) out.push((el.textContent || el.tagName).trim().slice(0, 40));
          }
          return out;
        }, HOST);
        record(surface, tag, "no control stranded outside the form-fitting box",
               stranded.length === 0, stranded.length ? JSON.stringify(stranded.slice(0, 5)) : "none");

        await page.screenshot({ path: path.join(OUT, `${surface}-${tag}.png`) });
        await page.close();
      }
    }
  }
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log(`\n  FAILURES (${failed.length}):`);
    for (const f of failed) console.log(`   ✗ [${f.surface} ${f.viewport}] ${f.name} — ${f.detail}`);
  }
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
  console.log(`\n  frames + results.json → ${OUT}`);
}

run().catch((e) => { console.error("DRIVE ERROR:", e); process.exit(1); });
