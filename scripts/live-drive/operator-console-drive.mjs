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
// half: the door, the guard's signed-out redirect, the `?next=` round-trip, loop-freedom, and that
// the `--rail` token resolves to a real colour rather than transparent. It does NOT cover the
// authenticated rail render, the 78 placeholders behind the guard, the theme flip, or any §25 taste
// judgement — those need operator credentials and a look, and remain OWED to a capable session.
//
// Run against a local build (no credentials, no network needed):
//   npx vite build && npx vite preview --port 4319 --strictPort --host 127.0.0.1 &
//   node scripts/live-drive/operator-console-drive.mjs http://127.0.0.1:4319
//
// Or against any deployed origin that is not behind an SSO wall:
//   node scripts/live-drive/operator-console-drive.mjs https://<host>
//
// Exits non-zero on any failed assertion, so it can gate a slice.
import { resolvePlaywright, resolveExecutablePath } from "./live-drive.mjs";

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
const executablePath = resolveExecutablePath();
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  ...(executablePath ? { executablePath } : {}),
});
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

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(
  `\n=== ${results.length - failed.length}/${results.length} passed ===` +
    (failed.length ? `\nFAILED: ${failed.map((f) => f.name).join(", ")}` : "") +
    `\nNOT COVERED (owed to a session with operator credentials): the authenticated rail render,` +
    ` the 78 placeholders behind the guard, the light/dark flip, and the §25 taste pass.`,
);
process.exit(failed.length ? 1 : 0);
