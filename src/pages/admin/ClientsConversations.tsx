// Conversations — the unified two-way client inbox (Comms C-1 / C-1.5, §7 intelligent portal).
// One thread per client across every channel, reading the REAL public.messages jsonb
// substrate + the public.threads aggregate (order/unread/snooze/archive/labels). Paige
// detects an inbound, the action bus drafts the reply (status='draft', tagged below), and
// a non-technical coach one-click Approves → send-message fires (§36 draft-first + one-click).
//
// C-1.5 adds: search, snooze/archive/labels, the contact rail, composer depth
// (attachments · snippets · signatures · schedule/undo-send), and the four derived
// views the Command-Center tiles deep-link into (?filter=drafts|awaiting-reply|…).
//
// §11/§25 premium on @/components/ui/page + @/components/ui/select (NO native select);
// gold ONLY on Send/Approve; realtime on messages + threads; motion-safe; token-only.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useSearchParams, Link } from "react-router-dom";
import {
  MessageCircle, Inbox, Send, Pencil, Loader2, Sparkles, AlertTriangle, Paperclip,
  Search, SearchX, PanelRight, Clock, X, ImageIcon, ChevronDown, Bell, Plus,
} from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

import {
  type ChannelType, type Attachment, type MessageRow, type DbThread, type Label,
  type ThreadFilter, type Suppression, type SelectedView, type InboxView,
  MESSAGE_COLS, THREAD_COLS, CHANNEL_ICON, CHANNEL_LABEL,
  partyLabel, bodyPreview, msgTime, contactNameFromClient,
  INBOX_VIEWS, endOfTodayMs, readSendResult, UNDO_WINDOW_MS,
} from "./conversations/inbox-shared";
import { ComposeThreadDialog } from "./conversations/ComposeThreadDialog";
import { ThreadRow } from "./conversations/ThreadRow";
import { ThreadFilters, useLabelCatalog } from "./conversations/ThreadFilters";
import { ContactCardRail } from "./conversations/ContactCardRail";
import { SnoozeMenu } from "./conversations/SnoozeMenu";
import { LabelPopover } from "./conversations/LabelPopover";
import { QuickAddDialog } from "@/components/planning/QuickAddDialog";

// ── Connector (channel_connectors row — kept local, not in shared) ─────────────────
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

// ── Composer depth (Comms C-1.5) ────────────────────────────────────────────────
// UNDO_WINDOW_MS now lives in inbox-shared (§18 — reused by the compose-new modal too).
const COMMS_ATTACH_BUCKET = "comms-attachments";
const MAX_ATTACH_BYTES = 10 * 1024 * 1024;     // 10MB/file — matches the bucket ceiling

interface Snippet {
  id: string; user_id: string | null; trigger: string; name: string;
  body: string; variables: Record<string, string> | null;
}
interface Signature {
  id: string; user_id: string | null; name: string; html: string;
  variables: Record<string, string> | null; is_default: boolean;
}

// Merge-var resolver — unknown {{token}} drops to "" so a raw token NEVER ships (§13/§15).
// R1: reads the selected view's dbThread.clients + name (the assembled shape).
function mergeContext(sel: SelectedView | null, sig?: Signature, snip?: Snippet): Record<string, string> {
  const c = sel?.dbThread.clients ?? null;
  return {
    first_name: c?.first_name ?? "",
    last_name: c?.last_name ?? "",
    full_name: [c?.first_name, c?.last_name].filter(Boolean).join(" "),
    client_name: sel?.name ?? "",
    entity_name: c?.entity_name ?? "",
    ...(snip?.variables ?? {}),
    ...(sig?.variables ?? {}),
  };
}
const resolveMergeVars = (text: string, ctx: Record<string, string>) =>
  text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => ctx[k] ?? "");

const isImageMime = (m?: string) => !!m && m.startsWith("image/");

// ── Status pill mapping for a single message ─────────────────────────────────────
function messageStatusPill(m: MessageRow) {
  if (m.status === "failed") return <StatePill state="error">Failed</StatePill>;
  if (m.status === "sent" || m.status === "delivered" || m.status === "read")
    return <StatePill state="success">Sent</StatePill>;
  if (m.status === "queued") return <StatePill state="pending">Queued</StatePill>;
  return null;
}

