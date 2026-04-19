import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, CheckCircle2, Circle, Clock, Loader2, Award, Lock } from "lucide-react";
import { toast } from "sonner";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";

interface Lesson {
  id: string;
  course_id: string;
  module_number: number;
  title: string;
  content_type: string | null;
  content_url: string | null;
  content_markdown: string | null;
  duration_minutes: number | null;
  sort_order: number | null;
  is_required: boolean | null;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  framework: string;
  duration_minutes: number | null;
}

export default function CourseViewer() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [hasCert, setHasCert] = useState(false);

  const load = async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      const [{ data: courseData }, { data: lessonsData }] = await Promise.all([
        supabase.from("courses").select("id,title,description,framework,duration_minutes").eq("id", courseId).maybeSingle(),
        supabase.from("lessons").select("*").eq("course_id", courseId).order("sort_order"),
      ]);

      setCourse(courseData as any);
      const ls = (lessonsData as Lesson[]) || [];
      setLessons(ls);
      if (ls.length) setActiveId(ls[0].id);

      if (user) {
        // pull all per-lesson rows (status='completed' means lesson done)
        const { data: progressRows } = await supabase
          .from("user_progress")
          .select("lesson_id,status")
          .eq("user_id", user.id)
          .eq("course_id", courseId);
        const done = new Set<string>();
        (progressRows || []).forEach((r: any) => {
          if (r.lesson_id && r.status === "completed") done.add(r.lesson_id);
        });
        setCompleted(done);

        const { data: cert } = await supabase
          .from("course_certificates")
          .select("id")
          .eq("user_id", user.id)
          .eq("course_id", courseId)
          .maybeSingle();
        setHasCert(!!cert);
      }
    } catch (e: any) {
      toast.error("Failed to load course", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [courseId]);

  const activeLesson = useMemo(() => lessons.find(l => l.id === activeId) || null, [lessons, activeId]);
  const pct = lessons.length ? Math.round((completed.size / lessons.length) * 100) : 0;
  const allDone = lessons.length > 0 && completed.size === lessons.length;

  const markDone = async (lessonId: string, done: boolean) => {
    if (!userId) {
      toast.error("Sign in to track progress.");
      return;
    }
    setMarking(true);
    try {
      // Upsert per-lesson row
      const { error } = await supabase
        .from("user_progress")
        .upsert({
          user_id: userId,
          course_id: courseId!,
          lesson_id: lessonId,
          status: done ? "completed" : "in_progress",
          progress_percentage: done ? 100 : 0,
          completed_at: done ? new Date().toISOString() : null,
        }, { onConflict: "user_id,course_id,lesson_id" as any });
      if (error) throw error;

      const next = new Set(completed);
      done ? next.add(lessonId) : next.delete(lessonId);
      setCompleted(next);

      // Update course-level summary row (lesson_id null)
      const newPct = lessons.length ? Math.round((next.size / lessons.length) * 100) : 0;
      const courseStatus = newPct >= 100 ? "completed" : newPct > 0 ? "in_progress" : "not_started";
      await supabase
        .from("user_progress")
        .upsert({
          user_id: userId,
          course_id: courseId!,
          lesson_id: null,
          status: courseStatus,
          progress_percentage: newPct,
          completed_at: courseStatus === "completed" ? new Date().toISOString() : null,
        }, { onConflict: "user_id,course_id,lesson_id" as any });

      // Issue cert when course just completed
      if (courseStatus === "completed" && !hasCert) {
        try {
          await supabase.functions.invoke("issue-certificate", {
            body: { userId, courseId },
          });
          setHasCert(true);
          toast.success("Course completed! Certificate issued. 🎓");
        } catch {
          toast.success("Course completed! 🎉");
        }
      }
    } catch (e: any) {
      toast.error("Couldn't update progress", { description: e.message });
    } finally {
      setMarking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading course…
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">Course not found.</p>
          <Button onClick={() => navigate("/app/learn")}>Back to Learning Vault</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/app/learn")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" /> All Courses
      </Button>

      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Badge variant="outline" className="mb-2">{course.framework}</Badge>
            <h1 className="text-3xl font-bold">{course.title}</h1>
            {course.description && (
              <p className="text-muted-foreground mt-2 max-w-3xl">{course.description}</p>
            )}
          </div>
          {hasCert && (
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border">
              <Award className="w-3.5 h-3.5 mr-1" /> Certified
            </Badge>
          )}
        </div>
        <div className="mt-4 max-w-md">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">Course progress</span>
            <span className="font-medium">{completed.size}/{lessons.length} · {pct}%</span>
          </div>
          <Progress value={pct} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Module list */}
        <Card className="p-3 h-fit lg:sticky lg:top-4">
          <div className="px-2 py-1.5 text-xs font-semibold uppercase text-muted-foreground tracking-wide">
            Modules
          </div>
          <div className="space-y-1">
            {lessons.map((l) => {
              const isActive = l.id === activeId;
              const isDone = completed.has(l.id);
              return (
                <button
                  key={l.id}
                  onClick={() => setActiveId(l.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-md flex items-start gap-3 transition-colors ${
                    isActive ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/60 border border-transparent"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">Module {l.module_number}</div>
                    <div className="text-sm font-medium leading-snug truncate">{l.title}</div>
                    {l.duration_minutes && (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> {l.duration_minutes} min
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Lesson body */}
        <Card className="p-6 lg:p-8">
          {activeLesson ? (
            <>
              <div className="text-xs text-muted-foreground mb-1">Module {activeLesson.module_number}</div>
              <h2 className="text-2xl font-bold mb-4">{activeLesson.title}</h2>

              {activeLesson.content_markdown ? (
                <div className="prose prose-invert max-w-none">
                  <MarkdownMessage content={activeLesson.content_markdown} />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-muted-foreground">
                  <Lock className="w-6 h-6 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    Lesson content is being finalized by the PME team.<br />
                    You can still mark this module complete to track your progress.
                  </p>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between flex-wrap gap-3">
                <div className="text-xs text-muted-foreground">
                  {activeLesson.duration_minutes ? `Estimated ${activeLesson.duration_minutes} min` : ""}
                </div>
                <div className="flex gap-2">
                  {completed.has(activeLesson.id) ? (
                    <Button
                      variant="outline"
                      onClick={() => markDone(activeLesson.id, false)}
                      disabled={marking}
                    >
                      Mark Incomplete
                    </Button>
                  ) : (
                    <Button onClick={() => markDone(activeLesson.id, true)} disabled={marking}>
                      {marking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Mark Complete
                    </Button>
                  )}
                  {(() => {
                    const idx = lessons.findIndex(l => l.id === activeLesson.id);
                    const next = lessons[idx + 1];
                    return next ? (
                      <Button variant="default" onClick={() => setActiveId(next.id)}>
                        Next Module →
                      </Button>
                    ) : null;
                  })()}
                </div>
              </div>

              {allDone && (
                <div className="mt-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm text-emerald-300 flex items-center gap-3">
                  <Award className="w-5 h-5" />
                  You've completed every module in this course. Nice work.
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Select a module to begin.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
