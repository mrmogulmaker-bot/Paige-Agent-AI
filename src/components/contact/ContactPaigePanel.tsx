import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Plus,
  Trash2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Ship #3.5 + #3.6 — Customer-Scoped Paige (coach/admin view).
//   Ask Paige (read-only, consent-gated grounded answers).
//   Actions   (two-phase §181: coach proposes, Paige composes,
//              customer accepts/declines/questions/completes).

interface Props {
  contactId: string;
}

type ActionType = "task" | "message" | "recommendation" | "nudge";

interface DraftAction {
  action_type: ActionType;
  title: string;
  body: string;
}

interface AdminActionRow {
  id: string;
  action_type: ActionType;
  title: string;
  body: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  responses: Array<{
    id: string;
    response_type: string;
    response_text: string | null;
    created_at: string;
  }>;
}

const STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  customer_notified: "Sent",
  customer_acted: "Client acted",
  customer_declined: "Declined",
  expired: "Expired",
};

function emptyDraft(): DraftAction {
  return { action_type: "recommendation", title: "", body: "" };
}

export function ContactPaigePanel({ contactId }: Props) {
  return (
    <Tabs defaultValue="ask" className="space-y-4">
      <TabsList>
        <TabsTrigger value="ask">Paige · Chat</TabsTrigger>
        <TabsTrigger value="actions">Actions</TabsTrigger>
      </TabsList>
      <TabsContent value="ask">
        <AskPaigeCard contactId={contactId} />
      </TabsContent>
      <TabsContent value="actions">
        <ActionsCard contactId={contactId} />
      </TabsContent>
    </Tabs>
  );
}

type ToolCall = {
  id?: string;
  name: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  args?: Record<string, unknown>;
};
type Msg = { role: "user" | "assistant"; content: string; tool_calls?: ToolCall[] };

function ToolChip({ tc }: { tc: ToolCall }) {
  const label =
    tc.name === "create_task"
      ? "Task"
      : tc.name === "add_client_note"
      ? "Note"
      : tc.name;
  const preview =
    tc.name === "create_task"
      ? String((tc.result as { title?: string } | undefined)?.title ?? tc.args?.title ?? "")
      : tc.name === "add_client_note"
      ? String((tc.result as { preview?: string } | undefined)?.preview ?? tc.args?.content ?? "")
      : "";
  const shortPreview = preview.length > 48 ? preview.slice(0, 45) + "…" : preview;
  if (tc.ok) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-[#CFAE70]/40 bg-[#CFAE70]/10 px-2 py-0.5 text-[11px] font-medium text-[#8a6f3d]"
        title={`Tool call succeeded: ${tc.name}`}
      >
        <span aria-hidden>✓</span>
        <span>{label}{shortPreview ? ` · ${shortPreview}` : ""}</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700"
      title={tc.error ?? "Tool call failed"}
    >
      <span aria-hidden>⚠</span>
      <span>{label} failed</span>
    </span>
  );
}

