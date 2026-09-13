#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { buildLaunchOptions } from "./live-drive.mjs";

const PORT = 5214;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve("docs/evidence/ui-delivery/login-workspace-choice-recovery");
const VIEWPORTS = [[1536, 770], [1366, 768], [1024, 768], [900, 1000]];
const THEMES = [{ id: "mineral", query: "light" }, { id: "obsidian", query: "dark" }];
const results = [];
const record = (name, ok, detail = null) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? `  ${JSON.stringify(detail)}` : ""}`);
};

function localLaunchOptions() {
  const { proxy: _proxy, ...rest } = buildLaunchOptions();
  return rest;
}

const portFree = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(PORT, "127.0.0.1", () => server.close(resolve));
});

const waitForPort = () => new Promise((resolve, reject) => {
  const started = Date.now();
  const probe = () => {
    const socket = net.createConnection(PORT, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); resolve(); });
    socket.once("error", () => {
      socket.destroy();
      if (Date.now() - started > 45_000) reject(new Error("Account-choice harness did not start"));
      else setTimeout(probe, 150);
    });
  };
  probe();
});

async function stop(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true }).once("exit", resolve));
  } else child.kill("SIGTERM");
}

fs.mkdirSync(OUT, { recursive: true });
let server;
let browser;
try {
  await portFree();
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--config", "scripts/live-drive/harness/account-choice/vite.config.ts", "--port", String(PORT), "--strictPort"], { stdio: "ignore", windowsHide: true });
  await waitForPort();
  browser = await chromium.launch({ headless: true, ...localLaunchOptions() });

  for (const theme of THEMES) {
    for (const [width, height] of VIEWPORTS) {
      const label = `${width}x${height}-${theme.id}`;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`${BASE}/choose-account?theme=${theme.query}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Where do you want to work?" }).waitFor();

      const platform = page.getByRole("button", { name: /Platform Platform operations/ });
      const measures = await page.evaluate(() => {
        const section = document.querySelector("main > section");
        const box = section?.getBoundingClientRect();
        const buttons = [...document.querySelectorAll("main button")].map((button) => {
          const rect = button.getBoundingClientRect();
          return { name: button.textContent?.trim().replace(/\s+/g, " "), width: rect.width, height: rect.height };
        });
        return {
          bodyText: document.body.innerText,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          sectionFits: Boolean(box && box.left >= 0 && box.right <= innerWidth + 1),
          buttons,
          theme: document.documentElement.getAttribute("data-pg"),
          overlay: Boolean(document.querySelector(".vite-error-overlay, #webpack-dev-server-client-overlay")),
        };
      });
      record(`${label} meaningful content`, measures.bodyText.includes("Platform operations") && measures.bodyText.includes("Example Studio") && measures.bodyText.includes("Northstar Advisors"));
      record(`${label} no hidden account`, !measures.bodyText.includes("Not My Account"));
      record(`${label} fit`, !measures.horizontalOverflow && measures.sectionFits, measures);
      const primaryTargets = measures.buttons.filter((button) => button.name !== "Use a different Google account");
      record(
        `${label} targets`,
        measures.buttons.every((button) => button.height >= 24) && primaryTargets.every((button) => button.height >= 44),
        measures.buttons,
      );
      record(`${label} runtime`, errors.length === 0 && !measures.overlay, errors);
      record(`${label} theme`, measures.theme === theme.id, measures.theme);

      await page.keyboard.press("Tab");
      record(`${label} keyboard`, await platform.evaluate((button) => document.activeElement === button));
      const shot = path.join(OUT, `${label}.png`);
      await page.screenshot({ path: shot, fullPage: false });
      record(`${label} screenshot`, fs.statSync(shot).size > 10_000, fs.statSync(shot).size);
      await context.close();
    }
  }

  const scenarioPage = async (label, url, verify) => {
    const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Where do you want to work?" }).waitFor();
    await verify(page);
    record(`${label} runtime`, errors.length === 0, errors);
    await context.close();
  };

  await scenarioPage("Platform-only staff", "/choose-account?case=staff-only", async (page) => {
    record("Platform-only staff pauses", await page.getByRole("button", { name: /Platform Platform operations/ }).isVisible());
    record("Platform-only staff has no invented workspace", !(await page.locator("body").innerText()).includes("Example Studio"));
  });

  await scenarioPage("One-account ordinary user", "/choose-account?case=one", async (page) => {
    const choice = page.getByRole("button", { name: /Example Studio/ });
    record("One-account ordinary user pauses for deliberate choice", await choice.isVisible() && page.url().includes("/choose-account"));
    await choice.click();
    await page.waitForURL(/\/solo\/111111\/command-center/);
    record("One-account ordinary user enters only after choosing", page.url().includes("/solo/111111/command-center"));
  });

  await scenarioPage("No valid membership", "/choose-account?case=none", async (page) => {
    record("No valid membership stays fail-closed", (await page.locator("body").innerText()).includes("couldn't confirm a workspace"));
  });

  await scenarioPage("Inaccessible selection", "/choose-account?case=inaccessible", async (page) => {
    record("Inaccessible selection changes no scope", (await page.evaluate(() => window.__accountChoiceSwitches ?? [])).length === 0);
    record("Inaccessible selection stays fail-closed", (await page.locator("body").innerText()).includes("couldn't confirm a workspace"));
  });

  await scenarioPage("Membership read failure", "/choose-account?case=read-error", async (page) => {
    const body = await page.locator("body").innerText();
    record("Membership read failure exposes Retry", body.includes("couldn't load your Paige accounts") && body.includes("Retry"));
  });

  await scenarioPage("Account authority failure", "/choose-account?case=context-error", async (page) => {
    const body = await page.locator("body").innerText();
    record("Account authority failure explains unchanged access", body.includes("couldn't confirm your account access") && body.includes("Your access has not changed"));
    record("Account authority failure exposes no choices", !body.includes("Platform operations") && !body.includes("Example Studio"));
    await page.getByRole("button", { name: /Retry/ }).click();
    await page.getByRole("button", { name: /Platform Platform operations/ }).waitFor();
    record("Account authority Retry restores authorized choices", (await page.evaluate(() => window.__accountChoiceRefreshes ?? 0)) === 1);
  });

  await scenarioPage("Operator deep-link recovery", "/choose-account?case=staff-only&next=%2Foperator%2Fsettings%2Fteam%2Froles", async (page) => {
    await page.getByRole("button", { name: /Platform Platform operations/ }).click();
    await page.waitForURL(/\/operator\/settings\/team\/roles/);
    record("Operator deep link waits for Platform choice", page.url().includes("/operator/settings/team/roles"));
  });

  await scenarioPage("Workspace switch", "/choose-account?case=staff-multi", async (page) => {
    await page.getByRole("button", { name: /Northstar Advisors/ }).click();
    await page.waitForURL(/\/agency\/222222\/command-center/);
    record("Workspace switch uses chosen direct membership", page.url().includes("/agency/222222/command-center"));
  });

  await scenarioPage("Chooser refresh", "/choose-account?case=staff-multi", async (page) => {
    await page.reload({ waitUntil: "networkidle" });
    record("Chooser refresh still pauses staff", await page.getByRole("button", { name: /Platform Platform operations/ }).isVisible());
  });

  await scenarioPage("Accessibility contract", "/choose-account?case=staff-multi", async (page) => {
    const accessibility = await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
      const section = document.querySelector("main > section");
      return {
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        labelled: section?.getAttribute("aria-labelledby") === "account-picker-title",
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        platformVisible: Boolean([...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Platform operations"))?.getBoundingClientRect().height),
      };
    });
    record("Reduced-motion preference is honored by browser context", accessibility.reducedMotion);
    record("Chooser has a labelled main region", accessibility.labelled);
    record("200% text reflow remains reachable", !accessibility.horizontalOverflow && accessibility.platformVisible, accessibility);
  });
} catch (error) {
  record("drive completed", false, String(error?.stack ?? error));
} finally {
  await browser?.close();
  await stop(server);
  const report = {
    generatedAt: new Date().toISOString(),
    evidenceClass: "Real ChooseAccount component and production styles; deterministic local authorization adapter proving deliberate one- and multi-workspace choice; not authenticated production proof",
    viewports: VIEWPORTS,
    themes: THEMES.map((theme) => theme.id),
    results,
  };
  fs.writeFileSync(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${results.filter((result) => result.ok).length}/${results.length} passed`);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}
