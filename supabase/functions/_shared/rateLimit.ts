// Shared anon/public rate-limit helpers for edge functions with no authenticated
// user to key on (public-booking, booking-manage). Backed by the atomic
// public.check_public_rate_limit RPC (an INSERT ... ON CONFLICT counter over
// public.public_rate_limits), which complements the user-uuid-keyed
// public.check_rate_limit primitive — same idea, different key type.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type Admin = SupabaseClient;

/** Best-guess client IP from the standard forwarded headers: Cloudflare's
 *  cf-connecting-ip first, then the LEFT-MOST X-Forwarded-For hop (the original
 *  client, before proxies appended themselves), then X-Real-IP. Falls back to
 *  "unknown" when none are present — callers bucket on it like any other value,
 *  so a header-less request simply shares one coarse bucket rather than escaping
 *  the throttle. */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
}

/** Durable per-bucket throttle. Returns TRUE when the caller is OVER the limit
 *  (block them), FALSE when the request is allowed.
 *
 *  Fail-OPEN on the limiter's own error: a limiter hiccup (RPC error / thrown
 *  exception) must never block legitimate traffic, so those cases return FALSE
 *  (allowed). Only a real, ceiling-exceeded verdict from the RPC blocks. */
export async function overRateLimit(
  admin: Admin,
  bucket: string,
  max: number,
  windowSeconds = 60,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("check_public_rate_limit", {
      _bucket: bucket,
      _max: max,
      _window_seconds: windowSeconds,
    });
    if (error) return false; // fail-open — don't block on a limiter error
    return data === false; // the RPC returns false ONLY when the ceiling is exceeded
  } catch {
    return false; // fail-open
  }
}
