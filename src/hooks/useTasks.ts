import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { TaskMetadata } from "@/lib/taskSchema";

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
      setTasks((data || []) as Task[]);
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

      setTasks((prev) => [...prev, data as Task]);
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

      setTasks((prev) => prev.map((t) => (t.id === id ? data as Task : t)));
      
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
        description: "Access your free annual credit reports from all three bureaus to identify errors and fraudulent accounts.",
        track: "ACCEL-A",
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit", "#FCRA", "#ConsumerReports"],
          priority: "P0" as const,
          estimated_minutes: 30,
          category: "Personal Credit" as const,
          instructions: "Visit AnnualCreditReport.com and request reports from Experian, Equifax, and TransUnion. Save PDFs for review.",
          checklist: [
            "Visit AnnualCreditReport.com",
            "Request Experian report",
            "Request Equifax report",
            "Request TransUnion report",
            "Save all reports as PDFs"
          ],
          resources: ["https://www.annualcreditreport.com"],
        },
      },
      {
        title: "Review Personal Credit Reports for Errors",
        description: "Systematically check each report for inaccuracies, late payments, incorrect balances, or identity theft.",
        track: "ACCEL-A",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit", "#FCRA", "#CreditRepair"],
          priority: "P0" as const,
          estimated_minutes: 90,
          category: "Personal Credit" as const,
          instructions: "Review each section: personal info, accounts, inquiries, public records. Document all errors with account numbers and dates.",
          checklist: [
            "Verify personal information accuracy",
            "Check all account statuses",
            "Review payment history",
            "Identify unauthorized inquiries",
            "Check for fraudulent accounts",
            "Document all errors found"
          ],
          dependencies: ["Pull All Three Personal Credit Reports"],
        },
      },
      {
        title: "Analyze Personal FICO Score Factors",
        description: "Understand the five factors affecting your FICO score and create an improvement strategy.",
        track: "ACCEL-A",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit", "#CreditEducation"],
          priority: "P1" as const,
          estimated_minutes: 45,
          category: "Personal Credit" as const,
          instructions: "Review FICO score breakdown: Payment History (35%), Amounts Owed (30%), Length of History (15%), Credit Mix (10%), New Credit (10%).",
          checklist: [
            "Check payment history percentage",
            "Calculate credit utilization ratio",
            "Review average age of accounts",
            "Assess credit mix diversity",
            "Count recent hard inquiries"
          ],
          metrics: {
            target_score_gain: 50,
          },
        },
      },
      
      // ACCEL-C1: Challenge (FCRA Disputes)
      {
        title: "Prepare FCRA Dispute Letters",
        description: "Create comprehensive dispute letters citing specific FCRA violations for each error found.",
        track: "ACCEL-C1",
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit", "#FCRA", "#CreditRepair"],
          priority: "P0" as const,
          estimated_minutes: 120,
          category: "Personal Credit" as const,
          instructions: "Use FCRA Section 611 to dispute inaccuracies. Include account details, specific errors, and request investigation within 30 days.",
          checklist: [
            "List all errors from each bureau",
            "Draft dispute letter for each error",
            "Include supporting documentation",
            "Cite FCRA Section 611",
            "Request verification within 30 days",
            "Keep copies of all letters"
          ],
          dependencies: ["Review Personal Credit Reports for Errors"],
          resources: ["FCRA Section 611 template"],
        },
      },
      {
        title: "Submit Personal Credit Disputes to Bureaus",
        description: "Send certified mail dispute letters to all three credit bureaus with tracking.",
        track: "ACCEL-C1",
        due_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit", "#FCRA", "#ConsumerReports"],
          priority: "P0" as const,
          estimated_minutes: 60,
          category: "Personal Credit" as const,
          instructions: "Mail via USPS certified mail with return receipt. Keep tracking numbers and delivery confirmations.",
          checklist: [
            "Print all dispute letters",
            "Make copies of supporting docs",
            "Address envelopes to each bureau",
            "Send via certified mail",
            "Save tracking numbers",
            "Save return receipts when received"
          ],
          dependencies: ["Prepare FCRA Dispute Letters"],
        },
      },
      {
        title: "Dispute Inaccurate Personal Hard Inquiries",
        description: "Challenge unauthorized or inaccurate hard inquiries using FCRA rights.",
        track: "ACCEL-C1",
        due_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit", "#FCRA", "#CreditRepair"],
          priority: "P1" as const,
          estimated_minutes: 45,
          category: "Personal Credit" as const,
          instructions: "Identify inquiries you didn't authorize. Send dispute letters to bureaus and creditors requesting removal under FCRA 604.",
          checklist: [
            "List all hard inquiries",
            "Identify unauthorized inquiries",
            "Draft inquiry dispute letters",
            "Mail to bureaus and creditors",
            "Track dispute responses"
          ],
          metrics: {
            target_score_gain: 10,
          },
        },
      },
      
      // ACCEL-C2: Clean (Remove Negatives)
      {
        title: "Follow Up on Personal Dispute Responses",
        description: "Review bureau investigation results and escalate unresolved disputes.",
        track: "ACCEL-C2",
        due_date: new Date(Date.now() + 51 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit", "#FCRA", "#CreditRepair"],
          priority: "P0" as const,
          estimated_minutes: 90,
          category: "Personal Credit" as const,
          instructions: "Bureaus must respond within 30 days. Review results, send follow-up disputes if errors remain, or escalate to CFPB.",
          checklist: [
            "Review all bureau responses",
            "Verify deletions on reports",
            "Identify remaining errors",
            "Draft follow-up disputes",
            "Consider CFPB complaint if needed"
          ],
          dependencies: ["Submit Personal Credit Disputes to Bureaus"],
        },
      },
      {
        title: "Request Goodwill Adjustments for Late Payments",
        description: "Contact creditors to request goodwill deletion of isolated late payments.",
        track: "ACCEL-C2",
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit", "#CreditRepair"],
          priority: "P2" as const,
          estimated_minutes: 60,
          category: "Personal Credit" as const,
          instructions: "Write polite goodwill letters to creditors explaining circumstances and requesting removal of late payment marks.",
          checklist: [
            "Identify accounts with late payments",
            "Draft goodwill request letters",
            "Explain extenuating circumstances",
            "Highlight positive payment history",
            "Send via certified mail",
            "Follow up in 2-3 weeks"
          ],
          metrics: {
            target_score_gain: 20,
          },
        },
      },
      
      // ACCEL-E: Elevate (Build Personal Credit Score)
      {
        title: "Optimize Personal Credit Card Utilization",
        description: "Lower credit card balances to under 30% (ideally 10%) to boost FICO score.",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit", "#PersonalFinance"],
          priority: "P0" as const,
          estimated_minutes: 60,
          category: "Personal Finance" as const,
          instructions: "Calculate total utilization: (Total Balances / Total Limits) × 100. Pay down high-balance cards first.",
          checklist: [
            "List all credit card balances",
            "List all credit card limits",
            "Calculate utilization percentage",
            "Prioritize high-utilization cards",
            "Make extra payments to reduce balances",
            "Monitor utilization weekly"
          ],
          metrics: {
            target_utilization_pct: 10,
            target_score_gain: 30,
          },
        },
      },
      {
        title: "Set Up Automatic Personal Bill Payments",
        description: "Enable autopay for all credit cards and loans to ensure 100% on-time payments.",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit", "#PersonalFinance"],
          priority: "P0" as const,
          estimated_minutes: 45,
          category: "Personal Finance" as const,
          instructions: "Set up autopay for minimum payment or full balance. Ensure sufficient funds in checking account.",
          checklist: [
            "Log into each creditor account",
            "Enable autopay feature",
            "Choose payment amount (min or full)",
            "Set payment date before due date",
            "Verify autopay confirmation emails",
            "Add calendar reminders to check balance"
          ],
          metrics: {
            target_score_gain: 50,
          },
        },
      },
      {
        title: "Create Personal Debt Payoff Plan",
        description: "Use debt avalanche or snowball method to eliminate personal debt strategically.",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalFinance", "#Budgeting"],
          priority: "P1" as const,
          estimated_minutes: 90,
          category: "Personal Finance" as const,
          instructions: "Avalanche: Pay highest APR first. Snowball: Pay smallest balance first. Choose based on psychology and math.",
          checklist: [
            "List all debts with balances and APRs",
            "Choose avalanche or snowball method",
            "Calculate minimum payments",
            "Determine extra payment amount",
            "Create payment schedule",
            "Set up automatic extra payments"
          ],
        },
      },
      {
        title: "Request Personal Credit Limit Increases",
        description: "Request credit limit increases without hard inquiries to improve utilization ratio.",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit"],
          priority: "P2" as const,
          estimated_minutes: 30,
          category: "Personal Credit" as const,
          instructions: "Contact issuers after 6+ months of on-time payments. Request soft inquiry limit increase.",
          checklist: [
            "Identify cards held 6+ months",
            "Call or use online request form",
            "Ask for soft inquiry only",
            "Provide updated income if asked",
            "Track new limits",
            "Avoid new spending"
          ],
          metrics: {
            target_utilization_pct: 10,
            target_score_gain: 15,
          },
        },
      },
      
      // Personal Finance & Budgeting
      {
        title: "Create Monthly Personal Budget",
        description: "Build a comprehensive budget tracking income, expenses, savings, and debt payments.",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalFinance", "#Budgeting"],
          priority: "P1" as const,
          estimated_minutes: 120,
          category: "Personal Finance" as const,
          instructions: "Use 50/30/20 rule: 50% needs, 30% wants, 20% savings/debt. Track every expense for accurate budgeting.",
          checklist: [
            "Calculate monthly net income",
            "List all fixed expenses",
            "Track variable expenses for 30 days",
            "Allocate 20% to savings/debt",
            "Use budgeting app or spreadsheet",
            "Review and adjust monthly"
          ],
        },
      },
      {
        title: "Build Emergency Savings Fund",
        description: "Save 3-6 months of expenses in a high-yield savings account for financial security.",
        track: "ACCEL-E",
        due_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalFinance", "#Savings"],
          priority: "P1" as const,
          estimated_minutes: 60,
          category: "Personal Finance" as const,
          instructions: "Open high-yield savings account. Set up automatic transfers. Start with $1000, then build to 3-6 months expenses.",
          checklist: [
            "Calculate monthly expenses",
            "Open high-yield savings account",
            "Set initial goal of $1000",
            "Set up automatic weekly/monthly transfers",
            "Track progress toward 3-6 month goal",
            "Only use for true emergencies"
          ],
          metrics: {
            target_savings_amount: 10000,
          },
        },
      },
      
      // ACCEL-L: Lock (Protect Personal Credit)
      {
        title: "Enable Personal Credit Monitoring Alerts",
        description: "Set up free credit monitoring to receive instant alerts for changes to your personal credit.",
        track: "ACCEL-L",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit", "#Monitoring"],
          priority: "P1" as const,
          estimated_minutes: 30,
          category: "Personal Credit" as const,
          instructions: "Sign up for Credit Karma, Experian free monitoring, or your bank's credit monitoring service.",
          checklist: [
            "Create Credit Karma account",
            "Enable Experian monitoring",
            "Check bank credit monitoring features",
            "Set up email/push alerts",
            "Configure alert preferences",
            "Test notifications"
          ],
          resources: ["https://www.creditkarma.com", "https://www.experian.com"],
        },
      },
      {
        title: "Freeze Personal Credit Reports",
        description: "Place security freezes with all three bureaus to prevent identity theft and unauthorized credit inquiries.",
        track: "ACCEL-L",
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit", "#Monitoring", "#ConsumerReports"],
          priority: "P2" as const,
          estimated_minutes: 45,
          category: "Personal Credit" as const,
          instructions: "Visit each bureau's website to place free security freeze. Save PINs in secure location for temporary lifts.",
          checklist: [
            "Freeze Experian credit report",
            "Freeze Equifax credit report",
            "Freeze TransUnion credit report",
            "Save all freeze PINs securely",
            "Document freeze confirmation numbers",
            "Test temporary lift process"
          ],
          resources: [
            "https://www.experian.com/freeze/center.html",
            "https://www.equifax.com/personal/credit-report-services/credit-freeze/",
            "https://www.transunion.com/credit-freeze"
          ],
        },
      },
      {
        title: "Review Personal Credit Reports Quarterly",
        description: "Check all three personal credit reports every 90 days to catch errors or fraud early.",
        track: "ACCEL-L",
        due_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
          tags: ["#PersonalCredit", "#FCRA", "#Monitoring"],
          priority: "P2" as const,
          estimated_minutes: 60,
          category: "Personal Credit" as const,
          instructions: "Stagger bureau requests throughout year. Review for new accounts, inquiries, or errors. Dispute immediately if found.",
          checklist: [
            "Request report from one bureau",
            "Review all sections carefully",
            "Compare to previous report",
            "Document any changes",
            "Dispute errors immediately",
            "Schedule next quarterly review"
          ],
        },
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
