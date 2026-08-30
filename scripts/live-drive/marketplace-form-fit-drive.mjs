import fs from "node:fs";
import path from "node:path";
import { DEFAULT_ARTIFACTS_DIR, buildLaunchOptions, resolvePlaywright } from "./live-drive.mjs";

const BASE = process.env.MARKETPLACE_HARNESS_URL || "http://127.0.0.1:5202";
const OUT = path.join(DEFAULT_ARTIFACTS_DIR, "marketplace-form-fit");
const frames = [{ name: "1536x770", width: 1536, height: 770 }, { name: "1366x768", width: 1366, height: 768 }, { name: "1024x768", width: 1024, height: 768 }, { name: "900x1000", width: 900, height: 1000 }];
const themes = [{ name: "Obsidian", value: "dark" }, { name: "Mineral", value: "light" }];
const railStates = [{ name: "paige-folded", value: "folded" }, { name: "paige-open", value: "open" }];
const tabLabels = ["Today", "Browse", "Installed", "Updates"];
const failures = []; const rows = [];
const verticalInputProof = { wheel: 0, keyboard: 0, scrollbar: 0, touch: 0 };
const check = (ok, label, detail = "") => { if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const options = buildLaunchOptions();
const launch = options.proxy ? { ...options, proxy: { ...options.proxy, bypass: "127.0.0.1,localhost,::1" } } : options;
const pw = await resolvePlaywright(); const browser = await pw.chromium.launch(launch); fs.mkdirSync(OUT, { recursive: true });
async function waitForStableGeometry(page, expectedPaige) {
  await page.waitForFunction((expected) => document.querySelector("[data-tenant-shell]")?.getAttribute("data-paige") === expected, expectedPaige);
  let prior = ""; let stableSamples = 0;
  for (let sample = 0; sample < 12 && stableSamples < 3; sample += 1) {
    const signature = await page.evaluate(() => {
      const frame = document.querySelector("[data-marketplace-frame-main]")?.getBoundingClientRect();
      const body = document.querySelector(".mk-body")?.getBoundingClientRect();
      return frame && body ? [frame.x, frame.width, body.x, body.width].map((value) => Math.round(value * 10) / 10).join(":") : "missing";
    });
    stableSamples = signature === prior && signature !== "missing" ? stableSamples + 1 : 0; prior = signature;
    await page.waitForTimeout(100);
  }
  if (stableSamples < 3) throw new Error(`Marketplace geometry did not stabilize for PAIGE ${expectedPaige}: ${prior}`);
}

for (const frame of frames) for (const theme of themes) for (const rail of railStates) {
  const ctx = await browser.newContext({ viewport: { width: frame.width, height: frame.height } });
  const page = await ctx.newPage(); const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${BASE}/?theme=${theme.value}&paige=${rail.value}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mk-workspace");
  await waitForStableGeometry(page, rail.value === "open" ? "open" : "closed");
  const measurement = await page.evaluate(() => {
    const de = document.documentElement; const workspace = document.querySelector(".mk-workspace"); const body = document.querySelector(".mk-body"); const catalogueGrid = document.querySelector(".mk-catalogue-grid");
    const shellMain = document.querySelector(".tcs-main"); const frameMain = document.querySelector("[data-marketplace-frame-main]"); const paige = document.querySelector(".tcs-paige");
    const rect = (element) => element ? element.getBoundingClientRect() : null;
    const scrollers = [shellMain, frameMain, body].map((element) => ({ name: element?.className || element?.getAttribute?.("data-marketplace-frame-main") || "missing", range: element ? element.scrollHeight - element.clientHeight : -1, overflow: element ? getComputedStyle(element).overflowY : "missing" }));
    const clipped = [...document.querySelectorAll(".mk-workspace *")].filter((element) => {
      if (element.closest(".mk-card-rail,.mk-tablist,.mk-filters")) return false;
      const r = element.getBoundingClientRect(); return r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1);
    }).slice(0, 8).map((element) => `${element.tagName}.${element.className}`);
    return { documentX: de.scrollWidth - de.clientWidth, documentY: de.scrollHeight - de.clientHeight, workspace: rect(workspace), body: rect(body), intro: rect(document.querySelector(".mk-catalogue-intro")), paige: rect(paige),
      bodyClientWidth: body?.clientWidth, bodyScrollWidth: body?.scrollWidth, bodyBox: body ? getComputedStyle(body).boxSizing : "missing", bodyScrollbar: body ? getComputedStyle(body).scrollbarWidth : "missing",
      gridX: catalogueGrid ? catalogueGrid.scrollWidth - catalogueGrid.clientWidth : 0,
      scrollers, clipped, cards: document.querySelectorAll(".mk-card").length, tabs: document.querySelectorAll(".mk-tablist button").length,
      workspaceCount: document.querySelectorAll('[data-marketplace-paige-workspace="true"]').length,
      dataPaige: document.querySelector("[data-tenant-shell]")?.getAttribute("data-paige"), dataPg: de.getAttribute("data-pg"),
      bodyBg: getComputedStyle(document.body).backgroundColor, introTitleColor: getComputedStyle(document.querySelector(".mk-catalogue-intro h1")).color,
      introButton: (() => { const style = getComputedStyle(document.querySelector(".mk-catalogue-intro .btn")); return { background: style.backgroundColor, color: style.color }; })(), text: workspace?.textContent || "" };
  });
  const id = `${frame.name}-${theme.name}-${rail.name}`; rows.push({ id, ...measurement, errors });
  await page.screenshot({ path: path.join(OUT, `${id}.png`) });
  check(measurement.documentX <= 1, `${id}: document horizontal overflow`, `${measurement.documentX}px`);
  check(measurement.documentY <= 1, `${id}: document vertical overflow`, `${measurement.documentY}px`);
  check(measurement.gridX <= 1, `${id}: catalogue grid horizontal overflow`, `${measurement.gridX}px`);
  check(measurement.clipped.length === 0, `${id}: clipped Marketplace content`, measurement.clipped.join(", "));
  check(measurement.cards === 5 && measurement.tabs === 4, `${id}: expected content missing`, `${measurement.cards} cards / ${measurement.tabs} views`);
  check(measurement.workspaceCount === 1, `${id}: PAIGE workspace count`, String(measurement.workspaceCount));
  check(errors.length === 0, `${id}: browser runtime errors`, errors.join(" | "));
  check(measurement.dataPaige === (rail.value === "open" ? "open" : "closed"), `${id}: PAIGE state`, String(measurement.dataPaige));
  check(measurement.dataPg === theme.value, `${id}: theme state`, String(measurement.dataPg));
  check(Boolean(measurement.intro) && measurement.introTitleColor === "rgb(255, 255, 255)", `${id}: catalogue intro heading must use the high-contrast hero color`, String(measurement.introTitleColor));
  check(measurement.introButton.background !== "rgba(0, 0, 0, 0)" && measurement.introButton.color !== measurement.introButton.background, `${id}: catalogue intro action must retain a distinct high-contrast fill`, JSON.stringify(measurement.introButton));
  const [shellScroll, frameScroll, marketplaceScroll] = measurement.scrollers;
  check(shellScroll.range <= 1 && frameScroll.range <= 1 && marketplaceScroll.overflow === "auto", `${id}: Marketplace must own any required scroll`, JSON.stringify(measurement.scrollers));
  check(!/Editors.? pick|Top charts|ratings?|Recommended because|Install it|Activate Paige|autonomous execution|purchasing this connector|proven outcomes|Paige (?:builds|handles)|talk to Paige|Update all/i.test(measurement.text), `${id}: unsupported claim rendered`);
  if (rail.value === "folded") {
    const scrollOwner = page.locator('[data-marketplace-scroll-owner="catalogue"]');
    const scrollRange = await scrollOwner.evaluate((node) => node.scrollHeight - node.clientHeight);
    const scrollBox = await scrollOwner.boundingBox();
    if (scrollBox && scrollRange > 0) {
      await scrollOwner.evaluate((node) => { node.scrollTop = 0; }); await page.mouse.move(scrollBox.x + scrollBox.width / 2, scrollBox.y + scrollBox.height / 2); await page.mouse.wheel(0, 480); await page.waitForTimeout(100);
      const wheelMoved = (await scrollOwner.evaluate((node) => node.scrollTop)) > 0; check(wheelMoved, `${id}: mouse wheel must move the catalogue scroll owner`); if (wheelMoved) verticalInputProof.wheel += 1;
      await scrollOwner.evaluate((node) => { node.scrollTop = 0; node.focus(); }); await page.keyboard.press("PageDown"); await page.waitForTimeout(100);
      const keyboardMoved = (await scrollOwner.evaluate((node) => node.scrollTop)) > 0; check(keyboardMoved, `${id}: keyboard must move the catalogue scroll owner`); if (keyboardMoved) verticalInputProof.keyboard += 1;
      await scrollOwner.evaluate((node) => { node.scrollTop = 0; });
      await page.mouse.move(scrollBox.x + scrollBox.width - 5, scrollBox.y + 18); await page.mouse.down(); await page.mouse.move(scrollBox.x + scrollBox.width - 5, scrollBox.y + scrollBox.height - 18, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(100);
      const scrollbarMoved = (await scrollOwner.evaluate((node) => node.scrollTop)) > 0; check(scrollbarMoved, `${id}: visible scrollbar must move the catalogue scroll owner`, measurement.bodyScrollbar); if (scrollbarMoved) verticalInputProof.scrollbar += 1;
      await scrollOwner.evaluate((node) => { node.scrollTop = 0; });
    }
    const card = page.locator(".mk-card").first();
    const idleCard = await card.evaluate((node) => { const style = getComputedStyle(node); return { border: style.borderColor, shadow: style.boxShadow, transform: style.transform }; });
    await card.hover();
    await page.waitForTimeout(220);
    const hoverCard = await card.evaluate((node) => { const style = getComputedStyle(node); return { border: style.borderColor, shadow: style.boxShadow, transform: style.transform }; });
    check(hoverCard.border !== idleCard.border && hoverCard.shadow !== idleCard.shadow, `${id}: card hover must visibly light`, JSON.stringify({ idleCard, hoverCard }));
    const box = await card.boundingBox();
    if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(60); }
    const pressedCard = await card.evaluate((node) => { const style = getComputedStyle(node); return { shadow: style.boxShadow, transform: style.transform }; });
    await page.mouse.move(1, 1); await page.mouse.up();
    check(pressedCard.transform !== hoverCard.transform && pressedCard.shadow !== hoverCard.shadow, `${id}: pressed state must differ from hover`, JSON.stringify({ hoverCard, pressedCard }));
    await page.getByRole("button", { name: "Today", exact: true }).evaluate((node) => node.focus());
    await page.keyboard.press("Tab");
    const focusStyle = await page.getByRole("button", { name: "Browse", exact: true }).evaluate((node) => { const style = getComputedStyle(node); return { outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow }; });
    check(focusStyle.outline !== "none" && focusStyle.width !== "0px", `${id}: keyboard focus must match hover visibility`, JSON.stringify(focusStyle));
    await page.mouse.move(1, 1);
    await card.evaluate((node) => { node.disabled = true; });
    await page.waitForTimeout(220);
    const disabledIdle = await card.evaluate((node) => { const style = getComputedStyle(node); return { background: style.backgroundColor, border: style.borderColor, shadow: style.boxShadow, transform: style.transform }; });
    await card.hover(); await page.waitForTimeout(220);
    const disabledHover = await card.evaluate((node) => { const style = getComputedStyle(node); return { background: style.backgroundColor, border: style.borderColor, shadow: style.boxShadow, transform: style.transform }; });
    const disabledBox = await card.boundingBox();
    if (disabledBox) { await page.mouse.move(disabledBox.x + disabledBox.width / 2, disabledBox.y + disabledBox.height / 2); await page.mouse.down(); await page.waitForTimeout(60); }
    const disabledPressed = await card.evaluate((node) => { const style = getComputedStyle(node); return { background: style.backgroundColor, border: style.borderColor, shadow: style.boxShadow, transform: style.transform }; });
    await page.mouse.up();
    check(JSON.stringify(disabledIdle) === JSON.stringify(disabledHover) && JSON.stringify(disabledIdle) === JSON.stringify(disabledPressed), `${id}: disabled control must stay visually inert`, JSON.stringify({ disabledIdle, disabledHover, disabledPressed }));
    check(!(await page.locator('[role="dialog"]').isVisible()), `${id}: disabled control must not activate`);
  }
  for (const label of tabLabels) {
    await page.getByRole("button", { name: label, exact: true }).evaluate((control) => control.click());
    const tabState = await page.evaluate(() => ({
      active: document.querySelector('.mk-tablist button[aria-current="page"]')?.textContent?.trim(),
      documentX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      documentY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      text: document.querySelector(".mk-workspace")?.textContent || "",
      mutationControls: [...document.querySelectorAll(".mk-workspace button:not([disabled])")].map((control) => control.textContent || "").filter((text) => /^(Install|Update all|Remove|Buy|Purchase|Activate|Execute)$/i.test(text.trim())),
    }));
    check(tabState.active === label, `${id}-${label}: active Marketplace tab`, String(tabState.active));
    check(tabState.documentX <= 1 && tabState.documentY <= 1, `${id}-${label}: document overflow`, `${tabState.documentX}px / ${tabState.documentY}px`);
    check(tabState.mutationControls.length === 0, `${id}-${label}: mutation control rendered`, tabState.mutationControls.join(", "));
    check(!/Editors.? pick|Top charts|ratings?|Recommended because|Install it|Activate Paige|autonomous execution|purchasing this connector|proven outcomes|Paige (?:builds|handles)|talk to Paige|Update all/i.test(tabState.text), `${id}-${label}: unsupported claim rendered`);
  }
  await ctx.close();
}

