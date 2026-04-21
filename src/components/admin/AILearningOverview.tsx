import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Sparkles, Trophy, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AIStats {
  totalDocs: number;
  autoThisMonth: number;
  outcomesLearned: number;
  retrievalsThisMonth: number;
}

export function AILearningOverview() {
  const [stats, setStats] = useState<AIStats>({
    totalDocs: 0,
    autoThisMonth: 0,
    outcomesLearned: 0,
    retrievalsThisMonth: 0,
  });

  useEffect(() => {
    (async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [totalRes, autoRes, outcomesRes, retrievalsRes] = await Promise.all([
        supabase.from("rag_documents" as any).select("id", { count: "exact", head: true }),
        supabase.from("rag_documents" as any)
          .select("id", { count: "exact", head: true })
          .eq("source", "system_generated")
          .gte("created_at", monthStart.toISOString()),
        supabase.from("rag_documents" as any)
          .select("id", { count: "exact", head: true })
          .eq("document_type", "outcome_case"),
        supabase.from("rag_retrieval_log" as any)
          .select("id", { count: "exact", head: true })
          .gte("created_at", monthStart.toISOString()),
      ]);

      setStats({
        totalDocs: totalRes.count || 0,
        autoThisMonth: autoRes.count || 0,
        outcomesLearned: outcomesRes.count || 0,
        retrievalsThisMonth: retrievalsRes.count || 0,
      });
    })();
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Brain className="w-5 h-5 text-accent" />
        <h2 className="text-xl font-semibold text-foreground">AI Learning</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Knowledge Base Documents</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDocs.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auto-Generated This Month</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.autoThisMonth.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Successful Outcomes Learned</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.outcomesLearned.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">RAG Retrievals This Month</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.retrievalsThisMonth.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm italic text-accent text-center pt-1">
        Paige learns from every client outcome. The more clients we serve, the smarter she gets.
      </p>
    </div>
  );
}
