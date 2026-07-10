import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Customer side of the two-way action bus (§8). Staff/Paige file actions into
 * paige_customer_actions for a client; the client reads their own rows (RLS:
 * clients.linked_user_id = auth.uid()) and responds via customer_respond_to_action.
 * Both tables are realtime-published, so the list stays live as staff add actions
 * or the client responds.
 */
export type ActionResponseType = "accepted" | "declined" | "question" | "completed";

export interface ActionResponse {
  id: string;
  response_type: ActionResponseType;
  response_text: string | null;
  created_at: string;
}

export interface CustomerAction {
  id: string;
  action_type: "task" | "message" | "recommendation" | "nudge";
  title: string;
  body: string | null;
  payload_json: Record<string, unknown> | null;
  status: "proposed" | "customer_notified" | "customer_acted" | "customer_declined" | "expired";
  expires_at: string;
  created_at: string;
  paige_customer_responses: ActionResponse[];
}

const SELECT =
  "id, action_type, title, body, payload_json, status, expires_at, created_at, " +
  "paige_customer_responses(id, response_type, response_text, created_at)";

export function isActionOpen(a: CustomerAction): boolean {
  return (a.status === "customer_notified" || a.status === "proposed") &&
    new Date(a.expires_at).getTime() > Date.now();
}

export function useMyActions() {
  const [actions, setActions] = useState<CustomerAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactId, setContactId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setActions([]); setContactId(null); setLoading(false); return; }

    const { data: client } = await supabase
      .from("clients").select("id").eq("linked_user_id", user.id).maybeSingle();
    const cid = client?.id ?? null;
    setContactId(cid);
    if (!cid) { setActions([]); setLoading(false); return; }

    const { data } = await supabase
      .from("paige_customer_actions")
      .select(SELECT)
      .eq("contact_id", cid)
      .order("created_at", { ascending: false })
      .limit(100);

    setActions((data as CustomerAction[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Subscribe only once we know the contact_id, and filter to this client's rows
  // (per-user channel name) so a client's session doesn't re-query on every other
  // client's writes platform-wide.
  useEffect(() => {
    if (!contactId) return;
    const ch = supabase
      .channel(`my_actions_${contactId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "paige_customer_actions", filter: `contact_id=eq.${contactId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "paige_customer_responses", filter: `contact_id=eq.${contactId}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [contactId, refresh]);

  const respond = useCallback(
    async (actionId: string, responseType: ActionResponseType, text?: string) => {
      const { data, error } = await supabase.rpc("customer_respond_to_action", {
        p_action_id: actionId,
        p_response_type: responseType,
        p_response_text: text?.trim() ? text.trim() : null,
      });
      if (error) throw error;
      const res = data as { ok?: boolean; error?: string } | null;
      if (!res?.ok) {
        // Map server codes to client-friendly copy (never surface raw codes).
        const friendly: Record<string, string> = {
          ACTION_EXPIRED: "This item has expired — reach out to your team if you still need it.",
          FORBIDDEN: "You're not able to respond to this item.",
          ACTION_NOT_FOUND: "This item is no longer available.",
          INVALID_RESPONSE_TYPE: "That response isn't available.",
          UNAUTHENTICATED: "Please sign in again to respond.",
        };
        throw new Error(friendly[res?.error ?? ""] ?? "We couldn't submit your response. Please try again.");
      }
      await refresh();
      return res;
    },
    [refresh],
  );

  const open = actions.filter(isActionOpen);
  const past = actions.filter((a) => !isActionOpen(a));

  return { actions, open, past, loading, contactId, refresh, respond };
}
