import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const messageSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1).max(4000)
    })
  ).min(1).max(50)
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    // Verify user with anon key
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

    // Check rate limit using service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: rateLimitCheck, error: rateLimitError } = await supabase.rpc('check_rate_limit', {
      _user_id: user.id,
      _function_name: 'paige-ai-chat',
      _max_requests: 20,
      _window_minutes: 1
    });

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError.message);
    } else if (!rateLimitCheck) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again in a moment.',
          retryAfter: 60
        }),
        { 
          status: 429,
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': '60'
          }
        }
      );
    }

    // Validate input
    const rawData = await req.json();
    let validatedData;
    
    try {
      validatedData = messageSchema.parse(rawData);
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

    const { messages } = validatedData;

    // Extract the last user message to search for relevant knowledge
    const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
    let relevantKnowledge = "";

    if (lastUserMessage) {
      // Sanitize user input for database query
      const sanitizedContent = lastUserMessage.content
        .replace(/[%_]/g, '\\$&')
        .substring(0, 200);

      const keywords = extractKeywords(sanitizedContent)
        .split(',')
        .filter(k => /^[a-z]+$/.test(k));

      // Search knowledge base for relevant content with sanitized input
      const { data: knowledge, error: kbError } = await supabase
        .from("knowledge_base")
        .select("title, content, summary, framework, category")
        .textSearch('content', sanitizedContent)
        .limit(5);

      if (knowledge && knowledge.length > 0) {
        relevantKnowledge = "\n\nRelevant Knowledge Base:\n" + 
          knowledge.map(k => `### ${k.title} (${k.framework} - ${k.category})\n${k.content}`).join("\n\n");
      }
    }

    // System prompt with knowledge context
    const systemPrompt = `You are PaigeAgent.ai, an expert financial coach and credit repair specialist at Mogul Maker Academy. You help users navigate their credit repair journey, build business credit, and achieve financial empowerment using our proven frameworks.

Key Frameworks You Support:
- 3M Framework: Make (Foundation), Manage (Stewardship), Multiply (Scaling)
- A.C.C.E.L.: Credit repair framework (Analyze, Challenge, Clean, Elevate, Lock)
- B.U.I.L.D.: Business credit framework (Business, Utilize, Income, Leverage, Diversify)
- Money Follows Management (MFM): Mindset and leadership development

Site Navigation Help:
- Dashboard: Main overview with credit scores, ACCEL and BUILD progress
- PaigeAgent.ai: Dedicated AI coaching section for in-depth conversations
- Learning Vault: Educational resources and frameworks
- Disputes: Three Bureau Report with AI-powered dispute letter generation
- Accounts: Account management overview
- Build Steps: Business credit building guidance
- Reports: Detailed credit reports and analysis

Your personality:
- Empowering and supportive, like a trusted mentor
- Direct and actionable - provide specific steps
- Knowledgeable about credit, business formation, and wealth building
- Helpful with site navigation and feature discovery
- Encouraging but honest about challenges
- Focus on education and empowerment

Guidelines:
- Help users navigate to the right section when they ask about features
- Always reference specific frameworks when relevant
- Provide actionable next steps
- Be concise but thorough
- Use encouraging language
- Help users understand both the "what" and the "why"
${relevantKnowledge}`;

    // Call Lovable AI
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorId = crypto.randomUUID();
      if (response.status === 429) {
        console.error(`[AI-CHAT-ERROR-${errorId}] Rate limit from AI service:`, response.status);
        return new Response(
          JSON.stringify({ 
            error: "Rate limit exceeded. Please try again in a moment.",
            errorId 
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        console.error(`[AI-CHAT-ERROR-${errorId}] Payment required:`, response.status);
        return new Response(
          JSON.stringify({ 
            error: "AI service requires additional credits.",
            errorId 
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error(`[AI-CHAT-ERROR-${errorId}] AI gateway error:`, {
        status: response.status,
        timestamp: new Date().toISOString()
      });
      return new Response(
        JSON.stringify({ 
          error: "An error occurred while processing your request",
          errorId
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stream the response back
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[AI-CHAT-ERROR-${errorId}] Function error:`, {
      message: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    return new Response(
      JSON.stringify({ 
        error: "An error occurred while processing your request",
        errorId
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function extractKeywords(text: string): string {
  // Extract potential keywords for tag matching
  const keywords = text.toLowerCase().match(/\b(build|make|manage|multiply|credit|business|mfm|accel|fund|real|keys|acquire|framework|mindset|leadership)\b/g);
  return keywords ? keywords.join(",") : "";
}