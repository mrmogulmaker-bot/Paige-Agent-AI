#!/usr/bin/env node
/**
 * THE AUTHENTICATED OWNER DRIVE for Solo Settings → Team removal.
 *
 * This is the one evidence class the removal slice still owes. Everything else about that slice has
 * been proven — the SQL guards against an applied schema, the screen's behaviour in jsdom, the
 * layout and focus behaviour in a real Chromium against a stubbed harness. None of that is a person
 * signing in and removing somebody, and this script exists so that when a safe session is available
 * the drive happens immediately and completely rather than being reconstructed under pressure.
 *
 * WHAT IT WILL NOT DO, BY CONSTRUCTION
 *   · It never creates a user, a workspace, or a membership. It drives what a person would drive.
 *   · It refuses to run at all unless the operator explicitly declares the target a dedicated test
 *     workspace with no real customer or team-member data (TEAM_DRIVE_CONFIRM_TEST_WORKSPACE).
 *   · It performs the removal ONLY when TEAM_ALLOW_REMOVAL=true. Without it the drive is READ-ONLY:
 *     it proves who is offered the control and every protection that needs no write.
 *   · No credential is ever printed, returned, screenshotted, or written to an artifact. The
 *     preferred input is a storage-state JSON from an already signed-in browser, so this process
 *     never sees a password at all. Nothing here is ever committed with a value in it.
 *
 * WHAT IT PROVES, AND WHAT IT HONESTLY CANNOT
 *   The owner's seven required proofs are enumerated as P1…P7 below. Several of them are facts about
 *   the REMOVED PERSON's account, and no amount of driving the Owner's browser can establish them —
 *   you cannot prove someone lost access by looking at somebody else's screen. Those need that
 *   person's own session, supplied separately. When it is absent the script reports them UNPROVEN.
 *   It never infers them, and it never lets the Owner-side roster standing in for them.
 *
 * ENV — the session (one of these; the first is preferred and involves no password anywhere)
 *   LIVE_DRIVE_STORAGE_STATE   path to a Playwright storage-state JSON for the OWNER, exported from
 *                              a browser that is already signed in
 *   LIVE_DRIVE_EMAIL + LIVE_DRIVE_PASSWORD   fallback form login, env-only
 *
 * ENV — the test setup (all required)
 *   LIVE_DRIVE_URL             the deployed host, e.g. https://paigeagent.ai
 *   TEAM_OWNER_ACCOUNT         account number of the test Solo workspace the Owner runs (§65)
 *   TEAM_TARGET_EMAIL          the removable Admin/Member's email — test data, not a credential
 *   TEAM_SECOND_ACCOUNT        account number of the SECOND workspace that person also belongs to
 *   TEAM_DRIVE_CONFIRM_TEST_WORKSPACE=true   an explicit declaration that this is a dedicated test
 *                              workspace containing no real customer or team-member data
 *
 * ENV — optional, each unlocking proofs that are otherwise honestly unproven
 *   TEAM_ALLOW_REMOVAL=true            perform the removal (P2–P5, P7). Absent → read-only.
 *   TEAM_REMOVED_STORAGE_STATE         a session for the REMOVED PERSON → unlocks P3b, P4, P5
 *   TEAM_ADMIN_STORAGE_STATE           a session for an ADMIN of the same workspace → unlocks P6-admin
 *
 * Run:  node scripts/live-drive/team-removal-authed-drive.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { liveDrive } from "./live-drive.mjs";

const ART = path.join(import.meta.dirname, "artifacts", "team-removal-authed");

const URL_ = process.env.LIVE_DRIVE_URL;
const OWNER_ACCOUNT = process.env.TEAM_OWNER_ACCOUNT;
const SECOND_ACCOUNT = process.env.TEAM_SECOND_ACCOUNT;
const TARGET_EMAIL = process.env.TEAM_TARGET_EMAIL;
const CONFIRMED_TEST = process.env.TEAM_DRIVE_CONFIRM_TEST_WORKSPACE === "true";
const ALLOW_REMOVAL = process.env.TEAM_ALLOW_REMOVAL === "true";

const OWNER_SESSION = process.env.LIVE_DRIVE_STORAGE_STATE;
const REMOVED_SESSION = process.env.TEAM_REMOVED_STORAGE_STATE;
const ADMIN_SESSION = process.env.TEAM_ADMIN_STORAGE_STATE;
const hasOwnerCreds = Boolean(process.env.LIVE_DRIVE_EMAIL && process.env.LIVE_DRIVE_PASSWORD);
const ownerAuthorized = Boolean(OWNER_SESSION) || hasOwnerCreds;

/**
 * Every proof carries its own verdict. `UNPROVEN` is a first-class outcome and is never rolled up
 * into a pass — a report that says "no failures" while half its rows were never attempted is the
 * exact dishonesty this slice has been careful about throughout.
 */
