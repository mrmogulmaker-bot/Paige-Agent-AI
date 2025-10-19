import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Fetch user profile and context
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .limit(5);

    const { data: disputes } = await supabase
      .from('disputes')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open')
      .limit(5);

    const { data: businesses } = await supabase
      .from('businesses')
      .select('*')
      .eq('owner_user_id', user.id);

    // Build context for Vapi assistant
    const userContext = `
User: ${profile?.full_name || 'Unknown'}
Subscription: ${subscription?.plan_slug || 'free'}
Pending Tasks: ${tasks?.length || 0}
Open Disputes: ${disputes?.length || 0}
Businesses: ${businesses?.length || 0}
    `.trim();

    // Create Vapi assistant with tools
    const VAPI_API_KEY = Deno.env.get('VAPI_API_KEY');
    if (!VAPI_API_KEY) {
      throw new Error('VAPI_API_KEY not configured');
    }

    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Paige AI',
        model: {
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
          systemPrompt: `You are Paige AI, an expert credit and business funding assistant.

${userContext}

You help users with:
- Credit repair and dispute management (ACCEL framework)
- Business credit building (BUILD framework)
- Funding readiness and applications
- Task management and reminders

Be conversational, helpful, and proactive. Call functions when appropriate to take actions on behalf of the user.`,
        },
        voice: {
          provider: 'openai',
          voiceId: 'alloy',
        },
        firstMessage: "Hi! I'm Paige, your AI credit and funding assistant. How can I help you today?",
        serverUrl: `${supabaseUrl}/functions/v1/voice-command-processor`,
        serverUrlSecret: supabaseServiceKey,
        functions: [
          {
            name: 'create_dispute',
            description: 'Create a new credit report dispute',
            parameters: {
              type: 'object',
              properties: {
                creditorName: { type: 'string', description: 'Name of the creditor' },
                bureau: { type: 'string', enum: ['Experian', 'Equifax', 'TransUnion'] },
                reasonCode: { type: 'string', description: 'Reason for dispute' },
                accountNumber: { type: 'string', description: 'Account number (last 4 digits)' },
                narrative: { type: 'string', description: 'Detailed explanation of dispute' },
              },
              required: ['creditorName', 'bureau', 'reasonCode'],
            },
          },
          {
            name: 'create_task',
            description: 'Create a new task or reminder',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                category: { type: 'string' },
                dueDate: { type: 'string', format: 'date-time' },
              },
              required: ['title', 'category'],
            },
          },
          {
            name: 'get_credit_score',
            description: 'Get user\'s current credit score and account summary',
            parameters: { type: 'object', properties: {} },
          },
          {
            name: 'get_build_score',
            description: 'Get user\'s BUILD score and funding readiness',
            parameters: { type: 'object', properties: {} },
          },
          {
            name: 'list_businesses',
            description: 'List all businesses owned by user',
            parameters: { type: 'object', properties: {} },
          },
          {
            name: 'add_business',
            description: 'Add a new business entity',
            parameters: {
              type: 'object',
              properties: {
                legalName: { type: 'string' },
                entityType: { type: 'string', enum: ['LLC', 'Corporation', 'Sole Proprietorship', 'Partnership'] },
                state: { type: 'string' },
              },
              required: ['legalName', 'entityType'],
            },
          },
          {
            name: 'send_funding_report',
            description: 'Send funding readiness report via email',
            parameters: {
              type: 'object',
              properties: {
                email: { type: 'string', format: 'email' },
              },
              required: ['email'],
            },
          },
        ],
      }),
    });

    if (!vapiResponse.ok) {
      const error = await vapiResponse.text();
      console.error('Vapi error:', error);
      throw new Error(`Failed to create Vapi assistant: ${error}`);
    }

    const vapiData = await vapiResponse.json();

    // Store session in database for tracking
    await supabase.from('conversation_context').insert({
      user_id: user.id,
      session_id: vapiData.id,
      active_scope: 'vapi_voice',
      context_stack: [{ assistant_id: vapiData.id, created_at: new Date().toISOString() }],
    });

    return new Response(
      JSON.stringify({
        assistantId: vapiData.id,
        userContext,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('Error in vapi-create-session:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});
