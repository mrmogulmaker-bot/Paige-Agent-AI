import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, AlertCircle, ArrowRight, ListTodo } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

export const PersonalTasksOverview = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    pending: 0,
    overdue: 0,
  });
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: tasks } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .is("biz_id", null) // Only personal tasks
        .order("created_at", { ascending: false })
        .limit(3);

      if (tasks) {
        const total = tasks.length;
        const completed = tasks.filter(t => t.status === "completed").length;
        const pending = tasks.filter(t => t.status === "pending").length;
        const now = new Date();
        const overdue = tasks.filter(t => 
          t.status === "pending" && 
          t.due_date && 
          new Date(t.due_date) < now
        ).length;

        setStats({ total, completed, pending, overdue });
        setRecentTasks(tasks.slice(0, 3));
      }
      setLoading(false);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "in_progress":
        return <Circle className="w-4 h-4 text-warning" />;
      default:
        return <Circle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <Card 
      className="p-6 bg-card border-border shadow-card relative overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" 
      onClick={() => navigate('/dashboard?section=tasks')}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16" />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Personal Tasks</h2>
            <p className="text-sm text-muted-foreground mt-1">Credit Building Actions</p>
          </div>
          <ListTodo className="w-8 h-8 text-primary" />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Total Tasks</p>
            <p className="text-2xl font-bold text-primary">{stats.total}</p>
          </div>
          <div className="p-3 bg-success/10 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Completed</p>
            <p className="text-2xl font-bold text-success">{stats.completed}</p>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {recentTasks.length > 0 ? (
            recentTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                {getStatusIcon(task.status)}
                <span className="text-sm flex-1 truncate">{task.title}</span>
                <Badge variant={task.status === "completed" ? "default" : "secondary"} className="text-xs">
                  {task.status}
                </Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No tasks yet</p>
          )}
        </div>

        <div className="p-4 bg-gradient-gold/10 rounded-lg border border-primary/20 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-primary">View All Tasks</p>
            {stats.overdue > 0 && (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" />
                {stats.overdue} overdue
              </p>
            )}
          </div>
          <ArrowRight className="w-5 h-5 text-primary" />
        </div>
      </div>
    </Card>
  );
};
