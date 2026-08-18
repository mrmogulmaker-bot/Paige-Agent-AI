// scripts/live-drive/operator-console-drive.mjs
//
// §32.c UNAUTHENTICATED DRIVE for the platform-operator console (`/operator/*`, PR #543).
//
// WHY THIS EXISTS. §32 is blunt: a green `tsc`/`vite build` proves the code TYPE-CHECKS and proves
// NOTHING about whether it runs. The operator console is a routing surface, and its two most
// likely failure modes are both INVISIBLE to the build and to vitest:
//   • bare `/operator` renders blank (nothing in the product links to it — a blank root ships
//     undetected until someone types the URL), and
//   • a signed-out deep link hangs on the guard's skeleton or bounces in a redirect loop.
// Both look identical to "still loading." This drives the REAL bundle in a REAL browser and
// asserts the actual settled URL, which is the only thing that can tell them apart.
//
// WHAT IT COVERS — and, honestly (§13), what it does NOT. Everything here is the UNAUTHENTICATED
// half: the door, the guard's signed-out redirect, the `?next=` round-trip, loop-freedom, and the
// console PALETTE measured in BOTH themes (that the tokens resolve at all, that the `.dark`
// override actually reaches them rather than being shadowed, that the flip is felt, and that rail
// ink stays AA on the rail). It does NOT cover the authenticated rail RENDER, the 78 placeholders
// behind the guard, or any §25 taste judgement — those need operator credentials and a human look,
// and remain OWED to a capable session. Measuring a token is not the same as seeing a layout.
//
// Run against a local build (no credentials, no network needed):
//   npx vite build && npx vite preview --port 4319 --strictPort --host 127.0.0.1 &
//   node scripts/live-drive/operator-console-drive.mjs http://127.0.0.1:4319
//
// Or against any deployed origin that is not behind an SSO wall:
//   node scripts/live-drive/operator-console-drive.mjs https://<host>
//
// Exits non-zero on any failed assertion, so it can gate a slice.
import { resolvePlaywright, buildLaunchOptions } from "./live-drive.mjs";

const BASE = (process.argv[2] || process.env.OPERATOR_DRIVE_URL || "").replace(/\/$/, "");
if (!BASE) {
  console.error("usage: node scripts/live-drive/operator-console-drive.mjs <base-url>");
  process.exit(2);
}

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
};

/**
 * Console noise from the app's own backend calls is EXPECTED here and is not a failure: this drive
 * deliberately runs with no session and often with Supabase unreachable (sandbox CA, offline box).
 * We surface those lines for context but never assert on them — asserting would make the drive fail
 * for a reason that has nothing to do with the routing it exists to prove. A real render crash
 * shows up as a `pageerror`, which we DO report prominently.
 */
const isBackendNoise = (t) =>
  /ERR_CERT_AUTHORITY_INVALID|ERR_CONNECTION|Failed to load resource|WebSocket connection to|supabase\.co/i.test(t);

const { chromium } = await resolvePlaywright();
// buildLaunchOptions(), not a hand-rolled launch: it resolves the Chromium binary AND wires the
// agent proxy when HTTPS_PROXY is set. Hand-rolling it worked fine against localhost and then
// failed with ERR_CONNECTION_RESET the first time this drove a real deployed origin — the exact
// §18 "don't fork the helper" tax, paid in a confusing error rather than a missing feature.
const browser = await chromium.launch(buildLaunchOptions());
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

async function visit(path, { waitMs = 5000 } = {}) {
  const page = await ctx.newPage();
  const crashes = [];
  const noise = [];
  page.on("pageerror", (e) => crashes.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text().slice(0, 200);
    (isBackendNoise(t) ? noise : crashes).push(t);
  });
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(waitMs);
  const u = new URL(page.url());
  const text = (await page.locator("body").innerText().catch(() => "")).trim();
  return { page, crashes, noise, settled: u.pathname + u.search, text };
}

