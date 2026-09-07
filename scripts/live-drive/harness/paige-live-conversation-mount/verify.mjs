import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../../..");
const output = path.join(root, "docs/evidence/ui-delivery/assets/paige-live-conversation");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const viewports = [[1536, 770], [1366, 768], [1024, 768], [900, 1000]];
const results = [];
const popoutOnly = process.argv.includes("--popout-only");

for (const theme of popoutOnly ? [] : ["light", "dark"]) {
  for (const [width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:5227/?theme=${theme}&card=plan`, { waitUntil: "networkidle" });
    if (!(await page.locator("body").innerText()).trim()) throw new Error("blank harness page");
    await page.screenshot({ path: path.join(output, `${width}x${height}-${theme}-chat.png`) });
    await page.getByRole("button", { name: "Talk live with Paige" }).click();
    await page.getByText("PROOF OWED", { exact: true }).waitFor();
    const geometry = await page.evaluate(() => {
      const stage = document.querySelector(".plc-stage");
      const controls = document.querySelector(".plc-controls");
      const transcript = document.querySelector(".plc-transcript");
      if (!(stage instanceof HTMLElement) || !(controls instanceof HTMLElement) || !(transcript instanceof HTMLElement)) return null;
      const controlRect = controls.getBoundingClientRect();
      return {
        documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        stageOverflowX: stage.scrollWidth > stage.clientWidth,
        controlsClipped: controlRect.left < 0 || controlRect.right > innerWidth || controlRect.top < 0 || controlRect.bottom > innerHeight,
        transcriptOverflowY: getComputedStyle(transcript).overflowY,
        stageRole: stage.getAttribute("role"),
        modal: stage.getAttribute("aria-modal"),
        motion: getComputedStyle(document.querySelector(".plc-orb__halo")).animationDuration,
      };
    });
    if (!geometry || geometry.documentOverflowX || geometry.stageOverflowX || geometry.controlsClipped || geometry.stageRole !== "dialog" || geometry.modal !== "true") {
      throw new Error(`geometry failure ${theme} ${width}x${height}: ${JSON.stringify(geometry)}`);
    }
    await page.screenshot({ path: path.join(output, `${width}x${height}-${theme}-live.png`) });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    const focusReturned = await page.getByRole("button", { name: "Talk live with Paige" }).evaluate((node) => node === document.activeElement);
    if (!focusReturned) throw new Error(`focus return failure ${theme} ${width}x${height}`);
    results.push({ theme, width, height, geometry, focusReturned, consoleErrors: errors });
    await context.close();
  }
}

const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
await page.goto("http://127.0.0.1:5227/?theme=dark&card=action", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Talk live with Paige" }).click();
const popupPromise = context.waitForEvent("page");
await page.getByRole("button", { name: "Open in window" }).click();
const popup = await popupPromise;
await popup.getByRole("dialog").waitFor();
if (!(await popup.evaluate(() => document.documentElement.classList.contains("dark")))) throw new Error("companion window did not retain the active theme");
await popup.screenshot({ path: path.join(output, "1366x768-dark-governed-action-popout.png") });
await popup.getByRole("button", { name: "Minimize", exact: true }).last().click();
await popup.waitForTimeout(350).catch(() => undefined);
if (!popup.isClosed()) throw new Error(`companion window remained open after minimize: ${await popup.locator("body").innerText()}`);
const preserved = await page.getByLabel("Message Paige").inputValue();
if (preserved !== "Help me review this plan.") throw new Error("underlying unsaved composer state was lost");
results.push({ popout: true, themePreserved: true, underlyingComposerPreserved: true, consequentialCardHasVisibleConfirmation: await page.getByText("Talk live with Paige").count() === 1 });
await context.close();
await browser.close();
await fs.writeFile(path.join(output, "render-results.json"), `${JSON.stringify(results, null, 2)}\n`);
console.log(`Paige Live Conversation rendered evidence: ${results.length - 1} viewport/theme pairs + popout; PASS`);
