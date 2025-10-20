// Process user data deletion requests (GLBA/CCPA compliance)
// PaigeAI_Compliance_v1_MMA

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Inline minimal function to avoid cross-function imports
async function requestDataDeletion(
  supabase: any,
  userId: string
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  try {
    const verificationCode = crypto.randomUUID().substring(0, 8).toUpperCase();

    const { data, error } = await supabase
      .from('data_deletion_requests')
      .insert({
        user_id: userId,
        status: 'pending',
        verification_code: verificationCode,
        metadata: {
          requested_via: 'paige_ai_chat',
          timestamp: new Date().toISOString()
        }
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating deletion request:', error);
      return { success: false, error: error.message };
    }

    return { success: true, requestId: data.id };
  } catch (error) {
    console.error('Exception creating deletion request:', error);
    return { success: false, error: String(error) };
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await requestDataDeletion(supabase, user.id);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        requestId: result.requestId,
        message: 'Data deletion request submitted successfully. Your request will be processed within 30 days as required by law.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing deletion request:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
