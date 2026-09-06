import { resolvePlaywright, resolveExecutablePath } from "./live-drive.mjs";

const base = process.env.SOLO_DRIVE_URL || "http://127.0.0.1:8080/solo-drive.html";
const viewports = [
  { width: 1536, height: 770 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 900, height: 1000 },
];
const paigeStates = [
  { name: "closed", sessionCount: "8" },
  { name: "open", sessionCount: "2" },
];
const pw = await resolvePlaywright();
const executablePath = resolveExecutablePath();
const browser = await pw.chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  ...(executablePath ? { executablePath } : {}),
});

const measure = (page, label) => page.evaluate((sampleLabel) => {
  const outer = document.querySelector("#tenant-shell-main");
  const frame = document.querySelector(".paige-solo");
  const screen = document.querySelector("[data-solo-screen-host]");
  const box = (node) => node ? node.getBoundingClientRect().toJSON() : null;
  const outerBox = box(outer);
  const frameBox = box(frame);
  return {
    label: sampleLabel,
    route: document.querySelector('[aria-current="page"][data-tenant-destination]')?.getAttribute("data-tenant-destination") ?? "command-center",
    outer: outerBox,
    frame: frameBox,
    screen: box(screen),
    frameOwnsWidth: Boolean(outerBox && frameBox && Math.abs(outerBox.left - frameBox.left) < 1 && Math.abs(outerBox.width - frameBox.width) < 1),
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
}, label);

const report = [];
try {
  for (const viewport of viewports) for (const paigeState of paigeStates) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript((sessionCount) => {
      localStorage.setItem("paige.agentRail.sessionCount", sessionCount);
      localStorage.setItem("paige.agentRail.collapsed", "true");
    }, paigeState.sessionCount);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector(".paige-solo");
    await page.waitForTimeout(250);
    const samples = [await measure(page, "post-login-equivalent mount")];


    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".paige-solo");
    await page.waitForTimeout(250);
    samples.push(await measure(page, "refresh"));

    report.push({ viewport, paigeState: paigeState.name, samples, pageErrors });
    await context.close();
  }
} finally {
  await browser.close();
}

const failures = report.flatMap(({ viewport, paigeState, samples, pageErrors }) => [
  ...samples.filter((sample) => !sample.frameOwnsWidth || sample.horizontalOverflow).map((sample) => ({ viewport, paigeState, sample })),
  ...pageErrors.map((error) => ({ viewport, paigeState, error })),
]);
console.log(JSON.stringify({ report, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;