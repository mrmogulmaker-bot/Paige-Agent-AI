#!/usr/bin/env node
/**
 * CAN A PERSON ACTUALLY FINISH THE JOB ON CONNECTIONS › COMMUNICATIONS?
 *
 * The unit suite proves each panel CALLS the right seam, because it mocks the
 * adapter. That is a real proof of wiring and it is not a proof of use: a mocked
 * `saveBusiness` cannot show that the value survives, that the step which graded
 * it stops complaining, or that a reload still finds it. §70.1 asks for the
 * flow — begin from the empty state, act, save, reload, and confirm the durable
 * result — so this drives it in a browser against the REAL merged `SoloApp`.
 *
 * WHAT IS REAL HERE: the shipped `SoloSettings`, the shipped `useSoloComms`, the
 * shipped stylesheets, the real shell and the real route resolution. Only the
 * Supabase transport is substituted, and the substitute is a STORE — writes land
 * in sessionStorage and outlive a reload, which is the only reason a persistence
 * assertion below means anything.
 *
 * THE LOAD-BEARING ASSERTIONS are the round trips:
 *   · register a domain → it appears in the list AND in the store → remove it →
 *     it is gone from both
 * Everything else is corroboration.
 *
 * WHAT THIS DELIBERATELY REFUSES TO PROVE (§13/§32.c):
 *   · The Google connect handshake. The harness never leaves for a provider, so
 *     the drive asserts the HONEST REFUSAL surfaces — a real failure shown as a
 *     failure — and never that a connection succeeded. A harness that faked a
 *     provider would be manufacturing the exact false green this file exists to
 *     make impossible.
 *   · Anything about the deployed app. This is a local mount. Authenticated
 *     runtime on production remains OWED.
 *   · Domain verification. `add` stores `pending`, never `verified`, because
 *     nothing checked DNS. "Check DNS" is proven to CALL, not to verify.
 *
 * RUN IT AGAINST A SETTLED TREE. The harness is a Vite dev server; editing a
 * source file mid-run hot-reloads the page under the drive and silently measures
 * a different build than the one on disk. The freshness preflight below aborts
 * rather than measure a stale bundle.
 */
import { chromium } from "playwright";
import { assertHarnessServesWorkingTree } from "./harness-freshness.mjs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.CAL_HARNESS_URL || "http://127.0.0.1:5203";
const EXE = process.env.PW_EXECUTABLE_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = path.resolve("scripts/live-drive/artifacts/comms-actions");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const record = (flow, name, ok, detail) => {
  results.push({ flow, name, ok, detail });
  console.log(`   ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`);
};
const observe = (flow, name, detail) => {
  results.push({ flow, name, observed: true, detail });
  console.log(`   • ${name} — ${detail}`);
};

const COMMS = "/?route=settings&theme=dark";
const store = (page) => page.evaluate(() => window.__harnessStore ?? null);
const brandOf = async (page) => ((await store(page))?.tenants?.[0]?.brand) ?? {};

/** Click the button whose visible text contains `label`. */
async function click(page, label) {
  const btn = page.locator("button", { hasText: label }).first();
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click();
  await page.waitForTimeout(500);
}
async function fill(page, placeholder, value) {
  const input = page.locator(`input[placeholder="${placeholder}"]`).first();
  await input.waitFor({ state: "visible", timeout: 10000 });
  await input.fill(value);
  await page.waitForTimeout(150);
}
async function bodyText(page) {
  // `locator(...).innerText()` waits for VISIBILITY and times out while the
  // surface is mid-re-render after a segment click — which reads as "the page
  // never rendered" when the page is fine. Reading textContent directly cannot
  // time out and is what the assertions actually need.
  return await page.evaluate(() => {
    const el = document.querySelector(".solo-settings") ?? document.body;
    return (el.textContent ?? "").replace(/\s+/g, " ");
  });
}
/** Clear the modal PAIGE overlay the shell raises at <=1080px. */
async function clearBackdrop(page) {
  const b = await page.$(".tcs-paige-backdrop");
  if (b && await b.isVisible()) { await b.click(); await page.waitForTimeout(250); }
}

async function open(browser, query = COMMS, viewport = { width: 1536, height: 900 }) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${BASE}${query}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".solo-settings", { timeout: 15000 });
  await clearBackdrop(page);
  // The harness route pins `?segment=calendars`, so Communications has to be
  // SELECTED — landing on Connections is not landing on this surface. An earlier
  // revision of this drive measured the Calendars segment and reported the
  // business-details field missing, which was true of the page it was looking at
  // and said nothing about the page under test.
  await select(page, "Communications");
  return page;
}

