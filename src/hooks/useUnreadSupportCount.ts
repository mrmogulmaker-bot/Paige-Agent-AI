import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the number of OPEN tickets (not resolved/closed) for the current user
 * that have at least one support reply created after the user's last_seen_at
 * for that ticket.
 */
export function useUnreadSupportCount(userId: string | null) {
  const [count, setCount] = useState(0);

  const refresh = async () => {
    if (!userId) {
      setCount(0);
      return;
    }
    try {
      // Pull the user's open tickets
      const { data: tickets } = await supabase
        .from("support_tickets")
        .select("id,status")
        .eq("user_id", userId)
        .not("status", "in", "(resolved,closed)");

      const ticketIds = (tickets ?? []).map((t: any) => t.id as string);
      if (ticketIds.length === 0) {
        setCount(0);
        return;
      }

      // Pull last_seen rows for those tickets
      const { data: seenRows } = await supabase
        .from("support_ticket_last_seen")
        .select("ticket_id,last_seen_at")
        .eq("user_id", userId)
        .in("ticket_id", ticketIds);

      const seenMap = new Map<string, string>();
      (seenRows ?? []).forEach((r: any) => seenMap.set(r.ticket_id, r.last_seen_at));

      // Pull latest support message per ticket
      const { data: msgs } = await supabase
        .from("support_ticket_messages")
        .select("ticket_id,created_at,sender_type,is_internal")
        .in("ticket_id", ticketIds)
        .eq("sender_type", "support")
        .eq("is_internal", false)
        .order("created_at", { ascending: false });

      const latestSupportPerTicket = new Map<string, string>();
      (msgs ?? []).forEach((m: any) => {
        if (!latestSupportPerTicket.has(m.ticket_id)) {
          latestSupportPerTicket.set(m.ticket_id, m.created_at);
        }
      });

      let unread = 0;
      latestSupportPerTicket.forEach((latestAt, ticketId) => {
        const seenAt = seenMap.get(ticketId);
        if (!seenAt || new Date(latestAt) > new Date(seenAt)) {
          unread += 1;
        }
      });
      setCount(unread);
    } catch {
      setCount(0);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Realtime: refresh when new messages arrive on any of the user's tickets
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`unread-support-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_ticket_messages" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_ticket_last_seen", filter: `user_id=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { count, refresh };
}

export async function markTicketSeen(ticketId: string, userId: string) {
  await supabase
    .from("support_ticket_last_seen")
    .upsert(
      { ticket_id: ticketId, user_id: userId, last_seen_at: new Date().toISOString() },
      { onConflict: "ticket_id,user_id" },
    );
}
