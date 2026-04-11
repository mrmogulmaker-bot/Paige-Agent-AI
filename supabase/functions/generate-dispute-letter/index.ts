import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://esm.sh/zod@3.22.4";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const disputeLetterSchema = z.object({
  bureauData: z.object({
    name: z.string().min(1).max(100),
    totalAccounts: z.number().int().min(0).max(10000),
    derogatoryItems: z.number().int().min(0).max(10000),
    delinquentItems: z.number().int().min(0).max(10000)
  }),
  issueType: z.string().min(1).max(200)
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Require authentication — reject all unauthenticated requests
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate session using user-context client
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit check using admin client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: rateLimitCheck } = await adminClient.rpc('check_rate_limit', {
      _user_id: user.id,
      _function_name: 'generate-dispute-letter',
      _max_requests: 5,
      _window_minutes: 60
    });

    if (!rateLimitCheck) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again in an hour.',
          retryAfter: 3600
        }),
        { 
          status: 429,
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': '3600'
          }
        }
      );
    }

    // Validate input
    const rawData = await req.json();
    let validatedData;
    
    try {
      validatedData = disputeLetterSchema.parse(rawData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid input format', 
            details: error.issues.map(i => ({ path: i.path.join('.'), message: i.message }))
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw error;
    }

    const { bureauData, issueType } = validatedData;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log('Generating dispute letter for user:', user.id);

    const systemPrompt = `You are an expert credit dispute letter writer specializing in FCRA (Fair Credit Reporting Act) compliance. 
Your role is to create professional, legally sound dispute letters that help clients address inaccuracies on their credit reports.

Guidelines:
- Use formal business letter format
- Reference specific FCRA rights (15 U.S.C. § 1681)
- Be clear and concise about the disputed items
- Request investigation and correction
- Include a 30-day timeline reference
- Maintain professional tone
- Focus on facts and specific inaccuracies
- Do not make false claims or threats
- Keep letters between 250-400 words`;

    const userPrompt = `Create a dispute letter for the following credit bureau information:

Bureau: ${bureauData.name}
Issue Type: ${issueType}
Total Accounts: ${bureauData.totalAccounts}
Derogatory Items: ${bureauData.derogatoryItems}
Delinquent Items: ${bureauData.delinquentItems}

Please create a professional dispute letter that addresses the ${issueType} found on the ${bureauData.name} credit report. 
Include proper formatting with:
1. Date (use [DATE] as placeholder)
2. Credit bureau address
3. Consumer information placeholder
4. Clear description of disputed items
5. Request for investigation
6. Reference to FCRA rights
7. Professional closing

Format the letter with proper paragraphs and spacing.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorId = crypto.randomUUID();
      if (response.status === 429) {
        console.error(`[DISPUTE-LETTER-ERROR-${errorId}] Rate limit from AI service`);
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later.", errorId }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        console.error(`[DISPUTE-LETTER-ERROR-${errorId}] Payment required`);
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace.", errorId }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error(`[DISPUTE-LETTER-ERROR-${errorId}] AI gateway error:`, { status: response.status });
      return new Response(
        JSON.stringify({ error: "An error occurred while processing your request", errorId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const letter = data.choices[0].message.content;

    console.log('Successfully generated dispute letter for user:', user.id);

    return new Response(
      JSON.stringify({ letter }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[DISPUTE-LETTER-ERROR-${errorId}] Function error:`, {
      message: error instanceof Error ? error.message : 'Unknown',
      timestamp: new Date().toISOString()
    });
    return new Response(
      JSON.stringify({ error: "An error occurred while processing your request", errorId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