/** Select a Connections area by its tab label, and wait for it to settle. */
async function select(page, label) {
  const tab = page.locator(".ss-segment button", { hasText: label }).first();
  await tab.waitFor({ state: "visible", timeout: 10000 });
  await tab.click();
  await page.waitForTimeout(1400);
}

/** The rows the store actually holds, which is a different question from what is on screen. */
const rows = async (page, table) => ((await store(page)) ?? {})[table] ?? [];

async function run() {
  await assertHarnessServesWorkingTree(BASE, [
    {
      file: "src/solo/settings.tsx",
      markers: ["Connect a Google account", "Connected sending account"],
      // The editor this branch REMOVED from Connections. Presence markers cannot
      // see a stale build that still carries deleted code — this is the half that
      // can, and it is here because that exact miss sent me chasing a phantom
      // crash in a component the source no longer has.
      absent: ["BusinessDetailsPanel", "Save business details"],
    },
    { file: "src/solo/data/useSoloComms.ts", markers: ["startGmailConnect", "manage-tenant-domain"] },
    { file: "src/solo/data/useSoloNumbers.ts", markers: ["comms-search-numbers", "comms-purchase-number"] },
    { file: "src/solo/data/useSoloA2P.ts", markers: ["comms-a2p-draft", "comms-a2p-submit"] },
  ]);

  const browser = await chromium.launch({ executablePath: EXE });

  /* ── FLOW 1 — business details are GRADED here, owned by Setup ────────── */
  console.log("\n── flow 1 · business details belong to Setup ─────");
  {
    const page = await open(browser);
    const t = await bodyText(page);

    record("business", "still reports what carriers are missing",
      /business name.*still missing/i.test(t), t.slice(0, 240));

    // Owner ruling 2026-08-31. The legal name, address and phone are Setup's;
    // Connections owns only what the platform hands the tenant — the sending
    // domain and the address on it. An earlier revision of this drive proved an
    // EDITOR here worked, which was a faithful proof of the wrong design: Setup's
    // `SuBusiness` was already the home for those fields.
    record("business", "does NOT duplicate the Setup editor",
      await page.locator('input[placeholder="As registered"]').count() === 0,
      "a second business-name field exists on Connections");

    const href = await page.locator('a:has-text("Setup")').first().getAttribute("href");
    record("business", "points at the one place those fields are edited",
      typeof href === "string" && href.includes("/settings/setup"), `href: ${href}`);

    await page.screenshot({ path: path.join(OUT, "business-points-to-setup.png") });
    await page.close();
  }

  /* ── FLOW 2 — the domain lifecycle ────────────────────────────────────── */
  console.log("\n── flow 2 · sending domains ──────────────────────");
  {
    const page = await open(browser);
    const empty = await bodyText(page);
    record("domains", "starts from a real empty state, not a fabricated list",
      /No custom sending domain yet/i.test(empty), empty.slice(0, 160));

    await click(page, "Add a domain");
    await fill(page, "mail.yourbusiness.com", "mail.example.com");
    await fill(page, "Your business", "Example Co");
    await click(page, "Register domain");
    await page.waitForTimeout(700);

    const rows = (await store(page))?.tenant_email_domains ?? [];
    record("domains", "the domain REACHED THE STORE",
      rows.length === 1 && rows[0].domain === "mail.example.com", JSON.stringify(rows));
    record("domains", "and it is stored PENDING — nothing verified any DNS",
      rows[0]?.status === "pending", `status: ${rows[0]?.status}`);

    const listed = await bodyText(page);
    record("domains", "and it is listed on the surface",
      /mail\.example\.com/.test(listed), listed.slice(0, 200));

    // A pending domain must not offer "make default" — the control is gated on
    // verified, because defaulting mail to an unverified domain would silently
    // break sending.
    record("domains", "'Make default' is withheld while the domain is unverified",
      await page.locator("button", { hasText: "Make default" }).count() === 0,
      "a pending domain offered Make default");

    await click(page, "Check DNS");
    await page.waitForTimeout(500);
    const checked = await bodyText(page);
    record("domains", "'Check DNS' runs and reports, without claiming verification",
      /Re-read the DNS records/i.test(checked) && !/verified/i.test(checked.split("Re-read")[1] ?? ""),
      checked.slice(0, 200));

    page.once("dialog", (d) => d.accept());
    await click(page, "Remove");
    await page.waitForTimeout(700);
    const afterRemove = (await store(page))?.tenant_email_domains ?? [];
    record("domains", "remove deletes it from the STORE, not just the list",
      afterRemove.length === 0, JSON.stringify(afterRemove));

    await page.screenshot({ path: path.join(OUT, "domains.png") });
    await page.close();
  }

  /* ── FLOW 3 — the Google sending account ──────────────────────────────── */
  console.log("\n── flow 3 · Google sending account ───────────────");
  {
    const page = await open(browser);
    const t = await bodyText(page);

    record("google", "offers a connect action from the disconnected state",
      await page.locator("button", { hasText: "Connect a Google account" }).count() > 0, t.slice(0, 200));
    record("google", "is named a SENDING account and does not claim inbound",
      /Connected sending account/i.test(t) && /send email as you|authorised to SEND only/i.test(t), t.slice(0, 240));
    record("google", "names Outlook as absent rather than implying it",
      /no Outlook connection on this platform yet/i.test(t), t.slice(0, 240));

    // The harness never leaves for a provider. What must be proven is that the
    // failure is SHOWN — a swallowed handshake failure would leave a person
    // clicking a button that appears to do nothing.
    await click(page, "Connect a Google account");
    await page.waitForTimeout(800);
    const afterClick = await bodyText(page);
    // A failure has to be VISIBLE and READABLE. The literal provider error is
    // deliberately not asserted: it goes through `resolveFunctionError`, whose
    // whole job is to replace codes and framework strings with plain English —
    // an earlier revision of this row matched the raw text and would have gone
    // red the moment the copy became good. What must hold is that a failure
    // notice appeared at all, and that it is not framework jargon.
    const failureShown = await page.locator('.ss-outcome[data-tone="bad"]').count();
    record("google", "a failed handshake is SURFACED, never swallowed",
      failureShown > 0, `no .ss-outcome[data-tone="bad"] rendered · ${afterClick.slice(0, 200)}`);
    record("google", "and the failure is plain English, not framework jargon",
      !/non-2xx|Edge Function returned/i.test(afterClick), afterClick.slice(0, 240));
    record("google", "and no connection is claimed on a failure",
      !/Connected<|Disconnect/.test(afterClick), afterClick.slice(0, 240));

    observe("google", "provider handshake NOT exercised",
      "the harness refuses to leave for Google by design; the real consent flow is owed to an authenticated session");

    await page.screenshot({ path: path.join(OUT, "google-account.png") });
    await page.close();
  }

  /* ── FLOW 4 — the §9 read-only gate, driven ───────────────────────────── */
  console.log("\n── flow 4 · read-only caller ─────────────────────");
  {
    const page = await open(browser, "/?route=settings&theme=dark&data=readonly");
    const t = await bodyText(page);
    record("readonly", "a non-admin sees NO business-details editor",
      await page.locator('input[placeholder="As registered"]').count() === 0, t.slice(0, 200));
    record("readonly", "a non-admin sees NO add-domain control",
      await page.locator("button", { hasText: "Add a domain" }).count() === 0, t.slice(0, 200));
    record("readonly", "a non-admin sees NO connect control",
      await page.locator("button", { hasText: "Connect a Google account" }).count() === 0, t.slice(0, 200));
    record("readonly", "and is told why, rather than shown a dead surface",
      /Only a workspace admin can change/i.test(t), t.slice(0, 240));
    await page.screenshot({ path: path.join(OUT, "readonly.png") });
    await page.close();
  }


  /* ── FLOW 5 — buying a number, which SPENDS MONEY ─────────────────────── */
  console.log("\n── flow 5 · finding and buying a number ──────────");
  {
    const page = await open(browser);
    const before = (await rows(page, "tenant_phone_numbers")).length;

    // A setup gap is not an empty shelf. Blaming the search for a missing messaging
    // account sends someone looking for better filters instead of at the real cause.
    await fill(page, "404", "000");
    await click(page, "Search numbers");
    await page.waitForTimeout(700);
    let t = await bodyText(page);
    record("numbers", "a setup gap is reported as a setup gap",
      /can.?t buy a number yet/i.test(t) && !/No numbers matched/i.test(t), t.slice(0, 200));

    await fill(page, "404", "404");
    await fill(page, "GA", "GA");
    await click(page, "Search numbers");
    await page.waitForTimeout(700);
    t = await bodyText(page);
    record("numbers", "the search returns numbers with a price and what they can do",
      /\+1404555010/.test(t) && /\$1\.2/.test(t) && /text/.test(t), t.slice(0, 300));

    // The refusing number. Provider inventory really does go stale between a search
    // and a buy, and telling someone they own a number they do not is the worst
    // outcome available on this surface.
    page.once("dialog", (d) => d.accept());
    const refuseRow = page.locator(".ss-list > div", { hasText: "+14045550102" }).first();
    await refuseRow.locator("button", { hasText: "Buy" }).click();
    await page.waitForTimeout(900);
    t = await bodyText(page);
    record("numbers", "a refused purchase is NEVER rendered as a purchase",
      !/is yours/.test(t) && (await page.locator('.ss-outcome[data-tone="bad"]').count()) > 0,
      t.slice(0, 260));
    record("numbers", "and nothing reached the store",
      (await rows(page, "tenant_phone_numbers")).length === before,
      `rows now ${(await rows(page, "tenant_phone_numbers")).length}, was ${before}`);

    // It asks before it charges. A purchase that happens on one click, with no
    // statement of the price, is a charge someone did not agree to.
    let asked = "";
    page.once("dialog", (d) => { asked = d.message(); d.accept(); });
    const buyRow = page.locator(".ss-list > div", { hasText: "+14045550101" }).first();
    await buyRow.locator("button", { hasText: "Buy" }).click();
    await page.waitForTimeout(1100);
    record("numbers", "it names the price before it charges",
      /\$1\.2/.test(asked) && /charge/i.test(asked), `asked: ${asked}`);

    t = await bodyText(page);
    record("numbers", "the purchase is reported as done", /is yours/.test(t), t.slice(0, 260));
    // The claim that matters. "It said it worked" and "the number is on the business"
    // are different claims, and only the second one survives a reload.
    const after = await rows(page, "tenant_phone_numbers");
    record("numbers", "and the number REACHED THE STORE",
      after.some((r) => r.phone_number === "+14045550101"),
      JSON.stringify(after.map((r) => r.phone_number)));

    await page.screenshot({ path: path.join(OUT, "numbers-bought.png") });
    await page.reload({ waitUntil: "networkidle" });
    await clearBackdrop(page);
    await select(page, "Communications");
    t = await bodyText(page);
    record("numbers", "and it is still there after a reload", /\+14045550101/.test(t), t.slice(0, 300));
    await page.close();
  }

  /* ── FLOW 6 — carrier registration, and the claim it must never make ──── */
  console.log("\n── flow 6 · carrier registration ─────────────────");
  {
    const page = await open(browser);
    await select(page, "Registration");
    let t = await bodyText(page);

    record("a2p", "registration is reachable as its own area of Connections",
      /Prepare your registration/i.test(t), t.slice(0, 200));
    // The ceiling, stated where the acts are rather than buried in a status card.
    record("a2p", "says plainly that filing is the step this product does not have",
      /Filing is the step this product does not have yet/i.test(t), t.slice(0, 400));

    // The identity fields the save DISCARDS are shown, not typeable. A box over a
    // discarded field is a save that lies: type a correction, be told it saved, reload,
    // find the old value.
    record("a2p", "shows the legal identity without offering a box that would discard it",
      /Harness Coaching LLC/.test(t)
        && await page.evaluate(() => ![...document.querySelectorAll("input")].some((i) => i.value === "Harness Coaching LLC")),
      t.slice(0, 300));

    // Saved copy re-opens for editing. Without this the only live control is a paid
    // generation that overwrites reviewed compliance prose.
    const desc = page.locator("textarea").first();
    record("a2p", "re-opens the saved copy instead of charging to see it again",
      (await desc.inputValue()).includes("already our clients"), await desc.inputValue());

    await desc.fill("We text our own clients about appointments, and nobody else.");
    await click(page, "Save registration");
    await page.waitForTimeout(900);
    t = await bodyText(page);
    record("a2p", "the save reports SAVED", /registration is saved/i.test(t), t.slice(0, 300));
    // The one claim this surface must never make.
    record("a2p", "and NEVER says it was filed",
      /has not been filed/i.test(t) && !/Submitted for review/i.test(t), t.slice(0, 300));

    const reg = (await rows(page, "tenant_a2p_registrations"))[0] ?? {};
    record("a2p", "the edit REACHED THE STORE",
      String(reg.campaign_description ?? "").includes("nobody else"),
      String(reg.campaign_description ?? ""));
    record("a2p", "and the store still says nothing was submitted",
      (reg.submitted_at ?? null) === null && (reg.status ?? null) === "pending",
      JSON.stringify({ submitted_at: reg.submitted_at ?? null, status: reg.status ?? null }));

    await page.screenshot({ path: path.join(OUT, "registration-saved.png") });
    await page.close();
  }

  await browser.close();

  const scored = results.filter((r) => !r.observed);
  const failed = scored.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\n${scored.length - failed.length}/${scored.length} checks passed` +
              `${failed.length ? `, ${failed.length} FAILED` : ""}` +
              ` · ${results.filter((r) => r.observed).length} observation(s) recorded, unscored`);
  for (const f of failed) console.log(`   ✗ [${f.flow}] ${f.name} — ${f.detail}`);
  // A drive that fails checks and exits 0 cannot be told from a passing one by
  // anything but a human reading the log.
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => { console.error("DRIVE ERROR:", e); process.exit(2); });
