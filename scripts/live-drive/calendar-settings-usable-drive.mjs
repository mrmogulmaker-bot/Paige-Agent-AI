#!/usr/bin/env node
/**
 * SETTINGS › CONNECTIONS › CALENDARS — CAN A HUMAN SCROLL IT AND REACH THE END?
 *
 * WHY THIS EXISTS
 *
 * Earlier packets offered fold rendering, geometry snapshots and a green suite as
 * evidence this surface was usable. The owner disproved that class of claim on
 * a live tenant, in production: the deployed Calendar page could not be scrolled
 * down to its content. None of those artifacts measures whether a human reaches
 * the last control, so none of them was proof.
 *
 * OWNER PLATFORM POLICY (2026-08-31), which decides what "fixed" means here:
 *   · SETTINGS surfaces — Connections, Calendars, Integrations — are the
 *     AUTHORIZED vertical-scroll class. They are marketplace-style pages a human
 *     browses, and every option must be reachable.
 *   · Command Center, Clients, Campaigns and Analytics, including all subtabs,
 *     are form-fitting and design-locked. Scroll is NOT introduced there.
 * So the repair is never "stop Calendars scrolling". It is "scrolling must
 * genuinely reach everything, and the human must be able to see and drive it".
 *
 * WHAT IT DRIVES, against the real route inside the real shell chain:
 *   1. The final actionable control is reachable by wheel, trackpad (fine
 *      deltas), touch drag, keyboard Space / PageDown / End from the REAL
 *      arrival state, and sequential Tab. Dragging the scrollbar is attempted
 *      and REPORTED, not scored: this browser paints overlay scrollbars, so a
 *      headless drag cannot reliably grab one, and a miss would say nothing
 *      about the surface.
 *   2. `.tcs-main` is the one deliberate vertical scroll owner; nothing nested
 *      in the surface has become a second one.
 *   3. The scrollbar is NOT SUPPRESSED — an authorized scroll surface that hides
 *      its scrollbar gives a human no signal the page continues and nothing to
 *      grab. Both suppressors are checked, since undoing one leaves the other.
 *   4. No fixed-height, `overflow:hidden`, clipped panel or focus trap hides
 *      content; no horizontal overflow.
 *   5. Areas OPEN, because that is when a human is acting and when the last
 *      control sits furthest down.
 *
 * HONESTY (§13/§32.c): this drives a LOCAL mount of the shipped surface inside a
 * faithful reproduction of the shipped containment chain, with synthetic rows. It
 * proves REACHABILITY, SCROLL OWNERSHIP and GEOMETRY. It is not the deployed app
 * and proves nothing about production data or auth. The owner's acceptance on the
 * deployed route remains owed and is never claimed here.
 *
 * RUN IT AGAINST A SETTLED TREE. The harness is a Vite dev server; editing a
 * source file mid-run hot-reloads the page under the drive, which either
 * destroys the execution context or — worse — silently measures a different
 * build than the one on disk. Both happened while this was being written, and
 * the second produced failures that looked like product defects and were not.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.CAL_HARNESS_URL || "http://127.0.0.1:5203";
const EXE = process.env.PW_EXECUTABLE_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = path.resolve("scripts/live-drive/artifacts/calendar-settings");
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { w: 1536, h: 770 }, { w: 1366, h: 768 }, { w: 1024, h: 768 }, { w: 900, h: 1000 },
];
const THEMES = ["dark", "light"];

const results = [];
const observations = [];
const observe = (viewport, name, detail) => {
  observations.push({ viewport, name, detail });
  console.log(`   • ${name} — ${detail}`);
};
const record = (viewport, name, ok, detail) => {
  results.push({ viewport, name, ok, detail });
  console.log(`   ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`);
};

/**
 * THE SCROLL OWNER IS RESOLVED, NEVER ASSUMED.
 *
 * `SoloSettings` resolves it as `closest("[data-solo-screen-host]")` and only
 * falls back to `#tenant-shell-main` when the shell provides no screen host
 * (bare mounts, tests). Post-#681 the screen host is `overflow: auto` and IS the
 * owner, so a drive hardcoded to `#tenant-shell-main` measures an element that
 * does not scroll in the app. This selector is the app's own rule, in the same
 * order, so the drive can never drift from it.
 */
