#!/usr/bin/env node
/**
 * connections-calendars-authed-drive — the OWNER-PROOF drive (§70.1 / §32.c).
 *
 * The harness drive (`connections-calendars-usable-drive`) proves the shipped
 * component, hook and CSS drive their own contract against an in-memory double.
 * That is STRUCTURAL-HARNESS evidence and it is a class BELOW this one. It cannot
 * tell you whether the owner can sit down on the real platform and finish the job,
 * because it never touches a real tenant, real RLS, real Postgres constraints, or
 * a second account. This drive is the one that answers that, and nothing it does
 * not exercise may be reported as working.
 *
 * WHAT IT DRIVES — the capabilities the assignment names, in the real UI:
 *   A · create the first preset from the account's actual state
 *   B · edit a preset, save, RELOAD, and confirm the value survived
 *   C · set individual vs round-robin
 *   D · change availability, the buffer, and notification settings
 *   E · discard an edit and confirm nothing was written
 *   F · a reader sees the truth and cannot be tricked into a write
 *   G · switching accounts does not carry one account's rows into another
 *
 * WHAT IT WILL NEVER DO, BY CONSTRUCTION:
 *   · start a Google / Zoom / Apple OAuth handshake, or press any Connect control
 *   · send an email, an SMS, or a booking notification
 *   · touch billing, credentials, or provider configuration
 * Provider connection is a separate, separately-authorized act. Every provider
 * capability this drive does not exercise is reported UNVERIFIED, never assumed.
 *
 * AUTHORIZATION BOUNDARY (owner-set): ONE tenant only. No sub-account is requested,
 * used, or inferred. The account-switch scenario therefore CANNOT be proven here and
 * is reported UNVERIFIED permanently rather than approximated — there is deliberately
 * no second-account input to set.
 *
 * PREFERRED AUTHENTICATION IS A HANDED-OVER SESSION, not a password. Point
 * LIVE_DRIVE_STORAGE_STATE at a Playwright storage-state JSON exported from a browser
 * that is ALREADY signed in. The drive then reuses that session and never sees, is
 * told, types, logs or screenshots a credential. The email/password path remains only
 * as a fallback, and those values are ENV-only and never printed either way.
 *
 * REQUIRED ENV:
 *   LIVE_DRIVE_URL             a URL on the deployed host, e.g. https://<host>/auth
 *   CAL_ACCOUNT                the account number whose Solo settings to drive (§65 address)
 *   and ONE of:
 *   LIVE_DRIVE_STORAGE_STATE   path to a storage-state JSON from a signed-in browser  ← preferred
 *   LIVE_DRIVE_EMAIL + LIVE_DRIVE_PASSWORD   fallback form login
 * OPTIONAL:
 *   CAL_ALLOW_WRITES     must be "true" to run the write flows (A–E). Absent — and it is
 *                        absent by default — the drive is strictly READ-ONLY: it renders,
 *                        reads, and asserts, and performs no write of any kind.
 *
 * Run:  node scripts/live-drive/connections-calendars-authed-drive.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { liveDrive } from "./live-drive.mjs";

const ART = path.join(import.meta.dirname, "artifacts", "connections-calendars-authed");

const URL_ = process.env.LIVE_DRIVE_URL;
const ACCOUNT = process.env.CAL_ACCOUNT;
const WRITES = process.env.CAL_ALLOW_WRITES === "true";
const SESSION = process.env.LIVE_DRIVE_STORAGE_STATE;
const hasCreds = Boolean(process.env.LIVE_DRIVE_EMAIL && process.env.LIVE_DRIVE_PASSWORD);
const authorized = Boolean(SESSION) || hasCreds;

if (!URL_ || !authorized || !ACCOUNT) {
  // Skipping is the honest outcome, and it is NOT a pass. Nothing downstream may
  // read this exit code as evidence that anything was verified (§13).
  console.log(
    "↷ SKIP — no authenticated session available.\n" +
      "   Preferred: LIVE_DRIVE_URL + CAL_ACCOUNT + LIVE_DRIVE_STORAGE_STATE (a storage-state\n" +
      "   JSON from an ALREADY signed-in browser — no credential ever reaches this process).\n" +
      "   Fallback: LIVE_DRIVE_EMAIL + LIVE_DRIVE_PASSWORD instead of the storage state.\n" +
      "   The drive is READ-ONLY unless CAL_ALLOW_WRITES=true is set deliberately.\n" +
      "   Every capability below therefore remains UNVERIFIED — not passing, not failing.",
  );
  process.exit(0);
}

const results = [];
const record = (id, state, detail) => {
  results.push({ id, state, detail });
  const mark = state === "PASS" ? "✓" : state === "FAIL" ? "✗" : "·";
  console.log(`  ${mark} ${state.padEnd(10)} ${id}${detail ? ` — ${detail}` : ""}`);
};

/** The Solo Connections surface for one account (§65 address, never a hardcoded tenant). */
const connectionsUrl = (account) =>
  new URL(`/solo/${account}/settings/connections`, URL_).href;

