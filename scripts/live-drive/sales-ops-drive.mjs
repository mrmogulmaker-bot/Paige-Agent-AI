#!/usr/bin/env node
// Render Campaigns → Sales (the "Sales Command Desk") and prove it FITS and reads honestly.
//
// WHAT THIS PROVES AND WHAT IT DOES NOT. It renders the REAL `SalesOps`, `Sales` and `GrowthHub`
// with only the network reads stubbed, so it proves: the four internal views render (Sales Command /
// Commercial Terms / Revenue & Collections / Sales Scenarios), the sub-nav switches them, the
// geometry FITS the true Solo content column at every viewport × Paige state × theme, and the truth
// rules hold (Actual received unavailable, Contract-pending unavailable, a model that never writes).
// It does NOT prove the authenticated production surface: §32.c stays owed to a session that can
// reach the deployed app, and this harness must never be reported as having discharged it.
//
// THE WIDTH MATRIX IS THE REAL CONTENT COLUMN, NOT THE WINDOW. Solo docks PAIGE as a sibling column
// (`TenantCommandCenterShell.tsx` `minmax(440px,34vw)`), so the Sales surface never gets the whole
// window. A 1366 window gives this column 685px docked / 439px with PAIGE expanded; a 1536 window
// gives 797px / 521px. Below 1080 PAIGE is an overlay and does not reflow the column. sales-ops.css
// reflows on @media (viewport) width, so setting the browser viewport to the column width triggers
// exactly the collapse the real column would see. The tightest real case is 439px — the case a
// full-window drive would never test.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { buildLaunchOptions, resolvePlaywright } from "./live-drive.mjs";

const PORT = 5213;
const URL = `http://127.0.0.1:${PORT}/`;
const OUT = path.resolve(import.meta.dirname, "artifacts/sales-ops");
const REPO = path.resolve(import.meta.dirname, "../..");

// [device × Paige state] → the real content-column width, per the shell dock geometry above.
const FRAMES = [
  { name: "1536-paige-closed", width: 797, height: 770, note: "1536×770 · PAIGE docked" },
  { name: "1536-paige-open", width: 521, height: 770, note: "1536×770 · PAIGE expanded" },
  { name: "1366-paige-closed", width: 685, height: 768, note: "1366×768 · PAIGE docked" },
  { name: "1366-paige-open", width: 439, height: 768, note: "1366×768 · PAIGE expanded (tightest)" },
  { name: "1024-overlay", width: 1024, height: 768, note: "1024×768 · PAIGE overlay (no reflow)" },
  { name: "900-overlay", width: 900, height: 1000, note: "900×1000 · PAIGE overlay (no reflow)" },
];

const VIEWS = [
  ["command", "Sales Command"],
  ["terms", "Commercial Terms"],
  ["revenue", "Revenue & Collections"],
  ["scenarios", "Sales Scenarios"],
];

const results = [];
const fitTable = [];
function check(ok, name, detail = "") {
  results.push({ ok, name, detail });
  if (!ok) console.log(`FAIL  ${name}${detail ? `  ${detail}` : ""}`);
}

function assertPortFree() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(new Error(`Port ${PORT} is already in use.`)));
    probe.once("listening", () => probe.close(resolve));
    probe.listen(PORT, "127.0.0.1");
  });
}

async function stopTree(child) {
  if (!child?.pid) return;
  const gone = () => { try { process.kill(-child.pid, 0); return false; } catch { return true; } };
  try { process.kill(-child.pid, "SIGTERM"); } catch { /* group already gone */ }
  try { process.kill(child.pid, "SIGTERM"); } catch { /* child already gone */ }
  for (let i = 0; i < 20 && !gone(); i++) await new Promise((r) => setTimeout(r, 100));
  if (!gone()) {
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* raced with exit */ }
    try { process.kill(child.pid, "SIGKILL"); } catch { /* raced with exit */ }
  }
}

