import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PendingApproval {
  id: string;
  type: "cs_draft" | "campaign_send" | "tier_change" | "other";
  draft_content: any;
  contact_id: string | null;
  conversation_id: string | null;
  created_by_n8n_workflow_key: string | null;
  status: string;
  created_at: string;
}

export function usePendingApprovals() {
  const [items, setItems] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("paige_pending_approvals")
      .select("id, type, draft_content, contact_id, conversation_id, created_by_n8n_workflow_key, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200);
    setItems((data as any) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("paige_pending_approvals_inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "paige_pending_approvals" },
        () => { refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return { items, loading, refresh };
}
