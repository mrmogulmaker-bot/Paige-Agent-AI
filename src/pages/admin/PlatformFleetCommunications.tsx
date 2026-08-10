// Operator (God/Super-Admin) Communications — the platform operator's OWN SMS inbox.
//
// §9 SEAM (wave-s3): this surface reads the operator-PRIVATE store
// (operator_conversations / operator_messages, RLS-gated to is_platform_owner()) and sends
// through the operator A2P Messaging Service via the paige-operator-sms-send edge function.
// It NEVER reads any tenant's conversations, and no tenant can ever reach this data. The
// tenant inbox (/admin/clients-hub/conversations) is the ONE tenant comms home (§18).
//
// §18 PHASE 2 (shell extraction): this container consumes the SAME three-column conversation
// shell the tenant Client-Hub inbox consumes (ConversationsThreeColumnShell · ThreadList ·
// RichComposer · ContactPanel), driven by an OPERATOR adapter over operator_conversations /
// operator_messages. Phase-1 gave the operator store tenant-parity columns (labels /
// snoozed_until / archived_at on conversations; channel_type / search_tsv on messages), so the
// operator surface now gets FULL parity — three-column rich shell with search, filters, sort,
// density, multi-select, bulk (archive/snooze/label/mark-read), keyboard nav, a contact panel,
// and the rich-composer core — instead of the old bare 2-column surface. No fork: the shell is
// scope-agnostic; the operator turns OFF (§13, never fakes) the composer affordances its SMS
// send path genuinely lacks and renders the MINIMAL contact panel (an operator SMS counterparty
// has no deals/billing/portal).
//
// Built on the shared premium primitive layer (@/components/ui/page); gold ONLY on Send (§11);
// realtime on both tables; motion-safe; token-only. Route gate: PlatformOwnerOnly.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  MessageSquare, Plus, Inbox, ArrowLeft, MessageCircle, SearchX,
  Clock, Archive, ArchiveRestore, MessageCircleReply, PanelRight, Contact, Check,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PageShell, PageHeader, SectionCard, EmptyState, StatePill } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// §18 shared conversation primitives — the SAME message bubble + shell the tenant Client Hub
// inbox uses, so operator Fleet Comms reads as one continuous system (§6), not a fork.
import { MessageBubble } from "./conversations/MessageBubble";
import { ConversationsThreeColumnShell } from "./conversations/shell/ConversationsThreeColumnShell";
import { ConversationsThreadList } from "./conversations/shell/ConversationsThreadList";
import { ConversationsRichComposer } from "./conversations/shell/ConversationsRichComposer";
import { ConversationsContactPanel } from "./conversations/shell/ConversationsContactPanel";
import { ConversationsCallButton } from "./conversations/shell/ConversationsCallButton";
import { useVoiceDevice } from "@/lib/voice/VoiceDeviceProvider";
import type {
  ShellThread, ShellMessage, ThreadRowContext, SendingIdentity, MutOpts,
  ConversationsCapabilities, ConversationsListModel, ConversationsComposerModel,
} from "./conversations/shell/conversationsAdapter";
import {
  type ChannelType, type Label, type ThreadFilter,
  CHANNEL_ICON, CHANNEL_LABEL, LABEL_COLOR, LABEL_DOT, FILTER_LABEL,
  initialsFromName, avatarTint, isUntilReply, snoozePresets, SNOOZE_SENTINEL_UNTIL_REPLY,
} from "./conversations/inbox-shared";

// ── operator store rows (post-date the generated types; queried via `supabase as any`) ──
interface OperatorConversation {
  id: string;
  channel: "sms" | "voice";
  counterparty_phone: string;
  counterparty_name: string | null;
  last_message_at: string | null;
  last_direction: "inbound" | "outbound" | null;
  last_preview: string | null;
  unread_count: number;
  status: string;
  // Phase-1 tenant-parity columns
  labels: Label[] | null;
  snoozed_until: string | null;
  archived_at: string | null;
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
  channel_type: ChannelType | null; // Phase-1 (default 'sms')
  // Phase-4 call fields (schema-present on operator_messages; null for SMS + un-recorded calls, §13)
  call_duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
}

