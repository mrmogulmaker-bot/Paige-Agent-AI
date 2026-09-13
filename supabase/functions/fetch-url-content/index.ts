import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { safeFetch, SsrfError, type SsrfReason } from "../_shared/ssrfGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Chat-facing content cap (characters). The byte-level cap lives in `safeFetch`
// (bounded read, never buffers past it); this is the additional text cap the chat
// surface has always applied so a page body can never flood a prompt.
const CONTENT_CHAR_CAP = 5000;

// Every SSRF/transport refusal maps to a stable HTTP status + a machine-stable reason.
// The reason is safe to surface (it never contains the caller's URL or credentials —
// see `SsrfError`), so callers (the web_fetch tool, deep-research) can branch on it and
// tell the user honestly WHY a fetch did not happen instead of a fabricated page.
function statusForReason(reason: SsrfReason): number {
  switch (reason) {
    case "url_host_not_allowed":
    case "url_resolves_to_private_address":
      return 403; // a deliberate SSRF refusal
    case "request_timed_out":
      return 504;
    case "request_failed":
      return 502;
    // invalid_url, url_must_be_https, url_has_embedded_credentials,
    // url_host_unresolvable, url_redirect_refused, response_too_large
    default:
      return 400;
  }
}

// Extract a human-readable <title> from an HTML document for provenance. Tags inside the
// title are stripped and whitespace collapsed; returns null when there is no usable title.
function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 300) : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!bearer) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Internal utility: paige-deep-research (and the paige-ai-chat web_fetch tool) call this
    // SSRF-guarded fetch server-to-server with the service-role key. Trust that caller;
    // otherwise require a valid end-user JWT. (verify_jwt is off at the platform layer, so
    // this is the sole gate.) A genuine client-portal seat reaches here only through the
    // paige-ai-chat web_fetch tool, which has already resolved and sealed the caller's seat.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isInternal = serviceKey.length > 0 && bearer === serviceKey;
    if (!isInternal) {
      const supabaseClient = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authentication token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Valid URL is required', reason: 'invalid_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // HARDENED: route the outbound fetch through the ONE canonical guard (§18,
    // `_shared/ssrfGuard.ts`). It resolves the host and validates EVERY resolved IP
    // numerically (closing the DNS→private / IPv4-mapped-IPv6 / link-local bypasses the
    // old per-hostname regex blocklist could not see), refuses redirects (so a validated
    // host can never be walked into an internal one), and bounds both wall-clock time and
    // the bytes read. This replaces the prior regex blocklist + unbounded `fetch`.
    let fetched: { status: number; headers: Headers; body: string; truncated: boolean };
    try {
      fetched = await safeFetch(
        url,
        { headers: { 'User-Agent': 'Paige-AI-Bot/1.0' } },
        { timeoutMs: 15_000, maxBytes: 1_048_576 },
      );
    } catch (e) {
      if (e instanceof SsrfError) {
        return new Response(
          JSON.stringify({ success: false, error: `URL refused: ${e.reason}`, reason: e.reason }),
          { status: statusForReason(e.reason), headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw e;
    }

    if (fetched.status < 200 || fetched.status >= 300) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch URL: ${fetched.status}`,
          reason: 'upstream_status',
          status: fetched.status,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentType = fetched.headers.get('content-type') || '';
    let content = '';
    let summary = '';
    let title: string | null = null;

    // Handle different content types (body is already byte-bounded by safeFetch).
    if (contentType.includes('text/html')) {
      const html = fetched.body;
      title = extractTitle(html);

      // Basic text extraction from HTML
      content = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      summary = `Fetched HTML content from ${url}`;

    } else if (contentType.includes('text/plain') || contentType.includes('application/json')) {
      content = fetched.body;
      summary = `Fetched ${contentType.includes('json') ? 'JSON' : 'text'} content from ${url}`;

    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unsupported content type. Only HTML, plain text, and JSON are supported.',
          reason: 'unsupported_content_type',
          contentType,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // `truncated` is true if the byte-read hit the cap OR the char cap below clips the body,
    // so a consumer can tell the user the page was only partially read (§13 honesty).
    const charTruncated = content.length > CONTENT_CHAR_CAP;
    content = content.substring(0, CONTENT_CHAR_CAP);

    return new Response(
      JSON.stringify({
        success: true,
        url,
        title,
        content,
        summary,
        contentType,
        truncated: fetched.truncated || charTruncated,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching URL:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to fetch URL content',
        reason: 'request_failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