const scrollTopOf = (page) =>
  page.evaluate((sel) => {
    const o = document.querySelector("[data-solo-screen-host]") ?? document.querySelector("#tenant-shell-main");
    return o ? o.scrollTop : -1;
  });
const reset = (page) =>
  page.evaluate(() => {
    const o = document.querySelector("[data-solo-screen-host]") ?? document.querySelector("#tenant-shell-main");
    if (o) o.scrollTop = 0;
  });

// Wait until the owner's scrollTop stops moving. Chromium animates keyboard and
// wheel scrolling, so a fixed short timeout reads a position the browser is
// still on its way out of.
const settle = async (page, quietFrames = 3, cap = 40) => {
  let last = -1, still = 0;
  for (let i = 0; i < cap; i++) {
    const now = await scrollTopOf(page);
    still = now === last ? still + 1 : 0;
    if (still >= quietFrames) return now;
    last = now;
    await page.waitForTimeout(40);
  }
  return last;
};

/** Open every configuration area — the state a human acts in. */
async function openEveryArea(page) {
  await page.evaluate(() => {
    document.querySelectorAll(".cc-area").forEach((a) => {
      if (a.getAttribute("data-open") !== "true") {
        a.querySelector("button, summary, [role='button']")?.dispatchEvent(
          new MouseEvent("click", { bubbles: true }),
        );
      }
    });
    document.querySelectorAll("details").forEach((d) => { d.open = true; });
  });
  await page.waitForTimeout(500);
}

/** The last actionable control a human is meant to reach. */
const markFinal = (page) =>
  page.evaluate(() => {
    const owner = document.querySelector("[data-solo-screen-host]") ?? document.querySelector("#tenant-shell-main");
    document.querySelectorAll("[data-drive-final]").forEach((e) => e.removeAttribute("data-drive-final"));
    const controls = Array.from(
      document.querySelectorAll(".solo-settings button, .solo-settings a[href], .solo-settings input, .solo-settings select, .solo-settings textarea"),
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.hasAttribute("disabled");
    });
    if (!controls.length) return null;
    let last = controls[0], lastY = -Infinity;
    for (const el of controls) {
      const y = el.getBoundingClientRect().top + owner.scrollTop;
      if (y > lastY) { lastY = y; last = el; }
    }
    last.setAttribute("data-drive-final", "1");
    return { label: (last.textContent || last.getAttribute("aria-label") || last.tagName).trim().slice(0, 50),
             docY: Math.round(lastY), total: controls.length };
  });

const finalVisible = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-drive-final="1"]');
    const owner = document.querySelector("[data-solo-screen-host]") ?? document.querySelector("#tenant-shell-main");
    if (!el || !owner) return { visible: false, reason: "missing" };
    const r = el.getBoundingClientRect(), o = owner.getBoundingClientRect();
    const withinY = r.top >= o.top - 1 && r.bottom <= o.bottom + 1;
    const withinX = r.left >= o.left - 1 && r.right <= o.right + 1;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { visible: withinY && withinX, withinY, withinX,
             hittable: !!hit && (hit === el || el.contains(hit) || hit.contains(el)),
             top: Math.round(r.top), bottom: Math.round(r.bottom), ownerBottom: Math.round(o.bottom) };
  });