const CONV_COLS =
  "id, channel, counterparty_phone, counterparty_name, last_message_at, last_direction, " +
  "last_preview, unread_count, status, labels, snoozed_until, archived_at";
const MSG_COLS =
  "id, conversation_id, direction, body, status, created_at, sent_at, error, channel_type, " +
  "call_duration_seconds, recording_url, transcript";

// The operator's SINGLE sending identity — the master A2P messaging service (per operator-twilio).
// A single option → the composer renders no picker (showIdentity:false); the model stays honest.
const OPERATOR_IDENTITY: SendingIdentity = {
  id: "operator-a2p",
  label: "Operator SMS",
  sublabel: "A2P messaging service",
  channel: "sms",
};

// §13 — every composer affordance the operator SMS send path does NOT support today is OFF.
// The operator send is a plain body → paige-operator-sms-send: no Draft-with-Paige, no
// scheduling, no templates, no signature, no attachments, and no business contact panels.
// With every flag off the RichComposer renders down to the bare textarea + gold Send —
// byte-equivalent to the shipped operator composer, with the A2P note passed in.
const OPERATOR_CAPS: ConversationsCapabilities = {
  canDraftWithPaige: false,
  canSchedule: false,
  hasTemplates: false,
  hasSignature: false,
  hasAttachments: false,
  hasContactBusinessPanels: false,
};

// E.164-ish guard for the "new conversation" composer. The server re-normalizes; this is only a
// friendly front-door check so we never fire a send at obvious garbage.
const PHONE_RE = /^\+?[0-9][0-9\s().-]{6,}$/;

const OPERATOR_VIEWS: ThreadFilter[] = ["active", "snoozed", "archived", "all"];

function messageStatePill(m: OperatorMessage) {
  if (m.direction === "inbound") return null;
  if (m.status === "failed") return <StatePill state="error">Failed</StatePill>;
  if (m.status === "sent" || m.status === "delivered") return <StatePill state="success">Sent</StatePill>;
  if (m.status === "queued") return <StatePill state="pending">Queued</StatePill>;
  return null;
}

const threadTitle = (c: OperatorConversation) => c.counterparty_name?.trim() || c.counterparty_phone;
const isSnoozed = (c: OperatorConversation, now: number) =>
  !!c.snoozed_until && new Date(c.snoozed_until).getTime() > now;
const isArchived = (c: OperatorConversation) => !!c.archived_at;

