// Conversations — the unified two-way client inbox (Comms C-1, §7 intelligent portal).
// One thread per client across every channel, reading the REAL public.messages jsonb
// substrate (schema-locked in migration 20260726190000). Paige detects an inbound,
// the action bus drafts the reply (status='draft', tagged below), and a non-technical
// coach one-click Approves → send-message fires (§36 draft-first + one-click approval).
//
// §11/§25 premium on @/components/ui/page + @/components/ui/select (NO native select);
// gold ONLY on Send/Approve; realtime on messages; motion-safe; token-only.
// §13 honesty: C-1 ships INERT — until a channel connector is wired there are no threads
// and no channel to send on; the crafted EmptyState says exactly that, and the composer
// disables rather than faking a send.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Mail, MessageSquare, MessageCircle, Instagram, Facebook, Phone,
  Inbox, Send, Pencil, Loader2, Sparkles, AlertTriangle, Paperclip,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PageShell, PageHeader, SectionCard, EmptyState, StatePill } from "@/components/ui/page";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// ── The locked NormalizedMessage row (real columns from public.messages) ──────────
type ChannelType = "email" | "sms" | "whatsapp" | "instagram" | "facebook" | "voice";
type Direction = "inbound" | "outbound";
type MsgStatus = "draft" | "queued" | "sent" | "delivered" | "failed" | "received" | "read";

interface MessageParty { address?: string; display_name?: string }
interface Attachment { url?: string; mime?: string; name?: string }
interface ClientJoin {
  first_name: string | null;
  last_name: string | null;
  entity_name: string | null;
  email: string | null;
}

interface MessageRow {
  id: string;
  thread_key: string;
  contact_id: string | null;
  connector_id: string | null;
  channel_type: ChannelType;
  direction: Direction;
  status: MsgStatus;
  sender: MessageParty | null;
  recipients: MessageParty[] | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  attachments: Attachment[] | null;
  provider_message_id: string | null;
  in_reply_to_provider_id: string | null;
  action_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  clients: ClientJoin | null;
}

interface Connector {
  id: string;
  channel_type: ChannelType;
  provider: string | null;
  display_name: string | null;
  from_address: string | null;
  from_name: string | null;
  inbound_address: string | null;
  status: "pending" | "active" | "disabled";
  active: boolean;
}

const MESSAGE_COLS =
  "id, thread_key, contact_id, connector_id, channel_type, direction, status, sender, recipients, " +
  "subject, body_text, body_html, attachments, provider_message_id, in_reply_to_provider_id, " +
  "action_id, error, sent_at, created_at, clients(first_name, last_name, entity_name, email)";

// ── Channel presentation (icon + label per channel_type) ──────────────────────────
const CHANNEL_ICON: Record<ChannelType, LucideIcon> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageCircle,
  instagram: Instagram,
  facebook: Facebook,
  voice: Phone,
};
const CHANNEL_LABEL: Record<ChannelType, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  voice: "Voice",
};

// ── Derivations off the real jsonb ────────────────────────────────────────────────
const partyLabel = (p?: MessageParty | null) =>
  p?.display_name?.trim() || p?.address?.trim() || "";

function contactName(m: MessageRow): string {
  const c = m.clients;
  const named = c?.entity_name?.trim() || [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim();
  if (named) return named;
  // Fall back to whoever is on the far side of the wire (read from jsonb).
  const far = m.direction === "inbound" ? m.sender : m.recipients?.[0];
  return partyLabel(far) || "Unknown contact";
}

const msgTime = (m: MessageRow) => new Date(m.sent_at ?? m.created_at).getTime();
const bodyPreview = (m: MessageRow) =>
  (m.body_text || (m.body_html ? m.body_html.replace(/<[^>]+>/g, " ") : "") || "").replace(/\s+/g, " ").trim();

// A thread = one client conversation (grouped by thread_key). Contact-first display (§36).
interface Thread {
  key: string;
  latest: MessageRow;
  messages: MessageRow[];
  name: string;
  channel: ChannelType;
  hasDraft: boolean;
  unread: boolean;
  contactId: string | null;
  connectorId: string | null;
  /** the client's address on the far side — where a reply is sent */
  toAddress: string;
}

function buildThreads(rows: MessageRow[]): Thread[] {
  const byKey = new Map<string, MessageRow[]>();
  for (const r of rows) {
    const arr = byKey.get(r.thread_key) ?? [];
    arr.push(r);
    byKey.set(r.thread_key, arr);
  }
  const threads: Thread[] = [];
  for (const [key, msgs] of byKey) {
    msgs.sort((a, b) => msgTime(a) - msgTime(b)); // chronological within a thread
    const latest = msgs[msgs.length - 1];
    const lastInbound = [...msgs].reverse().find((m) => m.direction === "inbound");
    const lastOutbound = [...msgs].reverse().find((m) => m.direction === "outbound");
    const toAddress =
      latest.clients?.email?.trim() ||
      lastInbound?.sender?.address?.trim() ||
      lastOutbound?.recipients?.[0]?.address?.trim() ||
      "";
    threads.push({
      key,
      latest,
      messages: msgs,
      name: contactName(latest),
      channel: latest.channel_type,
      hasDraft: msgs.some((m) => m.status === "draft"),
      // "unread" = the client's last inbound hasn't been sent past yet.
      unread: !!lastInbound && (lastInbound.status === "received" || lastInbound.status === "delivered"),
      contactId: latest.contact_id,
      connectorId: latest.connector_id,
      toAddress,
    });
  }
  threads.sort((a, b) => msgTime(b.latest) - msgTime(a.latest)); // newest conversation first
  return threads;
}

// ── Channel glyph chip ────────────────────────────────────────────────────────────
function ChannelGlyph({ channel, className }: { channel: ChannelType; className?: string }) {
  const Icon = CHANNEL_ICON[channel];
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground",
        className,
      )}
      title={CHANNEL_LABEL[channel]}
      aria-label={CHANNEL_LABEL[channel]}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

