/**
 * Settings › Integrations — geometry, scroll-ownership and interaction drive.
 *
 * Renders the SHIPPED surface through the harness mount (see
 * `harness/integrations-mount/main.tsx` for exactly what is real and what is
 * stubbed) and measures it at the four viewports the owner named.
 *
 * It asserts, per viewport and per theme:
 *   - no horizontal overflow on the document or on any element;
 *   - exactly one vertical scroll owner (the shell), never a nested scroller
 *     inside the page;
 *   - no clipped card or control (a laid-out box wider/taller than its scroll
 *     box, or a zero-height visible control);
 *   - no oversized dead space above the first card.
 *
 * It then drives the real interaction states and captures each: hover, keyboard
 * focus, the open panel, the connect form, a rejected write, the disconnect
 * confirmation, the permission-denied state, and reduced motion.
 *
 * Frames land in `scripts/live-drive/artifacts/` (gitignored). §13: this proves
 * layout and interaction of a LOCAL render. It is not a deployed-surface proof
 * and contacts no real provider.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

/** Waits for every running animation/transition to finish before a frame is taken. */
const settle = async (target) => {
  await target.evaluate(() => Promise.all(
    document.getAnimations().map((a) => a.finished.catch(() => {})),
  ));
  await target.waitForTimeout(60);
};

const BASE = process.env.HARNESS_URL || "http://127.0.0.1:5203";
const OUT = path.resolve(import.meta.dirname, "artifacts");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "1536x770", width: 1536, height: 770 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "900x1000", width: 900, height: 1000 },
];

/** Runs in the page. Returns measurements, never opinions. */
const measure = () => {
  const doc = document.scrollingElement;
  const scrollers = [];
  for (const el of Array.from(document.querySelectorAll("*"))) {
    const style = getComputedStyle(el);
    const scrollsY = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const scrollsX = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (scrollsY || scrollsX) {
      scrollers.push({
        selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : ""),
        y: scrollsY, x: scrollsX,
      });
    }
  }
  const clipped = [];
  for (const el of Array.from(document.querySelectorAll(".ig-card, .ig-btn, .ig-bar button, .ss-subtab, .ig-field input, .ig-panel"))) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) { clipped.push({ el: el.className, why: "zero box" }); continue; }
    if (el.scrollWidth > el.clientWidth + 1 && style.overflowX === "hidden") {
      clipped.push({ el: el.className, why: `content ${el.scrollWidth} > box ${el.clientWidth}` });
    }
  }
  const firstCard = document.querySelector(".ig-card, .ig-state");
  const shell = document.querySelector("#tenant-shell-main");
  // The FRAME OF REFERENCE for "above the fold" (corrected 2026-08-31). This drive
  // used to measure against the browser viewport, which was right only because the
  // harness faked the shell as a bare full-height <main> with no chrome above it.
  // The real chain puts a fixed rail and command row above the scroll owner — space
  // the surface neither controls nor can scroll away — so measuring from the viewport
  // charges the surface for its shell. The fold this check is about is the scroll
  // PORT: the box the surface actually gets. Same 34% budget, correct origin; a
  // surface that buries its own content a third of the way down its port still fails.
  const port = document.querySelector("[data-solo-screen-host]") ?? shell;
  const portBox = port ? port.getBoundingClientRect() : null;
  const portStyle = port ? getComputedStyle(port) : null;
  return {
    docScrollWidth: doc.scrollWidth,
    docClientWidth: doc.clientWidth,
    horizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
    scrollers,
    clipped,
    // Distance from the top of the SCROLL PORT to the first real content.
    contentStartsAt: firstCard && portBox
      ? Math.round(firstCard.getBoundingClientRect().top - portBox.top) : null,
    // The port's own height — the denominator the fold budget is measured against.
    portHeight: portBox ? Math.round(portBox.height) : null,
    portOverflowY: portStyle?.overflowY ?? null,
    portOverflowX: portStyle?.overflowX ?? null,
    portClasses: port instanceof HTMLElement ? [...port.classList] : [],
    portScrollHeight: port instanceof HTMLElement ? port.scrollHeight : null,
    portClientHeight: port instanceof HTMLElement ? port.clientHeight : null,
    // Space between the last card and the bottom of the port. Recorded so
    // "no oversized dead space" is a measurement rather than an impression.
    trailingSpace: (() => {
      const cards = document.querySelectorAll(".ig-card");
      const last = cards[cards.length - 1];
      if (!last || !portBox) return null;
      return Math.round(portBox.bottom - last.getBoundingClientRect().bottom);
    })(),
    headerHeight: document.querySelector(".ss-page-head")?.getBoundingClientRect().height ?? null,
    shellScrolls: shell ? shell.scrollHeight > shell.clientHeight + 1 : null,
    cards: document.querySelectorAll(".ig-card").length,
    h1: document.querySelector(".ss-page-head h1") ? Math.round(parseFloat(getComputedStyle(document.querySelector(".ss-page-head h1")).fontSize)) : null,
  };
};

