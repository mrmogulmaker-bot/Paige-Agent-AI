import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

/**
 * Injects the Meta Pixel snippet only on configured marketing pages.
 * Reads pixel ID + tracked paths from paige_config. Safe to mount globally —
 * it no-ops until both are configured and the current path matches.
 */
export function MetaPixel() {
  const { pathname } = useLocation();
  const [pixelId, setPixelId] = useState<string | null>(null);
  const [paths, setPaths] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("paige_config")
        .select("meta_pixel_id, meta_pixel_tracked_paths")
        .eq("id", 1)
        .maybeSingle();
      if (cancelled) return;
      setPixelId(data?.meta_pixel_id ?? null);
      const raw = (data?.meta_pixel_tracked_paths ?? []) as unknown;
      setPaths(Array.isArray(raw) ? (raw as string[]) : []);
    })();
    return () => { cancelled = true; };
  }, []);

  const matches = paths.some((p) => {
    if (!p) return false;
    if (p === "*") return true;
    if (p.endsWith("/*")) return pathname.startsWith(p.slice(0, -2));
    return pathname === p;
  });

  useEffect(() => {
    if (!pixelId || !matches) return;
    if (window.fbq) {
      window.fbq("track", "PageView");
      return;
    }
    // Official Meta snippet (inlined)
    /* eslint-disable */
    (function (f: any, b, e, v, n?: any, t?: any, s?: any) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq?.("init", pixelId);
    window.fbq?.("track", "PageView");
  }, [pixelId, matches]);

  return null;
}
