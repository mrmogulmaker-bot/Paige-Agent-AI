import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://esm.sh/zod@3.22.4";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Support both single-item (legacy) and combined multi-item format
const disputeItemSchema = z.object({
  creditorName: z.string().min(1).max(200),
  accountNumber: z.string().max(100).optional().nullable(),
  amount: z.number().optional().nullable(),
  itemType: z.string().max(100).optional().nullable(),
  disputeBasis: z.string().min(1).max(1000),
});

const combinedLetterSchema = z.object({
  mode: z.literal("combined"),
  bureau: z.string().min(1).max(100),
  clientName: z.string().min(1).max(200),
  clientAddress: z.string().max(500).optional().nullable(),
  items: z.array(disputeItemSchema).min(1).max(50),
  round: z.number().int().min(1).max(10).optional(),
});

const legacySchema = z.object({
  bureauData: z.object({
    name: z.string().min(1).max(100),
    totalAccounts: z.number().int().min(0).max(10000),
    derogatoryItems: z.number().int().min(0).max(10000),
    delinquentItems: z.number().int().min(0).max(10000),
  }),
  issueType: z.string().min(1).max(500),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: rateLimitCheck } = await adminClient.rpc('check_rate_limit', {
      _user_id: user.id,
      _function_name: 'generate-dispute-letter',
      _max_requests: 10,
      _window_minutes: 60
    });

    if (!rateLimitCheck) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again in an hour.', retryAfter: 3600 }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '3600' } }
      );
    }

    const rawData = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Determine mode
    const isCombined = rawData.mode === "combined";

    let systemPrompt: string;
    let userPrompt: string;

    if (isCombined) {
      const validated = combinedLetterSchema.parse(rawData);
      const { bureau, clientName, clientAddress, items, round } = validated;

      const bureauAddresses: Record<string, string> = {
        equifax: "Equifax Information Services LLC\\nP.O. Box 740256\\nAtlanta, GA 30374",
        experian: "Experian\\nP.O. Box 4500\\nAllen, TX 75013",
        transunion: "TransUnion Consumer Solutions\\nP.O. Box 2000\\nChester, PA 19016",
      };
      const bureauKey = bureau.toLowerCase().trim();
      const bureauAddr = bureauAddresses[bureauKey] || `${bureau} Credit Bureau`;

      const itemsList = items.map((item, i) => {
        const amountStr = item.amount ? ` — Balance: $${item.amount.toLocaleString()}` : "";
        const acctStr = item.accountNumber ? ` (Account: ${item.accountNumber})` : "";
        return `${i + 1}. ${item.creditorName}${acctStr}${amountStr}\n   Type: ${item.itemType || "Unknown"}\n   Dispute Basis: ${item.disputeBasis}`;
      }).join("\\n\\n");

      const roundLabel = round && round > 1 ? ` (Round ${round} — Follow-Up)` : "";
      const escalation = round && round > 1
        ? "\\n\\nIMPORTANT: This is a follow-up dispute. The consumer previously disputed these items and the investigation was inadequate or the items remain unverified. Use stronger language referencing the bureau's obligation under FCRA Section 611(a)(5) to provide the method of verification and noting that failure to properly investigate may result in legal action under FCRA Section 616 and 617."
        : "";

      systemPrompt = `You are an expert credit dispute letter writer for Project Mogul Enterprise Inc. (PME), specializing in FCRA and FDCPA compliance.

Write a SINGLE professional dispute letter addressed to ${bureau} that disputes ALL listed items in one organized letter.${escalation}

CRITICAL ACCOUNT TYPE RULES — use the correct statutory basis for each item type:
- Collection accounts: Cite FDCPA Section 809(b) — request original creditor name, original balance, date of first delinquency, and collector's authority to collect.
- Charge-Off accounts: Cite FCRA Section 611 — request original signed account agreement, complete payment history, and method of verification.
- Late Payment notations: Cite FCRA Section 623(a)(1) — request payment history records and method of verification for the late payment.
- Repossession records: Cite FCRA Section 611 — request original agreement, deficiency balance calculation, and auction records.
- Foreclosure records: Cite FCRA Section 611 — request mortgage agreement, default notifications, and method of verification.
- Bankruptcy public records: Cite FCRA Section 611 — request case number, filing date, discharge date, and court documentation.
- Hard Inquiries (unauthorized): Cite FCRA Section 604 — demand documentation of permissible purpose or immediate removal.
- Account Not Mine: Cite FCRA Section 611 — state consumer has no knowledge, demand signed application/agreement or removal.

Each item in the letter MUST use the statutory language matching its specific account type. Do NOT use the same template language across different account types.

FORMAT REQUIREMENTS:
- Start with [DATE] placeholder
- Bureau address block
- Client name: ${clientName}
- Client address: ${clientAddress || "[CLIENT ADDRESS]"}
- Subject line: "Re: Formal Dispute of Inaccurate Credit Report Items${roundLabel}"
- Professional opening paragraph citing FCRA rights
- Numbered list of ALL disputed items with their specific statutory basis per account type
- Each item must include the creditor name, account number if available, balance, account type, and the specific FCRA/FDCPA section being cited for that type
- Closing paragraph requesting investigation within 30 days per FCRA Section 611(a)
- Statement reserving all rights under FCRA including right to seek damages
- Signature block with client name and signature line
- Footer: "This letter should be sent via USPS Certified Mail, Return Receipt Requested. Keep a copy for your records."
- Footer: "Prepared with PaigeAgent AI — Project Mogul Enterprise Inc."

Do NOT fabricate any agreements or promises between creditors and consumers.
Keep the letter between 400-800 words depending on item count.`;

      userPrompt = `Generate the combined dispute letter for ${bureau} with the following ${items.length} disputed items:\n\n${itemsList}`;

    } else {
      const validated = legacySchema.parse(rawData);
      const { bureauData, issueType } = validated;

      systemPrompt = `You are an expert credit dispute letter writer specializing in FCRA compliance.
Guidelines:
- Use formal business letter format
- Reference specific FCRA rights (15 U.S.C. \\u00a7 1681)
- Be clear and concise about the disputed items
- Request investigation and correction
- Include a 30-day timeline reference
- Maintain professional tone
- Do not make false claims or threats
- Keep letters between 250-400 words
- Footer: "Prepared with PaigeAgent AI \\u2014 Project Mogul Enterprise Inc."`;

      userPrompt = `Create a dispute letter for:
Bureau: ${bureauData.name}
Issue Type: ${issueType}
Total Accounts: ${bureauData.totalAccounts}
Derogatory Items: ${bureauData.derogatoryItems}
Delinquent Items: ${bureauData.delinquentItems}

Include: date placeholder, bureau address, consumer info placeholder, disputed items, investigation request, FCRA rights reference, professional closing.`;
    }

    console.log('Generating dispute letter for user:', user.id, 'mode:', isCombined ? 'combined' : 'legacy');

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
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorId = crypto.randomUUID();
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later.", errorId }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required.", errorId }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      console.error(`[DISPUTE-LETTER-ERROR-${errorId}] AI gateway error:`, { status: response.status });
      return new Response(JSON.stringify({ error: "An error occurred while processing your request", errorId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    console.error(`[DISPUTE-LETTER-ERROR-${errorId}]`, {
      message: error instanceof Error ? error.message : 'Unknown',
      timestamp: new Date().toISOString()
    });
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: 'Invalid input format', details: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({ error: "An error occurred while processing your request", errorId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
