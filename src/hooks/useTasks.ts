import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEffectiveUserId } from "@/lib/scopedUser";
import { useToast } from "@/hooks/use-toast";
import type { TaskMetadata } from "@/lib/taskSchema";
import { validatePersonalCreditTask } from "@/lib/taskKeywordFilter";
import {
  personalCreditTaskTemplates,
  templateToTaskData,
} from "@/lib/personalCreditTaskTemplates";
import {
  businessCreditTaskTemplates,
  businessTemplateToTaskData,
} from "@/lib/businessCreditTaskTemplates";
import { validateBusinessCreditTask } from "@/lib/businessTaskKeywordFilter";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  track: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  metadata: TaskMetadata | null;
  biz_id?: string | null;
}

export interface UseTasksOptions {
  /** 'self' (default) limits to current user's tasks; 'all' fetches every visible row (admin). */
  scope?: "self" | "all";
  /** Cap the number of rows returned. */
  limit?: number;
}

export const useTasks = (options: UseTasksOptions = {}) => {
  const { scope = "self", limit } = options;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchTasks = async () => {
    try {
      const __uid = await getEffectiveUserId();
      if (!__uid) return;
      const user = { id: __uid } as { id: string };
      setCurrentUserId(user.id);

      let query = supabase
        .from("tasks")
        .select("*")
        .order("due_date", { ascending: true, nullsFirst: false });

      if (scope === "self") query = query.eq("user_id", user.id);
      if (limit) query = query.limit(limit);

      const { data, error } = await query;

      if (error) throw error;
      setTasks((data || []) as unknown as Task[]);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      toast({
        title: "Error",
        description: "Failed to load tasks",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createTask = async (taskData: Partial<Task>, isBusinessMode: boolean = false) => {
    try {
      const __uid = await getEffectiveUserId();
      if (!__uid) throw new Error("Not authenticated");
      const user = { id: __uid } as { id: string };

      if (isBusinessMode) {
        // Business Credit Task validation
        const validationResult = validateBusinessCreditTask(
          taskData.title || "",
          taskData.description || ""
        );

        if (!validationResult.isAllowed) {
          if (validationResult.isDataFurnishing) {
            toast({
              title: "Data Furnishing Not Supported",
              description: "Data Furnishing features are not supported inside Paige.",
              variant: "destructive",
            });
          } else if (validationResult.shouldReroute) {
            toast({
              title: "Personal Credit Content Detected",
              description: "That belongs in Personal Credit—move it there?",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Invalid Business Task",
              description: validationResult.reason || "Please include business credit/funding keywords",
              variant: "destructive",
            });
          }
          return null;
        }

        // Ensure metadata includes proper category and tags for business
        let metadata: any = taskData.metadata || {};
        const category = metadata?.category;
        
        // Validate category is Business Credit, Funding, or Business Compliance
        const validCategories = ["Business Credit", "Funding", "Business Compliance"];
        if (category && !validCategories.includes(category)) {
          toast({
            title: "Invalid Category",
            description: "Use Business Credit, Funding, or Business Compliance categories only",
            variant: "destructive",
          });
          return null;
        }

        // Auto-tag if not already tagged
        if (!metadata.tags || (Array.isArray(metadata.tags) && metadata.tags.length === 0)) {
          let baseTag = "#BusinessCredit";
          if (category === "Funding") baseTag = "#Funding";
          else if (category === "Business Compliance") baseTag = "#Compliance";
          metadata = { ...metadata, tags: [baseTag] };
        }

        const { data, error } = await supabase
          .from("tasks")
          .insert([{
            user_id: user.id,
            title: taskData.title || "",
            description: taskData.description || null,
            status: taskData.status || "pending",
            track: taskData.track || null,
            due_date: taskData.due_date || null,
            metadata: metadata,
          }])
          .select()
          .single();

        if (error) throw error;

        setTasks((prev) => [...prev, data as unknown as Task]);
        toast({
          title: "Success",
          description: "Business task created successfully",
        });

        return data;
      } else {
        // Personal Credit Task validation
        const validationResult = validatePersonalCreditTask(
          taskData.title || "",
          taskData.description || ""
        );

        if (!validationResult.isAllowed) {
          toast({
            title: "Business Credit Content Detected",
            description: "That belongs in Business Credit/Funding—move it there?",
            variant: "destructive",
          });
          return null;
        }

        // Ensure metadata includes proper category and tags
        let metadata: any = taskData.metadata || {};
        const category = metadata?.category;
        
        // Validate category is Personal Credit or Personal Finance only
        if (category && category !== "Personal Credit" && category !== "Personal Finance") {
          toast({
            title: "Invalid Category",
            description: "That belongs in Business Credit/Funding—move it there?",
            variant: "destructive",
          });
          return null;
        }

        // Auto-tag if not already tagged
        if (!metadata.tags || (Array.isArray(metadata.tags) && metadata.tags.length === 0)) {
          const baseTag = category === "Personal Finance" ? "#PersonalFinance" : "#PersonalCredit";
          metadata = { ...metadata, tags: [baseTag] };
        }

        const { data, error } = await supabase
          .from("tasks")
          .insert([{
            user_id: user.id,
            title: taskData.title || "",
            description: taskData.description || null,
            status: taskData.status || "pending",
            track: taskData.track || null,
            due_date: taskData.due_date || null,
            metadata: metadata,
          }])
          .select()
          .single();

        if (error) throw error;

        setTasks((prev) => [...prev, data as unknown as Task]);

        return data;
      }
    } catch (error) {
      console.error("Error creating task:", error);
      toast({
        title: "Error",
        description: "Failed to create task",
        variant: "destructive",
      });
      return null;
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      setTasks((prev) => prev.map((t) => (t.id === id ? data as unknown as Task : t)));
      
      if (updates.status === "completed") {
        const isPersonalCredit = data.track?.startsWith("ACCEL");
        toast({
          title: "Task Completed! 🎉",
          description: isPersonalCredit 
            ? "Great progress on your personal credit journey" 
            : "Great progress on your business credit journey",
        });
      }

      return data;
    } catch (error) {
      console.error("Error updating task:", error);
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive",
      });
      return null;
    }
  };

  const deleteTask = async (id: string) => {
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", id);

      if (error) throw error;

      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast({
        title: "Success",
        description: "Task deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting task:", error);
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive",
      });
    }
  };

  const generateAccelTasks = async () => {
    try {
      const __uid = await getEffectiveUserId();
      if (!__uid) throw new Error("Not authenticated");
      const user = { id: __uid } as { id: string };

      // Check if tasks already exist
      const { data: existingTasks } = await supabase
        .from("tasks")
        .select("track")
        .eq("user_id", user.id)
        .like("track", "ACCEL%");

      if (existingTasks && existingTasks.length > 0) {
        toast({
          title: "Info",
          description: "Personal credit tasks already generated",
        });
        return;
      }

      // Convert templates to task data - strict Personal Credit/Finance filtering
      const tasksToCreate = personalCreditTaskTemplates
        .filter(template => 
          template.category === "Personal Credit" || 
          template.category === "Personal Finance"
        )
        .map((template) => {
          const taskData = templateToTaskData(template);
          
          // Validate each task against business keywords
          const validation = validatePersonalCreditTask(taskData.title, taskData.description || "");
          if (!validation.isAllowed) {
            console.warn(`Skipping task "${taskData.title}" - contains business keywords`);
            return null;
          }
          
          return {
            ...taskData,
            user_id: user.id,
            status: "pending" as const,
          };
        })
        .filter((task): task is NonNullable<typeof task> => task !== null);

      // Create all validated tasks
      const { error } = await supabase.from("tasks").insert(tasksToCreate);

      if (error) throw error;

      await fetchTasks();

      toast({
        title: "Success! 🎯",
        description: `Generated ${tasksToCreate.length} Personal Credit/Finance tasks`,
      });
    } catch (error) {
      console.error("Error generating personal credit tasks:", error);
      toast({
        title: "Error",
        description: "Failed to generate personal credit tasks",
        variant: "destructive",
      });
    }
  };

  const generateBuildTasks = async () => {
    try {
      const __uid = await getEffectiveUserId();
      if (!__uid) throw new Error("Not authenticated");
      const user = { id: __uid } as { id: string };

      // Check if tasks already exist
      const { data: existingTasks } = await supabase
        .from("tasks")
        .select("track")
        .eq("user_id", user.id)
        .like("track", "BUILD%");

      if (existingTasks && existingTasks.length > 0) {
        toast({
          title: "Info",
          description: "Business Credit tasks already generated",
        });
        return;
      }

      // Use templates and validate
      const validBusinessTemplates = businessCreditTaskTemplates.filter(template => {
        const taskData = businessTemplateToTaskData(template);
        const validation = validateBusinessCreditTask(taskData.title, taskData.description || "");
        
        if (!validation.isAllowed) {
          console.warn(`Skipping template ${template.id}: ${validation.reason}`);
          return false;
        }
        
        return true;
      });

      const buildTasks = validBusinessTemplates.map(businessTemplateToTaskData);

      // Create all tasks
      const { error } = await supabase.from("tasks").insert(
        buildTasks.map((task) => ({
          ...task,
          user_id: user.id,
          status: "pending" as const,
        }))
      );

      if (error) throw error;

      await fetchTasks();

      toast({
        title: "Success! 🚀",
        description: `Generated ${buildTasks.length} Business Credit/Funding tasks`,
      });
    } catch (error) {
      console.error("Error generating Business Credit tasks:", error);
      toast({
        title: "Error",
        description: "Failed to generate Business Credit tasks",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchTasks();

    // Set up realtime subscription
    const channel = supabase
      .channel("tasks-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /**
   * Validation-free create used by admin/operator + client workspace flows where
   * Personal-vs-Business-credit keyword filtering does not apply. Accepts an
   * explicit owner so admins can assign tasks to other users.
   */
  const createTaskRaw = async (
    taskData: Partial<Task> & { user_id?: string }
  ) => {
    try {
      const __uid = await getEffectiveUserId();
      if (!__uid) throw new Error("Not authenticated");
      const user = { id: __uid } as { id: string };

      const { data, error } = await supabase
        .from("tasks")
        .insert([{
          user_id: taskData.user_id || user.id,
          title: taskData.title || "",
          description: taskData.description ?? null,
          status: taskData.status || "pending",
          track: taskData.track ?? null,
          due_date: taskData.due_date ?? null,
          metadata: (taskData.metadata as any) ?? null,
        }])
        .select()
        .single();

      if (error) throw error;
      await fetchTasks();
      return data as unknown as Task;
    } catch (error) {
      console.error("Error creating task:", error);
      toast({
        title: "Error",
        description: "Failed to create task",
        variant: "destructive",
      });
      return null;
    }
  };

  return {
    tasks,
    loading,
    currentUserId,
    createTask,
    createTaskRaw,
    updateTask,
    deleteTask,
    generateAccelTasks,
    generateBuildTasks,
    refetch: fetchTasks,
  };
};
