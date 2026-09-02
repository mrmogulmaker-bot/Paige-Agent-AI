#!/usr/bin/env node
/**
 * Renders the Solo Team removal flow at the four required viewports in both genuine themes, and
 * drives the flow's states against the team-mount harness.
 *
 * WHAT CLASS OF EVIDENCE THIS IS. Structural/harness render, driven in a real Chromium against real
 * components and real stylesheets — with the Supabase client and tenant context stubbed. It proves
 * layout, theme, focus and state behaviour. It is NOT authenticated runtime proof: no real session,
 * no real database, no real RLS. That drive is owed separately and is reported as owed, not implied.
 *
 * Usage: node scripts/live-drive/team-removal-render.mjs
 * Requires the harness dev server: npx vite --config scripts/live-drive/harness/team-mount/vite.config.ts
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.TEAM_HARNESS_URL || "http://127.0.0.1:5202";
const OUT = path.resolve("scripts/live-drive/artifacts/team-removal");
const VIEWPORTS = [
  { name: "1536x770", width: 1536, height: 770 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "900x1000", width: 900, height: 1000 },
];
const THEMES = ["light", "dark"];

const findings = [];
const note = (level, message) => { findings.push(`${level} ${message}`); console.log(`${level} ${message}`); };

async function openEditorOnAMember(page) {
  await page.waitForSelector("button.stw-row", { timeout: 15000 });
  // The owner sorts first and correctly has no remove control, so pick a row that is not one.
  // Detected by the pill's own data-tone, NOT by searching the row's text: the row's textContent is
  // concatenated with no separators, so "Owner" runs into the next field ("…actions.OwnerNo sign-in
  // recorded") and a \bOwner\b test silently fails to match — which is exactly what it did, leaving
  // this script clicking the owner and then waiting forever for a control that must not be there.
  const row = page.locator('button.stw-row:not(:has(.stw-pill[data-tone="owner"]))').first();
  const name = ((await row.locator(".stw-identity strong").textContent()) ?? "").trim();
  await row.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  return name;
}

const removeTrigger = (page) => page.getByRole("button", { name: /^Remove .+ from .+$/ });
const confirmButton = (page) => page.getByRole("button", { name: /^Confirm removing .+ from .+$/ });

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE_PATH || undefined });

  // ── 1. The four viewports × both themes, with the confirmation armed ──────────────────────────
  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto(`${BASE}/?theme=${theme}`, { waitUntil: "networkidle" });
      await openEditorOnAMember(page);
      await removeTrigger(page).first().click();
      await page.waitForSelector('[role="dialog"]');
      await page.screenshot({ path: path.join(OUT, `armed-${theme}-${vp.name}.png`) });

      // The page must never scroll sideways, and the dialog must fit the viewport it is in.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 0) note("FAIL", `${theme} ${vp.name}: page scrolls horizontally by ${overflow}px`);
      const box = await page.locator('[role="dialog"]').boundingBox();
      if (box && box.width > vp.width) note("FAIL", `${theme} ${vp.name}: dialog ${Math.round(box.width)}px wider than the ${vp.width}px viewport`);

      // Light must actually be light and dark actually dark — not the same surface twice.
      const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".stw-modal")).backgroundColor);
      const lum = (() => { const [r, g, b] = bg.match(/\d+/g).map(Number); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; })();
      if (theme === "light" && lum < 0.5) note("FAIL", `light ${vp.name}: modal background is dark (luminance ${lum.toFixed(2)}, ${bg})`);
      if (theme === "dark" && lum > 0.5) note("FAIL", `dark ${vp.name}: modal background is light (luminance ${lum.toFixed(2)}, ${bg})`);
      note("OK", `${theme} ${vp.name}: dialog ${box ? Math.round(box.width) : "?"}px, modal bg ${bg} (luminance ${lum.toFixed(2)}), no horizontal overflow`);
      await page.close();
    }
  }

  // ── 2. The states, driven once at the primary viewport ────────────────────────────────────────
  const drive = async (label, query, run) => {
    const page = await browser.newPage({ viewport: { width: 1536, height: 770 } });
    await page.goto(`${BASE}/?theme=dark${query}`, { waitUntil: "networkidle" });
    try { await run(page); } finally { await page.screenshot({ path: path.join(OUT, `state-${label}.png`) }); await page.close(); }
  };

  await drive("armed-focus-on-cancel", "", async (page) => {
    await openEditorOnAMember(page);
    await removeTrigger(page).first().click();
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    focused === "Cancel"
      ? note("OK", "armed: focus lands on Cancel, not on the destructive button")
      : note("FAIL", `armed: focus landed on ${JSON.stringify(focused)} instead of Cancel`);
  });

  await drive("escape-disarms", "", async (page) => {
    await openEditorOnAMember(page);
    await removeTrigger(page).first().click();
    await page.keyboard.press("Escape");
    const dialogStillOpen = await page.locator('[role="dialog"]').count();
    const confirmGone = (await confirmButton(page).count()) === 0;
    dialogStillOpen === 1 && confirmGone
      ? note("OK", "Escape disarms the confirmation and leaves the editor open")
      : note("FAIL", `Escape: dialog count ${dialogStillOpen}, confirm gone ${confirmGone}`);
  });

  await drive("refused-not-owner", "&remove=refuse-nonowner", async (page) => {
    const row = await openEditorOnAMember(page);
    await removeTrigger(page).first().click();
    await confirmButton(page).click();
    const alert = await page.locator('[role="alert"]').first().textContent();
    const stillListed = await page.locator("button.stw-row .stw-identity strong")
      .evaluateAll((nodes, target) => nodes.map((n) => n.textContent?.trim()).includes(target), row);
    /Only the workspace owner/.test(alert ?? "")
      ? note("OK", `refusal shows product copy, not backend text: ${JSON.stringify(alert)}`)
      : note("FAIL", `refusal copy unexpected: ${JSON.stringify(alert)}`);
    if (await page.locator('[role="dialog"]').count() !== 1) note("FAIL", "refusal closed the dialog");
    if (!stillListed) note("FAIL", "refusal removed the person from the roster anyway");
  });

  await drive("failure-retry", "&remove=network", async (page) => {
    await openEditorOnAMember(page);
    await removeTrigger(page).first().click();
    await confirmButton(page).click();
    const alert = await page.locator('[role="alert"]').first().textContent();
    const retry = await page.getByRole("button", { name: /Confirm removing/ }).textContent();
    /Nothing changed/.test(alert ?? "") && /Try again/.test(retry ?? "")
      ? note("OK", "network failure reads honestly and offers a retry")
      : note("FAIL", `failure state wrong: alert=${JSON.stringify(alert)} button=${JSON.stringify(retry)}`);
  });

  await drive("wrong-workspace", "&remove=wrong-tenant", async (page) => {
    await openEditorOnAMember(page);
    await removeTrigger(page).first().click();
    await confirmButton(page).click();
    const alert = await page.locator('[role="alert"]').first().textContent();
    /workspace changed/i.test(alert ?? "")
      ? note("OK", "a removal the server applied elsewhere is not reported as success here")
      : note("FAIL", `wrong-workspace state wrong: ${JSON.stringify(alert)}`);
  });

  await drive("success", "", async (page) => {
    const name = await openEditorOnAMember(page);
    const beforeCount = ((await page.locator(".stw-toolbar p").first().textContent()) ?? "").trim();
    await removeTrigger(page).first().click();
    await confirmButton(page).click();
    await page.waitForSelector('.stw-roster [role="status"]', { timeout: 10000 });
    const status = await page.locator('.stw-roster [role="status"]').first().textContent();
    const dialogs = await page.locator('[role="dialog"]').count();
    const afterCount = ((await page.locator(".stw-toolbar p").first().textContent()) ?? "").trim();
    // EXACT, not `hasText`. The harness names people "Maya Chen 1" … "Maya Chen 33", and a substring
    // filter for "Maya Chen 1" matches "Maya Chen 17" — which reported the person as still listed
    // when their row had in fact gone. A name test that can match a different person is not a test.
    const removedRowGone = (await page.locator("button.stw-row .stw-identity strong")
      .evaluateAll((nodes, target) => nodes.map((n) => n.textContent?.trim()).includes(target), name)) === false;
    const focusAttached = await page.evaluate(() => document.activeElement !== document.body && document.contains(document.activeElement));
    dialogs === 0 ? note("OK", "success closes the dialog") : note("FAIL", `success left ${dialogs} dialog(s) open`);
    /no longer has access/.test(status ?? "") ? note("OK", `outcome announced in the roster: ${JSON.stringify(status)}`) : note("FAIL", `no roster announcement: ${JSON.stringify(status)}`);
    focusAttached ? note("OK", "focus stays on an attached element after the row is gone") : note("FAIL", "focus fell to <body> after removal");
    // NOT a row count. The harness holds 34 people and a page is 25, so the visible rows stay at 25
    // after a removal — an earlier version of this assertion read that as a failure when the product
    // was correct. What must change is the roster's stated total and the removed person's own row.
    removedRowGone ? note("OK", `${JSON.stringify(name)}'s row is gone from the roster`) : note("FAIL", `${JSON.stringify(name)} is still listed after removal`);
    beforeCount !== afterCount
      ? note("OK", `roster total updated: ${JSON.stringify(beforeCount)} -> ${JSON.stringify(afterCount)}`)
      : note("FAIL", `roster total unchanged: ${JSON.stringify(afterCount)}`);
  });

  await browser.close();
  const failures = findings.filter((f) => f.startsWith("FAIL"));
  writeFileSync(path.join(OUT, "report.txt"), findings.join("\n") + `\n\n${failures.length} failure(s)\n`);
  console.log(`\n${failures.length} failure(s). Screenshots + report in ${OUT}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => { console.error("render run failed:", error); process.exit(1); });
