import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Award, Clock, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Course {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  difficulty_level: string;
  framework: string;
  module_count: number;
}

interface Enrollment {
  course_id: string;
  progress_percentage: number;
  completed_at: string | null;
  certificate_id: string | null;
}

export const CourseEnrollment = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Map<string, Enrollment>>(new Map());
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchCoursesAndEnrollments();
  }, []);

  const fetchCoursesAndEnrollments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [coursesRes, enrollmentsRes] = await Promise.all([
        supabase.from('courses').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('user_progress').select('*').eq('user_id', user.id)
      ]);

      if (coursesRes.error) throw coursesRes.error;
      if (enrollmentsRes.error) throw enrollmentsRes.error;

      setCourses(coursesRes.data || []);
      const enrollmentMap = new Map();
      enrollmentsRes.data?.forEach(e => enrollmentMap.set(e.course_id, e));
      setEnrollments(enrollmentMap);
    } catch (error: any) {
      toast({
        title: "Error loading courses",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const enrollInCourse = async (courseId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.functions.invoke('enroll-user-in-course', {
        body: { userId: user.id, courseId }
      });

      if (error) throw error;

      toast({
        title: "Enrolled successfully",
        description: "You can now start learning!",
      });

      fetchCoursesAndEnrollments();
    } catch (error: any) {
      toast({
        title: "Enrollment failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => {
        const enrollment = enrollments.get(course.id);
        const isEnrolled = !!enrollment;
        const isCompleted = enrollment?.completed_at;

        return (
          <Card key={course.id} className="relative">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    {course.title}
                  </CardTitle>
                  <CardDescription className="mt-2">{course.description}</CardDescription>
                </div>
                {isCompleted && (
                  <Badge variant="default" className="bg-green-600">
                    <Award className="h-3 w-3 mr-1" />
                    Completed
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {course.duration_minutes} minutes
                  <Badge variant="outline">{course.difficulty_level}</Badge>
                </div>
                <div className="text-sm">
                  <span className="font-medium">{course.module_count}</span> modules
                </div>

                {isEnrolled && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Progress</span>
                      <span className="font-medium">{enrollment.progress_percentage}%</span>
                    </div>
                    <Progress value={enrollment.progress_percentage} />
                  </div>
                )}

                <Button
                  onClick={() => enrollInCourse(course.id)}
                  disabled={isEnrolled}
                  className="w-full"
                  variant={isEnrolled ? "outline" : "default"}
                >
                  {isEnrolled ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Enrolled
                    </>
                  ) : (
                    'Enroll Now'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
