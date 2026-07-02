import { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Flag,
  Loader2,
  Sparkles,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Ship #3.6 — Customer side of Bidirectional Customer-Scoped Paige.
// Mounted at /workspace/paige/actions. Shows the timeline of actions that the
// customer's coach has surfaced through Paige, and lets the customer respond.

interface ActionResponse {
  id: string;
  response_type: "accepted" | "declined" | "question" | "completed";
  response_text: string | null;
  created_at: string;
}

interface Action {
  id: string;
  action_type: "task" | "message" | "recommendation" | "nudge";
  title: string;
  body: string | null;
  status:
    | "proposed"
    | "customer_notified"
    | "customer_acted"
    | "customer_declined"
    | "expired";
  expires_at: string;
  created_at: string;
  responses: ActionResponse[];
}

type ResponseKind = ActionResponse["response_type"];

const STATUS_LABEL: Record<Action["status"], string> = {
  proposed: "Proposed",
  customer_notified: "Awaiting your response",
  customer_acted: "Completed",
  customer_declined: "Declined",
  expired: "Expired",
};

export default function WorkspacePaigeActions() {
  const [contactId, setContactId] = useState<string | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{
    action: Action;
    kind: ResponseKind;
  } | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!contactId) return;
    const channel = supabase
      .channel(`paige-actions-${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "paige_customer_actions",
          filter: `contact_id=eq.${contactId}`,
        },
        () => void loadActions(contactId),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "paige_customer_responses",
          filter: `contact_id=eq.${contactId}`,
        },
        () => void loadActions(contactId),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId]);

  async function bootstrap() {
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("linked_user_id", u.user.id)
        .maybeSingle();
      if (!client?.id) {
        setLoading(false);
        return;
      }
      setContactId(client.id);
      await loadActions(client.id);
    } finally {
      setLoading(false);
    }
  }

  async function loadActions(cid: string) {
    const { data, error } = await supabase.rpc("list_pending_customer_actions", {
      p_contact_id: cid,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const payload = data as { ok?: boolean; actions?: Action[] } | null;
    if (payload?.ok) setActions(payload.actions ?? []);
  }

  function openResponse(action: Action, kind: ResponseKind) {
    setSelected({ action, kind });
    setNote("");
  }

  async function submitResponse() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("customer_respond_to_action", {
        p_action_id: selected.action.id,
        p_response_type: selected.kind,
        p_response_text: note.trim() || null,
      });
      if (error) throw error;
      const payload = data as { ok?: boolean; error?: string } | null;
      if (!payload?.ok) {
        toast.error(payload?.error ?? "Could not submit response.");
        return;
      }
      toast.success("Response sent to your coach.");
      setSelected(null);
      if (contactId) await loadActions(contactId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> Steps from your coach
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Recommendations and next steps your coach has shared through Paige.
            Accept, decline, ask a question, or mark complete — every response
            is delivered back to your coach.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : actions.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Inbox className="h-6 w-6" />
              Nothing here yet — your coach hasn't shared any steps.
            </div>
          ) : (
            <ul className="space-y-3">
              {actions.map((a) => {
                const disabled =
                  a.status === "customer_declined" ||
                  a.status === "customer_acted" ||
                  a.status === "expired";
                return (
                  <li key={a.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-sm">{a.title}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {a.action_type} ·{" "}
                          {new Date(a.created_at).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {STATUS_LABEL[a.status]}
                      </Badge>
                    </div>
                    {a.body && (
                      <p className="text-sm whitespace-pre-wrap">{a.body}</p>
                    )}
                    {a.responses.length > 0 && (
                      <ul className="text-xs text-muted-foreground space-y-1 border-l-2 pl-2">
                        {a.responses.map((r) => (
                          <li key={r.id}>
                            <span className="capitalize font-medium">
                              {r.response_type}
                            </span>
                            {r.response_text ? ` — ${r.response_text}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!disabled && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => openResponse(a, "accepted")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openResponse(a, "completed")}
                        >
                          <Flag className="h-3.5 w-3.5 mr-1" /> Mark complete
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openResponse(a, "question")}
                        >
                          <HelpCircle className="h-3.5 w-3.5 mr-1" /> Ask a
                          question
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openResponse(a, "declined")}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Decline
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {selected?.kind} — {selected?.action.title}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder={
              selected?.kind === "question"
                ? "What would you like to ask your coach?"
                : "Add an optional note for your coach…"
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelected(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={submitResponse} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Send response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