const shot = (name) => path.join(ART, `${name}.png`);

/** Open a fold-out by title so its controls are reachable. */
async function openArea(page, title) {
  const area = page.locator(".cc-area").filter({ has: page.locator(".cc-area-t", { hasText: title }) }).first();
  const body = area.locator(".cc-area-b");
  if (!(await body.count()) || !(await body.first().isVisible())) {
    await area.locator(".cc-area-t").first().click();
  }
  await area.locator(".cc-area-b").first().waitFor({ state: "visible", timeout: 15_000 });
  return area;
}

async function save(page) {
  const act = page.locator(".cc-bar button", { hasText: /^\s*Save/ }).first();
  if (!(await act.count())) return { pressed: false, reason: "no save bar" };
  if (await act.isDisabled()) return { pressed: false, reason: "save disabled" };
  await act.click();
  await page.waitForTimeout(1200);
  return { pressed: true };
}

fs.mkdirSync(ART, { recursive: true });

const result = await liveDrive({
  url: URL_,
  screenshotPath: shot("00-after-login"),
  // Pinned to the real form: Auth.tsx renders #email / #password and more than one
  // submit button, so the generic selector could press the wrong one.
  // A handed-over session wins and suppresses the form login entirely, so no password
  // is entered on a browser that is already signed in.
  ...(SESSION ? { storageState: SESSION } : {}),
  auth: SESSION
    ? undefined
    : { emailSelector: "#email", passwordSelector: "#password", submitSelector: 'button[type="submit"]' },
  steps: async (page) => {
    await page.goto(connectionsUrl(ACCOUNT), { waitUntil: "networkidle" });
    await page.waitForSelector(".cc-area, .cc-empty", { timeout: 30_000 });
    await page.screenshot({ path: shot("01-calendars"), fullPage: false });

    /* ---------------------------------------------------------- read-only */

    // F · a reader is told the truth. Read whatever THIS account's role actually
    // is; do not manufacture a reader by tampering with the session.
    const notices = await page.locator(".cc-notice").allInnerTexts().catch(() => []);
    const readOnly = notices.some((t) => /but not change it/i.test(t));
    if (readOnly) {
      const live = await page.locator(".cc-area-b input:not([disabled]), .cc-area-b select:not([disabled])").count();
      record("F · reader sees truth and cannot write", live === 0 ? "PASS" : "FAIL",
        `read-only notice shown, enabled controls in bodies = ${live}`);
    } else {
      record("F · reader sees truth and cannot write", "UNVERIFIED",
        "this account has write access, so the reader path was not exercised — needs a reader account");
    }

    /* ------------------------------------------------------------- writes */

    if (!WRITES) {
      console.log("  (read-only posture: no write is attempted, so no record can change)");
      for (const id of [
        "A · create the first preset",
        "B · edit, save, reload, value holds",
        "C · individual vs round-robin",
        "D · availability, buffer, notifications",
        "E · discard writes nothing",
      ]) record(id, "UNVERIFIED", "CAL_ALLOW_WRITES not set — drive ran read-only");
    } else {
      const empty = await page.locator(".cc-empty").count();

      // A · create. Only from a genuinely empty book; on an account that already
      // has presets, creating one would be inventing data in a real tenant.
      if (empty) {
        const NAME = `Verification preset ${Date.now() % 100000}`;
        await page.locator(".cc-empty button", { hasText: /New preset/i }).first().click();
        const input = page.locator(".cc-empty .cc-new .cc-in").first();
        await input.waitFor({ state: "visible", timeout: 10_000 });
        await input.fill(NAME);
        await page.locator(".cc-empty .cc-new button", { hasText: /Create/i }).first().click();
        await page.waitForTimeout(2000);
        await page.goto(connectionsUrl(ACCOUNT), { waitUntil: "networkidle" });
        await page.waitForSelector(".cc-area, .cc-empty", { timeout: 30_000 });
        const survived = await page.getByText(NAME).count();
        record("A · create the first preset", survived > 0 ? "PASS" : "FAIL",
          `after reload, the created preset is on screen ${survived} time(s)`);
      } else {
        record("A · create the first preset", "UNVERIFIED",
          "this account already has presets — first-use creation needs an account with an empty book");
      }

      // B · edit, save, RELOAD. The reload is the assertion; a toast is not.
      const details = await openArea(page, "Details");
      const title = details.locator(".cc-area-b input.cc-in").first();
      const before = await title.inputValue();
      const wanted = `${before} ✓${Date.now() % 1000}`;
      await title.fill(wanted);
      const s1 = await save(page);
      await page.goto(connectionsUrl(ACCOUNT), { waitUntil: "networkidle" });
      const held = await openArea(page, "Details")
        .then((a) => a.locator(".cc-area-b input.cc-in").first().inputValue());
      record("B · edit, save, reload, value holds", held === wanted ? "PASS" : "FAIL",
        `saved=${s1.pressed} field after reload matches what was typed: ${held === wanted}`);
      await page.screenshot({ path: shot("02-after-save-reload"), fullPage: false });

      // Restore the name so the drive does not leave a marker on a real record.
      const restore = await openArea(page, "Details");
      await restore.locator(".cc-area-b input.cc-in").first().fill(before);
      await save(page);

      // C · type. Read the options, pick round-robin, save, reload.
      const d2 = await openArea(page, "Details");
      const sel = d2.locator("select.cc-sel").first();
      if (await sel.count()) {
        await sel.selectOption("round_robin").catch(() => {});
        await save(page);
        await page.goto(connectionsUrl(ACCOUNT), { waitUntil: "networkidle" });
        const now = await openArea(page, "Details").then((a) => a.locator("select.cc-sel").first().inputValue());
        record("C · individual vs round-robin", now === "round_robin" ? "PASS" : "FAIL", `type after reload = ${now}`);
      } else {
        record("C · individual vs round-robin", "FAIL", "no type control rendered");
      }

      // D · availability + buffer + notifications.
      const sched = await openArea(page, "Schedule & availability");
      const mon = sched.locator('input[aria-label="Mon opens"]').first();
      let dDetail = "";
      let dOk = true;
      if (await mon.count()) {
        const was = await mon.inputValue();
        const to = was === "08:00" ? "10:00" : "08:00";
        await mon.fill(to);
        await save(page);
        await page.goto(connectionsUrl(ACCOUNT), { waitUntil: "networkidle" });
        const back = await openArea(page, "Schedule & availability")
          .then((a) => a.locator('input[aria-label="Mon opens"]').first().inputValue());
        dOk = dOk && back === to;
        dDetail += `availability ${was}→${to} held=${back === to}`;
        const undo = await openArea(page, "Schedule & availability");
        await undo.locator('input[aria-label="Mon opens"]').first().fill(was);
        await save(page);
      } else { dOk = false; dDetail += "no availability control"; }

      const rules = await openArea(page, "Booking rules");
      const bufField = rules.locator(".cc-f").filter({ has: page.locator("span", { hasText: /^Buffer before$/ }) }).first();
      if (await bufField.locator(".cc-chip").count()) {
        const wasChip = await bufField.locator('.cc-chip[aria-pressed="true"]').innerText().catch(() => "");
        await bufField.locator(".cc-chip", { hasText: /^15m$/ }).first().click();
        await save(page);
        await page.goto(connectionsUrl(ACCOUNT), { waitUntil: "networkidle" });
        const nowChip = await openArea(page, "Booking rules")
          .then((a) => a.locator(".cc-f").filter({ has: page.locator("span", { hasText: /^Buffer before$/ }) })
            .first().locator('.cc-chip[aria-pressed="true"]').innerText().catch(() => ""));
        dOk = dOk && nowChip === "15m";
        dDetail += ` · buffer ${wasChip}→15m held=${nowChip === "15m"}`;
      } else { dOk = false; dDetail += " · no buffer chips"; }

      // Notifications: prove the controls are LIVE, and do not send anything.
      const notify = await openArea(page, "Notifications");
      const editable = await notify.locator(
        "input:not([disabled]), select:not([disabled]), textarea:not([disabled])").count();
      dOk = dOk && editable > 0;
      dDetail += ` · notification controls editable=${editable}`;
      record("D · availability, buffer, notifications", dOk ? "PASS" : "FAIL", dDetail);

      // E · discard writes nothing.
      const d3 = await openArea(page, "Details");
      const keep = await d3.locator(".cc-area-b input.cc-in").first().inputValue();
      await d3.locator(".cc-area-b input.cc-in").first().fill(`${keep} DISCARD-ME`);
      const discard = page.locator(".cc-bar button", { hasText: /Discard/i }).first();
      if (await discard.count()) {
        await discard.click();
        await page.waitForTimeout(600);
        await page.goto(connectionsUrl(ACCOUNT), { waitUntil: "networkidle" });
        const after = await openArea(page, "Details")
          .then((a) => a.locator(".cc-area-b input.cc-in").first().inputValue());
        record("E · discard writes nothing", after === keep ? "PASS" : "FAIL",
          `after discard + reload the stored name is unchanged: ${after === keep}`);
      } else {
        record("E · discard writes nothing", "FAIL", "no discard control offered");
      }
    }

    /* ------------------------------------------------- account boundaries */

    // G · account boundaries. Only ONE tenant is authorized for this drive, and a
    // boundary cannot be demonstrated from inside a single account — you would be
    // asserting that nothing crossed a line you never approached. There is
    // deliberately no second-account input, so this can only be UNVERIFIED here.
    // The guard itself is proven as a unit (src/lib/calendar/account-identity.test.ts);
    // that is a different and lesser class of evidence, and does not close this.
    record("G · account boundaries hold", "UNVERIFIED",
      "one authorized tenant — a rendered A→B switch cannot be exercised, and is not approximated");

    // Provider handshakes are never exercised here, and are never assumed.
    record("H · Google / Zoom / Apple connect", "UNVERIFIED",
      "provider OAuth is out of scope for this drive and separately authorized");
  },
  assert: async (page) => {
    if (!(await page.locator(".cc-area, .cc-empty").count())) {
      throw new Error("Connections → Calendars did not render for the authenticated account");
    }
  },
});

