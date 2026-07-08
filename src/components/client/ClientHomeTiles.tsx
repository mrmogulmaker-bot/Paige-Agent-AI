import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyTile } from "@/components/client/EmptyTile";
import { supabase } from "@/integrations/supabase/client";
import { usePlaybook } from "@/lib/playbook";
import {
  Target,
  TrendingUp,
  DollarSign,
  FileText,
  MessageSquare,
  ListChecks,
  CalendarCheck,
} from "lucide-react";

type Counts = {
  goals: number | null;
  creditPulls: number | null;
  applications: number | null;
  documents: number | null;
  messages: number | null;
  nextSteps: number | null;
};

const EMPTY: Counts = {
  goals: null,
  creditPulls: null,
  applications: null,
  documents: null,
  messages: null,
  nextSteps: null,
};

/**
 * Client-view home tiles. Zero seeded content — each tile renders real counts
 * or a single-action EmptyTile CTA that routes to the flow that produces
 * the missing data. Six tiles: Goals, Credit, Funding, Documents, Messages,
 * Next Steps.
 */
export function ClientHomeTiles({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const pb = usePlaybook();
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    (async () => {
      setLoading(true);
      const headOnly = { count: "exact" as const, head: true };
      const [goals, credit, apps, docs, msgs, tasks] = await Promise.all([
        supabase.from("client_goals" as any).select("id", headOnly).eq("user_id", userId),
        supabase.from("credit_report_uploads" as any).select("id", headOnly).eq("user_id", userId),
        supabase.from("funding_journey_applications" as any).select("id", headOnly).eq("user_id", userId),
        supabase.from("documents" as any).select("id", headOnly).eq("user_id", userId),
        supabase.from("chat_messages" as any).select("id", headOnly).eq("user_id", userId),
        supabase
          .from("tasks" as any)
          .select("id", headOnly)
          .eq("assigned_to", userId)
          .neq("status", "completed"),
      ]);
      if (cancelled) return;
      setCounts({
        goals: goals.count ?? 0,
        creditPulls: credit.count ?? 0,
        applications: apps.count ?? 0,
        documents: docs.count ?? 0,
        messages: msgs.count ?? 0,
        nextSteps: tasks.count ?? 0,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const askPaige = (prompt: string) => {
    window.dispatchEvent(new CustomEvent("paige:prefill", { detail: { prompt } }));
  };

  // Coaching default shows coaching-only tiles. The credit/funding tiles render
  // ONLY when the client actually has that data on file (the query-result signal
  // already loaded above) — a coaching client never sees credit/funding copy.
  const coachName = pb.persona.name;
  const nextStepsPrompt = pb.quickActions[0]?.prompt ?? "What should I focus on next?";
  const bookPrompt = pb.quickActions[1]?.prompt ?? "Help me schedule my next session";
  const progressPrompt = pb.quickActions[2]?.prompt ?? "Show me how I'm progressing toward my goals";
  const hasCredit = (counts.creditPulls ?? 0) > 0;
  const hasFunding = (counts.applications ?? 0) > 0;

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-32 rounded-lg bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 1. Goals */}
      {counts.goals && counts.goals > 0 ? (
        <FilledTile
          icon={<Target className="w-4 h-4" />}
          title="Your Goals"
          count={counts.goals}
          label="active"
          onClick={() => navigate("/app/settings")}
        />
      ) : (
        <EmptyTile
          icon={<Target className="w-6 h-6" />}
          title="Set your first goal"
          description="Tell Paige what you're building toward and she'll map the path."
          actionLabel="Set your first goal"
          onAction={() => askPaige("Help me set my first goal.")}
        />
      )}

      {/* 2. Progress (coaching) — credit tile only when the client has credit data */}
      {hasCredit ? (
        <FilledTile
          icon={<TrendingUp className="w-4 h-4" />}
          title="Credit"
          count={counts.creditPulls as number}
          label="reports on file"
          onClick={() => navigate("/app/credit")}
        />
      ) : (
        <EmptyTile
          icon={<TrendingUp className="w-6 h-6" />}
          title="Your progress"
          description={`See how you're tracking toward your goals — ask ${coachName} for a snapshot.`}
          actionLabel="Show my progress"
          onAction={() => askPaige(progressPrompt)}
        />
      )}

      {/* 3. Sessions (coaching) — funding tile only when the client has applications */}
      {hasFunding ? (
        <FilledTile
          icon={<DollarSign className="w-4 h-4" />}
          title="Funding"
          count={counts.applications as number}
          label="applications"
          onClick={() => navigate("/app/funding-journey")}
        />
      ) : (
        <EmptyTile
          icon={<CalendarCheck className="w-6 h-6" />}
          title="Book a session"
          description="Grab a time with your coach and keep your momentum going."
          actionLabel="Book a session"
          onAction={() => askPaige(bookPrompt)}
        />
      )}

      {/* 4. Documents */}
      {counts.documents && counts.documents > 0 ? (
        <FilledTile
          icon={<FileText className="w-4 h-4" />}
          title="Documents"
          count={counts.documents}
          label="uploaded"
          onClick={() => navigate("/app/business")}
        />
      ) : (
        <EmptyTile
          icon={<FileText className="w-6 h-6" />}
          title="No documents yet"
          description={`Keep your important files in one place so ${coachName} can reference them when you need them.`}
          actionLabel="Upload your first document"
          onAction={() => navigate("/app/business")}
        />
      )}

      {/* 5. Messages */}
      {counts.messages && counts.messages > 0 ? (
        <FilledTile
          icon={<MessageSquare className="w-4 h-4" />}
          title={`Message ${coachName}`}
          count={counts.messages}
          label="in your thread"
          onClick={() => askPaige("Show me my recent messages.")}
        />
      ) : (
        <EmptyTile
          icon={<MessageSquare className="w-6 h-6" />}
          title={`Message ${coachName}`}
          description={`Ask ${coachName} a question or start a thread with your coach anytime.`}
          actionLabel="Send your first message"
          onAction={() => askPaige(`Hi ${coachName} — I'd like to introduce myself.`)}
        />
      )}

      {/* 6. Next Steps — already dynamic via tasks table */}
      {counts.nextSteps && counts.nextSteps > 0 ? (
        <FilledTile
          icon={<ListChecks className="w-4 h-4" />}
          title="Your next steps"
          count={counts.nextSteps}
          label="open"
          onClick={() => askPaige(nextStepsPrompt)}
        />
      ) : (
        <EmptyTile
          icon={<ListChecks className="w-6 h-6" />}
          title="Your next steps"
          description={`Your action list fills in as ${coachName} assigns coached tasks.`}
          actionLabel={`Ask ${coachName} what's next`}
          onAction={() => askPaige(nextStepsPrompt)}
        />
      )}
    </div>
  );
}

function FilledTile({
  icon,
  title,
  count,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:border-accent/50 transition-colors"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">{count}</span>
          <Badge variant="outline" className="text-xs">
            {label}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
