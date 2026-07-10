// Ingest a web page into a tenant's private Knowledge Base by URL. Fetches the
// page (SSRF-safe, HTTPS-only), strips it to text with a document-grade cap,
// then hands off to kb-ingest-doc (source:'url') — forwarding the caller's JWT
// so the doc is created + chunked + embedded under the caller's tenant via RLS.
//
// Why a separate function and not fetch-url-content -> kb-ingest-doc on the
// client: (1) orchestration stays in the edge layer so Paige can call it
// (§10, callable seam), (2) fetch-url-content hard-caps at 5000 chars for chat
// snippets — useless for indexing — and other callers depend on that small cap,
// so we do a document-grade fetch here (200 KB) rather than loosen it there.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  url: z.string().url().max(2000),
  title: z.string().min(1).max(300).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  share_to_network: z.boolean().optional(),
  tenant_id: z.string().uuid().optional(), // platform-owner override
});

// Document-grade cap — well under kb-ingest-doc's content.max(500_000), large
// enough to capture a full article/SOP page rather than a chat-sized snippet.
const MAX_CONTENT = 200_000;

// SSRF blocklist — identical to fetch-url-content's guard. Do not weaken.
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^0\.0\.0\.0$/,
  /^fc00:/i,
  /^fd00:/i,
  /\.local$/i,
  /\.internal$/i,
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// HTTPS-only + blocklist guard. Returns an error string if the URL is not a
// safe public target, else null. Applied to the initial URL AND every redirect
// hop so a public URL can't 3xx-bounce (or DNS-rebind) into an internal target.
function unsafeReason(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return "Invalid URL format"; }
  if (u.protocol !== "https:") return "Only HTTPS URLs are allowed";
  if (BLOCKED_HOST_PATTERNS.some((p) => p.test(u.hostname.toLowerCase()))) return "URL not allowed";
  return null;
}

// Fetch following redirects MANUALLY so each hop's Location is re-validated
// against the SSRF guard before we follow it (Deno's default redirect:"follow"
// would chase a 302 → http://169.254.169.254 without re-checking).
async function safeFetch(startUrl: string, maxHops = 5): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop <= maxHops; hop++) {
    const bad = unsafeReason(current);
    if (bad) throw new Error(bad);
    const res = await fetch(current, {
      headers: { "User-Agent": "Paige-AI-Bot/1.0" },
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, current).toString(); // resolve relative redirects
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

// Pull a usable title out of the raw HTML before we strip tags.
function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = m[1].replace(/\s+/g, " ").trim();
  return t.length ? t.slice(0, 300) : null;
}

function stripToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CONTENT);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "Invalid authentication token" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { url, title, category, tags, share_to_network, tenant_id } = parsed.data;

    // SSRF + HTTPS validation.
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return json({ error: "Invalid URL format" }, 400);
    }
    const initialBad = unsafeReason(url);
    if (initialBad) return json({ error: initialBad }, initialBad === "URL not allowed" ? 403 : 400);

    // Fetch the page (redirects re-validated per hop against the SSRF guard).
    let res: Response;
    try {
      res = await safeFetch(url);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "URL not allowed") return json({ error: "That link redirected somewhere we can't fetch." }, 403);
      return json({ error: `Couldn't reach the page: ${msg}` }, 400);
    }
    if (!res.ok) return json({ error: `Failed to fetch URL: ${res.status} ${res.statusText}` }, 400);

    const contentType = res.headers.get("content-type") || "";
    let content = "";
    let derivedTitle: string | null = null;

    if (contentType.includes("text/html")) {
      const html = await res.text();
      derivedTitle = extractTitle(html);
      content = stripToText(html);
    } else if (contentType.includes("text/plain") || contentType.includes("application/json")) {
      content = (await res.text()).replace(/\s+/g, " ").trim().slice(0, MAX_CONTENT);
    } else {
      return json({ error: "Unsupported page type. Only HTML, plain text, and JSON pages can be indexed." }, 400);
    }

    if (!content || content.length < 20) {
      return json({ error: "That page had no readable text to teach Paige." }, 400);
    }

    const finalTitle = (title?.trim() || derivedTitle || parsedUrl.hostname).slice(0, 300);

    // Hand off to kb-ingest-doc, forwarding the caller's JWT so the doc is
    // created + chunked + embedded under the SAME tenant via RLS. Keeping the
    // chunk/embed pipeline single-sourced (one function owns it).
    const ingestRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")!}/functions/v1/kb-ingest-doc`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
          apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
        },
        body: JSON.stringify({
          title: finalTitle,
          content,
          category: category ?? null,
          tags: tags ?? [],
          source: "url",
          source_url: url,
          share_to_network: share_to_network ?? false,
          ...(tenant_id ? { tenant_id } : {}),
        }),
      },
    );
    const ingestBody = await ingestRes.json().catch(() => ({}));
    if (!ingestRes.ok) {
      return json({ error: (ingestBody as any)?.error ?? "Indexing failed" }, ingestRes.status);
    }
    return json(ingestBody, 200);
  } catch (error) {
    console.error("[kb-ingest-url] error:", error);
    return json({ error: error instanceof Error ? error.message : "Failed to ingest URL" }, 500);
  }
});
