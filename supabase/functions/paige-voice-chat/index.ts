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

  // Get authorization header for Supabase client
  const authHeader = headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  
  const { socket, response } = Deno.upgradeWebSocket(req);

  let openAISocket: WebSocket | null = null;
  let sessionCreated = false;
  let userContext = "";
  let relevantKnowledge = "";

  socket.onopen = async () => {
    console.log("Client WebSocket connected");
    
    // Fetch user context and knowledge base
    try {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader || "" } }
      });

      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
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

        // Get business info
        const { data: businesses } = await supabase
          .from("businesses")
          .select("id, legal_name, entity_type, formation_status, business_type")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);

        // Get user documents
        const { data: documents } = await supabase
          .from("documents")
          .select("document_type, file_name, business_id, uploaded_at")
          .eq("user_id", user.id)
          .order("uploaded_at", { ascending: false })
          .limit(20);

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
        }

        if (disputes && disputes.length > 0) {
          const activeDisputes = disputes.filter(d => d.status === "in_review").length;
          contextParts.push(`Disputes: ${activeDisputes} active`);
        }

        if (businesses && businesses.length > 0) {
          const bizList = businesses.map(b => b.legal_name).join(", ");
          contextParts.push(`Businesses: ${bizList}`);
        }

        if (documents && documents.length > 0) {
          contextParts.push(`Documents: ${documents.length} uploaded`);
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

    // Connect to OpenAI Realtime API using the special protocol format
    const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
    
    // OpenAI requires API key in the protocol subprotocols
    openAISocket = new WebSocket(url, [
      'realtime',
      `openai-insecure-api-key.${OPENAI_API_KEY}`,
      'openai-beta.realtime-v1',
    ]);

    openAISocket.onopen = () => {
      console.log("Connected to OpenAI Realtime API");
    };

    openAISocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("Received from OpenAI:", data.type);

      // When session is created, send session update with enhanced instructions
      if (data.type === "session.created" && !sessionCreated) {
        sessionCreated = true;
        console.log("Session created, sending session update");
        
        const enhancedInstructions = `You are Paige, an expert financial coach and credit repair specialist. You help users navigate their credit repair journey, build business credit, and achieve financial empowerment.

${userContext ? `Current User Context: ${userContext}` : ""}

Key Frameworks You Support:
- 3M Framework: Make (Foundation), Manage (Stewardship), Multiply (Scaling)
- A.C.C.E.L.: Credit repair framework (Analyze, Challenge, Clean, Elevate, Lock)
- B.U.I.L.D.: Business credit framework (Business, Utilize, Income, Leverage, Diversify)
- Money Follows Management (MFM): Mindset and leadership development

PLATFORM TOOLS YOU CAN SUGGEST (be specific about dashboard sections):
• Dashboard - Credit scores, ACCEL/BUILD progress, task overview
• Three Bureau Report - Pull credit reports from all 3 bureaus
• Dispute Manager - Create AI-powered dispute letters, track status
• Credit Accounts - Review all credit accounts
• Business Management - Add/organize businesses with org chart
• Business Credit Reports - Track business credit scores
• Document Managers - Upload personal and business documents
• Task Manager - Create and track ACCEL/BUILD tasks
• Funding Offers - Browse funding opportunities (cards, LOCs, vendors)
• Vendor Offers - Access business vendor partnerships
• Learning Vault - Educational resources by framework
• Profile Settings - Update info and subscription

Your Knowledge Base Context:
${relevantKnowledge || "Use your expertise in credit repair, business credit, financial coaching, and the ACCEL and BUILD frameworks."}

IMPORTANT GUIDELINES:
- Start the conversation with: "Hey, how can I help?"
- Do NOT introduce yourself or explain who you are unless specifically asked
- ALWAYS suggest specific platform tools and dashboard sections that can help
- Use the user context to personalize ALL responses and tool suggestions
- Reference their specific tasks, businesses, documents, or disputes when suggesting tools
- Provide actionable, specific advice with exact navigation paths (e.g., "Go to Dashboard > Disputes")
- Be conversational and natural in your speech
- Keep responses concise - aim for 2-3 sentences per response in conversation
- Speak clearly and at a moderate pace
- Use the knowledge base context to provide accurate, detailed information
- NEVER make up information - only use what you know from the knowledge base
- If you don't know something specific, acknowledge it and provide general guidance
- Wait for the user to finish speaking completely before responding

Personality:
- Empowering and supportive, like a trusted mentor
- Direct and actionable - provide specific platform tools and navigation
- Encouraging but honest about challenges
- Focus on education and empowerment through platform features
- ALWAYS personalize based on user context provided`;
        
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
            temperature: 0.7,
            max_response_output_tokens: "inf"
          }
        };

        openAISocket?.send(JSON.stringify(sessionUpdate));
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