const failures = [];
const report = [];

function check(label, condition, detail) {
  if (!condition) failures.push(`${label}: ${detail}`);
  report.push({ label, pass: Boolean(condition), detail });
}

const browser = await chromium.launch({
  ...(process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : {}),
  ignoreDefaultArgs: ["--hide-scrollbars"],
});

try {
  for (const theme of ["light", "dark"]) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto(`${BASE}/?theme=${theme}&data=connected`, { waitUntil: "networkidle" });
      await page.waitForSelector(".ig-card", { timeout: 10000 });
      const m = await page.evaluate(measure);

      const tag = `${theme}-${vp.name}`;
      check(`${tag} no horizontal overflow`, !m.horizontalOverflow, `doc ${m.docScrollWidth} vs ${m.docClientWidth}`);
      const inPageScrollers = m.scrollers.filter((s) => !s.selector.includes("tenant-shell-main"));
      check(`${tag} real Settings owner computes overflow-y:auto`,
        m.portOverflowY === "auto",
        `computed=${m.portOverflowY} classes=${m.portClasses.join(" ")} extent=${m.portScrollHeight}/${m.portClientHeight}`);
      check(`${tag} real SoloSettings applied the visible-scroll contract`,
        m.portClasses.includes("tcs-main--settings-scrollbar-shown"),
        `classes=${m.portClasses.join(" ")}`);
      check(`${tag} scroll owner keeps horizontal overflow hidden`, m.portOverflowX === "hidden", `computed=${m.portOverflowX}`);
      check(`${tag} one vertical scroll owner`, inPageScrollers.filter((s) => s.y).length === 0,
        `nested: ${JSON.stringify(inPageScrollers.filter((s) => s.y))}`);
      check(`${tag} no element scrolls horizontally`, m.scrollers.filter((s) => s.x).length === 0,
        `x-scrollers: ${JSON.stringify(m.scrollers.filter((s) => s.x))}`);
      check(`${tag} nothing clipped`, m.clipped.length === 0, JSON.stringify(m.clipped));
      check(`${tag} content is above the fold`,
        m.contentStartsAt !== null && m.portHeight !== null && m.contentStartsAt < m.portHeight * 0.34,
        `first content at ${m.contentStartsAt}px into a ${m.portHeight}px scroll port `
        + `(${vp.height}px viewport, page header ${Math.round(m.headerHeight)}px)`);
      check(`${tag} every provider rendered`, m.cards === 8, `${m.cards} cards`);

      // Every design token this surface REFERENCES must actually resolve. An
      // undefined `var(--pg-…)` does not fail loudly: the declaration is simply
      // dropped, so a focus ring silently loses its colour and an error stops
      // reading as an error. Found exactly that way — `--pg-destructive`,
      // `--pg-success` and `--pg-accent` do not exist; the real names are
      // `--pg-negative`, `--pg-positive` and `--pg-violet`.
      const tokens = await page.evaluate(() => {
        // Scoped to the rules this slice owns (`.ig-*`), and only to references
        // with NO fallback — `var(--x, 12px)` is fine by construction. Other
        // stylesheets carry their own pre-existing gaps; fixing those is not
        // this slice's business and would reach protected surfaces.
        const used = new Set();
        for (const sheet of Array.from(document.styleSheets)) {
          let rules; try { rules = sheet.cssRules; } catch { continue; }
          for (const rule of Array.from(rules ?? [])) {
            const text = rule.cssText ?? "";
            if (!text.includes(".ig-")) continue;
            for (const m of text.matchAll(/var\((--pg-[a-z0-9-]+)\s*\)/g)) used.add(m[1]);
          }
        }
        const root = getComputedStyle(document.documentElement);
        return Array.from(used).filter((name) => !root.getPropertyValue(name).trim());
      });
      check(`${tag} every --pg token this slice references resolves`, tokens.length === 0, `undefined: ${tokens.join(", ")}`);

      report.push({ label: `${tag} trailing space below the last card`, pass: true, detail: `${m.trailingSpace}px of a ${m.portHeight}px port` });
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `integrations-${tag}.png`), fullPage: false });
      await page.close();
    }
  }

  // Mutation control: remove the production Settings-only overflow grant. The
  // Integrations catalogue can FIT at a tall viewport, so geometry alone can stay
  // green even when the form-fit law has taken its scroll owner away. Computed
  // overflow must fail independently of whether this particular data set overflows.
  const control = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  await control.goto(`${BASE}/?theme=dark&data=connected`, { waitUntil: "networkidle" });
  await control.waitForSelector(".ig-card", { timeout: 10000 });
  const killed = await control.evaluate(() => {
    let deleted = 0;
    for (const sheet of [...document.styleSheets]) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (let i = rules.length - 1; i >= 0; i -= 1) {
        const rule = rules[i];
        const selector = rule.selectorText || "";
        const grantsSettings = selector.includes(".paige-solo main")
          && (selector.includes(".solo-settings") || selector.includes("settings-scrollbar-shown") || selector.includes("settings-scrollbar-hidden"))
          && /auto|scroll/.test(rule.style?.getPropertyValue("overflow-y") || "")
          && rule.style?.getPropertyPriority("overflow-y") === "important";
        if (!grantsSettings) continue;
        sheet.deleteRule(i);
        deleted += 1;
      }
    }
    const port = document.querySelector("[data-solo-screen-host]");
    return { deleted, overflowY: port ? getComputedStyle(port).overflowY : null };
  });
  check("negative control · deleting the Settings overflow grant makes Integrations fail closed",
    killed.deleted > 0 && killed.overflowY === "hidden",
    `rules deleted=${killed.deleted}; computed overflow-y=${killed.overflowY}`);
  await control.close();

  // ── Interaction states, at the tightest common desktop width ───────────────
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

  await page.goto(`${BASE}/?theme=light&data=connected`, { waitUntil: "networkidle" });
  await page.hover(".ig-card[data-provider='n8n']");
  await settle(page);
  await page.screenshot({ path: path.join(OUT, "state-hover.png") });

  // Walk the real tab order rather than guessing a count: sub-tabs, then the
  // filter row, then the cards. Every stop must be a control, and a card must
  // be reachable without a pointer.
  const order = [];
  let reachedCard = false;
  for (let i = 0; i < 16 && !reachedCard; i += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        cls: typeof el.className === "string" ? el.className : "",
        text: (el.textContent || "").trim().slice(0, 24),
        outline: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0,
      };
    });
    if (!stop) break;
    order.push(stop);
    reachedCard = stop.cls.includes("ig-card");
  }
  check("keyboard reaches a provider card without a pointer", reachedCard,
    `stops: ${order.map((o) => o.text || o.cls).join(" > ")}`);
  check("every keyboard stop is a control", order.every((o) => o.tag === "BUTTON" || o.tag === "INPUT" || o.tag === "A"),
    JSON.stringify(order.map((o) => o.tag)));
  check("the focused card shows a visible focus ring", order.at(-1)?.outline === true,
    `outline on ${order.at(-1)?.cls}`);
  await settle(page);
  await page.screenshot({ path: path.join(OUT, "state-focus.png") });

  // Open panel on a connected instance: facts, masked key, manage + disconnect.
  await page.click(".ig-card[data-provider='n8n']");
  await page.waitForSelector("[role='dialog']");
  const panelText = await page.textContent("[role='dialog']");
  check("masked key only", panelText.includes("••••••••9f2a"), "last four shown");
  check("no key value on screen", !/n8n_api|sk-|secret/i.test(panelText), "panel text carries no key-like string");
  const panelGeom = await page.evaluate(() => {
    const p = document.querySelector(".ig-panel");
    const body = document.querySelector(".ig-panel-body");
    return { w: Math.round(p.getBoundingClientRect().width), bodyScrolls: body.scrollHeight > body.clientHeight + 1,
             docX: document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth + 1 };
  });
  check("panel causes no horizontal overflow", !panelGeom.docX, `panel ${panelGeom.w}px`);
  // Measured only after the entrance animation has finished: a frame or a
  // reading taken mid-animation says nothing about the resting surface.
  await settle(page);
  const opacity = await page.evaluate(() => {
    const p = document.querySelector(".ig-panel");
    const s = getComputedStyle(p);
    const bg = s.backgroundColor;
    const alpha = bg.startsWith("rgba") ? parseFloat(bg.split(",")[3]) : 1;
    return { opacity: parseFloat(s.opacity), bg, alpha };
  });
  check("the settled panel is fully opaque", opacity.opacity === 1 && opacity.alpha === 1,
    `opacity ${opacity.opacity}, background ${opacity.bg}`);
  await settle(page);
  await page.screenshot({ path: path.join(OUT, "state-panel-connected.png") });

  // The panel declares aria-modal, so focus must not escape it, and it must be
  // positioned against the viewport rather than trapped inside the surface's
  // own container (`.ss-integrations` sets container-type, which is one spec
  // change away from becoming a containing block for fixed descendants).
  const layer = await page.evaluate(() => {
    const l = document.querySelector(".ig-layer").getBoundingClientRect();
    return { t: l.top, left: l.left, w: Math.round(l.width), h: Math.round(l.height), vw: innerWidth, vh: innerHeight };
  });
  check("the panel overlay covers the viewport", layer.t === 0 && layer.left === 0 && layer.w === layer.vw && layer.h === layer.vh,
    JSON.stringify(layer));

  const escaped = await page.evaluate(async () => {
    const panel = document.querySelector(".ig-panel");
    const focusable = Array.from(panel.querySelectorAll("button, input")).filter((el) => !el.disabled && el.offsetParent !== null);
    focusable[focusable.length - 1].focus();
    return { last: document.activeElement === focusable[focusable.length - 1], count: focusable.length };
  });
  await page.keyboard.press("Tab");
  const stillInside = await page.evaluate(() => document.querySelector(".ig-panel").contains(document.activeElement));
  check("focus cannot leave the modal panel forwards", stillInside, `after Tab from last of ${escaped.count}`);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  const stillInsideBack = await page.evaluate(() => document.querySelector(".ig-panel").contains(document.activeElement));
  check("focus cannot leave the modal panel backwards", stillInsideBack, "after Shift+Tab");

  // Disconnect confirmation.
  await page.click("button:has-text('Disconnect')");
  await page.waitForSelector("button:has-text('Disconnect it')");
  await settle(page);
  await page.screenshot({ path: path.join(OUT, "state-disconnect-confirm.png") });
  await page.click("button:has-text('Keep it')");

  // Manage → the form, with the address prefilled and the key blank.
  await page.click("button:has-text('Manage')");
  await page.waitForSelector(".ig-form");
  const prefilled = await page.inputValue(".ig-field input[type='url']");
  const keyBlank = await page.inputValue(".ig-field input[type='password']");
  check("address prefilled on manage", prefilled === "https://harness.app.n8n.cloud", prefilled);
  check("key blank on manage", keyBlank === "", `"${keyBlank}"`);
  const saveDisabled = await page.isDisabled("button:has-text('Save changes')");
  check("save disabled until the key is re-entered", saveDisabled, "disabled");
  await settle(page);
  await page.screenshot({ path: path.join(OUT, "state-form-manage.png") });

  // A rejected write, rendered in the product's own words.
  await page.fill(".ig-field input[type='url']", "http://insecure.example");
  await page.fill(".ig-field input[type='password']", "harness-key-not-a-real-secret");
  await page.click("button:has-text('Save changes')");
  await page.waitForSelector(".ig-error");
  const errText = await page.textContent(".ig-error");
  check("error is owner language", /has to start with https/i.test(errText), errText.trim());
  check("error leaks no database text", !/N8N_|SQLSTATE|column|constraint/i.test(errText), errText.trim());
  const keyAfterFail = await page.inputValue(".ig-field input[type='password']");
  check("key cleared after a failed write", keyAfterFail === "", `"${keyAfterFail}"`);
  await settle(page);
  await page.screenshot({ path: path.join(OUT, "state-error.png") });
  await page.close();

  // Empty state — the connect form a workspace sees first.
  const empty = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await empty.goto(`${BASE}/?theme=light&data=empty`, { waitUntil: "networkidle" });
  await empty.click(".ig-card[data-provider='n8n']");
  await empty.waitForSelector(".ig-form");
  await settle(empty);
  await empty.screenshot({ path: path.join(OUT, "state-panel-empty.png") });
  await empty.close();

  // Permission denied — a member who is not an admin.
  const ro = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await ro.goto(`${BASE}/?theme=light&data=readonly`, { waitUntil: "networkidle" });
  await ro.click(".ig-card[data-provider='n8n']");
  await ro.waitForSelector("[role='dialog']");
  const roText = await ro.textContent("[role='dialog']");
  check("non-admin told who can change it", /only a workspace admin/i.test(roText), "stated");
  check("non-admin gets no form", (await ro.locator(".ig-form").count()) === 0, "no form");
  await settle(ro);
  await ro.screenshot({ path: path.join(OUT, "state-readonly.png") });
  await ro.close();

  // A provider with no connection contract: honest, and offering nothing.
  const other = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await other.goto(`${BASE}/?theme=light&data=empty`, { waitUntil: "networkidle" });
  await other.click(".ig-card[data-provider='stripe']");
  await other.waitForSelector("[role='dialog']");
  check("no setup offered without a contract", (await other.locator(".ig-form").count()) === 0, "no form");
  await settle(other);
  await other.screenshot({ path: path.join(OUT, "state-no-contract.png") });
  await other.close();

  // Reduced motion.
  const rm = await browser.newPage({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
  await rm.goto(`${BASE}/?theme=dark&data=connected`, { waitUntil: "networkidle" });
  await rm.click(".ig-card[data-provider='n8n']");
  await rm.waitForSelector("[role='dialog']");
  const motion = await rm.evaluate(() => {
    const panel = getComputedStyle(document.querySelector(".ig-panel"));
    const card = getComputedStyle(document.querySelector(".ig-card"));
    return { panelAnimation: panel.animationName, panelDuration: panel.animationDuration, cardTransition: card.transitionDuration };
  });
  check("reduced motion disables the panel animation", motion.panelAnimation === "none" || parseFloat(motion.panelDuration) <= 0.01,
    JSON.stringify(motion));
  await settle(rm);
  await rm.screenshot({ path: path.join(OUT, "state-reduced-motion.png") });
  await rm.close();
} finally {
  await browser.close();
}

writeFileSync(path.join(OUT, "integrations-fit-report.json"), JSON.stringify({ report, failures }, null, 2));
console.log(report.map((r) => `${r.pass ? "PASS" : "FAIL"}  ${r.label}${r.pass ? "" : ` — ${r.detail}`}`).join("\n"));
console.log(`\n${report.filter((r) => r.pass).length}/${report.length} checks passed`);
if (failures.length) { console.error(`\n${failures.length} FAILURE(S)`); process.exit(1); }
