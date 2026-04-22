import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, MessageSquare, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { markTicketSeen } from "@/hooks/useUnreadSupportCount";
import { TICKET_STATUS_LABEL, TICKET_STATUS_STYLES, PRIORITY_STYLES, ticketCategoryLabel, timeAgo, type TicketStatus, type TicketPriority } from "./supportTypes";

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  updated_at: string;
  resolution_notes: string | null;
}

interface Message {
  id: string;
  user_id: string | null;
  sender_type: "client" | "support" | "system";
  message: string;
  created_at: string;
  is_internal: boolean;
}

interface Props {
  ticketId: string | null;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTicketUpdated: () => void;
}

export function ClientTicketThread({ ticketId, userId, open, onOpenChange, onTicketUpdated }: Props) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !ticketId) return;
    void loadThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticketId]);

  const loadThread = async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const [{ data: t }, { data: msgs }] = await Promise.all([
        supabase.from("support_tickets").select("*").eq("id", ticketId).maybeSingle(),
        supabase.from("support_ticket_messages")
          .select("id,user_id,sender_type,message,created_at,is_internal")
          .eq("ticket_id", ticketId)
          .eq("is_internal", false)
          .order("created_at", { ascending: true }),
      ]);
      setTicket(t as Ticket | null);
      setMessages((msgs ?? []) as Message[]);
      // Mark this ticket as seen for the current user (clears unread badge)
      if (userId) {
        void markTicketSeen(ticketId, userId);
      }
    } finally {
      setLoading(false);
    }
  };

  const sendReply = async () => {
    if (!ticketId || !reply.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.from("support_ticket_messages").insert({
        ticket_id: ticketId,
        user_id: userId,
        sender_type: "client",
        message: reply.trim(),
        is_internal: false,
      });
      if (error) throw error;

      // If the ticket was waiting on the client, move it back to in_progress
      if (ticket?.status === "waiting_on_client") {
        await supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", ticketId);
      }
      setReply("");
      await loadThread();
      onTicketUpdated();
    } catch (err: any) {
      toast.error(err?.message || "Could not send reply");
    } finally {
      setSending(false);
    }
  };

  const markResolved = async () => {
    if (!ticketId) return;
    setResolving(true);
    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status: "resolved" })
        .eq("id", ticketId);
      if (error) throw error;
      toast.success("Ticket marked as resolved");
      await loadThread();
      onTicketUpdated();
    } catch (err: any) {
      toast.error(err?.message || "Could not update ticket");
    } finally {
      setResolving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground">{ticket?.ticket_number ?? "—"}</span>
            <span>{ticket?.subject ?? "Loading..."}</span>
          </SheetTitle>
          <SheetDescription>
            {ticket && (
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <Badge variant="outline" className={TICKET_STATUS_STYLES[ticket.status]}>
                  {TICKET_STATUS_LABEL[ticket.status]}
                </Badge>
                <Badge variant="outline">{ticketCategoryLabel(ticket.category)}</Badge>
                {ticket.priority === "urgent" && (
                  <Badge variant="outline" className={PRIORITY_STYLES.urgent}>
                    <AlertTriangle className="w-3 h-3 mr-1" /> Urgent
                  </Badge>
                )}
              </div>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {loading && <div className="text-sm text-muted-foreground">Loading conversation...</div>}
          {!loading && messages.length === 0 && (
            <div className="text-sm text-muted-foreground">No messages yet.</div>
          )}
          {messages.map((m) => {
            if (m.sender_type === "system") {
              return (
                <div key={m.id} className="flex justify-center">
                  <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
                    {m.message}
                  </div>
                </div>
              );
            }
            const isClient = m.sender_type === "client";
            return (
              <div key={m.id} className={`flex ${isClient ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-4 py-2.5 ${isClient ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                  <div className="text-xs opacity-70 mb-1 flex items-center gap-2">
                    {isClient ? "You" : (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> Support Team
                      </span>
                    )}
                    <span>•</span>
                    <span>{timeAgo(m.created_at)}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.message}</div>
                </div>
              </div>
            );
          })}
        </div>

        {ticket?.status === "resolved" && ticket.resolution_notes && (
          <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-md p-3 mb-3">
            <div className="text-xs font-semibold text-emerald-600 mb-1">RESOLUTION</div>
            <div className="text-sm text-foreground whitespace-pre-wrap">{ticket.resolution_notes}</div>
          </div>
        )}

        {ticket && ticket.status !== "closed" && (
          <div className="border-t border-border pt-3 space-y-2">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={ticket.status === "resolved" ? "Reopen this ticket by replying..." : "Reply to support..."}
              rows={3}
              className="resize-none"
            />
            <div className="flex justify-between gap-2">
              {ticket.status !== "resolved" && (
                <Button variant="outline" size="sm" onClick={markResolved} disabled={resolving}>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  {resolving ? "Updating..." : "Mark as Resolved"}
                </Button>
              )}
              <Button onClick={sendReply} disabled={sending || !reply.trim()} className="ml-auto">
                {sending ? "Sending..." : "Send Reply"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