// ── Channel glyph chip (local — MessageBubble + detail header) ──────────────────────
function ChannelGlyph({ channel, className }: { channel: ChannelType; className?: string }) {
  const Icon = CHANNEL_ICON[channel];
  return (
    <span
      className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground", className)}
      title={CHANNEL_LABEL[channel]} aria-label={CHANNEL_LABEL[channel]}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

// ── Attachment chip — object-path only (private bucket). Images preview via a short-lived
// signed URL; everything else shows a paperclip. Remove deletes the object + drops state.
function AttachmentChip({ a, onRemove }: { a: Attachment; onRemove: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (isImageMime(a.mime) && a.url) {
      supabase.storage
        .from(COMMS_ATTACH_BUCKET)
        .createSignedUrl(a.url, 300)
        .then(({ data }) => { if (alive) setPreview(data?.signedUrl ?? null); });
    }
    return () => { alive = false; };
  }, [a.url, a.mime]);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground">
      {preview ? (
        <img src={preview} alt="" className="h-5 w-5 rounded object-cover" />
      ) : isImageMime(a.mime) ? (
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      ) : (
        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      )}
      <span className="max-w-[140px] truncate">{a.name || "attachment"}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        aria-label={`Remove ${a.name || "attachment"}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ── One message bubble (inbound left / outbound right) ────────────────────────────
function MessageBubble({
  m,
  onApprove,
  onEdit,
  onCancelScheduled,
  approving,
}: {
  m: MessageRow;
  onApprove: (m: MessageRow) => void;
  onEdit: (m: MessageRow) => void;
  onCancelScheduled: (id: string) => void;
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
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{body || "—"}</p>
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
          // Directional corner tail toward the sender (classic chat polish, pure radius).
          outbound ? "rounded-br-md border-primary/25 bg-primary/[0.06]" : "rounded-bl-md border-border bg-card",
        )}
      >
        {/* No per-bubble channel glyph: the whole thread is one channel and direction is
            already encoded by alignment + bubble color — repeating it is noise (§25 density). */}
        <div className="mb-1 flex items-center gap-2">
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
        {/* R-B1/R3: a queued scheduled outbound is findable + cancellable in the thread. */}
        {m.status === "queued" && m.scheduled_for && (
          <button
            type="button"
            onClick={() => onCancelScheduled(m.id)}
            className="mt-1.5 text-[11px] text-muted-foreground underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            Scheduled for {new Date(m.scheduled_for).toLocaleString()} · Cancel
          </button>
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
  // A freshly composed thread may not have streamed into dbThreads yet — hold its key so the
  // keep-valid-selection guard doesn't clobber the pick to visibleThreads[0] in the gap.
  const pendingSelectRef = useRef<string | null>(null);

  // C-1.5 threads-as-source-of-truth
  const [dbThreads, setDbThreads] = useState<DbThread[]>([]);
  const [view, setView] = useState<InboxView>("active");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [matchedKeys, setMatchedKeys] = useState<Set<string> | null>(null); // null = no active search
  const [searching, setSearching] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  // §43 — compose a NEW outbound thread (the surface is a tool, not just a viewer).
  const [composeOpen, setComposeOpen] = useState(false);

  // Composer state (reply into the selected thread)
  const [composeChannel, setComposeChannel] = useState<ChannelType | "">("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Composer depth state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null); // ISO | null
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [, setUndo] = useState<{ messageId: string; expiresAt: number } | null>(null);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [appendSignature, setAppendSignature] = useState(true); // email only, default on

  // "Draft with Paige" (#482 Phase-1): on-demand reply drafting via the subagent-email-composer
  // seam (§18 — same seam ContactCommsPanel proves). Email-only for Phase-1 (the composer is an
  // EMAIL composer; SMS-native drafting is a fast-follow, §13 — don't route SMS through it and
  // pretend it's SMS-native). Draft-first, one-click, non-gold assist (§36/§11).
  const [drafting, setDrafting] = useState(false);
  const [draftFlags, setDraftFlags] = useState<string[]>([]);
  const [draftGuideOpen, setDraftGuideOpen] = useState(false);
  const [draftGuide, setDraftGuide] = useState("");
  const [draftTone, setDraftTone] = useState<"professional" | "friendly" | "warm" | "direct">("professional");
  // #482 Phase-2 — the current operator's auth id, so the thread-header "Set a reminder"
  // quick action can file a plan row (plan_set_reminder is keyed to the caller). Server-derived.
  const [userId, setUserId] = useState<string | null>(null);
  const tenantIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Deep-link: read ?filter=<view> once; unknown slug → keep default (never blank). ─
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const v = searchParams.get("filter");
    if (v && (INBOX_VIEWS as string[]).includes(v)) setView(v as InboxView);
  }, [searchParams]);

  // ── message pull (500-row) + connectors + composer resources (R2: one reconciled load) ─
  const load = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [msgRes, connRes, snipRes, sigRes, tidRes] = await Promise.all([
      sb.from("messages").select(MESSAGE_COLS).order("sent_at", { ascending: false, nullsFirst: true }).limit(500),
      sb.from("channel_connectors").select("id, channel_type, provider, display_name, from_address, from_name, inbound_address, status, active").order("created_at", { ascending: true }),
      sb.from("snippets").select("id, user_id, trigger, name, body, variables"),
      sb.from("signatures").select("id, user_id, name, html, variables, is_default"),
      sb.rpc("current_user_tenant_id"),
    ]);
    if (msgRes.error) toast.error("Couldn't load conversations.");
    setRows((msgRes.data as unknown as MessageRow[]) ?? []);
    setConnectors((connRes.data as unknown as Connector[]) ?? []);
    setSnippets((snipRes.data as unknown as Snippet[]) ?? []);
    setSignatures((sigRes.data as unknown as Signature[]) ?? []);
    tenantIdRef.current = (tidRes.data as string | null) ?? null;
    setLoading(false);
  }, []);

  // Server query filters by the underlying STATE; derived views ride on a base state.
  const baseFilter: ThreadFilter =
    view === "snoozed" || view === "waking-today" ? "snoozed"
    : view === "archived" ? "archived"
    : view === "all" ? "all"
    : "active"; // active | drafts | awaiting-reply | scheduled

  // ── threads pull (source of truth for order/state/labels) ──────────────────────────
  const loadThreads = useCallback(async () => {
    const nowIso = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    let q = sb.from("threads").select(THREAD_COLS)
      .order("last_message_at", { ascending: false, nullsFirst: false }).limit(500);
    if (baseFilter === "active")        q = q.is("archived_at", null).or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`);
    else if (baseFilter === "snoozed")  q = q.is("archived_at", null).gt("snoozed_until", nowIso);
    else if (baseFilter === "archived") q = q.not("archived_at", "is", null);
    // "all" → no state predicate
    const { data, error } = await q;
    if (error) toast.error("Couldn't load the inbox.");
    setDbThreads((data as DbThread[]) ?? []);
  }, [baseFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadThreads(); }, [loadThreads]);

  // ── realtime: messages + threads (§7 two-way, live unread/snooze/archive) ───────────
  useEffect(() => {
    const chM = supabase.channel("comms_inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => { void load(); void loadThreads(); })
      .subscribe();
    const chT = supabase.channel("comms_threads")
      .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, () => void loadThreads())
      .subscribe();
    return () => { void supabase.removeChannel(chM); void supabase.removeChannel(chT); };
  }, [load, loadThreads]);

  // ── full-text search over messages.search_tsv (websearch → no injection), 300ms ─────
  useEffect(() => {
    const term = search.trim();
    if (!term) { setMatchedKeys(null); setSearching(false); return; }
    setSearching(true);
    const h = setTimeout(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb.from("messages").select("thread_key")
        .textSearch("search_tsv", term, { type: "websearch", config: "english" }).limit(1000);
      if (error) toast.error("Search hit a snag — try again.");
      setMatchedKeys(new Set(((data as { thread_key: string }[]) ?? []).map((r) => r.thread_key)));
      setSearching(false);
    }, 300);
    return () => clearTimeout(h);
  }, [search]);

  // ── message maps (preview + detail hydration) ──────────────────────────────────────
  const messagesByKey = useMemo(() => {
    const m = new Map<string, MessageRow[]>();
    for (const r of rows) { const a = m.get(r.thread_key) ?? []; a.push(r); m.set(r.thread_key, a); }
    for (const arr of m.values()) arr.sort((a, b) => msgTime(a) - msgTime(b));
    return m;
  }, [rows]);
  const previewByKey = useMemo(() => {
    const m = new Map<string, MessageRow>();
    for (const [k, arr] of messagesByKey) m.set(k, arr[arr.length - 1]);
    return m;
  }, [messagesByKey]);

  const labelCatalog = useLabelCatalog(dbThreads);
  const activeUnread = useMemo(
    () => dbThreads.reduce((s, t) => s + (!t.archived_at && (!t.snoozed_until || new Date(t.snoozed_until) <= new Date()) ? t.unread_count : 0), 0),
    [dbThreads],
  );

  // Resolve the operator's own auth id once (§9 server-derived) for the reminder quick action.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // ── derived view predicate (R3): drafts/awaiting-reply/waking-today/scheduled ───────
  const nowMs = Date.now();
  const viewPredicate = useCallback((t: DbThread): boolean => {
    const msgs = messagesByKey.get(t.thread_key) ?? [];
    switch (view) {
      case "drafts":
        return msgs.some((m) => m.status === "draft" && m.direction === "outbound");
      case "awaiting-reply":
        return t.last_direction === "outbound" && !!t.last_message_at
          && (nowMs - new Date(t.last_message_at).getTime()) > 3 * 864e5 && !t.archived_at
          && (!t.snoozed_until || new Date(t.snoozed_until).getTime() <= nowMs);
      case "waking-today":
        return !!t.snoozed_until && new Date(t.snoozed_until).getTime() > nowMs
          && new Date(t.snoozed_until).getTime() <= endOfTodayMs();
      case "scheduled":
        return msgs.some((m) => m.status === "queued" && !!m.scheduled_for);
      case "unread":
        // rides the 'active' server base (baseFilter falls through to active); narrows to
        // genuinely-unread, non-archived, not-future-snoozed threads (§13 real state).
        return t.unread_count > 0 && !t.archived_at
          && (!t.snoozed_until || new Date(t.snoozed_until).getTime() <= nowMs);
      default:
        return true;
    }
  }, [view, messagesByKey, nowMs]);

  // ── visible threads: state filter is server-side; search + label + view client-side ─
  const visibleThreads = useMemo(() =>
    dbThreads.filter((t) =>
      (matchedKeys === null || matchedKeys.has(t.thread_key)) &&
      (labelFilter === null || (t.labels ?? []).some((l) => l.id === labelFilter)) &&
      viewPredicate(t)),
    [dbThreads, matchedKeys, labelFilter, viewPredicate]);

  const activeConnectors = useMemo(() => connectors.filter((c) => c.active && c.status === "active"), [connectors]);

  // keep a valid selection as threads stream in
  useEffect(() => {
    // Hold a just-composed selection until its thread arrives in dbThreads — don't clobber it
    // to visibleThreads[0] in the gap (compose selection race). Honor it the moment it lands.
    if (pendingSelectRef.current) {
      if (dbThreads.some((t) => t.thread_key === pendingSelectRef.current)) {
        const key = pendingSelectRef.current;
        pendingSelectRef.current = null;
        setSelectedKey(key);
      }
      return;
    }
    if (visibleThreads.length === 0) { if (selectedKey !== null) setSelectedKey(null); return; }
    if (!selectedKey || !visibleThreads.some((t) => t.thread_key === selectedKey)) setSelectedKey(visibleThreads[0].thread_key);
  }, [visibleThreads, selectedKey, dbThreads]);

  const selectedThread = useMemo(() => dbThreads.find((t) => t.thread_key === selectedKey) ?? null, [dbThreads, selectedKey]);

  // selected view = DbThread + its loaded messages (all fields the composer/approve need)
  const selected = useMemo((): SelectedView | null => {
    if (!selectedThread) return null;
    const msgs = messagesByKey.get(selectedThread.thread_key) ?? [];
    const preview = msgs[msgs.length - 1] ?? null;
    const lastInbound = [...msgs].reverse().find((m) => m.direction === "inbound");
    const lastOutbound = [...msgs].reverse().find((m) => m.direction === "outbound");
    const channel: ChannelType = preview?.channel_type ?? "email";
    const toAddress =
      selectedThread.clients?.email?.trim() ||
      lastInbound?.sender?.address?.trim() ||
      lastOutbound?.recipients?.[0]?.address?.trim() || "";
    const name = contactNameFromClient(selectedThread.clients) ||
      (preview ? partyLabel(preview.direction === "inbound" ? preview.sender : preview.recipients?.[0]) : "") || "Unknown contact";
    return {
      key: selectedThread.thread_key, dbThread: selectedThread, messages: msgs, channel, name,
      hasDraft: msgs.some((m) => m.status === "draft"),
      contactId: selectedThread.contact_id, connectorId: preview?.connector_id ?? null, toAddress,
    };
  }, [selectedThread, messagesByKey]);

  // ── suppression read for the contact card (tenant RLS-scoped, §9) ───────────────────
  useEffect(() => {
    const cid = selectedThread?.contact_id;
    if (!cid) { setSuppressions([]); return; }
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data } = await sb.from("paige_suppressions").select("channel, reason").eq("contact_id", cid);
      if (!cancelled) setSuppressions((data as Suppression[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, [selectedThread?.contact_id]);

  // A rail DND toggle changes suppressions WITHOUT changing contact_id, so the effect above
  // (keyed on contact_id) won't re-fire — refresh explicitly on rail change so the DND banner
  // + the pre-send opt-out guard read fresh state, never a stale block/allow (§13).
  const refreshSuppressions = useCallback(async () => {
    const cid = selectedThread?.contact_id ?? null;
    if (!cid) { setSuppressions([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data } = await sb.from("paige_suppressions").select("channel, reason").eq("contact_id", cid);
    setSuppressions((data as Suppression[]) ?? []);
  }, [selectedThread?.contact_id]);

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

  // ── Thread-state mutations ──────────────────────────────────────────────────────────
  const optimisticThread = (id: string, patch: Partial<DbThread>) =>
    setDbThreads((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const snoozeThread = async (id: string, until: Date | string | null) => {
    const iso = until == null ? null : typeof until === "string" ? until : until.toISOString();
    optimisticThread(id, { snoozed_until: iso });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("threads").update({ snoozed_until: iso }).eq("id", id);
    if (error) { toast.error("Couldn't snooze that thread."); void loadThreads(); }
    else toast.success(iso ? "Snoozed." : "Back in your inbox.");
  };
  const archiveThread = async (id: string, on: boolean) => {
    const iso = on ? new Date().toISOString() : null;
    optimisticThread(id, { archived_at: iso });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("threads").update({ archived_at: iso }).eq("id", id);
    if (error) { toast.error("Couldn't update that thread."); void loadThreads(); }
    else toast.success(on ? "Archived." : "Moved to inbox.");
  };
  const markThreadRead = async (id: string) => {
    optimisticThread(id, { unread_count: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("threads").update({ unread_count: 0 }).eq("id", id);
  };
  const setThreadLabels = async (threadId: string, labels: Label[]) => {
    optimisticThread(threadId, { labels });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("threads").update({ labels }).eq("id", threadId);
    if (error) { toast.error("Couldn't save labels."); void loadThreads(); }
  };
  const renameCatalogLabel = async (labelId: string, patch: Partial<Label>) => {
    const affected = dbThreads.filter((t) => (t.labels ?? []).some((l) => l.id === labelId));
    await Promise.all(affected.map((t) =>
      setThreadLabels(t.id, (t.labels ?? []).map((l) => (l.id === labelId ? { ...l, ...patch } : l)))));
  };

  const selectThread = (key: string) => {
    setSelectedKey(key);
    const t = dbThreads.find((x) => x.thread_key === key);
    if (t && t.unread_count > 0) void markThreadRead(t.id);
  };

  // Cancel a queued scheduled send (R3) — routed through the any handle (typed-RPC ratchet).
  const cancelScheduled = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("cancel_scheduled_message", { _id: id });
    if (error || data === false) { toast.error("Too late — Paige already sent it."); return; }
    toast.success("Canceled — back to your draft."); void load(); void loadThreads();
  };

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
      if (error) throw new Error(error.message);
      // §37: read `outcome` first so a gated/blocked approval reports the true reason.
      const res = data as { status?: string; outcome?: string; reason?: string } | null;
      const outcome = res?.outcome ?? (res?.status === "sent" ? "sent" : "failed");
      if (outcome === "sent") { toast.success("Approved — Paige sent it."); }
      else if (outcome.startsWith("blocked_")) { toast.error(res?.reason ?? "Blocked — can't message this contact."); }
      else if (outcome.startsWith("queued_")) { toast(`Held: ${res?.reason ?? "will send when allowed."}`); }
      else { throw new Error(res?.reason ?? "send_failed"); }
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

  // ── (a) Attachment upload → private bucket; store the OBJECT PATH ────────────────
  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const tenantId = tenantIdRef.current;
    if (!tenantId) { toast.error("Couldn't resolve your workspace — refresh and retry."); return; }
    setUploading(true);
    const next: Attachment[] = [];
    try {
      for (const f of Array.from(files)) {
        if (f.size > MAX_ATTACH_BYTES) { toast.error(`${f.name} is over 10MB.`); continue; }
        const path = `${tenantId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
        const { error } = await supabase.storage.from(COMMS_ATTACH_BUCKET).upload(path, f, {
          contentType: f.type || "application/octet-stream", upsert: false,
        });
        if (error) { toast.error(`Couldn't attach ${f.name}.`); continue; }
        next.push({ url: path, mime: f.type || "application/octet-stream", name: f.name, size: f.size });
      }
      if (next.length) setAttachments((a) => [...a, ...next]);
    } finally { setUploading(false); }
  }, []);

  const removeAttachment = useCallback(async (a: Attachment) => {
    setAttachments((cur) => cur.filter((x) => x.url !== a.url));
    if (a.url) await supabase.storage.from(COMMS_ATTACH_BUCKET).remove([a.url]);
  }, []);

  // ── (d) Snippet #trigger expansion on a word-boundary keystroke ─────────────────
  const handleBodyChange = useCallback((val: string) => {
    const m = /(\S+)([ \t\n])$/.exec(val); // last whitespace-terminated token
    if (m) {
      const snip = snippets.find((s) => s.trigger.toLowerCase() === m[1].toLowerCase());
      if (snip) {
        const expanded = resolveMergeVars(snip.body, mergeContext(selected, undefined, snip));
        setBody(val.slice(0, m.index) + expanded + m[2]);
        return;
      }
    }
    setBody(val);
  }, [snippets, selected]);

  // ── (e) Signature resolution (email only): user default → tenant default → none ──
  const effectiveSignature = useCallback((): Signature | null =>
    signatures.find((s) => s.user_id && s.is_default) ??
    signatures.find((s) => s.user_id === null && s.is_default) ?? null,
  [signatures]);

  const bodyWithSignature = useCallback((html: string): string => {
    const sig = effectiveSignature();
    if (composeChannel !== "email" || !appendSignature || !sig) return html;
    const rendered = resolveMergeVars(sig.html, mergeContext(selected, sig));
    return `${html}<br/><br/><hr/>${rendered}`; // divider + appended signature
  }, [composeChannel, appendSignature, effectiveSignature, selected]);

  const hasSignature = composeChannel === "email" && !!effectiveSignature();

  const resetComposer = useCallback(() => {
    setBody(""); setSubject(""); setAttachments([]);
    setScheduledFor(null); setEditingDraftId(null);
  }, []);

  // ── (b)+(c) ONE send body builder + ONE dispatch that reads outcome (§37) ────────
  const buildSendBody = useCallback((overrides: { scheduled_for?: string } = {}) => {
    const conn = connectorFor(composeChannel);
    const html = composeChannel === "email" ? bodyWithSignature(body.trim()) : body.trim();
    return {
      channel: composeChannel,
      to: selected!.toAddress,
      subject: composeChannel === "email" ? subject.trim() : undefined,
      body: html,
      contact_id: selected!.contactId ?? undefined,
      thread_key: selected!.key,
      connector_id: conn?.id ?? selected!.connectorId ?? undefined,
      message_id: editingDraftId ?? undefined,
      attachments: attachments.length ? attachments : undefined,      // contract §2
      ...(overrides.scheduled_for ? { scheduled_for: overrides.scheduled_for } : {}),
    };
  }, [composeChannel, connectorFor, bodyWithSignature, body, selected, subject,
      editingDraftId, attachments]);

  const dispatchSend = useCallback(async (overrides: { scheduled_for?: string } = {}) => {
    const { data, error } = await supabase.functions.invoke("send-message", { body: buildSendBody(overrides) });
    if (error) throw new Error(error.message);
    // R7-outcome via the ONE shared parser (inbox-shared) — the compose-new modal reads the
    // send result through the exact same helper, so reply and compose can never drift (§18/§37).
    const r = readSendResult(data);
    return { outcome: r.outcome, reason: r.reason, messageId: r.messageId, scheduledFor: r.scheduledFor };
  }, [buildSendBody]);

  const cancelUndo = useCallback(async (messageId: string) => {
    // R4: cancel through the any handle so the typed-RPC ratchet doesn't break tsc.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("cancel_scheduled_message", { _id: messageId });
    if (error || data === false) { toast.error("Too late — Paige already sent it."); return; }
    toast.success("Undone — back to your draft.");
    setUndo(null); void load();
  }, [load]);

  // ── "Draft with Paige": ask the email-composer sub-agent to draft a reply on demand ──
  // Reads the thread's last inbound message as context (§36 one-click) + optional guide/tone.
  // Lands the draft in the composer for review/edit/send — never auto-sends (§36 draft-first).
  const draftWithPaige = useCallback(async () => {
    if (!selected) return;
    // §13: never silently discard the coach's typed reply. Only draft into an empty body.
    if (body.trim()) {
      toast.error("You've already started a reply — clear it first to draft with Paige.");
      return;
    }
    setDrafting(true);
    setDraftFlags([]);
    try {
      // §36 context: the client's most recent inbound message (capped so a long thread
      // doesn't blow the prompt budget — verifier #6).
      const lastInbound = [...selected.messages].reverse().find((m) => m.direction === "inbound");
      const lastText = lastInbound ? bodyPreview(lastInbound).slice(0, 1500) : "";

      const { data, error } = await supabase.functions.invoke("subagent-email-composer", {
        body: {
          input: {
            intent: draftGuide.trim() || "Write a reply to the client's most recent message in this conversation.",
            tone: draftTone,
            length: "medium",
            key_points: [lastText ? `Client's last message: ${lastText}` : ""].filter(Boolean),
            contact_id: selected.contactId ?? undefined,
            recipient_name: selected.name || undefined,
            recipient_email: selected.toAddress || undefined,
            format: "html",
          },
          context: { contact_id: selected.contactId ?? undefined },
        },
      });
      // §13/§36 honest error: a non-2xx (compliance_blocked 422, reviewer_unavailable/timeout 503)
      // returns FunctionsHttpError whose `.message` is the generic "non-2xx status code" — the REAL
      // reason (summary/error) is in `.context`. Surface that so the coach knows to revise, never a
      // dev-tool leak.
      if (error) {
        let msg = "Paige couldn't draft that — try again.";
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const b = await (error as any).context?.json?.();
          if (b?.summary || b?.error) msg = b.summary ?? b.error;
        } catch { /* keep the friendly default */ }
        throw new Error(msg);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const draft = (data as any)?.draft ?? data;
      const text = draft?.body_text || (draft?.body_html ? String(draft.body_html).replace(/<[^>]+>/g, "") : "");
      if (!text.trim()) throw new Error("Paige returned an empty draft.");

      // Fresh reply — not an edit of the passive draft row (verifier #4): clear any edit binding
      // so Send dispatches a NEW message, not an update to a stale draft.
      setEditingDraftId(null);
      if (draft?.subject && !subject.trim()) setSubject(draft.subject);
      setBody(text);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setDraftFlags(((data as any)?.compliance_flags ?? []) as string[]);
      setDraftGuideOpen(false);
      toast.success("Paige drafted a reply — review before you send.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Paige couldn't draft that — try again.");
    } finally {
      setDrafting(false);
    }
  }, [selected, body, draftGuide, draftTone, subject]);

  // ── Send a fresh reply (or an edited draft) into the selected thread ──────────────
  const send = async () => {
    if (!selected) return;
    if (!composeChannel) { toast.error("Connect a channel first — Paige needs a way to send."); return; }
    if (!selected.toAddress) { toast.error("No client address on this thread to send to."); return; }
    if (!body.trim()) { toast.error("Write a reply first."); return; }
    if (composeChannel === "email" && !subject.trim()) { toast.error("Add a subject for the email."); return; }
    // R-HIGH3: truthful pre-send guard — never enqueue for a contact who opted out of this channel.
    const blocked = suppressions.find((s) => s.channel === composeChannel);
    if (blocked) { toast.error(`This contact opted out of ${CHANNEL_LABEL[composeChannel]} — Paige won't send.`); return; }

    setSending(true);
    try {
      // Default path = undo-send: queue 30s out so the toast's Undo can cancel before delivery.
      const iso = scheduledFor ?? new Date(Date.now() + UNDO_WINDOW_MS).toISOString();
      const r = await dispatchSend({ scheduled_for: iso });

      if (r.outcome === "queued_scheduled") {
        if (scheduledFor) {
          toast.success(`Scheduled for ${new Date(scheduledFor).toLocaleString()}.`);
          resetComposer();
        } else if (r.messageId) {
          const id = r.messageId;
          setUndo({ messageId: id, expiresAt: Date.now() + UNDO_WINDOW_MS });
          toast("Sending…", {
            action: { label: "Undo", onClick: () => void cancelUndo(id) },
            duration: UNDO_WINDOW_MS,
          });
          resetComposer();
        } else {
          // R6: queued with no message_id, undo unavailable — ack + reset, never a silent stuck box.
          toast.success("Sending…"); resetComposer();
        }
      } else if (r.outcome === "sent") {
        toast.success("Sent."); resetComposer();
      } else if (r.outcome.startsWith("blocked_")) {
        toast.error(r.reason ?? "Blocked — can't message this contact.");
      } else if (r.outcome.startsWith("queued_")) {
        toast(`Held: ${r.reason ?? "Paige will send when it's allowed."}`); resetComposer();
      } else {
        throw new Error(r.reason ?? "send_failed");
      }
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setSending(false);
    }
  };

  const noChannel = activeConnectors.length === 0;
  // send-message only handles email|sms today, so "New conversation" needs a SENDABLE channel.
  // A whatsapp-only tenant HAS a connector (noChannel=false) but the compose modal would be a
  // dead-end — gate the CTA on a real sendable channel, not merely any channel (§13/§43).
  const canCompose = activeConnectors.some((c) => c.channel_type === "email" || c.channel_type === "sms");

  return (
    <PageShell width="full" fill>
      <PageHeader
        variant="plain"
        title="Conversations"
        description="Every client thread across email, SMS, WhatsApp, and DMs — with Paige drafting the reply for your one-click approval."
        actions={
          // §43 — the surface is a tool: start a NEW outbound thread from here. Gold on the
          // act (§11). Disabled honestly when there's no sendable channel to send on (§13).
          !canCompose ? (
            <span
              className="inline-flex"
              title="Connect an email or SMS channel to start a conversation"
            >
              <Button variant="gold" size="sm" disabled>
                <Plus className="mr-1.5 h-4 w-4" /> New conversation
              </Button>
            </span>
          ) : (
            <Button variant="gold" size="sm" onClick={() => setComposeOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New conversation
            </Button>
          )
        }
      />

      {/* The pane grid flows as the flex-1 last child of the `fill` shell (lg+), so it
          consumes exactly the height its scroll parent gives it and its columns' own
          overflow-y-auto engage — instead of a magic calc(100dvh-…) that undershot the
          chrome and double-scrolled (Finding 2). Below lg it stacks with natural scroll. */}
      <div className={cn(
        "grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1",
        selected && railOpen ? "lg:grid-cols-[320px_1fr_300px]" : "lg:grid-cols-[320px_1fr]",
      )}>
        {/* ── LEFT: thread rail ─────────────────────────────────────────────────── */}
        <SectionCard padded={false} className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-border/60 px-3 py-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search messages…"
                className="h-9 pl-8"
                aria-label="Search messages"
              />
            </div>
          </div>
          <ThreadFilters
            view={view} onView={setView} activeUnread={activeUnread}
            catalog={labelCatalog} labelFilter={labelFilter} onLabelFilter={setLabelFilter}
          />
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading || searching ? (
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
            ) : matchedKeys?.size === 0 ? (
              <EmptyState
                icon={SearchX} tone="muted"
                title={`No messages match "${search.trim()}".`}
                description="Try a client's name, a phone number, or a word from the message."
                className="py-10"
              />
            ) : visibleThreads.length === 0 ? (
              <EmptyState
                icon={Inbox} tone="brand"
                title={view === "archived" ? "Nothing archived." : view === "snoozed" ? "Nothing snoozed." : "No conversations yet."}
                description={
                  view === "active"
                    ? !canCompose
                      ? "Connect an email or SMS channel and the moment a client reaches out, their thread lands here — with Paige's draft reply ready for your approval."
                      : "Start a new conversation, or the moment a client reaches out their thread lands here — with Paige's draft reply ready for your approval."
                    : "When you snooze or archive a conversation, it shows up here."
                }
                action={
                  view === "active"
                    ? canCompose
                      ? (
                        <Button variant="gold" size="sm" onClick={() => setComposeOpen(true)}>
                          <Plus className="mr-1.5 h-4 w-4" /> New conversation
                        </Button>
                      )
                      : (
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/admin/settings">Connect a channel</Link>
                        </Button>
                      )
                    : undefined
                }
                className="py-10"
              />
            ) : (
              <div className="space-y-1">
                {visibleThreads.map((t) => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    preview={previewByKey.get(t.thread_key) ?? null}
                    channel={previewByKey.get(t.thread_key)?.channel_type ?? "email"}
                    active={t.thread_key === selectedKey}
                    onClick={() => selectThread(t.thread_key)}
                    catalog={labelCatalog}
                    onSnooze={snoozeThread}
                    onArchive={archiveThread}
                    onSetThreadLabels={setThreadLabels}
                    onRenameCatalogLabel={renameCatalogLabel}
                  />
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── MIDDLE: thread detail (scrolls) + composer (footer) ────────────────── */}
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
              <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5">
                <ChannelGlyph channel={selected.channel} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{selected.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground select-text">
                    {CHANNEL_LABEL[selected.channel]}{selected.toAddress ? ` · ${selected.toAddress}` : ""}
                  </p>
                </div>
                {/* #482 Phase-2 — thread-level quick actions promoted to the open-thread header
                    (§18 reuse: the same SnoozeMenu/LabelPopover already wired on the list rows), so
                    label / snooze / archive / remind are reachable without hovering a row. All
                    icon-only ghost buttons, matching the header control group; gold stays on
                    Send/Approve (§11). */}
                <div className="flex items-center gap-1">
                  <LabelPopover
                    thread={selected.dbThread} catalog={labelCatalog}
                    onSetThreadLabels={setThreadLabels} onRenameCatalogLabel={renameCatalogLabel}
                  />
                  <SnoozeMenu thread={selected.dbThread} onSnooze={snoozeThread} onArchive={archiveThread} />
                  {userId && selected.contactId && (
                    <QuickAddDialog
                      userId={userId}
                      contactId={selected.contactId}
                      contactName={selected.name}
                      defaultKind="reminder"
                      onCreated={() => toast.success("Reminder set.")}
                      trigger={
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                          aria-label="Set a reminder about this contact"
                        >
                          <Bell className="h-4 w-4" />
                        </Button>
                      }
                    />
                  )}
                </div>
                {selected.hasDraft && <StatePill state="building">Draft ready</StatePill>}
                {!railOpen && (
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    onClick={() => setRailOpen(true)} aria-label="Show contact panel"
                  >
                    <PanelRight className="h-4 w-4" />
                  </Button>
                )}
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
                      onCancelScheduled={cancelScheduled}
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
                        onCancelScheduled={cancelScheduled}
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
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Pencil className="h-3 w-3" /> Editing Paige's draft — Send replaces and delivers it.
                        <button type="button" className="ml-1 underline hover:text-foreground"
                          onClick={resetComposer}>Cancel</button>
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
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)}
                          placeholder="Subject" className="h-9 flex-1 min-w-[180px]" />
                      )}
                    </div>

                    {/* Attachment chip row */}
                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {attachments.map((a) => (
                          <AttachmentChip key={a.url} a={a} onRemove={() => void removeAttachment(a)} />
                        ))}
                      </div>
                    )}

                    {/* Drop zone wrapping the textarea */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault(); setDragOver(false);
                        if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
                      }}
                      className={cn(
                        "rounded-lg transition-shadow",
                        dragOver && "ring-2 ring-[hsl(var(--ring))]",
                      )}
                    >
                      <Textarea
                        value={body}
                        onChange={(e) => handleBodyChange(e.target.value)}
                        placeholder={`Reply to ${selected.name}…  (drop a file to attach)`}
                        rows={3}
                        className="resize-none"
                      />
                    </div>

                    {/* Toolbar: Draft with Paige · attach · signature toggle · schedule */}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={fileInputRef} type="file" multiple hidden
                        onChange={(e) => { if (e.target.files?.length) void uploadFiles(e.target.files); e.target.value = ""; }}
                      />

                      {/* Draft with Paige — the headline assist. Email-only for Phase-1 (§13).
                          Out-ranks the utility cluster with an indigo-tinted border (NOT gold —
                          gold stays on Send/Approve, §11); one-click primary + optional guide popover. */}
                      {composeChannel === "email" && (
                        <div className="inline-flex items-center">
                          <Button
                            variant="outline" size="sm"
                            className="h-8 min-w-[8.5rem] justify-center rounded-r-none border-r-0 border-[hsl(var(--primary)/0.4)]"
                            onClick={() => void draftWithPaige()}
                            disabled={drafting || sending || uploading || !selected.toAddress}
                            aria-busy={drafting}
                            title={!selected.toAddress ? "Add a recipient to draft a reply" : undefined}
                          >
                            {drafting
                              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              : <Sparkles className="mr-1.5 h-3.5 w-3.5 text-[hsl(var(--gold-dark))]" />}
                            {drafting ? "Paige is drafting…" : "Draft with Paige"}
                          </Button>
                          <Popover open={draftGuideOpen} onOpenChange={setDraftGuideOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline" size="sm"
                                className="h-8 rounded-l-none border-[hsl(var(--primary)/0.4)] px-2"
                                aria-label="Guide Paige's draft" disabled={drafting}
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-72 space-y-2 p-3">
                              <label htmlFor="draft-guide" className="block text-[11px] font-medium text-muted-foreground">
                                Optional — tell Paige the angle &amp; tone
                              </label>
                              <Textarea
                                id="draft-guide" rows={2} value={draftGuide}
                                onChange={(e) => setDraftGuide(e.target.value)}
                                placeholder="e.g. Confirm the Thursday call and ask for their intake form"
                                className="resize-none text-sm"
                              />
                              <Select value={draftTone} onValueChange={(v) => setDraftTone(v as typeof draftTone)}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="professional">Professional</SelectItem>
                                  <SelectItem value="friendly">Friendly</SelectItem>
                                  <SelectItem value="warm">Warm</SelectItem>
                                  <SelectItem value="direct">Direct</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button variant="outline" size="sm" className="h-8 w-full"
                                onClick={() => void draftWithPaige()} disabled={drafting}>
                                <Sparkles className="mr-1.5 h-3.5 w-3.5 text-[hsl(var(--gold-dark))]" /> Draft it
                              </Button>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}

                      <Button variant="outline" size="sm" className="h-8"
                        onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        {uploading
                          ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          : <Paperclip className="mr-1.5 h-3.5 w-3.5" />}
                        Attach
                      </Button>

                      {hasSignature && (
                        <Button
                          variant="outline" size="sm" className="h-8"
                          aria-pressed={appendSignature}
                          data-state={appendSignature ? "on" : "off"}
                          onClick={() => setAppendSignature((s) => !s)}
                        >
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Signature {appendSignature ? "on" : "off"}
                        </Button>
                      )}

                      <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8">
                            <Clock className="mr-1.5 h-3.5 w-3.5" />
                            {scheduledFor ? "Scheduled" : "Schedule"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-64 space-y-1 p-2">
                          <button type="button"
                            className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                            onClick={() => { setScheduledFor(new Date(Date.now() + 3600_000).toISOString()); setScheduleOpen(false); }}>
                            In 1 hour
                          </button>
                          <button type="button"
                            className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
                              setScheduledFor(d.toISOString()); setScheduleOpen(false);
                            }}>
                            Tomorrow, 9:00 AM
                          </button>
                          <div className="px-2 pt-1">
                            <label className="text-[11px] text-muted-foreground">Custom</label>
                            <Input
                              type="datetime-local"
                              className="mt-1 h-9"
                              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const d = new Date(e.target.value);
                                if (d.getTime() > Date.now()) { setScheduledFor(d.toISOString()); setScheduleOpen(false); }
                              }}
                            />
                          </div>
                        </PopoverContent>
                      </Popover>

                      {scheduledFor && (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {new Date(scheduledFor).toLocaleString()}
                          <button type="button" onClick={() => setScheduledFor(null)}
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                            aria-label="Clear schedule">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </div>

                    {/* Compliance flags from Paige's draft — tokened, not raw amber (§11). */}
                    {draftFlags.length > 0 && (
                      <div className="flex items-start gap-1.5 rounded-md border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.08)] px-2.5 py-1.5 text-[11px] text-[hsl(var(--warning))]">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span><span className="font-medium">Check before sending:</span> {draftFlags.join(" · ")}</span>
                      </div>
                    )}

                    {/* Send row */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {selected.toAddress ? `To ${selected.toAddress}` : "No address on this thread"}
                      </span>
                      <Button
                        variant="gold" size="sm" onClick={send}
                        disabled={sending || drafting || uploading || !body.trim() || !selected.toAddress}
                        className="h-9"
                      >
                        {sending
                          ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          : scheduledFor
                            ? <Clock className="mr-1.5 h-4 w-4" />
                            : <Send className="mr-1.5 h-4 w-4" />}
                        {scheduledFor ? "Schedule" : editingDraftId ? "Send edited" : "Send"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SectionCard>

        {/* ── RIGHT: contact rail ───────────────────────────────────────────────── */}
        {selected && railOpen && (
          <ContactCardRail
            contact={selectedThread?.clients ?? null}
            channel={selected.channel}
            toAddress={selected.toAddress}
            recentMessages={selected.messages}
            labels={selectedThread?.labels ?? []}
            suppressions={suppressions}
            userId={userId}
            tenantId={tenantIdRef.current}
            onClose={() => setRailOpen(false)}
            onChanged={() => { void load(); void loadThreads(); void refreshSuppressions(); }}
          />
        )}
      </div>

      {/* §43 — compose a NEW outbound thread (reuses the send-message seam + canonical
          thread key so it merges cleanly with any later inbound reply). */}
      <ComposeThreadDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        activeConnectors={activeConnectors}
        tenantId={tenantIdRef.current}
        onSent={(key) => {
          // §36 proactive surfacing: drop any filter that would hide the just-created thread,
          // then reload. pendingSelectRef holds the pick until the new row streams in, so the
          // keep-valid-selection guard can't clobber it to visibleThreads[0] first (race fix).
          pendingSelectRef.current = key;
          setView("active"); setLabelFilter(null); setSearch("");
          void load(); void loadThreads();
        }}
      />
    </PageShell>
  );
}