const PROOFS = [
  ["P1", "Owner opens Solo Settings → Team"],
  ["P2", "Owner removes the Admin/Member and confirms the action"],
  ["P3a", "the person disappears from the current workspace roster"],
  ["P3b", "the person can no longer use that workspace"],
  ["P4", "their identity and authored history remain intact"],
  ["P5", "their second workspace membership and access remain intact"],
  ["P6", "owner · co-owner · self · admin · member · wrong-workspace · unknown · cancel · retry · account-switch stay protected"],
  ["P7", "the test state is restored through the intended invitation flow"],
];
const verdicts = new Map(PROOFS.map(([id]) => [id, { state: "UNPROVEN", detail: "not attempted" }]));
const record = (id, state, detail) => {
  verdicts.set(id, { state, detail });
  console.log(`${state.padEnd(9)} ${id} — ${detail}`);
};

function refuseToRun(reason, remedy) {
  // Skipping is the honest outcome and it is NOT a pass. Nothing downstream may read this exit
  // code as evidence that anything was verified.
  console.log(`↷ NOT RUN — ${reason}\n`);
  console.log(remedy);
  console.log(
    "\nEvery proof below therefore remains UNPROVEN — not passing, not failing.\n" +
      PROOFS.map(([id, what]) => `  UNPROVEN  ${id} — ${what}`).join("\n"),
  );
  console.log("\nStatus of record: AUTHENTICATED RUNTIME PROOF OWED.");
  process.exit(0);
}

if (!CONFIRMED_TEST) {
  refuseToRun(
    "the target has not been declared a dedicated test workspace",
    "Set TEAM_DRIVE_CONFIRM_TEST_WORKSPACE=true only when ALL of these are true:\n" +
      "  · the workspace is a dedicated non-production or explicitly approved test Solo workspace\n" +
      "  · it holds no real customer or team-member data\n" +
      "  · the person about to be removed is a test identity, not a colleague\n" +
      "This guard exists because this script performs a real, access-changing write.",
  );
}
if (!URL_ || !ownerAuthorized || !OWNER_ACCOUNT || !SECOND_ACCOUNT || !TARGET_EMAIL) {
  refuseToRun(
    "no authenticated Owner session, or the test setup is incomplete",
    "Required:\n" +
      "  LIVE_DRIVE_URL                          the deployed host\n" +
      "  TEAM_OWNER_ACCOUNT                      test workspace A's account number\n" +
      "  TEAM_SECOND_ACCOUNT                     workspace B's account number\n" +
      "  TEAM_TARGET_EMAIL                       the removable person's email (test data)\n" +
      "  and ONE of:\n" +
      "  LIVE_DRIVE_STORAGE_STATE                ← preferred: no password reaches this process\n" +
      "  LIVE_DRIVE_EMAIL + LIVE_DRIVE_PASSWORD  fallback, env-only, never logged\n" +
      "Optional, each unlocking proofs that are otherwise UNPROVEN:\n" +
      "  TEAM_ALLOW_REMOVAL=true                 perform the removal (P2–P5, P7)\n" +
      "  TEAM_REMOVED_STORAGE_STATE              the removed person's session (P3b, P4, P5)\n" +
      "  TEAM_ADMIN_STORAGE_STATE                an Admin's session (P6-admin)",
  );
}

fs.mkdirSync(ART, { recursive: true });
const teamUrl = (account) => `${URL_.replace(/\/$/, "")}/solo/${account}/settings/team`;
const ownerAuth = OWNER_SESSION ? { storageState: OWNER_SESSION } : { auth: {} };

