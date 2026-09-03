/** Structural evidence only. Fresh browser, synthetic hook, real Setup/shell/CSS. */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 5213;
const out = path.resolve(
  "scripts/live-drive/artifacts/setup-business-context-render",
);
const results = [];
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", () => probe.close(resolve));
});
fs.mkdirSync(out, { recursive: true });
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--config",
    "scripts/live-drive/harness/setup-business-context-mount/vite.config.ts",
    "--port",
    String(port),
    "--strictPort",
  ],
  { stdio: "ignore", windowsHide: true },
);
let browser;
try {
  let ready = false;
  for (let n = 0; n < 50; n++) {
    try {
      ready = (await fetch(`http://127.0.0.1:${port}/`)).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!ready) throw new Error("Isolated render server unavailable");
  browser = await chromium.launch({
    headless: true,
    ignoreDefaultArgs: ["--hide-scrollbars"],
  });
  for (const [width, height] of [
    [1536, 770],
    [1366, 768],
    [1024, 768],
    [900, 1000],
  ])
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.route("https://api.zippopotam.us/**", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            "post code": "12345",
            "country abbreviation": "US",
            places: [
              { "place name": "Harness City", "state abbreviation": "NY" },
            ],
          }),
        }),
      );
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(
        `http://127.0.0.1:${port}/solo/1971670/settings/setup?theme=${theme}`,
        { waitUntil: "networkidle" },
      );
      await page.locator(".setup-brief").waitFor({ timeout: 20000 });
      await page.evaluate(() => {
        const label = document.createElement("div");
        label.textContent =
          "STRUCTURAL HARNESS · SYNTHETIC DATA · NOT LIVE PROOF";
        label.style.cssText =
          "position:fixed;bottom:2px;left:5px;z-index:99999;padding:3px 6px;font:9px sans-serif;color:white;background:#24212c;pointer-events:none";
        document.body.append(label);
      });
      const fold = page.locator(
        '#tenant-paige-workspace button[aria-label="Fold PAIGE conversation"]',
      );
      if (await fold.isVisible()) await fold.click();
      for (const tab of [
        "Business profile",
        "People & email",
        "Knowledge bucket",
        "Direction",
        "Paige brief",
      ]) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        const geometry = await page.evaluate(() => {
          const host = document.querySelector("[data-solo-screen-host]");
          const box = document
            .querySelector(".setup-brief")
            .getBoundingClientRect();
          const scroll = [...document.querySelectorAll("*")].filter(
            (el) =>
              /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
              el.scrollHeight > el.clientHeight + 1,
          );
          return {
            horizontal:
              document.documentElement.scrollWidth > innerWidth + 1 ||
              host.scrollWidth > host.clientWidth + 1,
            setupWidth: box.width,
            hostWidth: host.clientWidth,
            scrollOwners: scroll.map((el) => ({
              className: el.className,
              height: el.clientHeight,
              content: el.scrollHeight,
            })),
          };
        });
        const key = `${width}x${height}-${theme}-${tab.replaceAll(/[^a-z]+/gi, "-")}`;
        await page.screenshot({ path: path.join(out, `${key}.png`) });
        results.push({ key, ...geometry, errors: [...errors] });
      }
      await page
        .getByRole("button", { name: "Edit business context", exact: true })
        .click();
      for (const tab of [
        "Business profile",
        "People & email",
        "Knowledge bucket",
        "Direction",
        "Paige brief",
      ]) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        const key = `${width}x${height}-${theme}-edit-${tab.replaceAll(/[^a-z]+/gi, "-")}`;
        const geometry = await page.evaluate(() => {
          const host = document.querySelector("[data-solo-screen-host]");
          const inputs = [
            ...document.querySelectorAll(
              ".setup-brief input,.setup-brief select,.setup-brief textarea",
            ),
          ].filter((el) => el.getBoundingClientRect().width > 0);
          return {
            horizontal:
              document.documentElement.scrollWidth > innerWidth + 1 ||
              host.scrollWidth > host.clientWidth + 1,
            inputs: inputs.length,
            clippedInputs: inputs
              .filter((el) => {
                const r = el.getBoundingClientRect();
                const p = el.parentElement.getBoundingClientRect();
                return r.left < p.left - 1 || r.right > p.right + 1;
              })
              .map(
                (el) => el.id || el.getAttribute("aria-label") || el.tagName,
              ),
          };
        });
        results.push({ key, ...geometry, errors: [...errors] });
        await page.screenshot({ path: path.join(out, `${key}.png`) });
        if (tab === "Business profile") {
          const country = page.locator('select[name="registeredIsoCountry"]');
          if ((await country.inputValue()) !== "US")
            throw new Error("Country dropdown lost stored value");
          const usePlace = page.getByRole("button", {
            name: "Use Harness City, NY",
            exact: true,
          });
          await usePlace.click();
          if (
            (await page.locator('[name="registeredCity"]').inputValue()) !==
              "Harness City" ||
            (await page
              .locator('select[name="registeredRegion"]')
              .inputValue()) !== "NY"
          )
            throw new Error("ZIP suggestion did not populate address draft");
          await country.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: path.join(
              out,
              `${width}x${height}-${theme}-address-dropdowns.png`,
            ),
          });
          await page
            .getByRole("textbox", {
              name: "Search NAICS by code or business activity",
            })
            .fill("management");
          const result = page.locator(".setup-result-list button").first();
          await result.click();
          if (
            (await page.locator('[name="naicsCode"]').inputValue()) !== "541611"
          )
            throw new Error("NAICS selection did not reach draft");
          await page.screenshot({
            path: path.join(
              out,
              `${width}x${height}-${theme}-naics-selected.png`,
            ),
          });
        }
      }
      await page
        .getByRole("button", { name: "Teach Paige", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      results.push({
        key: `${width}x${height}-${theme}-drawer`,
        ...(await dialog.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            horizontal: r.left < 0 || r.right > innerWidth + 1,
            top: r.top,
            bottom: r.bottom,
            viewportHeight: innerHeight,
          };
        })),
      });
      await page.screenshot({
        path: path.join(out, `${width}x${height}-${theme}-drawer.png`),
      });
      await context.close();
    }
} finally {
  await browser?.close();
  await new Promise((resolve) => {
    const stop = spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    stop.once("exit", resolve);
    stop.once("error", resolve);
  });
  fs.writeFileSync(
    path.join(out, "report.json"),
    JSON.stringify(
      {
        evidence:
          "Rendered structural, synthetic transport. Authenticated Runtime Proof Owed.",
        results,
      },
      null,
      2,
    ),
  );
}
console.log(
  JSON.stringify(
    {
      count: results.length,
      horizontalFailures: results.filter((r) => r.horizontal),
      runtimeErrors: results.filter((r) => r.errors?.length),
      out,
    },
    null,
    2,
  ),
);
if (
  results.length !== 88 ||
  results.some(
    (r) => r.horizontal || r.errors?.length || r.clippedInputs?.length,
  )
)
  throw new Error("Structural Setup render failed: inspect report.json");
