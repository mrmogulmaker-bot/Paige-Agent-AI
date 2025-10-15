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
    const accelTaskTemplates = [
      // ACCEL-A: Analyze Personal Credit
      {
        title: "Pull All Three Personal Credit Reports",
        description: "Obtain your personal credit reports from Experian, Equifax, and TransUnion via AnnualCreditReport.com",
        track: "ACCEL-A",
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#FCRA", "#CreditReports"] },
      },
      {
        title: "Review Personal Credit Reports for Errors",
        description: "Identify inaccuracies, late payments, incorrect balances, or fraudulent accounts under FCRA guidelines",
        track: "ACCEL-A",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#FCRA", "#ErrorIdentification"] },
      },
      {
        title: "Analyze Personal FICO Score Factors",
        description: "Understand payment history, utilization, credit age, credit mix, and new credit impact on your personal score",
        track: "ACCEL-A",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#FICOScore", "#PersonalFinance"] },
      },
      
      // ACCEL-C1: Challenge (FCRA Disputes)
      {
        title: "Prepare FCRA Dispute Letters",
        description: "Document all personal credit errors and prepare dispute letters citing specific FCRA violations",
        track: "ACCEL-C1",
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#FCRA", "#DisputeLetters"] },
      },
      {
        title: "Submit Personal Credit Disputes to Bureaus",
        description: "Mail dispute letters to Experian, Equifax, and TransUnion via certified mail with return receipt",
        track: "ACCEL-C1",
        due_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#FCRA", "#BureauDisputes"] },
      },
      {
        title: "Dispute Inaccurate Personal Hard Inquiries",
        description: "Challenge unauthorized or inaccurate hard inquiries on your personal credit reports",
        track: "ACCEL-C1",
        due_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#FCRA", "#InquiryRemoval"] },
      },
      
      // ACCEL-C2: Clean (Remove Negatives)
      {
        title: "Follow Up on Personal Dispute Responses",
        description: "Review bureau investigation results and prepare follow-up or escalation letters",
        track: "ACCEL-C2",
        due_date: new Date(Date.now() + 51 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#FCRA", "#DisputeFollowUp"] },
      },
      {
        title: "Request Goodwill Adjustments for Late Payments",
        description: "Contact creditors to request goodwill deletion of late payments on personal accounts with good payment history",
        track: "ACCEL-C2",
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#PersonalFinance", "#GoodwillLetters"] },
      },
      
      // ACCEL-E: Elevate (Build Personal Credit Score)
      {
        title: "Optimize Personal Credit Card Utilization",
        description: "Reduce personal credit card balances to below 30% (ideally under 10%) of total limits to improve FICO score",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#UtilizationOptimization", "#FICOScore"] },
      },
      {
        title: "Set Up Automatic Personal Bill Payments",
        description: "Enable autopay for all personal credit cards, loans, and utilities to ensure 100% on-time payment history",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#PersonalFinance", "#PaymentHistory"] },
      },
      {
        title: "Create Personal Debt Payoff Plan",
        description: "Use avalanche or snowball method to strategically pay down personal credit card debt",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#PersonalFinance", "#DebtPayoff"] },
      },
      {
        title: "Request Personal Credit Limit Increases",
        description: "Contact credit card issuers to request limit increases (without hard inquiry) to improve utilization ratio",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#UtilizationOptimization", "#CreditLimits"] },
      },
      
      // Personal Finance & Budgeting
      {
        title: "Create Monthly Personal Budget",
        description: "Track income and expenses, allocate funds for savings, debt payoff, and emergency fund building",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalFinance", "#Budgeting", "#Savings"] },
      },
      {
        title: "Build Emergency Savings Fund",
        description: "Save 3-6 months of expenses in a high-yield savings account for personal financial security",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalFinance", "#Savings", "#EmergencyFund"] },
      },
      
      // ACCEL-L: Lock (Protect Personal Credit)
      {
        title: "Enable Personal Credit Monitoring Alerts",
        description: "Set up free monitoring via Credit Karma, Experian, or your credit card issuer for personal credit changes",
        track: "ACCEL-L",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#CreditMonitoring", "#FCRA"] },
      },
      {
        title: "Freeze Personal Credit Reports",
        description: "Place security freezes with all three bureaus to prevent unauthorized personal credit inquiries and identity theft",
        track: "ACCEL-L",
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#CreditMonitoring", "#IdentityProtection"] },
      },
      {
        title: "Review Personal Credit Reports Quarterly",
        description: "Check all three personal credit reports every 90 days to catch errors or fraud early",
        track: "ACCEL-L",
        due_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { tags: ["#PersonalCredit", "#CreditMonitoring", "#FCRA"] },
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
          description: "Personal credit tasks already generated",
        });
        return;
      }

      // Create all tasks with metadata tags
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
        description: `Generated ${accelTaskTemplates.length} personal credit & finance tasks`,
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
