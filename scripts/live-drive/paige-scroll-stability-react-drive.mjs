#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 5202;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve("scripts/live-drive/artifacts/paige-scroll-stability-react");
const VIEWPORTS = [[1536, 770], [1366, 768], [1024, 768], [900, 1000], [520, 820]];
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const generatedAt = new Date().toISOString();
const results = [];
const record = (name, ok, detail = null) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? `  ${JSON.stringify(detail)}` : ""}`);
};

const assertPortFree = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", (error) => reject(new Error(`Harness port ${PORT} is not free: ${error.message}`)));
  server.listen(PORT, "127.0.0.1", () => server.close(resolve));
});

const waitForPort = () => new Promise((resolve, reject) => {
  const started = Date.now();
  const probe = () => {
    const socket = net.createConnection(PORT, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); resolve(); });
    socket.once("error", () => {
      socket.destroy();
      if (Date.now() - started > 45_000) reject(new Error("Harness server did not start"));
      else setTimeout(probe, 150);
    });
  };
  probe();
});

async function stop(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true }).once("exit", resolve));
  } else child.kill("SIGTERM");
}

const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const finishLayoutTransitions = async (page) => {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation =>
      (animation.playState === "running" || animation.pending) && animation.effect?.getTiming().iterations !== Infinity);
    await Promise.allSettled(finite.map(animation => animation.finished));
  });
  await settle(page);
};
const transcript = (page) => page.locator("[data-paige-transcript-scroll=true]");
const measure = (page) => transcript(page).evaluate((owner) => {
  const viewport = owner.getBoundingClientRect();
  const items = [...owner.querySelectorAll("[data-paige-message-id]")];
  const anchor = items.find((item) => item.getBoundingClientRect().bottom > viewport.top);
  return {
    id: anchor?.getAttribute("data-paige-message-id") ?? null,
    offset: anchor ? Math.round((anchor.getBoundingClientRect().top - viewport.top) * 100) / 100 : null,
    scrollTop: Math.round(owner.scrollTop * 100) / 100,
    bottomGap: Math.round((owner.scrollHeight - owner.scrollTop - owner.clientHeight) * 100) / 100,
    scrollHeight: owner.scrollHeight,
    clientHeight: owner.clientHeight,
    horizontalOverflow: owner.scrollWidth > owner.clientWidth + 1,
  };
});
const sameAnchor = (before, after) => before.id === after.id && Math.abs(before.offset - after.offset) <= 1;

async function openThread(page, title) {
  let button = page.getByRole("button", { name: title, exact: true });
  if (!(await button.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Chats", exact: true }).click();
    button = page.getByRole("dialog", { name: "PAIGE conversations" }).getByRole("button", { name: title, exact: true });
  }
  await button.click();
  await page.waitForFunction((expected) => {
    const current = document.querySelector('button[aria-current="page"]');
    return current?.textContent?.includes(expected);
  }, title);
  await page.waitForTimeout(40);
  await settle(page);
}

async function openTenant(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  if (!(await transcript(page).isVisible())) {
    await page.getByRole("button", { name: "Direct PAIGE", exact: true }).evaluate((button) => button.click());
  }
  await transcript(page).waitFor();
  await page.waitForFunction(() => document.querySelectorAll("[data-paige-message-id]").length >= 40);
  await settle(page);
}

async function scrollReaderToMiddle(page) {
  await transcript(page).evaluate((owner) => {
    owner.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true }));
    owner.scrollTop = Math.round((owner.scrollHeight - owner.clientHeight) * 0.46);
    owner.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await settle(page);
  return measure(page);
}

async function scrollReaderOnePixelUp(page) {
  await transcript(page).hover();
  await page.mouse.wheel(0, -1);
  await page.waitForFunction(() => {
    const owner = document.querySelector('[data-paige-transcript-scroll=true]');
    return owner.scrollHeight - owner.clientHeight - owner.scrollTop >= 1;
  });
  await settle(page);
  return measure(page);
}

async function send(page, text) {
  const input = page.getByPlaceholder("Talk while she works…");
  await input.fill(text);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
}

fs.mkdirSync(OUT, { recursive: true });
let server;
let browser;
try {
  await assertPortFree();
  server = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--config", "scripts/live-drive/harness/settings-mount/vite.config.ts",
    "--port", String(PORT), "--strictPort",
  ], { stdio: "ignore", windowsHide: true });
  await waitForPort();
  browser = await chromium.launch({ headless: true });

  for (const [width, height] of VIEWPORTS) {
    const label = `${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: width === 1366 ? "no-preference" : "reduce" });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(120_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.addInitScript(() => {
      window.__paigeScrollCalls = [];
      window.__paigeScrollDiagnostics = [];
      let callbackPhase = "synchronous";
      const nativeFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => nativeFrame((time) => {
        const previous = callbackPhase;
        callbackPhase = "animation-frame";
        try { callback(time); } finally { callbackPhase = previous; }
      });
      const nativeTimeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => nativeTimeout(typeof callback === "function" ? () => {
        const previous = callbackPhase;
        callbackPhase = "timeout";
        try { callback(...args); } finally { callbackPhase = previous; }
      } : callback, delay);
      document.addEventListener("paige:scroll-diagnostic", (event) => {
        window.__paigeScrollDiagnostics.push({ ...event.detail, callbackPhase });
      });
      const nativeTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
      Object.defineProperty(Element.prototype, "scrollTop", {
        ...nativeTop,
        set(top) {
          if (this.matches?.('[data-paige-transcript-scroll=true]')) {
            window.__paigeScrollCalls.push({ writer: "scrollTop", top, callbackPhase });
          }
          nativeTop.set.call(this, top);
        },
      });
      window.__paigeHarnessFrames = [];
      const originalScrollTo = HTMLElement.prototype.scrollTo;
      HTMLElement.prototype.scrollTo = function scrollTo(options, y) {
        const normalized = typeof options === "object" ? options : { left: options, top: y, behavior: "auto" };
        window.__paigeScrollCalls.push({
          behavior: normalized.behavior ?? "auto",
          top: normalized.top ?? null,
          transcript: this.matches?.("[data-paige-transcript-scroll=true]") ?? false,
          callbackPhase,
        });
        return originalScrollTo.call(this, options, y);
      };

      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = String(typeof input === "string" ? input : input?.url ?? input);
        if (!url.includes("harness.invalid/functions/v1/paige-ai-chat")) return nativeFetch(input, init);
        const encoder = new TextEncoder();
        const frames = [
          { delay: 120, value: 'data: {"paige_step":{"id":"harness-step","seq":1,"round":1,"kind":"thought","label":"Checking harness source","group":"shared","status":"running"}}\n\n' },
          { delay: 120, value: 'data: {"paige_phase":"writing"}\n\n' },
          { delay: 120, value: 'data: {"choices":[{"delta":{"content":"HARNESS ONLY streamed "}}]}\n\n' },
          { delay: 120, value: 'data: {"approval_queued":[{"id":"harness-approval","summary":"Harness approval receipt","category":"test","contact_id":null}]}\n\n' },
          { delay: 120, value: 'data: {"choices":[{"delta":{"content":"response completed."}}]}\n\n' },
          { delay: 50, value: "data: [DONE]\n\n" },
        ];
        let cancelled = false;
        init?.signal?.addEventListener("abort", () => { cancelled = true; }, { once: true });
        return new Response(new ReadableStream({
          async start(controller) {
            for (const frame of frames) {
              await new Promise((resolve) => setTimeout(resolve, frame.delay));
              if (cancelled) { controller.close(); return; }
              window.__paigeHarnessFrames.push(frame.value);
              controller.enqueue(encoder.encode(frame.value));
            }
            const completed = Number(sessionStorage.getItem("paige-harness-completed-turns") ?? 0);
            sessionStorage.setItem("paige-harness-completed-turns", String(completed + 1));
            controller.close();
          },
        }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
      };
    });

    const primaryTenantUrl = `${BASE}/solo/1971670/settings/setup?theme=dark`;
    const secondTenantUrl = `${BASE}/solo/2072681/settings/setup?theme=dark&tenant=second`;
    await openTenant(page, primaryTenantUrl);

    const initial = await scrollReaderToMiddle(page);
    record(`${label} real hydrated middle anchor`, !!initial.id && initial.bottomGap > 48, initial);

    await send(page, `Actual React stream check ${label}`);
    await page.waitForFunction(() => document.body.textContent?.includes("Actual React stream check"));
    const ordinary = await measure(page);
    record(`${label} ordinary React message update`, sameAnchor(initial, ordinary), { initial, ordinary });

    await page.waitForFunction(() => window.__paigeHarnessFrames?.some((frame) => frame.includes("paige_step")));
    const tool = await measure(page);
    record(`${label} real paige_step update`, sameAnchor(initial, tool), { initial, tool });

    await page.getByText("Harness approval receipt", { exact: false }).waitFor();
    const receipt = await measure(page);
    record(`${label} real approval receipt update`, sameAnchor(initial, receipt), { initial, receipt });

    await page.getByText("HARNESS ONLY streamed response completed.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Send message", exact: true }).waitFor();
    await settle(page);
    const streamed = await measure(page);
    record(`${label} real streamed output while reading`, sameAnchor(initial, streamed), { initial, streamed });

    await page.setViewportSize({ width: Math.max(400, width - 35), height: Math.max(700, height - 20) });
    await settle(page);
    await page.setViewportSize({ width, height });
    await settle(page);
    const resized = await measure(page);
    record(`${label} responsive layout return`, sameAnchor(initial, resized), { initial, resized });

    await openThread(page, "Harness long conversation B");
    const threadB = await scrollReaderToMiddle(page);
    await openThread(page, "Harness long conversation A");
    const returnedA = await measure(page);
    record(`${label} real thread A-B-A restore`, sameAnchor(initial, returnedA), { initial, threadB, returnedA });
    await openThread(page, "Harness long conversation B");
    const returnedB = await measure(page);
    record(`${label} different thread keeps its own position`, sameAnchor(threadB, returnedB), { threadB, returnedB });
    await openThread(page, "Harness long conversation A");

    const beforeKeyboard = await measure(page);
    await transcript(page).focus();
    await page.keyboard.press("PageDown");
    await settle(page);
    const afterPageDown = await measure(page);
    await page.keyboard.press("PageUp");
    await page.keyboard.press("Home");
    await settle(page);
    const afterHome = await measure(page);
    await page.keyboard.press("End");
    await page.waitForFunction(() => {
      const owner = document.querySelector('[data-paige-transcript-scroll=true]');
      return owner.scrollHeight - owner.clientHeight - owner.scrollTop <= 0;
    });
    const afterEnd = await measure(page);
    record(`${label} keyboard PageDown PageUp Home End`, afterPageDown.scrollTop > beforeKeyboard.scrollTop && afterHome.scrollTop <= 1 && Math.abs(afterEnd.bottomGap) <= 1, { beforeKeyboard, afterPageDown, afterHome, afterEnd });

    await send(page, `Bottom follow check ${label}`);
    await page.getByText("HARNESS ONLY streamed response completed.", { exact: false }).last().waitFor();
    await page.getByRole("button", { name: "Send message", exact: true }).waitFor();
    await settle(page);
    const bottom = await measure(page);
    record(`${label} real stream follows when bottom pinned`, Math.abs(bottom.bottomGap) <= 1, bottom);

    const onePixel = await scrollReaderOnePixelUp(page);
    record(`${label} deliberate one-pixel movement leaves bottom pin`, Math.abs(onePixel.bottomGap - 1) <= 0.1, onePixel);
    await send(page, `One pixel ownership check ${label}`);
    await page.getByText("HARNESS ONLY streamed response completed.", { exact: false }).last().waitFor();
    await page.getByRole("button", { name: "Send message", exact: true }).waitFor();
    await settle(page);
    const onePixelStreamed = await measure(page);
    record(`${label} one-pixel anchor survives streaming tool and receipt updates`, sameAnchor(onePixel, onePixelStreamed), { onePixel, onePixelStreamed });

    // Cross the real 1800ms completion refresh as well as idle animation frames.
    await page.waitForTimeout(2400);
    const afterDelayedRefresh = await measure(page);
    record(`${label} native one-pixel ownership survives delayed completion refresh`, sameAnchor(onePixel, afterDelayedRefresh), { onePixel, afterDelayedRefresh });

    await page.setViewportSize({ width: Math.max(400, width - 35), height: Math.max(700, height - 20) });
    await settle(page);
    await page.setViewportSize({ width, height });
    await settle(page);
    const onePixelResized = await measure(page);
    record(`${label} one-pixel anchor survives responsive resize`, sameAnchor(onePixel, onePixelResized), { onePixel, onePixelResized });

    const readerBeforeReload = onePixelResized;
    await page.reload();
    await transcript(page).waitFor();
    await page.waitForFunction(() => document.querySelectorAll("[data-paige-message-id]").length >= 40);
    await settle(page);
    const reloaded = await measure(page);
    record(`${label} same-session reload restores stable IDs`, sameAnchor(readerBeforeReload, reloaded), { readerBeforeReload, reloaded });

    await page.locator('.tcs-icon-button[aria-label="Fold PAIGE conversation"]').click();
    await transcript(page).waitFor({ state: "hidden" });
    await page.screenshot({ path: path.join(OUT, `${label}-closed.png`), fullPage: true });
    await page.getByRole("button", { name: "Direct PAIGE", exact: true }).evaluate((button) => button.click());
    await finishLayoutTransitions(page);
    const minimizedReturn = await measure(page);
    record(`${label} minimize return`, sameAnchor(reloaded, minimizedReturn), { reloaded, minimizedReturn });

    if (width === 1536) {
      const popupPromise = context.waitForEvent("page");
      await page.locator('.tcs-icon-button[aria-label="Open PAIGE in a new window"]').click();
      const popup = await popupPromise;
      await popup.waitForLoadState("domcontentloaded");
      await transcript(popup).waitFor();
      await popup.waitForFunction(() => document.querySelectorAll("[data-paige-message-id]").length >= 40);
      await settle(popup);
      const detached = await measure(popup);
      record(`${label} pop-out restores current thread anchor`, sameAnchor(minimizedReturn, detached), { minimizedReturn, detached, popupViewport: popup.viewportSize() });
      await popup.screenshot({ path: path.join(OUT, `${label}-popup.png`), fullPage: true });
      await popup.close();
      await transcript(page).waitFor({ state: "visible" });
      await settle(page);
      const nativeClosed = await measure(page);
      record(`${label} native popup close returns anchor`, sameAnchor(minimizedReturn, nativeClosed), { minimizedReturn, nativeClosed });
    }

    const primaryTenantAnchor = await measure(page);
    await openTenant(page, secondTenantUrl);
    const secondTenantInitial = await measure(page);
    record(`${label} second tenant does not inherit primary position`, Math.abs(secondTenantInitial.bottomGap) <= 1, { primaryTenantAnchor, secondTenantInitial });
    const secondTenantAnchor = await scrollReaderToMiddle(page);
    record(`${label} second tenant establishes its own reading anchor`, !!secondTenantAnchor.id && secondTenantAnchor.bottomGap > 48, secondTenantAnchor);
    await openTenant(page, primaryTenantUrl);
    const primaryTenantReturn = await measure(page);
    record(`${label} primary tenant restores its own position`, sameAnchor(primaryTenantAnchor, primaryTenantReturn), { primaryTenantAnchor, primaryTenantReturn });
    await openTenant(page, secondTenantUrl);
    const secondTenantReturn = await measure(page);
    record(`${label} second tenant restores its isolated position`, sameAnchor(secondTenantAnchor, secondTenantReturn), { secondTenantAnchor, secondTenantReturn });
    await page.screenshot({ path: path.join(OUT, `${label}-second-tenant.png`), fullPage: true });

    record(`${label} no horizontal overflow`, !(await measure(page)).horizontalOverflow, await measure(page));
    record(`${label} no runtime errors`, errors.length === 0, errors);
    const diagnostics = await page.evaluate(() => window.__paigeScrollDiagnostics);
    record(`${label} diagnostic schema contains no content or identifiers`, diagnostics.length > 0 && diagnostics.every(event =>
      Object.keys(event).every(key => ['source', 'action', 'epoch', 'pinned', 'top', 'target', 'phase', 'callbackPhase'].includes(key))
      && typeof event.top === 'number' && typeof event.target === 'number'), { events: diagnostics.length });
    await page.evaluate(() => {
      const marker = document.createElement("div");
      marker.textContent = "LOCAL REACT HARNESS — SYNTHETIC RECORDS, NOT AUTHENTICATED";
      Object.assign(marker.style, { position: "fixed", left: "8px", bottom: "8px", zIndex: 99999, padding: "4px 7px", color: "white", background: "#6b21a8", font: "11px sans-serif" });
      document.body.append(marker);
    });
    await page.screenshot({ path: path.join(OUT, `${label}-open.png`), fullPage: true });
    await context.close();
  }
} catch (error) {
  record("drive exception", false, String(error?.stack ?? error));
} finally {
  await browser?.close();
  await stop(server);
  const report = {
    generatedAt,
    revision,
    evidenceClass: "Local real React Solo shell + SoloPaigeWorkspace + PaigeAIChat; synthetic stable thread records and controlled SSE; not authenticated backend or production",
    unsupported: ["History pagination is not implemented by usePaigeThreads; prepend is verified in controller and React affected-flow tests only."],
    results,
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`${results.filter((result) => result.ok).length}/${results.length} checks passed`);
  process.exitCode = results.some((result) => !result.ok) ? 1 : 0;
}