fs.writeFileSync(path.join(ART, "authed-flows.json"), JSON.stringify(results, null, 2));

// Only non-page-derived scalars are logged — nothing read back from a page that
// had credentials typed into it, so the clear-text data flow stays provably clean.
console.log(
  `\nlive-drive: ok=${result.ok} status=${result.status ?? "n/a"} proxied=${result.proxied} ` +
    `screenshot=${result.screenshotPath}`,
);
if (!result.ok) {
  console.error(`✗ authed drive FAILED: ${result.error}`);
  console.error(
    "  Distinguish before reporting (§13): a failure here can mean the SURFACE is broken, OR that\n" +
      "  prod is unreachable from this environment. Do not claim a broken surface on a reachability\n" +
      "  failure, and never claim a pass that did not happen.",
  );
  process.exit(1);
}

const fails = results.filter((r) => r.state === "FAIL");
const unver = results.filter((r) => r.state === "UNVERIFIED");
console.log(
  `\n${fails.length ? "✗" : "✓"} authenticated drive: ${results.filter((r) => r.state === "PASS").length} PASS · ` +
    `${fails.length} FAIL · ${unver.length} UNVERIFIED. Evidence in ${ART}`,
);
for (const u of unver) console.log(`   UNVERIFIED — ${u.id}: ${u.detail}`);
process.exit(fails.length ? 1 : 0);
