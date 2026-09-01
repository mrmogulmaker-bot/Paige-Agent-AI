#!/usr/bin/env node
/** Structural-harness evidence only: real component/CSS, deterministic transport stub. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const repo = path.resolve(import.meta.dirname, "../..");
const base = "http://127.0.0.1:5202";
const artifacts = path.join(import.meta.dirname, "artifacts", "solo-team-workspace");
const frames = [{ w: 1536, h: 770 }, { w: 1366, h: 768 }, { w: 1024, h: 768 }, { w: 900, h: 1000 }];
fs.mkdirSync(artifacts, { recursive: true });

const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--config", "scripts/live-drive/harness/team-mount/vite.config.ts"], { cwd: repo, stdio: ["ignore", "pipe", "pipe"] });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Team harness did not start")), 90_000);
  const ready = (chunk) => { if (/ready in|Local:/.test(String(chunk))) { clearTimeout(timer); resolve(); } };
  vite.stdout.on("data", ready); vite.stderr.on("data", ready); vite.once("exit", (code) => reject(new Error(`Team harness exited ${code}`)));
});

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  for (const frame of frames) {
    await page.setViewportSize({ width: frame.w, height: frame.h });
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator(".stw-row").first().waitFor();
    const geometry = await page.evaluate(() => {
      const owner = document.querySelector("[data-solo-screen-host]"); const roster = document.querySelector(".stw-list"); const surface = document.querySelector(".stw-workspace");
      return { docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, ownerOverflow: owner.scrollWidth > owner.clientWidth, ownerScrollable: owner.scrollHeight > owner.clientHeight, rosterOverflow: roster.scrollWidth > roster.clientWidth, rosterScrollOwner: ["auto", "scroll"].includes(getComputedStyle(roster).overflowY), surfaceWidth: Math.round(surface.getBoundingClientRect().width) };
    });
    check(`${frame.w}x${frame.h} no horizontal overflow`, !geometry.docOverflow && !geometry.ownerOverflow && !geometry.rosterOverflow && geometry.surfaceWidth > 500, JSON.stringify(geometry));
    check(`${frame.w}x${frame.h} one reachable page scroll`, geometry.ownerScrollable && !geometry.rosterScrollOwner);
    await page.locator("[data-solo-screen-host]").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    check(`${frame.w}x${frame.h} bottom reachable`, await page.locator(".stw-paige").isVisible());
    await page.screenshot({ path: path.join(artifacts, `team-${frame.w}x${frame.h}.png`), fullPage: false });
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator(".stw-row").first().waitFor();
  check("large roster starts paged", await page.locator(".stw-row").count() === 25);
  await page.getByRole("button", { name: /Load more/ }).click();
  check("load more reaches remaining people", await page.locator(".stw-row").count() === 34);

  await page.locator(".stw-row").nth(1).click();
  let title = page.getByPlaceholder("e.g. Client Success Manager"); const original = await title.inputValue();
  await title.fill("Account Director"); await page.getByRole("button", { name: "Cancel" }).click();
  await page.locator(".stw-row").nth(1).click(); title = page.getByPlaceholder("e.g. Client Success Manager");
  check("edit cancel restores work title", await title.inputValue() === original);
  await title.fill("Account Director");
  await page.getByRole("button", { name: "Save work details" }).click(); await page.locator(".stw-modal-actions").getByRole("button", { name: "Close" }).click();
  await page.locator(".stw-row").nth(1).click(); check("saved work title survives re-read", await page.getByPlaceholder("e.g. Client Success Manager").inputValue() === "Account Director");
  await page.getByLabel("Enforced permission").selectOption("admin"); check("permission requires confirmation", await page.getByRole("button", { name: "Confirm access change" }).isVisible());
  await page.getByRole("button", { name: "Confirm access change" }).click();

  const inviteButton = page.getByRole("button", { name: "Invite someone" }).first(); await inviteButton.click();
  const email = page.getByPlaceholder("person@company.com"); await email.fill("bad-email");
  check("invalid invitation is blocked", await page.getByRole("button", { name: "Review invitation" }).isDisabled());
  await email.fill("new.person@northstar.example"); await page.getByRole("button", { name: "Review invitation" }).click();
  check("invitation has owner confirmation state", await page.getByRole("button", { name: "Confirm and send invitation" }).isVisible());
  await page.getByRole("button", { name: "Confirm and send invitation" }).click();
  check("confirmed invitation enters lifecycle", await page.getByText("new.person@northstar.example").isVisible());

  await inviteButton.click(); await page.keyboard.press("Escape");
  check("Escape closes and restores trigger focus", await inviteButton.evaluate((el) => el === document.activeElement));
  await page.getByRole("tab", { name: "Roles & access" }).click(); check("roles explanation reachable", await page.getByText("Full workspace authority").isVisible());
  await page.getByRole("tab", { name: "Team" }).click(); await page.getByRole("button", { name: "Open Paige" }).click();
  check("existing Paige workspace opener wired", await page.evaluate(() => document.body.dataset.paigeOpened === "true"));

  await page.goto(`${base}/?state=first`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByText("Your workspace starts with you").waitFor(); check("first teammate state reachable", true);
  await page.goto(`${base}/?state=denied`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByText("You don’t have access to this team").waitFor(); check("permission denied state explicit", true);
} finally {
  await browser?.close(); vite.kill();
}

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(artifacts, "results.json"), JSON.stringify({ evidence: "STRUCTURAL-HARNESS", results }, null, 2));
if (failed.length) { console.error(`${failed.length} checks failed`); process.exitCode = 1; } else console.log(`PASS ${results.length}/${results.length} structural-harness checks`);