for (const theme of themes) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } }); const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=${theme.value}&paige=folded`, { waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: /Synthetic workflow proof/i }).click();
  await page.waitForSelector('[role="dialog"]');
  const detail = await page.evaluate(() => { const dialog = document.querySelector('[role="dialog"]'); const close = dialog?.querySelector('[aria-label="Close capability details"]'); const r = close?.getBoundingClientRect(); return { closeVisible: !!r && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, inert: document.querySelector(".mk-page")?.hasAttribute("inert"), focusInside: !!dialog?.contains(document.activeElement) }; });
  check(detail.closeVisible && detail.inert && detail.focusInside, `900x1000-${theme.name}-paige-folded: detail containment`, JSON.stringify(detail));
  await page.screenshot({ path: path.join(OUT, `900x1000-${theme.name}-paige-folded-detail.png`) });
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  const escapeFocus = await page.evaluate(() => ({ label: document.activeElement?.getAttribute("aria-label"), inert: document.querySelector(".mk-page")?.hasAttribute("inert") }));
  check(escapeFocus.label === "Review Synthetic workflow proof" && !escapeFocus.inert, `900x1000-${theme.name}: Escape restores originating card focus`, JSON.stringify(escapeFocus));
  await page.getByRole("button", { name: /Synthetic workflow proof/i }).click();
  await page.waitForSelector('[role="dialog"]');
  await page.getByRole("button", { name: "Open PAIGE workspace" }).click();
  await page.waitForSelector('[role="dialog"]', { state: "detached" });
  await page.waitForFunction(() => document.querySelector("[data-tenant-shell]")?.getAttribute("data-paige") === "open");
  const paigeHandoff = await page.evaluate(() => ({ workspaces: document.querySelectorAll('[data-marketplace-paige-workspace="true"]').length, dialog: !!document.querySelector('[role="dialog"]') }));
  check(paigeHandoff.workspaces === 1 && !paigeHandoff.dialog, `900x1000-${theme.name}: detail closes before PAIGE opens`, JSON.stringify(paigeHandoff));
  await ctx.close();
}

const dark = rows.find((row) => row.id.startsWith("1366x768-Obsidian"))?.bodyBg; const light = rows.find((row) => row.id.startsWith("1366x768-Mineral"))?.bodyBg;
check(dark && light && dark !== light, "Mineral and Obsidian grounds must differ", `${dark} / ${light}`);
for (const theme of themes) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" }); const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=${theme.value}&paige=folded`, { waitUntil: "domcontentloaded" }); const card = page.locator(".mk-card").first(); await card.hover();
  const motion = await card.evaluate((node) => { const style = getComputedStyle(node); return { transform: style.transform, duration: style.transitionDuration }; });
  check(motion.transform === "none" && Number.parseFloat(motion.duration) <= .001, `${theme.name}: reduced motion must preserve light without movement`, JSON.stringify(motion));
  await page.mouse.move(1, 1); await card.evaluate((node) => { node.disabled = true; });
  const disabledIdle = await card.evaluate((node) => { const style = getComputedStyle(node); return { shadow: style.boxShadow, transform: style.transform }; });
  await card.hover(); const disabledHover = await card.evaluate((node) => { const style = getComputedStyle(node); return { shadow: style.boxShadow, transform: style.transform }; });
  check(JSON.stringify(disabledIdle) === JSON.stringify(disabledHover), `${theme.name}: reduced-motion disabled control must stay inert`, JSON.stringify({ disabledIdle, disabledHover })); await ctx.close();
}
for (const theme of themes) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 }, hasTouch: true, isMobile: true }); const page = await ctx.newPage();
  await page.goto(`${BASE}/?theme=${theme.value}&paige=folded`, { waitUntil: "domcontentloaded" });
  const touch = await page.evaluate(() => matchMedia("(hover:hover) and (pointer:fine)").matches);
  check(!touch, `${theme.name}: touch viewport must not receive fine-pointer hover behavior`, String(touch));
  const scrollOwner = page.locator('[data-marketplace-scroll-owner="catalogue"]'); const scrollBox = await scrollOwner.boundingBox();
  if (scrollBox) {
    const cdp = await ctx.newCDPSession(page); const x = Math.round(scrollBox.x + scrollBox.width / 2); const startY = Math.round(scrollBox.y + scrollBox.height * .76); const endY = Math.round(scrollBox.y + scrollBox.height * .24);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY }] });
    for (let step = 1; step <= 6; step += 1) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: Math.round(startY + (endY - startY) * step / 6) }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await page.waitForTimeout(160);
    const touchMoved = (await scrollOwner.evaluate((node) => node.scrollTop)) > 0; check(touchMoved, `${theme.name}: touch swipe must move the catalogue scroll owner`); if (touchMoved) verticalInputProof.touch += 1; await scrollOwner.evaluate((node) => { node.scrollTop = 0; });
  }
  const card = page.locator(".mk-card").first(); await card.evaluate((node) => { node.disabled = true; }); await card.tap({ force: true });
  check(!(await page.locator('[role="dialog"]').isVisible()), `${theme.name}: disabled touch control must not activate`);
  await card.evaluate((node) => { node.disabled = false; }); await card.tap();
  check(await page.locator('[role="dialog"]').isVisible(), `${theme.name}: enabled touch tap must open capability detail`); await ctx.close();
}
for (const [input, count] of Object.entries(verticalInputProof)) check(count > 0, `vertical catalogue must have positive ${input} browsing proof`, String(count));
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), rows, failures }, null, 2));
await browser.close();
if (failures.length) { console.error(JSON.stringify({ status: "FAIL", failures }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ status: "PASS", frames: rows.length, screenshots: rows.length + themes.length, output: OUT }, null, 2));
