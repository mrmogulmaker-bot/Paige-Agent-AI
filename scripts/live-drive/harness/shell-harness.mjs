#!/usr/bin/env node
// Render the operator shell chrome and check the five things the design is diffed against.
//
// WHAT THIS IS AND IS NOT. It renders OUR components with auth and data mocked, so it proves
// GEOMETRY: slot order, grid tracks, min-width:0, no document scrollbar, AA against --pg-env.
// It does NOT prove the authenticated console renders — §32.c stays owed to a session that can
// drive the deployed surface, and this harness must never be reported as having discharged it.
//
// MOCK THE PROVIDER, NEVER THE CONTRACT. Auth and data are mocked; the IA is read as shipped.
// A harness handed a fixtured slot list could only ever assert the geometry it was given — it
// could never catch a slot-count regression, which is one of the five things it exists to catch.
//
// The frame is labelled IN THE IMAGE, not in the filename. A filename is metadata and metadata
// is lost the moment a frame is pasted into a conversation — which is exactly how pack-shoot's
// mislabelled themes reached the owner. The label is injected AFTER every measurement, so it
// cannot influence what was measured.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  aaAgainstEnv, minWidthZero, noDocumentScrollbar, shellGrid, slotsInOrder,
} from "./assertions.mjs";

// Resolve from THIS MODULE, never from cwd. A cwd-relative path wrote a nested
// artifacts tree when the selftest ran from the fixtures directory, which escaped
// .gitignore and got five PNGs committed. The output location of a tool must not
// depend on where it happened to be invoked from.
const ART = path.resolve(import.meta.dirname, "../artifacts/harness");
const LABEL = "harness render · not live";

function chromePath() {
  if (process.env.PW_EXECUTABLE_PATH) return process.env.PW_EXECUTABLE_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  return fs.readdirSync(base).filter((d) => d.startsWith("chromium-"))
    .map((d) => path.join(base, d, "chrome-linux/chrome")).find((p) => fs.existsSync(p));
}

/** Burned into the frame, pinned, after measurement. Deliberately unmissable. */
async function burnLabel(page) {
  await page.evaluate((text) => {
    const el = document.createElement("div");
    el.textContent = text;
    el.setAttribute("data-harness-label", "");
    Object.assign(el.style, {
      position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "2147483647",
      background: "repeating-linear-gradient(45deg,#7a1020,#7a1020 12px,#5c0c18 12px,#5c0c18 24px)",
      color: "#fff", font: "700 12px/28px ui-monospace,monospace", letterSpacing: ".18em",
      textAlign: "center", textTransform: "uppercase", pointerEvents: "none",
    });
    document.body.appendChild(el);
  }, LABEL);
}

export async function runHarness({ url, slots, tracks = 3, theme = "dark", width = 1600, height = 1000, name }) {
  const exe = chromePath();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme === "dark" ? "dark" : "light" });
    // No network REACHING OUT. The shell must render from local modules and mocked data; a
    // request to a real host means something is not actually mocked.
    //
    // The origin allowance is what lets this frame a REAL render rather than only a fixture.
    // The first version allowed file:// alone, which silently aborted every request to the dev
    // server — so pointing the harness at a live localhost render produced a blank page, not an
    // error. Same origin as the page under test is permitted; everything else is still aborted,
    // so a stray fonts.googleapis.com or supabase call still fails loudly instead of quietly
    // making the frame depend on the network.
    const origin = (() => { try { return new URL(url).origin; } catch { return null; } })();
    await ctx.route("**://**", (r) => {
      const u = r.request().url();
      if (u.startsWith("file://")) return r.continue();
      if (origin && u.startsWith(origin)) return r.continue();
      return r.abort();
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(250);

    // MEASURE FIRST — before the label exists.
    const checks = {
      slots: await slotsInOrder(page, slots),
      grid: await shellGrid(page, tracks),
      minWidth: await minWidthZero(page),
      scrollbar: await noDocumentScrollbar(page),
      contrast: await aaAgainstEnv(page),
    };

    await burnLabel(page);
    // The label is the whole basis for calling a frame honest, so prove it is ON SCREEN rather
    // than merely appended. An element can exist in the DOM and paint nowhere — clipped by an
    // ancestor, zero-height, off-viewport — and a frame that silently loses its label is worse
    // than an unlabelled one, because it looks authoritative.
    const label = await page.evaluate(() => {
      const el = document.querySelector("[data-harness-label]");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        w: Math.round(r.width), h: Math.round(r.height),
        onScreen: r.bottom <= window.innerHeight + 1 && r.top >= 0 && r.width > 0 && r.height > 0,
        visible: cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.9,
      };
    });
    if (!label || !label.onScreen || !label.visible || label.w < width * 0.9) {
      throw new Error(`refusing to write an unlabelled frame — label check: ${JSON.stringify(label)}`);
    }

    fs.mkdirSync(ART, { recursive: true });
    const file = path.join(ART, `${name || "shell"}-${theme}.png`);
    await page.screenshot({ path: file });

    const failed = Object.entries(checks).filter(([, v]) => !v.ok).map(([k]) => k);
    return { file, checks, ok: failed.length === 0, failed };
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => {
    const i = process.argv.indexOf(`--${n}`);
    return i > -1 ? process.argv[i + 1] : d;
  };
  const slots = (arg("slots", "fleet,relationships,campaigns,marketplace,analytics,settings")).split(",");
  const r = await runHarness({
    url: arg("url"), slots, tracks: Number(arg("tracks", "3")),
    theme: arg("theme", "dark"), name: arg("name", "shell"),
    width: Number(arg("width", "1600")), height: Number(arg("height", "1000")),
  });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
