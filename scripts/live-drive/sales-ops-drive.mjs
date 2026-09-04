#!/usr/bin/env node
// Render Campaigns → Sales and check what it actually SHOWS.
//
// WHAT THIS PROVES AND WHAT IT DOES NOT. It renders the REAL `SalesOps`, `Sales` and `GrowthHub`
// with only the network reads stubbed, so it proves the rendered states, the copy, the geometry at
// four widths, both palettes, the contrast of every text pair, and the truth rules (no fabricated
// commerce data, no `$0` for an unrecorded amount, an unread thing never called empty). It does NOT
// prove the authenticated production surface: §32.c stays owed to a session that can reach the
// deployed app, and this harness must never be reported as having discharged it.
//
// WHY IT EXISTS AT ALL. The first version of this slice reported "this session holds no browser
// tool" and skipped rendered evidence entirely. That was FALSE — `npm run harness:selftest` launches
// real Chromium here and passes every falsifiability arm, including the contrast arm that catches
// exactly the sub-AA pair an independent review then found in this surface's own pill fork. The
// claim was corrected and this drive is what replaces it.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { buildLaunchOptions, resolvePlaywright } from "./live-drive.mjs";

const PORT = Number(process.env.SALES_PROOF_PORT || 5213);
const URL = `http://127.0.0.1:${PORT}/`;
const OUT = path.resolve(import.meta.dirname, "artifacts/sales-ops");
const REPO = path.resolve(import.meta.dirname, "../..");

// The four widths every Solo surface is proved at.
const FRAMES = [
  { name: "1536x770", width: 1536, height: 770 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "900x1000", width: 900, height: 1000 },
];

const results = [];
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
  // SIGTERM alone is not enough: vite outlives it and keeps holding --strictPort, so the run AFTER
  // a successful one dies with "Port already in use". A drive that cannot be run twice is not
  // reproducible evidence, whatever it printed the first time.
  for (let i = 0; i < 20 && !gone(); i++) await new Promise((r) => setTimeout(r, 100));
  if (!gone()) {
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* raced with exit */ }
    try { process.kill(child.pid, "SIGKILL"); } catch { /* raced with exit */ }
  }
}

// Wait for THE SURFACE, never for network idleness — the harness pulls a Google Fonts stylesheet
// this sandbox cannot route to, so an idle wait is set by an unreachable third party.
async function open(page) {
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main.paige-solo", { timeout: 30000 });
}

/** `.paige-solo` transitions `background` over 300ms; measuring early reads a mid-fade grey. */
async function settle(page) { await page.waitForTimeout(420); }

async function setMode(page, mode) {
  await page.click(`[data-mode="${mode}"]`);
  await page.waitForTimeout(90);
}

/** Everything the assertions need, read from the live DOM in one pass. */
async function measure(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.paige-solo");
    const scroll = document.querySelector(".campaigns-scroll");
    const text = main?.textContent ?? "";

    const srgb = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
    const parse = (s) => { const c=document.createElement("canvas"); c.width=c.height=1; const x=c.getContext("2d"); x.fillStyle=s; x.fillRect(0,0,1,1); return [...x.getImageData(0,0,1,1).data].slice(0,3); };
    const groundOf = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        const a = Number((bg.match(/[\d.]+/g) ?? [])[3] ?? 1);
        if (a > 0.5 && bg !== "rgba(0, 0, 0, 0)") return parse(bg);
      }
      return [255, 255, 255];
    };
    // Every text-bearing leaf inside the surface, with its measured ratio against its own ground.
    const pairs = [...document.querySelectorAll(".campaigns-surface *")]
      .filter((el) => el.children.length === 0 && (el.textContent ?? "").trim().length > 1)
      .map((el) => {
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") return null;
        const fg = parse(cs.color);
        const bg = groundOf(el);
        const [hi, lo] = lum(fg) > lum(bg) ? [lum(fg), lum(bg)] : [lum(bg), lum(fg)];
        const ratio = (hi + 0.05) / (lo + 0.05);
        const px = parseFloat(cs.fontSize);
        const weight = Number(cs.fontWeight) || 400;
        // AA: 3.0 for large text (>=24px, or >=18.66px bold), 4.5 otherwise.
        const floor = px >= 24 || (px >= 18.66 && weight >= 700) ? 3.0 : 4.5;
        return { salesOwned: Boolean(el.closest(".so")), text: (el.textContent ?? "").trim().slice(0, 40), ratio: Number(ratio.toFixed(2)), px, floor };
      })
      .filter(Boolean);

    return {
      text,
      crashed: Boolean(document.querySelector("[data-harness-error]")),
      surface: Boolean(document.querySelector(".campaigns-surface")),
      tabs: [...document.querySelectorAll(".campaigns-tabs button")].map((b) => b.textContent.trim()),
      selectedTab: document.querySelector('.campaigns-tabs button[aria-selected="true"]')?.textContent.trim() ?? null,
      headings: [...document.querySelectorAll(".campaigns-surface h1,.campaigns-surface h2,.campaigns-surface h3")]
        .map((h) => h.textContent.trim()),
      pills: [...document.querySelectorAll(".campaigns-surface .pill")].map((p) => p.textContent.trim()),
      forkedPills: document.querySelectorAll(".so-pill").length,
      readyRows: document.querySelectorAll(".so-ready-row").length,
      offerRows: document.querySelectorAll("button.so-row").length,
      horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        || Boolean(scroll && scroll.scrollWidth > scroll.clientWidth + 1),
      overflowing: [...document.querySelectorAll(".campaigns-surface *")]
        .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible").length,
      subAA: pairs.filter((p) => p.ratio < p.floor),
      dialogOpen: Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
      inertBackground: Boolean(document.querySelector(".solo-campaigns > .campaigns-scroll[inert]")),
    };
  });
}

