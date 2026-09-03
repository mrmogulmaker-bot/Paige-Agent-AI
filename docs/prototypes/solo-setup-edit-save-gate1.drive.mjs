import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const file = path.resolve("docs/prototypes/solo-setup-edit-save-gate1.html");
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of [
    { width: 1536, height: 770 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 900, height: 1000 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(pathToFileURL(file).href);
    for (const theme of ["mineral", "obsidian"]) {
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      for (const scenario of ["first", "populated", "partial", "edit", "validation", "saving", "saved", "failure", "conflict", "stale", "switch", "connection", "readonly", "legalowner"]) {
        // The scenario rail is prototype-only and hidden at narrower product
        // viewports, so drive the state lab directly for the matrix.
        await page.evaluate((value) => chooseScenario(value), scenario);
        const geometry = await page.evaluate(() => ({
          bodyHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          mainScrollable: document.querySelector("#main").scrollHeight > document.querySelector("#main").clientHeight,
          dialogs: document.querySelectorAll('[role="dialog"]').length,
          setupHeadings: document.querySelectorAll("#content > .section").length,
        }));
        if (geometry.bodyHorizontal) throw new Error(`${scenario} overflowed at ${viewport.width}x${viewport.height} ${theme}`);
        if (!geometry.mainScrollable) throw new Error(`${scenario} did not preserve Setup's main scroll owner`);
        if (geometry.setupHeadings !== 6) throw new Error(`${scenario} lost the established six Setup sections`);
        results.push({ viewport: `${viewport.width}x${viewport.height}`, theme, scenario });
      }
    }
    await page.close();
  }

  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(pathToFileURL(file).href);
await page.getByRole("button", { name: "Edit brief", exact: true }).click();
  await page.locator('[data-key="priority"]').fill("Prototype persistence check");
  await page.getByRole("button", { name: "Cancel" }).click();
  if (await page.getByRole("dialog").count() !== 1) throw new Error("Dirty cancel did not require discard confirmation");
  await page.getByRole("button", { name: "Keep editing" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Business brief saved and read back").waitFor();

  await page.locator('[data-scenario="connection"]').click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Choose Adopt or Override").waitFor();
  await page.getByRole("button", { name: "Override as owner" }).click();

  console.log(JSON.stringify({ status: "PASS", matrix: results.length, lifecycle: "PASS" }));
} finally {
  await browser.close();
}
