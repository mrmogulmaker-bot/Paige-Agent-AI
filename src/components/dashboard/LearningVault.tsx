import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Clock, Award, CheckCircle2, Layers, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Course {
  id: string;
  title: string;
  description: string | null;
  framework: string;
  difficulty_level: string | null;
  duration_minutes: number | null;
  module_count: number | null;
  sort_order: number | null;
}

interface ProgressInfo {
  progress_percentage: number;
  status: string;
}

const frameworkStyles: Record<string, string> = {
  ACCEL: "bg-primary/15 text-primary border-primary/30",
  BUILD: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  FUND: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export const LearningVault = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<Map<string, ProgressInfo>>(new Map());
  const [certificates, setCertificates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: courseData, error: courseErr } = await supabase
        .from("courses")
        .select("id,title,description,framework,difficulty_level,duration_minutes,module_count,sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (courseErr) throw courseErr;
      setCourses(courseData || []);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: progressData } = await supabase
          .from("user_progress")
          .select("course_id,progress_percentage,status")
          .eq("user_id", user.id);
        if (progressData) {
          const map = new Map<string, ProgressInfo>();
          progressData.forEach((p: any) => {
            map.set(p.course_id, {
              progress_percentage: Number(p.progress_percentage) || 0,
              status: p.status || "in_progress",
            });
          });
          setProgress(map);
        }

        const { data: certData } = await supabase
          .from("course_certificates")
          .select("course_id")
          .eq("user_id", user.id);
        if (certData) setCertificates(new Set(certData.map((c: any) => c.course_id)));
      }
    } catch (e: any) {
      toast.error("Failed to load courses", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleEnroll = async (courseId: string) => {
    setEnrollingId(courseId);
    try {
      const { error } = await supabase.functions.invoke("enroll-user-in-course", {
        body: { courseId },
      });
      if (error) throw error;
      toast.success("Enrolled — let's go.");
      navigate(`/app/learn/${courseId}`);
    } catch (e: any) {
      toast.error("Enrollment failed", { description: e.message });
    } finally {
      setEnrollingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Learning Vault</h2>
        <p className="text-muted-foreground">
          Step-by-step training across the ACCEL, BUILD, and FUND frameworks.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading vault…
        </div>
      ) : courses.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          No courses available yet. Check back soon.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => {
            const p = progress.get(course.id);
            const isEnrolled = !!p;
            const isComplete = certificates.has(course.id) || p?.status === "completed";
            const fwClass = frameworkStyles[course.framework] || "bg-secondary text-secondary-foreground";

            return (
              <Card
                key={course.id}
                className="p-6 bg-card border-border shadow-card hover:shadow-glow transition-all duration-300 flex flex-col"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <BookOpen className="w-6 h-6 text-primary" />
                  </div>
                  <Badge variant="outline" className={`text-xs border ${fwClass}`}>
                    {course.framework}
                  </Badge>
                </div>

                <h3 className="font-semibold mb-2 text-lg leading-tight">{course.title}</h3>
                {course.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-3">{course.description}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                  {course.duration_minutes != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {course.duration_minutes} min
                    </span>
                  )}
                  {course.module_count != null && (
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" /> {course.module_count} modules
                    </span>
                  )}
                  {course.difficulty_level && (
                    <Badge variant="secondary" className="text-[10px]">{course.difficulty_level}</Badge>
                  )}
                </div>

                {isEnrolled && (
                  <div className="space-y-1.5 mb-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{Math.round(p!.progress_percentage)}%</span>
                    </div>
                    <Progress value={p!.progress_percentage} />
                  </div>
                )}

                {isComplete && (
                  <div className="flex items-center gap-2 text-emerald-500 text-sm mb-4">
                    <CheckCircle2 className="w-4 h-4" /> Completed
                    <Award className="w-4 h-4 ml-auto" />
                  </div>
                )}

                <div className="mt-auto">
                  {isEnrolled ? (
                    <Button className="w-full" onClick={() => navigate(`/app/learn/${course.id}`)}>
                      {isComplete ? "Review Course" : "Continue"}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => handleEnroll(course.id)}
                      disabled={enrollingId === course.id}
                    >
                      {enrollingId === course.id ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enrolling…</>
                      ) : "Enroll & Start"}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
