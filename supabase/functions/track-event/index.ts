// Lightweight event ingestion endpoint.
// - Accepts unauthenticated requests (anonymous events allowed)
// - Strips potential PII from `properties`
// - Writes to public.analytics_events using the service role
// - Always returns 200 quickly so the client can fire-and-forget
//
// IMPORTANT: never block the calling page on this endpoint.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_CATEGORIES = new Set([
  "acquisition",
  "activation",
  "engagement",
  "revenue",
  "paige",
  "credit",
  "funding",
  "system",
]);

// Recursively scrub PII-shaped fields out of arbitrary JSON.
const PII_KEY_REGEX =
  /(ssn|social.?security|tax.?id|date.?of.?birth|dob|drivers?.?license|passport|bank.?account|routing.?number|card.?number|cvv|pin|password|secret|token|api.?key)/i;

const NAME_KEY_REGEX = /(^|_)(full|first|last|legal|maiden)?_?name($|_)/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    // Heuristic: drop strings that look like SSNs or 16-digit card numbers.
    if (/^\d{3}-?\d{2}-?\d{4}$/.test(value)) return "[redacted]";
    if (/^\d{13,19}$/.test(value.replace(/\s+/g, ""))) return "[redacted]";
    if (value.length > 500) return value.slice(0, 500) + "…";
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => scrub(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let kept = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (kept >= 40) break;
      if (PII_KEY_REGEX.test(k)) continue;
      if (NAME_KEY_REGEX.test(k)) continue;
      if (k === "email" && typeof v === "string") {
        // Reduce email to just the domain so we keep signal without storing the address.
        const at = v.indexOf("@");
        out[k] = at >= 0 ? `…@${v.slice(at + 1)}` : "[redacted]";
      } else {
        out[k] = scrub(v, depth + 1);
      }
      kept++;
    }
    return out;
  }
  return null;
}

function clampStr(s: unknown, max = 256): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));

    const event_name = clampStr(body?.event_name, 80);
    const event_category = clampStr(body?.event_category, 32) || "engagement";
    if (!event_name) {
      // Don't 500 the client — silently accept.
      return new Response(JSON.stringify({ ok: true, skipped: "missing_event_name" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const safeCategory = ALLOWED_CATEGORIES.has(event_category)
      ? event_category
      : "engagement";

    const properties = scrub(body?.properties ?? {}) as Record<string, unknown>;

    // Resolve user_id from the auth token when present; never trust body.user_id.
    let resolvedUserId: string | null = null;
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      // Only attempt user resolution if the token is not the anon publishable key.
      try {
        const tmp = createClient(SUPABASE_URL, SERVICE_ROLE, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data } = await tmp.auth.getUser(token);
        resolvedUserId = data?.user?.id ?? null;
      } catch {
        resolvedUserId = null;
      }
    }

    const insertRow = {
      user_id: resolvedUserId,
      session_id: clampStr(body?.session_id, 80),
      event_name,
      event_category: safeCategory,
      properties,
      page_path: clampStr(body?.page_path, 512),
      referrer: clampStr(body?.referrer, 1024),
      utm_source: clampStr(body?.utm_source, 128),
      utm_medium: clampStr(body?.utm_medium, 128),
      utm_campaign: clampStr(body?.utm_campaign, 256),
      referral_code: clampStr(body?.referral_code, 64),
      device_type: clampStr(body?.device_type, 16),
    };

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fire and forget — but we still await so the row lands before the function exits.
    const { error } = await supabase.from("analytics_events").insert(insertRow);
    if (error) {
      console.error("analytics_events insert error:", error.message);
      // Still return 200 so the client never retries / never sees an error.
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("track-event unexpected error:", (err as Error)?.message);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
