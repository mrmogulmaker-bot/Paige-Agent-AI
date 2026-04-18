import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extract keywords from text for knowledge base search
function extractKeywords(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 10)
    .join(',');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    return new Response("OpenAI API key not configured", { status: 500 });
  }

  // Support auth via query param token for WebSocket (since browsers can't set headers)
  const urlObj = new URL(req.url);
  const tokenFromQuery = urlObj.searchParams.get("token");
  const headerAuth = headers.get("authorization");
  const authHeader = tokenFromQuery ? `Bearer ${tokenFromQuery}` : headerAuth;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  
  const { socket, response } = Deno.upgradeWebSocket(req);

  let openAISocket: WebSocket | null = null;
  let sessionCreated = false;
  let userContext = "";
  let relevantKnowledge = "";
  let userId: string = "";
  let sessionId: string = "";
  let conversationHistory: Array<{role: string, content: string}> = [];

  socket.onopen = async () => {
    console.log("Client WebSocket connected");

    // SECURITY: Enforce authentication before any session activity.
    // WebSocket protocol prevents header auth from browser clients, so we accept
    // a short-lived bearer token via query param, but we still validate it here.
    if (!authHeader) {
      console.error("[paige-voice-chat] Rejecting unauthenticated WebSocket");
      socket.close(1008, "Authentication required");
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      console.error("[paige-voice-chat] Invalid token — closing WebSocket");
      socket.close(1008, "Unauthorized");
      return;
    }

    // Generate unique session ID
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Fetch user context and knowledge base
    try {
      const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

      userId = user.id;
        
        // Fetch comprehensive context matching useClientChatContext
        const [
          { data: profile },
          { data: subscription },
          { data: allAccounts },
          { data: allNegs },
          { data: disputes },
          { data: businesses },
          { data: alerts },
          { data: recentUploads },
          { data: recentMod },
          { data: memories },
        ] = await Promise.all([
          supabase.from("profiles").select("full_name, city, state, estimated_fico_eq, estimated_fico_ex, estimated_fico_tu, funding_goals").eq("user_id", user.id).maybeSingle(),
          supabase.from("user_subscriptions").select("plan_slug, status").eq("user_id", user.id).maybeSingle(),
          supabase.from("credit_accounts").select("id, creditor, type, is_open, is_authorized_user, credit_limit, limit_amount, balance, current_balance, account_open_date, account_close_date, opened_on, status, bureau_source, payment_history_json, original_amount, is_disputed_ownership, duplicate_of_id, needs_review").eq("user_id", user.id),
          supabase.from("credit_negative_items").select("id, creditor_name, amount, bureau, item_type, status, date_of_occurrence, date_reported, is_disputed_ownership, duplicate_of_id").eq("user_id", user.id).neq("status", "removed"),
          supabase.from("disputes").select("bureau, creditor_name, status, dispute_round").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
          supabase.from("businesses").select("legal_name, entity_type, state_of_formation, formation_date, ein, business_phone, phone_411_listed, has_bank_account, bank_name").eq("owner_user_id", user.id).limit(3),
          supabase.from("credit_alerts").select("alert_type, alert_severity, alert_title, alert_description, bureau, created_at").eq("client_id", user.id).eq("is_dismissed", false).eq("is_read", false).order("created_at", { ascending: false }).limit(5),
          supabase.from("credit_report_uploads").select("bureau_detected, last_analyzed_at").eq("user_id", user.id).eq("analysis_status", "completed").order("last_analyzed_at", { ascending: false }).limit(6),
          supabase.from("account_modifications").select("modification_type, modification_source, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
          supabase.from("client_memory").select("memory_type, content").eq("client_user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(3),
        ]);

        const contextParts: string[] = [];
        const fullName = profile?.full_name || "User";
        contextParts.push(`CLIENT CONTEXT — ${fullName}`);
        if (profile?.city) contextParts.push(`Location: ${profile.city}, ${profile.state}`);
        if (subscription) contextParts.push(`Plan: ${subscription.plan_slug} (${subscription.status})`);

        // Bureau scores
        const scores = {
          equifax: profile?.estimated_fico_eq as number | null,
          experian: profile?.estimated_fico_ex as number | null,
          transunion: profile?.estimated_fico_tu as number | null,
        };
        contextParts.push(`Bureau Scores: EQ ${scores.equifax ?? "N/A"} | EX ${scores.experian ?? "N/A"} | TU ${scores.transunion ?? "N/A"}`);

        // Funding goals
        if (profile?.funding_goals) {
          try {
            const fg = profile.funding_goals as any;
            if (fg?.target_amount) contextParts.push(`Funding Goal: $${Number(fg.target_amount).toLocaleString()} — ${fg.objective || ""}`);
          } catch { /* skip */ }
        }

        // Credit factors per bureau (summarized for voice)
        const activeAccounts = (allAccounts || []).filter((a: any) => !a.is_disputed_ownership && !a.duplicate_of_id);
        const activeNegs = (allNegs || []).filter((n: any) => !n.is_disputed_ownership && !n.duplicate_of_id);
        const bureaus = ["experian", "transunion", "equifax"] as const;
        
        const matchBureau = (bs: string | null, bureau: string) => {
          if (!bs) return true;
          const s = bs.toLowerCase().replace(/[\\s-]/g, "_");
          return s === "all_three" || s === "all" || s.includes(bureau);
        };
        
        const inferLimit = (a: any): number => Number(a.credit_limit) || Number(a.limit_amount) || Number(a.original_amount) || 0;

        for (const bureau of bureaus) {
          const bAccts = activeAccounts.filter((a: any) => matchBureau(a.bureau_source, bureau));
          const bNegs = activeNegs.filter((n: any) => (n.bureau || "").toLowerCase().includes(bureau));
          const label = bureau.charAt(0).toUpperCase() + bureau.slice(1);
          const bScore = scores[bureau];

          // Utilization
          const revolving = bAccts.filter((a: any) => {
            const t = (a.type || "").toLowerCase();
            return t.includes("revolving") || t.includes("credit_card");
          });
          const revWithLimit = revolving.filter((a: any) => inferLimit(a) > 0);
          const totalBal = revWithLimit.reduce((s: number, a: any) => s + (Number(a.current_balance ?? a.balance) || 0), 0);
          const totalLim = revWithLimit.reduce((s: number, a: any) => s + inferLimit(a), 0);
          const utilPct = totalLim > 0 ? Math.round((totalBal / totalLim) * 100) : 0;
          const paydownTo10 = totalLim > 0 ? Math.max(0, totalBal - Math.round(totalLim * 0.1)) : 0;

          // Credit age
          const now = Date.now();
          const ages = bAccts.map((a: any) => {
            const d = a.account_open_date || a.opened_on;
            return d ? Math.round((now - new Date(d).getTime()) / (30 * 86400000)) : null;
          }).filter((v: any): v is number => v != null && v >= 0);
          const avgAge = ages.length > 0 ? Math.round(ages.reduce((s: number, v: number) => s + v, 0) / ages.length) : 0;
          const avgYears = Math.floor(avgAge / 12);
          const avgMonths = avgAge % 12;

          // Derogatory
          const collectionsCount = bNegs.filter((n: any) => (n.item_type || "").toLowerCase().includes("collection")).length;
          const chargeOffsCount = bNegs.filter((n: any) => (n.item_type || "").toLowerCase().includes("charge")).length;

          contextParts.push(`${label} (${bScore ?? "N/A"}): Util ${utilPct}% ($${totalBal.toLocaleString()} / $${totalLim.toLocaleString()})${paydownTo10 > 0 ? ` paydown $${paydownTo10.toLocaleString()} for 10%` : ""} | Age ${avgYears}y ${avgMonths}m | Derogs ${collectionsCount + chargeOffsCount} (${collectionsCount} coll, ${chargeOffsCount} CO) | ${bAccts.filter((a: any) => a.is_open !== false).length} open accts`);
        }

        // Alerts
        if (alerts && alerts.length > 0) {
          contextParts.push(`ALERTS (${alerts.length} unread):`);
          for (const a of (alerts as any[])) {
            const desc = (a.alert_description || "").substring(0, 80);
            contextParts.push(`- ${(a.alert_severity || "").toUpperCase()}: ${a.alert_title} — ${desc}`);
          }
        }

        // Disputes
        if (disputes && disputes.length > 0) {
          const openD = disputes.filter((d: any) => d.status !== "resolved").length;
          contextParts.push(`Disputes: ${openD} open`);
        }

        // Business
        if (businesses && businesses.length > 0) {
          const biz = businesses[0] as any;
          contextParts.push(`Business: ${biz.legal_name} (${biz.entity_type || "unknown type"}) | EIN: ${biz.ein ? "on file" : "missing"} | Phone: ${biz.business_phone || "missing"} | Bank: ${biz.bank_name || "missing"}`);
        }

        // Account file status
        const allRaw = allAccounts || [];
        const disputedCount = allRaw.filter((a: any) => a.is_disputed_ownership).length;
        const mergedCount = allRaw.filter((a: any) => a.duplicate_of_id).length;
        const reviewCount = allRaw.filter((a: any) => a.needs_review).length;
        if (disputedCount || mergedCount || reviewCount) {
          contextParts.push(`Account Status: ${disputedCount} disputed, ${mergedCount} merged, ${reviewCount} needs review`);
        }

        // Data freshness
        for (const bn of ["Experian", "TransUnion", "Equifax"]) {
          const upload = (recentUploads || []).find((u: any) => (u.bureau_detected || "").toLowerCase().includes(bn.toLowerCase()));
          if (upload?.last_analyzed_at) {
            const daysAgo = Math.round((Date.now() - new Date(upload.last_analyzed_at as string).getTime()) / 86400000);
            if (daysAgo > 30) contextParts.push(`⚠ ${bn} data is ${daysAgo} days old`);
          }
        }

        // Memory
        if (memories && memories.length > 0) {
          contextParts.push(`Memory: ${(memories as any[]).map((m: any) => m.content.substring(0, 60)).join(" | ")}`);
        }

        userContext = contextParts.join("\n");

        // Load recent conversation history
        const { data: recentMessages } = await supabaseAdmin
          .from("chat_messages")
          .select("role, content, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        if (recentMessages && recentMessages.length > 0) {
          conversationHistory = recentMessages.reverse().map((msg: any) => ({
            role: msg.role,
            content: msg.content
          }));
        }

        // Search knowledge base
        const { data: knowledge } = await supabase
          .from("knowledge_base")
          .select("title, content, summary, framework, category")
          .limit(10);

        if (knowledge && knowledge.length > 0) {
          relevantKnowledge = knowledge.map((k: any) => `${k.title}: ${k.summary || k.content.substring(0, 200)}`).join(" | ");
        }
    } catch (error) {
      console.error("Error fetching user context:", error);
    }

    // Connect to OpenAI Realtime API
    const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
    
    openAISocket = new WebSocket(url, [
      'realtime',
      `openai-insecure-api-key.${OPENAI_API_KEY}`,
      'openai-beta.realtime-v1',
    ]);

    openAISocket.onopen = () => {
      console.log("Connected to OpenAI Realtime API");
    };

    openAISocket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("Received from OpenAI:", data.type);

      // When session is created, send session update with enhanced instructions
      if (data.type === "session.created" && !sessionCreated) {
        sessionCreated = true;
        console.log("Session created, sending session update");
        
        // Build conversation summary from history
        let conversationSummary = "";
        if (conversationHistory.length > 0) {
          conversationSummary = `\n\nPREVIOUS CONVERSATION CONTEXT:\n${conversationHistory.map(m => `${m.role}: ${m.content.substring(0, 200)}`).join('\n')}`;
        }
        
        const enhancedInstructions = `You are Paige — an AI-powered funding intelligence analyst built for small business owners. You help users understand their personal and business credit profiles in the context of business funding eligibility and guide them toward appropriate capital sources. You are NOT a credit repair organization.

${conversationHistory.length > 0 ? `RETURNING USER: Continue naturally from prior conversations.${conversationSummary}` : `NEW USER: Start with a warm, personalized greeting using their name.`}

CRITICAL RULES — NEVER VIOLATE:

1. NEVER provide credit repair advice. NEVER suggest disputes, draft dispute letters, or talk about removing/deleting/fixing items on a credit report. If asked, redirect: "Credit repair isn't something I handle — I'm focused on funding intelligence. For self-help disputes, the CFPB has free templates at consumerfinance.gov. Want me to walk you through how your profile affects your funding options instead?"

2. NEVER promise credit score improvements. No "this will boost your score by X points." Frame everything in funding terms: "this reduces your SBA qualification by roughly $X" or "this affects your line-of-credit ceiling by approximately $X."

3. NEVER roleplay as a human. You are an AI funding analyst.

4. NEVER provide legal, tax, or investment advice. Refer to licensed professionals.

CLIENT DATA (use this to answer questions — never ask the client to share data you already have):
${userContext}

YOUR EXPERTISE:
- Business credit bureaus (D&B, Experian Business, Equifax Business, FICO SBSS)
- Personal credit as it affects PG-backed SMB lending
- SBA loan programs (7(a), 504, Express, microloans)
- Term loans, lines of credit, MCAs, revenue-based financing
- Business credit card strategy
- Document prep for funding applications
- Bank health metrics (DSCR, average daily balance, NSF history)
- Funding Readiness Score (0–100 composite metric)

VOICE-FIRST RULES:
- Conversational, concise (2-3 sentences per response). You're talking, not presenting.
- Use contractions and natural cadence. Vary sentence length so it sounds human, not scripted.
- Specific numbers always. "$4,200 to $1,500" not "reduce your balance"
- Reference utilization, payment history, derogatory data from the client data above with exact paydown amounts and named accounts
- If user asks "What's my score?" read it from the data above
- Connect every insight to their funding goals
- Ask ONE clarifying question when the request is broad — don't guess and dump options
- Never list more than 3 items out loud. Never recite framework letters, program names, or lender lists unless the user explicitly asks
- No filler openers ("Great question", "Absolutely", "I'd be happy to"). Just answer.

GREETINGS — HARD RULE (BE PERSONABLE):
When the user just says "hey", "hi", "hello", "what's up", with no question, respond like a HUMAN FRIEND, not a dashboard. Use their first name. Ask how their day or evening is going — match the time of day (morning/day/evening) using the current time in context. ONE warm sentence + ONE question about THEM. Examples:
- "Hey what's up Antonio — how's your day going?"
- "Hey Antonio! How's your evening treating you?"
- "What's up Antonio, how's the day been?"
NEVER open with "What's on your mind" or "How can I help" — too transactional. NEVER recite scores, charge-offs, dispute counts, or menu options. You have the file in context — use it WHEN they ask. A greeting gets a warm, personal greeting back. If they answer your "how's your day" with something real, respond to that for one beat before asking what they want to work on.

FRESH SIGN-IN: If the CLIENT CONTEXT has a "Session: client just signed in" line, open with a warm "Welcome back, [first name]" and ask what's on the agenda today/this evening. NO data recap on the welcome-back. Examples: "Welcome back, Antonio — what's on the agenda today?" / "Good to see you again, Antonio. What's on your plate this evening?"

OUT-OF-SCOPE:
- Cannot move money, transfer funds, or make payments
- Cannot generate dispute letters or credit repair tools — redirect to CFPB
- Never legal/tax/investment advice

BUILD FRAMEWORK SUB-PHASES (USE THESE LABELS — NEVER PARAPHRASE):
The BUILD program splits into 5 canonical sub-phases. Use the letter AND the full canonical name on first reference each call:
  B = BASE SETUP
  U = UTILIZE TRADELINES
  I = INTEGRATE & IMPROVE
  L = LEVERAGE GROWTH
  D = DOMINATE WITH FUNDABILITY
DO NOT use deprecated stub labels (Bank-ready / Underwritable / Identity-verified / Lendable / Diversified). Those are wrong.

Three-level hierarchy: PME programs (ACCEL/BUILD/FUND/...) are the long roadmap. B/U/I/L/D are the milestone scorecard inside BUILD that gates funding products. "Foundation / Expansion / Acceleration" is coaching language only — pair it with the canonical sub-phase letter so the client knows where they actually sit.

When you mention a funding product, name the BUILD sub-phase that gates it and the next milestone needed to unlock it. Voice answers stay 2-3 sentences — use the letter (e.g. "you're at U") after first canonical reference.

KNOWLEDGE BASE:
${relevantKnowledge || "Use your expertise in business funding, SBA programs, business credit, and lender underwriting."}`;


        const sessionUpdate = {
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            instructions: enhancedInstructions,
            voice: "alloy",
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            input_audio_transcription: {
              model: "whisper-1",
              language: "en"
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 1200
            },
            tools: [
              {
                type: 'function',
                name: 'insights_get',
                description: 'Get financial insights including cashflow, spending comparisons, DSCR, and average balances',
                parameters: {
                  type: 'object',
                  properties: {
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Personal or business insights' },
                    metric: { type: 'string', enum: ['cashflow', 'spending', 'dscr', 'average_balance', 'credit_health', 'funding_readiness'], description: 'Specific metric to analyze' },
                    timeframe: { type: 'string', enum: ['7d', '30d', '90d', '1y'], description: 'Time period for analysis' }
                  }
                }
              },
              {
                type: 'function',
                name: 'report_generate',
                description: 'Generate funding readiness, credit, compliance, or BUILD score reports',
                parameters: {
                  type: 'object',
                  properties: {
                    report_type: { type: 'string', enum: ['funding_readiness', 'three_bureau', 'business_credit', 'build_score', 'compliance'], description: 'Type of report' },
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Report scope' },
                    format: { type: 'string', enum: ['summary', 'detailed', 'email'], description: 'Output format' }
                  }
                }
              },
              {
                type: 'function',
                name: 'report_analyze',
                description: 'Analyze credit files from specific bureaus (Experian, Equifax, TransUnion)',
                parameters: {
                  type: 'object',
                  properties: {
                    bureau: { type: 'string', enum: ['experian', 'equifax', 'transunion', 'all'], description: 'Bureau to analyze' },
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Personal or business credit' }
                  }
                }
              },
              {
                type: 'function',
                name: 'report_dispute',
                description: 'Draft Metro 2 dispute letters for late payments, errors, or other credit issues',
                parameters: {
                  type: 'object',
                  properties: {
                    creditor: { type: 'string', description: 'Creditor name' },
                    issue: { type: 'string', enum: ['late_payment', 'incorrect_balance', 'not_mine', 'duplicate', 'other'], description: 'Type of issue to dispute' },
                    bureau: { type: 'string', enum: ['experian', 'equifax', 'transunion'], description: 'Bureau to send dispute to' }
                  }
                }
              },
              {
                type: 'function',
                name: 'finance_sync',
                description: 'Upload bank statements as PDFs to document cash flow — open banking connection is planned for Phase 2',
                parameters: {
                  type: 'object',
                  properties: {
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Which accounts to provide statements for' }
                  }
                }
              },
              {
                type: 'function',
                name: 'finance_alert',
                description: 'Set up balance alerts to notify when balance drops below a threshold',
                parameters: {
                  type: 'object',
                  properties: {
                    amount: { type: 'number', description: 'Threshold amount in dollars' },
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Account scope' }
                  },
                  required: ['amount']
                }
              },
              {
                type: 'function',
                name: 'finance_refresh',
                description: 'Refresh account balances for personal or business accounts',
                parameters: {
                  type: 'object',
                  properties: {
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Which balances to refresh' }
                  }
                }
              },
              {
                type: 'function',
                name: 'contact_create',
                description: 'Add new client, vendor, or contact to CRM',
                parameters: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Contact full name' },
                    type: { type: 'string', enum: ['client', 'vendor', 'partner', 'lead'], description: 'Contact type' },
                    email: { type: 'string', description: 'Email address' },
                    phone: { type: 'string', description: 'Phone number' }
                  },
                  required: ['name']
                }
              },
              {
                type: 'function',
                name: 'meeting_schedule',
                description: 'Schedule calls or meetings (strategy, funding, follow-up)',
                parameters: {
                  type: 'object',
                  properties: {
                    meeting_type: { type: 'string', enum: ['strategy', 'funding', 'follow_up', 'review'], description: 'Type of meeting' },
                    date: { type: 'string', description: 'Date for meeting (e.g., "Monday", "tomorrow", "2025-05-01")' },
                    contact: { type: 'string', description: 'Contact name for meeting' }
                  }
                }
              },
              {
                type: 'function',
                name: 'lead_followup',
                description: 'Create follow-up tasks for leads or clients',
                parameters: {
                  type: 'object',
                  properties: {
                    contact: { type: 'string', description: 'Contact to follow up with' },
                    date: { type: 'string', description: 'When to follow up (e.g., "tomorrow", "next week")' }
                  }
                }
              },
              {
                type: 'function',
                name: 'funding_check',
                description: 'Check funding readiness score and BUILD tier status',
                parameters: {
                  type: 'object',
                  properties: {}
                }
              },
              {
                type: 'function',
                name: 'funding_plan',
                description: 'Create quarterly or annual funding plans with target amounts',
                parameters: {
                  type: 'object',
                  properties: {
                    period: { type: 'string', description: 'Time period (e.g., "Q4", "2025", "next year")' },
                    amount: { type: 'string', description: 'Target funding amount (e.g., "$50,000", "100k")' }
                  }
                }
              },
              {
                type: 'function',
                name: 'funding_apply',
                description: 'Find lenders and funding options user qualifies for based on BUILD score',
                parameters: {
                  type: 'object',
                  properties: {
                    amount: { type: 'string', description: 'Desired amount' },
                    type: { type: 'string', enum: ['credit_card', 'term_loan', 'line_of_credit', 'sba_loan'], description: 'Funding type' }
                  }
                }
              },
              {
                type: 'function',
                name: 'lesson_start',
                description: 'Start BUILD or ACCEL course lessons from Mogul Maker Academy',
                parameters: {
                  type: 'object',
                  properties: {
                    course_name: { type: 'string', enum: ['BUILD', 'ACCEL', 'Funding Mastery', 'Credit Repair'], description: 'Course to start' }
                  }
                }
              },
              {
                type: 'function',
                name: 'goal_track',
                description: 'Track progress in ACCEL, BUILD, or other training frameworks',
                parameters: {
                  type: 'object',
                  properties: {
                    framework: { type: 'string', enum: ['ACCEL', 'BUILD', 'both'], description: 'Framework to track' }
                  }
                }
              },
              {
                type: 'function',
                name: 'lesson_review',
                description: 'Show next training goal or lesson in the course progression',
                parameters: {
                  type: 'object',
                  properties: {}
                }
              },
              {
                type: 'function',
                name: 'system_navigate',
                description: 'Navigate to specific sections (Funding, Tasks, Reports, Credit, etc.)',
                parameters: {
                  type: 'object',
                  properties: {
                    section: { type: 'string', enum: ['funding', 'tasks', 'reports', 'credit', 'business', 'personal', 'dashboard'], description: 'Section to navigate to' }
                  }
                }
              },
              {
                type: 'function',
                name: 'profile_update',
                description: 'Switch between business and personal modes',
                parameters: {
                  type: 'object',
                  properties: {
                    mode: { type: 'string', enum: ['business', 'personal'], description: 'Mode to switch to' }
                  }
                }
              },
              {
                type: 'function',
                name: 'notifications_manage',
                description: 'Enable or disable specific notification types (funding, credit, tasks)',
                parameters: {
                  type: 'object',
                  properties: {
                    notification_type: { type: 'string', enum: ['funding', 'credit', 'tasks', 'disputes', 'all'], description: 'Type of notifications' },
                    action: { type: 'string', enum: ['enable', 'disable', 'toggle'], description: 'Action to perform' }
                  }
                }
              },
              {
                type: 'function',
                name: 'task_add',
                description: 'Add a new task to personal or business workflow. Supports predefined templates like "funding checklist", "compliance checklist", "EIN registration", "D-U-N-S number", "business bank account", "dispute letter", "credit monitoring".',
                parameters: {
                  type: 'object',
                  properties: {
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Task scope - defaults to business for funding/compliance, personal for credit repair' },
                    title: { type: 'string', description: 'Task title or template name (e.g., "funding checklist", "create EIN task")' },
                    due_date: { type: 'string', description: 'Due date (YYYY-MM-DD) - defaults to 7 days from now' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'P1', 'P2', 'P3'], description: 'Task priority - defaults to medium' },
                    category: { type: 'string', description: 'Task category (Business Credit, Funding, Personal Credit, etc.)' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Task tags for organization' },
                    template_type: { type: 'string', enum: ['funding', 'compliance', 'ein', 'duns', 'bank_account', 'dispute', 'credit_monitoring', 'single'], description: 'Predefined template to use' }
                  },
                  required: ['title']
                }
              },
              {
                type: 'function',
                name: 'task_assign',
                description: 'Assign a task to a user or team member',
                parameters: {
                  type: 'object',
                  properties: {
                    task_id: { type: 'string', description: 'Task ID to assign' },
                    assignee_id: { type: 'string', description: 'User ID to assign to' },
                    assignee_name: { type: 'string', description: 'Assignee name for confirmation' }
                  },
                  required: ['task_id', 'assignee_id']
                }
              },
              {
                type: 'function',
                name: 'task_remind',
                description: 'Set a reminder for a task',
                parameters: {
                  type: 'object',
                  properties: {
                    task_id: { type: 'string', description: 'Task ID to set reminder for' },
                    remind_at: { type: 'string', description: 'When to remind (ISO datetime or relative like "1 day before")' },
                    notification_channel: { type: 'string', enum: ['app', 'email', 'sms'], description: 'How to deliver the reminder' }
                  },
                  required: ['task_id']
                }
              },
              {
                type: 'function',
                name: 'task_update',
                description: 'Update an existing task (due date, priority, status, title)',
                parameters: {
                  type: 'object',
                  properties: {
                    task_id: { type: 'string', description: 'Task ID to update' },
                    title: { type: 'string', description: 'New task title' },
                    due_date: { type: 'string', description: 'New due date (YYYY-MM-DD)' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'P1', 'P2', 'P3'], description: 'New priority' },
                    status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'New status' }
                  },
                  required: ['task_id']
                }
              },
              {
                type: 'function',
                name: 'task_complete',
                description: 'Mark a task as complete',
                parameters: {
                  type: 'object',
                  properties: {
                    task_id: { type: 'string', description: 'Task ID to complete' }
                  },
                  required: ['task_id']
                }
              },
              {
                type: 'function',
                name: 'metrics_get',
                description: 'Get financial metrics like DSCR, average balance, NSF count, Paydex, Intelliscore',
                parameters: {
                  type: 'object',
                  properties: {
                    metric_type: { 
                      type: 'string', 
                      enum: ['paydex', 'intelliscore', 'dscr', 'avg_balance_90d', 'nsf_90d', 'avg_balance_30d', 'monthly_inflow', 'monthly_outflow'],
                      description: 'Type of metric to retrieve'
                    }
                  },
                  required: ['metric_type']
                }
              },
              {
                type: 'function',
                name: 'bank_action',
                description: 'Perform bank account actions',
                parameters: {
                  type: 'object',
                  properties: {
                    action: { 
                      type: 'string', 
                      enum: ['connect', 'refresh', 'sync'],
                      description: 'Bank action to perform'
                    },
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Account scope' }
                  },
                  required: ['action', 'scope']
                }
              },
              {
                type: 'function',
                name: 'navigate_to',
                description: 'Navigate to a specific page in the app',
                parameters: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', description: 'Navigation path' }
                  },
                  required: ['path']
                }
              },
              {
                type: 'function',
                name: 'build_assessment',
                description: 'Run a BUILD framework assessment for business credit readiness',
                parameters: {
                  type: 'object',
                  properties: {
                    business_id: { type: 'string', description: 'Business ID (optional, uses primary if not specified)' }
                  }
                }
              },
              {
                type: 'function',
                name: 'bureaus_sync',
                description: 'Sync credit data with bureaus (personal or business)',
                parameters: {
                  type: 'object',
                  properties: {
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Which bureaus to sync' }
                  },
                  required: ['scope']
                }
              }
            ],
            tool_choice: 'auto',
            temperature: 0.7,
            max_response_output_tokens: 'inf'
          }
        };

        openAISocket?.send(JSON.stringify(sessionUpdate));
        
        // Send initial greeting for new conversations
        if (conversationHistory.length === 0) {
          const userName = userContext.includes('User:') 
            ? userContext.split('User:')[1].split(' from ')[0].trim() 
            : 'there';
          
          const greeting = {
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'input_text',
                  text: `Hey ${userName}! I'm Paige, your AI operations chief. I'm here to help with your credit journey and business funding. What can I help you with today?`
                }
              ]
            }
          };
          
          openAISocket?.send(JSON.stringify(greeting));
          openAISocket?.send(JSON.stringify({type: 'response.create'}));
          
          // Save greeting to history (guard if userId is available)
          if (userId) {
            try {
              const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
              await supabaseAdmin.from('chat_messages').insert({
                user_id: userId,
                session_id: sessionId,
                role: 'assistant',
                content: greeting.item.content[0].text
              });
            } catch (e) {
              console.error('Failed to save greeting:', e);
            }
          }
        }
      }

      // Handle user transcripts and save to history
      if (data.type === "conversation.item.input_audio_transcription.completed") {
        const transcript = data.transcript
          || (data.item?.content?.find((c: any) => c.type === 'input_text')?.text)
          || data.item?.transcript
          || data.text
          || '';
        console.log("User said:", transcript);
        
        if (transcript) {
          if (userId) {
            try {
              const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
              await supabaseAdmin.from('chat_messages').insert({
                user_id: userId,
                session_id: sessionId,
                role: 'user',
                content: transcript,
                audio_transcript: transcript
              });
            } catch (e) {
              console.error('Failed to save user transcript:', e);
            }
          }
        }
      }

      // Handle assistant responses and save to history
      if (data.type === "response.audio_transcript.done") {
        const assistantResponse = data.transcript;
        console.log("Assistant said:", assistantResponse);
        
        if (userId && assistantResponse) {
          try {
            const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
            await supabaseAdmin.from('chat_messages').insert({
              user_id: userId,
              session_id: sessionId,
              role: 'assistant',
              content: assistantResponse
            });
          } catch (e) {
            console.error('Failed to save assistant response:', e);
          }
        }
      }

      // Handle function calls
      if (data.type === 'response.function_call_arguments.done') {
        const startTime = Date.now();
        console.log('Function call:', data.name, data.arguments);
        
        let telemetryLog: any = {
          ts: new Date().toISOString(),
          user_id: userId,
          turn_id: data.call_id,
          intent: data.name,
          status: 'pending',
          confirmation_required: false
        };
        
        try {
          const args = JSON.parse(data.arguments);
          let result: any = {};
          telemetryLog.slots = args;
          
          const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
          
          switch (data.name) {
            case 'insights_get': {
              const scope = args.scope || 'business';
              const metric = args.metric;
              let insights: any = { scope, metric, data: {} };
              
              if (metric === 'credit_health' || !metric) {
                const { data: accounts } = await supabaseAdmin
                  .from('credit_accounts')
                  .select('*')
                  .eq('user_id', userId);
                insights.data.credit_accounts = accounts;
              }
              
              if (metric === 'funding_readiness' || metric === 'build_score' || !metric) {
                const { data: buildScore } = await supabaseAdmin
                  .from('build_scores')
                  .select('*')
                  .eq('user_id', userId)
                  .maybeSingle();
                insights.data.build_score = buildScore;
              }
              
              if (metric === 'financial_kpis' || !metric) {
                const { data: kpis } = await supabaseAdmin
                  .from('financial_kpis')
                  .select('*')
                  .eq('user_id', userId)
                  .maybeSingle();
                insights.data.financial_kpis = kpis;
              }
              
              result = {
                success: true,
                insights,
                message: `${scope} ${metric || 'insights'} analyzed`
              };
              break;
            }
            
            case 'reports_generate': {
              const reportType = args.report_type;
              const scope = args.scope || 'business';
              let reportData: any = { type: reportType, scope };
              
              if (reportType === 'three_bureau' || reportType === 'business_credit') {
                const { data: verification } = await supabaseAdmin
                  .from('credit_report_verifications')
                  .select('*')
                  .eq('user_id', userId)
                  .maybeSingle();
                reportData.verification_status = verification;
              }
              
              if (reportType === 'build_score' || reportType === 'funding_readiness') {
                const { data: buildScore } = await supabaseAdmin
                  .from('build_scores')
                  .select('*')
                  .eq('user_id', userId)
                  .maybeSingle();
                reportData.build_score = buildScore;
              }
              
              result = {
                success: true,
                report: reportData,
                message: `Generated ${reportType} report`
              };
              break;
            }
            
            case 'finance_analyze': {
              const scope = args.scope || 'business';
              const timeframe = args.timeframe || '30d';
              const metric = args.metric;
              
              const { data: kpis } = await supabaseAdmin
                .from('financial_kpis')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
              
              const { data: accounts } = await supabaseAdmin
                .from('connected_bank_accounts')
                .select('*')
                .eq('user_id', userId)
                .eq('is_active', true);
              
              result = {
                success: true,
                analysis: {
                  scope,
                  timeframe,
                  metric,
                  kpis,
                  accounts_count: accounts?.length || 0
                },
                message: `Analyzed ${metric || 'financial data'} over ${timeframe}`
              };
              break;
            }
            
            case 'crm_manage': {
              const action = args.action || 'view';
              const vendorName = args.vendor_name;
              
              if (action === 'add' && vendorName) {
                const { data: vendor, error } = await supabaseAdmin
                  .from('business_vendors')
                  .insert({
                    user_id: userId,
                    vendor_name: vendorName,
                    vendor_type: 'supplier',
                    is_active: true
                  })
                  .select()
                  .single();
                
                result = { success: !error, vendor, message: `Added ${vendorName}` };
              } else if (action === 'log_payment' && vendorName) {
                const { data: vendor } = await supabaseAdmin
                  .from('business_vendors')
                  .select('*')
                  .eq('user_id', userId)
                  .ilike('vendor_name', `%${vendorName}%`)
                  .maybeSingle();
                
                if (vendor) {
                  const paymentStatus = args.payment_status || 'on_time';
                  const updateData: any = {
                    total_payments: (vendor.total_payments || 0) + 1,
                    last_payment_date: new Date().toISOString().split('T')[0]
                  };
                  
                  if (paymentStatus === 'on_time') updateData.on_time_payments = (vendor.on_time_payments || 0) + 1;
                  if (paymentStatus === 'early') updateData.early_payments = (vendor.early_payments || 0) + 1;
                  if (paymentStatus === 'late') updateData.late_payments = (vendor.late_payments || 0) + 1;
                  
                  await supabaseAdmin
                    .from('business_vendors')
                    .update(updateData)
                    .eq('id', vendor.id);
                  
                  result = { success: true, message: `Logged ${paymentStatus} payment to ${vendorName}` };
                } else {
                  result = { success: false, message: `Vendor ${vendorName} not found` };
                }
              } else {
                const { data: vendors } = await supabaseAdmin
                  .from('business_vendors')
                  .select('*')
                  .eq('user_id', userId);
                
                result = { success: true, vendors, message: `Found ${vendors?.length || 0} vendors` };
              }
              break;
            }
            
            case 'funding_explore': {
              const productType = args.product_type;
              
              const { data: buildScore } = await supabaseAdmin
                .from('build_scores')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
              
              let query = supabaseAdmin
                .from('funding_offers')
                .select('*')
                .eq('is_active', true);
              
              if (productType) query = query.eq('product_type', productType);
              
              const { data: offers } = await query;
              
              result = {
                success: true,
                funding: {
                  build_score: buildScore?.build_score,
                  tier: buildScore?.current_tier,
                  offers: offers || []
                },
                message: `Found ${offers?.length || 0} funding options`
              };
              break;
            }
            
            case 'coaching_get': {
              const topic = args.topic;
              const metric = args.metric;
              const scope = args.scope || 'business';
              
              const { data: buildScore } = await supabaseAdmin
                .from('build_scores')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
              
              const { data: tasks } = await supabaseAdmin
                .from('tasks')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'pending')
                .limit(5);
              
              result = {
                success: true,
                coaching: {
                  topic,
                  metric,
                  scope,
                  current_tier: buildScore?.current_tier,
                  pending_tasks: tasks?.length || 0
                },
                message: `Coaching on ${topic || metric || 'your progress'}`
              };
              break;
            }
            
            case 'report_generate': {
              const reportType = args.report_type || 'funding_readiness';
              const scope = args.scope || 'business';
              const format = args.format || 'summary';
              
              let reportData: any = { type: reportType, scope, format };
              
              if (reportType === 'funding_readiness') {
                const { data: buildScore } = await supabaseAdmin
                  .from('build_scores')
                  .select('*')
                  .eq('user_id', userId)
                  .maybeSingle();
                
                const { data: kpis } = await supabaseAdmin
                  .from('financial_kpis')
                  .select('*')
                  .eq('user_id', userId)
                  .maybeSingle();
                
                reportData.build_score = buildScore;
                reportData.financial_kpis = kpis;
                reportData.readiness_tier = buildScore?.current_tier || 'B';
              }
              
              const outputMessage = format === 'email' 
                ? "I'll email your report shortly" 
                : `Generated ${reportType.replace('_', ' ')} report`;
              
              result = { success: true, report: reportData, message: outputMessage };
              break;
            }
            
            case 'report_analyze': {
              const bureau = args.bureau || 'all';
              const scope = args.scope || 'business';
              
              const { data: verification } = await supabaseAdmin
                .from('credit_report_verifications')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
              
              result = {
                success: true,
                analysis: { bureau, scope, verification_status: verification },
                message: `Analyzed ${bureau} credit file for ${scope}`
              };
              break;
            }
            
            case 'report_dispute': {
              const creditor = args.creditor;
              const issue = args.issue || 'late_payment';
              const bureau = args.bureau || 'experian';
              
              result = {
                success: true,
                dispute: { creditor, issue, bureau },
                message: `Drafted Metro 2 dispute for ${issue.replace('_', ' ')}${creditor ? ` with ${creditor}` : ''}`
              };
              break;
            }
            
            case 'finance_sync': {
              const scope = args.scope || 'business';
              
              const { data: accounts } = await supabaseAdmin
                .from('connected_bank_accounts')
                .select('*')
                .eq('user_id', userId)
                .eq('is_active', true);
              
              result = {
                success: true,
                synced_accounts: accounts?.length || 0,
                message: `Synced ${accounts?.length || 0} ${scope} bank accounts`
              };
              break;
            }
            
            case 'finance_alert': {
              const amount = args.amount;
              const scope = args.scope || 'business';
              
              result = {
                success: true,
                alert: { amount, scope, threshold: amount },
                message: `Alert set: You'll be notified if your ${scope} balance drops below $${amount.toLocaleString()}`
              };
              break;
            }
            
            case 'finance_refresh': {
              const scope = args.scope || 'business';
              
              const { data: accounts } = await supabaseAdmin
                .from('connected_bank_accounts')
                .select('*')
                .eq('user_id', userId)
                .eq('is_active', true);
              
              result = {
                success: true,
                refreshed_accounts: accounts?.length || 0,
                message: `Refreshed balances for ${accounts?.length || 0} ${scope} accounts`
              };
              break;
            }
            
            case 'contact_create': {
              const name = args.name;
              const type = args.type || 'client';
              
              if (type === 'vendor') {
                const { data: vendor } = await supabaseAdmin
                  .from('business_vendors')
                  .insert({
                    user_id: userId,
                    vendor_name: name,
                    vendor_type: 'supplier',
                    is_active: true
                  })
                  .select()
                  .single();
                
                result = { success: true, contact: vendor, message: `Added ${name} as a ${type}` };
              } else {
                result = { success: true, contact: { name, type }, message: `Added ${name} as a ${type}` };
              }
              break;
            }
            
            case 'meeting_schedule': {
              const meetingType = args.meeting_type || 'strategy';
              const date = args.date || 'next available';
              const contact = args.contact;
              
              result = {
                success: true,
                meeting: { type: meetingType, date, contact },
                message: `Scheduled ${meetingType} call for ${date}${contact ? ` with ${contact}` : ''}`
              };
              break;
            }
            
            case 'lead_followup': {
              const contact = args.contact;
              const date = args.date || 'tomorrow';
              
              const dueDate = new Date();
              if (date === 'tomorrow') dueDate.setDate(dueDate.getDate() + 1);
              else if (date === 'next week') dueDate.setDate(dueDate.getDate() + 7);
              
              const { data: task } = await supabaseAdmin
                .from('tasks')
                .insert({
                  user_id: userId,
                  title: `Follow up with ${contact || 'lead'}`,
                  status: 'pending',
                  due_date: dueDate.toISOString().split('T')[0],
                  track: 'build',
                  metadata: { type: 'follow_up', contact }
                })
                .select()
                .single();
              
              result = { success: true, task, message: `Created follow-up task for ${date}` };
              break;
            }
            
            case 'funding_check': {
              const { data: buildScore } = await supabaseAdmin
                .from('build_scores')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
              
              const readiness = buildScore && buildScore.build_score > 60 ? 'ready' : 'needs improvement';
              
              result = {
                success: true,
                funding_readiness: {
                  score: buildScore?.build_score || 0,
                  tier: buildScore?.current_tier || 'B',
                  status: readiness
                },
                message: `You're ${readiness} for funding. BUILD Score: ${buildScore?.build_score || 0}, Tier ${buildScore?.current_tier || 'B'}`
              };
              break;
            }
            
            case 'funding_plan': {
              const period = args.period || 'Q4';
              const amount = args.amount || '$50,000';
              
              result = {
                success: true,
                plan: { period, target_amount: amount },
                message: `Started ${period} funding plan targeting ${amount} in capital`
              };
              break;
            }
            
            case 'funding_apply': {
              const { data: buildScore } = await supabaseAdmin
                .from('build_scores')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
              
              let query = supabaseAdmin
                .from('funding_offers')
                .select('*')
                .eq('is_active', true);
              
              if (args.type) query = query.eq('product_type', args.type);
              
              const { data: offers } = await query.limit(5);
              
              result = {
                success: true,
                lenders: offers || [],
                tier: buildScore?.current_tier,
                message: `Found ${offers?.length || 0} lenders you qualify for at Tier ${buildScore?.current_tier || 'B'}`
              };
              break;
            }
            
            case 'lesson_start': {
              const courseName = args.course_name || 'BUILD';
              
              result = {
                success: true,
                course: { name: courseName, module: 1 },
                message: `Starting ${courseName} course — let's knock out Module 1 today`
              };
              break;
            }
            
            case 'goal_track': {
              const framework = args.framework || 'BUILD';
              
              const { data: tasks } = await supabaseAdmin
                .from('tasks')
                .select('*')
                .eq('user_id', userId)
                .eq('track', framework.toLowerCase())
                .eq('status', 'completed');
              
              result = {
                success: true,
                progress: { framework, completed_tasks: tasks?.length || 0 },
                message: `You've completed ${tasks?.length || 0} tasks in the ${framework} framework`
              };
              break;
            }
            
            case 'lesson_review': {
              result = {
                success: true,
                next_goal: 'Complete BUILD Module 2: Credit Buying Power',
                message: "Your next training goal: BUILD Module 2 — let's dive into Credit Buying Power"
              };
              break;
            }
            
            case 'system_navigate': {
              const section = args.section || 'dashboard';
              const path = `/dashboard/${section}`;
              
              result = {
                success: true,
                path,
                message: `Opening ${section.charAt(0).toUpperCase() + section.slice(1)} section`
              };
              break;
            }
            
            case 'profile_update': {
              const mode = args.mode || 'business';
              
              result = {
                success: true,
                mode,
                message: `Switched to ${mode.charAt(0).toUpperCase() + mode.slice(1)} Mode`
              };
              break;
            }
            
            case 'notifications_manage': {
              const notificationType = args.notification_type || 'all';
              const action = args.action || 'enable';
              
              result = {
                success: true,
                notification_settings: { type: notificationType, enabled: action === 'enable' },
                message: `${action === 'enable' ? 'Enabled' : 'Disabled'} ${notificationType} alerts`
              };
              break;
            }
            
            case 'task_add':
              console.log('task_add called with args:', JSON.stringify(args));
              
              // Detect template type from title if not explicitly specified
              let templateType = args.template_type;
              const titleLower = args.title.toLowerCase();
              
              if (!templateType) {
                if (titleLower.includes('funding') && titleLower.includes('checklist')) templateType = 'funding';
                else if (titleLower.includes('compliance') && titleLower.includes('checklist')) templateType = 'compliance';
                else if (titleLower.includes('ein')) templateType = 'ein';
                else if (titleLower.includes('d-u-n-s') || titleLower.includes('duns')) templateType = 'duns';
                else if (titleLower.includes('bank account')) templateType = 'bank_account';
                else if (titleLower.includes('dispute')) templateType = 'dispute';
                else if (titleLower.includes('credit monitoring')) templateType = 'credit_monitoring';
                else templateType = 'single';
              }
              
              // Infer scope if not provided
              const inferredScope = args.scope || 
                (['funding', 'compliance', 'ein', 'duns', 'bank_account'].includes(templateType) ? 'business' : 'personal');
              
              // Set default due date (7 days from now)
              const defaultDueDate = new Date();
              defaultDueDate.setDate(defaultDueDate.getDate() + 7);
              const dueDate = args.due_date || defaultDueDate.toISOString().split('T')[0];
              
              const taskMetadata: any = {
                scope: inferredScope,
                priority: args.priority || 'medium',
                created_via: 'voice',
                template_type: templateType
              };
              
              if (args.tags && args.tags.length > 0) {
                taskMetadata.tags = args.tags;
              }
              
              // For template types, create a checklist of subtasks
              if (templateType !== 'single') {
                const templates: Record<string, string[]> = {
                  funding: [
                    'Review funding requirements and eligibility',
                    'Gather financial documents (tax returns, bank statements)',
                    'Complete business credit profile',
                    'Apply for pre-qualification',
                    'Submit formal funding application'
                  ],
                  compliance: [
                    'Verify business registration and EIN',
                    'Review state-specific compliance requirements',
                    'Update operating agreements and bylaws',
                    'Ensure proper licensing and permits',
                    'Review insurance coverage'
                  ],
                  ein: [
                    'Determine business entity type',
                    'Gather required business information',
                    'Apply for EIN via IRS website or Form SS-4',
                    'Verify EIN receipt and save confirmation',
                    'Update business records with EIN'
                  ],
                  duns: [
                    'Gather business information (legal name, address, ownership)',
                    'Apply for D-U-N-S number via Dun & Bradstreet',
                    'Verify business contact information',
                    'Monitor D-U-N-S registration status',
                    'Update business credit profile with D-U-N-S'
                  ],
                  bank_account: [
                    'Choose appropriate business bank',
                    'Gather required documents (EIN, formation docs, ID)',
                    'Complete bank account application',
                    'Fund initial deposit',
                    'Set up online banking and alerts'
                  ]
                };
                
                const subtasks = templates[templateType] || [];
                taskMetadata.checklist = subtasks.map((item: string) => ({ title: item, completed: false }));
              }
              
              console.log('Inserting task with user_id:', userId);
              
              const { data: taskData, error: taskError } = await supabaseAdmin
                .from('tasks')
                .insert({
                  user_id: userId,
                  title: templateType === 'single' ? args.title : `${args.title.charAt(0).toUpperCase() + args.title.slice(1)} Checklist`,
                  category: args.category || (inferredScope === 'business' ? 'Business Credit' : 'Personal Credit'),
                  status: 'pending',
                  due_date: dueDate,
                  track: inferredScope === 'business' ? 'build' : 'accel',
                  metadata: taskMetadata
                })
                .select()
                .single();
              
              if (taskError) {
                console.error('Task insert error:', taskError);
                throw taskError;
              }
              
              console.log('Task inserted successfully:', taskData);
              
              const checklistMsg = taskMetadata.checklist 
                ? ` with ${taskMetadata.checklist.length} checklist items`
                : '';
              
              result = { 
                success: true, 
                task: taskData, 
                message: `I've created "${taskData.title}" in your ${inferredScope} tasks${checklistMsg}, due ${dueDate}.` 
              };
              break;
            
            case 'task_assign':
              const { data: assignedTask, error: assignError } = await supabaseAdmin
                .from('tasks')
                .update({ 
                  assigned_to: args.assignee_id,
                  metadata: { assigned_by: userId, assigned_at: new Date().toISOString() }
                })
                .eq('id', args.task_id)
                .select()
                .single();
              
              if (assignError) throw assignError;
              result = { 
                success: true, 
                task: assignedTask,
                message: `Assigned task to ${args.assignee_name || 'team member'}` 
              };
              break;
            
            case 'task_remind':
              // Calculate reminder time
              let remindAt = args.remind_at;
              if (!remindAt || remindAt.includes('before')) {
                // Get task due date and set reminder 1 day before
                const { data: task } = await supabaseAdmin
                  .from('tasks')
                  .select('due_date')
                  .eq('id', args.task_id)
                  .single();
                
                if (task?.due_date) {
                  const dueDate = new Date(task.due_date);
                  dueDate.setDate(dueDate.getDate() - 1);
                  remindAt = dueDate.toISOString();
                }
              }
              
              const { error: reminderError } = await supabaseAdmin
                .from('tasks')
                .update({ 
                  metadata: { 
                    reminder_at: remindAt,
                    reminder_channel: args.notification_channel || 'app'
                  }
                })
                .eq('id', args.task_id);
              
              if (reminderError) throw reminderError;
              result = { 
                success: true,
                message: `Reminder set for ${remindAt} via ${args.notification_channel || 'app'}` 
              };
              break;
            
            case 'task_update':
              const updateData: any = {};
              if (args.title) updateData.title = args.title;
              if (args.due_date) updateData.due_date = args.due_date;
              if (args.status) updateData.status = args.status;
              if (args.priority) {
                updateData.metadata = { priority: args.priority };
              }
              
              const { data: updatedTask, error: updateError } = await supabaseAdmin
                .from('tasks')
                .update(updateData)
                .eq('id', args.task_id)
                .eq('user_id', userId)
                .select()
                .single();
              
              if (updateError) throw updateError;
              result = { success: true, task: updatedTask, message: `Updated task: ${updatedTask.title}` };
              break;
            
            case 'task_complete':
              const { error: completeError } = await supabaseAdmin
                .from('tasks')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .eq('id', args.task_id)
                .eq('user_id', userId);
              
              if (completeError) throw completeError;
              result = { success: true, message: 'Task marked complete' };
              break;
            
            case 'metrics_get':
              // Fetch actual financial KPIs from database
              const { data: kpis } = await supabaseAdmin
                .from('financial_kpis')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
              
              if (!kpis) {
                result = {
                  success: false,
                  error: 'No financial data available. Please connect your bank accounts first.',
                  message: 'Connect your bank accounts to view financial metrics.'
                };
              } else {
                let metricValue: number | null = null;
                let metricLabel = '';
                
                switch (args.metric_type) {
                  case 'dscr':
                    metricValue = kpis.dscr;
                    metricLabel = 'DSCR';
                    break;
                  case 'avg_balance_90d':
                    metricValue = kpis.avg_balance_90d;
                    metricLabel = '90-day Average Balance';
                    break;
                  case 'nsf_90d':
                    metricValue = kpis.nsf_count;
                    metricLabel = 'NSF Count (90 days)';
                    break;
                  default:
                    metricValue = null;
                }
                
                if (metricValue !== null) {
                  const formattedValue = args.metric_type.includes('balance') 
                    ? `$${metricValue.toLocaleString()}`
                    : metricValue.toString();
                  
                  result = {
                    success: true,
                    metric: args.metric_type,
                    value: metricValue,
                    message: `${metricLabel}: ${formattedValue}`
                  };
                } else {
                  result = {
                    success: false,
                    error: 'Metric not available',
                    message: 'This metric is not currently tracked.'
                  };
                }
              }
              break;
            
            case 'bank_action':
              result = { 
                success: true, 
                action: args.action,
                scope: args.scope,
                message: `${args.action} initiated for ${args.scope} accounts` 
              };
              break;
            
            case 'navigate_to':
              result = { 
                success: true, 
                path: args.path,
                message: `Navigating to ${args.path}` 
              };
              break;
            
            case 'build_assessment':
              // Get BUILD score or trigger recalculation
              const { data: buildScore } = await supabaseAdmin
                .from('build_scores')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
              
              if (buildScore) {
                result = { 
                  success: true, 
                  score: buildScore.build_score,
                  tier: buildScore.current_tier,
                  message: `BUILD Score: ${buildScore.build_score}, Current Tier: ${buildScore.current_tier}. Paydex: ${buildScore.paydex}, Intelliscore: ${buildScore.intelliscore}`
                };
              } else {
                // Create initial BUILD score entry
                const { data: newScore } = await supabaseAdmin
                  .from('build_scores')
                  .insert({
                    user_id: userId,
                    build_score: 0,
                    current_tier: 'B'
                  })
                  .select()
                  .single();
                
                result = { 
                  success: true, 
                  score: 0,
                  tier: 'B',
                  message: 'BUILD assessment initialized. Start by setting up your business profile and connecting vendors.'
                };
              }
              break;
            
            case 'bureaus_sync':
              // Check if user has verified credit reports
              const { data: verification } = await supabaseAdmin
                .from('credit_report_verifications')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
              
              if (!verification) {
                result = {
                  success: false,
                  message: 'Please complete credit verification first before syncing bureaus.'
                };
              } else {
                const bureaus = args.scope === 'business' 
                  ? ['Dun & Bradstreet', 'Experian Business', 'Equifax Business']
                  : ['Experian', 'Equifax', 'TransUnion'];
                
                const verifiedBureaus = bureaus.filter(bureau => {
                  if (args.scope === 'business') return true; // Business verification handled differently
                  const bureauKey = bureau.toLowerCase().replace(' ', '_');
                  return verification[`${bureauKey}_verified`];
                });
                
                result = {
                  success: true,
                  scope: args.scope,
                  bureaus: verifiedBureaus,
                  message: `Syncing ${args.scope} credit data from ${verifiedBureaus.length} bureau${verifiedBureaus.length > 1 ? 's' : ''}: ${verifiedBureaus.join(', ')}`
                };
              }
              break;
            
            default:
              result = { success: false, error: 'Unknown function' };
              telemetryLog.status = 'error';
              telemetryLog.error = 'Unknown function';
          }
          
          // Complete telemetry log
          const latencyMs = Date.now() - startTime;
          telemetryLog.status = result.success ? 'success' : 'error';
          telemetryLog.latency_ms = latencyMs;
          telemetryLog.action = {
            type: 'invoke',
            source: data.name.split('_')[0],
            method: data.name
          };
          
          // Check if confirmation was required (destructive operations)
          const destructiveOps = ['disconnect', 'delete', 'remove'];
          telemetryLog.confirmation_required = destructiveOps.some(op => data.name.includes(op));
          
          // Log telemetry
          console.log('TELEMETRY:', JSON.stringify(telemetryLog));
          
          // Log the action to database (ignore errors if table doesn't exist yet)
          try {
            await supabaseAdmin
              .from('voice_command_logs')
              .insert({
                user_id: userId,
                turn_id: data.call_id,
                command: data.name,
                intent: data.name,
                utterance: args.title || args.metric || args.report_type || 'voice_command',
                scope: args.scope || telemetryLog.slots?.scope || null,
                arguments: args,
                result: result,
                status: telemetryLog.status,
                latency_ms: latencyMs,
                confirmation_required: telemetryLog.confirmation_required,
                created_at: new Date().toISOString()
              });
            console.log('Logged voice command to database');
          } catch (logError) {
            console.log('Failed to log to database (table may not exist yet):', logError);
          }
          
          // Send function response back to OpenAI
          openAISocket?.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: data.call_id,
              output: JSON.stringify(result)
            }
          }));
          
          // Trigger response
          openAISocket?.send(JSON.stringify({ type: 'response.create' }));
          
        } catch (error) {
          console.error('Function execution error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          // Log error telemetry
          const latencyMs = Date.now() - startTime;
          console.log('TELEMETRY_ERROR:', JSON.stringify({
            ...telemetryLog,
            status: 'error',
            error: errorMessage,
            latency_ms: latencyMs
          }));
          
          openAISocket?.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: data.call_id,
              output: JSON.stringify({ success: false, error: errorMessage })
            }
          }));
        }
      }

      // Forward all messages to client
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(event.data);
      }
    };

    openAISocket.onerror = (error) => {
      console.error("OpenAI WebSocket error:", error);
      socket.send(JSON.stringify({
        type: "error",
        error: "OpenAI connection error"
      }));
    };

    openAISocket.onclose = () => {
      console.log("OpenAI WebSocket closed");
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  };

  socket.onmessage = (event) => {
    // Forward client messages to OpenAI
    if (openAISocket?.readyState === WebSocket.OPEN) {
      openAISocket.send(event.data);
    }
  };

  socket.onerror = (error) => {
    console.error("Client WebSocket error:", error);
  };

  socket.onclose = () => {
    console.log("Client WebSocket closed");
    openAISocket?.close();
  };

  return response;
});
