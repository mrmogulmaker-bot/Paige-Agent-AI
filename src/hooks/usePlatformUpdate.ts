import { useCallback, useEffect, useRef, useState } from "react";

/**
 * usePlatformUpdate — detects when a NEWER build of the app has been deployed
 * while the current tab is still running an OLDER one (#177).
 *
 * Two independent signals, either one flips `updateAvailable`:
 *
 *  1. BUILD-ID POLL (primary). `__BUILD_ID__` is baked into this bundle at build
 *     time; the deployed build publishes the SAME id at /version.json. We fetch
 *     /version.json (cache-busted) on an interval, on tab focus, and when the tab
 *     becomes visible. If the live buildId is a non-empty value that differs from
 *     ours, a new deploy is live. This is the robust primary detector because the
 *     hand-written push service worker rarely changes between app deploys.
 *
 *  2. SW controllerchange (belt-and-suspenders). If the service worker *does*
 *     change and takes control, that also means a fresh asset set is live.
 *
 * Network errors are swallowed silently — a failed fetch NEVER surfaces a false
 * "update" (§13: no fabricated signal). We only trust a clean 200 with a real,
 * differing buildId.
 */

const POLL_INTERVAL_MS = 4 * 60 * 1000; // ~4 min
const RELOAD_BREADCRUMB_KEY = "__paige_update_reload__";

async function fetchDeployedBuildId(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { buildId?: unknown };
    const id = typeof json?.buildId === "string" ? json.buildId.trim() : "";
    return id.length > 0 ? id : null;
  } catch {
    // Network/parse error — treat as "no signal", never as an update.
    return null;
  }
}

export function usePlatformUpdate(): {
  updateAvailable: boolean;
  reload: () => void;
} {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  // Own build id, baked in. Guard the typeof so a non-defined build (SSR/test)
  // degrades to empty rather than throwing.
  const ownBuildId = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "";
  const updateAvailableRef = useRef(false);
  updateAvailableRef.current = updateAvailable;

  useEffect(() => {
    // Only run in production builds. In `npm run dev` the baked id is `dev-<ts>`
    // while the served /version.json placeholder is `dev`, which would otherwise
    // pop a phantom "new version" toast on every local session (§13 no-false-signal).
    if (!import.meta.env.PROD) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const controllers = new Set<AbortController>();

    const check = async () => {
      // Nothing to compare against if we never got a baked-in id, or if we've
      // already flagged an update (no point re-polling).
      if (!ownBuildId || updateAvailableRef.current) return;
      // Skip while the tab is hidden — pause polling churn.
      if (typeof document !== "undefined" && document.hidden) return;

      const controller = new AbortController();
      controllers.add(controller);
      const deployedId = await fetchDeployedBuildId(controller.signal);
      controllers.delete(controller);

      if (cancelled) return;
      if (deployedId && deployedId !== ownBuildId) {
        setUpdateAvailable(true);
      }
    };

    const startInterval = () => {
      if (intervalId !== undefined) return;
      intervalId = setInterval(check, POLL_INTERVAL_MS);
    };
    const stopInterval = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    // Immediate check on mount (a returning tab shouldn't wait a full interval).
    check();
    startInterval();

    // Re-check the moment the user returns to the tab.
    const onFocus = () => check();
    const onVisibility = () => {
      if (document.hidden) {
        stopInterval(); // pause polling while hidden
      } else {
        startInterval();
        check();
      }
    };

    // SW controllerchange — a new worker took control → new assets are live.
    // GUARD (§13 no-false-signal): the push SW registers LAZILY (on notification
    // enable) and claims the page; that FIRST null→controller transition fires
    // controllerchange with no deploy behind it. Only trust the event when a
    // controller ALREADY existed at wire time (a genuine worker swap).
    let sw: ServiceWorkerContainer | undefined;
    const hadController =
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (!cancelled && hadController) setUpdateAvailable(true);
    };
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      sw = navigator.serviceWorker;
      sw.addEventListener("controllerchange", onControllerChange);
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stopInterval();
      controllers.forEach((c) => c.abort());
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (sw) sw.removeEventListener("controllerchange", onControllerChange);
    };
  }, [ownBuildId]);

  const reload = useCallback(() => {
    // Reload-loop guard: if we just tried to reload for an update and are still
    // here, don't spin. The build-id compare already prevents loops (after the
    // reload the running build == deployed), but a stale CDN or failed fetch
    // could otherwise cause a tight cycle. One reload per short window.
    try {
      const last = sessionStorage.getItem(RELOAD_BREADCRUMB_KEY);
      const now = Date.now();
      if (last && now - Number(last) < 10_000) {
        // A reload was attempted <10s ago and we're still on the old build —
        // abort the auto-reload to avoid a loop; leave the banner up.
        return;
      }
      sessionStorage.setItem(RELOAD_BREADCRUMB_KEY, String(now));
    } catch {
      /* sessionStorage unavailable — proceed with a single reload */
    }

    // Purge ONLY version-scoped client caches (the SW Cache Storage), then
    // hard-reload. We intentionally DO NOT touch localStorage: the Supabase
    // auth/session tokens (sb-* keys) live there and clearing them would log the
    // user out — the explicit requirement is that an update needs no re-login
    // (§9/§36). No app localStorage keys are known to be build-scoped, so per
    // spec we clear nothing from localStorage rather than guess.
    const doReload = () => {
      window.location.reload();
    };

    if (typeof caches !== "undefined") {
      caches
        .keys()
        .then((names) => Promise.all(names.map((n) => caches.delete(n))))
        .catch(() => {
          /* best-effort cache purge; never block the reload */
        })
        .finally(doReload);
    } else {
      doReload();
    }
  }, []);

  return { updateAvailable, reload };
}
