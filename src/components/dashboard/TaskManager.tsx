import { useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, CheckCircle2, Clock, AlertCircle, Sparkles, Plus, Trash2 } from "lucide-react";
import { format, isPast, differenceInDays, parseISO } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TaskManagerProps {
  businessMode?: boolean;
}

export function TaskManager({ businessMode = false }: TaskManagerProps) {
  const { tasks, loading, updateTask, createTask, deleteTask, generateBuildTasks } = useTasks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    track: "",
    due_date: "",
  });

  const pendingTasks = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const overdueTasks = pendingTasks.filter(
    (t) => t.due_date && isPast(parseISO(t.due_date))
  );

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    await updateTask(taskId, { status: newStatus });
  };

  const handleCreateTask = async () => {
    if (!newTask.title) return;

    await createTask({
      ...newTask,
      status: "pending",
    });

    setNewTask({ title: "", description: "", track: "", due_date: "" });
    setDialogOpen(false);
  };

  const getTaskPriority = (task: typeof tasks[0]) => {
    if (!task.due_date) return "low";
    const daysUntilDue = differenceInDays(parseISO(task.due_date), new Date());
    if (daysUntilDue < 0) return "overdue";
    if (daysUntilDue <= 3) return "urgent";
    if (daysUntilDue <= 7) return "high";
    return "normal";
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "overdue":
        return "destructive";
      case "urgent":
        return "destructive";
      case "high":
        return "default";
      default:
        return "secondary";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            {businessMode ? "Business Tasks" : "Personal Tasks"}
          </h1>
          <p className="text-muted-foreground mt-2">
            Track your {businessMode ? "business" : "personal"} progress and stay on top of deadlines
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={generateBuildTasks}
            variant="outline"
            className="border-primary/20"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Generate BUILD Tasks
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-gold hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                Add Task
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Task</DialogTitle>
                <DialogDescription>
                  Add a task to track your progress
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Task Title</Label>
                  <Input
                    id="title"
                    value={newTask.title}
                    onChange={(e) =>
                      setNewTask({ ...newTask, title: e.target.value })
                    }
                    placeholder="Complete business formation"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newTask.description}
                    onChange={(e) =>
                      setNewTask({ ...newTask, description: e.target.value })
                    }
                    placeholder="Additional details..."
                  />
                </div>
                <div>
                  <Label htmlFor="track">Track (Optional)</Label>
                  <Select
                    value={newTask.track}
                    onValueChange={(value) =>
                      setNewTask({ ...newTask, track: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a track" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BUILD-B">B - Business Formation</SelectItem>
                      <SelectItem value="BUILD-U">U - Utilize Credit</SelectItem>
                      <SelectItem value="BUILD-I">I - Income Verification</SelectItem>
                      <SelectItem value="BUILD-L">L - Leverage Funding</SelectItem>
                      <SelectItem value="BUILD-D">D - Diversify Credit</SelectItem>
                      <SelectItem value="ACCEL">ACCEL Framework</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="due_date">Due Date</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={newTask.due_date}
                    onChange={(e) =>
                      setNewTask({ ...newTask, due_date: e.target.value })
                    }
                  />
                </div>
                <Button onClick={handleCreateTask} className="w-full bg-gradient-gold">
                  Create Task
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{pendingTasks.length}</span>
              <Clock className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-destructive">
                {overdueTasks.length}
              </span>
              <AlertCircle className="w-8 h-8 text-destructive opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-success">
                {completedTasks.length}
              </span>
              <CheckCircle2 className="w-8 h-8 text-success opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Tasks */}
      {pendingTasks.length > 0 && (
        <Card className="shadow-glow border-primary/20">
          <CardHeader>
            <CardTitle>Active Tasks</CardTitle>
            <CardDescription>Tasks that need your attention</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingTasks.map((task) => {
              const priority = getTaskPriority(task);
              return (
                <div
                  key={task.id}
                  className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                >
                  <Checkbox
                    checked={task.status === "completed"}
                    onCheckedChange={() => handleToggleTask(task.id, task.status)}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{task.title}</h4>
                      {task.track && (
                        <Badge variant="outline" className="text-xs">
                          {task.track}
                        </Badge>
                      )}
                      {priority !== "normal" && priority !== "low" && (
                        <Badge variant={getPriorityColor(priority)} className="text-xs">
                          {priority === "overdue" ? "Overdue" : "Urgent"}
                        </Badge>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground">
                        {task.description}
                      </p>
                    )}
                    {task.due_date && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span>
                          Due {format(parseISO(task.due_date), "MMM dd, yyyy")}
                        </span>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteTask(task.id)}
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Completed Tasks</CardTitle>
            <CardDescription>Great work! Keep it up 🎉</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {completedTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-4 p-4 rounded-lg border bg-card opacity-60"
              >
                <Checkbox checked={true} disabled className="mt-1" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold line-through">{task.title}</h4>
                    {task.track && (
                      <Badge variant="outline" className="text-xs">
                        {task.track}
                      </Badge>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-sm text-muted-foreground line-through">
                      {task.description}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteTask(task.id)}
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tasks.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="py-12 text-center">
            <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No tasks yet</h3>
            <p className="text-muted-foreground mb-4">
              Get started by generating BUILD framework tasks or creating your own
            </p>
            <Button
              onClick={generateBuildTasks}
              className="bg-gradient-gold hover:opacity-90"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate BUILD Tasks
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
