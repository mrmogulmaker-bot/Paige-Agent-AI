#!/usr/bin/env node
/**
 * Local rendered proof for Solo Settings → Setup legal sender identity.
 * Uses the shipped Setup component/shell/CSS with the shared synthetic transport.
 * This proves geometry and browser interaction only — never production auth/data.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 5203;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve("scripts/live-drive/artifacts/settings-setup-identity");
const VIEWPORTS = [[1536, 770], [1366, 768], [1024, 768], [900, 1000]];
const THEMES = ["light", "dark"];
const CONTEXTS = [
  { key: "affected", query: "primary", account: "1971670", accountName: "Harness workspace", legalName: "Harness Advisory LLC" },
  { key: "known-good", query: "second", account: "2072681", accountName: "Second harness workspace", legalName: "Second Harness Studio Inc." },
];
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
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
    return;
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch { /* already stopped */ }
}

async function measure(page) {
  return page.evaluate(() => {
    const host = document.querySelector("[data-solo-screen-host]");
    const setup = document.querySelector(".setup-brief");
    const controls = [...document.querySelectorAll(
      ".ss-content button:not([disabled]), .ss-content a[href], .ss-content input:not([disabled]), " +
      ".ss-content select:not([disabled]), .ss-content textarea:not([disabled])",
    )].filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
    const scrollers = [...document.querySelectorAll("*")].filter((el) => {
      const style = getComputedStyle(el);
      return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    });
    return {
      setup: Boolean(setup),
      errors: document.querySelectorAll(".setup-state--error").length,
      controls: controls.length,
      hostClient: host?.clientHeight ?? 0,
      hostScroll: host?.scrollHeight ?? 0,
      overflowY: host ? getComputedStyle(host).overflowY : "missing",
      horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 ||
        Boolean(host && host.scrollWidth > host.clientWidth + 1),
      scrollers: scrollers.length,
      carrierCopy: document.body.textContent?.includes("The legal sender carriers will verify") ?? false,
      representativeCopy: document.body.textContent?.includes("A2P authorized representative") ?? false,
    };
  });
}

