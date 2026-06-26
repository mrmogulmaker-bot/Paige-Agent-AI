import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CheckSquare, Clock } from "lucide-react";

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  track: string | null;
  created_at: string;
};

export default function TasksAdmin() {
  const [meId, setMeId] = useState<string | null>(null);
  const [mine, setMine] = useState<TaskRow[]>([]);
  const [all, setAll] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setMeId(user?.id || null);

    // Admin reads via RLS: admins/coaches can view their own tasks per existing policy.
    // Show "Assigned to me" using user_id = me.
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(200);
    const tasks = (data || []) as TaskRow[];
    setAll(tasks);
    setMine(tasks.filter((t) => t.user_id === user?.id));
    setLoading(false);
  };

  const renderList = (items: TaskRow[]) => {
    if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
    if (!items.length) return <div className="p-8 text-center text-muted-foreground">No tasks.</div>;
    return (
      <div className="divide-y divide-border">
        {items.map((t) => (
          <div key={t.id} className="flex items-start gap-3 p-4">
            <CheckSquare className={`h-4 w-4 mt-1 flex-shrink-0 ${t.status === "completed" ? "text-accent" : "text-muted-foreground"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-medium">{t.title}</div>
                <Badge variant="outline" className="text-xs capitalize">{t.status}</Badge>
                {t.track && <Badge variant="secondary" className="text-xs">{t.track}</Badge>}
              </div>
              {t.description && <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</div>}
              {t.due_date && (
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Due {new Date(t.due_date).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Tasks</h1>
        <p className="text-sm text-muted-foreground">Operator task queue.</p>
      </div>
      <Card>
        <Tabs defaultValue="mine">
          <TabsList className="m-3">
            <TabsTrigger value="mine">Assigned to me ({mine.length})</TabsTrigger>
            <TabsTrigger value="all">All visible ({all.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="mt-0">{renderList(mine)}</TabsContent>
          <TabsContent value="all" className="mt-0">{renderList(all)}</TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
