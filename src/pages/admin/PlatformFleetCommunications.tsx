// Operator (God/Super-Admin) Communications — the platform operator's OWN SMS inbox.
//
// §9 SEAM FIX (wave-s3): this route used to scope-switch the operator INTO their own
// tenant and render the TENANT Clients→Conversations inbox — merging operator comms with
// a tenant's data. That was an operator-vs-tenant seam violation. This surface reads the
// operator-PRIVATE store (operator_conversations / operator_messages, RLS-gated to
// is_platform_owner()) and sends through the operator A2P Messaging Service via the
// paige-operator-sms-send edge function. It NEVER reads any tenant's conversations, and no
// tenant can ever reach this data. The tenant inbox (/admin/clients-hub/conversations) is
// unchanged and remains the ONE tenant comms home (§18).
//
// Built on the shared premium primitive layer (@/components/ui/page); gold ONLY on Send
// (§11); realtime on both tables; motion-safe; token-only. Route gate: PlatformOwnerOnly.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { MessageSquare, Send, Loader2, Plus, Inbox, ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PageShell, PageHeader, SectionCard, EmptyState, StatePill } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

interface OperatorConversation {
  id: string;
  counterparty_phone: string;
  counterparty_name: string | null;
  last_message_at: string | null;
  last_direction: "inbound" | "outbound" | null;
  last_preview: string | null;
  unread_count: number;
  status: string;
}
interface OperatorMessage {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  error: string | null;
}

// E.164-ish guard for the "new conversation" composer. The server re-normalizes; this is
// only a friendly front-door check so we never fire a send at obvious garbage.
const PHONE_RE = /^\+?[0-9][0-9\s().-]{6,}$/;

function messageStatePill(m: OperatorMessage) {
  if (m.direction === "inbound") return null;
  if (m.status === "failed") return <StatePill state="error">Failed</StatePill>;
  if (m.status === "sent" || m.status === "delivered") return <StatePill state="success">Sent</StatePill>;
  if (m.status === "queued") return <StatePill state="pending">Queued</StatePill>;
  return null;
}

