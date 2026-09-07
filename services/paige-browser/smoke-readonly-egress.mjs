import { chromium } from "playwright";
import { installReadOnlyBrowserEgress } from "./ssrf-guard.mjs";

const origin = "https://93.184.216.34";
let safeGets = 0;
let deliveredWrites = 0;
let deliveredSockets = 0;
let deliveredPrivate = 0;

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: "block", ignoreHTTPSErrors: true });
  // Receiver instrumentation is registered first; the production context fence is registered last and
  // uses fallback only for allowed reads. Any popup write or private-host request reaching a receiver fails.
  await context.route(`${origin}/**`, async (route) => {
    const req = route.request();
    if (req.method() !== "GET" && req.method() !== "HEAD") deliveredWrites++;
    if (req.url().endsWith("/hostile")) {
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><body><script>
          window.results = { done: false, popupAttempts: 0 };
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
          const form = document.createElement('form');
          form.method = 'POST';
          form.target = '_blank';
          form.action = '/popup-post';
          document.body.append(form);
          window.results.popupAttempts++;
          form.submit();
          window.results.popupAttempts++;
          window.open('http://127.0.0.1/internal', '_blank');
        </script></body>`,
      });
    }
    if (req.url().endsWith("/asset")) safeGets++;
    return route.fulfill({ status: 200, contentType: "text/plain", body: "safe" });
  });
  await context.route("http://127.0.0.1/**", async (route) => {
    deliveredPrivate++;
    return route.fulfill({ status: 200, contentType: "text/plain", body: "private" });
  });
  await context.routeWebSocket("wss://93.184.216.34/**", (ws) => {
    deliveredSockets++;
    ws.close();
  });
  await installReadOnlyBrowserEgress(context);
  const page = await context.newPage();

  await page.goto(`${origin}/hostile`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.results?.done === true, null, { timeout: 5000 });
  await page.waitForTimeout(500);

  const popupAttempts = await page.evaluate(() => window.results?.popupAttempts);
  if (popupAttempts !== 2) throw new Error(`popup controls did not execute twice: ${popupAttempts}`);
  if (safeGets !== 1) throw new Error(`safe GET delivery mismatch: ${safeGets}`);
  if (deliveredWrites !== 0) throw new Error(`page write reached receiver: ${deliveredWrites}`);
  if (deliveredPrivate !== 0) throw new Error(`private popup reached receiver: ${deliveredPrivate}`);
  if (deliveredSockets !== 0) throw new Error(`WebSocket reached receiver: ${deliveredSockets}`);
  if (context.serviceWorkers().length !== 0) throw new Error("service worker was created");
  console.log("PASS read-only browser egress: GET delivered; HTTP writes, popup writes/private hosts, beacon, WebSocket, and service worker blocked.");
} finally {
  await browser.close();
}