// ── the OPERATOR minimal row (§13: name/preview/unread/labels/state — no per-row menus; the
//    rich tenant ThreadRow's deals/portal/CRM hover actions are genuinely N/A here). It MUST
//    set data-thread-key={thread.key} so the shell's keyboard nav can resolve the focused row. ─
function OperatorThreadRow({ thread, ctx }: { thread: ShellThread<OperatorConversation>; ctx: ThreadRowContext }) {
  const { active, cursored, selected, selectionActive, onClick, onToggleSelect, density } = ctx;
  const compact = density === "compact";
  const c = thread.raw;
  const name = thread.title;
  const unread = thread.unread > 0;
  const labels = thread.labels ?? [];
  const now = Date.now();
  const snoozed = isSnoozed(c, now);
  const archived = isArchived(c);
  const ts = thread.lastMessageAt;
  const Icon = CHANNEL_ICON[thread.channel] ?? MessageSquare;

  return (
    <div
      role="button"
      tabIndex={0}
      data-thread-key={thread.key}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      aria-current={active ? "true" : undefined}
      aria-selected={selected}
      className={cn(
        "group relative flex w-full cursor-pointer items-start rounded-lg border text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        compact ? "gap-2.5 px-3 py-1.5" : "gap-3 px-3 py-2.5",
        active
          ? "border-[hsl(var(--border-strong))] bg-muted before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-[hsl(var(--primary))] before:content-['']"
          : selected
            ? "border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.06)]"
            : "border-transparent hover:border-border hover:bg-muted/60",
        cursored && "ring-1 ring-inset ring-[hsl(var(--ring))]",
      )}
    >
      {/* Multi-select checkbox — wrapper owns the click (captures shiftKey; stops the row open). */}
      <span
        className={cn(
          "flex shrink-0 items-center self-center transition-opacity",
          selected || selectionActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
        )}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleSelect({ shiftKey: e.shiftKey }); }}
      >
        <Checkbox checked={selected} tabIndex={-1} aria-label={`Select ${name}`} className="pointer-events-none" />
      </span>

      {/* Avatar — deterministic INITIALS in a tokened circle (no fake photo, §13) + channel badge. */}
      <span className="relative shrink-0">
        <span
          className={cn(
            "grid place-items-center rounded-full border font-semibold",
            compact ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]",
            avatarTint(name),
            unread && "ring-1 ring-[hsl(var(--primary)/0.35)]",
          )}
          aria-hidden
        >
          {initialsFromName(name)}
        </span>
        <span
          className={cn(
            "absolute -bottom-1 -right-1 grid place-items-center rounded-full border-2 border-[hsl(var(--card))] bg-muted text-muted-foreground",
            compact ? "h-3.5 w-3.5" : "h-4 w-4",
          )}
          title={CHANNEL_LABEL[thread.channel]} aria-label={CHANNEL_LABEL[thread.channel]}
        >
          <Icon className={compact ? "h-2 w-2" : "h-2.5 w-2.5"} aria-hidden />
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm text-foreground", unread ? "font-semibold" : "font-medium")}>
            {name}
          </span>
          {unread && (
            <span
              className="inline-flex min-w-4 items-center justify-center rounded-full bg-[hsl(var(--primary))] px-1 text-[10px] font-semibold tabular-nums text-primary-foreground"
              title={`${thread.unread} unread`}
            >
              {thread.unread > 9 ? "9+" : thread.unread}
            </span>
          )}
          {ts && (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatDistanceToNow(new Date(ts), { addSuffix: false })}
            </span>
          )}
        </div>

        <div className={cn("flex items-center gap-2", compact ? "mt-0" : "mt-0.5")}>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {thread.lastDirection === "outbound" ? <span className="text-muted-foreground/60">You: </span> : ""}
            {thread.lastPreview || "—"}
          </span>
        </div>

        {/* state pills + labels */}
        {(snoozed || archived || labels.length > 0) && (
          <div className={cn("flex flex-wrap items-center gap-1.5", compact ? "mt-0.5" : "mt-1")}>
            {snoozed && (
              <StatePill state="pending" icon={<Clock className="h-2.5 w-2.5" />}>
                {isUntilReply(c.snoozed_until) ? "Until reply" : `Snoozed · ${formatDistanceToNow(new Date(c.snoozed_until!))}`}
              </StatePill>
            )}
            {archived && <StatePill state="off" icon={<Archive className="h-2.5 w-2.5" />}>Archived</StatePill>}
            {labels.slice(0, 2).map((l) => (
              <span key={l.id} className={cn("rounded-full border px-1.5 py-0 text-[10px] font-medium", LABEL_COLOR[l.color])}>
                {l.name}
              </span>
            ))}
            {labels.length > 2 && <span className="text-[10px] text-muted-foreground">+{labels.length - 2}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlatformFleetCommunications() {
  const reduce = useReducedMotion();
  // The ONE shared Voice Device (§18). The operator mints an operator-identity token on the same
  // master account (Phase 3); placing a call drives THIS Device — no second Device, no fork.
  const voice = useVoiceDevice();
  const [conversations, setConversations] = useState<OperatorConversation[]>([]);
  const [messages, setMessages] = useState<OperatorMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false); // "new conversation" mode
  const [newTo, setNewTo] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // list-view state (container owns the DATA concerns; the shell owns sort/density/select/bulk)
  const [view, setView] = useState<ThreadFilter>("active");
  const [labelFilter, setLabelFilter] = useState<Label | null>(null);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [matchedIds, setMatchedIds] = useState<Set<string> | null>(null);

  // layout state (feeds the shell)
  const [railOpen, setRailOpen] = useState(true);
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  // ── loads ─────────────────────────────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("operator_conversations")
      .select(CONV_COLS)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) toast.error("Couldn't load conversations.");
    setConversations((data as OperatorConversation[]) ?? []);
    setLoading(false);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("operator_messages")
      .select(MSG_COLS)
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

  // Drop a selection that no longer exists (deleted), but do NOT auto-select — like the tenant
  // inbox, the operator picks a thread (empty "Select a conversation" state until then).
  useEffect(() => {
    if (composing) return;
    if (selectedId && !conversations.some((c) => c.id === selectedId)) setSelectedId(null);
  }, [conversations, selectedId, composing]);

  useEffect(() => { if (selectedId) void loadMessages(selectedId); }, [selectedId, loadMessages]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages.length, reduce]);

  // ── full-text search over operator_messages.search_tsv (websearch → no injection), 300ms.
  //    Returns matched conversation_ids (the operator's thread key). ────────────────────────
  useEffect(() => {
    const term = search.trim();
    if (!term) { setMatchedIds(null); setSearching(false); return; }
    setSearching(true);
    const h = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("operator_messages")
        .select("conversation_id")
        .textSearch("search_tsv", term, { type: "websearch", config: "english" })
        .limit(1000);
      if (error) toast.error("Search hit a snag — try again.");
      setMatchedIds(new Set(((data as { conversation_id: string }[]) ?? []).map((r) => r.conversation_id)));
      setSearching(false);
    }, 300);
    return () => clearTimeout(h);
  }, [search]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  // Tenant-authored label vocabulary, deduped across the operator's own conversations (§18 —
  // same jsonb-labels model as the tenant threads aggregate; no join table).
  const labelCatalog = useMemo<Label[]>(() => {
    const byId = new Map<string, Label>();
    for (const c of conversations) for (const l of c.labels ?? []) if (!byId.has(l.id)) byId.set(l.id, l);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [conversations]);

  // per-view counts for the filter strip
  const counts = useMemo(() => {
    const now = Date.now();
    let active = 0, snoozed = 0, archived = 0;
    for (const c of conversations) {
      if (isArchived(c)) archived++;
      else if (isSnoozed(c, now)) snoozed++;
      else active++;
    }
    return { active, snoozed, archived, all: conversations.length };
  }, [conversations]);

  // ── visible threads: view predicate → label filter → search (pure, no new query) ─────────
  const visibleThreads = useMemo<ShellThread<OperatorConversation>[]>(() => {
    const now = Date.now();
    const inView = (c: OperatorConversation) => {
      const snoozed = isSnoozed(c, now);
      const archived = isArchived(c);
      switch (view) {
        case "active": return !archived && !snoozed;
        case "snoozed": return !archived && snoozed;
        case "archived": return archived;
        default: return true; // all
      }
    };
    return conversations
      .filter(inView)
      .filter((c) => (labelFilter ? (c.labels ?? []).some((l) => l.id === labelFilter.id) : true))
      .filter((c) => (matchedIds ? matchedIds.has(c.id) : true))
      .map<ShellThread<OperatorConversation>>((c) => ({
        id: c.id,
        key: c.id, // the operator conversation id IS the thread key (no separate thread_key)
        title: threadTitle(c),
        lastPreview: c.last_preview ?? "",
        unread: c.unread_count,
        lastMessageAt: c.last_message_at,
        lastDirection: c.last_direction,
        labels: c.labels ?? [],
        snoozedUntil: c.snoozed_until,
        archivedAt: c.archived_at,
        channel: c.channel,
        hasDraft: false,     // operator has no draft flow (approveDraft off)
        scheduled: false,    // operator send is immediate (canSchedule off)
        raw: c,
      }));
  }, [conversations, view, labelFilter, matchedIds]);

  const searchActive = search.trim().length > 0;
  const matchedEmpty = searchActive && !searching && visibleThreads.length === 0;

  // ── thread mutators — write operator_conversations directly (operator RLS is
  //    is_platform_owner()-gated, so a scoped `.update()` is honest & isolated, §9). Optimistic;
  //    reload on error. Each returns success so the shell's bulk runner reports honestly (§13). ─
  const optimisticConv = (id: string, patch: Partial<OperatorConversation>) =>
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const snooze = async (id: string, until: Date | string | null, opts?: MutOpts): Promise<boolean> => {
    const iso = until == null ? null : typeof until === "string" ? until : until.toISOString();
    optimisticConv(id, { snoozed_until: iso });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("operator_conversations").update({ snoozed_until: iso }).eq("id", id);
    if (error) { if (!opts?.silent) toast.error("Couldn't snooze that thread."); void loadConversations(); return false; }
    if (!opts?.silent) toast.success(iso ? "Snoozed." : "Back in your inbox.");
    return true;
  };
  const archive = async (id: string, on: boolean, opts?: MutOpts): Promise<boolean> => {
    const iso = on ? new Date().toISOString() : null;
    optimisticConv(id, { archived_at: iso });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("operator_conversations").update({ archived_at: iso }).eq("id", id);
    if (error) { if (!opts?.silent) toast.error("Couldn't update that thread."); void loadConversations(); return false; }
    if (!opts?.silent) toast.success(on ? "Archived." : "Moved to inbox.");
    return true;
  };
  const markRead = async (id: string, opts?: MutOpts): Promise<boolean> => {
    optimisticConv(id, { unread_count: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("operator_conversations").update({ unread_count: 0 }).eq("id", id);
    if (error) { void loadConversations(); return false; }
    return true;
  };
  const setLabels = async (id: string, labels: Label[], opts?: MutOpts): Promise<boolean> => {
    optimisticConv(id, { labels });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("operator_conversations").update({ labels }).eq("id", id);
    if (error) { if (!opts?.silent) toast.error("Couldn't save labels."); void loadConversations(); return false; }
    return true;
  };

  // ── open + compose ──────────────────────────────────────────────────────────────────────
  const selectThread = (key: string) => {
    setComposing(false);
    setSelectedId(key);
    setBody("");
    const c = conversations.find((x) => x.id === key);
    if (c && c.unread_count > 0) void markRead(key, { silent: true });
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
        toast.error("Operator SMS isn't ready to send yet — one Twilio setup step remains.");
      } else {
        toast.error(res?.reason ?? "Couldn't send that message.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send that message.");
    } finally {
      setSending(false);
    }
  };

  // ── adapter: LIST model ─────────────────────────────────────────────────────────────────
  const listModel: ConversationsListModel<OperatorConversation> = {
    threads: visibleThreads,
    loading,
    searching,
    search,
    onSearch: setSearch,
    matchedEmpty,
    selectedKey: selectedId,
    onSelect: selectThread,
    onOpenFocus: () => paneRef.current?.focus(),
    snooze,
    archive,
    markRead,
    setLabels,
    labelCatalog,
    resetKey: `${view}|${labelFilter?.id ?? ""}|${search}`,
    renderRow: (thread, ctx) => <OperatorThreadRow key={thread.key} thread={thread} ctx={ctx} />,
    renderNewConversation: () => (
      <Button variant="outline" size="sm" className="h-9 w-full justify-center" onClick={startNew}>
        <Plus className="mr-1.5 h-4 w-4" /> New message
      </Button>
    ),
    renderFilters: () => (
      <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {OPERATOR_VIEWS.map((v) => {
            const n = counts[v];
            const on = view === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={on}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                  on
                    ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))]"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {FILTER_LABEL[v]}
                <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
        {labelCatalog.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
                {labelFilter ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 rounded-full", LABEL_DOT[labelFilter.color])} aria-hidden />
                    {labelFilter.name}
                  </span>
                ) : "Label"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Filter by label</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setLabelFilter(null)}>
                <Check className={cn("mr-2 h-3.5 w-3.5", labelFilter ? "opacity-0" : "opacity-100")} aria-hidden /> All labels
              </DropdownMenuItem>
              {labelCatalog.map((l) => (
                <DropdownMenuItem key={l.id} onSelect={() => setLabelFilter(l)}>
                  <span className={cn("mr-2 h-2 w-2 rounded-full", LABEL_DOT[l.color])} aria-hidden /> {l.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    ),
    renderEmpty: () => (
      <EmptyState
        icon={Inbox}
        tone="brand"
        title={
          view === "archived" ? "No archived conversations."
          : view === "snoozed" ? "Nothing snoozed."
          : "No conversations yet."
        }
        description={
          view === "active"
            ? "When someone texts the operator number — or you start a new message — the thread lands here."
            : "Switch views to see your other conversations."
        }
        action={view === "active" ? (
          <Button variant="outline" size="sm" onClick={startNew}><Plus className="mr-1.5 h-4 w-4" /> New message</Button>
        ) : undefined}
        className="py-10"
      />
    ),
  };

  // ── adapter: COMPOSER model (all affordances OFF → bare textarea + gold Send + A2P note) ──
  const composerModel: ConversationsComposerModel = {
    capabilities: OPERATOR_CAPS,
    value: body,
    onChange: setBody,
    onSend: () => void send(),
    sending,
    placeholder: "Write a message…",
    note: "A2P compliant — “Reply STOP to unsubscribe.” is appended automatically.",
    identities: [OPERATOR_IDENTITY],
    identityId: OPERATOR_IDENTITY.id,
    onIdentityChange: () => { /* single master identity — no switch */ },
    showIdentity: false,
  };

  // ── call capability for the open thread (Phase 4) — the operator dials the counterparty on the
  //    SAME shared Device via the Phase-3 operator voice token path. §13: we NEVER fake a dial —
  //    hasVoiceCalling flips false the moment the token path reports needs_config, and the button
  //    independently guards the needs_config state, so an unprovisioned operator number shows the
  //    honest disabled tooltip rather than a dead ring. ──
  const operatorVoiceReady = !!voice && voice.status !== "needs_config";
  const placeOperatorCall = (destination: string) => { voice?.callFrom(destination); };

  // ── middle pane (the shell's activeThread slot — container-owned) ────────────────────────
  const now = Date.now();
  const selectedSnoozed = selected ? isSnoozed(selected, now) : false;
  const selectedArchived = selected ? isArchived(selected) : false;
  const SmsGlyph = CHANNEL_ICON[selected?.channel ?? "sms"] ?? MessageSquare;

  const activeThread = (
    <SectionCard padded={false} bodyClassName="flex min-h-0 flex-1 flex-col" className="flex min-h-0 flex-col overflow-hidden">
      {composing ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3.5">
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setComposing(false)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h2 className="font-display text-sm font-semibold text-foreground">New message</h2>
          </div>
          <div className="flex flex-1 flex-col gap-1 p-4">
            <label htmlFor="op-new-to" className="text-xs font-medium text-muted-foreground">To (phone number)</label>
            <Input
              id="op-new-to"
              value={newTo}
              onChange={(e) => setNewTo(e.target.value)}
              placeholder="+14705551234"
              inputMode="tel"
              className="max-w-xs"
            />
          </div>
        </div>
      ) : selected ? (
        <>
          {/* Thread header — also the focus target when Enter is pressed in the rail. */}
          <div
            ref={paneRef}
            tabIndex={-1}
            className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]"
          >
            <Button variant="ghost" size="sm" className="-ml-2 lg:hidden" onClick={() => setSelectedId(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]" aria-hidden>
              <SmsGlyph className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{threadTitle(selected)}</p>
              <p className="truncate text-[11px] text-muted-foreground select-text">
                {CHANNEL_LABEL[selected.channel]} · {selected.counterparty_phone}
              </p>
            </div>

            {/* quick actions — the CALL act (gold, §11 — a distinct primary act like Send) then
                snooze / archive (icon-only ghost). Shared ConversationsCallButton, adapter-driven. */}
            <div className="flex items-center gap-1">
              <ConversationsCallButton
                hasVoiceCalling={operatorVoiceReady}
                destination={selected.counterparty_phone}
                onPlaceCall={placeOperatorCall}
                unavailableReason={voice?.reason ?? "Operator calling isn’t set up yet."}
                className="mr-1"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    aria-label="Snooze conversation"
                  >
                    <Clock className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Snooze</DropdownMenuLabel>
                  {snoozePresets().map((p) => (
                    <DropdownMenuItem key={p.key} onSelect={() => void snooze(selected.id, p.until)}>
                      <Clock className="mr-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {p.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onSelect={() => void snooze(selected.id, SNOOZE_SENTINEL_UNTIL_REPLY)}>
                    <MessageCircleReply className="mr-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Until they reply
                  </DropdownMenuItem>
                  {selectedSnoozed && (
                    <DropdownMenuItem onSelect={() => void snooze(selected.id, null)}>
                      <ArchiveRestore className="mr-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Unsnooze
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                aria-label={selectedArchived ? "Move to inbox" : "Archive conversation"}
                onClick={() => void archive(selected.id, !selectedArchived)}
              >
                {selectedArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              </Button>
              {/* contact panel toggles — rail on xl+, Sheet below xl */}
              <Button
                variant="ghost" size="icon"
                className="hidden h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] xl:inline-flex"
                aria-label={railOpen ? "Hide contact panel" : "Show contact panel"}
                aria-pressed={railOpen}
                onClick={() => setRailOpen((o) => !o)}
              >
                <PanelRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] xl:hidden"
                aria-label="Contact details"
                onClick={() => setContactDrawerOpen(true)}
              >
                <Contact className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* messages — the SAME shared MessageBubble the tenant inbox uses (§18) */}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <p className="pt-8 text-center text-sm text-muted-foreground">No messages in this thread yet.</p>
            ) : (
              messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  direction={m.direction}
                  body={m.body}
                  timestamp={m.sent_at ?? m.created_at}
                  senderLabel={m.direction === "outbound" ? "You" : threadTitle(selected)}
                  status={m.channel_type === "voice" ? null : messageStatePill(m)}
                  error={m.status === "failed" ? m.error : null}
                  // §49 — a voice row renders inline as the shared call bubble (direction/duration/
                  // recording/transcript, each only when present, §13). Gold-free.
                  call={
                    m.channel_type === "voice"
                      ? {
                          direction: m.direction,
                          durationSec: m.call_duration_seconds,
                          recordingUrl: m.recording_url,
                          transcript: m.transcript,
                        }
                      : null
                  }
                />
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </>
      ) : (
        <div className="grid flex-1 place-items-center p-6">
          <EmptyState
            icon={MessageCircle}
            tone="brand"
            title="Your operator inbox."
            description="Pick a conversation on the left to read the thread, or start a new message. Separate from every tenant's inbox."
          />
        </div>
      )}

      {/* Shared composer core (§18) — bare textarea + gold Send + A2P note (all affordances off). */}
      {(composing || selected) && <ConversationsRichComposer {...composerModel} />}
    </SectionCard>
  );

  // ── adapter: CONTACT PANEL (minimal — name/phone/labels/reach/recent, §13 no business rail) ──
  const recentShellMessages: ShellMessage[] = messages.map((m) => ({
    id: m.id,
    direction: m.direction,
    body: m.body,
    status: m.status,
    timestamp: m.sent_at ?? m.created_at,
    channelType: (m.channel_type as ChannelType) ?? "sms",
    error: m.error,
    callDurationSec: m.call_duration_seconds,
    callRecordingUrl: m.recording_url,
    callTranscript: m.transcript,
    callDirection: m.channel_type === "voice" ? m.direction : null,
  }));
  const contactPanelNode = selected ? (
    <ConversationsContactPanel
      hasContactBusinessPanels={false}
      minimal={{
        name: threadTitle(selected),
        phone: selected.counterparty_phone,
        reach: [{ channel: "sms", address: selected.counterparty_phone }],
        labels: selected.labels ?? [],
        recent: recentShellMessages,
        onClose: () => { setRailOpen(false); setContactDrawerOpen(false); },
      }}
    />
  ) : null;

  return (
    <PageShell width="wide" fill>
      <PageHeader
        variant="plain"
        icon={MessageSquare}
        title="Communications"
        description="Your platform SMS line — messages to and from the operator number. Separate from every tenant's inbox."
      />

      {loading && conversations.length === 0 ? (
        <SectionCard>
          <div className="flex items-center gap-3 py-10">
            <SearchX className="h-5 w-5 text-muted-foreground" aria-hidden />
            <span className="text-sm text-muted-foreground">Loading your operator inbox…</span>
          </div>
        </SectionCard>
      ) : (
        <ConversationsThreeColumnShell
          threadList={<ConversationsThreadList {...listModel} />}
          activeThread={activeThread}
          contactPanel={contactPanelNode}
          mobileContactPanel={contactPanelNode}
          hasSelection={!!selected}
          railOpen={railOpen}
          mobileSheetOpen={contactDrawerOpen}
          onMobileSheetOpenChange={setContactDrawerOpen}
          mobileSheetTitle={selected ? threadTitle(selected) : undefined}
        />
      )}
    </PageShell>
  );
}
