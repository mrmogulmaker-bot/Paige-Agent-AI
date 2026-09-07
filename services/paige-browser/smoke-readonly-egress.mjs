import { chromium } from "playwright";
import { installReadOnlyPageEgress } from "./ssrf-guard.mjs";

const origin = "https://93.184.216.34";
let safeGets = 0;
let deliveredWrites = 0;
let deliveredSockets = 0;

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: "block", ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Receiver instrumentation is registered first; the production fence is registered last and uses
  // fallback only for allowed reads. Any write reaching this receiver is a security failure.
  await page.route(`${origin}/**`, async (route) => {
    const req = route.request();
    if (req.method() !== "GET" && req.method() !== "HEAD") deliveredWrites++;
    if (req.url().endsWith("/hostile")) {
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><script>
          window.results = { done: false };
          Promise.allSettled([
            fetch('/asset'),
            fetch('/post', {method:'POST', body:'x'}),
            fetch('/put', {method:'PUT', body:'x'}),
            fetch('/patch', {method:'PATCH', body:'x'}),
            fetch('/delete', {method:'DELETE'}),
          ]).then(() => { window.results.done = true; });
          navigator.sendBeacon('/beacon', 'x');
          try { new WebSocket('wss://93.184.216.34/socket'); } catch {}
          navigator.serviceWorker.register('/sw.js').catch(() => {});
        </script>`,
      });
    }
    if (req.url().endsWith("/asset")) safeGets++;
    return route.fulfill({ status: 200, contentType: "text/plain", body: "safe" });
  });
  await page.routeWebSocket("wss://93.184.216.34/**", (ws) => {
    deliveredSockets++;
    ws.close();
  });
  await installReadOnlyPageEgress(page);

  await page.goto(`${origin}/hostile`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.results?.done === true, null, { timeout: 5000 });
  await page.waitForTimeout(250);

  if (safeGets !== 1) throw new Error(`safe GET delivery mismatch: ${safeGets}`);
  if (deliveredWrites !== 0) throw new Error(`page write reached receiver: ${deliveredWrites}`);
  if (deliveredSockets !== 0) throw new Error(`WebSocket reached receiver: ${deliveredSockets}`);
  if (context.serviceWorkers().length !== 0) throw new Error("service worker was created");
  console.log("PASS read-only browser egress: GET delivered; HTTP writes, beacon, WebSocket, and service worker blocked.");
} finally {
  await browser.close();
}
