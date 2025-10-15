import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
}

export const useTasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .order("due_date", { ascending: true, nullsFirst: false });

      if (error) throw error;
      setTasks(data || []);
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

  const createTask = async (taskData: Partial<Task>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("tasks")
        .insert([{
          user_id: user.id,
          title: taskData.title || "",
          description: taskData.description || null,
          status: taskData.status || "pending",
          track: taskData.track || null,
          due_date: taskData.due_date || null,
        }])
        .select()
        .single();

      if (error) throw error;

      setTasks((prev) => [...prev, data]);
      toast({
        title: "Success",
        description: "Task created successfully",
      });

      return data;
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

      setTasks((prev) => prev.map((t) => (t.id === id ? data : t)));
      
      if (updates.status === "completed") {
        toast({
          title: "Task Completed! 🎉",
          description: "Great progress on your BUILD journey",
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
    const accelTaskTemplates = [
      {
        title: "Pull All Three Credit Reports",
        description: "Obtain reports from Experian, Equifax, and TransUnion",
        track: "ACCEL-A",
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Review Reports for Errors",
        description: "Identify inaccuracies, outdated accounts, or fraudulent items",
        track: "ACCEL-A",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Prepare Dispute Letters",
        description: "Document all errors and prepare comprehensive dispute letters",
        track: "ACCEL-C1",
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Submit Disputes to Bureaus",
        description: "Send dispute letters to all three credit bureaus via certified mail",
        track: "ACCEL-C1",
        due_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Follow Up on Dispute Responses",
        description: "Review bureau responses and prepare follow-up actions",
        track: "ACCEL-C2",
        due_date: new Date(Date.now() + 51 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Set Up Payment Reminders",
        description: "Ensure all bills are paid on time to build positive history",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Monitor Credit Utilization",
        description: "Keep credit card balances under 30% of limits",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Enable Credit Monitoring",
        description: "Set up alerts for changes to your credit reports",
        track: "ACCEL-L",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if tasks already exist
      const { data: existingTasks } = await supabase
        .from("tasks")
        .select("track")
        .eq("user_id", user.id)
        .like("track", "ACCEL%");

      if (existingTasks && existingTasks.length > 0) {
        toast({
          title: "Info",
          description: "ACCEL tasks already generated",
        });
        return;
      }

      // Create all tasks
      const { error } = await supabase.from("tasks").insert(
        accelTaskTemplates.map((task) => ({
          ...task,
          user_id: user.id,
          status: "pending" as const,
        }))
      );

      if (error) throw error;

      await fetchTasks();

      toast({
        title: "Success! 🎯",
        description: `Generated ${accelTaskTemplates.length} ACCEL framework tasks`,
      });
    } catch (error) {
      console.error("Error generating ACCEL tasks:", error);
      toast({
        title: "Error",
        description: "Failed to generate ACCEL tasks",
        variant: "destructive",
      });
    }
  };

  const generateBuildTasks = async () => {
    const buildTaskTemplates = [
      {
        title: "Choose Business Structure",
        description: "Decide between LLC, Corporation, or other entity types",
        track: "BUILD-B",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "File Formation Documents",
        description: "Submit formation paperwork to your state",
        track: "BUILD-B",
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Obtain EIN from IRS",
        description: "Apply for your Employer Identification Number",
        track: "BUILD-B",
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Open Business Bank Account",
        description: "Separate personal and business finances",
        track: "BUILD-B",
        due_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Open Net-30 Vendor Accounts",
        description: "Establish credit with suppliers offering net-30 terms",
        track: "BUILD-U",
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Make Timely Payments",
        description: "Maintain perfect payment history on all vendor accounts",
        track: "BUILD-U",
        due_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Request Credit Reporting",
        description: "Ensure vendors report your payment history to credit bureaus",
        track: "BUILD-U",
        due_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Apply for Business Credit Card",
        description: "Get a business credit card to diversify credit mix",
        track: "BUILD-D",
        due_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if tasks already exist
      const { data: existingTasks } = await supabase
        .from("tasks")
        .select("track")
        .eq("user_id", user.id)
        .like("track", "BUILD%");

      if (existingTasks && existingTasks.length > 0) {
        toast({
          title: "Info",
          description: "BUILD tasks already generated",
        });
        return;
      }

      // Create all tasks
      const { error } = await supabase.from("tasks").insert(
        buildTaskTemplates.map((task) => ({
          ...task,
          user_id: user.id,
          status: "pending" as const,
        }))
      );

      if (error) throw error;

      await fetchTasks();

      toast({
        title: "Success! 🚀",
        description: `Generated ${buildTaskTemplates.length} BUILD framework tasks`,
      });
    } catch (error) {
      console.error("Error generating BUILD tasks:", error);
      toast({
        title: "Error",
        description: "Failed to generate BUILD tasks",
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

  return {
    tasks,
    loading,
    createTask,
    updateTask,
    deleteTask,
    generateAccelTasks,
    generateBuildTasks,
    refetch: fetchTasks,
  };
};
