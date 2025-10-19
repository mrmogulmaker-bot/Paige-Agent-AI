import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user and check rate limit
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      
      if (user) {
        const { data: rateLimitCheck } = await supabase.rpc('check_rate_limit', {
          _user_id: user.id,
          _function_name: 'personal-build-suggestions',
          _max_requests: 30,
          _window_minutes: 1
        });

        if (!rateLimitCheck) {
          return new Response(
            JSON.stringify({ 
              error: 'Rate limit exceeded. Please try again later.',
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
      }
    }

    const { creditMix, currentScore } = await req.json();
    
    console.log('Analyzing credit mix:', creditMix);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Build context about user's current credit profile
    const hasAccounts = Object.entries(creditMix).filter(([_, has]) => has);
    const missingAccounts = Object.entries(creditMix).filter(([_, has]) => !has);
    
    const systemPrompt = `You are Paige, an expert credit building advisor. Analyze the user's credit profile and provide strategic, actionable recommendations for building fundable personal credit.

Current Credit Profile:
- Active Accounts: ${hasAccounts.map(([type]) => type).join(', ') || 'None'}
- Missing Accounts: ${missingAccounts.map(([type]) => type).join(', ') || 'Complete profile'}
- Current Score: ${currentScore || 'Unknown'}

Provide 3-5 prioritized recommendations that:
1. Follow the BUILD framework phases (Foundation → Growth → Advanced)
2. Are realistic and achievable based on their current profile
3. Include specific approval strategies and timing
4. Explain the fundability impact of each recommendation`;

    const userPrompt = `Based on my current credit profile, what are my next best steps to build fundable personal credit? Focus on which accounts I should apply for and how to maximize my approval odds.`;

    // Use Lovable AI with tool calling for structured output
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_credit_recommendations",
              description: "Provide personalized credit building recommendations",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { 
                          type: "string",
                          description: "Short, action-oriented title"
                        },
                        accountType: { 
                          type: "string",
                          description: "Type of account to apply for"
                        },
                        priority: { 
                          type: "string",
                          enum: ["high", "medium", "low"]
                        },
                        phase: {
                          type: "string",
                          description: "BUILD phase (e.g., 'Phase 1: Foundation', 'Phase 4: Growth')"
                        },
                        approvalStrategy: {
                          type: "string",
                          description: "Specific strategies to maximize approval odds"
                        },
                        fundabilityImpact: {
                          type: "string",
                          description: "How this will improve fundability"
                        },
                        timeline: {
                          type: "string",
                          description: "When to apply (e.g., 'Now', 'In 3 months')"
                        },
                        specificProviders: {
                          type: "array",
                          items: { type: "string" },
                          description: "Specific lenders/providers to target"
                        }
                      },
                      required: ["title", "accountType", "priority", "phase", "approvalStrategy", "fundabilityImpact", "timeline"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["recommendations"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "provide_credit_recommendations" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response:", JSON.stringify(data, null, 2));

    // Extract tool call response
    const toolCall = data.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in response");
    }

    const suggestions = JSON.parse(toolCall.function.arguments);
    console.log("Parsed suggestions:", suggestions);

    return new Response(
      JSON.stringify(suggestions),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error("Error in personal-build-suggestions:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        recommendations: []
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});