// The reviewer controls sit in a normal grid row; hidden they collapse it to 0 (true content
// height) and cannot intercept a SubNav click. They are shown ONLY for the instant of a control
// click, so a 439px column measures and clicks exactly as the real column would.
async function controls(page, show) {
  await page.evaluate((s) => {
    document.querySelectorAll("[data-harness-controls]").forEach((el) => { el.style.display = s ? "" : "none"; });
  }, show).catch(() => {});
}
async function clickControl(page, selector) {
  await controls(page, true);
  await page.click(selector);
  await controls(page, false);
  await page.waitForTimeout(60);
}

async function open(page) {
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main.paige-solo", { timeout: 30000 });
  await page.waitForSelector(".so-subnav", { timeout: 30000 });
  await controls(page, false);
}

/** `.paige-solo` transitions `background` over 300ms; measuring early reads a mid-fade grey. */
async function settle(page) { await page.waitForTimeout(360); }

async function clickData(page, attr, val) {
  await clickControl(page, `[data-${attr}="${val}"]`);
}

async function gotoView(page, view) {
  await page.click(`#sales-view-${view}`);
  await page.waitForTimeout(140);
}

/** Everything the fit + truth assertions need, read from the live DOM in one pass. */
async function measure(page) {
  return page.evaluate(() => {
    const scroll = document.querySelector(".campaigns-scroll");
    const so = document.querySelector(".so");
    const text = so?.textContent ?? "";
    const vBy = scroll ? scroll.scrollHeight - scroll.clientHeight : 0;
    const childOverflow = [...document.querySelectorAll(".so *")]
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible")
      .map((el) => (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) + ` +${el.scrollWidth - el.clientWidth}`)
      .slice(0, 6);
    return {
      text,
      crashed: Boolean(document.querySelector("[data-harness-error]")),
      soMounted: Boolean(so),
      selectedView: document.querySelector('.so-subnav [role="tab"][aria-selected="true"]')?.textContent.trim() ?? null,
      tabs: [...document.querySelectorAll(".campaigns-tabs button")].map((b) => b.textContent.trim()),
      hDoc: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      hScroll: Boolean(scroll && scroll.scrollWidth > scroll.clientWidth + 1),
      childOverflow,
      vOverflow: vBy,
      clientH: scroll ? scroll.clientHeight : 0,
      scrollH: scroll ? scroll.scrollHeight : 0,
      ladderCols: document.querySelectorAll(".so-ladder .so-lad-col").length,
      pulseTiles: document.querySelectorAll(".so-pulse .so-pl").length,
      forkedPills: document.querySelectorAll(".so .so-pill").length,
      // truth spot-reads
      hasReceivedUnknown: /Actual received/.test(text),
      hasModelBanner: /This is a model\./.test(text),
      hasContractPending: /Contract pending/.test(text),
      dollarZero: /\$0\b/.test(text),
      pageDollarZero: /\$0\b/.test(document.body.textContent ?? ""),
    };
  });
}

/** Hide the reviewer chrome and burn a measured label so a pasted frame can never be mislabelled. */
async function shoot(page, file, label) {
  await page.evaluate((text) => {
    document.querySelectorAll("[data-harness-chrome]").forEach((el) => { el.style.display = "none"; });
    let el = document.querySelector("[data-drive-label]");
    if (!el) { el = document.createElement("div"); el.setAttribute("data-drive-label", ""); document.body.appendChild(el); }
    el.textContent = text;
    Object.assign(el.style, {
      position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "2147483647",
      background: "repeating-linear-gradient(45deg,#3a2a10,#3a2a10 12px,#2c2010 12px,#2c2010 24px)",
      color: "#fff", font: "700 10px/22px ui-monospace,monospace", letterSpacing: ".05em",
      textAlign: "center", textTransform: "uppercase", pointerEvents: "none",
    });
  }, label);
  await page.waitForTimeout(60);
  await page.screenshot({ path: file });
  await page.evaluate(() => {
    document.querySelectorAll("[data-harness-chrome]").forEach((el) => { el.style.display = ""; });
    const el = document.querySelector("[data-drive-label]"); if (el) el.remove();
  });
}

