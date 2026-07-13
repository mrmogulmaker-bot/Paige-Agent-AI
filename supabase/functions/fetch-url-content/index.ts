import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Internal utility: paige-deep-research calls this SSRF-guarded fetch server-to-
    // server with the service-role key. Trust that caller; otherwise require a valid
    // end-user JWT. (verify_jwt is off at the platform layer, so this is the sole gate.)
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
        JSON.stringify({ error: 'Valid URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL format and prevent SSRF
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (parsedUrl.protocol !== 'https:') {
      return new Response(
        JSON.stringify({ error: 'Only HTTPS URLs are allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const blockedPatterns = [
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
    if (blockedPatterns.some((p) => p.test(hostname))) {
      return new Response(
        JSON.stringify({ error: 'URL not allowed' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching URL:', url);

    // Fetch the URL content
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Paige-AI-Bot/1.0'
      }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch URL: ${response.status} ${response.statusText}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    let content = '';
    let summary = '';

    // Handle different content types
    if (contentType.includes('text/html')) {
      const html = await response.text();
      
      // Basic text extraction from HTML
      content = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 5000); // Limit to 5000 chars

      summary = `Fetched HTML content from ${url}`;
      
    } else if (contentType.includes('text/plain') || contentType.includes('application/json')) {
      content = await response.text();
      content = content.substring(0, 5000); // Limit to 5000 chars
      summary = `Fetched ${contentType.includes('json') ? 'JSON' : 'text'} content from ${url}`;
      
    } else {
      return new Response(
        JSON.stringify({ 
          error: 'Unsupported content type. Only HTML, plain text, and JSON are supported.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        url,
        content,
        summary,
        contentType
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching URL:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to fetch URL content' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
