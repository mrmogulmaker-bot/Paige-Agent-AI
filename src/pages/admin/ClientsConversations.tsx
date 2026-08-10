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
  PanelRight, Bell, Plus, PlugZap, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PageShell, SectionCard, EmptyState, StatePill } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

import {
  type ChannelType, type MessageRow, type DbThread, type Label,
  type ThreadFilter, type Suppression, type SelectedView, type InboxView, type EmailTemplate,
  MESSAGE_COLS, THREAD_COLS, CHANNEL_ICON, CHANNEL_LABEL,
  partyLabel, bodyPreview, msgTime, contactNameFromClient,
  INBOX_VIEWS, endOfTodayMs, readSendResult, resolveMergeVars, UNDO_WINDOW_MS,
  useCommsAttachments,
} from "./conversations/inbox-shared";
import { ComposeThreadDialog } from "./conversations/ComposeThreadDialog";
import { FirstRunOnboarding } from "./conversations/FirstRunOnboarding";
import { ThreadRow } from "./conversations/ThreadRow";
import { ThreadFilters, useLabelCatalog } from "./conversations/ThreadFilters";
import { ContactCardRail } from "./conversations/ContactCardRail";
import { readableMessageBody, shouldFoldEmail } from "./conversations/messageReading";
// Shared conversation atoms (§18 one home) — the SAME bubble the operator Fleet inbox renders.
import { MessageBubble as SharedMessageBubble } from "./conversations/MessageBubble";
import { SnoozeMenu } from "./conversations/SnoozeMenu";
import { LabelPopover } from "./conversations/LabelPopover";
import { QuickAddDialog } from "@/components/planning/QuickAddDialog";
import { appendDictation } from "@/lib/voice/useDictation";
// The extracted three-column conversation SHELL + its scope-adapter contract (§18 one home) —
// the tenant container feeds this the SAME shell the operator Fleet inbox will feed (Phase 2).
import { ConversationsThreeColumnShell } from "./conversations/shell/ConversationsThreeColumnShell";
import { ConversationsThreadList } from "./conversations/shell/ConversationsThreadList";
import { ConversationsRichComposer } from "./conversations/shell/ConversationsRichComposer";
import { ConversationsContactPanel } from "./conversations/shell/ConversationsContactPanel";
import type {
  ConversationsCapabilities, ConversationsListModel, ConversationsComposerModel,
  ConversationsContactPanelModel, ShellThread, DraftTone,
} from "./conversations/shell/conversationsAdapter";

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
// UNDO_WINDOW_MS + the comms-attachment bucket/cap/upload hook now live in inbox-shared
// (§18 — the compose-new modal uploads through the exact same seam).

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
// resolveMergeVars now lives in inbox-shared (§18 one home — the compose-new modal + the
// ported email-template picker resolve merge vars through the exact same helper).

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
  const isDraft = m.status === "draft";
  const body = readableMessageBody(m);

  // A Paige draft is a distinct, approval-forcing card — never a plain sent bubble (§36). This
  // gold "Approve & send" card IS an act (gold is earned), so it stays a TENANT-SIDE wrapper and
  // is deliberately NOT pushed into the shared, gold-free MessageBubble atom (§11 gold only on
  // the act; the atom's contract keeps it gold-free).
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

  // Every non-draft message renders through the SHARED atom (§18 one home) so the tenant inbox
  // and the operator Fleet inbox never drift into divergent bubbles (§6). The tenant's richer
  // affordances — email subject, attachment chips, foldable long email bodies, the scheduled-cancel
  // control — inject through the atom's OPTIONAL presentational props; the only tenant-local part is
  // the raw MessageRow → props mapping below.
  return (
    <SharedMessageBubble
      direction={m.direction}
      body={body}
      timestamp={m.sent_at ?? m.created_at}
      senderLabel={m.direction === "outbound" ? "You" : partyLabel(m.sender) || "Client"}
      status={messageStatusPill(m)}
      error={m.status === "failed" ? m.error : null}
      subject={m.subject ?? undefined}
      foldable={shouldFoldEmail(m.channel_type, body)}
      attachments={
        m.attachments?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {m.attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <Paperclip className="h-3 w-3" /> {a.name || "attachment"}
              </span>
            ))}
          </div>
        ) : undefined
      }
      footer={
        // R-B1/R3: a queued scheduled outbound is findable + cancellable in the thread.
        m.status === "queued" && m.scheduled_for ? (
          <button
            type="button"
            onClick={() => onCancelScheduled(m.id)}
            className="text-[11px] text-muted-foreground underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          >
            Scheduled for {new Date(m.scheduled_for).toLocaleString()} · Cancel
          </button>
        ) : undefined
      }
    />
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

  // #121 GHL-parity list UX now lives INSIDE the extracted ConversationsThreadList (§18):
  // density (+ its localStorage persistence), sort, multi-select, and the Gmail-style keyboard
  // cursor are all list-internal. The container keeps only the single OPEN-thread selection.
  const paneRef = useRef<HTMLDivElement>(null);         // Enter focuses the thread pane
  useEffect(() => { setContactDrawerOpen(false); }, [selectedKey]);

  // C-1.5 threads-as-source-of-truth
  const [dbThreads, setDbThreads] = useState<DbThread[]>([]);
  const [view, setView] = useState<InboxView>("active");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [matchedKeys, setMatchedKeys] = useState<Set<string> | null>(null); // null = no active search
  const [searching, setSearching] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  // §43 — compose a NEW outbound thread (the surface is a tool, not just a viewer).
  const [composeOpen, setComposeOpen] = useState(false);
  // When the composer is opened from a Client-360 "Message {name}" deep-link, pre-address it.
  const [composeContact, setComposeContact] = useState<{ id: string; name?: string } | null>(null);
  // Gate the ?contact deep-link on a real first threads pull, so an empty (not-yet-loaded)
  // dbThreads never gets read as "no thread exists" (which would wrongly open the composer).
  const [threadsReady, setThreadsReady] = useState(false);

  // Composer state (reply into the selected thread)
  const [composeChannel, setComposeChannel] = useState<ChannelType | "">("");
  const [composeConnectorId, setComposeConnectorId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  // Latest body, so the dictation callback appends onto current text without a
  // stale closure (it feeds THROUGH handleBodyChange so snippet expansion still runs).
  const bodyRef = useRef("");
  useEffect(() => { bodyRef.current = body; }, [body]);
  const [sending, setSending] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Composer depth state. Attachments run through the ONE shared upload seam (§18) — the
  // exact hook the compose-new modal uses — reading the resolved tenant from the ref below.
  const tenantIdRef = useRef<string | null>(null);
  const {
    attachments, uploading, uploadFiles, removeAttachment,
    reset: resetAttachments,
  } = useCommsAttachments(() => tenantIdRef.current);
  const [dragOver, setDragOver] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null); // ISO | null
  const [, setUndo] = useState<{ messageId: string; expiresAt: number } | null>(null);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]); // ported email-template picker (§31)
  const [appendSignature, setAppendSignature] = useState(true); // email only, default on

  // "Draft with Paige" (#482 Phase-1): on-demand reply drafting via the subagent-email-composer
  // seam (§18 — the same seam the compose-new modal uses). Email-only for Phase-1 (the composer is an
  // EMAIL composer; SMS-native drafting is a fast-follow, §13 — don't route SMS through it and
  // pretend it's SMS-native). Draft-first, one-click, non-gold assist (§36/§11).
  const [drafting, setDrafting] = useState(false);
  // #176 — truthful label: true only while a draft-with-Paige call is ALSO reading staged
  // document(s). Drives the "Reading attachment…" button state; never claimed with no doc.
  const [draftReadingDoc, setDraftReadingDoc] = useState(false);
  const [draftFlags, setDraftFlags] = useState<string[]>([]);
  // The Draft-with-Paige guide popover (guide + tone), the schedule popover open state, and the
  // hidden file input now live INSIDE the extracted ConversationsRichComposer (§18); guide/tone
  // arrive as call args on onDraftWithPaige below.
  // #482 Phase-2 — the current operator's auth id, so the thread-header "Set a reminder"
  // quick action can file a plan row (plan_set_reminder is keyed to the caller). Server-derived.
  const [userId, setUserId] = useState<string | null>(null);

  // ── Deep-link: read ?filter=<view> once; unknown slug → keep default (never blank). ─
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const v = searchParams.get("filter");
    if (v && (INBOX_VIEWS as string[]).includes(v)) setView(v as InboxView);
  }, [searchParams]);

  // Command Center and other Paige-governed entry points can open the ONE
  // existing compose surface directly; no duplicate quick-email modal.
  useEffect(() => {
    if (searchParams.get("compose") === "1") {
      setComposeContact(null);
      setComposeOpen(true);
    }
  }, [searchParams]);

  // ── message pull (500-row) + connectors + composer resources (R2: one reconciled load) ─
  const load = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [msgRes, connRes, snipRes, sigRes, tplRes, tidRes] = await Promise.all([
      sb.from("messages").select(MESSAGE_COLS).order("sent_at", { ascending: false, nullsFirst: true }).limit(500),
      sb.from("channel_connectors").select("id, channel_type, provider, display_name, from_address, from_name, inbound_address, status, active").order("created_at", { ascending: true }),
      sb.from("snippets").select("id, user_id, trigger, name, body, variables"),
      sb.from("signatures").select("id, user_id, name, html, variables, is_default"),
      sb.from("email_templates").select("template_key, subject, body_markdown, body_html, category").eq("active", true).order("category"),
      sb.rpc("current_user_tenant_id"),
    ]);
    if (msgRes.error) toast.error("Couldn't load conversations.");
    setRows((msgRes.data as unknown as MessageRow[]) ?? []);
    setConnectors((connRes.data as unknown as Connector[]) ?? []);
    setSnippets((snipRes.data as unknown as Snippet[]) ?? []);
    setSignatures((sigRes.data as unknown as Signature[]) ?? []);
    setTemplates((tplRes.data as unknown as EmailTemplate[]) ?? []);
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
    setThreadsReady(true); // gate the ?contact deep-link on a real first threads pull
  }, [baseFilter]);

  // ── first-run existence probe (UNFILTERED, §9 RLS-scoped) ──────────────────────────
  // `loadThreads` filters by the current VIEW (active/archived/snoozed), so dbThreads being
  // empty means "no threads in THIS view", NOT "the account has no threads". First-run must
  // key off whether the tenant has ANY thread in ANY state — otherwise an account with only
  // archived/snoozed threads lands on the default active view, sees zero, and gets the
  // onboarding surface in place of the whole inbox (incl. ThreadFilters), trapping those
  // existing conversations out of reach. null = not yet known (never flash onboarding early).
  const [accountHasThreads, setAccountHasThreads] = useState<boolean | null>(null);
  const checkAccountHasThreads = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count, error } = await (supabase as any).from("threads")
      .select("thread_key", { count: "exact", head: true });
    if (!error) setAccountHasThreads((count ?? 0) > 0);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadThreads(); }, [loadThreads]);
  useEffect(() => { void checkAccountHasThreads(); }, [checkAccountHasThreads]);

  // ── Deep-link: ?contact=<id> — the Client-360 "Message {name}" action lands here (§18: the
  // Conversations hub is the ONE comms home now that the old ContactCommsPanel is retired).
  // Declared AFTER loadThreads so the dep array reads an initialized binding (no TDZ, TS2448).
  // Once the first threads pull is in: if a thread already exists for that contact, auto-select
  // it via the same pendingSelectRef machinery a fresh compose uses; if none exists yet, open the
  // composer pre-addressed to the contact. Handled once per contact-id so realtime thread updates
  // don't re-fire it (mirrors the ?filter= pattern above). ─────────────────────────────────────
  const contactSeekHandledRef = useRef<string | null>(null);
  useEffect(() => {
    const cid = searchParams.get("contact");
    if (!cid || !cid.trim()) return;
    if (!threadsReady) return;                          // wait for a real first threads pull
    if (contactSeekHandledRef.current === cid) return;  // act on each contact-param exactly once
    contactSeekHandledRef.current = cid;
    const match = dbThreads.find((t) => t.contact_id === cid);
    if (match) {
      pendingSelectRef.current = match.thread_key;
      setView("active"); setLabelFilter(null); setSearch("");
      void loadThreads(); // re-pull bumps dbThreads → the keep-valid-selection guard honors the pick
      return;
    }
    // Not in the active set — the contact's ONLY thread may be ARCHIVED or SNOOZED (both excluded by
    // the default active pull), so probe the threads table directly (tenant-scoped by RLS, §9) before
    // falling back to a fresh compose. If any thread exists, switch to the "all" view (which surfaces
    // archived/snoozed) and hold the pick; only compose when the contact genuinely has no thread (§13).
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("threads")
        .select("thread_key").eq("contact_id", cid)
        .order("last_message_at", { ascending: false, nullsFirst: false }).limit(1);
      const key = (data as { thread_key: string }[] | null)?.[0]?.thread_key ?? null;
      if (key) {
        pendingSelectRef.current = key;
        setView("all"); setLabelFilter(null); setSearch("");
        void loadThreads();
      } else {
        setComposeContact({ id: cid });
        setComposeOpen(true);
      }
    })();
  }, [searchParams, threadsReady, dbThreads, loadThreads]);

  // ── realtime: messages + threads (§7 two-way, live unread/snooze/archive) ───────────
  useEffect(() => {
    const chM = supabase.channel("comms_inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => { void load(); void loadThreads(); })
      .subscribe();
    const chT = supabase.channel("comms_threads")
      .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, () => { void loadThreads(); void checkAccountHasThreads(); })
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

  // §36 proactive pull: threads sitting in the folded draft-first views (Drafts /
  // Awaiting reply) still tug the eye — badge the "More" chip trigger with their count
  // (#148 foldout) so collapsing those moat views to reclaim space never buries the
  // draft-first surfacing. Predicate mirrors viewPredicate's drafts/awaiting cases.
  const foldedPending = useMemo(() => {
    let n = 0;
    for (const t of dbThreads) {
      if (t.archived_at) continue;
      if (t.snoozed_until && new Date(t.snoozed_until).getTime() > nowMs) continue;
      const msgs = messagesByKey.get(t.thread_key) ?? [];
      const isDraft = msgs.some((m) => m.status === "draft" && m.direction === "outbound");
      const isAwaiting = t.last_direction === "outbound" && !!t.last_message_at
        && (nowMs - new Date(t.last_message_at).getTime()) > 3 * 864e5;
      if (isDraft || isAwaiting) n++;
    }
    return n;
  }, [dbThreads, messagesByKey, nowMs]);

  // ── visible threads: state filter is server-side; search + label + view client-side. The FINAL sort
  // now lives INSIDE ConversationsThreadList (§18) over the normalized threads — the container
  // hands the rail the already-filtered list in recent order (the list's default), and the list
  // re-sorts per the user's chosen mode. The only order-dependent consumer left here is the
  // keep-valid-selection fallback (visibleThreads[0]); the default recent order matches the
  // shipped behavior, so auto-selection is unchanged (§13 zero regression).
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
  // ONE loader, guarded by a monotonic request id so the LATEST request always wins — whether
  // triggered by a selection change (the effect) or a rail DND toggle (refreshSuppressions).
  // A rail toggle changes suppressions WITHOUT changing contact_id, so the selection effect alone
  // wouldn't refresh; and without the shared guard a slow toggle-read for contact A could clobber
  // a newer read for contact B, staling the pre-send opt-out guard. The shared counter closes both
  // races cleanly (§13). Server-side pre-send remains authoritative regardless.
  const suppReqRef = useRef(0);
  const loadSuppressionsFor = useCallback(async (cid: string | null) => {
    const req = ++suppReqRef.current;
    if (!cid) { if (req === suppReqRef.current) setSuppressions([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data } = await sb.from("paige_suppressions").select("channel, reason").eq("contact_id", cid);
    if (req === suppReqRef.current) setSuppressions((data as Suppression[]) ?? []);
  }, []);
  useEffect(() => { void loadSuppressionsFor(selectedThread?.contact_id ?? null); }, [selectedThread?.contact_id, loadSuppressionsFor]);
  const refreshSuppressions = useCallback(
    () => loadSuppressionsFor(selectedThread?.contact_id ?? null),
    [loadSuppressionsFor, selectedThread?.contact_id],
  );

  // Default the composer channel to the thread's channel when a connector supports it.
  useEffect(() => {
    if (!selected) return;
    const threadConnector = activeConnectors.find(
      (c) => c.id === selected.connectorId && c.channel_type === selected.channel,
    );
    const fallbackConnector = activeConnectors.find((c) => c.channel_type === selected.channel)
      ?? activeConnectors[0]
      ?? null;
    const chosenConnector = threadConnector ?? fallbackConnector;
    setComposeConnectorId(chosenConnector?.id ?? "");
    setComposeChannel(chosenConnector?.channel_type ?? "");
    setEditingDraftId(null);
    setSubject("");
    setBody("");
  }, [selectedKey, selected, activeConnectors]);

  // Scroll the thread to the newest message on change.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [selectedKey, selected?.messages.length, reduce]);

  // ── Thread-state mutations ──────────────────────────────────────────────────────────
  const optimisticThread = (id: string, patch: Partial<DbThread>) =>
    setDbThreads((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  // Each seam returns a success boolean and honors { silent } so the bulk runner (#121) can
  // reuse the EXACT same path in a loop and report honestly (§13) without per-row toast spam.
  // Single callers ignore the return + get their toast — behavior unchanged.
  type MutOpts = { silent?: boolean };
  const snoozeThread = async (id: string, until: Date | string | null, opts?: MutOpts): Promise<boolean> => {
    const iso = until == null ? null : typeof until === "string" ? until : until.toISOString();
    optimisticThread(id, { snoozed_until: iso });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("threads").update({ snoozed_until: iso }).eq("id", id);
    if (error) { if (!opts?.silent) toast.error("Couldn't snooze that thread."); void loadThreads(); return false; }
    if (!opts?.silent) toast.success(iso ? "Snoozed." : "Back in your inbox.");
    return true;
  };
  const archiveThread = async (id: string, on: boolean, opts?: MutOpts): Promise<boolean> => {
    const iso = on ? new Date().toISOString() : null;
    optimisticThread(id, { archived_at: iso });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("threads").update({ archived_at: iso }).eq("id", id);
    if (error) { if (!opts?.silent) toast.error("Couldn't update that thread."); void loadThreads(); return false; }
    if (!opts?.silent) toast.success(on ? "Archived." : "Moved to inbox.");
    return true;
  };
  // #4 delete-conversation (Option A: Archive-with-Delete-UX). The trash SOFT-ARCHIVES
  // via the §10-callable delete_conversation RPC (§39 audit row written server-side).
  // §9: JWT caller → tenant is server-derived inside the DEFINER fn; we NEVER pass
  // _tenant_id from the client. Optimistic archive locally; on error/false, reload.
  const deleteConversation = async (id: string): Promise<boolean> => {
    optimisticThread(id, { archived_at: new Date().toISOString() });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("delete_conversation", { _thread_id: id });
    if (error || data === false) { toast.error("Couldn't remove that conversation."); void loadThreads(); return false; }
    // Definitive delete: drop it from local state NOW so it leaves the inbox immediately and the
    // selection-validity effect can't reselect it — don't wait on Realtime convergence (which the
    // active view relies on, since visibleThreads doesn't itself filter archived_at). Reversible
    // toggles (snooze/archive) keep the optimistic patch; a delete is a leave-the-list action.
    setDbThreads((prev) => prev.filter((t) => t.id !== id));
    toast.success("Conversation removed to Archive.");
    return true;
  };
  const markThreadRead = async (id: string, opts?: MutOpts): Promise<boolean> => {
    optimisticThread(id, { unread_count: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("threads").update({ unread_count: 0 }).eq("id", id);
    if (error) { void loadThreads(); return false; }
    return true;
  };
  const setThreadLabels = async (threadId: string, labels: Label[], opts?: MutOpts): Promise<boolean> => {
    optimisticThread(threadId, { labels });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("threads").update({ labels }).eq("id", threadId);
    if (error) { if (!opts?.silent) toast.error("Couldn't save labels."); void loadThreads(); return false; }
    return true;
  };
  const renameCatalogLabel = async (labelId: string, patch: Partial<Label>) => {
    const affected = dbThreads.filter((t) => (t.labels ?? []).some((l) => l.id === labelId));
    await Promise.all(affected.map((t) =>
      setThreadLabels(t.id, (t.labels ?? []).map((l) => (l.id === labelId ? { ...l, ...patch } : l)))));
  };

  const selectThread = (key: string) => {
    setSelectedKey(key);
    // The Gmail-style keyboard cursor lives in ConversationsThreadList and follows the open
    // thread there; multi-select, bulk, and keyboard nav are all list-internal now (§18).
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

  // Attachment upload/remove now come from useCommsAttachments (§18 one home) — the
  // compose-new modal uploads through the identical seam, so the two can never drift.

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
    setBody(""); setSubject(""); resetAttachments();
    setScheduledFor(null); setEditingDraftId(null);
  }, [resetAttachments]);

  // ── Insert a saved email template (ported from the retired ContactCommsPanel, §31) — resolves
  //    {{merge}} vars against the selected thread's contact and lands subject+body for review/edit.
  //    A fresh reply, never an edit of the passive draft row. ({{coach_name}} isn't in the thread
  //    merge context, so it drops to "" — the signature carries the sign-off, §13-honest note.) ──
  const applyTemplate = useCallback((key: string) => {
    const t = templates.find((x) => x.template_key === key);
    if (!t) return;
    const ctx = mergeContext(selected);
    setEditingDraftId(null);
    setSubject(resolveMergeVars(t.subject ?? "", ctx));
    setBody(resolveMergeVars(t.body_markdown || (t.body_html ? t.body_html.replace(/<[^>]+>/g, "") : ""), ctx));
  }, [templates, selected]);

  // ── (b)+(c) ONE send body builder + ONE dispatch that reads outcome (§37) ────────
  const buildSendBody = useCallback((overrides: { scheduled_for?: string } = {}) => {
    const conn = activeConnectors.find((c) => c.id === composeConnectorId && c.channel_type === composeChannel) ?? null;
    if (!conn) throw new Error("Choose an active sending address.");
    const html = composeChannel === "email" ? bodyWithSignature(body.trim()) : body.trim();
    return {
      channel: composeChannel,
      to: selected!.toAddress,
      subject: composeChannel === "email" ? subject.trim() : undefined,
      body: html,
      contact_id: selected!.contactId ?? undefined,
      thread_key: selected!.key,
      connector_id: conn.id,
      message_id: editingDraftId ?? undefined,
      attachments: attachments.length ? attachments : undefined,      // contract §2
      ...(overrides.scheduled_for ? { scheduled_for: overrides.scheduled_for } : {}),
    };
  }, [composeChannel, composeConnectorId, activeConnectors, bodyWithSignature, body, selected, subject,
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
  const draftWithPaige = useCallback(async ({ guide, tone }: { guide: string; tone: DraftTone }) => {
    if (!selected) return;
    // §13: never silently discard the coach's typed reply. Only draft into an empty body.
    if (body.trim()) {
      toast.error("You've already started a reply — clear it first to draft with Paige.");
      return;
    }
    setDrafting(true);
    setDraftFlags([]);
    // #176 — the document(s) the coach wants Paige to consider are the attachments STAGED
    // into this composer (guaranteed comms-attachments object paths `${tenantId}/…`, so the
    // server's §9 prefix guard can enforce them). Inbound provider-hosted attachments are
    // remote URLs, not storage objects — out of scope for this path (honest caveat).
    const attachmentPaths = attachments.map((a) => a.url).filter((u): u is string => !!u);
    setDraftReadingDoc(attachmentPaths.length > 0);
    try {
      // §36 context: the client's most recent inbound message (capped so a long thread
      // doesn't blow the prompt budget — verifier #6).
      const lastInbound = [...selected.messages].reverse().find((m) => m.direction === "inbound");
      const lastText = lastInbound ? bodyPreview(lastInbound).slice(0, 1500) : "";

      const { data, error } = await supabase.functions.invoke("subagent-email-composer", {
        body: {
          input: {
            intent: guide.trim() || "Write a reply to the client's most recent message in this conversation.",
            tone,
            length: "medium",
            key_points: [lastText ? `Client's last message: ${lastText}` : ""].filter(Boolean),
            contact_id: selected.contactId ?? undefined,
            recipient_name: selected.name || undefined,
            recipient_email: selected.toAddress || undefined,
            format: "html",
            // Only send when present; the server §9-guards each path against the caller's tenant.
            attachment_paths: attachmentPaths.length ? attachmentPaths : undefined,
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
      // §13 honesty (critic): don't let a generic "drafted" success imply the attachment was
      // used when it wasn't. Compare what the server actually READ to what was staged — if a
      // staged doc couldn't be read, say so plainly instead of claiming "Reading attachment…".
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const readCount = Number((data as any)?.attachments_read ?? 0);
      if (attachmentPaths.length > 0 && readCount < attachmentPaths.length) {
        const missed = attachmentPaths.length - readCount;
        toast.warning(
          readCount === 0
            ? "Paige drafted a reply, but couldn't read the attached file — review before you send."
            : `Paige drafted a reply, but couldn't read ${missed} of the attached files — review before you send.`,
        );
      } else {
        toast.success("Paige drafted a reply — review before you send.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Paige couldn't draft that — try again.");
    } finally {
      setDrafting(false);
      setDraftReadingDoc(false);
    }
  }, [selected, body, subject, attachments]);

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

  // The GENUINE first-run zero-state (§36): the account has no threads at all AND nothing is
  // narrowing the view — no active search, no label filter, the default "active" view. Only then
  // do we show the one guided FirstRunOnboarding surface. A search-no-match or a filtered/archived/
  // snoozed empty keeps its own dedicated EmptyState inside the rail/pane (untouched below).
  const isFirstRun =
    threadsReady && !loading && !searching &&
    accountHasThreads === false &&   // UNFILTERED — no threads in ANY state, not just this view
    matchedKeys === null &&
    search.trim() === "" &&
    view === "active" &&
    labelFilter === null;

  // ── Shell wiring (§18 extract-not-fork): normalize the tenant's threads / messages /
  //    connectors + existing seams onto the scope-adapter the extracted three-column shell
  //    consumes. Every tenant capability is ON — this is the full-fidelity tenant scope. ─────
  const capabilities: ConversationsCapabilities = {
    canDraftWithPaige: true,
    canSchedule: true,
    hasTemplates: true,
    hasSignature: true,
    hasAttachments: true,
    hasContactBusinessPanels: true,
  };

  // visibleThreads (DbThread, already view+label+search filtered) → the shell's normalized shape.
  // `raw` hands each row's DbThread straight back to renderRow so the EXISTING ThreadRow renders
  // at full fidelity (§13/§37 zero regression). Fields mirror what ThreadRow itself resolves.
  const shellThreads: ShellThread<DbThread>[] = visibleThreads.map((t) => {
    const p = previewByKey.get(t.thread_key) ?? null;
    return {
      id: t.id,
      key: t.thread_key,
      title:
        contactNameFromClient(t.clients) ||
        (p ? partyLabel(p.direction === "inbound" ? p.sender : p.recipients?.[0]) : "") ||
        "Unknown contact",
      lastPreview: p ? (bodyPreview(p) || p.subject || "") : "",
      unread: t.unread_count,
      lastMessageAt: t.last_message_at,
      lastDirection: t.last_direction,
      labels: t.labels ?? [],
      snoozedUntil: t.snoozed_until,
      archivedAt: t.archived_at,
      channel: p?.channel_type ?? "email",
      hasDraft: p?.status === "draft",
      scheduled: p?.status === "queued" && !!p.scheduled_for,
      raw: t,
    };
  });

  // LEFT-rail list model — the container owns the DATA (server state filter, view predicate,
  // label filter, search matched-keys, the thread mutators); the list owns the PRESENTATION
  // (sort, density, select-all, multi-select, Gmail keyboard cursor, bulk toolbar). renderRow
  // reuses the EXISTING ThreadRow verbatim (its SnoozeMenu/LabelPopover intact) so the rich row
  // never changed (§37). resetKey bumps on view/label/search → the list resets selection + cursor.
  const listModel: ConversationsListModel<DbThread> = {
    threads: shellThreads,
    loading,
    searching,
    search,
    onSearch: setSearch,
    matchedEmpty: matchedKeys?.size === 0,
    selectedKey,
    onSelect: selectThread,
    onOpenFocus: () => paneRef.current?.focus(),
    snooze: snoozeThread,
    archive: archiveThread,
    markRead: markThreadRead,
    setLabels: setThreadLabels,
    labelCatalog,
    resetKey: `${view}|${labelFilter ?? ""}|${search}`,
    renderRow: (t, ctx) => (
      <ThreadRow
        key={t.id}
        thread={t.raw}
        preview={previewByKey.get(t.key) ?? null}
        channel={previewByKey.get(t.key)?.channel_type ?? "email"}
        active={ctx.active}
        cursored={ctx.cursored}
        onClick={ctx.onClick}
        catalog={labelCatalog}
        onSnooze={snoozeThread}
        onArchive={archiveThread}
        onSetThreadLabels={setThreadLabels}
        onRenameCatalogLabel={renameCatalogLabel}
        density={ctx.density}
        selected={ctx.selected}
        selectionActive={ctx.selectionActive}
        onToggleSelect={ctx.onToggleSelect}
      />
    ),
    renderFilters: () => (
      <ThreadFilters
        view={view} onView={setView} activeUnread={activeUnread} foldedPending={foldedPending}
        catalog={labelCatalog} labelFilter={labelFilter} onLabelFilter={setLabelFilter}
      />
    ),
    // §43 — start a NEW outbound thread (gold on the act, §11). With no sendable channel this is
    // NOT a dead disabled button — it routes to setup (§31 no dead-end; §36 the label tells a
    // non-technical coach exactly what to do). The first-run surface owns its own gold act.
    renderNewConversation: () =>
      !canCompose ? (
        <Button variant="gold" size="sm" className="w-full" asChild>
          <Link to="/admin/integrations/email">
            <PlugZap className="mr-1.5 h-4 w-4" /> Connect a channel
          </Link>
        </Button>
      ) : (
        <Button variant="gold" size="sm" className="w-full" onClick={() => setComposeOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New conversation
        </Button>
      ),
    // The view-dependent empty (archived / snoozed / active + connect CTA). The shell renders the
    // loading skeleton and the search-no-match state itself; this fills the "rows in no view" slot.
    renderEmpty: () => (
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
                // Secondary (outline), not gold — the always-visible left-rail "New conversation"
                // at the top of this column is the ONE gold compose act (§11).
                <Button variant="outline" size="sm" onClick={() => setComposeOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" /> New conversation
                </Button>
              )
              : (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/admin/integrations/email">Connect a channel</Link>
                </Button>
              )
            : undefined
        }
        className="py-10"
      />
    ),
  };

  // Composer model — the container keeps ALL substantive values + seams (body, subject,
  // scheduledFor, attachments, drafting, send/draft/schedule); ConversationsRichComposer owns
  // only the transient popover state. Templates stay EMAIL-only (empty list on SMS) to preserve
  // the shipped gating without widening the static capability flag (§37). Dictation feeds THROUGH
  // handleBodyChange (via bodyRef, no stale closure) so #trigger snippet expansion still runs.
  const composerModel: ConversationsComposerModel | null = selected ? {
    capabilities,
    value: body,
    onChange: handleBodyChange,
    onSend: () => void send(),
    sending,
    disabled: drafting || uploading,
    placeholder: `Reply to ${selected.name}…  (drop a file to attach)`,
    rows: 2,
    sendLabel: scheduledFor ? "Schedule" : editingDraftId ? "Send edited" : "Send",
    note: selected.toAddress ? `To ${selected.toAddress}` : "No address on this thread",
    textareaClassName: "min-h-[4.5rem] focus:min-h-[6rem]",
    identities: activeConnectors.map((c) => ({
      id: c.id,
      label: c.display_name?.trim() || CHANNEL_LABEL[c.channel_type],
      sublabel: c.from_address,
      channel: c.channel_type,
    })),
    identityId: composeConnectorId,
    onIdentityChange: (id) => {
      const connector = activeConnectors.find((c) => c.id === id);
      setComposeConnectorId(id);
      setComposeChannel(connector?.channel_type ?? "");
    },
    showSubject: composeChannel === "email",
    subject,
    onSubjectChange: setSubject,
    attachments,
    uploading,
    onAttachFiles: (files) => void uploadFiles(files),
    onRemoveAttachment: (a) => void removeAttachment(a),
    showDraftWithPaige: composeChannel === "email",
    onDraftWithPaige: ({ guide, tone }) => void draftWithPaige({ guide, tone }),
    drafting,
    draftReadingDoc,
    draftFlags,
    canDraft: !!selected.toAddress,
    templates: composeChannel === "email" ? templates : [],
    onApplyTemplate: applyTemplate,
    signatureAvailable: hasSignature,
    appendSignature,
    onToggleSignature: () => setAppendSignature((s) => !s),
    scheduledFor,
    onSchedule: setScheduledFor,
    showDictation: true,
    onDictate: (seg) => handleBodyChange(appendDictation(bodyRef.current, seg)),
    onDictateError: (msg) => toast.error(msg),
    editingDraft: !!editingDraftId,
    onCancelEdit: resetComposer,
    dragOver,
    onDropFiles: (f) => void uploadFiles(f),
    onDragOverZone: () => setDragOver(true),
    onDragLeaveZone: () => setDragOver(false),
  } : null;

  // RIGHT rail — the rich tenant ContactCardRail, reused UNCHANGED as a pass-through (§37). Two
  // instances differ only by onClose target (desktop rail toggle vs mobile Sheet).
  const contactPanelDesktop: ConversationsContactPanelModel | null = selected ? {
    hasContactBusinessPanels: true,
    renderRich: () => (
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
    ),
  } : null;
  const contactPanelMobile: ConversationsContactPanelModel | null = selected ? {
    hasContactBusinessPanels: true,
    renderRich: () => (
      <ContactCardRail
        contact={selectedThread?.clients ?? null}
        channel={selected.channel}
        toAddress={selected.toAddress}
        recentMessages={selected.messages}
        labels={selectedThread?.labels ?? []}
        suppressions={suppressions}
        userId={userId}
        tenantId={tenantIdRef.current}
        onClose={() => setContactDrawerOpen(false)}
        onChanged={() => { void load(); void loadThreads(); void refreshSuppressions(); }}
      />
    ),
  } : null;

  // MIDDLE pane — container-owned (it carries the tenant's draft-card MessageBubble wrapper + the
  // thread-header quick actions + the composer). Passed to the shell as the `activeThread` slot.
  const activeThread = (
    <SectionCard padded={false} bodyClassName="flex min-h-0 flex-1 flex-col" className="flex min-h-0 flex-col overflow-hidden">
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
          {/* Thread header — also the focus target when Enter is pressed in the rail (#121). */}
          <div
            ref={paneRef}
            tabIndex={-1}
            className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]"
          >
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
                icon-only ghost buttons; gold stays on Send/Approve (§11). */}
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
              {/* #4 delete-conversation — trash sits where GHL users expect it, in the thread
                  header (§36). Soft-archive via the RPC; destructive/red confirm, NEVER gold (§11). */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the conversation from your inbox. It stays in your Archive, where you can restore it anytime.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async () => {
                        const ok = await deleteConversation(selected.dbThread.id);
                        if (ok) setSelectedKey(null);
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {selected.hasDraft && <StatePill state="building">Draft ready</StatePill>}
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] xl:hidden"
              onClick={() => setContactDrawerOpen(true)}
              aria-label="Show contact details"
            >
              <PanelRight className="h-4 w-4" />
            </Button>
            {!railOpen && (
              <Button
                variant="ghost" size="icon"
                className="hidden h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] xl:inline-flex"
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

          {/* Composer — converged onto the shared MessageComposer atom via the extracted
              ConversationsRichComposer (§18/§6): the tenant's full affordance cluster injects
              through the shell's capability-gated slots; gold is spent once, on its Send act
              (the only other earned gold is the draft card's "Approve & send", kept tenant-side
              above). No sendable channel → the connect CTA replaces the composer entirely. */}
          <div className="mt-auto">
            {noChannel ? (
              <div className="border-t border-border/60 bg-muted/30 px-3 py-2">
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
                    <span>Connect a channel and Paige sends from here — inbound messages start landing in this inbox once a channel is live.</span>
                  </p>
                  {/* Secondary connect CTA → outline, so it never becomes a SECOND gold
                      "Connect a channel" co-visible with the rail-top gold one (§11 gold budget). */}
                  <Button variant="outline" size="sm" asChild className="shrink-0 self-start sm:self-auto">
                    <Link to="/admin/integrations/email">
                      <PlugZap className="mr-1.5 h-4 w-4" /> Connect a channel
                    </Link>
                  </Button>
                </div>
              </div>
            ) : composerModel ? (
              <ConversationsRichComposer {...composerModel} />
            ) : null}
          </div>
        </>
      )}
    </SectionCard>
  );

  return (
    <PageShell width="full" fill className="lg:flex-1 lg:overflow-hidden">
      <h1 className="sr-only">Conversations</h1>
      {/* The three-column conversation shell (§18 one home) — pure layout: the §36 first-run
          swap, the railOpen 3↔2-col toggle, and the mobile contact Sheet. The container feeds it
          the rendered LEFT rail, the container-owned MIDDLE pane, and the RIGHT contact panel. */}
      <ConversationsThreeColumnShell
        firstRun={
          <FirstRunOnboarding
            canCompose={canCompose}
            onCompose={() => setComposeOpen(true)}
            connectHref="/admin/integrations/email"
          />
        }
        showFirstRun={isFirstRun}
        threadList={<ConversationsThreadList {...listModel} />}
        activeThread={activeThread}
        contactPanel={contactPanelDesktop ? <ConversationsContactPanel {...contactPanelDesktop} /> : undefined}
        mobileContactPanel={contactPanelMobile ? <ConversationsContactPanel {...contactPanelMobile} /> : undefined}
        hasSelection={!!selected}
        railOpen={railOpen}
        mobileSheetOpen={contactDrawerOpen}
        onMobileSheetOpenChange={setContactDrawerOpen}
        mobileSheetTitle={selected?.name}
      />

      {/* §43 — compose a NEW outbound thread (reuses the send-message seam + canonical
          thread key so it merges cleanly with any later inbound reply). */}
      <ComposeThreadDialog
        open={composeOpen}
        onOpenChange={(v) => { setComposeOpen(v); if (!v) setComposeContact(null); }}
        activeConnectors={activeConnectors}
        tenantId={tenantIdRef.current}
        initialContact={composeContact ?? undefined}
        emailTemplates={templates}
        onSent={(key) => {
          // §36 proactive surfacing: drop any filter that would hide the just-created thread,
          // then reload. pendingSelectRef holds the pick until the new row streams in, so the
          // keep-valid-selection guard can't clobber it to visibleThreads[0] first (race fix).
          pendingSelectRef.current = key;
          setView("active"); setLabelFilter(null); setSearch("");
          void load(); void loadThreads();
          // Safety valve (§13): if the composed thread never streams in (e.g. a swallowed insert
          // on the send path returning success with no message row), don't freeze auto-selection
          // forever — after a bounded wait, release the hold and re-pull so the keep-valid guard
          // resumes its normal path. Guarded on the same key so a resolved/superseded pick is untouched.
          window.setTimeout(() => {
            if (pendingSelectRef.current === key) { pendingSelectRef.current = null; void loadThreads(); }
          }, 12_000);
        }}
      />
    </PageShell>
  );
}