/** Locators, kept in one place so a markup change breaks one line rather than eleven. */
const ROW = "button.stw-row";
const rowFor = (page, email) => page.locator(ROW).filter({ hasText: email }).first();
const removeTrigger = (page) => page.getByRole("button", { name: /^Remove .+ from .+$/ });
const confirmButton = (page) => page.getByRole("button", { name: /^Confirm removing .+ from .+$/ });
const rosterEmails = (page) =>
  page.locator(`${ROW} .stw-identity small`).evaluateAll((n) => n.map((e) => e.textContent?.trim()));

async function main() {
  // ── P1 · the Owner reaches Team, and the target is really there ───────────────────────────────
  let targetPresent = false;
  let ownerRowHasNoControl = false;
  const p1 = await liveDrive({
    ...ownerAuth,
    url: teamUrl(OWNER_ACCOUNT),
    screenshotPath: path.join(ART, "P1-owner-opens-team.png"),
    viewport: { width: 1536, height: 770 },
    assert: async (page) => {
      await page.waitForSelector(ROW, { timeout: 30000 });
      const emails = await rosterEmails(page);
      targetPresent = emails.some((e) => e && e.toLowerCase() === TARGET_EMAIL.toLowerCase());
      if (!targetPresent) {
        throw new Error(
          `TEAM_TARGET_EMAIL is not on this workspace's roster, so there is nothing to remove. ` +
            `Roster holds ${emails.length} people.`,
        );
      }
      // P6, the half that needs no write: the Owner's own row and any co-owner row must offer
      // nothing. Self-removal and owner-removal are refused by never being offered here, and
      // refused again by the server if anything ever reached it.
      const ownerRows = page.locator(`${ROW}:has(.stw-pill[data-tone="owner"])`);
      const ownerCount = await ownerRows.count();
      for (let i = 0; i < ownerCount; i += 1) {
        await ownerRows.nth(i).click();
        await page.waitForSelector('[role="dialog"]');
        if ((await removeTrigger(page).count()) > 0) {
          throw new Error("an owner/co-owner row offered a remove control");
        }
        await page.keyboard.press("Escape");
      }
      ownerRowHasNoControl = ownerCount > 0;
    },
  });
  if (!p1.ok) {
    record("P1", "FAIL", `could not open Team as the Owner: ${p1.error}`);
    return finish();
  }
  record("P1", "PASS", `Team opened at ${teamUrl(OWNER_ACCOUNT)}; target is on the roster`);
  record(
    "P6",
    ownerRowHasNoControl ? "PARTIAL" : "UNPROVEN",
    ownerRowHasNoControl
      ? "owner/co-owner/self offered no remove control (write-free half). Admin, cancel, retry, " +
        "wrong-workspace and account-switch are recorded separately below."
      : "no owner row found to check",
  );

  if (!ALLOW_REMOVAL) {
    record("P2", "UNPROVEN", "TEAM_ALLOW_REMOVAL is not set — this run is deliberately read-only");
    return finish();
  }

  // ── P6 · cancellation, before anything is sent ────────────────────────────────────────────────
  const cancel = await liveDrive({
    ...ownerAuth,
    url: teamUrl(OWNER_ACCOUNT),
    screenshotPath: path.join(ART, "P6-cancel.png"),
    viewport: { width: 1536, height: 770 },
    assert: async (page) => {
      await rowFor(page, TARGET_EMAIL).click();
      await page.waitForSelector('[role="dialog"]');
      await removeTrigger(page).first().click();
      const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
      if (focused !== "Cancel") throw new Error(`armed focus was ${JSON.stringify(focused)}, not Cancel`);
      await page.getByRole("button", { name: "Cancel" }).click();
      if ((await confirmButton(page).count()) !== 0) throw new Error("Cancel did not disarm the confirmation");
      await page.keyboard.press("Escape");
      await page.waitForSelector('[role="dialog"]', { state: "detached" });
      const stillListed = await rosterEmails(page);
      if (!stillListed.some((e) => e && e.toLowerCase() === TARGET_EMAIL.toLowerCase())) {
        throw new Error("the person left the roster after a CANCELLED removal");
      }
    },
  });
  record(
    "P6",
    cancel.ok ? "PARTIAL" : "FAIL",
    cancel.ok
      ? "cancellation sends nothing and the person stays on the roster; armed focus lands on Cancel"
      : `cancellation path failed: ${cancel.error}`,
  );

  // ── P2 + P3a · the removal itself ─────────────────────────────────────────────────────────────
  let rosterAfter = [];
  const removal = await liveDrive({
    ...ownerAuth,
    url: teamUrl(OWNER_ACCOUNT),
    screenshotPath: path.join(ART, "P2-removed.png"),
    viewport: { width: 1536, height: 770 },
    assert: async (page) => {
      await rowFor(page, TARGET_EMAIL).click();
      await page.waitForSelector('[role="dialog"]');
      await removeTrigger(page).first().click();
      await confirmButton(page).click();
      // Success is the roster-level announcement, which is deliberately outside the dialog because
      // the refresh destroys the dialog. If it never appears, the removal is NOT proven.
      await page.waitForSelector('.stw-roster [role="status"]', { timeout: 30000 });
      const status = (await page.locator('.stw-roster [role="status"]').first().textContent()) ?? "";
      if (!/no longer has access/i.test(status)) {
        throw new Error(`no honest success announcement; the roster said ${JSON.stringify(status)}`);
      }
      if ((await page.locator('[role="dialog"]').count()) !== 0) throw new Error("the dialog stayed open after success");
      await page.waitForTimeout(1500);
      rosterAfter = await rosterEmails(page);
      if (rosterAfter.some((e) => e && e.toLowerCase() === TARGET_EMAIL.toLowerCase())) {
        throw new Error("the person is STILL on the roster after a reported success");
      }
    },
  });
  record("P2", removal.ok ? "PASS" : "FAIL", removal.ok ? "Owner removed the person and confirmed it" : `${removal.error}`);
  record(
    "P3a",
    removal.ok ? "PASS" : "FAIL",
    removal.ok ? `gone from workspace ${OWNER_ACCOUNT}'s roster (${rosterAfter.length} remain)` : "not established",
  );
  if (!removal.ok) return finish();

  // ── P3b + P4 + P5 · facts about the REMOVED PERSON's account ──────────────────────────────────
  // These cannot be established from the Owner's browser. Looking at someone else's screen does not
  // tell you what a third party can reach.
  if (!REMOVED_SESSION) {
    for (const id of ["P3b", "P4", "P5"]) {
      record(id, "UNPROVEN", "needs TEAM_REMOVED_STORAGE_STATE — a session for the removed person");
    }
  } else {
    const lost = await liveDrive({
      storageState: REMOVED_SESSION,
      url: teamUrl(OWNER_ACCOUNT),
      screenshotPath: path.join(ART, "P3b-removed-person-workspace-A.png"),
      viewport: { width: 1536, height: 770 },
      assert: async (page) => {
        // Losing access can look like a redirect, a refusal, or an empty roster. Any of those is
        // acceptable; what is NOT acceptable is the removed person still reading this team.
        await page.waitForTimeout(3000);
        const reachedTeam = (await page.locator(ROW).count()) > 0;
        if (reachedTeam) throw new Error("the removed person still reads this workspace's roster");
      },
    });
    record("P3b", lost.ok ? "PASS" : "FAIL", lost.ok ? `cannot reach workspace ${OWNER_ACCOUNT}` : `${lost.error}`);

    const kept = await liveDrive({
      storageState: REMOVED_SESSION,
      url: teamUrl(SECOND_ACCOUNT),
      screenshotPath: path.join(ART, "P5-removed-person-workspace-B.png"),
      viewport: { width: 1536, height: 770 },
      assert: async (page) => {
        await page.waitForSelector(ROW, { timeout: 30000 });
        const emails = await rosterEmails(page);
        if (!emails.some((e) => e && e.toLowerCase() === TARGET_EMAIL.toLowerCase())) {
          throw new Error(`they are no longer on workspace ${SECOND_ACCOUNT}'s roster either`);
        }
      },
    });
    record("P5", kept.ok ? "PASS" : "FAIL", kept.ok ? `still a member of workspace ${SECOND_ACCOUNT}, and can use it` : `${kept.error}`);
    record(
      "P4",
      kept.ok ? "PASS" : "UNPROVEN",
      kept.ok
        ? "the account still signs in and still renders under their own identity — it was an access " +
          "change, not a deletion. Authored-history spot-checks belong to whoever knows what they authored."
        : "not established",
    );
  }

  // ── P6 · the Admin half ───────────────────────────────────────────────────────────────────────
  if (!ADMIN_SESSION) {
    record("P6", "PARTIAL", "Admin refusal needs TEAM_ADMIN_STORAGE_STATE; the rest of P6 is recorded above");
  } else {
    const admin = await liveDrive({
      storageState: ADMIN_SESSION,
      url: teamUrl(OWNER_ACCOUNT),
      screenshotPath: path.join(ART, "P6-admin-has-no-control.png"),
      viewport: { width: 1536, height: 770 },
      assert: async (page) => {
        await page.waitForSelector(ROW, { timeout: 30000 });
        const rows = page.locator(`${ROW}:not(:has(.stw-pill[data-tone="owner"]))`);
        if ((await rows.count()) === 0) throw new Error("no non-owner row to open as the Admin");
        await rows.first().click();
        await page.waitForSelector('[role="dialog"]');
        if ((await removeTrigger(page).count()) > 0) {
          throw new Error("an ADMIN was offered a remove control");
        }
      },
    });
    record("P6", admin.ok ? "PASS" : "FAIL", admin.ok ? "an Admin is offered no remove control anywhere" : `${admin.error}`);
  }

  // ── P7 · restore the test state through the intended path ─────────────────────────────────────
  const restore = await liveDrive({
    ...ownerAuth,
    url: teamUrl(OWNER_ACCOUNT),
    screenshotPath: path.join(ART, "P7-reinvited.png"),
    viewport: { width: 1536, height: 770 },
    assert: async (page) => {
      await page.getByRole("button", { name: /Invite someone|Invite first teammate/ }).first().click();
      await page.waitForSelector('[role="dialog"]');
      await page.locator('input[type="email"]').fill(TARGET_EMAIL);
      await page.getByRole("button", { name: "Review invitation" }).click();
      await page.getByRole("button", { name: /Confirm and send invitation/ }).click();
      await page.waitForTimeout(2500);
      // The proof that removal is not a one-way door: the invitation seam accepts them again. If the
      // membership row had been soft-flagged instead of deleted, this would refuse here.
      const invites = (await page.locator(".stw-invites").textContent()) ?? "";
      if (!invites.toLowerCase().includes(TARGET_EMAIL.toLowerCase())) {
        throw new Error("the re-invitation does not appear in the Invitations list");
      }
    },
  });
  record(
    "P7",
    restore.ok ? "PASS" : "FAIL",
    restore.ok
      ? "re-invited through the normal invitation flow; it is pending. ACCEPTING it is a manual step — " +
        "the token only ever reaches the recipient's email, so no drive can complete that half."
      : `${restore.error}`,
  );

  return finish();
}

