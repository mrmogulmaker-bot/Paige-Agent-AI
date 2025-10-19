import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CertificateRequest {
  userId: string;
  courseId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, courseId }: CertificateRequest = await req.json();

    if (!userId || !courseId) {
      throw new Error('Missing required fields: userId and courseId');
    }

    console.log('Issuing certificate for user:', userId, 'course:', courseId);

    // Check if course is completed
    const { data: progress, error: progressError } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('status', 'completed')
      .single();

    if (progressError || !progress) {
      throw new Error('Course not completed or not found');
    }

    // Check if certificate already exists
    const { data: existing } = await supabase
      .from('course_certificates')
      .select('*')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Certificate already issued',
          certificate: existing 
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Create certificate
    const { data: certificate, error: certError } = await supabase
      .from('course_certificates')
      .insert({
        user_id: userId,
        course_id: courseId,
      })
      .select()
      .single();

    if (certError) throw certError;

    console.log('Certificate issued successfully:', certificate.id);

    // Create notification
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'achievement',
      title: 'Certificate Earned!',
      message: 'Congratulations! Your course certificate is ready.',
      metadata: { certificate_id: certificate.id, course_id: courseId }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        certificate 
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error('Error in issue-certificate:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});
