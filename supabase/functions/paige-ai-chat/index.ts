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
});

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
    "original_amount": number_or_null,
    "utilization": number_or_null,
    "payment_status": "string_or_null",
    "payment_history_percentage": number_or_null,
    "status": "current",
    "account_open_date": "YYYY-MM-DD_or_null",
    "date_closed": "YYYY-MM-DD_or_null",
    "responsibility": "Individual" | "Joint" | "Authorized User" | null,
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

    const { messages, document: attachedDocument, sessionDocumentContext, generateSessionSummary, sessionMessages, clientId: payloadClientId, clientContext } = validatedData;

    // === SESSION SUMMARY GENERATION MODE ===
    if (generateSessionSummary && sessionMessages && sessionMessages.length > 0) {
      const last20 = sessionMessages.slice(-20);
      const summaryPrompt = `You are a session summarizer. Given the following chat messages between a client and Paige (an AI credit strategist), produce a 3-5 sentence plain-language summary of what was discussed, what was decided, what documents were uploaded, and what next steps were identified. Be specific about names, scores, and actions. Do NOT use bullet points — write flowing sentences.

MESSAGES:
${last20.map(m => `${m.role === 'user' ? 'Client' : 'Paige'}: ${m.content}`).join('\n')}

SUMMARY:`;

      // Also check for foundation milestone mentions
      const milestonePrompt = `Analyze the following conversation and determine if the client mentioned completing any of these Business Foundation items:
1. Forming a business entity (LLC, S-Corp, C-Corp, etc.)
2. Getting an EIN (Employer Identification Number)
3. Setting up a business address (virtual office, commercial office, registered agent)
4. Establishing a dedicated business phone line
5. Opening a business bank account

Return ONLY a JSON array of strings for items mentioned as completed. Use these exact labels: "entity_formed", "ein_obtained", "business_address_established", "business_phone_established", "business_bank_opened". If none were mentioned, return an empty array [].

MESSAGES:
${last20.map(m => `${m.role === 'user' ? 'Client' : 'Paige'}: ${m.content}`).join('\n')}

JSON:`;

      const [summaryResponse, milestoneResponse] = await Promise.all([
        fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages: [{ role: "user", content: summaryPrompt }] }),
        }),
        fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages: [{ role: "user", content: milestonePrompt }] }),
        }),
      ]);

      if (!summaryResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to generate summary" }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const summaryData = await summaryResponse.json();
      const summaryContent = summaryData.choices?.[0]?.message?.content || "";

      // Insert session summary memory
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

      // Insert milestone memories if detected
      if (milestoneResponse.ok) {
        try {
          const milestoneData = await milestoneResponse.json();
          const milestoneRaw = milestoneData.choices?.[0]?.message?.content || "[]";
          const cleaned = milestoneRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const milestones: string[] = JSON.parse(cleaned);

          const labelMap: Record<string, string> = {
            entity_formed: "Client mentioned forming their business entity",
            ein_obtained: "Client mentioned obtaining their EIN",
            business_address_established: "Client mentioned setting up a business address",
            business_phone_established: "Client mentioned establishing a dedicated business phone line",
            business_bank_opened: "Client mentioned opening a business bank account",
          };

          for (const m of milestones) {
            if (labelMap[m]) {
              const milestoneMemory: any = {
                client_user_id: payloadClientId || user.id,
                memory_type: "milestone_completed",
                content: labelMap[m],
                source_session_id: rawData.sessionId || null,
              };
              if (payloadClientId) milestoneMemory.client_id = payloadClientId;
              await supabase.from("client_memory").insert(milestoneMemory);
            }
          }
        } catch (err) {
          console.error("Error parsing milestone detection:", err);
        }
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
    let paigeChatUploadId: string | null = null;
    if (attachedDocument) {
      documentReadCheck = await runDocumentReadCheck(attachedDocument.base64, lovableApiKey);
      if (!documentReadCheck?.can_read_document || documentReadCheck?.document_kind !== 'credit_report' || (documentReadCheck?.first_five_account_names || []).length < 1) {
        const message = documentReadCheck?.parse_error || 'Unable to parse document content — please ensure the uploaded file is a readable PDF credit report';
        return new Response(
          JSON.stringify({ error: message }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Store the uploaded PDF to standard storage so Refresh can find it later
      try {
        const targetUserId = payloadClientId || user.id;
        const timestamp = Date.now();
        const safeName = (attachedDocument.fileName || "report.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${targetUserId}/${timestamp}_paige_${safeName}`;

        // Decode base64 to binary
        const binaryString = atob(attachedDocument.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const { error: storageErr } = await supabase.storage
          .from("credit-report-uploads")
          .upload(storagePath, bytes.buffer, { contentType: "application/pdf" });

        if (storageErr) {
          console.error("[Paige] Failed to store PDF to storage:", storageErr);
        } else {
          // Create credit_report_uploads record
          const { data: uploadRec, error: insertErr } = await supabase
            .from("credit_report_uploads")
            .insert({
              user_id: targetUserId,
              uploaded_by: user.id,
              file_name: attachedDocument.fileName || "credit-report.pdf",
              file_path: storagePath,
              file_size: bytes.length,
              analysis_status: "processing",
            })
            .select("id")
            .single();

          if (insertErr) {
            console.error("[Paige] Failed to create upload record:", insertErr);
          } else {
            paigeChatUploadId = uploadRec.id;
            console.log("[Paige] Stored PDF to credit-report-uploads, record id:", paigeChatUploadId);
          }
        }
      } catch (storeErr) {
        console.error("[Paige] Error storing PDF:", storeErr);
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

${clientContext ? `\n\n=== CLIENT CONTEXT (VERIFIED DATABASE DATA) ===\n${clientContext}\n=== END CLIENT CONTEXT ===\n\nIMPORTANT: You have been provided with a CLIENT CONTEXT block above. This block contains verified data from the client's platform file. Always reference this data when answering questions about the client's credit profile, scores, disputes, or funding status. Never ask the client to provide information that is already present in the CLIENT CONTEXT block. Begin every new session by briefly acknowledging what you know about the client's current situation based on this context, using a warm and professional tone.\n\n=== BUREAU-SPECIFIC FUNDING INTELLIGENCE RULES ===\nWhen discussing funding opportunities with a client, always lead with their strongest bureau score and name the specific lenders that pull that bureau. For example, if TransUnion is the highest score, lead with which major lenders pull TransUnion and what that score qualifies for before discussing the middle score or weaker bureaus. Never flatten three different bureau scores into a single middle score narrative when the individual scores create meaningfully different opportunities across different lender categories.\n\nBureau-lender mapping reference:\n- TransUnion: Capital One, Discover, OpenSky, Chime, Upgrade, Divvy\n- Experian: Chase, Amex, Wells Fargo, SoFi, OnDeck, BlueVine, Ramp, Mercury IO\n- Equifax: Citi, Bank of America, LightStream, Equipment lenders\n- Middle Score (all 3): SBA products, multi-bureau underwriting\n=== END BUREAU RULES ===\n\n=== NEGATIVE ITEM & CHARGE-OFF RULES ===\nWhen referencing negative items on a client's report, always use the unique account count rather than the total bureau record count. The same creditor appearing on three bureaus is one account problem, not three. When discussing resolution strategy for charge-offs, always reference the correct causal pathway — validate whether it is a true financial distress situation, a servicing error, or a re-aging issue before recommending any action. Never recommend disputing a charge-off without first establishing which of the five causal pathways applies to that specific account, as disputing a valid debt violates CROA and wastes a dispute round.\n\nThe five charge-off causal pathways are:\n1. True financial distress (job loss, medical) — negotiate pay-for-delete or settlement\n2. Servicing error (misapplied payment, wrong balance) — dispute with documentation\n3. Re-aging violation (date of first delinquency moved forward) — FCRA violation dispute\n4. Identity/fraud (account not belonging to client) — fraud dispute pathway\n5. Statute of limitations expired — verify SOL before any contact with creditor\n=== END NEGATIVE ITEM RULES ===\n\n=== BUSINESS FOUNDATION CROSS-REFERENCE RULES ===\nThe CLIENT CONTEXT includes a "Business Foundation Status" section showing the verified status of five foundation items: Entity Formation, EIN, Business Address, Business Phone, and Business Bank Account. When a client mentions anything related to these items, cross-reference what they say against the Foundation Status.\n\nIf a client says they have completed something that still shows as "Missing" or "Pending" in the context, acknowledge their progress and prompt them to update their Business Profile. For example: "That's a great step — make sure you update your Business Profile with your EIN so your platform reflects your current status and your funding matches update accordingly."\n\nIf an item shows as "Pending" with a Home Address warning, proactively educate the client about the privacy and funding implications and suggest upgrading to a virtual office or registered agent address.\n\nThis creates a natural feedback loop: your conversations encourage clients to keep their profile data current, which makes your advice more accurate in future sessions.\n=== END FOUNDATION RULES ===\n` : ''}${memoryBlock}${sessionDocContext}${userContext}${fetchedUrlContent}

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

=== CLIENT CONTEXT CROSS-REFERENCE RULES ===

BUREAU-SPECIFIC FUNDING STRATEGY RULE: When discussing funding opportunities, always lead with the client's strongest bureau score and name the specific lenders that pull that bureau. If TransUnion is highest, lead with TransUnion-pulling lenders and what that score qualifies for before discussing the middle score. Never flatten three different bureau scores into a single middle score narrative when the individual scores create meaningfully different opportunities. For example, a client with TransUnion 640, Experian 611, Equifax 598 should hear about Capital One and Discover opportunities at 640 before hearing about the 611 middle score limitation.

NEGATIVE ITEM COUNT RULE: When referencing negative items, always use the unique account count from the CLIENT CONTEXT block, not the total bureau record count. The same creditor appearing on three bureaus is one account problem not three. Always say something like "8 unique accounts across 22 bureau records" rather than simply "26 items."

CHARGE-OFF PATHWAY RULE: When discussing charge-off resolution, always identify which of the five causal pathways applies before recommending any action — True Financial Distress, Identity Theft, Synthetic Identity, Servicing Error, or Re-aging. Never recommend disputing a charge-off without first establishing the pathway because disputing a valid debt violates CROA and wastes a dispute round. Reference the specific creditor and dollar amount from the CLIENT CONTEXT when discussing strategy.

=== END CLIENT CONTEXT CROSS-REFERENCE RULES ===

=== DATA WRITE-BACK RULES ===
You have the ability to update client data directly through conversation using the update_client_data tool. Use this when:
1. A client explicitly states new information for a known field — e.g. "my business phone is 404-555-1234" or "our address is 100 Peachtree Street Atlanta GA 30303"
2. A coach instructs you to update a field — e.g. "update the EIN to on file" or "mark the Google listing as complete"
3. Multiple fields can be updated in a single call — e.g. an address update should set street_address, city, state, and zip together

When you execute a write-back:
- ALWAYS confirm what you wrote back in your response so the user knows the update happened
- Include the field name and new value in your confirmation
- Suggest related follow-up actions — e.g. after updating business phone, ask about 411 listing status
- If the address is described as a "virtual office" or "home address", also set foundation.business_address_type accordingly

DO NOT call update_client_data for:
- Casual mentions without clear intent to store — e.g. "I'm thinking about getting a virtual office" is NOT an update
- Sensitive fields like credit scores, SSN, or financial data — those are never writable through chat
- Deleting accounts — Paige cannot delete records, only admins and coaches can
=== END WRITE-BACK RULES ===

=== ACCOUNT MANAGEMENT & CLEANUP RULES ===
You can manage credit accounts through the update_client_data tool using these field paths:

1. accounts.mark_not_mine — Flag an account as not belonging to the client. Requires record_id.
2. accounts.update_bureau_source — Correct which bureau reports an account. Requires record_id and field_value.
3. accounts.mark_duplicate / accounts.merge_duplicates — Merge a duplicate into a primary record. Requires record_id (the duplicate) and merge_into_id (the primary to keep).

NEVER delete accounts. NEVER pressure clients. Always wait for explicit confirmation before any account operation.

=== ACCOUNT CLEANUP CONVERSATION RULES (PRIORITY OVER DISPUTE DEFLECTION) ===
These rules take ABSOLUTE PRIORITY over general dispute behavior. When a client asks about duplicates, test entries, or unrecognized accounts, DO NOT redirect to dispute letters as the first response. Address the file cleanup FIRST.

RULE 1 — DUPLICATE DETECTION RESPONSE:
When a client says "remove duplicates," "I see duplicate accounts," "this account appears twice," "clean up my file," or similar — DO NOT redirect to dispute letters. Instead check the client's account list for duplicates in context and respond:

"I can see some accounts in your file that appear to be duplicates or test entries. Let me walk through each one with you so we can clean this up right now.

I see the following accounts that may need attention:
[List each flagged account with details]

For each one I need two quick questions:
1. Do you recognize this as a real account that belongs to you?
2. If yes — is it appearing more than once, or is it the same account showing on multiple bureaus?

Once you tell me which ones are not yours or are true duplicates I can remove them from your file assessment right now. Dispute letters are a separate step for challenging items with the actual bureaus — but cleaning your PaigeAgent file first gives us an accurate picture to work from."

RULE 2 — NOT MY ACCOUNT RESPONSE:
When a client says "that is not my account," "I do not recognize that account," "that does not belong to me" — immediately offer to mark it as disputed ownership. DO NOT jump to dispute letter strategy. Respond:

"Got it — I am going to flag [account name] as an account you do not recognize. This removes it from your credit file assessment and scoring so we are only working with accounts that are actually yours.

Just to confirm — are you saying:
A) This account has never belonged to you at all (possible identity theft or mixed file)
B) You recognize the creditor but dispute the balance, status, or other details

Your answer changes the next step. Either way I am flagging it now — confirm and I will update your file."

After confirmation, call accounts.mark_not_mine and confirm: "Done — [account name] has been removed from your active file assessment. It will no longer affect your scores, comparable credit calculations, or health assessment. Now tell me about the next one."

RULE 3 — TEST ACCOUNT / PLACEHOLDER RESPONSE:
If you see an account with a name that is clearly a test or placeholder — TEST CREDITOR, TEST ACCOUNT, SAMPLE, PLACEHOLDER, or similar — proactively flag it without being asked:

"I also notice TEST CREDITOR in your file. This looks like a test entry rather than a real account. I am going to flag this as not yours so it stops affecting your assessment. Does that sound right?"

After confirmation, mark it as not mine immediately.

RULE 4 — SAME ACCOUNT MULTIPLE BUREAUS vs TRUE DUPLICATE:
When a client reports seeing the same account twice, explain the distinction:

"There are two different situations that can look like duplicates:

Situation A — Same account reported by multiple bureaus: GM Financial appears on both Experian and TransUnion. This is one account being tracked by two bureaus — that is normal and not a duplicate. We address this through bureau-specific disputes if the reporting is inaccurate.

Situation B — True duplicate in the system: The same account appears twice in your PaigeAgent file because it was extracted more than once during report analysis. This is a data issue I can fix right now by merging the duplicate records.

Looking at your file — [account name] appears to be [Situation A / Situation B]. [If Situation B: Shall I merge these into a single record?] [If Situation A: This is not a true duplicate — this account is being reported by [X] bureaus. The strategy here is a bureau-specific dispute rather than a file cleanup.]"

RULE 5 — PROACTIVE CLEANUP AT CONVERSATION START:
At the start of every new conversation where you detect ANY of the following in client context, lead with a cleanup offer BEFORE discussing anything else:
- Any account with duplicate_of_id flagged
- Any account with creditor_name matching TEST, SAMPLE, or PLACEHOLDER
- Any account appearing more than once with the same creditor name and account type

Open with: "Before we get into your questions I want to flag a few things in your file that need attention. I can see [X] accounts that may be duplicates or test entries. Can we take 2 minutes to clean those up first? A clean file gives us more accurate assessments and better strategy. Here is what I found: [list the accounts]. Shall we go through them one by one?"

=== END ACCOUNT MANAGEMENT & CLEANUP RULES ===
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
          },
          {
            type: "function",
            function: {
              name: "update_client_data",
              description: "Update a specific field in the client's profile, business foundation, or public presence. Call this when the user or coach explicitly provides new data for a known field — e.g. 'my business phone is 404-555-1234', 'update the EIN to on file', 'our address is 100 Peachtree St Atlanta GA 30303'. Only call when the user clearly intends to store or update data, not when they are just mentioning something in passing.",
              parameters: {
                type: "object",
                properties: {
                  updates: {
                    type: "array",
                    description: "Array of field updates to apply",
                    items: {
                      type: "object",
                      properties: {
                        field_path: {
                          type: "string",
                          description: "Dot-notation field identifier. Valid paths: foundation.entity_type, foundation.state_of_formation, foundation.formation_date, foundation.registered_agent_name, foundation.registered_agent_address, foundation.registered_agent_state, foundation.ein, foundation.business_address_type, foundation.street_address, foundation.city, foundation.state, foundation.zip, foundation.business_phone, foundation.phone_411_listed, foundation.bank_name, foundation.bank_account_opened, foundation.has_bank_account, foundation.legal_name, foundation.dba, foundation.naics, public_presence.website_url, public_presence.google_business_url, public_presence.yelp_url, public_presence.linkedin_url, public_presence.facebook_url, public_presence.website_live, public_presence.google_business_claimed, profile.full_name, profile.city, profile.state, funding.objective, funding.target_amount, funding.timeline"
                        },
                        field_value: {
                          type: "string",
                          description: "The new value to set"
                        }
                      },
                      required: ["field_path", "field_value"]
                    }
                  }
                },
                required: ["updates"]
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

    // For non-document requests: check if streaming response contains tool calls
    // We need to accumulate first to detect tool calls, then handle accordingly
    if (!attachedDocument) {
      // Read the full streamed response to check for tool calls
      const fullReader = response.body!.getReader();
      const fullDecoder = new TextDecoder();
      let accumulatedContent = "";
      let toolCalls: any[] = [];
      let allChunks: Uint8Array[] = [];
      let hasToolCall = false;

      // Accumulate the stream
      while (true) {
        const { done, value } = await fullReader.read();
        if (done) break;
        allChunks.push(value);
        const chunk = fullDecoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) accumulatedContent += content;
            const tc = parsed.choices?.[0]?.delta?.tool_calls;
            if (tc) {
              hasToolCall = true;
              for (const call of tc) {
                if (call.index !== undefined) {
                  if (!toolCalls[call.index]) toolCalls[call.index] = { id: "", type: "function", function: { name: "", arguments: "" } };
                  if (call.id) toolCalls[call.index].id = call.id;
                  if (call.function?.name) toolCalls[call.index].function.name = call.function.name;
                  if (call.function?.arguments) toolCalls[call.index].function.arguments += call.function.arguments;
                }
              }
            }
            // Check finish_reason for tool_calls
            if (parsed.choices?.[0]?.finish_reason === "tool_calls") hasToolCall = true;
          } catch { /* skip */ }
        }
      }

      // If no tool calls, replay the accumulated chunks as-is
      if (!hasToolCall) {
        const replayStream = new ReadableStream({
          start(controller) {
            for (const chunk of allChunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          }
        });
        return new Response(replayStream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      // Handle tool calls
      const toolResults: any[] = [];
      for (const tc of toolCalls) {
        if (!tc || !tc.function?.name) continue;
        
        if (tc.function.name === "update_client_data") {
          try {
            const args = JSON.parse(tc.function.arguments);
            const writeBackPayload = {
              updates: args.updates,
              target_user_id: payloadClientId || user.id,
            };

            const wbResponse = await fetch(`${supabaseUrl}/functions/v1/paige-write-back`, {
              method: "POST",
              headers: { Authorization: authHeader, "Content-Type": "application/json" },
              body: JSON.stringify(writeBackPayload),
            });
            const wbResult = await wbResponse.json();
            toolResults.push({ tool_call_id: tc.id, role: "tool", content: JSON.stringify(wbResult) });
          } catch (err) {
            toolResults.push({ tool_call_id: tc.id, role: "tool", content: JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }) });
          }
        } else if (tc.function.name === "web_fetch") {
          toolResults.push({ tool_call_id: tc.id, role: "tool", content: JSON.stringify({ note: "Web fetch not executed in this flow" }) });
        }
      }

      // Make a second AI call with tool results to get the final response
      const followUpMessages = [
        ...aiMessages,
        { role: "assistant", content: accumulatedContent || null, tool_calls: toolCalls.filter(Boolean) },
        ...toolResults,
      ];

      const followUpResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: followUpMessages,
          stream: true,
        }),
      });

      if (!followUpResponse.ok) {
        // Fallback: return accumulated content if follow-up fails
        const fallbackStream = new ReadableStream({
          start(controller) {
            for (const chunk of allChunks) controller.enqueue(chunk);
            controller.close();
          }
        });
        return new Response(fallbackStream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      return new Response(followUpResponse.body, {
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
              payloadClientId || null,
              paigeChatUploadId
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
  clientId: string | null = null,
  uploadRecordId: string | null = null
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