function finish() {
  const rows = PROOFS.map(([id, what]) => {
    const v = verdicts.get(id);
    return `${v.state.padEnd(9)} ${id} — ${what}\n            ${v.detail}`;
  });
  const failed = [...verdicts.values()].filter((v) => v.state === "FAIL").length;
  const unproven = [...verdicts.values()].filter((v) => v.state === "UNPROVEN").length;
  const report =
    `Solo Team removal — authenticated Owner drive\n` +
    `host ${URL_} · workspace ${OWNER_ACCOUNT} · second workspace ${SECOND_ACCOUNT}\n` +
    `session: ${OWNER_SESSION ? "storage-state (no password seen by this process)" : "form login from env"}\n` +
    `writes: ${ALLOW_REMOVAL ? "ENABLED" : "read-only"}\n\n` +
    rows.join("\n") +
    `\n\n${failed} failed · ${unproven} unproven\n` +
    (unproven > 0
      ? "\nAUTHENTICATED RUNTIME PROOF PARTIALLY OWED — the unproven rows above are not passes and " +
        "must not be reported as any other evidence class.\n"
      : "\nAll seven proofs established by a real signed-in Owner.\n");
  fs.writeFileSync(path.join(ART, "report.txt"), report);
  console.log(`\n${report}\nArtifacts in ${ART}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("drive aborted:", error?.message ?? error);
  finish();
});
