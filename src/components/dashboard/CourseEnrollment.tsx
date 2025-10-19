import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Clock, Award, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Course {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  module_count: number;
  framework: string;
  difficulty_level: string | null;
}

interface UserProgress {
  progress_percentage: number;
  completed_lessons: string[];
  course_status: string;
}

export function CourseEnrollment() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<Map<string, UserProgress>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchCourses = async () => {
    try {
      const { data: coursesData, error: coursesError } = await supabase
        .from('courses')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (coursesError) throw coursesError;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: progressData, error: progressError } = await supabase
          .from('user_progress')
          .select('course_id, progress_percentage')
          .eq('user_id', user.id);

        if (progressError) {
          console.error("Error fetching progress:", progressError);
        } else if (progressData) {
          const progressMap = new Map(
            progressData.map(p => [p.course_id, {
              progress_percentage: p.progress_percentage || 0,
              completed_lessons: [],
              course_status: p.progress_percentage >= 100 ? 'completed' : 'in_progress'
            }])
          );
          setEnrolledCourses(progressMap);
        }
      }

      setCourses(coursesData);
    } catch (error: any) {
      toast.error("Failed to load courses", {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleEnroll = async (courseId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('enroll-user-in-course', {
        body: { courseId }
      });

      if (error) throw error;

      toast.success("Successfully enrolled in course!");
      fetchCourses();
    } catch (error: any) {
      toast.error("Failed to enroll", {
        description: error.message
      });
    }
  };

  if (loading) {
    return <div className="text-center p-8">Loading courses...</div>;
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {courses.map((course) => {
        const progress = enrolledCourses.get(course.id);
        const isEnrolled = !!progress;

        return (
          <Card key={course.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    {course.title}
                  </CardTitle>
                  <CardDescription className="mt-2">{course.description}</CardDescription>
                </div>
                <Badge variant={course.framework === 'ACCEL' ? 'default' : 'secondary'}>
                  {course.framework}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {course.duration_minutes} min
                  </div>
                  <div>{course.module_count} modules</div>
                  {course.difficulty_level && (
                    <Badge variant="outline">{course.difficulty_level}</Badge>
                  )}
                </div>

                {isEnrolled ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Progress</span>
                      <span className="font-medium">{Math.round(progress.progress_percentage)}%</span>
                    </div>
                    <Progress value={progress.progress_percentage} />
                    {progress.course_status === 'completed' && (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm font-medium">Completed</span>
                        <Award className="h-4 w-4 ml-auto" />
                      </div>
                    )}
                  </div>
                ) : (
                  <Button onClick={() => handleEnroll(course.id)} className="w-full">
                    Enroll Now
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}