// ── Thread rail row ───────────────────────────────────────────────────────────────
function ThreadRow({ t, active, onClick }: { t: Thread; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        active
          ? "border-[hsl(var(--border-strong))] bg-muted"
          : "border-transparent hover:border-border hover:bg-muted/60",
      )}
    >
      <ChannelGlyph channel={t.channel} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{t.name}</span>
          {t.unread && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--ring))]"
              title="Awaiting a reply"
              aria-label="Awaiting a reply"
            />
          )}
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {formatDistanceToNow(new Date(t.latest.sent_at ?? t.latest.created_at), { addSuffix: false })}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {t.latest.direction === "outbound" && t.latest.status !== "draft" ? "You: " : ""}
            {bodyPreview(t.latest) || t.latest.subject || "—"}
          </span>
          {t.hasDraft && <StatePill state="building">Draft ready</StatePill>}
        </span>
      </span>
    </button>
  );
}

// ── Status pill mapping for a single message ─────────────────────────────────────
function messageStatusPill(m: MessageRow) {
  if (m.status === "failed") return <StatePill state="error">Failed</StatePill>;
  if (m.status === "sent" || m.status === "delivered" || m.status === "read")
    return <StatePill state="success">Sent</StatePill>;
  if (m.status === "queued") return <StatePill state="pending">Queued</StatePill>;
  return null;
}

