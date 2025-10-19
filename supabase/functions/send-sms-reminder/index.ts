import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SMSRequest {
  to: string;
  message: string;
  userId?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      throw new Error('Missing Twilio credentials');
    }

    const { to, message, userId }: SMSRequest = await req.json();

    if (!to || !message) {
      throw new Error('Missing required fields: to and message');
    }

    // Format phone number (remove any non-digit characters)
    const formattedTo = to.replace(/\D/g, '');
    const formattedFrom = twilioPhoneNumber.replace(/\D/g, '');

    // Ensure E.164 format
    const toE164 = formattedTo.startsWith('+') ? formattedTo : `+1${formattedTo}`;
    const fromE164 = formattedFrom.startsWith('+') ? formattedFrom : `+1${formattedFrom}`;

    console.log(`Sending SMS from ${fromE164} to ${toE164}`);

    // Twilio API call
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
      },
      body: new URLSearchParams({
        To: toE164,
        From: fromE164,
        Body: message,
      }),
    });

    const twilioResponse = await response.json();

    if (!response.ok) {
      console.error('Twilio error:', twilioResponse);
      throw new Error(twilioResponse.message || 'Failed to send SMS');
    }

    console.log('SMS sent successfully:', twilioResponse.sid);

    // Log the SMS in database if userId is provided
    if (userId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await supabase.from('plaid_notifications').insert({
        user_id: userId,
        channel: 'sms',
        template: 'reminder',
        metadata: {
          to: toE164,
          message_sid: twilioResponse.sid,
          status: twilioResponse.status,
        },
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageSid: twilioResponse.sid,
        status: twilioResponse.status,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error('Error in send-sms-reminder:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});