async function main() {
  await assertPortFree();
  fs.mkdirSync(OUT, { recursive: true });
  const vite = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js", "--config",
    "scripts/live-drive/harness/settings-mount/vite.config.ts", "--port", String(PORT), "--strictPort",
  ], { stdio: "ignore", detached: true });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        const response = await fetch(`${BASE}/solo/1971670/settings/setup`);
        if (response.ok) { ready = true; break; }
      } catch { /* server is starting */ }
      if (vite.exitCode !== null) throw new Error(`Vite exited before readiness (${vite.exitCode})`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Setup harness did not become ready");

    browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    for (const [width, height] of VIEWPORTS) {
      for (const theme of THEMES) {
        let canonicalShellFingerprint;
        for (const tenant of CONTEXTS) {
          const label = `${width}x${height} ${theme} · ${tenant.key}`;
          const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", (error) => errors.push(String(error).slice(0, 160)));
          await page.goto(
            `${BASE}/solo/${tenant.account}/settings/setup?theme=${theme}&tenant=${tenant.query}`,
            { waitUntil: "domcontentloaded", timeout: 60_000 },
          );
          await page.locator(".setup-brief").waitFor();

          const foldPaige = page.locator('#tenant-paige-workspace button[aria-label="Fold PAIGE conversation"]');
          if (await foldPaige.isVisible()) await foldPaige.click();
          await page.locator("#tenant-paige-workspace").waitFor({ state: "hidden" });

          const closed = await measure(page);
          const bodyText = await page.locator("body").innerText();
          const otherTenant = CONTEXTS.find((candidate) => candidate.key !== tenant.key);
          record(`${label} · canonical route/context resolves`,
            page.url().includes(`/solo/${tenant.account}/settings/setup`) && bodyText.includes(tenant.legalName));
          record(`${label} · tenant legal identity stays isolated`,
            bodyText.includes(tenant.legalName) && !bodyText.includes(otherTenant.legalName));
          record(`${label} · PAIGE closed geometry`, !closed.horizontal,
            `host=${closed.hostScroll}/${closed.hostClient}`);

          const shellFingerprint = await page.evaluate(() => JSON.stringify({
            shellCount: document.querySelectorAll("[data-tenant-shell]").length,
            hostCount: document.querySelectorAll("[data-solo-screen-host]").length,
            nav: [...document.querySelectorAll(".tcs-nav a, .tcs-nav button")]
              .map((el) => el.textContent?.replace(/\s+/g, " ").trim())
              .filter(Boolean),
          }));
          canonicalShellFingerprint ??= shellFingerprint;
          record(`${label} · same canonical shell fingerprint`, shellFingerprint === canonicalShellFingerprint);

          await page.locator("[data-tenant-paige-command]").click();
          await page.locator("#tenant-paige-workspace").waitFor({ state: "visible" });
          const open = await measure(page);
          record(`${label} · PAIGE open uses one workspace`,
            await page.locator("#tenant-paige-workspace").count() === 1);
          record(`${label} · PAIGE open geometry`, !open.horizontal,
            `host=${open.hostScroll}/${open.hostClient}`);
          await page.screenshot({ path: path.join(OUT, `${width}x${height}-${theme}-${tenant.key}-paige-open.png`) });
          await foldPaige.click();
          await page.locator("#tenant-paige-workspace").waitFor({ state: "hidden" });

          const read = await measure(page);
          record(`${label} · real Setup renders`, read.setup && read.errors === 0, `${read.controls} controls`);
          record(`${label} · carrier contract visible`, read.carrierCopy && read.representativeCopy);

          await page.getByRole("button", { name: "Edit brief" }).click();
          const edit = await measure(page);
          record(`${label} · complete edit flow renders`, edit.controls >= 30, `${edit.controls} enabled controls`);
          record(`${label} · one vertical owner`, edit.scrollers === 1 && edit.overflowY === "auto",
            `owners=${edit.scrollers} overflow=${edit.overflowY} ${edit.hostScroll}/${edit.hostClient}`);
          record(`${label} · no horizontal overflow`, !edit.horizontal);
          record(`${label} · full registration number is masked`,
            await page.locator("#setup-businessRegistrationNumber").getAttribute("type") === "password");
          record(`${label} · exact provider choices render`,
            await page.locator("#setup-entityType option").count() === 6 &&
            await page.locator("#setup-businessRegistrationIdentifier option").count() === 10 &&
            await page.locator("#setup-authorizedRepresentativeJobPosition option").count() === 8);

          const deepest = page.locator("#setup-doNotAssume");
          await deepest.focus();
          const deepestVisible = await deepest.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= window.innerHeight;
          });
          record(`${label} · keyboard focus reaches deepest field`, deepestVisible);
          record(`${label} · no page errors`, errors.length === 0, errors.join(" | "));

          await page.evaluate(() => {
            const mark = document.createElement("div");
            mark.textContent = "HARNESS RENDER · NOT LIVE";
            Object.assign(mark.style, {
              position: "fixed", right: "10px", bottom: "10px", zIndex: "2147483647",
              padding: "6px 9px", background: "#111", color: "#fff", font: "700 11px sans-serif",
            });
            document.body.append(mark);
          });
          await page.screenshot({ path: path.join(OUT, `${width}x${height}-${theme}-${tenant.key}-paige-closed.png`) });
          await context.close();
        }
      }
    }
  } finally {
    await browser?.close();
    await stopProcessTree(vite);
  }

  const failed = results.filter((result) => !result.ok);
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ results, failed: failed.length }, null, 2));
  if (failed.length) throw new Error(`${failed.length} Setup identity rendered check(s) failed`);
  console.log(`\nsettings-setup-identity-drive: ${results.length}/${results.length} checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
