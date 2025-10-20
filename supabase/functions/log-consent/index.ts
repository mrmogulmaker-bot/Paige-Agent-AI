// Log user consent events for compliance tracking
// PaigeAI_Compliance_v1_MMA

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Inline minimal compliance helpers to avoid cross-function imports
// Types
type ConsentEventData = {
  userId: string;
  consentType: 'credit_report_access' | 'croa_rights' | 'data_sharing' | 'offer_display' | 'adverse_action';
  disclosureVersion: string;
  ipAddress?: string;
  sessionId?: string;
  userAgent?: string;
  granted: boolean;
  metadata?: Record<string, any>;
};

// Logger
async function logConsentEvent(
  supabase: any,
  data: ConsentEventData
): Promise<{ success: boolean; consentId?: string; error?: string }> {
  try {
    const { data: consent, error } = await supabase
      .from('consent_events')
      .insert({
        user_id: data.userId,
        consent_type: data.consentType,
        disclosure_version: data.disclosureVersion,
        ip_address: data.ipAddress,
        session_id: data.sessionId,
        user_agent: data.userAgent,
        granted: data.granted,
        metadata: data.metadata || {}
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error logging consent:', error);
      return { success: false, error: error.message };
    }

    return { success: true, consentId: consent.id };
  } catch (error) {
    console.error('Exception logging consent:', error);
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

    const {
      consentType,
      disclosureVersion,
      granted,
      metadata
    } = await req.json();

    // Get client information from request
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const sessionId = crypto.randomUUID(); // Generate session ID

    const consentData: ConsentEventData = {
      userId: user.id,
      consentType,
      disclosureVersion,
      ipAddress,
      sessionId,
      userAgent,
      granted,
      metadata: metadata || {}
    };

    const result = await logConsentEvent(supabase, consentData);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        consentId: result.consentId,
        sessionId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error logging consent:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