const crashNote = (r) =>
  r.crashes.length ? `CRASHES=${r.crashes.join(" | ")}` : `noBackendNoise=${r.noise.length}`;

// 1 ── The door. Bare /operator must render the login form, not a blank page.
{
  const r = await visit("/operator");
  const hasForm = (await r.page.locator('input[type="password"]').count()) > 0;
  record(
    "bare /operator renders the login door",
    hasForm && r.settled === "/operator" && r.crashes.length === 0,
    `settled=${r.settled} passwordField=${hasForm} bodyChars=${r.text.length} ${crashNote(r)}`,
  );
  await r.page.close();
}

// 2 ── The explicit door.
{
  const r = await visit("/operator/login");
  const hasForm = (await r.page.locator('input[type="password"]').count()) > 0;
  record(
    "/operator/login renders the login door",
    hasForm && r.crashes.length === 0,
    `settled=${r.settled} passwordField=${hasForm} ${crashNote(r)}`,
  );
  await r.page.close();
}

// 3 ── The one that matters: a signed-out deep link reaches the door CARRYING ?next=.
//      Proves the guard decides (rather than hanging on `loading`) and that the round-trip
//      RequireOperator sets up is real, not merely unit-tested in isolation.
{
  const r = await visit("/operator/fleet", { waitMs: 6000 });
  const ok =
    r.settled.startsWith("/operator/login") &&
    r.settled.includes("next=%2Foperator%2Ffleet") &&
    r.crashes.length === 0;
  record("signed-out /operator/fleet → the door, carrying ?next=", ok, `settled=${r.settled} ${crashNote(r)}`);
  await r.page.close();
}

// 4 ── The 3-level settings address, same expectation (this is the level the registry adds).
{
  const r = await visit("/operator/settings/team/roles", { waitMs: 6000 });
  const ok =
    r.settled.startsWith("/operator/login") &&
    r.settled.includes("next=%2Foperator%2Fsettings%2Fteam%2Froles") &&
    r.crashes.length === 0;
  record("signed-out /operator/settings/team/roles → the door with ?next=", ok, `settled=${r.settled} ${crashNote(r)}`);
  await r.page.close();
}

// 5 ── No redirect LOOP. guard→door→(next)→guard is exactly the shape that can ping-pong, and a
//      loop is indistinguishable from a slow page unless you count navigations.
{
  const page = await ctx.newPage();
  let navs = 0;
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navs++;
  });
  await page.goto(BASE + "/operator/fleet", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(8000);
  record(
    "no redirect loop on a signed-out deep link",
    navs <= 4,
    `mainFrame navigations in 8s = ${navs} (a loop climbs without bound); settled at ${new URL(page.url()).pathname}`,
  );
  await page.close();
}

// 6 ── The --rail token pair resolves. A token defined in a scope the console never renders under
//      yields a TRANSPARENT rail — shipped, correct-looking in source, and invisible (§29).
{
  const page = await ctx.newPage();
  await page.goto(BASE + "/operator", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  const tok = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const probe = document.createElement("div");
    probe.style.backgroundColor = "hsl(var(--rail))";
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      rail: cs.getPropertyValue("--rail").trim(),
      railFg: cs.getPropertyValue("--rail-foreground").trim(),
      resolved,
    };
  });
  const ok = Boolean(tok.rail) && Boolean(tok.railFg) && /^rgba?\(/.test(tok.resolved);
  record(
    "--rail / --rail-foreground resolve to real colours",
    ok,
    `--rail="${tok.rail}" --rail-foreground="${tok.railFg}" computed=${tok.resolved}`,
  );
  await page.close();
}

