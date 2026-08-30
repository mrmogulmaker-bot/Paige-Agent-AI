import fs from "node:fs";
import path from "node:path";
import { DEFAULT_ARTIFACTS_DIR, buildLaunchOptions, resolvePlaywright } from "./live-drive.mjs";

const BASE = process.env.MARKETPLACE_HARNESS_URL || "http://127.0.0.1:5202";
const OUT = path.join(DEFAULT_ARTIFACTS_DIR, "marketplace-form-fit");
const frames = [{ name: "1536x770", width: 1536, height: 770 }, { name: "1366x768", width: 1366, height: 768 }, { name: "1024x768", width: 1024, height: 768 }, { name: "900x1000", width: 900, height: 1000 }];
const themes = [{ name: "Obsidian", value: "dark" }, { name: "Mineral", value: "light" }];
const railStates = [{ name: "paige-folded", value: "folded" }, { name: "paige-open", value: "open" }];
const failures = []; const rows = [];
const check = (ok, label, detail = "") => { if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const options = buildLaunchOptions();
const launch = options.proxy ? { ...options, proxy: { ...options.proxy, bypass: "127.0.0.1,localhost,::1" } } : options;
const pw = await resolvePlaywright(); const browser = await pw.chromium.launch(launch); fs.mkdirSync(OUT, { recursive: true });

for (const frame of frames) for (const theme of themes) for (const rail of railStates) {
  const ctx = await browser.newContext({ viewport: { width: frame.width, height: frame.height } });
  const page = await ctx.newPage(); const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${BASE}/?theme=${theme.value}&paige=${rail.value}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mk-workspace");
  const measurement = await page.evaluate(() => {
    const de = document.documentElement; const workspace = document.querySelector(".mk-workspace"); const body = document.querySelector(".mk-body");
    const shellMain = document.querySelector(".tcs-main"); const frameMain = document.querySelector("[data-marketplace-frame-main]"); const paige = document.querySelector(".tcs-paige");
    const rect = (element) => element ? element.getBoundingClientRect() : null;
    const scrollers = [shellMain, frameMain, body].map((element) => ({ name: element?.className || element?.getAttribute?.("data-marketplace-frame-main") || "missing", range: element ? element.scrollHeight - element.clientHeight : -1, overflow: element ? getComputedStyle(element).overflowY : "missing" }));
    const clipped = [...document.querySelectorAll(".mk-workspace *")].filter((element) => {
      if (element.closest(".mk-card-rail,.mk-tablist,.mk-filters")) return false;
      const r = element.getBoundingClientRect(); return r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1);
    }).slice(0, 8).map((element) => `${element.tagName}.${element.className}`);
    return { documentX: de.scrollWidth - de.clientWidth, documentY: de.scrollHeight - de.clientHeight, workspace: rect(workspace), body: rect(body), hero: rect(document.querySelector(".mk-hero")), paige: rect(paige),
      bodyClientWidth: body?.clientWidth, bodyScrollWidth: body?.scrollWidth, bodyBox: body ? getComputedStyle(body).boxSizing : "missing",
      scrollers, clipped, cards: document.querySelectorAll(".mk-card").length, tabs: document.querySelectorAll(".mk-tablist button").length,
      workspaceCount: document.querySelectorAll('[data-marketplace-paige-workspace="true"]').length,
      dataPaige: document.querySelector("[data-tenant-shell]")?.getAttribute("data-paige"), dataPg: de.getAttribute("data-pg"),
      bodyBg: getComputedStyle(document.body).backgroundColor, text: workspace?.textContent || "" };
  });
  const id = `${frame.name}-${theme.name}-${rail.name}`; rows.push({ id, ...measurement });
  await page.screenshot({ path: path.join(OUT, `${id}.png`) });
  check(measurement.documentX <= 1, `${id}: document horizontal overflow`, `${measurement.documentX}px`);
  check(measurement.documentY <= 1, `${id}: document vertical overflow`, `${measurement.documentY}px`);
  check(measurement.clipped.length === 0, `${id}: clipped Marketplace content`, measurement.clipped.join(", "));
  check(measurement.cards === 5 && measurement.tabs === 4, `${id}: expected content missing`, `${measurement.cards} cards / ${measurement.tabs} views`);
  check(measurement.workspaceCount === 1, `${id}: PAIGE workspace count`, String(measurement.workspaceCount));
  check(measurement.dataPaige === (rail.value === "open" ? "open" : "closed"), `${id}: PAIGE state`, String(measurement.dataPaige));
  check(measurement.dataPg === theme.value, `${id}: theme state`, String(measurement.dataPg));
  const [shellScroll, frameScroll, marketplaceScroll] = measurement.scrollers;
  check(shellScroll.range <= 1 && frameScroll.range <= 1 && marketplaceScroll.overflow === "auto", `${id}: Marketplace must own any required scroll`, JSON.stringify(measurement.scrollers));
  check(!/Editors.? pick|Top charts|ratings?|Recommended for you|Install now|Update all/i.test(measurement.text), `${id}: unsupported claim rendered`);
  await ctx.close();
}

for (const theme of themes) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } }); const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=${theme.value}&paige=folded`, { waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: /Synthetic workflow proof/i }).click();
  await page.waitForSelector('[role="dialog"]');
  const detail = await page.evaluate(() => { const dialog = document.querySelector('[role="dialog"]'); const close = dialog?.querySelector('[aria-label="Close capability details"]'); const r = close?.getBoundingClientRect(); return { closeVisible: !!r && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, inert: document.querySelector(".mk-page")?.hasAttribute("inert"), focusInside: !!dialog?.contains(document.activeElement) }; });
  check(detail.closeVisible && detail.inert && detail.focusInside, `900x1000-${theme.name}-paige-folded: detail containment`, JSON.stringify(detail));
  await page.screenshot({ path: path.join(OUT, `900x1000-${theme.name}-paige-folded-detail.png`) });
  await page.getByRole("button", { name: "Open PAIGE workspace" }).click();
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  await page.waitForFunction(() => document.querySelector("[data-tenant-shell]")?.getAttribute("data-paige") === "open");
  const paigeHandoff = await page.evaluate(() => ({ workspaces: document.querySelectorAll('[data-marketplace-paige-workspace="true"]').length, dialog: !!document.querySelector('[role="dialog"]') }));
  check(paigeHandoff.workspaces === 1 && !paigeHandoff.dialog, `900x1000-${theme.name}: detail closes before PAIGE opens`, JSON.stringify(paigeHandoff));
  await ctx.close();
}

const dark = rows.find((row) => row.id.startsWith("1366x768-Obsidian"))?.bodyBg; const light = rows.find((row) => row.id.startsWith("1366x768-Mineral"))?.bodyBg;
check(dark && light && dark !== light, "Mineral and Obsidian grounds must differ", `${dark} / ${light}`);
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), rows, failures }, null, 2));
await browser.close();
if (failures.length) { console.error(JSON.stringify({ status: "FAIL", failures }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ status: "PASS", frames: rows.length, screenshots: rows.length + themes.length, output: OUT }, null, 2));
