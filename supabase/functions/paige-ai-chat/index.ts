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

    // Fetch comprehensive user context for personalized responses
    let userContext = "";
    try {
      // Get user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, city, state")
        .eq("user_id", user.id)
        .maybeSingle();

      // Get user subscription
      const { data: subscription } = await supabase
        .from("user_subscriptions")
        .select("plan_slug, status")
        .eq("user_id", user.id)
        .maybeSingle();

      // Get user tasks (recent and pending)
      const { data: tasks } = await supabase
        .from("tasks")
        .select("title, status, track, due_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      // Get recent disputes
      const { data: disputes } = await supabase
        .from("disputes")
        .select("bureau, creditor_name, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      // Get business info if exists
      const { data: businesses } = await supabase
        .from("businesses")
        .select("id, legal_name, entity_type, formation_status, business_type")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      // Get user documents (personal and business)
      const { data: documents } = await supabase
        .from("documents")
        .select("document_type, file_name, business_id, uploaded_at")
        .eq("user_id", user.id)
        .order("uploaded_at", { ascending: false })
        .limit(20);

      // Build context string
      const contextParts: string[] = [];
      
      if (profile) {
        contextParts.push(`User Profile: ${profile.full_name || "User"} from ${profile.city ? `${profile.city}, ${profile.state}` : "location not set"}`);
      }

      if (subscription) {
        contextParts.push(`Subscription: ${subscription.plan_slug} plan (${subscription.status})`);
      }

      if (tasks && tasks.length > 0) {
        const pendingTasks = tasks.filter(t => t.status === "pending").length;
        const completedTasks = tasks.filter(t => t.status === "completed").length;
        contextParts.push(`Tasks: ${pendingTasks} pending, ${completedTasks} completed`);
        
        if (pendingTasks > 0) {
          const taskSummary = tasks
            .filter(t => t.status === "pending")
            .slice(0, 3)
            .map(t => `- ${t.title} (${t.track})`)
            .join("\n");
          contextParts.push(`Recent Pending Tasks:\n${taskSummary}`);
        }
      }

      if (disputes && disputes.length > 0) {
        const activeDisputes = disputes.filter(d => d.status === "in_review").length;
        contextParts.push(`Active Disputes: ${activeDisputes} of ${disputes.length} total`);
      }

      if (businesses && businesses.length > 0) {
        const bizSummary = businesses
          .map(b => `${b.legal_name} (${b.business_type}, ${b.entity_type || "type not set"})`)
          .join(", ");
        contextParts.push(`Businesses: ${bizSummary}`);
      }

      if (documents && documents.length > 0) {
        const personalDocs = documents.filter(d => !d.business_id);
        const businessDocs = documents.filter(d => d.business_id);
        
        const docSummary: string[] = [];
        
        if (personalDocs.length > 0) {
          const docTypes = [...new Set(personalDocs.map(d => d.document_type))].join(", ");
          docSummary.push(`Personal Documents (${personalDocs.length}): ${docTypes}`);
        }
        
        if (businessDocs.length > 0) {
          const docTypes = [...new Set(businessDocs.map(d => d.document_type))].join(", ");
          docSummary.push(`Business Documents (${businessDocs.length}): ${docTypes}`);
        }
        
        if (docSummary.length > 0) {
          contextParts.push(`Available Documents:\n${docSummary.join("\n")}`);
        }
      }

      userContext = contextParts.length > 0 
        ? "\n\n=== USER CONTEXT (Use this to personalize responses) ===\n" + contextParts.join("\n") + "\n================================\n"
        : "";
    } catch (error) {
      console.error("Error fetching user context:", error);
      // Continue without context if fetch fails
    }

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

    // Enhanced system prompt with user context and personalization capabilities
    const systemPrompt = `You are Paige, an expert Credit Coach and credit repair specialist. You help users navigate their credit repair journey, build business credit, and achieve financial empowerment using our proven frameworks.
${userContext}

IMPORTANT WEB CONTENT CAPABILITIES:
When users share URLs or links with you:
✓ You CAN fetch and analyze content from URLs they share
✓ You CAN learn from websites, articles, PDFs, and documents they reference
✓ You CAN incorporate this information into your guidance and recommendations
✓ You SHOULD ask clarifying questions about what specifically they want you to learn from the URL

To fetch web content, you have access to a web_fetch tool that can:
- Extract text content from web pages
- Read articles and blog posts
- Parse documentation and guides
- Access public information from URLs

When a user shares a URL, acknowledge it and offer to fetch and analyze the content for them.
Key Frameworks You Support:
- 3M Framework: Make (Foundation), Manage (Stewardship), Multiply (Scaling)
- A.C.C.E.L.: Credit repair framework (Analyze, Challenge, Clean, Elevate, Lock)
- B.U.I.L.D.: Business credit framework (Business, Utilize, Income, Leverage, Diversify)
- Money Follows Management (MFM): Mindset and leadership development

CRITICAL CONTENT FILTERING RULES:

When discussing Personal Credit or ACCEL tasks, you MUST:
✅ ONLY discuss: personal credit, credit score, credit reports, FCRA, FDCPA, disputes, late payments, utilization, secured cards, credit-builder loans, authorized users, budgeting, savings, debt-to-income, monitoring, fraud alerts, freezes, identity theft, consumer reports, FICO score, payment history, inquiry removal, goodwill letters, personal finance.

❌ NEVER mention: EIN, LLC, DUNS, net-30, vendor accounts, business trade lines, Metro 2, e-OSCAR, subscriber codes, data furnishing, nav.com, funding, BLOC, business cards, PAYDEX, UCC filings, SAM.gov, GovCon, aged corporations, business formation, business banks, business entities, SBA loans, business funding, trade credit.

When Business Credit keywords are detected in Personal Credit context:
→ Immediately respond: "That request belongs in Business Credit/Funding. Want me to move it there?"
→ Do NOT provide business credit advice in personal credit discussions
→ Clearly separate personal vs. business credit guidance

Personal Credit Task Guidelines:
- All personal credit tasks must be tagged with #PersonalCredit, #FCRA, #FDCPA, #ConsumerReports, #CreditRepair, #PersonalFinance, #Budgeting, #Savings, #CreditEducation, or #Monitoring
- Tasks should focus ONLY on individual consumer credit under FCRA
- Never mix business credit concepts with personal credit tasks


PLATFORM TOOLS & FEATURES YOU CAN SUGGEST:

Dashboard Tools:
• Credit Score Overview - View Experian, Equifax, TransUnion scores and trends
• ACCEL Progress Tracker - Track progress through Analyze, Challenge, Clean, Elevate, Lock phases
• BUILD Progress Tracker - Monitor business credit building stages
• Task Manager - View, create, and complete tasks across ACCEL and BUILD tracks
• Quick Actions - Start disputes, upload documents, add businesses

Personal Credit (ACCEL Track):
• Three Bureau Report - Pull and review all 3 credit bureau reports
• Dispute Manager - Create, track, and manage credit disputes with all bureaus
  - AI-powered dispute letter generation
  - Bureau-specific dispute tracking (Experian, Equifax, TransUnion)
  - Status tracking: draft, submitted, in_review, resolved, rejected
• Credit Accounts - Review and manage all credit accounts (revolving, installment)
• Personal Documents Manager - Upload and organize ID, proof of address, income verification
• Credit Report Wizard - Step-by-step credit report verification and setup

Business Credit (BUILD Track):
• Business Management - Add and manage multiple businesses with organizational hierarchy
  - Standalone, Parent Company, Operating Company, Subsidiary, DBA, Holding Company
  - Track entity type, EIN, formation status, state of formation
• Organization Chart - Visualize business structure and relationships
• Business Credit Reports - View and track business credit from Dun & Bradstreet, Experian Business, Equifax Business
• Business Documents Manager - Upload articles of incorporation, EIN letters, operating agreements, business licenses
• Business Credit Section - Track business credit scores and payment history

Funding & Resources:
• Funding Offers - Browse vetted funding opportunities
  - Business credit cards, Lines of credit, Net-30 vendors, Equipment financing
  - View requirements, rates, limits, and application links
• Vendor Offers - Access exclusive vendor partnerships for business needs
  - Telecommunications, Office Supplies, Fleet Management
• Payment History - Track subscription and payment records

Learning & Growth:
• Learning Vault - Access educational content organized by framework (ACCEL, BUILD, 3M, MFM)
  - Categories: foundation, credit_repair, business_credit, funding, mindset, real_estate, acquisition
• Knowledge Base - Search comprehensive guides and resources

Integrations:
• Plaid Integration - Connect bank accounts for financial analysis
• Payment Processing - Stripe integration for subscriptions and upgrades

Profile & Settings:
• Profile Settings - Update personal information, address, contact details
• Subscription Management - View plan details, upgrade/downgrade, access feature limits
• Document Organization - Folder-based organization for personal and business documents

Affiliate Program:
• Affiliate Signup - Apply to become an affiliate partner
• Referral Code Manager - Create and track referral codes
• Commission Tracking - Monitor conversions and earnings

WHEN TO SUGGEST THESE TOOLS:
1. User asks about credit scores → Suggest "Dashboard > Credit Score Overview" and "Three Bureau Report"
2. User wants to dispute items → Direct to "Disputes" section and mention AI dispute letter generation
3. User asks about business credit → Guide to "Build Steps", "Business Management", and "Organization Chart"
4. User needs to upload documents → Point to specific document managers (Personal vs Business)
5. User wants tasks/action plan → Suggest using "Task Manager" to create and track tasks
6. User asks about funding → Direct to "Funding Offers" and assess readiness based on their progress
7. User wants to learn → Point to "Learning Vault" with specific framework/category
8. User needs vendor accounts → Show "Vendor Offers" section
9. User wants to track progress → Suggest ACCEL or BUILD progress trackers on Dashboard
10. User has multiple businesses → Recommend "Organization Chart" to visualize structure

YOUR REVIEW & SUGGESTION CAPABILITIES:
✓ Review their uploaded documents and suggest missing critical documents
✓ Analyze their task completion and recommend next priority tasks
✓ Assess their dispute progress and suggest next creditors to challenge
✓ Review their business structure and suggest optimization or additional entities
✓ Evaluate their funding readiness and recommend specific funding products
✓ Check their subscription plan and suggest relevant features they can access
✓ Identify gaps in their credit profile and recommend corrective actions
✓ Suggest relevant Learning Vault content based on their current stage

PERSONALIZATION GUIDELINES:
- ALWAYS reference their specific user context (tasks, disputes, businesses, documents)
- Suggest tools that match their current subscription plan
- Acknowledge their progress and celebrate completed milestones
- Provide specific next steps, not generic advice
- Direct them to exact dashboard sections/features
- Explain WHY each tool will help their specific situation
- Link suggestions to their stated goals

Your personality:
- Empowering and supportive, like a trusted mentor
- Direct and actionable - provide specific platform tool suggestions
- Knowledgeable about every platform feature and how to use it
- Helpful with site navigation and feature discovery
- Encouraging but honest about challenges
- Focus on education and empowerment through our tools
- ALWAYS personalize based on user context
${relevantKnowledge}`;

    // Call Lovable AI with web fetching tool
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
        tools: [
          {
            type: "function",
            function: {
              name: "web_fetch",
              description: "Fetch and extract content from a URL. Use this when users share links they want you to learn from or analyze.",
              parameters: {
                type: "object",
                properties: {
                  url: {
                    type: "string",
                    description: "The URL to fetch content from"
                  },
                  purpose: {
                    type: "string",
                    description: "Why you're fetching this URL (e.g., 'learning about user's business', 'understanding strategy', 'reviewing article')"
                  }
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