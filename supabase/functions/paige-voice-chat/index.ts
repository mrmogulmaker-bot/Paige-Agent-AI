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
                name: 'task_add',
                description: 'Add a new task to personal or business workflow',
                parameters: {
                  type: 'object',
                  properties: {
                    scope: { type: 'string', enum: ['personal', 'business'], description: 'Task scope' },
                    title: { type: 'string', description: 'Task title' },
                    due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'P1', 'P2', 'P3'], description: 'Task priority' },
                    category: { type: 'string', description: 'Task category' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Task tags' }
                  },
                  required: ['scope', 'title']
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
            case 'task_add':
              const taskMetadata: any = {
                scope: args.scope,
                priority: args.priority || 'medium',
                created_via: 'voice'
              };
              
              if (args.tags && args.tags.length > 0) {
                taskMetadata.tags = args.tags;
              }
              
              const { data: taskData, error: taskError } = await supabaseAdmin
                .from('tasks')
                .insert({
                  user_id: userId,
                  title: args.title,
                  category: args.category || 'general',
                  status: 'pending',
                  due_date: args.due_date,
                  track: args.scope === 'business' ? 'build' : 'accel',
                  metadata: taskMetadata
                })
                .select()
                .single();
              
              if (taskError) throw taskError;
              result = { success: true, task: taskData, message: `Created ${args.scope} task: ${args.title}` };
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
