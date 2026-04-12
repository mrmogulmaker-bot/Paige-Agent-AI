import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";
import { PME_KNOWLEDGE_BASE } from "../_shared/pme-knowledge-base.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const messageSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1).max(50000),
      documentFileName: z.string().optional(),
    })
  ).min(1).max(50),
  document: z.object({
    base64: z.string(),
    fileName: z.string(),
    mimeType: z.literal('application/pdf'),
  }).optional(),
  sessionDocumentContext: z.array(
    z.object({
      fileName: z.string(),
      summary: z.string(),
    })
  ).optional(),
  generateSessionSummary: z.boolean().optional(),
  sessionMessages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ).optional(),
  clientId: z.string().uuid().nullable().optional(),
  clientContext: z.string().max(10000).optional(),

const DOCUMENT_SOURCE_INSTRUCTION = `You are analyzing a specific PDF document that has been provided to you. You must ONLY report information that you can directly read from this document. Do not use your training data or prior knowledge to fill in account details, creditor names, balances, or scores. If you cannot read a specific piece of information from the document, state "Not visible in document" rather than providing an estimate or assumption. Every account name, balance, score, and date you report must be directly extractable from the uploaded document text.`;

const DOCUMENT_READ_CHECK_PROMPT = `${DOCUMENT_SOURCE_INSTRUCTION}

Before any analysis, verify that you can literally read the PDF. Return ONLY valid JSON with this exact structure:
{
  "document_kind": "credit_report" | "financial_document" | "other",
  "can_read_document": boolean,
  "parse_error": "string or null",
  "visible_text_excerpt": "string",
  "first_five_account_names": ["string"],
  "directly_read_account_count": number,
  "confidence_statement": "I was able to directly read N accounts from this document",
  "fraud_alerts_visible": boolean,
  "visible_scores": {
    "equifax": number or null,
    "experian": number or null,
    "transunion": number or null
  }
}

Rules:
- The account names must be literal names visible in the PDF, not guesses.
- If this is a tri-merge credit report, identify the first five tradeline or collection account names you can actually read.
- If you cannot read any account names from a credit report, set can_read_document to false and parse_error to "Unable to parse document content — please ensure the uploaded file is a readable PDF credit report".
- Do not include markdown.`;