export default function PlatformFleetCommunications() {
  const reduce = useReducedMotion();
  const [conversations, setConversations] = useState<OperatorConversation[]>([]);
  const [messages, setMessages] = useState<OperatorMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false); // "new conversation" mode
  const [newTo, setNewTo] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    // Untyped handle: these tables post-date the generated types (mirrors the tenant inbox pattern).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("operator_conversations")
      .select("id, counterparty_phone, counterparty_name, last_message_at, last_direction, last_preview, unread_count, status")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) toast.error("Couldn't load conversations.");
    setConversations((data as OperatorConversation[]) ?? []);
    setLoading(false);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("operator_messages")
      .select("id, conversation_id, direction, body, status, created_at, sent_at, error")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) toast.error("Couldn't load that conversation.");
    setMessages((data as OperatorMessage[]) ?? []);
  }, []);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  // Realtime — refresh the list on any change, and the open thread's messages.
  useEffect(() => {
    const ch = supabase
      .channel("operator_comms")
      .on("postgres_changes", { event: "*", schema: "public", table: "operator_conversations" }, () => { void loadConversations(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "operator_messages" }, () => {
        void loadConversations();
        if (selectedId) void loadMessages(selectedId);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [loadConversations, loadMessages, selectedId]);

  // Keep a valid selection as the list streams in (skip while composing a new thread).
  useEffect(() => {
    if (composing) return;
    if (conversations.length === 0) { if (selectedId !== null) setSelectedId(null); return; }
    if (!selectedId || !conversations.some((c) => c.id === selectedId)) setSelectedId(conversations[0].id);
  }, [conversations, selectedId, composing]);

  useEffect(() => { if (selectedId) void loadMessages(selectedId); }, [selectedId, loadMessages]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages.length, reduce]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const selectConversation = (id: string) => {
    setComposing(false);
    setSelectedId(id);
    setBody("");
  };

  const startNew = () => {
    setComposing(true);
    setSelectedId(null);
    setMessages([]);
    setNewTo("");
    setBody("");
  };

  const send = async () => {
    const to = composing ? newTo.trim() : (selected?.counterparty_phone ?? "");
    const text = body.trim();
    if (!to) { toast.error("Enter a phone number to text."); return; }
    if (composing && !PHONE_RE.test(to)) { toast.error("Enter a valid phone number (E.164, e.g. +14705551234)."); return; }
    if (!text) { toast.error("Write a message first."); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("paige-operator-sms-send", {
        body: { to, body: text },
      });
      if (error) throw new Error(error.message);
      const res = data as { outcome?: string; reason?: string; conversation_id?: string } | null;
      const outcome = res?.outcome ?? "failed";
      if (outcome === "sent") {
        toast.success("Sent.");
        setBody("");
        setComposing(false);
        if (res?.conversation_id) setSelectedId(res.conversation_id);
        void loadConversations();
      } else if (outcome === "needs_config") {
        toast.error("Operator SMS isn't configured yet — add the Twilio operator credentials.");
      } else {
        toast.error(res?.reason ?? "Couldn't send that message.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send that message.");
    } finally {
      setSending(false);
    }
  };

  const threadTitle = (c: OperatorConversation) => c.counterparty_name?.trim() || c.counterparty_phone;

  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={MessageSquare}
        title="Communications"
        description="Your platform SMS line — messages to and from the operator number. Separate from every tenant's inbox."
        actions={
          <Button variant="outline" size="sm" onClick={startNew}>
            <Plus className="mr-1.5 h-4 w-4" /> New message
          </Button>
        }
      />

      <SectionCard>
        <div className="grid min-h-[28rem] grid-cols-1 gap-0 md:grid-cols-[20rem_1fr]">
          {/* ── Conversation list ─────────────────────────────────────────── */}
          <div className={cn("border-border md:border-r", (selectedId || composing) && "hidden md:block")}>
            {loading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Inbox}
                  title="No conversations yet"
                  description="When someone texts the operator number — or you start a new message — the thread shows up here."
                  action={<Button variant="outline" size="sm" onClick={startNew}><Plus className="mr-1.5 h-4 w-4" /> New message</Button>}
                />
              </div>
            ) : (
              <ul className="max-h-[32rem] overflow-y-auto p-2">
                {conversations.map((c) => {
                  const active = c.id === selectedId && !composing;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => selectConversation(c.id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                          active ? "bg-muted" : "hover:bg-muted/60",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{threadTitle(c)}</span>
                          {c.unread_count > 0 && (
                            <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">
                              {c.unread_count}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="truncate text-xs text-muted-foreground">
                            {c.last_direction === "outbound" ? "You: " : ""}{c.last_preview || "—"}
                          </span>
                          {c.last_message_at && (
                            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70">
                              {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ── Thread / composer pane ────────────────────────────────────── */}
          <div className={cn("flex min-h-[28rem] flex-col", !selectedId && !composing && "hidden md:flex")}>
            {composing ? (
              <div className="flex flex-1 flex-col p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setComposing(false)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="font-display text-sm font-semibold text-foreground">New message</h2>
                </div>
                <label htmlFor="op-new-to" className="mb-1 text-xs font-medium text-muted-foreground">To (phone number)</label>
                <Input
                  id="op-new-to"
                  value={newTo}
                  onChange={(e) => setNewTo(e.target.value)}
                  placeholder="+14705551234"
                  className="mb-3"
                  inputMode="tel"
                />
                <div className="flex-1" />
              </div>
            ) : selected ? (
              <div className="flex flex-1 flex-col">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setSelectedId(null)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{threadTitle(selected)}</p>
                    {selected.counterparty_name && (
                      <p className="truncate text-xs text-muted-foreground">{selected.counterparty_phone}</p>
                    )}
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
                  {messages.length === 0 ? (
                    <p className="pt-8 text-center text-sm text-muted-foreground">No messages in this thread yet.</p>
                  ) : (
                    messages.map((m) => {
                      const outbound = m.direction === "outbound";
                      return (
                        <div key={m.id} className={cn("flex", outbound ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[80%] rounded-xl border p-3 shadow-card",
                              outbound ? "rounded-br-md border-primary/25 bg-primary/[0.06]" : "rounded-bl-md border-border bg-card",
                            )}
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-[11px] text-muted-foreground">
                                {outbound ? "You" : threadTitle(selected)}
                                <span className="opacity-60">{" · "}{formatDistanceToNow(new Date(m.sent_at ?? m.created_at), { addSuffix: true })}</span>
                              </span>
                              <span className="ml-auto">{messageStatePill(m)}</span>
                            </div>
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{m.body || "—"}</p>
                            {m.status === "failed" && m.error && (
                              <p className="mt-1.5 text-[11px] text-destructive">{m.error}</p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <EmptyState
                  icon={MessageSquare}
                  title="Select a conversation"
                  description="Pick a thread on the left, or start a new message."
                />
              </div>
            )}

            {/* Composer — shared by reply + new message. Gold ONLY on Send (§11). */}
            {(composing || selected) && (
              <div className="border-t border-border p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write a message…"
                    rows={2}
                    className="min-h-[2.75rem] resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
                    }}
                  />
                  <Button variant="gold" onClick={() => void send()} disabled={sending} className="h-11 shrink-0">
                    {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                    Send
                  </Button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">A2P compliant — “Reply STOP to unsubscribe.” is appended automatically.</p>
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </PageShell>
  );
}
