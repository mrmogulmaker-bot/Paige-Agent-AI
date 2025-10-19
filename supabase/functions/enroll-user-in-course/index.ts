import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnrollmentRequest {
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

    const { userId, courseId }: EnrollmentRequest = await req.json();

    if (!userId || !courseId) {
      throw new Error('Missing userId or courseId');
    }

    console.log(`Enrolling user ${userId} in course ${courseId}`);

    // Check if course exists and is active
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .eq('is_active', true)
      .single();

    if (courseError || !course) {
      throw new Error('Course not found or is not active');
    }

    // Check if user is already enrolled
    const { data: existingEnrollment } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .maybeSingle();

    if (existingEnrollment) {
      return new Response(
        JSON.stringify({
          success: true,
          alreadyEnrolled: true,
          enrollment: existingEnrollment,
          message: `You are already enrolled in "${course.title}"`,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Get total lessons for this course
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('id')
      .eq('course_id', courseId);

    if (lessonsError) throw lessonsError;

    const totalLessons = lessons?.length || 0;

    // Create enrollment
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('user_progress')
      .insert({
        user_id: userId,
        course_id: courseId,
        status: 'in_progress',
        progress_percentage: 0,
        completed_lessons: [],
        total_lessons: totalLessons,
      })
      .select()
      .single();

    if (enrollmentError) throw enrollmentError;

    // Create a notification for successful enrollment
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'course_enrollment',
      title: 'Course Enrollment Successful',
      message: `You've been enrolled in "${course.title}". Start learning now!`,
      metadata: {
        course_id: courseId,
        course_title: course.title,
        total_lessons: totalLessons,
      },
    });

    console.log(`User ${userId} successfully enrolled in course ${courseId}`);

    return new Response(
      JSON.stringify({
        success: true,
        alreadyEnrolled: false,
        enrollment: {
          id: enrollment.id,
          courseId: courseId,
          courseTitle: course.title,
          totalLessons: totalLessons,
          progress: 0,
          status: 'in_progress',
          enrolledAt: enrollment.enrolled_at,
        },
        message: `Successfully enrolled in "${course.title}"`,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('Error in enroll-user-in-course:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});
