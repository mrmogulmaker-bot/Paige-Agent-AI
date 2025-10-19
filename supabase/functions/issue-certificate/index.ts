import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { courseId } = await req.json();

    // Check if user completed the course
    const { data: progress, error: progressError } = await supabase
      .from('user_progress')
      .select('course_status, progress_percentage')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .single();

    if (progressError) throw progressError;
    if (progress.course_status !== 'completed' || progress.progress_percentage < 100) {
      throw new Error('Course not completed');
    }

    // Check if certificate already exists
    const { data: existing } = await supabase
      .from('course_certificates')
      .select('id, verification_code')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          certificate: existing,
          message: 'Certificate already issued'
        }),
        { 
          status: 200, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        }
      );
    }

    // Issue new certificate
    const { data: certificate, error: certError } = await supabase
      .from('course_certificates')
      .insert({
        user_id: user.id,
        course_id: courseId
      })
      .select()
      .single();

    if (certError) throw certError;

    console.log(`Certificate issued: ${certificate.id} for user ${user.id}, course ${courseId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        certificate,
        message: 'Certificate issued successfully'
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );
  } catch (error: any) {
    console.error('Error in issue-certificate:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );
  }
});