import { useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarIcon, CheckCircle2, Clock, AlertCircle, Sparkles, Plus, Trash2, CalendarDays, ListTodo } from "lucide-react";
import { format, isPast, differenceInDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth } from "date-fns";
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
import { cn } from "@/lib/utils";

export function TaskManager() {
  const { tasks, loading, updateTask, createTask, deleteTask, generateAccelTasks, generateBuildTasks } = useTasks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    track: "",
    due_date: "",
  });

  // Filter tasks by framework
  const accelTasks = tasks.filter((t) => t.track?.startsWith("ACCEL"));
  const buildTasks = tasks.filter((t) => t.track?.startsWith("BUILD"));

  const getTaskStats = (taskList: typeof tasks) => {
    const pending = taskList.filter((t) => t.status === "pending" || t.status === "in_progress");
    const completed = taskList.filter((t) => t.status === "completed");
    const overdue = pending.filter((t) => t.due_date && isPast(parseISO(t.due_date)));
    return { pending, completed, overdue };
  };

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
      case "urgent":
        return "destructive";
      case "high":
        return "default";
      default:
        return "secondary";
    }
  };

  const getTasksForDay = (date: Date, taskList: typeof tasks) => {
    return taskList.filter((task) => {
      if (!task.due_date) return false;
      return isSameDay(parseISO(task.due_date), date);
    });
  };

  const renderCalendarView = (taskList: typeof tasks) => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {format(currentMonth, "MMMM yyyy")}
          </h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentMonth(new Date())}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}
            >
              Next
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="text-center text-sm font-medium text-muted-foreground p-2">
              {day}
            </div>
          ))}
          {daysInMonth.map((day) => {
            const dayTasks = getTasksForDay(day, taskList);
            const isToday = isSameDay(day, new Date());
            
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-24 p-2 border rounded-lg",
                  isToday && "bg-primary/5 border-primary",
                  !isSameMonth(day, currentMonth) && "opacity-50"
                )}
              >
                <div className={cn("text-sm font-medium mb-1", isToday && "text-primary")}>
                  {format(day, "d")}
                </div>
                <div className="space-y-1">
                  {dayTasks.slice(0, 2).map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        "text-xs p-1 rounded truncate",
                        task.status === "completed" ? "bg-success/20 line-through" : "bg-primary/10"
                      )}
                      title={task.title}
                    >
                      {task.title}
                    </div>
                  ))}
                  {dayTasks.length > 2 && (
                    <div className="text-xs text-muted-foreground">
                      +{dayTasks.length - 2} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTaskList = (taskList: typeof tasks, framework: "ACCEL" | "BUILD") => {
    const stats = getTaskStats(taskList);

    return (
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold">{stats.pending.length}</span>
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
                <span className="text-3xl font-bold text-destructive">{stats.overdue.length}</span>
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
                <span className="text-3xl font-bold text-success">{stats.completed.length}</span>
                <CheckCircle2 className="w-8 h-8 text-success opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* View Toggle */}
        <div className="flex justify-end">
          <div className="inline-flex rounded-lg border p-1 gap-1">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
            >
              <ListTodo className="w-4 h-4 mr-2" />
              List
            </Button>
            <Button
              variant={viewMode === "calendar" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("calendar")}
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Calendar
            </Button>
          </div>
        </div>

        {viewMode === "calendar" ? (
          <Card className="shadow-glow border-primary/20">
            <CardHeader>
              <CardTitle>{framework} Task Calendar</CardTitle>
              <CardDescription>View tasks by due date</CardDescription>
            </CardHeader>
            <CardContent>
              {renderCalendarView(taskList)}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Pending Tasks */}
            {stats.pending.length > 0 && (
              <Card className="shadow-glow border-primary/20">
                <CardHeader>
                  <CardTitle>Active Tasks</CardTitle>
                  <CardDescription>Tasks that need your attention</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {stats.pending.map((task) => {
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
                            <p className="text-sm text-muted-foreground">{task.description}</p>
                          )}
                          {task.due_date && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <CalendarIcon className="w-3 h-3" />
                              <span>Due {format(parseISO(task.due_date), "MMM dd, yyyy")}</span>
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
            {stats.completed.length > 0 && (
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Completed Tasks</CardTitle>
                  <CardDescription>Great work! Keep it up 🎉</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {stats.completed.map((task) => (
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
          </>
        )}

        {taskList.length === 0 && (
          <Card className="shadow-card">
            <CardContent className="py-12 text-center">
              <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No {framework} tasks yet</h3>
              <p className="text-muted-foreground mb-4">
                Get started by generating {framework} framework tasks or creating your own
              </p>
              <Button
                onClick={framework === "ACCEL" ? generateAccelTasks : generateBuildTasks}
                className="bg-gradient-gold hover:opacity-90"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Generate {framework} Tasks
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
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
            Task Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your personal credit repair (ACCEL) and credit building (BUILD) tasks
          </p>
        </div>
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
                Add a task to track your credit journey progress
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Task Title</Label>
                <Input
                  id="title"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="Pull credit reports"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Additional details..."
                />
              </div>
              <div>
                <Label htmlFor="track">Framework</Label>
                <Select
                  value={newTask.track}
                  onValueChange={(value) => setNewTask({ ...newTask, track: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select framework" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACCEL-A">ACCEL - Analyze</SelectItem>
                    <SelectItem value="ACCEL-C1">ACCEL - Challenge (Disputes)</SelectItem>
                    <SelectItem value="ACCEL-C2">ACCEL - Clean (Remove Negatives)</SelectItem>
                    <SelectItem value="ACCEL-E">ACCEL - Elevate (Build Score)</SelectItem>
                    <SelectItem value="ACCEL-L">ACCEL - Lock (Protect Credit)</SelectItem>
                    <SelectItem value="BUILD-B">BUILD - Business Formation</SelectItem>
                    <SelectItem value="BUILD-U">BUILD - Utilize Credit</SelectItem>
                    <SelectItem value="BUILD-I">BUILD - Income Verification</SelectItem>
                    <SelectItem value="BUILD-L">BUILD - Leverage Funding</SelectItem>
                    <SelectItem value="BUILD-D">BUILD - Diversify Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                />
              </div>
              <Button onClick={handleCreateTask} className="w-full bg-gradient-gold">
                Create Task
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="personal">
            Personal Tasks (ACCEL)
          </TabsTrigger>
          <TabsTrigger value="business">
            Business Tasks (BUILD)
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="personal" className="mt-6">
          {renderTaskList(accelTasks, "ACCEL")}
        </TabsContent>
        
        <TabsContent value="business" className="mt-6">
          {renderTaskList(buildTasks, "BUILD")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