// Structured extraction prompt - used after analysis to extract clean JSON for sync
const STRUCTURED_EXTRACTION_PROMPT = `${DOCUMENT_SOURCE_INSTRUCTION}

You have just analyzed a credit report. Now extract the structured data from your own analysis above into a precise JSON object. Return ONLY valid JSON — no markdown, no explanation.

Required structure:
{
  "is_credit_report": true,
  "extraction_verified": true,
  "report_type": "consumer",
  "scores": { "equifax": integer_or_null, "experian": integer_or_null, "transunion": integer_or_null },
  "fraud_alerts_visible": boolean,
  "fraud_alerts": [{ "alert_type": "string", "bureaus": ["string"], "expiration_date": "string_or_null" }],
  "security_freezes": [{ "bureau": "string" }],
  "account_names_extracted": ["string"],
  "directly_read_account_count": integer,
  "confidence_statement": "string",
  "negative_items": [{
    "creditor_name": "string",
    "account_number_masked": "string_or_null",
    "bureau": "Equifax" | "Experian" | "TransUnion",
    "item_type": "collection" | "late_payment" | "charge_off" | "public_record" | "repossession" | "foreclosure" | "other",
    "amount": number_or_null,
    "date_of_occurrence": "YYYY-MM-DD_or_null",
    "date_reported": "YYYY-MM-DD_or_null",
    "dispute_basis": "string",
    "estimated_score_impact": number_or_null,
    "status": "active",
    "is_cross_bureau_discrepancy": boolean
  }],
  "hard_inquiries": [{ "creditor_name": "string", "inquiry_date": "YYYY-MM-DD", "bureau": "string", "is_authorized": boolean }],
  "positive_accounts": [{
    "creditor": "string",
    "account_number_masked": "string_or_null",
    "account_type": "revolving" | "installment" | "mortgage" | "auto_loan" | "student_loan" | "open",
    "balance": number_or_null,
    "credit_limit": number_or_null,
    "utilization": number_or_null,
    "payment_status": "string_or_null",
    "status": "current",
    "account_open_date": "YYYY-MM-DD_or_null",
    "is_open": boolean,
    "bureaus": ["string"]
  }],
  "inquiry_count": { "transunion": integer, "experian": integer, "equifax": integer },
  "oldest_account_date": "YYYY-MM-DD_or_null",
  "average_account_age_months": integer_or_null,
  "oldest_account_age_months": integer_or_null,
  "discrepancies": [{ "account_name": "string", "issue": "string", "bureaus_affected": ["string"] }],
  "priority_disputes": [{
    "account_name": "string",
    "bureau": "string",
    "dispute_basis": "string"
  }]
}

Rules:
- Only include data you directly read from the document analysis above
- Each negative item that appears on multiple bureaus should be listed as separate entries per bureau
- priority_disputes should contain the top 5-7 dispute targets from your Priority Action Plan
- All scores must be between 300-850 or null
- Set extraction_verified to false if you cannot confidently extract the data`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Rate limit
    const { data: rateLimitCheck } = await supabase.rpc('check_rate_limit', {
      _user_id: user.id,
      _function_name: 'paige-ai-chat',
      _max_requests: 20,
      _window_minutes: 1
    });
    if (rateLimitCheck === false) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
      );
    }

    const rawData = await req.json();
    let validatedData;
    try {
      validatedData = messageSchema.parse(rawData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return new Response(
          JSON.stringify({ error: 'Invalid input format', details: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw error;
    }

    const { messages, document: attachedDocument, sessionDocumentContext, generateSessionSummary, sessionMessages, clientId: payloadClientId } = validatedData;

    // === SESSION SUMMARY GENERATION MODE ===
    if (generateSessionSummary && sessionMessages && sessionMessages.length > 0) {
      const last20 = sessionMessages.slice(-20);
      const summaryPrompt = `You are a session summarizer. Given the following chat messages between a client and Paige (an AI credit strategist), produce a 3-5 sentence plain-language summary of what was discussed, what was decided, what documents were uploaded, and what next steps were identified. Be specific about names, scores, and actions. Do NOT use bullet points — write flowing sentences.

MESSAGES:
${last20.map(m => `${m.role === 'user' ? 'Client' : 'Paige'}: ${m.content}`).join('\n')}

SUMMARY:`;

      const summaryResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{ role: "user", content: summaryPrompt }],
        }),
      });

      if (!summaryResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to generate summary" }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const summaryData = await summaryResponse.json();
      const summaryContent = summaryData.choices?.[0]?.message?.content || "";

      if (summaryContent.trim()) {
        const memoryInsert: any = {
          client_user_id: payloadClientId || user.id,
          memory_type: "session_summary",
          content: summaryContent.trim(),
          source_session_id: rawData.sessionId || null,
        };
        if (payloadClientId) memoryInsert.client_id = payloadClientId;
        await supabase.from("client_memory").insert(memoryInsert);
      }

      return new Response(
        JSON.stringify({ summary: summaryContent.trim() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate document size
    if (attachedDocument?.base64 && attachedDocument.base64.length > 15_000_000) {
      return new Response(
        JSON.stringify({ error: 'Document too large. Maximum size is 10MB.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let documentReadCheck: any = null;
    if (attachedDocument) {
      documentReadCheck = await runDocumentReadCheck(attachedDocument.base64, lovableApiKey);
      if (!documentReadCheck?.can_read_document || documentReadCheck?.document_kind !== 'credit_report' || (documentReadCheck?.first_five_account_names || []).length < 1) {
        const message = documentReadCheck?.parse_error || 'Unable to parse document content — please ensure the uploaded file is a readable PDF credit report';
        return new Response(
          JSON.stringify({ error: message }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fetch URL content if present
    const lastUserMessage = messages.filter((m: any) => m.role === "user").pop();
    let fetchedUrlContent = "";
    if (lastUserMessage) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = lastUserMessage.content.match(urlRegex);
      if (urls && urls.length > 0) {
        try {
          const urlResponse = await fetch(`${supabaseUrl}/functions/v1/fetch-url-content`, {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: urls[0] })
          });
          if (urlResponse.ok) {
            const urlData = await urlResponse.json();
            if (urlData.success) {
              fetchedUrlContent = `\n\n=== FETCHED URL CONTENT ===\nURL: ${urlData.url}\nContent:\n${urlData.content}\n===========================\n`;
            }
          }
        } catch (error) {
          console.error('Error fetching URL content:', error);
        }
      }
    }

    // === LOAD CLIENT MEMORY ===
    let memoryBlock = "";
    try {
      const memoryQuery = payloadClientId
        ? supabase.from("client_memory").select("memory_type, content, created_at").eq("client_id", payloadClientId).eq("is_active", true).order("created_at", { ascending: false }).limit(10)
        : supabase.from("client_memory").select("memory_type, content, created_at").eq("client_user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(10);
      const { data: memories } = await memoryQuery;

      if (memories && memories.length > 0) {
        const priorityOrder: Record<string, number> = {
          report_upload: 1, funding_secured: 2, dispute_generated: 3,
          milestone_completed: 4, lender_researched: 5, coach_note: 6, session_summary: 7,
        };
        const sorted = [...memories].sort((a, b) => (priorityOrder[a.memory_type] || 99) - (priorityOrder[b.memory_type] || 99));

        let tokenEstimate = 0;
        const included: string[] = [];
        for (const mem of sorted) {
          const entry = `• [${mem.memory_type.replace(/_/g, ' ').toUpperCase()}] (${new Date(mem.created_at).toLocaleDateString()}): ${mem.content}`;
          const entryTokens = Math.ceil(entry.length / 4);
          if (tokenEstimate + entryTokens > 1000) break;
          tokenEstimate += entryTokens;
          included.push(entry);
        }

        if (included.length > 0) {
          memoryBlock = `\n\n=== PAIGE MEMORY — What I know about this client from previous sessions ===\n${included.join("\n")}\n=== END MEMORY ===\n\nIMPORTANT: Use this memory to personalize your responses. If this is the start of a new conversation (only 1 user message), open with a personalized greeting that references what you know from memory.\n`;
        }
      }
    } catch (err) {
      console.error("Error loading client memory:", err);
    }

    // === BUILD WITHIN-SESSION DOCUMENT CONTEXT ===
    let sessionDocContext = "";
    if (sessionDocumentContext && sessionDocumentContext.length > 0) {
      const docSummaries = sessionDocumentContext
        .map((doc, i) => `Document ${i + 1} (${doc.fileName}):\n${doc.summary}`)
        .join("\n\n");
      sessionDocContext = `\n\n=== PREVIOUSLY ANALYZED DOCUMENTS IN THIS SESSION ===\n${docSummaries}\n=== END SESSION DOCUMENTS ===\nYou can answer follow-up questions about these documents using the summaries above.\n`;
    }

    // Fetch user context
    let userContext = "";
    try {
      const { data: profile } = await supabase.from("profiles").select("full_name, city, state").eq("user_id", user.id).maybeSingle();
      const { data: subscription } = await supabase.from("user_subscriptions").select("plan_slug, status").eq("user_id", user.id).maybeSingle();
      const { data: tasks } = await supabase.from("tasks").select("title, status, track, due_date").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
      const { data: disputes } = await supabase.from("disputes").select("bureau, creditor_name, status").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5);
      const { data: businesses } = await supabase.from("businesses").select("id, legal_name, entity_type, formation_status, business_type").eq("owner_user_id", user.id).order("created_at", { ascending: false }).limit(5);
      const { data: documents } = await supabase.from("documents").select("document_type, file_name, business_id, uploaded_at").eq("user_id", user.id).order("uploaded_at", { ascending: false }).limit(20);

      const contextParts: string[] = [];
      if (profile) contextParts.push(`User Profile: ${profile.full_name || "User"} from ${profile.city ? `${profile.city}, ${profile.state}` : "location not set"}`);
      if (subscription) contextParts.push(`Subscription: ${subscription.plan_slug} plan (${subscription.status})`);
      if (tasks && tasks.length > 0) {
        const pendingTasks = tasks.filter(t => t.status === "pending").length;
        const completedTasks = tasks.filter(t => t.status === "completed").length;
        contextParts.push(`Tasks: ${pendingTasks} pending, ${completedTasks} completed`);
        if (pendingTasks > 0) {
          const taskSummary = tasks.filter(t => t.status === "pending").slice(0, 3).map(t => `- ${t.title} (${t.track})`).join("\n");
          contextParts.push(`Recent Pending Tasks:\n${taskSummary}`);
        }
      }
      if (disputes && disputes.length > 0) contextParts.push(`Active Disputes: ${disputes.filter(d => d.status === "in_review").length} of ${disputes.length} total`);
      if (businesses && businesses.length > 0) {
        const bizSummary = businesses.map(b => `${b.legal_name} (${b.business_type}, ${b.entity_type || "type not set"})`).join(", ");
        contextParts.push(`Businesses: ${bizSummary}`);
      }
      if (documents && documents.length > 0) {
        const personalDocs = documents.filter(d => !d.business_id);
        const businessDocs = documents.filter(d => d.business_id);
        const docSummary: string[] = [];
        if (personalDocs.length > 0) docSummary.push(`Personal Documents (${personalDocs.length}): ${[...new Set(personalDocs.map(d => d.document_type))].join(", ")}`);
        if (businessDocs.length > 0) docSummary.push(`Business Documents (${businessDocs.length}): ${[...new Set(businessDocs.map(d => d.document_type))].join(", ")}`);
        if (docSummary.length > 0) contextParts.push(`Available Documents:\n${docSummary.join("\n")}`);
      }
      userContext = contextParts.length > 0 ? "\n\n=== USER CONTEXT ===\n" + contextParts.join("\n") + "\n==================\n" : "";
    } catch (error) {
      console.error("Error fetching user context:", error);
    }

    // Knowledge base search
    let relevantKnowledge = "";
    if (lastUserMessage) {
      const sanitizedContent = lastUserMessage.content.replace(/[%_]/g, '\\$&').substring(0, 200);
      const { data: knowledge } = await supabase.from("knowledge_base").select("title, content, summary, framework, category").textSearch('content', sanitizedContent).limit(5);
      if (knowledge && knowledge.length > 0) {
        relevantKnowledge = "\n\nRelevant Knowledge Base:\n" + knowledge.map(k => `### ${k.title} (${k.framework} - ${k.category})\n${k.content}`).join("\n\n");
      }
    }

    const currentDateTime = new Date();
    const dateTimeString = currentDateTime.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZoneName: 'short' });

    const systemPrompt = `You are Paige, the AI Funding Coach and CRM assistant for Project Mogul Enterprise Inc. (PME). You assist Antonio Cook and his team in managing funding clients from credit assessment through capital access. You were named after Aijah Paige Cook — the daughter of the founder. If someone named Aijah or Aijah Paige ever signs up, give her a special welcome: she's your namesake, and you carry her name with pride.

=== ROLE & POSITIONING ===
You are PME's internal AI strategist. When operating in client context, you have full awareness of the current client file — their credit profile, business entities, documents, funding history, and task progress. You use web search when asked to research lenders, market conditions, or funding programs. You are compliance-first: you NEVER guarantee approvals, NEVER give legal advice, and ALWAYS frame output as financial education and guidance.

You operate within PME's proprietary frameworks: ACCEL, BUILD, FUND, REPORT, SHIELD, and ACQUIRE.

=== BRAND VOICE DNA ===
CORE PHILOSOPHY: "Borrower Brain vs. Banker Brain" — most people are financially enslaved by a borrower mindset. Your job is psychological surgery to rewire how they think about money, credit, and capital.

YOUR PERSONALITY:
- Direct, professional, warm, and knowledgeable. You sound like the most informed person in the room who genuinely wants the client to succeed.
- Big-sister energy meets banker precision — sharp and confident but never cold.
- Technical credibility in plain language: "Your utilization is at 68% — that's costing you 35 points minimum" NOT "You may want to consider reducing your credit utilization ratio."
- Action-oriented. EVERY interaction ends with a specific, concrete next step.
- You speak with warmth when people are struggling and fire when they need a push.

LANGUAGE PATTERNS:
- Military/surgical metaphors: "protocol", "deploy", "install", "rewire", "command"
- Direct confrontation with care: "Here's the Banker Brain play" not "You might consider..."
- Specific numbers always: "$4,200 to $1,500" not "reduce your balance"
- Emotional depth beneath intensity

WHAT YOU NEVER DO:
- Generic advice ("You should improve your credit")
- Hedge or be vague
- Celebrate without a next step
- Sound like a corporate chatbot
- Promise specific score outcomes (compliance)

=== CURRENT DATE & TIME ===
Right now it is: ${dateTimeString}
============================

=== COMPLIANCE MODULE: PaigeAI_Compliance_v1_MMA ===

CRITICAL LEGAL & REGULATORY COMPLIANCE:
You operate under strict consumer finance regulations including FCRA, CROA, FDCPA, ECOA/Reg B, TILA/Reg Z, Dodd-Frank (UDAAP), GLBA, and KYC/AML standards.

MANDATORY DISCLOSURE REQUIREMENTS:
Before ANY financial data access or action, you MUST:
1. CREDIT REPORT ACCESS: Present disclosure, explain soft vs hard inquiry, obtain consent, tag "Educational Purposes Only"
2. CROA RIGHTS NOTICE: Show consumer rights and 3-day cancellation policy
3. DATA SHARING CONSENT: Explain recipients, encryption standards, retention, deletion rights
4. OFFER DISPLAY DISCLAIMER: Clarify you are NOT a lender
5. ADVERSE ACTION ROUTING: Denials issued by lenders, NOT by you

FUNCTIONAL SAFEGUARDS:
- Educational explanations ONLY
- Generate dispute templates ONLY — never send direct communications
- All credit-related responses end with "Educational Purposes Only" disclaimer
- No use of protected attributes in recommendations
- "Delete my data" triggers deletion request immediately
- Verify consent before API calls
- Log every consent, API call, and lender match

PROHIBITED ACTIONS:
- NEVER make credit decisions or lending recommendations
- NEVER promise specific credit score improvements
- NEVER send communications to bureaus/collectors on user's behalf
- NEVER charge before services performed
- NEVER use protected characteristics in scoring
- NEVER access credit data without logged consent
- NEVER fabricate creditor agreements or promises

=== END COMPLIANCE MODULE ===

${memoryBlock}${sessionDocContext}${userContext}${fetchedUrlContent}

=== OUR PROGRAMS & FRAMEWORKS ===
You guide users through: ACCEL (Credit Restoration), BUILD Personal (Credit Building), BUILD Business (Business Credit), FUND (Funding Qualification), REPORT (Credit Monitoring), SHIELD (Compliance & Protection), ACQUIRE (Capital Deployment).

CRITICAL CONTENT FILTERING RULES:
When discussing Personal Credit (ACCEL or BUILD Personal):
- ONLY discuss personal credit topics
- NEVER mention EIN, LLC, DUNS, net-30, vendor accounts, business trade lines, etc.
When Business Credit keywords are detected in Personal Credit context, redirect.

PLATFORM TOOLS YOU CAN SUGGEST:
Dashboard, Credit Score Overview, ACCEL/BUILD Progress Trackers, Task Manager, Three Bureau Report, Dispute Manager, Credit Accounts, Documents Manager, Business Management, Organization Chart, Funding Marketplace, Learning Vault, Profile Settings, Subscription Management, Affiliate Program.

YOUR REVIEW & SUGGESTION CAPABILITIES:
- Review uploaded documents and suggest missing critical documents
- Analyze task completion and recommend next priorities
- Assess dispute progress and suggest next creditors to challenge
- Review business structure and suggest optimization
- Evaluate funding readiness and recommend specific products
- Check subscription plan and suggest relevant features
- Identify gaps in credit profile and recommend corrective actions

PERSONALIZATION GUIDELINES:
- ALWAYS reference specific user context
- Suggest tools matching their subscription plan
- Acknowledge progress and celebrate completed milestones
- Provide specific next steps
- Direct them to exact dashboard sections
${relevantKnowledge}

=== PME FUNDING KNOWLEDGE BASE ===
${PME_KNOWLEDGE_BASE}
=== END PME FUNDING KNOWLEDGE BASE ===`;

    // Build message array
    const aiMessages: any[] = [{ role: "system", content: systemPrompt }];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      if (attachedDocument && msg.role === "user" && i === messages.length - 1) {
        const contentParts: any[] = [
          {
            type: "image_url",
            image_url: { url: `data:application/pdf;base64,${attachedDocument.base64}` },
          },
          {
            type: "text",
            text: msg.content + `\n\n[Attached document: ${attachedDocument.fileName}]

=== CREDIT REPORT ANALYSIS INSTRUCTIONS ===
If this document is a credit report (especially a tri-merge report from MyFreeScoreNow, IdentityIQ, SmartCredit, or similar), produce a STRUCTURED analysis in the following exact format. Use a professional, precise, advisory tone — like a senior credit analyst.

**TRI-MERGE FORMAT**: These reports present each account in three columns — TransUnion (left), Experian (middle), Equifax (right). Dashes (--) mean NOT reported at that bureau. Read each column independently.

**SECTION 0 — FRAUD ALERTS & SECURITY FREEZES (if present)**
Check the Consumer Statement section FIRST. If fraud alerts or security freezes exist, display them BEFORE any other content.

**SECTION 1 — BUREAU SCORES SUMMARY**
Three-column table: Equifax | Experian | TransUnion. Show score, classification, primary suppressing factor.

**SECTION 2 — BUREAU-BY-BUREAU NEGATIVE ITEM BREAKDOWN**
Per bureau: Account Name, Original Creditor, Type, Account Number (masked), Date of Last Activity, Balance, Creditor Remarks, Dispute Basis.
Extract ALL negative types including charge-offs, collections, late payments, public records.
Use LEGITIMATE STATUTORY LANGUAGE ONLY for dispute bases.
NEVER fabricate creditor agreements or promises.

**SECTION 3 — CROSS-BUREAU DISCREPANCIES — DISPUTE PRIORITY ITEMS**
Compare the same debt across all three bureaus. Flag inconsistencies.

**SECTION 4 — POSITIVE ACCOUNTS SUMMARY**
Accounts in good standing: creditor, type, limit, balance, utilization %, payment status, age, bureaus.

**SECTION 5 — HARD INQUIRIES**
List all hard inquiries with creditor name, date, bureau.

**SECTION 6 — FUNDING STRATEGY IMPACT**
Specific to actual scores and negatives found.

**SECTION 7 — PRIORITY ACTION PLAN**
Top 5-7 actions ranked by score impact. Include bureau(s), estimated impact range, statutory basis.

**SECTION 8 — COMPLIANCE DISCLAIMER**
"*This analysis is provided for educational purposes only...*"

=== FINANCIAL DOCUMENT INSTRUCTIONS ===
If financial document (bank statement, P&L, tax return), offer lender-ready summary.

Always identify the document type and bureau in your response.`,
          },
        ];
        aiMessages.push({ role: "user", content: contentParts });
      } else {
        aiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // Call AI
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: attachedDocument ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash",
        messages: aiMessages,
        tools: [
          {
            type: "function",
            function: {
              name: "web_fetch",
              description: "Fetch and extract content from a URL.",
              parameters: {
                type: "object",
                properties: {
                  url: { type: "string", description: "URL to fetch" },
                  purpose: { type: "string", description: "Why fetching" }
                },
                required: ["url", "purpose"]
              }
            }
          }
        ],
        tool_choice: "auto",
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorId = crypto.randomUUID();
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded.", errorId }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI service requires additional credits.", errorId }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      console.error(`[AI-CHAT-ERROR-${errorId}] AI gateway error:`, { status, timestamp: new Date().toISOString() });
      return new Response(JSON.stringify({ error: "An error occurred", errorId }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If no document attached, stream directly
    if (!attachedDocument) {
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // With document: intercept stream to accumulate response, then trigger background sync
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullAssistantResponse = "";

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          // After stream ends, run structured extraction + sync, then send sync status as final SSE event
          try {
            const syncResult = await runStructuredExtractionAndSync(
              fullAssistantResponse,
              attachedDocument.base64,
              user.id,
              authHeader,
              supabaseUrl,
              supabaseServiceKey,
              lovableApiKey,
              supabase,
              payloadClientId || null
            );

            // Send sync status as a final SSE data event before closing
            const syncEvent = `data: ${JSON.stringify({ sync_status: syncResult })}\n\n`;
            controller.enqueue(new TextEncoder().encode(syncEvent));
          } catch (err) {
            console.error("Sync pipeline error:", err);
            const errorEvent = `data: ${JSON.stringify({ sync_status: { success: false, error: err instanceof Error ? err.message : "Unknown sync error" } })}\n\n`;
            controller.enqueue(new TextEncoder().encode(errorEvent));
          }

          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        
        controller.enqueue(value);
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) fullAssistantResponse += content;
          } catch { /* skip */ }
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[AI-CHAT-ERROR-${errorId}] Function error:`, { message: error instanceof Error ? error.message : 'Unknown', timestamp: new Date().toISOString() });
    return new Response(JSON.stringify({ error: "An error occurred", errorId }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function extractKeywords(text: string): string {
  const keywords = text.toLowerCase().match(/\b(build|make|manage|multiply|credit|business|mfm|accel|fund|real|keys|acquire|framework|mindset|leadership)\b/g);
  return keywords ? keywords.join(",") : "";
}

async function runDocumentReadCheck(base64: string, lovableApiKey: string) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DOCUMENT_READ_CHECK_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Run the read-check on this uploaded PDF credit report before any analysis." },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Read-check API failed: status=${response.status} body=${errorBody}`);
    throw new Error(`Unable to verify document readability (API status ${response.status}).`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || "";
  console.log(`Read-check raw response length: ${rawContent.length}`);
  const content = cleanJsonResponse(rawContent);
  return JSON.parse(content);
}

function cleanJsonResponse(content: string) {
  return content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
}

function isScoreInRange(value: unknown) {
  return typeof value === "number" && value >= 300 && value <= 850;
}

// New: Run a second AI call to extract structured JSON from the analysis, then call sync
async function runStructuredExtractionAndSync(
  analysisText: string,
  documentBase64: string,
  callerUserId: string,
  authHeader: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  lovableApiKey: string,
  supabase: any,
  clientId: string | null = null
): Promise<any> {
  console.log("Starting structured extraction from analysis...");

  try {
    // Step 1: Extract structured JSON from the analysis via a second AI call
    const extractionResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: STRUCTURED_EXTRACTION_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Here is the credit report analysis I just produced. Extract the structured data into the required JSON format:\n\n${analysisText}` },
              { type: "image_url", image_url: { url: `data:application/pdf;base64,${documentBase64}` } },
            ],
          },
        ],
      }),
    });

    if (!extractionResponse.ok) {
      const errorBody = await extractionResponse.text();
      console.error(`Structured extraction failed: status=${extractionResponse.status} body=${errorBody}`);
      await logSyncFailure(supabase, callerUserId, `Structured extraction API failed: ${extractionResponse.status}`, null);
      return { success: false, error: "Failed to extract structured data from analysis", step: "extraction" };
    }

    const extractionData = await extractionResponse.json();
    const rawJson = extractionData.choices?.[0]?.message?.content || "";
    let structured: any;
    try {
      structured = JSON.parse(cleanJsonResponse(rawJson));
    } catch (parseErr) {
      console.error("Failed to parse structured extraction:", parseErr);
      await logSyncFailure(supabase, callerUserId, "Failed to parse structured extraction JSON", { raw_length: rawJson.length });
      return { success: false, error: "Failed to parse extracted data", step: "extraction_parse" };
    }

    console.log(`Extraction complete: ${(structured.negative_items || []).length} negatives, ${(structured.positive_accounts || []).length} positives`);

    // Step 2: Validate the extraction
    const validationErrors: string[] = [];
    if (!structured.is_credit_report) validationErrors.push("Not identified as credit report");
    if (!structured.extraction_verified) validationErrors.push("Extraction not verified");
    
    const negCount = (structured.negative_items || []).length;
    const posCount = (structured.positive_accounts || []).length;
    const totalAccounts = negCount + posCount;
    if (totalAccounts < 1) validationErrors.push("No accounts extracted");

    for (const bureau of ["equifax", "experian", "transunion"]) {
      const score = structured.scores?.[bureau];
      if (score != null && !isScoreInRange(score)) {
        validationErrors.push(`Invalid ${bureau} score: ${score}`);
      }
    }

    if (validationErrors.length > 0) {
      console.error("Extraction validation failed:", validationErrors);
      await logSyncFailure(supabase, callerUserId, `Validation failed: ${validationErrors.join("; ")}`, structured);
      return { success: false, error: `Validation failed: ${validationErrors.join("; ")}`, step: "validation", validationErrors };
    }

    // Step 3: Build sync payload and call sync-credit-report-data
    const syncPayload: any = {
      target_user_id: callerUserId,
      client_id: clientId || null,
      report_type: structured.report_type || "consumer",
      scores: structured.scores,
      negative_items: (structured.negative_items || []).map((n: any) => ({
        creditor_name: n.creditor_name || n.account_name || "Unknown",
        account_number_masked: n.account_number_masked || n.account_number || null,
        bureau: n.bureau || "TransUnion",
        item_type: n.item_type || "other",
        amount: n.amount || n.balance || null,
        date_of_occurrence: n.date_of_occurrence || n.date_of_last_activity || null,
        date_reported: n.date_reported || null,
        dispute_basis: n.dispute_basis || null,
        estimated_score_impact: n.estimated_score_impact || null,
        status: n.status || "active",
        is_cross_bureau_discrepancy: n.is_cross_bureau_discrepancy || false,
      })),
      hard_inquiries: (structured.hard_inquiries || []).map((i: any) => ({
        creditor_name: i.creditor_name,
        inquiry_date: i.inquiry_date,
        bureau: i.bureau,
        is_authorized: i.is_authorized ?? true,
      })),
      positive_accounts: (structured.positive_accounts || []).map((a: any) => ({
        creditor: a.creditor || a.account_name || "Unknown",
        account_type: a.account_type || "revolving",
        balance: a.balance || a.current_balance || null,
        credit_limit: a.credit_limit || null,
        utilization: a.utilization || null,
        status: a.status || "current",
        account_open_date: a.account_open_date || a.date_opened || null,
        is_open: a.is_open ?? true,
        payment_status: a.payment_status || null,
        account_number_masked: a.account_number_masked || a.account_number || null,
      })),
      average_account_age_months: structured.average_account_age_months || null,
      oldest_account_age_months: structured.oldest_account_age_months || null,
      oldest_account_date: structured.oldest_account_date || null,
      discrepancies: structured.discrepancies || [],
      priority_disputes: (structured.priority_disputes || []).map((d: any) => ({
        account_name: d.account_name,
        bureau: d.bureau,
        dispute_basis: d.dispute_basis,
      })),
      fraud_alerts: structured.fraud_alerts || [],
      security_freezes: structured.security_freezes || [],
    };

    console.log(`Calling sync-credit-report-data with ${syncPayload.negative_items.length} negatives, ${syncPayload.positive_accounts.length} positives, ${syncPayload.priority_disputes.length} priority disputes`);

    const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-credit-report-data`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(syncPayload),
    });

    const syncBody = await syncResponse.json().catch(() => ({ error: "Could not parse sync response" }));

    if (!syncResponse.ok) {
      console.error("Sync failed:", syncResponse.status, syncBody);
      await logSyncFailure(supabase, callerUserId, `Sync returned ${syncResponse.status}: ${JSON.stringify(syncBody)}`, syncPayload);
      return { success: false, error: `Sync failed: ${syncBody.error || syncResponse.status}`, step: "sync_call", details: syncBody };
    }

    console.log("Sync completed successfully:", syncBody);

    // Step 4: Write memory record
    const scores = structured.scores || {};
    const memoryContent = `Credit report analyzed (${structured.report_type || 'consumer'}). Scores: EQ ${scores.equifax || 'N/A'}, EX ${scores.experian || 'N/A'}, TU ${scores.transunion || 'N/A'}. Found ${negCount} negative items, ${(structured.hard_inquiries || []).length} hard inquiries, ${posCount} positive accounts.`;
    
    const memoryInsert: any = {
      client_user_id: clientId || callerUserId,
      memory_type: "report_upload",
      content: memoryContent,
    };
    if (clientId) memoryInsert.client_id = clientId;
    await supabase.from("client_memory").insert(memoryInsert);

    return {
      success: true,
      scores_synced: scores,
      negative_items_synced: negCount,
      positive_accounts_synced: posCount,
      disputes_created: syncBody.results?.disputes_auto_created || 0,
      credit_factors_recalculated: syncBody.results?.credit_factors_recalculated || false,
      funding_readiness_recalculated: syncBody.results?.funding_readiness_recalculated || false,
      sync_details: syncBody.results,
    };
  } catch (err) {
    console.error("Structured extraction and sync pipeline failed:", err);
    await logSyncFailure(supabase, callerUserId, err instanceof Error ? err.message : "Unknown pipeline error", null);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error", step: "pipeline" };
  }
}

async function logSyncFailure(supabase: any, userId: string, errorMessage: string, payload: any) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId,
      entity: "credit_report",
      action: "sync_failed",
      data: {
        error_message: errorMessage,
        timestamp: new Date().toISOString(),
        source: "chat_document_upload",
        payload_snapshot: payload ? JSON.stringify(payload).substring(0, 2000) : null,
      },
    });
  } catch (logErr) {
    console.error("Failed to log sync failure to audit_logs:", logErr);
  }
}
