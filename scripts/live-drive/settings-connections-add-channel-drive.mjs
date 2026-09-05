#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 5203;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve("scripts/live-drive/artifacts/settings-connections-add-channel");
const ALL_VIEWPORTS = [[1536, 770], [1366, 768], [1024, 768], [900, 1000]];
const VIEWPORTS = process.env.FLOW_VIEWPORT ? ALL_VIEWPORTS.filter(([w, h]) => `${w}x${h}` === process.env.FLOW_VIEWPORT) : ALL_VIEWPORTS;
const THEMES = ["light", "dark"];
const CONTEXTS = [{ id: "primary", account: "1971670", query: "" }, { id: "second", account: "2000000", query: "&tenant=second" }];
const results = [];
const record = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "ok" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };

function portFree() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.once("listening", () => server.close(resolve)); server.listen(PORT, "127.0.0.1"); }); }
async function stop(child) { if (!child?.pid) return; if (process.platform === "win32") await new Promise((resolve) => { const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" }); killer.once("exit", resolve); killer.once("error", resolve); }); else child.kill("SIGTERM"); }

async function main() {
  await portFree();
  fs.mkdirSync(OUT, { recursive: true });
  const config = "scripts/live-drive/harness/settings-mount/vite.config.ts";
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--config", config, "--port", String(PORT)], { stdio: "ignore", detached: true });
  let browser;
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/solo/1971670/settings/connections`)).ok) break; } catch {} await new Promise((resolve) => setTimeout(resolve, 500)); }
    browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
    for (const [width, height] of VIEWPORTS) for (const theme of THEMES) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: "no-preference" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      for (const workspace of CONTEXTS) {
        const label = `${width}x${height} ${theme} ${workspace.id}`;
        await page.goto(`${BASE}/solo/${workspace.account}/settings/connections?theme=${theme}${workspace.query}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".solo-settings");
        const fold = page.locator('#tenant-paige-workspace button[aria-label="Fold PAIGE conversation"]');
        if (await fold.isVisible()) { await fold.click(); await page.waitForTimeout(320); }
        await page.click('.ss-segment button:text-is("Add channel")');
        await page.waitForSelector(".ss-add-workspace");
        const audit = await page.evaluate(() => {
          const shell = document.querySelector("[data-pg]");
          const owner = document.querySelector("[data-solo-screen-host]");
          const workspace = document.querySelector(".ss-add-workspace");
          const controls = [...(workspace?.querySelectorAll("button, a[href]") ?? [])];
          return {
            canvas: shell ? getComputedStyle(shell).getPropertyValue("--pg-canvas").trim() : "",
            docX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            ownerX: owner ? owner.scrollWidth > owner.clientWidth + 1 : true,
            controls: controls.length,
            boxes: controls.every((control) => { const box = control.getBoundingClientRect(); return box.width > 0 && box.height > 0; }),
            goldActs: workspace?.querySelectorAll(".ss-add-primary").length ?? 0,
            text: workspace?.textContent ?? "",
          };
        });
        record(`${label} theme`, audit.canvas === (theme === "light" ? "#fbf9f5" : "#100e14"), audit.canvas);
        record(`${label} no horizontal overflow`, !audit.docX && !audit.ownerX, `doc=${audit.docX} owner=${audit.ownerX}`);
        record(`${label} reachable controls`, audit.controls === 8 && audit.boxes, `${audit.controls} controls`);
        record(`${label} one gold act`, audit.goldActs === 1, `${audit.goldActs}`);
        record(`${label} classification`, !/(n8n|Zapier|Make\.com|MCP|Direct APIs)/.test(audit.text) && audit.text.includes("Go to Integrations"));
        const closed = path.join(OUT, `connections-add-channel-${workspace.id}-${theme}-${width}x${height}-paige-closed.png`);
        await page.screenshot({ path: closed });

        const unavailableTrigger = page.locator('[data-channel-option="inbox"] .ss-add-option-action');
        await unavailableTrigger.focus();
        await unavailableTrigger.click();
        const dialog = page.locator('.ss-add-drawer[role="dialog"]');
        await dialog.waitFor();
        record(`${label} unavailable explains why`, (await dialog.textContent()).includes("not available yet"));
        record(`${label} unavailable initial focus`, await page.locator('[aria-label="Close setup"]').evaluate((node) => node === document.activeElement));
        await page.keyboard.press("Escape");
        record(`${label} Escape returns focus`, await unavailableTrigger.evaluate((node) => node === document.activeElement));

        await page.locator('[data-channel-option="sending"] .ss-add-option-action').click();
        const primary = page.locator('.ss-add-drawer button[data-initial-focus]');
        record(`${label} drawer primary focused`, await primary.evaluate((node) => node === document.activeElement));
        await page.keyboard.press("Escape");

        await page.locator('button[aria-label="Direct PAIGE"]').click();
        await page.waitForTimeout(320);
        const open = path.join(OUT, `connections-add-channel-${workspace.id}-${theme}-${width}x${height}-paige-open.png`);
        await page.screenshot({ path: open });
        const paige = await page.evaluate(() => ({ count: document.querySelectorAll("#tenant-paige-workspace").length, state: document.querySelector("[data-tenant-shell]")?.getAttribute("data-paige") }));
        record(`${label} one PAIGE workspace`, paige.count === 1 && paige.state === "open", JSON.stringify(paige));
        await page.locator('#tenant-paige-workspace button[aria-label="Fold PAIGE conversation"]').click();
        if (width === 900 && height === 1000 && theme === "light" && workspace.id === "primary") {
          await page.setViewportSize({ width: 450, height: 500 });
          await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
          await page.waitForTimeout(120);
          const reflow = await page.evaluate(() => ({ docX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, ownerX: (() => { const owner = document.querySelector("[data-solo-screen-host]"); return owner ? owner.scrollWidth > owner.clientWidth + 1 : true; })() }));
          record(`${label} 200% equivalent reflow`, !reflow.docX && !reflow.ownerX, JSON.stringify(reflow));
          await page.locator('[data-channel-option="sending"] .ss-add-option-action').click();
          const reduced = await page.locator(".ss-add-drawer").evaluate((node) => ({ duration: getComputedStyle(node).animationDuration, name: getComputedStyle(node).animationName }));
          record(`${label} reduced motion`, reduced.name === "none" || parseFloat(reduced.duration) <= 0.01, JSON.stringify(reduced));
          await page.keyboard.press("Escape");
          await page.setViewportSize({ width, height });
          await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: theme });
        }
      }
      record(`${width}x${height} ${theme} page errors`, errors.length === 0, errors.join(" | "));
      await context.close();
    }
  } finally { await browser?.close(); await stop(vite); }
  fs.writeFileSync(path.join(OUT, process.env.FLOW_VIEWPORT ? `report-${process.env.FLOW_VIEWPORT}.json` : "report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  const failures = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });