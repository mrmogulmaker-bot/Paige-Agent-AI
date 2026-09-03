#!/usr/bin/env node
/**
 * Local RENDERED proof for Solo Settings → Billing (Foundation C).
 *
 * It mounts the shipped `SoloSettings` route in the shared settings harness — the shipped
 * component, the shipped CSS, the shipped shell chain — and drives the Billing destination at every
 * supported viewport in both palettes.
 *
 * WHAT IT PROVES: that the surface RENDERS, what it renders in each server answer, that the
 * designate → persist → reload flow completes through the (synthetic) transport, and its geometry.
 *
 * WHAT IT DOES NOT PROVE (§13/§32.c): production data, production auth, or the deployed bundle.
 * The transport is a stub. The authenticated owner drive on the deployed surface remains OWED and
 * is not discharged by anything in this file.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
// §18/§24: the ONE resolver for the browser binary. This sandbox pre-provisions Chromium at a
// revision the pinned playwright does not expect, so a bare `chromium.launch()` fails with an
// "install browsers" banner that is about the environment, not the surface.
import { buildLaunchOptions } from "./live-drive.mjs";

/**
 * The shared options MINUS the agent proxy. This drive never leaves 127.0.0.1, and the sandbox's
 * proxy only accepts HTTPS CONNECT tunnels — pointing the browser at it made every local request
 * come back 405 and rendered an empty page, which reads exactly like a broken surface.
 */
function localLaunchOptions() {
  const { proxy: _proxy, ...rest } = buildLaunchOptions();
  return rest;
}

const PORT = 5209;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve("scripts/live-drive/artifacts/settings-billing");
const VIEWPORTS = [[1536, 770], [1366, 768], [1024, 768], [900, 1000]];
const THEMES = ["light", "dark"];
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
}

function assertPortFree() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(new Error(`Port ${PORT} is already in use.`)));
    probe.once("listening", () => probe.close(resolve));
    probe.listen(PORT, "127.0.0.1");
  });
}

async function stopProcessTree(child) {
  if (!child?.pid) return;
  try { if (process.platform === "win32") child.kill(); else process.kill(-child.pid, "SIGTERM"); } catch { /* already stopped */ }
}

async function measure(page) {
  return page.evaluate(() => {
    const host = document.querySelector("[data-solo-screen-host]");
    const content = document.querySelector(".ss-content");
    const controls = [...document.querySelectorAll(
      ".ss-content button:not([disabled]), .ss-content a[href], .ss-content select:not([disabled])",
    )].filter((el) => el.getBoundingClientRect().width > 0);
    const scrollers = [...document.querySelectorAll("*")].filter((el) => {
      const style = getComputedStyle(el);
      return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    });
    const text = document.querySelector(".ss-content")?.textContent ?? "";
    return {
      cards: document.querySelectorAll(".ss-content .ss-card").length,
      planState: document.querySelector("[data-billing-state]")?.getAttribute("data-billing-state") ?? null,
      portalState: document.querySelector("[data-portal-state]")?.getAttribute("data-portal-state") ?? null,
      contactsState: document.querySelector("[data-contacts-state]")?.getAttribute("data-contacts-state") ?? null,
      controls: controls.length,
      // The two claims this slice exists to make impossible, checked against the RENDERED text.
      moneyFigure: /\$\s?\d/.test(text),
      saysNoSubscription: /no subscription|no plan yet|no current solo subscription/i.test(text),
      saysNotOwnership: text.includes("does not change who owns this workspace"),
      saysNotSent: text.includes("not being sent yet"),
      // The usage card, which USED to be UNAVAILABLE and now states a real total. §58: it was
      // upgraded in place, never removed, so the check measures the stronger capability.
      usageState: document.querySelector("[data-usage-state]")?.getAttribute("data-usage-state") ?? null,
      keepsUsageCard: text.includes("AI usage"),
      statesAllowance: /\d[\d,]* AI credits \([\d,]+ tokens\)/.test(text),
      statesCreditRatio: text.includes("One AI credit is 1,000 tokens recorded by the platform."),
      // Checked on the RENDERED text of the note, in full. This lived in a field until a frame
      // showed the field clipping it to an ellipsis while this very check passed.
      namesPeriodSource: /this is the calendar month — this workspace has no provider billing period\./i.test(text),
      // Nothing on this surface may imply a charge, a forecast, or a consequence for using it up.
      claimsOverageOrForecast: /overage|projected|forecast|on track to|will run out|you will be charged/i.test(text),
      // Owner, 2026-09-03: the card is "Payment method", not "Invoices & payment method". Invoices
      // are the tenant's instrument toward THEIR customers; what the platform needs on the account
      // is the card it charges. Checked as an absence too, so the old wording cannot creep back.
      saysPaymentMethod: text.includes("Payment method"),
      claimsInvoices: /invoice/i.test(text),
      // Client billing MOVED to Campaigns › Sales. Billing is one direction of money only.
      leaksClientBilling: /charge your (own )?clients|your own payment processor/i.test(text),
      hostClient: host?.clientHeight ?? 0,
      hostScroll: host?.scrollHeight ?? 0,
      contentWidth: content?.getBoundingClientRect().width ?? 0,
      horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 ||
        Boolean(host && host.scrollWidth > host.clientWidth + 1),
      scrollers: scrollers.length,
    };
  });
}

