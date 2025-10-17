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

  const authHeader = headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  
  const { socket, response } = Deno.upgradeWebSocket(req);

  let openAISocket: WebSocket | null = null;
  let sessionCreated = false;
  let userContext = "";
  let relevantKnowledge = "";
  let userId: string = "";

  socket.onopen = async () => {
    console.log("Client WebSocket connected");
    
    // Fetch user context and knowledge base
    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader || "" } }
      });

      const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        userId = user.id;
        
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

        // Get user tasks
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, status, track, due_date, metadata")
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

        // Get business info
        const { data: businesses } = await supabase
          .from("businesses")
          .select("id, legal_name, entity_type, formation_status, business_type")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);

        // Build context string
        const contextParts: string[] = [];
        
        if (profile) {
          contextParts.push(`User: ${profile.full_name || "User"} from ${profile.city ? `${profile.city}, ${profile.state}` : "location not set"}`);
        }

        if (subscription) {
          contextParts.push(`Plan: ${subscription.plan_slug} (${subscription.status})`);
        }

        if (tasks && tasks.length > 0) {
          const pendingTasks = tasks.filter(t => t.status === "pending").length;
          contextParts.push(`Tasks: ${pendingTasks} pending`);
          contextParts.push(`Recent tasks: ${tasks.map(t => `${t.title} (${t.status})`).join(", ")}`);
        }

        if (disputes && disputes.length > 0) {
          const activeDisputes = disputes.filter(d => d.status === "in_review").length;
          contextParts.push(`Disputes: ${activeDisputes} active`);
        }

        if (businesses && businesses.length > 0) {
          const bizList = businesses.map(b => b.legal_name).join(", ");
          contextParts.push(`Businesses: ${bizList}`);
        }

        userContext = contextParts.length > 0 ? contextParts.join(" | ") : "";

        // Search knowledge base
        const { data: knowledge } = await supabase
          .from("knowledge_base")
          .select("title, content, summary, framework, category")
          .limit(10);

        if (knowledge && knowledge.length > 0) {
          relevantKnowledge = knowledge.map(k => `${k.title}: ${k.summary || k.content.substring(0, 200)}`).join(" | ");
        }
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
        
        const enhancedInstructions = `You are Paige, a voice-first AI operations chief for Paige AI—a credit rebuilding and business funding platform.

VOICE-FIRST INTENT PARSING:
Parse user speech into intents and slots, then call platform actions via tool calls. Never fabricate data. Always confirm before destructive actions.

ROUTING RULES:
- Personal scope: "personal", "my personal", "consumer", "me", "my credit"
- Business scope: "business", "company", "EIN", "D-U-N-S", "Paydex", "DSCR", "Intelliscore", "BUILD"
- If ambiguous: Ask once: "Do you want that in Personal or Business?"

USER CONTEXT:
${userContext}

KNOWLEDGE BASE:
${relevantKnowledge || "Use your expertise in credit repair, business credit, financial coaching."}

CONFIRMATION FLOW:
- Repeat key details back: "Got it—[task title] due [date]?"
- For destructive ops: Require explicit "yes" or "confirm"
- After execution: "Done. [one-sentence summary]"

CRITICAL CONTENT FILTERING:
- NEVER fabricate credit scores, bureau data, or financial metrics
- NEVER provide specific credit repair advice beyond ACCEL/BUILD frameworks
- ALWAYS clarify you guide users through platform tools

GUIDELINES:
- Start with: "Hey, how can I help?"
- DO NOT introduce yourself unless asked
- Suggest specific platform tools and sections
- Be conversational, concise (2-3 sentences per response)
- Default due dates to 3–10 days if missing
- Always be encouraging and professional`;
        
        const sessionUpdate = {
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            instructions: enhancedInstructions,
            voice: "alloy",
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            input_audio_transcription: {
              model: "whisper-1"
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.75,
              prefix_padding_ms: 350,
              silence_duration_ms: 1800
            },
            tools: [
              {
                type: 'function',
                name: 'insights_get',
                description: 'Analyze user data and provide actionable insights about credit health, funding readiness, or financial performance',
                parameters: {
                  type: 'object',
                  properties: {
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Personal or business insights' },
                    metric: { type: 'string', enum: ['credit_health', 'funding_readiness', 'build_score', 'financial_kpis', 'vendor_performance'], description: 'Specific metric to analyze' }
                  }
                }
              },
              {
                type: 'function',
                name: 'reports_generate',
                description: 'Generate formatted reports including credit reports, funding readiness, compliance status, or BUILD score analysis',
                parameters: {
                  type: 'object',
                  properties: {
                    report_type: { type: 'string', enum: ['three_bureau', 'business_credit', 'funding_readiness', 'build_score', 'compliance', 'financial'], description: 'Type of report to generate' },
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Scope of the report' },
                    format: { type: 'string', enum: ['pdf', 'json', 'summary'], description: 'Output format' }
                  },
                  required: ['report_type']
                }
              },
              {
                type: 'function',
                name: 'finance_analyze',
                description: 'Analyze financial data including cash flow, DSCR, balances, spending patterns, and revenue trends',
                parameters: {
                  type: 'object',
                  properties: {
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Personal or business finances' },
                    timeframe: { type: 'string', enum: ['7d', '30d', '90d', '1y'], description: 'Time period for analysis' },
                    metric: { type: 'string', enum: ['dscr', 'cash_flow', 'balances', 'spending', 'revenue', 'burn_rate'], description: 'Specific financial metric to analyze' }
                  }
                }
              },
              {
                type: 'function',
                name: 'crm_manage',
                description: 'Manage vendor relationships, track trade lines, and log payments to vendors',
                parameters: {
                  type: 'object',
                  properties: {
                    vendor_name: { type: 'string', description: 'Name of the vendor' },
                    action: { type: 'string', enum: ['add', 'update', 'log_payment', 'view'], description: 'Action to perform' },
                    amount: { type: 'number', description: 'Payment amount if logging a payment' },
                    payment_status: { type: 'string', enum: ['on_time', 'early', 'late'], description: 'Status of the payment' }
                  }
                }
              },
              {
                type: 'function',
                name: 'funding_explore',
                description: 'Search for funding options, analyze eligibility, and create funding strategies based on BUILD score',
                parameters: {
                  type: 'object',
                  properties: {
                    product_type: { type: 'string', enum: ['credit_card', 'term_loan', 'line_of_credit', 'sba_loan', 'vendor_credit'], description: 'Type of funding product' },
                    amount_range: { type: 'string', description: 'Desired funding amount range (e.g., "10k-50k")' }
                  }
                }
              },
              {
                type: 'function',
                name: 'coaching_get',
                description: 'Provide personalized coaching and guidance on credit building, business development, disputes, or achieving milestones',
                parameters: {
                  type: 'object',
                  properties: {
                    topic: { type: 'string', enum: ['credit_building', 'business_credit', 'disputes', 'funding', 'compliance', 'vendor_relationships'], description: 'Coaching topic' },
                    metric: { type: 'string', description: 'Specific metric user wants to improve' },
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Personal or business coaching' }
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
      }

      // Handle function calls
      if (data.type === 'response.function_call_arguments.done') {
        console.log('Function call:', data.name, data.arguments);
        
        try {
          const args = JSON.parse(data.arguments);
          let result = {};
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
          }
          
          // Log the action (ignore errors if table doesn't exist yet)
          try {
            await supabaseAdmin
              .from('voice_command_logs')
              .insert({
                user_id: userId,
                command: data.name,
                arguments: args,
                result: result,
                created_at: new Date().toISOString()
              });
            console.log('Logged voice command');
          } catch (logError) {
            console.log('Failed to log (table may not exist yet)');
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
