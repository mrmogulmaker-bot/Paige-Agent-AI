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
    const { messages } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract the last user message to search for relevant knowledge
    const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
    let relevantKnowledge = "";

    if (lastUserMessage) {
      // Search knowledge base for relevant content
      const { data: knowledge, error: kbError } = await supabase
        .from("knowledge_base")
        .select("title, content, summary, framework, category")
        .or(`content.ilike.%${lastUserMessage.content}%,tags.cs.{${extractKeywords(lastUserMessage.content)}}`)
        .limit(5);

      if (knowledge && knowledge.length > 0) {
        relevantKnowledge = "\n\nRelevant Knowledge Base:\n" + 
          knowledge.map(k => `### ${k.title} (${k.framework} - ${k.category})\n${k.content}`).join("\n\n");
      }
    }

    // System prompt with knowledge context
    const systemPrompt = `You are Paige AI, an expert financial coach and credit repair specialist at Mogul Maker Academy. You help users navigate their credit repair journey, build business credit, and achieve financial empowerment using our proven frameworks.

Key Frameworks You Support:
- 3M Framework: Make (Foundation), Manage (Stewardship), Multiply (Scaling)
- A.C.C.E.L.: Credit repair framework (Analyze, Challenge, Clean, Elevate, Lock)
- B.U.I.L.D.: Business credit framework (Business, Utilize, Income, Leverage, Diversify)
- Money Follows Management (MFM): Mindset and leadership development

Site Navigation Help:
- Dashboard: Main overview with credit scores, ACCEL and BUILD progress
- Paige AI: Dedicated AI coaching section for in-depth conversations
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
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI service requires additional credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stream the response back
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function extractKeywords(text: string): string {
  // Extract potential keywords for tag matching
  const keywords = text.toLowerCase().match(/\b(build|make|manage|multiply|credit|business|mfm|accel|fund|real|keys|acquire|framework|mindset|leadership)\b/g);
  return keywords ? keywords.join(",") : "";
}