function AskPaigeCard({ contactId }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [consentBlocked, setConsentBlocked] = useState(false);
  const [surfaces, setSurfaces] = useState<string[]>([]);
  const [loadId, setLoadId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("this client");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [resumedCount, setResumedCount] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Reset transient chat when switching contacts (§116: no literals; contactId only).
  useEffect(() => {
    setMessages([]);
    setConsentBlocked(false);
    setSurfaces([]);
    setLoadId(null);
    setInput("");
    setThreadId(null);
    setResumedCount(0);
  }, [contactId]);

  // Pull display name from RLS-scoped clients row (same fields the page already reads).
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("first_name, last_name, entity_name")
        .eq("id", contactId)
        .maybeSingle();
      if (!alive || !data) return;
      const full = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();
      setDisplayName(full || data.entity_name || "this client");
    })();
    return () => {
      alive = false;
    };
  }, [contactId]);

  // Task #20: on mount / contact-switch, resume active thread for (caller, contact, lens='coach').
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) return;
      const { data: thread } = await supabase
        .from("paige_chat_threads")
        .select("id")
        .eq("caller_user_id", uid)
        .eq("contact_id", contactId)
        .eq("lens", "coach")
        .eq("is_archived", false)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive || !thread?.id) return;
      const { data: turns } = await supabase
        .from("paige_chat_turns")
        .select("role, content, tool_calls, created_at")
        .eq("thread_id", thread.id)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true });
      if (!alive) return;
      setThreadId(thread.id);
      const restored: Msg[] = (turns ?? []).map((t) => ({
        role: t.role === "assistant" ? "assistant" : "user",
        content: String(t.content),
        tool_calls: Array.isArray((t as { tool_calls?: unknown }).tool_calls)
          ? ((t as { tool_calls?: ToolCall[] }).tool_calls as ToolCall[])
          : undefined,
      }));
      setMessages(restored);
      setResumedCount(restored.length);
    })();
    return () => {
      alive = false;
    };
  }, [contactId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, running]);

  async function send() {
    const q = input.trim();
    if (!q || running) return;
    const nextMessages: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(nextMessages);
    setInput("");
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "paige-context-router",
        {
          body: {
            contact_id: contactId,
            user_prompt: q,
            scopes: ["contact"],
            thread_id: threadId ?? undefined,
          },
        },
      );

      if (error) {
        let parsed: { error?: string; message?: string } | null = null;
        try {
          const resp = (error as { context?: { response?: Response } }).context
            ?.response;
          if (resp && typeof resp.json === "function") {
            parsed = await resp.clone().json();
          }
        } catch {
          /* ignore parse failure */
        }
        if (parsed?.error === "CONSENT_NOT_GRANTED") {
          setConsentBlocked(true);
          return;
        }
        throw error;
      }

      if (!data?.ok) {
        if (data?.error === "CONSENT_NOT_GRANTED") {
          setConsentBlocked(true);
          return;
        }
        toast.error(data?.message ?? data?.error ?? "Paige could not answer.");
        return;
      }

      setMessages([
        ...nextMessages,
        { role: "assistant", content: data.answer ?? "" },
      ]);
      setSurfaces(data.surfaces_used ?? []);
      setLoadId(data.load_id ?? null);
      if (data.thread_id && data.thread_id !== threadId) {
        setThreadId(data.thread_id as string);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRunning(false);
    }
  }

  function copyPortalLink() {
    const url = `${window.location.origin}/portal/settings`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Portal link copied — share with client."),
      () => toast.error("Could not copy link."),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          Paige · Coach chat
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Multi-turn, grounded in this contact's consented, RLS-scoped record.
          Credit monitoring + building only — never credit repair (Doctrine §194).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {consentBlocked ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm space-y-3">
            <div className="flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500 mt-0.5" />
              <div className="space-y-1">
                <div className="font-medium">
                  Waiting on {displayName}'s workspace consent
                </div>
                <div className="text-muted-foreground">
                  This client hasn't enabled Paige to share their workspace with
                  you yet. Ask them to enable it in their portal settings, or
                  reach out via their preferred channel.
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConsentBlocked(false)}
              >
                Retry
              </Button>
              <Button variant="outline" size="sm" onClick={copyPortalLink}>
                Copy portal link
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              className="max-h-[420px] min-h-[160px] overflow-y-auto rounded-md border bg-muted/20 p-3 space-y-3"
            >
              {resumedCount > 0 && (
                <div className="text-[11px] text-muted-foreground italic border-b pb-2">
                  Continuing where you left off — {resumedCount} prior message
                  {resumedCount === 1 ? "" : "s"}.
                </div>
              )}
              {messages.length === 0 && !running && (
                <div className="text-xs text-muted-foreground">
                  Ask about funding readiness, credit posture, next best action —
                  Paige only reads what this client has consented to share.
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "text-sm whitespace-pre-wrap"
                      : "text-sm whitespace-pre-wrap rounded-md bg-background border p-2"
                  }
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                    {m.role === "user" ? "You" : "Paige"}
                  </div>
                  {m.content}
                </div>
              ))}
              {running && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Paige is thinking…
                </div>
              )}
            </div>

            <Textarea
              placeholder="e.g. Summarize where this client stands on funding readiness."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={3}
              disabled={running}
            />
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-muted-foreground">
                ⌘/Ctrl + Enter to send
              </div>
              <Button onClick={send} disabled={running || !input.trim()}>
                {running ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send
              </Button>
            </div>

            {surfaces.length > 0 && (
              <div className="flex flex-wrap gap-1 items-center text-xs text-muted-foreground">
                <ShieldCheck className="h-3 w-3" />
                <span>Sources (latest turn):</span>
                {surfaces.map((s) => (
                  <Badge key={s} variant="outline" className="text-[10px]">
                    {s}
                  </Badge>
                ))}
                {loadId && (
                  <span className="ml-auto opacity-60">
                    load: {loadId.slice(0, 8)}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ActionsCard({ contactId }: Props) {
  const [consent, setConsent] = useState<boolean | null>(null);
  const [drafts, setDrafts] = useState<DraftAction[]>([emptyDraft()]);
  const [proposing, setProposing] = useState(false);
  const [rows, setRows] = useState<AdminActionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadConsent();
    void loadRows();
  }, [contactId]);

  useEffect(() => {
    const ch = supabase
      .channel(`admin-actions-${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "paige_customer_actions",
          filter: `contact_id=eq.${contactId}`,
        },
        () => void loadRows(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "paige_customer_responses",
          filter: `contact_id=eq.${contactId}`,
        },
        () => void loadRows(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [contactId]);

  async function loadConsent() {
    const { data } = await supabase
      .from("clients")
      .select("paige_shared_context_consent")
      .eq("id", contactId)
      .maybeSingle();
    setConsent(!!data?.paige_shared_context_consent);
  }

  async function loadRows() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc(
        "list_pending_customer_actions",
        { p_contact_id: contactId },
      );
      if (error) throw error;
      const payload = data as { ok?: boolean; actions?: AdminActionRow[] } | null;
      if (payload?.ok) setRows(payload.actions ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(i: number, patch: Partial<DraftAction>) {
    setDrafts((d) => d.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addDraft() {
    setDrafts((d) => [...d, emptyDraft()]);
  }
  function removeDraft(i: number) {
    setDrafts((d) => (d.length === 1 ? d : d.filter((_, idx) => idx !== i)));
  }

  async function propose() {
    const cleaned = drafts
      .map((d) => ({ ...d, title: d.title.trim(), body: d.body.trim() }))
      .filter((d) => d.title.length > 0);
    if (cleaned.length === 0) {
      toast.error("Add at least one action with a title.");
      return;
    }
    setProposing(true);
    try {
      const { data, error } = await supabase.rpc("admin_propose_paige_actions", {
        p_contact_id: contactId,
        p_actions: cleaned,
      });
      if (error) throw error;
      const payload = data as
        | { ok?: boolean; count?: number; error?: string; message?: string }
        | null;
      if (!payload?.ok) {
        toast.error(payload?.message ?? payload?.error ?? "Could not propose actions.");
        return;
      }
      toast.success(`Sent ${payload.count ?? cleaned.length} action(s) to client.`);
      setDrafts([emptyDraft()]);
      await loadRows();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setProposing(false);
    }
  }

  const consentBlocked = consent === false;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" /> Propose Paige actions
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Paige delivers these to the client's workspace. They can accept,
            decline, ask a question, or mark complete — responses stream back to
            you. Two-phase (§181): you review the wording before it lands.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {consentBlocked && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500 mt-0.5" />
              <div>
                <div className="font-medium">Consent required</div>
                <div className="text-muted-foreground">
                  This client has not enabled coach-brokered actions. Ask them
                  to turn on coach access in their workspace.
                </div>
              </div>
            </div>
          )}

          {drafts.map((d, i) => (
            <div key={i} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Select
                  value={d.action_type}
                  onValueChange={(v) =>
                    updateDraft(i, { action_type: v as ActionType })
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recommendation">Recommendation</SelectItem>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="message">Message</SelectItem>
                    <SelectItem value="nudge">Nudge</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Title (e.g. Pay down utilization below 30%)"
                  value={d.title}
                  onChange={(e) => updateDraft(i, { title: e.target.value })}
                />
                {drafts.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeDraft(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Textarea
                placeholder="Details for the client…"
                value={d.body}
                onChange={(e) => updateDraft(i, { body: e.target.value })}
                rows={3}
              />
            </div>
          ))}

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={addDraft}>
              <Plus className="h-4 w-4 mr-1" /> Add another
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onClick={propose}
                      disabled={proposing || consentBlocked}
                    >
                      {proposing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Send to client
                    </Button>
                  </span>
                </TooltipTrigger>
                {consentBlocked && (
                  <TooltipContent>
                    Client has not consented to coach-brokered actions.
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No actions proposed yet.
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((a) => (
                <li key={a.id} className="rounded-md border p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{a.title}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {a.action_type} ·{" "}
                        {new Date(a.created_at).toLocaleString()}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {STATUS_LABEL[a.status] ?? a.status}
                    </Badge>
                  </div>
                  {a.body && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {a.body}
                    </p>
                  )}
                  {a.responses.length > 0 && (
                    <ul className="text-xs text-muted-foreground space-y-1 border-l-2 pl-2 mt-1">
                      {a.responses.map((r) => (
                        <li key={r.id}>
                          <span className="capitalize font-medium">
                            {r.response_type}
                          </span>
                          {r.response_text ? ` — ${r.response_text}` : ""}
                          <span className="opacity-60">
                            {" "}
                            · {new Date(r.created_at).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ContactPaigePanel;