async function main() {
  await assertPortFree();
  fs.mkdirSync(OUT, { recursive: true });

  const vite = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js", "--config",
    "scripts/live-drive/harness/sales-mount/vite.config.ts", "--port", String(PORT), "--strictPort",
  ], { cwd: REPO, stdio: "ignore", detached: true });

  const { chromium } = await resolvePlaywright();
  let browser;
  try {
    const probeOnce = () => new Promise((resolve) => {
      const req = http.get({ host: "127.0.0.1", port: PORT, path: "/", timeout: 1000 }, (res) => {
        res.resume(); resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
    });
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) { ready = await probeOnce(); if (!ready) await new Promise((r) => setTimeout(r, 500)); }
    if (!ready) throw new Error(`Harness server did not start on 127.0.0.1:${PORT}.`);

    browser = await chromium.launch(buildLaunchOptions());

    // Warm the transform pipeline once, unmeasured.
    const warm = await browser.newContext();
    const warmPage = await warm.newPage();
    await open(warmPage);
    await settle(warmPage);
    await warm.close();

    // ============================ PASS 1 — FORM-FIT across the full matrix ============================
    // Densest realistic state (evidence pipeline + populated terms + declared processor), all four
    // views, every real column width, both themes. This is the form-fit evidence (criterion #1).
    for (const theme of ["light", "dark"]) {
      for (const frame of FRAMES) {
        const ctx = await browser.newContext({ viewport: { width: frame.width, height: frame.height } });
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(String(e.message)));
        await open(page);
        if (theme === "dark") { await clickControl(page, "[data-theme-toggle]"); await settle(page); }
        await clickData(page, "campaigns", "evidence");
        await clickData(page, "agreements", "populated");
        await clickData(page, "mode", "populated");
        await settle(page);

        for (const [view, label] of VIEWS) {
          await gotoView(page, view);
          await settle(page);
          const m = await measure(page);
          const id = `${theme}/${frame.name}/${view}`;
          check(!m.crashed, `${id}: renders without crashing`);
          check(pageErrors.length === 0, `${id}: no page errors`, pageErrors.join(" | "));
          check(m.soMounted, `${id}: desk mounted`);
          check(m.selectedView === label, `${id}: sub-nav selects "${label}"`, `got ${m.selectedView}`);
          check(m.tabs.join("|") === "Overview|Catalog|Sales|Pipeline|Social|Performance",
            `${id}: six-tab Campaigns lock intact`, m.tabs.join("|"));
          // HARD: no horizontal scroll anywhere (no nested-scroll Sales experience).
          check(!m.hDoc, `${id}: no document horizontal scroll`);
          check(!m.hScroll, `${id}: content column does not scroll horizontally`);
          check(m.childOverflow.length === 0, `${id}: no child overflows its box`, m.childOverflow.join(" | "));
          check(m.forkedPills === 0, `${id}: no forked pill class`);
          // MEASUREMENT (not a gate): vertical fit of the shell scroll owner.
          fitTable.push({ theme, frame: frame.name, view, note: frame.note,
            w: frame.width, h: frame.height, clientH: m.clientH, scrollH: m.scrollH,
            vOverflow: m.vOverflow, fits: m.vOverflow <= 8, hScroll: m.hScroll || m.hDoc });
          await shoot(page, path.join(OUT, `fit-${theme}-${frame.name}-${view}.png`),
            `harness · not live   ${frame.note}   ${theme}   col ${frame.width}px   ${label}   ` +
            (m.vOverflow <= 8 ? "FITS" : `scroll +${m.vOverflow}px`) + (m.hScroll || m.hDoc ? "  ⚠HORIZ" : ""));
        }
        await ctx.close();
      }
    }

    // ============================ PASS 2 — REQUIRED STATES (criterion #2) ============================
    // Driven at the representative docked-1366 column (685px) and the tightest column (439px), both
    // themes, so each state is actually rendered and inspected — not generalised from one frame.
    for (const theme of ["light", "dark"]) {
      for (const frame of [FRAMES[2], FRAMES[3]]) { // 685 docked, 439 expanded
        const ctx = await browser.newContext({ viewport: { width: frame.width, height: frame.height } });
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(String(e.message)));
        await open(page);
        if (theme === "dark") { await clickControl(page, "[data-theme-toggle]"); await settle(page); }
        const tag = `${theme}/${frame.name}`;

        // — Command · FIRST USE (no terms, no processor): payment-path unavailable state.
        await clickData(page, "campaigns", "sparse");
        await clickData(page, "agreements", "none");
        await clickData(page, "mode", "first-use");
        await gotoView(page, "command");
        await settle(page);
        let m = await measure(page);
        check(!m.crashed && m.soMounted, `${tag}: command first-use renders`);
        check(m.hasReceivedUnknown, `${tag}: Actual-received tile present at first use`);
        check(!m.pageDollarZero, `${tag}: no $0 shown for an unrecorded amount (first use)`);
        check(!m.hScroll && !m.hDoc, `${tag}: command first-use no horizontal scroll`);
        await shoot(page, path.join(OUT, `state-command-first-use-${tag.replace("/", "-")}.png`),
          `harness · not live   ${frame.note}   ${theme}   Command · first use`);

        // — Command · POPULATED (evidence pipeline + terms + processor): Contract-pending unavailable.
        await clickData(page, "campaigns", "evidence");
        await clickData(page, "agreements", "populated");
        await clickData(page, "mode", "populated");
        await settle(page);
        m = await measure(page);
        check(m.ladderCols === 6, `${tag}: readiness ladder shows six stages`, `n=${m.ladderCols}`);
        check(m.pulseTiles === 5, `${tag}: commercial pulse shows five tiles`, `n=${m.pulseTiles}`);
        check(m.hasContractPending, `${tag}: Contract-pending stage present (as unavailable)`);
        check(!m.pageDollarZero, `${tag}: no $0 in the populated command view`);
        await shoot(page, path.join(OUT, `state-command-populated-${tag.replace("/", "-")}.png`),
          `harness · not live   ${frame.note}   ${theme}   Command · populated`);

        // — Revenue · Actual received unavailable + Contracted + renewals.
        await gotoView(page, "revenue");
        await settle(page);
        m = await measure(page);
        check(/Actual received/.test(m.text), `${tag}: revenue names Actual received`);
        check(/Contracted value on record/.test(m.text), `${tag}: revenue shows Contracted value on record`);
        check(/Renewals/.test(m.text), `${tag}: revenue shows renewals`);
        check(!/\bcharged\b|\bcollected\b|\bsettled\b/i.test(
          m.text.replace(/charged, collected, or settled/gi, "")),
          `${tag}: revenue implies no money movement`);
        check(!m.hScroll && !m.hDoc, `${tag}: revenue no horizontal scroll`);
        await shoot(page, path.join(OUT, `state-revenue-${tag.replace("/", "-")}.png`),
          `harness · not live   ${frame.note}   ${theme}   Revenue & Collections`);

        // — Scenarios · EVIDENCE path (closed history present) + model banner + never-writes.
        await gotoView(page, "scenarios");
        await settle(page);
        m = await measure(page);
        check(/This is a model\./.test(m.text), `${tag}: scenarios state they are a model`);
        check(!m.hScroll && !m.hDoc, `${tag}: scenarios no horizontal scroll`);
        const saveDisabled = await page.evaluate(() => {
          const b = [...document.querySelectorAll(".so-lab button")].find((x) => /Save scenario/.test(x.textContent));
          return b ? b.disabled : null;
        });
        check(saveDisabled === true, `${tag}: Save-scenario is disabled (no scenario store — never writes)`);
        await shoot(page, path.join(OUT, `state-scenarios-evidence-${tag.replace("/", "-")}.png`),
          `harness · not live   ${frame.note}   ${theme}   Scenarios · evidence`);

        // — Scenarios · NO-EVIDENCE (sparse pipeline): evidence path refuses, banner shown.
        await clickData(page, "campaigns", "sparse");
        await settle(page);
        m = await measure(page);
        check(/No historical evidence yet/.test(m.text), `${tag}: scenarios report no evidence when the pipeline has none`);
        await shoot(page, path.join(OUT, `state-scenarios-noevidence-${tag.replace("/", "-")}.png`),
          `harness · not live   ${frame.note}   ${theme}   Scenarios · no evidence`);

        // — Terms · READ FAILURE (unknown, never empty).
        await gotoView(page, "terms");
        await clickData(page, "agreements", "error");
        await settle(page);
        m = await measure(page);
        check(/could not be read|unknown rather than empty/i.test(m.text),
          `${tag}: a failed terms read is unknown, not empty`);
        await shoot(page, path.join(OUT, `state-terms-error-${tag.replace("/", "-")}.png`),
          `harness · not live   ${frame.note}   ${theme}   Terms · read failure`);

        // — Terms · DENIED (member, read-only): told who may, no dead control.
        await clickData(page, "agreements", "readonly");
        await settle(page);
        m = await measure(page);
        check(/owner or admin/i.test(m.text), `${tag}: a read-only caller is told who may record terms`);
        await shoot(page, path.join(OUT, `state-terms-readonly-${tag.replace("/", "-")}.png`),
          `harness · not live   ${frame.note}   ${theme}   Terms · read-only`);

        // — Terms · UNREADABLE (RLS filters all): says so, not "none".
        await clickData(page, "agreements", "unreadable");
        await settle(page);
        m = await measure(page);
        check(/not readable at your access level/i.test(m.text),
          `${tag}: an unreadable terms list says so rather than showing zero`);
        await shoot(page, path.join(OUT, `state-terms-unreadable-${tag.replace("/", "-")}.png`),
          `harness · not live   ${frame.note}   ${theme}   Terms · unreadable`);

        // — Terms · editor OPEN then CANCEL (abandon path).
        await clickData(page, "agreements", "populated");
        await settle(page);
        await page.click("button:has-text('Record terms')").catch(() => {});
        await page.waitForTimeout(140);
        const dlgOpen = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')));
        check(dlgOpen, `${tag}: the terms editor opens as a modal dialog`);
        await shoot(page, path.join(OUT, `state-terms-editor-${tag.replace("/", "-")}.png`),
          `harness · not live   ${frame.note}   ${theme}   Terms · editor open`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(140);
        const dlgClosed = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-modal="true"]'));
        check(dlgClosed, `${tag}: Escape abandons the editor`);

        check(pageErrors.length === 0, `${tag}: states pass raised no page errors`, pageErrors.join(" | "));
        await ctx.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await stopTree(vite);
  }

  // ── FORM-FIT MEASUREMENT TABLE (handed over, not judged — §00) ─────────────────────────────────
  console.log("\nFORM-FIT — vertical fit of the Solo content column (scrollH/clientH), horizontal must be 0:");
  console.log("theme  column                         view       col×h        client  scroll  Δ      verdict");
  for (const r of fitTable) {
    const verdict = (r.hScroll ? "HORIZ-OVERFLOW" : r.fits ? "fits" : `scroll +${r.vOverflow}px`);
    console.log(
      `${r.theme.padEnd(6)} ${r.frame.padEnd(18)} ${r.view.padEnd(10)} ${String(r.w + "×" + r.h).padEnd(11)} ` +
      `${String(r.clientH).padEnd(7)} ${String(r.scrollH).padEnd(7)} ${String(r.vOverflow).padEnd(6)} ${verdict}`,
    );
  }
  const horiz = fitTable.filter((r) => r.hScroll);
  const scrolled = fitTable.filter((r) => !r.fits && !r.hScroll);
  console.log(`\nhorizontal overflow: ${horiz.length} (must be 0) · vertical scroll: ${scrolled.length}/${fitTable.length} column states`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`frames written to ${OUT}`);
  fs.writeFileSync(path.join(OUT, "fit-table.json"), JSON.stringify({ fitTable, checks: results }, null, 2));
  if (failed.length) {
    console.log(`\n${failed.length} FAILED:`);
    for (const f of failed) console.log(`  ${f.name}  ${f.detail}`);
    process.exit(1);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
