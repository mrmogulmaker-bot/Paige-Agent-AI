import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bureauData, issueType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log('Generating dispute letter for:', { bureauData, issueType });

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
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const letter = data.choices[0].message.content;

    console.log('Successfully generated dispute letter');

    return new Response(
      JSON.stringify({ letter }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-dispute-letter:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