async function openBilling(context, url) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator(".ss-content .ss-card").first().waitFor();
  const fold = page.locator('#tenant-paige-workspace button[aria-label="Fold PAIGE conversation"]');
  if (await fold.isVisible()) await fold.click();
  await page.waitForFunction(() => document.querySelectorAll(".ss-content .ss-card").length === 4 && document.querySelector("[data-billing-state]")?.getAttribute("data-billing-state") !== "status-loading");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return { page, errors };
}

async function main() {
  await assertPortFree();
  fs.mkdirSync(OUT, { recursive: true });
  const vite = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js", "--config",
    "scripts/live-drive/harness/settings-mount/billing.vite.config.ts", "--port", String(PORT), "--strictPort",
  ], { stdio: "ignore", detached: true });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/solo/1971670/settings/billing`)).ok) { ready = true; break; } }
      catch { /* starting */ }
      if (vite.exitCode !== null) throw new Error(`Vite exited before readiness (${vite.exitCode})`);
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) throw new Error("Settings harness did not become ready");

    browser = await chromium.launch({ ...localLaunchOptions(), ignoreDefaultArgs: ["--hide-scrollbars"] });

    /* ---- 1. Every viewport × theme, in the state PRODUCTION is actually in today. ---- */
    for (const [width, height] of VIEWPORTS) {
      for (const theme of THEMES) {
        const label = `${width}x${height} ${theme}`;
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
        const { page, errors } = await openBilling(context, `${BASE}/solo/1971670/settings/billing?theme=${theme}`);
        const m = await measure(page);

        record(`${label} · Billing renders four cards`, m.cards === 4, `${m.cards} cards, ${m.controls} controls`);
        record(`${label} · promotional workspace retains truthful access without provider mapping`,
          m.planState === "status-promotional", `plan=${m.planState}`);
        record(`${label} · manage billing says why it cannot open`,
          m.portalState === "portal-unavailable", `portal=${m.portalState}`);
        record(`${label} · first use: no billing contact designated`,
          m.contactsState === "none", `contacts=${m.contactsState}`);
        record(`${label} · promotional amount due is $0 with PAIGE Platform as biller`, await page.locator(".ss-content").innerText().then((t) => t.includes("$0") && t.includes("PAIGE Platform")));
        record(`${label} · never claims "no subscription"`, !m.saysNoSubscription);
        record(`${label} · states a designation is not ownership`, m.saysNotOwnership);
        record(`${label} · states notices are not being sent`, m.saysNotSent);
        record(`${label} · keeps the usage card, now stating a real total (§58 upgrade-in-place)`,
          m.keepsUsageCard && m.usageState === "usage-tracked", `usage=${m.usageState}`);
        record(`${label} · states the allowance and usage in credits AND tokens`, m.statesAllowance);
        record(`${label} · spells out what an AI credit is`, m.statesCreditRatio);
        record(`${label} · names the calendar month as the period source`, m.namesPeriodSource);
        record(`${label} · claims no overage, forecast or charge for AI usage`, !m.claimsOverageOrForecast);
        record(`${label} · names the card "Payment method"`, m.saysPaymentMethod);
        record(`${label} · claims no invoices anywhere (owner, 2026-09-03)`, !m.claimsInvoices);
        record(`${label} · no client-billing content (it moved to Campaigns › Sales)`, !m.leaksClientBilling);
        record(`${label} · no horizontal overflow`, !m.horizontal, `content=${Math.round(m.contentWidth)}px`);
        record(`${label} · at most one vertical scroll owner`, m.scrollers <= 1,
          `owners=${m.scrollers} ${m.hostScroll}/${m.hostClient}`);
        record(`${label} · no page errors`, errors.length === 0, errors.join(" | "));
        const reach = await page.evaluate(() => {
          const controls = [...document.querySelectorAll('.ss-content button:not([disabled]), .ss-content select:not([disabled]), .ss-content a[href]')];
          return controls.every((el) => {
            el.scrollIntoView({ block: "center" }); el.focus();
            const r = el.getBoundingClientRect();
            return document.activeElement === el && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
          });
        });
        record(`${label} · enabled controls accept focus and remain reachable`, reach);
        await page.emulateMedia({ reducedMotion: "reduce" });
        const reduced = await page.evaluate(() => {
          const spin = document.createElement("span"); spin.className = "ss-spin";
          document.querySelector(".ss-content").append(spin);
          const style = getComputedStyle(spin);
          const stopped = style.animationName === "none" || parseFloat(style.animationDuration) <= 0.01;
          spin.remove(); return stopped;
        });
        record(`${label} · reduced motion suppresses the Billing spinner`, reduced);
        await page.emulateMedia({ reducedMotion: "no-preference" });


        await page.evaluate(() => {
          const mark = document.createElement("div");
          mark.textContent = "HARNESS RENDER · NOT LIVE";
          Object.assign(mark.style, {
            position: "fixed", right: "10px", bottom: "10px", zIndex: "2147483647",
            padding: "6px 9px", background: "#111", color: "#fff", font: "700 11px sans-serif",
          });
          document.body.append(mark);
        });
        await page.screenshot({ path: path.join(OUT, `${width}x${height}-${theme}-first-use.png`), fullPage: true });
        // The Solo shell scrolls INTERNALLY, so `fullPage` captures the viewport and stops — the
        // cards below the fold are simply absent from the frame. That is how the AI usage card was
        // invisible in every frame this drive produced while its checks were passing, which is a
        // frame that cannot be read as evidence for it. An element capture is the fix.
        await page.locator(".ss-card").filter({ hasText: "AI usage" }).first()
          .screenshot({ path: path.join(OUT, `${width}x${height}-${theme}-ai-usage.png`) });
        await context.close();
      }
    }

    /* ---- 2. The flow a person finishes: designate, persist, reload. ---- */
    {
      const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: "dark" });
      const { page, errors } = await openBilling(context, `${BASE}/solo/1971670/settings/billing?theme=dark`);
      const before = await measure(page);
      record("flow · starts empty", before.contactsState === "none");

      const primary = page.locator('select[aria-label="Choose the primary billing contact"]');
      const submitPrimary = page.getByRole("button", { name: "Set primary billing contact" });
      record("flow · submit is disabled with nothing chosen", await submitPrimary.isDisabled());
      await primary.selectOption({ index: 1 });
      await submitPrimary.click();
      await page.getByText("Primary billing contact set for this workspace.").waitFor({ timeout: 10_000 });
      const after = await measure(page);
      record("flow · the designation appears from the server re-read", after.contactsState === "designated");

      const delegate = page.locator('select[aria-label="Choose a billing delegate"]');
      await delegate.selectOption({ index: 1 });
      await page.getByRole("button", { name: "Add billing delegate" }).click();
      await page.getByText("Billing delegate added for this workspace.").waitFor({ timeout: 10_000 });
      record("flow · a delegate can be added", (await page.locator("[data-contact-designation='delegate']").count()) === 1);
      await page.screenshot({ path: path.join(OUT, "flow-designated.png"), fullPage: true });

      // The only proof that matters for §70.1: it survives a reload.
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator(".ss-content .ss-card").first().waitFor();
      const reloaded = await measure(page);
      record("flow · the designations HOLD across a reload", reloaded.contactsState === "designated");
      record("flow · both designations are still there",
        (await page.locator("[data-contact-designation]").count()) === 2);
      record("flow · promotional state is unchanged after designation", reloaded.planState === "status-promotional");

      // Revoke, confirmed.
      page.once("dialog", (d) => d.accept());
      await page.locator("[data-contact-designation='delegate'] button").click();
      await page.getByText("no longer billing delegate").waitFor({ timeout: 10_000 });
      record("flow · a delegate can be removed",
        (await page.locator("[data-contact-designation='delegate']").count()) === 0);
      record("flow · no page errors across the whole flow", errors.length === 0, errors.join(" | "));
      await page.screenshot({ path: path.join(OUT, "flow-after-revoke.png"), fullPage: true });
      await context.close();
    }

    /* Payment setup states use only synthetic failures: this driver never visits a provider. */
    for (const mode of ["provider-unavailable", "provider-config", "payment-connected", "duplicate"]) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: "dark" });
      const { page, errors } = await openBilling(context, `${BASE}/solo/1971670/settings/billing?theme=dark&data=${mode}`);
      if (mode.startsWith("provider-")) {
        await page.getByRole("button", { name: "Set up payment method", exact: true }).click();
        await page.getByText(mode === "provider-config" ? "Payment setup needs a platform configuration update" : "The payment provider is temporarily unavailable", { exact: false }).waitFor();
        record(`${mode} · correct recovery action`, (await page.getByRole("button", { name: "Set up payment method", exact: true }).count()) === (mode === "provider-config" ? 0 : 1));
      }
      if (mode === "payment-connected") {
        record("connected · readiness only, no card details", await page.locator(".ss-content").innerText().then((t) => t.includes("Connected") && !/last.?4|expiry|Visa|4242|••••/.test(t)));
      }
      if (mode === "duplicate") record("duplicate · selection remains needed", await page.locator(".ss-content").innerText().then((t) => /selection needed/i.test(t)));
      record(`${mode} · no page errors`, errors.length === 0, errors.join(" | "));
      await context.close();
    }

    /* ---- 3. The failed read, and the read-only viewer. ---- */
    // `readonly` now expects `role-refusal`, not `billing-unavailable`: the stub answers
    // can_view_billing=false for that world, and R22 makes VIEW a permission of its own — so the
    // plan is refused to that person rather than reported as unavailable to everyone.
    for (const [mode, expectPlan] of [["issues", "status-error"], ["readonly", "status-role-refusal"]]) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: "dark" });
      const { page, errors } = await openBilling(context, `${BASE}/solo/1971670/settings/billing?theme=dark&data=${mode}`);
      const m = await measure(page);
      record(`${mode} · plan state`, m.planState === expectPlan, `plan=${m.planState}`);
      record(`${mode} · never says "no subscription"`, !m.saysNoSubscription);
      record(`${mode} · no money figure`, !m.moneyFigure);
      if (mode === "readonly") {
        record("readonly · no designate control is offered",
          (await page.locator(".ss-content select").count()) === 0);
        record("readonly · the read-only reason is stated",
          (await page.locator(".ss-content").innerText()).includes("read-only"));
        // R22 again, on the usage card: a non-owner is told why, and is never shown a zero, which
        // would be a claim about the account rather than a refusal to make one.
        record("readonly · usage is refused to a non-owner, not reported as zero",
          m.usageState === "usage-owner-only", `usage=${m.usageState}`);
        record("readonly · no usage figure is rendered for a non-owner", !m.statesAllowance);
      }
      if (mode === "issues") {
        record("issues · a retry is offered on the failed read",
          (await page.getByRole("button", { name: "Retry" }).count()) > 0);
        // The failed usage read must be its OWN unreadable state, not a zero and not a silent card.
        record("issues · the failed usage read says so rather than showing zero usage",
          m.usageState === "usage-error", `usage=${m.usageState}`);
        record("issues · no usage figure is rendered from a failed read", !m.statesAllowance);
      }
      record(`${mode} · no page errors`, errors.length === 0, errors.join(" | "));
      await page.screenshot({ path: path.join(OUT, `${mode}.png`), fullPage: true });
      await page.locator(".ss-card").filter({ hasText: "AI usage" }).first()
        .screenshot({ path: path.join(OUT, `${mode}-ai-usage.png`) });
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    await stopProcessTree(vite);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed · frames in ${OUT}`);
  if (failed.length) {
    console.log(`\n${failed.length} FAILED:`);
    for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
