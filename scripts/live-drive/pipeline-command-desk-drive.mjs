import fs from "node:fs";
import path from "node:path";
import { resolvePlaywright, resolveExecutablePath } from "./live-drive.mjs";
const base =
  process.env.PIPELINE_DRIVE_URL ||
  "http://127.0.0.1:8080/pipeline-command-desk-drive.html";
const out = path.resolve("scripts/live-drive/artifacts/pipeline-command-desk");
fs.mkdirSync(out, { recursive: true });
const sizes = [
    [1536, 770],
    [1366, 768],
    [1024, 768],
    [900, 1000],
  ],
  themes = ["mineral", "obsidian"],
  paige = ["closed", "open"];
const report = {
  base,
  startedAt: new Date().toISOString(),
  cases: [],
  interactions: {},
  consoleErrors: [],
  pageErrors: [],
  ok: false,
};
const pw = await resolvePlaywright(),
  executablePath = resolveExecutablePath();
const browser = await pw.chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  ...(executablePath ? { executablePath } : {}),
});
const wire = (page) => {
  page.on("console", (m) => {
    if (m.type() === "error") report.consoleErrors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => report.pageErrors.push(String(e).slice(0, 300)));
};
try {
  for (const [width, height] of sizes)
    for (const theme of themes)
      for (const rail of paige) {
        const page = await browser.newPage({
          viewport: { width, height },
          reducedMotion: "reduce",
        });
        wire(page);
        const url = base + "?theme=" + theme + "&paige=" + rail;
        let item = { width, height, theme, paige: rail, ok: false };
        try {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
          await page.waitForSelector(".pipeline-command-desk");
          const geometry = await page.evaluate(() => {
            const desk = document.querySelector(".pipeline-command-desk"),
              body = document.documentElement,
              board = document.querySelector(".pipeline-desk-board"),
              focus = document.querySelector(".pipeline-desk-focus");
            return {
              bodyWidth: body.clientWidth,
              bodyScrollWidth: body.scrollWidth,
              deskWidth: desk?.clientWidth,
              deskScrollWidth: desk?.scrollWidth,
              boardOverflow: board ? board.scrollWidth - board.clientWidth : 0,
              focusVisible: focus
                ? getComputedStyle(focus).display !== "none"
                : false,
              buttons: [
                ...document.querySelectorAll(
                  ".pipeline-command-actions button",
                ),
              ].every((el) => {
                const r = el.getBoundingClientRect();
                return r.right <= innerWidth && r.left >= 0;
              }),
            };
          });
          const shot = path.join(
            out,
            `pipeline-${width}x${height}-${theme}-paige-${rail}.png`,
          );
          await page.screenshot({ path: shot, fullPage: false });
          item = {
            ...item,
            geometry,
            screenshot: path.basename(shot),
            ok:
              geometry.bodyScrollWidth <= geometry.bodyWidth &&
              geometry.deskScrollWidth <= geometry.deskWidth &&
              geometry.buttons,
          };
        } catch (error) {
          item.error = String(error).slice(0, 300);
        }
        report.cases.push(item);
        await page.close();
      }
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    reducedMotion: "reduce",
  });
  wire(page);
  await page.goto(base + "?theme=mineral&paige=closed", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForSelector(".pipeline-desk-card");
  await page.locator(".pipeline-desk-card-main").first().click();
  await page.waitForSelector('[role="dialog"]');
  report.interactions.cardOpensDetail = true;
  await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  report.interactions.browserBackClosesDetail = true;
  await page.getByRole("button", { name: "New deal" }).click();
  await page.waitForSelector('[role="dialog"]');
  report.interactions.newDealOpens = true;
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  report.interactions.cancelCloses = true;
  await page.locator(".pipeline-desk-card-main").first().click();
  await page.waitForSelector('[role="dialog"]');
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  report.interactions.escapeCloses = true;
  await page.locator(".pipeline-desk-card").first().focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    document.body.innerText.includes("Representative local action completed."),
  );
  report.interactions.keyboardMove = true;
  await page.close();
} finally {
  await browser.close();
}
report.ok =
  report.cases.every((item) => item.ok) &&
  Object.values(report.interactions).every(Boolean) &&
  report.pageErrors.length === 0 &&
  report.consoleErrors.length === 0;
fs.writeFileSync(
  path.join(out, "render-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  `Pipeline render matrix: ${report.cases.filter((x) => x.ok).length}/${report.cases.length}; interactions=${Object.values(report.interactions).filter(Boolean).length}/6; pageErrors=${report.pageErrors.length}; consoleErrors=${report.consoleErrors.length}`,
);
if (!report.ok) {
  for (const item of report.cases.filter((x) => !x.ok))
    console.log(JSON.stringify(item));
  console.log(JSON.stringify(report.interactions));
  process.exit(1);
}
