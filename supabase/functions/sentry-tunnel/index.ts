// Sentry envelope tunnel — keeps the DSN off the client.
// POST the raw envelope; we forward to the project's ingest endpoint.
import { corsHeaders } from "../_shared/adminAuth.ts";

// Simple in-memory IP rate limiter: 60 envelopes/min per IP.
const buckets = new Map<string, { count: number; resetAt: number }>();
function allow(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (b.count >= 60) return false;
  b.count += 1;
  return true;
}

function parseDsn(dsn: string): { url: string; publicKey: string } | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!projectId) return null;
    const url = `${u.protocol}//${u.host}/api/${projectId}/envelope/`;
    return { url, publicKey: u.username };
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return new Response("disabled", { status: 204, headers: corsHeaders });
  const parsed = parseDsn(dsn);
  if (!parsed) return new Response("invalid_dsn", { status: 500, headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(ip)) return new Response("rate_limited", { status: 429, headers: corsHeaders });

  const body = await req.arrayBuffer();
  const res = await fetch(parsed.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7,sentry_key=${parsed.publicKey},sentry_client=paige-tunnel/1`,
    },
    body,
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