// ── One message bubble (inbound left / outbound right) ────────────────────────────
function MessageBubble({
  m,
  onApprove,
  onEdit,
  approving,
}: {
  m: MessageRow;
  onApprove: (m: MessageRow) => void;
  onEdit: (m: MessageRow) => void;
  approving: boolean;
}) {
  const outbound = m.direction === "outbound";
  const isDraft = m.status === "draft";
  const body = bodyPreview(m);

  // A Paige draft is a distinct, approval-forcing card — never a plain sent bubble (§36).
  if (isDraft) {
    return (
      <div className="flex justify-end">
        <div className="w-full max-w-[85%] rounded-xl border border-[hsl(var(--gold)/0.45)] bg-[hsl(var(--gold)/0.06)] p-3.5 shadow-card">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--gold-dark))]" aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--gold-dark))]">
              Paige drafted — awaiting your approval
            </span>
          </div>
          {m.subject && <p className="mb-1 text-sm font-medium text-foreground">{m.subject}</p>}
          <p className="whitespace-pre-wrap text-sm text-foreground/90">{body || "—"}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="gold"
              size="sm"
              onClick={() => onApprove(m)}
              disabled={approving}
              className="h-8"
            >
              {approving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
              Approve &amp; send
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(m)} disabled={approving} className="h-8">
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl border p-3 shadow-card",
          outbound ? "border-primary/25 bg-primary/[0.06]" : "border-border bg-card",
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          <ChannelGlyph channel={m.channel_type} className="h-6 w-6 rounded-md" />
          <span className="text-[11px] text-muted-foreground">
            {outbound ? "You" : partyLabel(m.sender) || "Client"}
            <span className="opacity-60">
              {" · "}
              {formatDistanceToNow(new Date(m.sent_at ?? m.created_at), { addSuffix: true })}
            </span>
          </span>
          <span className="ml-auto">{messageStatusPill(m)}</span>
        </div>
        {m.subject && <p className="mb-0.5 text-sm font-medium text-foreground">{m.subject}</p>}
        <p className="whitespace-pre-wrap text-sm text-foreground/90">{body || "—"}</p>
        {!!m.attachments?.length && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <Paperclip className="h-3 w-3" /> {a.name || "attachment"}
              </span>
            ))}
          </div>
        )}
        {m.status === "failed" && m.error && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-destructive">
            <AlertTriangle className="h-3 w-3" /> {m.error}
          </p>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════════
export default function ClientsConversations() {
  const reduce = useReducedMotion();
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Composer state (reply into the selected thread)
  const [composeChannel, setComposeChannel] = useState<ChannelType | "">("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    // RLS scopes both queries to the caller's tenant (§9) — no client-side tenant filter.
    const [msgRes, connRes] = await Promise.all([
      supabase
        .from("messages")
        .select(MESSAGE_COLS)
        .order("sent_at", { ascending: false, nullsFirst: true })
        .limit(500),
      supabase
        .from("channel_connectors")
        .select("id, channel_type, provider, display_name, from_address, from_name, inbound_address, status, active")
        .order("created_at", { ascending: true }),
    ]);
    if (msgRes.error) toast.error("Couldn't load conversations.");
    setRows((msgRes.data as unknown as MessageRow[]) ?? []);
    setConnectors((connRes.data as unknown as Connector[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    // Realtime: any insert/update to a message re-syncs the inbox live (§7 two-way).
    const ch = supabase
      .channel("comms_inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load]);

  const threads = useMemo(() => buildThreads(rows), [rows]);
  const activeConnectors = useMemo(
    () => connectors.filter((c) => c.active && c.status === "active"),
    [connectors],
  );

  // Keep a valid selection as threads stream in.
  useEffect(() => {
    if (threads.length === 0) {
      if (selectedKey !== null) setSelectedKey(null);
      return;
    }
    if (!selectedKey || !threads.some((t) => t.key === selectedKey)) {
      setSelectedKey(threads[0].key);
    }
  }, [threads, selectedKey]);

  const selected = useMemo(
    () => threads.find((t) => t.key === selectedKey) ?? null,
    [threads, selectedKey],
  );

  // Default the composer channel to the thread's channel when a connector supports it.
  useEffect(() => {
    if (!selected) return;
    const supported = activeConnectors.some((c) => c.channel_type === selected.channel);
    setComposeChannel(supported ? selected.channel : activeConnectors[0]?.channel_type ?? "");
    setEditingDraftId(null);
    setSubject("");
    setBody("");
  }, [selectedKey, selected, activeConnectors]);

  // Scroll the thread to the newest message on change.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [selectedKey, selected?.messages.length, reduce]);

  const connectorFor = useCallback(
    (channel: ChannelType | "") => activeConnectors.find((c) => c.channel_type === channel) ?? null,
    [activeConnectors],
  );

  // ── One-click approve: send the existing draft row via the single outbound seam ──
  const approveDraft = async (m: MessageRow) => {
    if (!selected) return;
    if (!selected.toAddress) {
      toast.error("No client address on this thread to send to.");
      return;
    }
    setApprovingId(m.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-message", {
        body: {
          channel: m.channel_type,
          to: selected.toAddress,
          subject: m.subject ?? undefined,
          body: m.body_html || m.body_text || "",
          contact_id: m.contact_id ?? undefined,
          thread_key: m.thread_key,
          connector_id: m.connector_id ?? undefined,
          message_id: m.id, // patch THIS draft row → sent (idempotent)
        },
      });
      if (error || (data as { status?: string; error?: string } | null)?.status !== "sent") {
        throw new Error((data as { error?: string } | null)?.error || error?.message || "send_failed");
      }
      toast.success("Approved — Paige sent it.");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the reply.");
    } finally {
      setApprovingId(null);
    }
  };

  const editDraft = (m: MessageRow) => {
    setEditingDraftId(m.id);
    setComposeChannel(m.channel_type);
    setSubject(m.subject ?? "");
    setBody(m.body_text || (m.body_html ? m.body_html.replace(/<[^>]+>/g, "") : ""));
    bottomRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  };

  // ── Send a fresh reply (or an edited draft) into the selected thread ──────────────
  const send = async () => {
    if (!selected) return;
    if (!composeChannel) {
      toast.error("Connect a channel first — Paige needs a way to send.");
      return;
    }
    if (!selected.toAddress) {
      toast.error("No client address on this thread to send to.");
      return;
    }
    if (!body.trim()) {
      toast.error("Write a reply first.");
      return;
    }
    if (composeChannel === "email" && !subject.trim()) {
      toast.error("Add a subject for the email.");
      return;
    }
    const conn = connectorFor(composeChannel);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-message", {
        body: {
          channel: composeChannel,
          to: selected.toAddress,
          subject: composeChannel === "email" ? subject.trim() : undefined,
          body: body.trim(),
          contact_id: selected.contactId ?? undefined,
          thread_key: selected.key,
          connector_id: conn?.id ?? selected.connectorId ?? undefined,
          message_id: editingDraftId ?? undefined, // patch the edited draft, else fresh outbound
        },
      });
      if (error || (data as { status?: string; error?: string } | null)?.status !== "sent") {
        throw new Error((data as { error?: string } | null)?.error || error?.message || "send_failed");
      }
      toast.success("Sent.");
      setBody("");
      setSubject("");
      setEditingDraftId(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setSending(false);
    }
  };

  const noChannel = activeConnectors.length === 0;

  return (
    <PageShell width="full">
      <PageHeader
        variant="plain"
        title="Conversations"
        description="Every client thread across email, SMS, WhatsApp, and DMs — with Paige drafting the reply for your one-click approval."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr] lg:h-[calc(100dvh-15rem)]">
        {/* ── LEFT: thread rail ─────────────────────────────────────────────────── */}
        <SectionCard padded={false} className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Inbox</span>
            {!loading && threads.length > 0 && (
              <span className="text-[11px] tabular-nums text-muted-foreground">{threads.length}</span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2.5">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : threads.length === 0 ? (
              <EmptyState
                icon={Inbox}
                tone="brand"
                title="No conversations yet."
                description="Connect a channel and the moment a client emails or messages, their thread lands here — with Paige's draft reply ready for your approval."
                className="py-10"
              />
            ) : (
              <div className="space-y-1">
                {threads.map((t) => (
                  <ThreadRow key={t.key} t={t} active={t.key === selectedKey} onClick={() => setSelectedKey(t.key)} />
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── RIGHT: thread detail (scrolls) + composer (footer) ─────────────────── */}
        <SectionCard padded={false} className="flex min-h-0 flex-col overflow-hidden">
          {!selected ? (
            <div className="grid flex-1 place-items-center">
              <EmptyState
                icon={MessageCircle}
                tone="brand"
                title="Your unified inbox."
                description="Pick a conversation on the left to read the thread and approve Paige's drafted reply. One thread per client, so nothing gets missed."
              />
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
                <ChannelGlyph channel={selected.channel} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{selected.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {CHANNEL_LABEL[selected.channel]}
                    {selected.toAddress ? ` · ${selected.toAddress}` : ""}
                  </p>
                </div>
                {selected.hasDraft && <StatePill state="building">Draft ready</StatePill>}
              </div>

              {/* Messages (chronological) */}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {selected.messages.map((m) =>
                  reduce ? (
                    <MessageBubble
                      key={m.id}
                      m={m}
                      onApprove={approveDraft}
                      onEdit={editDraft}
                      approving={approvingId === m.id}
                    />
                  ) : (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <MessageBubble
                        m={m}
                        onApprove={approveDraft}
                        onEdit={editDraft}
                        approving={approvingId === m.id}
                      />
                    </motion.div>
                  ),
                )}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-border/60 bg-muted/30 p-3">
                {noChannel ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
                    No channel is connected yet — connect one in Setup and Paige can send from here.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {editingDraftId && (
                      <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--gold-dark))]">
                        <Pencil className="h-3 w-3" /> Editing Paige's draft — Send replaces and delivers it.
                        <button
                          type="button"
                          className="ml-1 underline hover:text-foreground"
                          onClick={() => {
                            setEditingDraftId(null);
                            setSubject("");
                            setBody("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={composeChannel} onValueChange={(v) => setComposeChannel(v as ChannelType)}>
                        <SelectTrigger className="h-9 w-[160px]">
                          <SelectValue placeholder="Channel" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeConnectors.map((c) => {
                            const Icon = CHANNEL_ICON[c.channel_type];
                            return (
                              <SelectItem key={c.id} value={c.channel_type}>
                                <span className="flex items-center gap-2">
                                  <Icon className="h-3.5 w-3.5" />
                                  {c.display_name?.trim() || CHANNEL_LABEL[c.channel_type]}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {composeChannel === "email" && (
                        <Input
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          placeholder="Subject"
                          className="h-9 flex-1 min-w-[180px]"
                        />
                      )}
                    </div>
                    <Textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={`Reply to ${selected.name}…`}
                      rows={3}
                      className="resize-none"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {selected.toAddress ? `To ${selected.toAddress}` : "No address on this thread"}
                      </span>
                      <Button
                        variant="gold"
                        size="sm"
                        onClick={send}
                        disabled={sending || !body.trim() || !selected.toAddress}
                        className="h-9"
                      >
                        {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                        {editingDraftId ? "Send edited" : "Send"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SectionCard>
      </div>
    </PageShell>
  );
}