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
 *      THIS IS THE LOAD-BEARING ASSERTION. It is what proves the Settings
 *      exception did not reach a locked surface, and it is the one that would
 *      fail the moment a repair loosened the shared rule.
 *   2. No horizontal overflow, the document does not scroll, and the wheel does
 *      not move the page. HONEST NOTE: given `overflow:hidden` on a `height:100%`
 *      chain these follow from check 1 and cannot independently fail. They are
 *      kept as cheap corroboration, and are NOT counted as breadth of proof.
 *   3. REACHABILITY, walked properly. Earlier revisions compared each control's
 *      rect against the HOST box and asked whether the host overflowed — both are
 *      blind, because the host's only child is `height:100%; overflow:hidden`,
 *      which clamps the host's `scrollHeight` and keeps every descendant rect
 *      inside the host box while the content is clipped one level down. Proven by
 *      injecting 3,000px plus a button into `.trc-workspace`: host `scrollHeight`
 *      stayed 704 and the button's rect stayed inside the host, with the content
 *      genuinely unreachable. So each control is now compared against its OWN
 *      nearest clipping ancestor.
 *
 * HONESTY (§13/§32.c), and this bounds what the pass rate means. The mount is
 * local and the Supabase transport is stubbed, so these surfaces render their
 * EMPTY or error states. Containment (check 1) is decided by the shell and the
 * route, not by the data, so it is proven. REACHABILITY (check 3) is NOT: an empty
 * surface has almost nothing to strand, so a green reachability row here does not
 * establish that a POPULATED clients, growth or compass surface keeps every
 * control reachable while form-fitting. That remains UNVERIFIED and is owed to a
 * session with real data. Do not quote the pass rate as if it covered it.
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

        // 6 — REACHABILITY against each control's own nearest clipping ancestor.
        //     Not against the host: the host cannot overflow, so comparing to it
        //     reports "nothing stranded" while content is clipped inside a child.
        const unreachable = await page.evaluate((sel) => {
          const host = document.querySelector(sel);
          const out = [];
          const focusables = host.querySelectorAll(
            'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
          );
          for (const el of focusables) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;      // deliberately hidden
            let n = el.parentElement;
            while (n && n !== document.documentElement) {
              const cs = getComputedStyle(n);
              const clipsY = cs.overflowY === "hidden" || cs.overflowY === "clip";
              const clipsX = cs.overflowX === "hidden" || cs.overflowX === "clip";
              const scrollsY = cs.overflowY === "auto" || cs.overflowY === "scroll";
              const scrollsX = cs.overflowX === "auto" || cs.overflowX === "scroll";
              if (scrollsY || scrollsX) break;                  // reachable by scrolling it
              if (clipsY || clipsX) {
                const b = n.getBoundingClientRect();
                const past = (clipsY && (r.top >= b.bottom - 1 || r.bottom <= b.top + 1))
                          || (clipsX && (r.left >= b.right - 1 || r.right <= b.left + 1));
                if (past) {
                  out.push({
                    control: (el.textContent || el.tagName).trim().slice(0, 40),
                    clippedBy: String(n.className).slice(0, 40) || n.tagName,
                  });
                }
                break;
              }
              n = n.parentElement;
            }
          }
          return out;
        }, HOST);
        record(surface, tag, "no control is clipped out of reach by an ancestor",
               unreachable.length === 0,
               unreachable.length ? JSON.stringify(unreachable.slice(0, 5)) : "none");

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
