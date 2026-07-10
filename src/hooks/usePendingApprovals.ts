import { useEffect, useState, useCallback, useId } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ApprovalQueueRow {
  id: string;
  type: string;
  category: string | null;
  status: string;
  priority: number | null;
  risk_level: string | null;
  summary: string | null;
  source: string | null;
  requires_role: string | null;
  tenant_id: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  assigned_to_user_id: string | null;
  submitted_by_user_id: string | null;
  sla_due_at: string | null;
  created_at: string;
  reviewed_at: string | null;
  sent_at: string | null;
  draft_content: any;
  metadata: any;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_lifecycle_stage: string | null;
  age_seconds: number;
  sla_state: "overdue" | "due_soon" | "on_track" | "closed" | "unscheduled";
}

// Back-compat alias kept so old call sites keep working.
export type PendingApproval = ApprovalQueueRow & {
  created_by_n8n_workflow_key: string | null;
};

export function usePendingApprovals(opts?: { scope?: "all" | "mine"; contactId?: string }) {
  const [items, setItems] = useState<ApprovalQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Unique per hook instance so two consumers with the same scope/contactId
  // (e.g. AdminLayout + the Your Paige command center, both scope:"all") never
  // share a realtime channel topic. Supabase dedupes channels by topic and hands
  // the 2nd caller the already-subscribed channel — its .on("postgres_changes")
  // then throws "cannot add callbacks after subscribe()", crashing the workspace.
  const instanceId = useId();

  const refresh = useCallback(async () => {
    let q = supabase
      .from("paige_approval_queue_v")
      .select("*")
      .eq("status", "pending")
      .order("priority", { ascending: true, nullsFirst: false })
      .order("sla_due_at", { ascending: true, nullsFirst: false })
      .limit(300);

    if (opts?.contactId) q = q.eq("contact_id", opts.contactId);
    if (opts?.scope === "mine") {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) q = q.eq("assigned_to_user_id", user.id);
    }

    const { data } = await q;
    setItems((data as ApprovalQueueRow[] | null) ?? []);
    setLoading(false);
  }, [opts?.scope, opts?.contactId]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel(`paige_approvals_${opts?.scope ?? "all"}_${opts?.contactId ?? "any"}_${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "paige_pending_approvals" },
        () => { refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh, opts?.scope, opts?.contactId, instanceId]);

  return { items, loading, refresh };
}