/**
 * INHERITED vs NOVEL contrast, and why this drive distinguishes them.
 *
 * §00 gives Claude Code zero input on design; colour is Claude Design's. But a measurement is not
 * an opinion — a ratio is a fact about whether the thing WORKS, and reporting it is CC's job while
 * deciding what to do about it is CD's. Every pair below is one this surface INHERITED rather than
 * chose:
 *
 *   --ink-3 on --canvas at 11.5-12px   4.15:1 light · 4.36:1 dark   also `.co-summary`,
 *                                      `.co-price small` and `.co-shape` on the live sibling tab
 *   .pill-n  (--ink-3 on --surface-sunk)          3.58:1   shared primitive, platform-wide
 *   .pill-warn (--warn on --warn-tint)            3.54:1   shared primitive, platform-wide
 *   .campaigns-truth--unavailable                 3.58:1   `solo-campaigns.css`, every Campaigns tab
 *
 * Changing any of them here would be a design decision AND would leave this surface inconsistent
 * with its siblings. So the gate asserts the thing this slice can honestly own — that it introduces
 * no pair WORSE than what it inherited — and the inherited ratios are printed as a measurement
 * handed over rather than swallowed.
 */
const INHERITED_FLOOR = 3.5;
const novel = (pairs) => pairs.filter((p) => p.salesOwned || p.ratio < INHERITED_FLOOR);
const inherited = new Map();
function recordInherited(id, pairs) {
  for (const p of pairs) {
    const key = `${p.ratio}:1 @${p.px}px`;
    if (!inherited.has(key)) inherited.set(key, { ...p, where: id });
  }
}

/**
 * THE ACT, WHILE YOU ARE POINTING AT IT.
 *
 * The resting contrast sweep never sees a hover state, so a hover rule that destroys the label is
 * invisible to it. This surface shipped one: hover moved the ground to `--violet-2`, which is
 * LIGHTER than `--violet` in both palettes, against a label fixed at white — 4.43:1 in light and
 * 2.57:1 in dark, on the buttons that record a payment processor and create an offer. Measured
 * here so it cannot come back.
 */
