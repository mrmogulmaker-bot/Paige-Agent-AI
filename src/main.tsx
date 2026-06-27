import React from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";


// ---------------------------------------------------------------------------
// Service worker hygiene
// ---------------------------------------------------------------------------
// We removed the VitePWA / workbox precaching because it was serving stale
// builds to users after we published updates. The push-notification SW
// (/public/sw.js) is registered on demand by usePushNotifications and does
// not cache app assets — but any user who visited the site BEFORE this
// change still has the old workbox service worker installed in their browser
// and will keep seeing the cached old build.
//
// On every load we:
//   1. In preview/iframe contexts: unregister ALL service workers (avoids
//      cached chunk errors in the editor).
//   2. On the live site: unregister any service worker whose script URL is
//      NOT our hand-written /sw.js (i.e. workbox leftovers), and purge all
//      Cache Storage entries that workbox created (their names start with
//      "workbox-", "supabase-cache", or contain "precache").

const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

async function cleanupServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const regs = await navigator.serviceWorker.getRegistrations();

    for (const reg of regs) {
      const scriptUrl =
        reg.active?.scriptURL ||
        reg.installing?.scriptURL ||
        reg.waiting?.scriptURL ||
        "";

      if (isPreviewHost || isInIframe) {
        // Preview: unregister everything.
        await reg.unregister();
        continue;
      }

      // Live: keep only our hand-written push SW (/sw.js at the root).
      // Anything else (workbox precache, vite-plugin-pwa) gets unregistered.
      const isOurPushSW = /\/sw\.js(\?|$)/.test(scriptUrl);
      if (!isOurPushSW) {
        await reg.unregister();
      }
    }
  } catch (e) {
    // best-effort cleanup; never break app startup
    console.warn("[sw-cleanup] failed:", e);
  }

  // Purge stale Cache Storage entries left behind by workbox.
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) =>
            n.startsWith("workbox-") ||
            n.includes("precache") ||
            n === "supabase-cache",
          )
          .map((n) => caches.delete(n)),
      );
    }
  } catch (e) {
    console.warn("[sw-cleanup] cache purge failed:", e);
  }
}

cleanupServiceWorkers();

// Clear the stale-chunk reload guard once the app successfully boots, so the
// auto-reload recovery can run again on the next deploy.
window.addEventListener("load", () => {
  try { sessionStorage.removeItem("__chunk_reload__"); } catch {}
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>
);

