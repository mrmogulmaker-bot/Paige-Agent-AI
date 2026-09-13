import { chromium } from "playwright";

const url = process.argv[2];
if (!url || !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(url)) {
  throw new Error("A loopback Social prototype URL is required.");
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const page = await browser.newPage();
  for (const [width, height] of [[1536, 770], [1366, 768], [1024, 768], [900, 1000]]) {
    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector(".app");
    const base = await page.evaluate(() => ({
      contentLength: document.body.innerText.trim().length,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      errorOverlay: Boolean(document.querySelector(".vite-error-overlay")),
      title: document.querySelector("h1")?.textContent ?? "",
    }));
    const initiallyOpen = await page.evaluate(() => {
      const element = document.querySelector("#social-drawer");
      const rect = element?.getBoundingClientRect();
      return Boolean(element && rect && getComputedStyle(element).display !== "none" && rect.width > 0);
    });
    if (!initiallyOpen) await page.click("#open-social");
    const drawer = await page.evaluate(() => {
      const element = document.querySelector("#social-drawer");
      const rect = element?.getBoundingClientRect();
      return {
        visible: Boolean(element && rect && getComputedStyle(element).display !== "none" && rect.width > 0),
        left: rect?.left ?? null,
        right: rect?.right ?? null,
        width: rect?.width ?? null,
        height: rect?.height ?? null,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    await page.keyboard.press("Escape");
    const closedByEscape = await page.evaluate(() => {
      const element = document.querySelector("#social-drawer");
      return !element || getComputedStyle(element).display === "none" || element.getBoundingClientRect().width === 0;
    });
    results.push({ width, height, ...base, drawer, closedByEscape });
  }
} finally {
  await browser.close();
}

const failed = results.some((result) =>
  result.contentLength === 0 || result.horizontalOverflow || result.errorOverlay ||
  !result.drawer.visible || result.drawer.horizontalOverflow || !result.closedByEscape
);
console.log(JSON.stringify({ status: failed ? "FAIL" : "PASS", results }, null, 2));
if (failed) process.exitCode = 1;