async function actHoverContrast(page) {
  const buttons = await page.$$(".so .btn-p");
  const out = [];
  for (const button of buttons) {
    await button.hover();
    await page.waitForTimeout(60);
    out.push(await button.evaluate((el) => {
      const style = getComputedStyle(el);
      const parse = (value) => { const c=document.createElement("canvas"); c.width=c.height=1; const x=c.getContext("2d"); x.fillStyle=value; x.fillRect(0,0,1,1); return [...x.getImageData(0,0,1,1).data].slice(0,3); };
      const lum = (rgb) => {
        const [r, g, b] = rgb.map((c) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      // Walk to the first non-transparent ground, exactly as the resting sweep does.
      let node = el, bg = null;
      while (node && !bg) {
        const value = getComputedStyle(node).backgroundColor;
        if (value && !/rgba\(0, 0, 0, 0\)|transparent/.test(value)) bg = parse(value);
        node = node.parentElement;
      }
      if (!bg) return null;
      const fg = parse(style.color);
      const lf = lum(fg), lg = lum(bg);
      const ratio = (Math.max(lf, lg) + 0.05) / (Math.min(lf, lg) + 0.05);
      return {
        label: el.textContent.trim().slice(0, 22),
        size: parseFloat(style.fontSize),
        ratio: Number(ratio.toFixed(2)),
      };
    }));
  }
  return out.filter(Boolean);
}


async function proveDrawerInteractions(page, id) {
  const panels = [
    ["quick-offer", "Quick offer", async d => d.getByRole("textbox", { name: "Name", exact: true }).fill("Unsaved review")],
    ["payment-handling", "Record it", async d => d.getByRole("button", { name: "Stripe", exact: true }).click()],
    ["commercial-terms", "Record terms", async d => d.getByRole("textbox", { name: "Notes (optional)" }).fill("Unsaved review")],
  ];
  for (const [panel, label, edit] of panels) {
    console.log(`INTERACTION ${id}/${panel}`);
    const opener = page.getByRole("button", { name: label, exact: true }).first();
    for (const exit of ["X", "Cancel", "Escape", "Back"]) {
      await opener.focus(); await opener.click();
      const d = page.locator("aside.so-editor"); await d.waitFor();
      check(new globalThis.URL(page.url()).search === `?panel=${panel}`, `${id}/${panel}: push URL`);
      check(await d.evaluate(el => !el.closest("[inert]")), `${id}/${panel}: drawer is outside inert ancestry`);
      check(await page.locator(".campaigns-scroll").evaluate(el => el.inert), `${id}/${panel}: background is inert`);
      check(await d.evaluate(el=>el.contains(document.activeElement)), `${id}/${panel}: focus enters`);
      check(await d.locator(".so-pick button").evaluateAll(nodes=>nodes.every(el=>parseFloat(getComputedStyle(el).borderTopWidth)>0)), `${id}/${panel}: choices have visible borders`);
      const bounds = await d.boundingBox();
      check(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.y + bounds.height <= page.viewportSize().height + 1, `${id}/${panel}: drawer fits viewport`);
      check(await d.locator(".so-editor-body").evaluate(el=>["auto","scroll"].includes(getComputedStyle(el).overflowY)), `${id}/${panel}: drawer body owns scrolling`);
      const enabled = d.locator('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])');
      await enabled.last().focus(); await page.keyboard.press("Tab");
      check(await d.evaluate(el=>el.contains(document.activeElement)), `${id}/${panel}: forward focus trap`);
      await enabled.first().focus(); await page.keyboard.press("Shift+Tab");
      check(await d.evaluate(el=>el.contains(document.activeElement)), `${id}/${panel}: backward focus trap`);
      if (exit === "X") await d.getByRole("button", { name: "Close", exact: true }).click();
      if (exit === "Cancel") await d.getByRole("button", { name: "Cancel", exact: true }).click();
      if (exit === "Escape") await page.keyboard.press("Escape");
      if (exit === "Back") await page.goBack();
      await d.waitFor({ state: "detached" });
      check(new globalThis.URL(page.url()).search === "", `${id}/${panel}: ${exit} returns to base`);
      check(await opener.evaluate(el=>el===document.activeElement), `${id}/${panel}: ${exit} restores focus`);
    }
    await opener.click(); let d = page.locator("aside.so-editor"); await edit(d);
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
    await d.getByRole("button", { name: "Continue editing", exact: true }).click();
    check(await d.count() === 1, `${id}/${panel}: continue editing retains drawer`);
    await page.goBack();
    await d.getByRole("button", { name: "Continue editing", exact: true }).click();
    check(await d.evaluate(el=>el.contains(document.activeElement)), `${id}/${panel}: Continue after Back restores focus`);
    await page.goBack();
    await d.getByRole("button", { name: "Discard changes", exact: true }).waitFor();
    await page.goBack();
    await d.getByRole("button", { name: "Discard changes", exact: true }).click();
    await d.waitFor({ state: "detached" });
    await opener.click(); d = page.locator("aside.so-editor");
    check(!(await d.locator("input").evaluateAll(nodes=>nodes.some(n=>n.value==="Unsaved review"))), `${id}/${panel}: discarded values are not saved`);
    await d.getByRole("button", { name: "Cancel", exact: true }).click();
    // The precise inert assertion must reject the known defect, not merely check aria-modal.
    await opener.click(); d=page.locator("aside.so-editor");
    await page.locator(".campaigns-overlays").evaluate(el=>el.setAttribute("inert",""));
    check(!(await d.evaluate(el=>!el.closest("[inert]"))), `${id}/${panel}: negative inert control detected`);
    let blocked=false; try { await d.getByRole("button",{name:"Cancel",exact:true}).click({timeout:500}); } catch { blocked=true; }
    check(blocked, `${id}/${panel}: negative inert control blocks actual pointer action`);
    await page.locator(".campaigns-overlays").evaluate(el=>el.removeAttribute("inert"));
    await d.getByRole("button",{name:"Cancel",exact:true}).click();
    await page.goto(`${URL}solo/review/growth/sales?panel=${panel}`, {waitUntil:"domcontentloaded"});
    await page.locator("aside.so-editor").waitFor();
    await page.locator("aside.so-editor").getByRole("button",{name:"Cancel",exact:true}).click();
    check(new globalThis.URL(page.url()).pathname.endsWith("/growth/sales") && new globalThis.URL(page.url()).search==="", `${id}/${panel}: direct URL closes safely`);
    await opener.click(); d=page.locator("aside.so-editor"); await edit(d);
    // Reviewer controls are outside the product frame; invoke the real fixture tenant transition.
    await page.locator("[data-switch-workspace]").evaluate(el=>el.click());
    await d.waitFor({state:"detached"});
    check(new globalThis.URL(page.url()).search==="", `${id}/${panel}: tenant switch strips route`);
    check(await page.locator(".so-discard").count()===0, `${id}/${panel}: tenant switch drops previous draft and confirmation`);
  }
  await page.goto(`${URL}solo/review/growth/sales?panel=unknown&client=must-not-survive`,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.location.search==="");
  check(await page.locator("aside.so-editor").count()===0, `${id}: invalid panel normalizes to base`);
  await page.getByRole("button",{name:"Quick offer",exact:true}).click();
  await page.locator("aside.so-editor").getByRole("textbox",{name:"Name",exact:true}).fill("Canonical draft review");
  await page.locator("aside.so-editor").getByRole("button",{name:"Create offer",exact:true}).click();
  await page.getByRole("button",{name:"Return to Sales",exact:true}).waitFor();
  check(new globalThis.URL(page.url()).pathname.endsWith("/growth/catalog"), `${id}: Quick Offer continues in canonical Catalog`);
  await page.getByRole("button",{name:"Return to Sales",exact:true}).click();
  await page.locator("aside.so-editor").waitFor();
  check(new globalThis.URL(page.url()).search==="?panel=quick-offer", `${id}: Catalog returns to safe originating panel`);
  await page.locator("aside.so-editor").getByRole("textbox",{name:"Name",exact:true}).fill("Returned unsaved draft");
  await page.goBack();
  await page.getByRole("button",{name:"Discard changes",exact:true}).click();
  check(new globalThis.URL(page.url()).pathname.endsWith("/growth/sales"), `${id}: Catalog-return dirty Back stays in Sales`);
}

async function proveCanonicalClientReturn(browser) {
  const ctx = await browser.newContext({viewport:{width:1366,height:768},reducedMotion:"reduce"});
  const page = await ctx.newPage(); page.setDefaultTimeout(7000); page.setDefaultNavigationTimeout(20000);
  const start = async mode => {
    await open(page);
    await page.locator('[data-agreements="no-clients"]').click();
    await page.locator(`[data-client-mode="${mode}"]`).click();
    await page.getByRole("button",{name:"Record terms",exact:true}).click();
    await page.getByRole("button",{name:"Create client",exact:true}).click();
    await page.locator('[data-contact-editor]').waitFor();
  };
  const submit = async name => {
    await page.getByLabel("First name",{exact:true}).fill(name);
    await page.getByRole("tab",{name:/Relationship & consent/}).click();
    await page.getByRole("button",{name:"Create contact",exact:true}).click();
  };
  try {
    console.log("INTERACTION canonical Client creation and return");
    await start("success");
    await page.getByRole("button",{name:"Cancel",exact:true}).click();
    await page.locator("aside.so-editor").waitFor();
    check(await page.getByRole("combobox",{name:"Client",exact:true}).inputValue()==="", "Client cancellation returns without selection");
    await page.locator("aside.so-editor").getByRole("button",{name:"Cancel",exact:true}).click();
    await start("failure"); await submit("Canonical retry review");
    await page.getByText("Client could not be saved. Try again.").first().waitFor();
    check(await page.locator('[data-contact-editor]').count()===1, "Client failure remains editable with retry");
    await page.locator('[data-client-mode="success"]').evaluate(el=>el.click());
    await page.getByRole("button",{name:"Create contact",exact:true}).click();
    await page.locator("aside.so-editor").waitFor();
    check(await page.getByRole("combobox",{name:"Client",exact:true}).inputValue()==="review-client-1", "Canonical created client reauthorized and selected on Sales return");
    check(new globalThis.URL(page.url()).search==="?panel=commercial-terms", "Client return URL contains only allowed panel");
    check(await page.getByRole("combobox",{name:"Client",exact:true}).locator("option:checked").textContent()==="Canonical retry review", "Returned selection names the canonical source record");
    await page.locator("aside.so-editor").getByRole("button",{name:"Cancel",exact:true}).click();
    if(await page.getByRole("button",{name:"Discard changes",exact:true}).count()) await page.getByRole("button",{name:"Discard changes",exact:true}).click();
    for (const outcome of ["success","failure"]) {
      await start(`delayed-${outcome}`); await submit("Workspace A pending client");
      await page.locator('[data-switch-workspace]').evaluate(el=>el.click());
      await page.locator('[data-contact-editor]').waitFor({state:"detached"});
      await page.locator('[data-client-finish]').evaluate(el=>el.click());
      await page.waitForTimeout(150);
      check(await page.locator('[data-sonner-toast]').count()===0, `Client delayed ${outcome}: no old-workspace toast`);
      check(!(await page.locator('main').innerText()).includes("Workspace A pending client"), `Client delayed ${outcome}: no old-workspace selection`);
      check(await page.locator('[data-contact-editor]').count()===0, `Client delayed ${outcome}: no stale editor/pending state`);
      await page.locator('[data-switch-workspace]').evaluate(el=>el.click());
      check((await page.locator('main').innerText()).includes("Workspace A pending client") === (outcome==="success"), `Client delayed ${outcome}: return A reads canonical result`);
      check(await page.locator('[data-contact-editor]').count()===0, `Client delayed ${outcome}: return A never resurrects draft`);
    }
  } finally { await ctx.close(); }
}

async function main() {
  await assertPortFree();
  fs.mkdirSync(OUT, { recursive: true });

  const vite = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js", "--config",
    "scripts/live-drive/harness/sales-mount/vite.config.ts", "--port", String(PORT), "--strictPort",
  ], { cwd: REPO, stdio: "ignore", detached: true, windowsHide: true });

  const { chromium } = await resolvePlaywright();
  let browser;
  try {
    // Probed with node:http, NOT fetch. `fetch` honours HTTPS_PROXY, so against a local address it
    // can return a 200 relay page from the agent proxy while nothing is listening on 127.0.0.1 at
    // all — a readiness check a proxy can satisfy is not a readiness check.
    const probeOnce = () => new Promise((resolve) => {
      const req = http.get({ host: "127.0.0.1", port: PORT, path: "/", timeout: 1000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
    });
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      ready = await probeOnce();
      if (!ready) await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) throw new Error(`Harness server did not start on 127.0.0.1:${PORT}.`);

    browser = await chromium.launch(buildLaunchOptions());

    // Warm the transform pipeline once, unmeasured — vite optimises dependencies on the first real
    // page load and can drop in-flight requests while it does.
    const warm = await browser.newContext();
    const warmPage = await warm.newPage();
    await open(warmPage);
    await settle(warmPage);
    await warm.close();

    if (process.env.SALES_PROOF_HOVER_ONLY !== "1") await proveCanonicalClientReturn(browser);
    for (const theme of ["light", "dark"]) {
      for (const frame of FRAMES) {
        const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: frame.width, height: frame.height } });
        const page = await ctx.newPage();
        page.setDefaultTimeout(5000); page.setDefaultNavigationTimeout(15000);
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(String(e.message)));
        await open(page);
        if (await page.locator("main.paige-solo").getAttribute("data-theme") !== theme) { await page.click("[data-theme-toggle]"); await settle(page); }
        const id = `${theme}/${frame.name}`;

        if (process.env.SALES_PROOF_HOVER_ONLY === "1") {
          await setMode(page, "declared");
          const hover = await actHoverContrast(page);
          check(hover.length > 0 && hover.every(p=>p.ratio >= 4.5), `${id}: Sales hover contrast`, JSON.stringify(hover));
          await ctx.close(); continue;
        }
        await proveDrawerInteractions(page, id);
        if (await page.locator("main.paige-solo").getAttribute("data-theme") !== theme) { await page.click("[data-theme-toggle]"); await settle(page); }

        // ── 1. FIRST USE — the state every workspace sees before it records anything.
        const first = await measure(page);
        check(!first.crashed, `${id}: renders without crashing`);
        check(pageErrors.length === 0, `${id}: no page errors`, pageErrors.join(" | "));
        check(first.surface, `${id}: campaigns surface mounted`);
        check(first.selectedTab === "Sales", `${id}: Sales is the selected tab`);
        check(first.tabs.join("|") === "Overview|Catalog|Sales|Pipeline|Social|Performance",
          `${id}: six-tab lock intact`, first.tabs.join("|"));
        check(first.readyRows === 5, `${id}: five readiness answers render`, `n=${first.readyRows}`);
        check(/Not recorded yet\. Paige never holds this money/.test(first.text),
          `${id}: unrecorded payment handling says so, and states the boundary`);
        // The next step names a real ACT on this screen, never "get started". Which act depends on
        // what is recorded — this harness always has offers, so the act is the payment declaration.
        check(/Next\s*Record how your clients pay you/.test(first.text.replace(/\s+/g, " ")),
          `${id}: the next step names a real act`);
        check(!first.horizontal, `${id}: no horizontal scroll`);
        check(first.overflowing === 0, `${id}: no child overflows its container`, `n=${first.overflowing}`);

        // §58 — the two things that shipped before this surface, rendered, not merely imported.
        check(!/Billing your own clients/.test(first.text), `${id}: redundant billing banner is removed`);
        check(/never the merchant of record/.test(first.text), `${id}: the money boundary is stated`);
        check(/Routed capture activity/.test(first.text), `${id}: routed capture survives`);
        check(/Discovery intake form/.test(first.text), `${id}: the routed submission still renders`);

        // Headings, not bold text: before this surface the tab had ONE h2.
        for (const h of ["Where this business stands", "What you sell", "Commercial activity", "Routed capture activity"]) {
          check(first.headings.includes(h), `${id}: "${h}" is a real heading`, first.headings.join(" | "));
        }
        // The shared pill primitive, never a local fork (§11) — and the fork was also sub-AA.
        check(first.forkedPills === 0, `${id}: no forked pill class`, `n=${first.forkedPills}`);
        check(first.pills.length > 0, `${id}: state pills render through the shared primitive`);
        check(novel(first.subAA).length === 0, `${id}: introduces no sub-AA pair of its own`,
          novel(first.subAA).map((p) => `"${p.text}" ${p.ratio}:1 <${p.floor}`).join(" | "));
        recordInherited(id, first.subAA);
        await page.screenshot({ path: path.join(OUT, `first-use-${theme}-${frame.name}.png`), fullPage: true });

        // ── 2. POPULATED — declared processor, offers, recorded payments.
        await setMode(page, "populated");
        const pop = await measure(page);
        check(/PayPal/.test(pop.text), `${id}: the declared processor reads as words`);
        check(!/paypal|bank_merchant|payment_processor_declared/.test(pop.text),
          `${id}: no raw token or column name reaches the person`);
        check(pop.offerRows === 2, `${id}: every offer renders`, `n=${pop.offerRows}`);
        check(/\$2,400/.test(pop.text), `${id}: a recorded price renders`);
        check(!/\$0\b/.test(pop.text), `${id}: no $0 for an unrecorded amount`);
        check(/1 awaiting attention of 3 recent/.test(pop.text), `${id}: readiness counts what waits`);
        check(!/\b(total|forecast|projected)\b/i.test(
          pop.text.replace(/Nothing here is a forecast, a total, or campaign attribution\./g, "")),
          `${id}: no total, forecast or projection is asserted`);
        check(novel(pop.subAA).length === 0, `${id}: populated introduces no sub-AA pair of its own`,
          novel(pop.subAA).map((p) => `"${p.text}" ${p.ratio}:1 <${p.floor}`).join(" | "));
        recordInherited(id, pop.subAA);
        check(!pop.horizontal, `${id}: populated does not overflow`);
        // The sheen must never paint OVER the sentence it marks. It shipped with `inset:0` and no
        // z-index, which took that copy from 7.03:1 to 4.13:1 in dark every time the sweep crossed
        // a word — a harm that exists only mid-animation, so no resting contrast sweep can see it.
        // The stacking invariant is asserted instead: below the text, above the strip's own ground.
        const sheen = await page.evaluate(() => {
          const strip = document.querySelector(".so-next");
          if (!strip) return null;
          const after = getComputedStyle(strip, "::after");
          return {
            zIndex: after.zIndex,
            isolation: getComputedStyle(strip).isolation,
            iterations: after.animationIterationCount,
            seconds: parseFloat(after.animationDuration) + parseFloat(after.animationDelay),
          };
        });
        check(sheen !== null, `${id}: the next-step strip renders`);
        if (sheen) {
          check(sheen.zIndex === "-1" && sheen.isolation === "isolate",
            `${id}: the sheen paints below the text, not over it`,
            `z-index=${sheen.zIndex} isolation=${sheen.isolation}`);
          // WCAG 2.2.2: motion that runs past five seconds needs a pause/stop mechanism. Ending
          // inside five seconds meets it with nothing for anyone to operate.
          check(sheen.iterations === "1" && sheen.seconds <= 5,
            `${id}: the sheen stops on its own inside five seconds`,
            `${sheen.iterations}x over ${sheen.seconds}s`);
        }

        const hovered = await actHoverContrast(page);
        check(hovered.length > 0, `${id}: the primary acts are present to hover`, `n=${hovered.length}`);
        const dimmed = hovered.filter((b) => b.ratio < (b.size >= 18.66 ? 3 : 4.5));
        check(dimmed.length === 0, `${id}: every act stays readable while hovered`,
          dimmed.map((b) => `"${b.label}" ${b.ratio}:1 @${b.size}px`).join(" | ")
            || hovered.map((b) => `${b.ratio}:1`).join(" "));
        await page.screenshot({ path: path.join(OUT, `populated-${theme}-${frame.name}.png`), fullPage: true });

        // ── 2b. CLIENT TERMS — every state the brief names, driven in the rendered surface.
        const setTerms = async (mode) => {
          await page.click(`[data-agreements="${mode}"]`);
          await page.waitForTimeout(90);
        };

        await setTerms("none");
        const termsNone = await measure(page);
        check(/Nothing recorded yet\. Pick a client/.test(termsNone.text),
          `${id}: first use teaches what a term is, rather than showing a bare zero`);
        check(/Recording it bills nobody and sends nothing/.test(termsNone.text),
          `${id}: the terms band states the money boundary`);
        check(!/\b(invoiced|charged|collected)\b/i.test(termsNone.text),
          `${id}: nothing on the terms band implies money moved`);

        await setTerms("no-clients");
        const termsNoClients = await measure(page);
        check(/no clients are recorded in this workspace yet/.test(termsNoClients.text),
          `${id}: a missing prerequisite is named, and points at the surface that fixes it`);

        await setTerms("unreadable");
        const termsUnread = await measure(page);
        check(/not readable at your access level/.test(termsUnread.text),
          `${id}: an unreadable term list says so rather than showing zero`);
        check(/That is different from there being none/.test(termsUnread.text),
          `${id}: unknown is distinguished from none on terms`);
        check(!/Nothing recorded yet\. Pick a client/.test(termsUnread.text),
          `${id}: an unreadable list never renders the first-use teaching copy`);

        await setTerms("populated");
        const termsFull = await measure(page);
        check(/Jordan Avery/.test(termsFull.text), `${id}: a recorded term names its client`);
        check(/\$2,500/.test(termsFull.text), `${id}: the agreed figure renders from minor units`);
        // The catalog snapshot must NOT be mistaken for the agreed figure. The fixture sets them
        // deliberately different, so a surface that conflated them would show the wrong number.
        check(!/\$3,000/.test(termsFull.text),
          `${id}: the catalog snapshot is not shown as what the client agreed`);
        check(/Recurring/.test(termsFull.text) && /monthly/.test(termsFull.text),
          `${id}: the arrangement and its cadence read as words`);
        check(!termsFull.horizontal, `${id}: the terms band does not overflow`);
        check(novel(termsFull.subAA).length === 0, `${id}: terms introduce no sub-AA pair of their own`,
          novel(termsFull.subAA).map((p) => `"${p.text}" ${p.ratio}:1 <${p.floor}`).join(" | "));
        recordInherited(id, termsFull.subAA);
        await page.screenshot({ path: path.join(OUT, `terms-${theme}-${frame.name}.png`), fullPage: true });

        await setTerms("readonly");
        const termsRead = await measure(page);
        check(/An owner or admin records this/.test(termsRead.text),
          `${id}: a caller who may not write is told who may, with no dead control`);

        await setTerms("error");
        const termsErr = await measure(page);
        check(/could not be read, so this is unknown rather than empty/.test(termsErr.text),
          `${id}: a failed terms read is unknown, never empty`);
        await setTerms("none");

        // ── 3. UNREADABLE ACTIVITY — a member whose RLS filters every row. This is the state the
        // original `!error` model could never reach, so it is driven explicitly.
        await setMode(page, "activity-unreadable");
        const unread = await measure(page);
        check(/not readable at your access level/.test(unread.text),
          `${id}: an unread table says so rather than showing zero`);
        check(!/No payments recorded/.test(unread.text),
          `${id}: an unread table is never rendered as "none"`);
        check(/An owner or admin records this/.test(unread.text),
          `${id}: a member is told who may change it, with no dead control`);

        // ── 4. UNKNOWN AUTHORITY is not a refusal.
        await setMode(page, "authority-unknown");
        const auth = await measure(page);
        check(/could not be read/.test(auth.text), `${id}: unknown authority says so`);

        // ── 5. UNRECOGNISED STORED VALUE is named, not coerced to "not stated".
        await setMode(page, "unrecognised-processor");
        const unrec = await measure(page);
        check(/this version cannot read/.test(unrec.text), `${id}: an unreadable stored value is named`);

        // ── 6. THE EDITOR, opened and actually modal.
        await setMode(page, "first-use");
        await page.click("button:has-text('Record it')");
        await page.waitForTimeout(120);
        const open1 = await measure(page);
        check(open1.dialogOpen, `${id}: the payment editor opens as a modal dialog`);
        check(open1.inertBackground, `${id}: the shell behind the scrim is inert`);
        const dialogText = await page.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? "");
        check(/does not connect an account, move/.test(dialogText),
          `${id}: the editor says it is a record, not a connection`);
        await page.screenshot({ path: path.join(OUT, `payment-editor-${theme}-${frame.name}.png`) });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(120);
        const closed = await measure(page);
        check(!closed.dialogOpen, `${id}: Escape closes the editor`);
        check(!closed.inertBackground, `${id}: the shell is released on close`);

        // ── 7. LOAD PHASES stay distinct — an unresolved workspace is never an empty one.
        await setMode(page, "error");
        const err = await measure(page);
        check(/Sales operations could not load/.test(err.text), `${id}: the error state names the noun`);
        check(!/tenant-scoped read/.test(err.text), `${id}: no plumbing vocabulary in visible copy`);
        await setMode(page, "unavailable");
        const un = await measure(page);
        check(/Sales needs a resolved workspace/.test(un.text), `${id}: unavailable is distinct from empty`);

        await ctx.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await stopTree(vite);
  }

  fs.writeFileSync(path.join(OUT,process.env.SALES_PROOF_HOVER_ONLY === "1" ? "hover-results.json" : "interaction-results.json"), JSON.stringify({ evidence:"local Chromium with deterministic adapters", results },null,2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (inherited.size) {
    // Handed over, not judged (§00). These are the platform pairings this surface inherits.
    console.log("\nMEASUREMENT for Claude Design — inherited pairs under 4.5:1, not introduced here:");
    for (const [key, p] of inherited) console.log(`  ${key}  "${p.text}"  (also on the sibling Catalog tab)`);
  }
  console.log(`frames written to ${OUT}`);
  if (failed.length) {
    console.log(`\n${failed.length} FAILED:`);
    for (const f of failed) console.log(`  ${f.name}  ${f.detail}`);
    process.exit(1);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