async function run() {
  const browser = await chromium.launch({ executablePath: EXE });
  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) {
      const tag = `${vp.w}x${vp.h}-${theme}`;
      console.log(`\n── ${tag} ────────────────────────────────`);
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, hasTouch: true });
      await page.goto(`${BASE}/?theme=${theme}&data=dense`, { waitUntil: "networkidle" });
      await page.waitForSelector(".cc", { timeout: 15000 });
      await page.waitForTimeout(700);

      // At <=1080px the shell makes the PAIGE panel modal and covers the content
      // behind it with `.tcs-paige-backdrop` (`aria-label="Fold PAIGE conversation"`).
      // That is deliberate shell behaviour, not a Calendars defect -- while it is
      // up the page is MEANT to be inert, and a human clicks it to get back. So the
      // drive does what the human does and records that it did, rather than
      // measuring a page the shell is deliberately blocking and calling the surface
      // unreachable.
      const backdrop = await page.$(".tcs-paige-backdrop");
      let backdropWasUp = false;
      if (backdrop && await backdrop.isVisible()) {
        backdropWasUp = true;
        await backdrop.click();
        await page.waitForTimeout(250);
        // Dismissing it leaves focus on the removed button, so it falls to <body>,
        // which cannot scroll. A human's very next act is to click the page they
        // came for — and that click lands focus on the scroll owner, because the
        // repair made it focusable. Doing that here is the human's path, not a
        // shortcut around the measurement: the keyboard rows below still have to
        // reach the last control on their own.
        const b = await page.evaluate(() => {
          const o = document.querySelector("[data-solo-screen-host]") ?? document.querySelector("#tenant-shell-main");
          const r = o.getBoundingClientRect();
          return { x: Math.round(r.left + 6), y: Math.round(r.top + r.height / 2) };
        });
        await page.mouse.click(b.x, b.y);
        await page.waitForTimeout(120);
        observe(tag, "shell PAIGE backdrop was covering the page",
                "the shell makes PAIGE modal at <=1080px and blocks the content behind it by " +
                "design; the drive dismissed it and clicked back into the page, as a human " +
                "would. NOTE the shell consequence: dismissing it drops focus to <body>, which " +
                "cannot scroll, so keyboard scrolling is dead until that click — same root as " +
                "the nav-rail row below, and shared chrome rather than this surface");
      }

      await page.screenshot({ path: path.join(OUT, `${tag}-01-initial.png`) });
      await openEveryArea(page);

      const geom = await page.evaluate(() => {
        const o = document.querySelector("[data-solo-screen-host]") ?? document.querySelector("#tenant-shell-main");
        // The scrollbar is measured through the two properties that actually
        // SUPPRESS it, not through the gutter. `probe` is an unstyled
        // `overflow-y: scroll` div created in this same page: if IT reports a
        // gutter of 0, then this browser paints overlay scrollbars and a gutter
        // of 0 on the owner is evidence of nothing. Measured here and on macOS
        // Chrome that is exactly the case, so asserting `gutter > 0` would fail
        // a correct surface. What a human loses when the scrollbar is hidden is
        // `scrollbar-width: none` plus a collapsed `::-webkit-scrollbar`, and
        // those are both directly readable.
        const probe = document.createElement("div");
        probe.style.cssText =
          "position:fixed;top:0;left:0;width:200px;height:100px;overflow-y:scroll;visibility:hidden";
        probe.innerHTML = "<div style='height:900px'></div>";
        document.body.appendChild(probe);
        const probeGutter = probe.offsetWidth - probe.clientWidth;
        probe.remove();
        const sb = getComputedStyle(o, "::-webkit-scrollbar");
        return { scrollH: o.scrollHeight, clientH: o.clientHeight, scrollW: o.scrollWidth,
                 clientW: o.clientWidth, gutter: o.offsetWidth - o.clientWidth, probeGutter,
                 sbWidth: getComputedStyle(o).scrollbarWidth, cls: o.className,
                 sbDisplay: sb.display, sbTrackWRaw: sb.width };
      });
      console.log(`   ${geom.scrollH}px content in ${geom.clientH}px viewport → ${geom.scrollH - geom.clientH}px below the fold`);

      const final = await markFinal(page);
      if (!final) { record(tag, "a final actionable control exists", false, "none found"); await page.close(); continue; }
      console.log(`   final control: "${final.label}" at y=${final.docY} (of ${final.total})`);

      // 1 — ONE scroll owner
      const nested = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll(".solo-settings *").forEach((el) => {
          const cs = getComputedStyle(el);
          if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) {
            out.push({ cls: String(el.className).slice(0, 50), h: el.clientHeight, sh: el.scrollHeight });
          }
        });
        return out;
      });
      record(tag, "one deliberate vertical scroll owner", nested.length === 0,
             nested.length ? JSON.stringify(nested) : "only .tcs-main scrolls");

      // 2 — the scrollbar is NOT suppressed on this authorized scroll surface.
      //
      // Both suppressors must be absent, because `settings.css` sets both:
      // `scrollbar-width: none` (the standard property, which is what Firefox
      // and modern Chrome honour) and `::-webkit-scrollbar { width:0; display:none }`
      // (the legacy pseudo-element, still honoured by Chrome and Safari).
      // Undoing only one leaves the bar hidden in the other lane.
      // `auto` is the value a scroller with NO author `::-webkit-scrollbar` rule
      // reports, and it means the platform draws its own bar -- so it is SHOWN.
      // Treating it as a number (`parseFloat("auto") || 0`) failed a perfectly
      // normal native scrollbar; this passed here only because the shell happens
      // to set an explicit width. The row has to mean "not suppressed", not "an
      // author rule sets a nonzero width".
      const trackW = geom.sbTrackWRaw;
      const trackShown = trackW === "auto" || parseFloat(trackW) > 0;
      const sbShown = geom.sbWidth !== "none" && geom.sbDisplay !== "none" && trackShown;
      record(tag, "the scrollbar is not suppressed on this authorized scroll surface",
             sbShown,
             `scrollbar-width:${geom.sbWidth} · ::-webkit-scrollbar display:${geom.sbDisplay} ` +
             `width:${trackW} · ${geom.cls} · [gutter ${geom.gutter}px, but an unstyled ` +
             `control scroller in this same browser reports ${geom.probeGutter}px, so gutter is ` +
             `${geom.probeGutter > 0 ? "meaningful here" : "NOT evidence here — overlay scrollbars"}]`);

      // 3 — no horizontal overflow
      record(tag, "no horizontal overflow", geom.scrollW <= geom.clientW + 1,
             `scrollWidth ${geom.scrollW} vs clientWidth ${geom.clientW}`);

      // 4 — no clipping ancestor over the final control
      const clip = await page.evaluate(() => {
        const out = []; let el = document.querySelector('[data-drive-final="1"]');
        while (el && el !== document.documentElement) {
          const cs = getComputedStyle(el);
          if ((cs.overflowY === "hidden" || cs.overflowY === "clip") && el.scrollHeight > el.clientHeight + 2) {
            out.push({ cls: String(el.className).slice(0, 50), h: el.clientHeight, sh: el.scrollHeight });
          }
          el = el.parentElement;
        }
        return out;
      });
      record(tag, "no clipping ancestor hides the final control", clip.length === 0,
             clip.length ? JSON.stringify(clip) : "none");

      // 5 — WHEEL
      await reset(page);
      for (let i = 0; i < 40; i++) {
        await page.mouse.move(vp.w / 2, vp.h / 2);
        await page.mouse.wheel(0, 240);
        await page.waitForTimeout(20);
        if ((await finalVisible(page)).visible) break;
      }
      record(tag, "wheel reaches the final control", (await finalVisible(page)).visible, JSON.stringify(await finalVisible(page)));

      // 6 — TRACKPAD, fine deltas
      await reset(page);
      for (let i = 0; i < 240; i++) {
        await page.mouse.move(vp.w / 2, vp.h / 2);
        await page.mouse.wheel(0, 40);
        if (i % 12 === 0 && (await finalVisible(page)).visible) break;
      }
      record(tag, "trackpad (fine deltas) reaches the final control", (await finalVisible(page)).visible, JSON.stringify(await finalVisible(page)));

      // 7 — KEYBOARD, from the REAL arrival state.
      //
      // An earlier revision blurred to <body> before each press "to simulate
      // arrival". That was not simulation, it was sabotage: the repair puts
      // focus on the scroll owner at mount, and the drive was undoing it and
      // then reporting the result as a failure. What a human actually does is
      // load the page and press a key — whatever the app focused stays focused.
      // The neutral-background-click case is measured separately below.
      //
      // Chromium ANIMATES keyboard scrolling. An earlier revision pressed a key,
      // waited 30ms and read the position — which lands mid-animation and
      // reported End as reaching 75px of a 1450px extent. That was the harness
      // measuring a moving target, the same class of manufactured defect as the
      // Tab budget below. Every press now settles first.
      for (const key of ["Space", "PageDown", "End"]) {
        await reset(page);
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press(key);
          await settle(page);
          if ((await finalVisible(page)).visible) break;
          if (key === "End") break;   // End is one press to the extent, by definition
        }
        const v = await finalVisible(page);
        record(tag, `keyboard ${key} reaches the final control from arrival`, v.visible,
               `${JSON.stringify(v)} scrollTop=${await scrollTopOf(page)}`);
      }

      // 7b — after a click on neutral background INSIDE the Calendar surface.
      //      A human who clicks empty space on the page and then presses a key
      //      must still be able to scroll; if this fails the page is only usable
      //      until you click the wrong pixel.
      //
      //      The click has to land inside the scroll owner to be a click on THIS
      //      page. An earlier revision used x=4, which is the shared Solo nav
      //      rail, not the Calendar canvas — see the observation below.
      const ownerBox = await page.evaluate(() => {
        const r = (document.querySelector("[data-solo-screen-host]") ?? document.querySelector("#tenant-shell-main")).getBoundingClientRect();
        return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width) };
      });
      await reset(page);
      await page.mouse.click(ownerBox.l + 6, Math.round(vp.h / 2));
      await page.keyboard.press("PageDown");
      await settle(page);
      const afterNeutral = await scrollTopOf(page);
      record(tag, "keyboard still scrolls after a neutral background click on the page",
             afterNeutral > 0, `scrollTop=${afterNeutral}`);

      // 7c — OBSERVATION, deliberately not a pass/fail row for this surface.
      //
      //      Clicking the shared Solo nav rail moves focus to <body>, and <body>
      //      cannot scroll because [data-tenant-shell] is overflow:hidden — so
      //      keyboard scrolling stops until the human clicks back into the page.
      //      That is SHELL behaviour, identical on every Solo destination, and
      //      this lane is scoped to the minimum Calendar-specific repair. It is
      //      measured and reported rather than silently dropped, and it is not
      //      counted against Calendar because Calendar cannot fix it without
      //      changing shared chrome.
      await reset(page);
      await page.mouse.click(4, Math.round(vp.h / 2));
      await page.keyboard.press("PageDown");
      await settle(page);
      const afterRail = await scrollTopOf(page);
      observe(tag, "shell rail click then keyboard (shared chrome, out of this lane's scope)",
              `scrollTop=${afterRail} after clicking the Solo nav rail — ` +
              `${afterRail > 0 ? "still scrolls" : "focus lands on <body>, which cannot scroll"}`);

      // 7d — TOUCH DRAG. A real finger swipe, dispatched through CDP because
      //      Playwright has no swipe primitive. This is the input a human on a
      //      laptop trackpad-as-touchscreen or a tablet actually uses, and it is
      //      handled by a different code path in Blink than the wheel.
      await reset(page);
      const cdp = await page.context().newCDPSession(page);
      const touchX = Math.round(vp.w / 2);
      for (let swipe = 0; swipe < 60; swipe++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart", touchPoints: [{ x: touchX, y: Math.round(vp.h * 0.8) }],
        });
        for (let step = 1; step <= 6; step++) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: touchX, y: Math.round(vp.h * 0.8 - step * (vp.h * 0.1)) }],
          });
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        if ((await finalVisible(page)).visible) break;
      }
      await settle(page);
      record(tag, "touch drag reaches the final control", (await finalVisible(page)).visible,
             JSON.stringify(await finalVisible(page)));

      // 7e — DRAGGING THE SCROLLBAR ITSELF, which is the affordance the owner
      //      lost. Grab near the right edge of the owner and pull down.
      //
      //      Reported honestly rather than scored: this browser paints OVERLAY
      //      scrollbars (proven by the control probe in `geom`), so there is no
      //      persistent gutter to grab and a headless drag can miss the bar
      //      entirely. A miss here is evidence about the ENVIRONMENT, not about
      //      the surface — scoring it either way would be a fabricated verdict.
      await reset(page);
      const edge = await page.evaluate(() => {
        const r = (document.querySelector("[data-solo-screen-host]") ?? document.querySelector("#tenant-shell-main")).getBoundingClientRect();
        return { x: Math.round(r.right - 4), top: Math.round(r.top + 12), bottom: Math.round(r.bottom - 12) };
      });
      await page.mouse.move(edge.x, edge.top + 4);
      await page.waitForTimeout(120);           // overlay bars fade in on hover
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(edge.x, edge.top + ((edge.bottom - edge.top) * i) / 10);
        await page.waitForTimeout(20);
      }
      await page.mouse.up();
      await settle(page);
      const afterDrag = await scrollTopOf(page);
      // Dragging the thumb from the top of the track to the bottom travels the
      // WHOLE extent. Anything materially short of that was not the thumb --
      // most likely a press on content and a selection autoscroll -- so it is
      // reported as inconclusive rather than dressed up as a grab. An 18px
      // result against a 5,134px extent is the case that forced this wording.
      const extent = geom.scrollH - geom.clientH;
      const grabbed = afterDrag > extent * 0.6;
      const verdict = grabbed
        ? "the thumb was grabbed and travelled the track"
        : afterDrag > 0
          ? "INCONCLUSIVE — the page moved, but far less than a full-track drag would " +
            "move it, so this was probably not the thumb"
          : "no grab";
      observe(tag, "dragging the scrollbar",
              `scrollTop=${afterDrag} of a ${extent}px extent · ${verdict} · this browser ` +
              `paints overlay scrollbars (an unstyled control scroller reports a ` +
              `${geom.probeGutter}px gutter), so there is no persistent bar for a headless ` +
              `drag to aim at; either way this measures the ENVIRONMENT, not the surface, ` +
              `and is not scored`);

      // 8 — TAB focus travel
      await reset(page);
      await page.evaluate(() => { document.activeElement?.blur?.(); document.body.focus(); });
      // 600, not 200. The surface has ~167 focusable controls and the final one
      // is reached at press ~214; a 200-press budget failed it by 14 and would
      // have been reported as a focus trap the product does not have. A test
      // budget that is too small manufactures a defect exactly as effectively as
      // a missing assertion hides one.
      let tabbed = false;
      for (let i = 0; i < 600; i++) {
        await page.keyboard.press("Tab");
        if (await page.evaluate(() => document.activeElement?.getAttribute("data-drive-final") === "1")) { tabbed = true; break; }
      }
      const tv = await finalVisible(page);
      record(tag, "Tab focus travel reaches and reveals the final control", tabbed && tv.visible,
             `focusReached=${tabbed} ${JSON.stringify(tv)}`);

      // 9 — hit-testable, and the frame is genuinely scrolled
      await page.evaluate(() => document.querySelector('[data-drive-final="1"]')?.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(200);
      const hv = await finalVisible(page);
      record(tag, "final control is hit-testable at its centre", !!hv.hittable, JSON.stringify(hv));
      const st = await scrollTopOf(page);
      record(tag, "final frame is genuinely scrolled (scrollTop > 0)", st > 0, `scrollTop=${st}`);
      await page.screenshot({ path: path.join(OUT, `${tag}-02-final-scrolled.png`) });
      await page.close();
    }
  }
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    const byName = {};
    for (const f of failed) (byName[f.name] ||= []).push(f.viewport);
    console.log(`\n  FAILURES (${failed.length}):`);
    for (const [n, v] of Object.entries(byName)) console.log(`   ✗ ${n}\n       ${v.join(", ")}`);
  }
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ results, observations }, null, 1));
  console.log(`\n  frames + results.json → ${OUT}`);
  process.exit(failed.length ? 1 : 0);
}
run().catch((e) => { console.error("DRIVE ERROR:", e); process.exit(2); });
