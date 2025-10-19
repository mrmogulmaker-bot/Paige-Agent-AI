import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProgressRequest {
  userId: string;
  lessonId: string;
  completed: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, lessonId, completed }: ProgressRequest = await req.json();

    if (!userId || !lessonId) {
      throw new Error('Missing userId or lessonId');
    }

    console.log(`Updating lesson progress for user ${userId}, lesson ${lessonId}, completed: ${completed}`);

    // Get lesson details
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('*, courses(*)')
      .eq('id', lessonId)
      .single();

    if (lessonError || !lesson) {
      throw new Error('Lesson not found');
    }

    const courseId = lesson.course_id;

    // Get or create user progress record
    let { data: progress, error: progressError } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .maybeSingle();

    if (progressError) throw progressError;

    // If no progress record exists, create one
    if (!progress) {
      const { data: totalLessonsData } = await supabase
        .from('lessons')
        .select('id')
        .eq('course_id', courseId);

      const totalLessons = totalLessonsData?.length || 0;

      const { data: newProgress, error: createError } = await supabase
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

      if (createError) throw createError;
      progress = newProgress;
    }

    // Update completed lessons array
    let completedLessons = progress.completed_lessons || [];
    
    if (completed && !completedLessons.includes(lessonId)) {
      completedLessons.push(lessonId);
    } else if (!completed && completedLessons.includes(lessonId)) {
      completedLessons = completedLessons.filter((id: string) => id !== lessonId);
    }

    // Calculate new progress percentage
    const totalLessons = progress.total_lessons || 0;
    const progressPercentage = totalLessons > 0 
      ? Math.round((completedLessons.length / totalLessons) * 100) 
      : 0;

    // Determine course status
    let status = 'in_progress';
    if (progressPercentage === 100) {
      status = 'completed';
    } else if (progressPercentage === 0) {
      status = 'not_started';
    }

    // Update progress record
    const { data: updatedProgress, error: updateError } = await supabase
      .from('user_progress')
      .update({
        completed_lessons: completedLessons,
        progress_percentage: progressPercentage,
        status: status,
        last_accessed_at: new Date().toISOString(),
        ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq('id', progress.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // If course just completed, send notification
    if (status === 'completed' && progress.status !== 'completed') {
      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'course_completion',
        title: 'Course Completed! 🎉',
        message: `Congratulations! You've completed "${lesson.courses.title}"`,
        metadata: {
          course_id: courseId,
          course_title: lesson.courses.title,
          completion_date: new Date().toISOString(),
        },
      });
    }

    console.log(`Progress updated: ${completedLessons.length}/${totalLessons} lessons (${progressPercentage}%)`);

    return new Response(
      JSON.stringify({
        success: true,
        progress: {
          courseId: courseId,
          courseTitle: lesson.courses.title,
          lessonId: lessonId,
          lessonTitle: lesson.title,
          completedLessons: completedLessons.length,
          totalLessons: totalLessons,
          progressPercentage: progressPercentage,
          status: status,
          justCompleted: status === 'completed' && progress.status !== 'completed',
        },
        message: completed 
          ? `Lesson "${lesson.title}" marked as complete` 
          : `Lesson "${lesson.title}" marked as incomplete`,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('Error in track-lesson-progress:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});