// 7 ── BOTH THEMES. The `.operator-console` block carries CD's palette and a `.dark` override;
//      a selector that gets shadowed, or a dark block that never applies, is invisible in
//      source review and produces either a light-looking "dark" mode or a vanished rail.
//      §23 also requires the flip to be UNMISTAKABLE, so the page ground is measured in both.
{
  const page = await ctx.newPage();
  await page.goto(BASE + "/operator", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  const themes = await page.evaluate(() => {
    const read = (dark) => {
      document.documentElement.classList.toggle("dark", dark);
      const host = document.createElement("div");
      host.className = "operator-console";
      document.body.appendChild(host);
      const probe = (v) => {
        const d = document.createElement("div");
        d.style.backgroundColor = `hsl(var(${v}))`;
        host.appendChild(d);
        const c = getComputedStyle(d).backgroundColor;
        d.remove();
        return c;
      };
      const out = {
        bg: probe("--background"), rail: probe("--rail"),
        railFg: probe("--rail-foreground"), gold: probe("--cd-gold"),
      };
      host.remove();
      return out;
    };
    const light = read(false);
    const dark = read(true);
    document.documentElement.classList.remove("dark");
    return { light, dark };
  });

  const lum = (rgb) =>
    rgb.match(/\d+/g).map(Number).map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
      .reduce((a, v, i) => a + [0.2126, 0.7152, 0.0722][i] * v, 0);
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (hi + 0.05) / (lo + 0.05);
  };

  const { light, dark } = themes;
  // The flip must be FELT, not merely different (§23 "light must be genuinely LIGHT").
  const flip = ratio(light.bg, dark.bg);
  record(
    "the light↔dark flip is unmistakable on the console ground",
    flip > 10,
    `light bg=${light.bg} · dark bg=${dark.bg} · ratio=${flip.toFixed(2)}:1`,
  );
  // The dark override must actually APPLY — if it were shadowed, dark.rail would equal light.rail.
  record(
    "the .dark override reaches the console palette",
    dark.rail !== light.rail && dark.gold !== light.gold,
    `rail light=${light.rail} dark=${dark.rail} · gold light=${light.gold} dark=${dark.gold}`,
  );
  // Rail ink must stay AA on the rail in BOTH themes — this is text, so 4.5 is the bar.
  const inkLight = ratio(light.railFg, light.rail);
  const inkDark = ratio(dark.railFg, dark.rail);
  record(
    "rail ink clears AA on the rail in both themes",
    inkLight >= 4.5 && inkDark >= 4.5,
    `light=${inkLight.toFixed(2)}:1 · dark=${inkDark.toFixed(2)}:1 (AA text bar 4.5)`,
  );
  // The rail must be a SEEN panel, not a sub-perceptual value change (§29). Dark is the hard
  // case: CD's own dark block paints the page the same colour as the rail, netting ~1.0.
  const panelLight = ratio(light.rail, light.bg);
  const panelDark = ratio(dark.rail, dark.bg);
  record(
    "the rail reads as a distinct panel in both themes",
    panelLight > 3 && panelDark > 1.25,
    `light=${panelLight.toFixed(2)}:1 · dark=${panelDark.toFixed(2)}:1 — dark is modest by ` +
      `nature on a ~5%L ground and leans on the --border-strong edge, but it is ABOVE CD's own ` +
      `~1.0 (rail and page identical, rail invisible), which is the defect being avoided`,
  );
  // Recorded, deliberately NOT asserted: CD's gold measures ~2.4:1 on CD's ground, under the
  // 3:1 non-text bar. Owner-ruled to ship as designed (2026-08-18), so failing on it here
  // would just be this script re-litigating a decision that has already been made.
  console.log(
    `NOTE  CD gold on the console ground: light=${ratio(light.gold, light.bg).toFixed(2)}:1 · ` +
      `dark=${ratio(dark.gold, dark.bg).toFixed(2)}:1 (owner-ruled, not asserted)`,
  );
  await page.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(
  `\n=== ${results.length - failed.length}/${results.length} passed ===` +
    (failed.length ? `\nFAILED: ${failed.map((f) => f.name).join(", ")}` : "") +
    `\nNOT COVERED (owed to a session with operator credentials): the authenticated rail render,` +
    ` the 78 placeholders behind the guard, the light/dark flip, and the §25 taste pass.`,
);
process.exit(failed.length ? 1 : 0);
