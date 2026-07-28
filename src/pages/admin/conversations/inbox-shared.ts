// Shared substrate for the C-1 / C-1.5 inbox (§18 one home, §12 organized).
// The real public.messages row + the C-1.5 public.threads aggregate + tenant-authored
// label vocabulary + snooze presets. Queried via `supabase as any` (house pattern —
// threads/messages are not in generated types yet, #234/#470).
import {
  Mail, MessageSquare, MessageCircle, Instagram, Facebook, Phone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── message substrate (locked columns from public.messages) ────────────────────────
export type ChannelType = "email" | "sms" | "whatsapp" | "instagram" | "facebook" | "voice";
export type Direction = "inbound" | "outbound";
export type MsgStatus = "draft" | "queued" | "sent" | "delivered" | "failed" | "received" | "read";

export interface MessageParty { address?: string; display_name?: string }
export interface Attachment { url?: string; mime?: string; name?: string; size?: number }
export interface ClientJoin {
  first_name: string | null;
  last_name: string | null;
  entity_name: string | null;
  email: string | null;
}
export interface MessageRow {
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
  scheduled_for: string | null; // R7 — queued outbound release instant (drives scheduled view/pill/cancel)
  sent_at: string | null;
  created_at: string;
  clients: ClientJoin | null;
}

export const MESSAGE_COLS =
  "id, thread_key, contact_id, connector_id, channel_type, direction, status, sender, recipients, " +
  "subject, body_text, body_html, attachments, provider_message_id, in_reply_to_provider_id, " +
  "action_id, error, scheduled_for, sent_at, created_at, clients(first_name, last_name, entity_name, email)";

// ── C-1.5 threads aggregate (source of truth for order/unread/snooze/archive/labels) ─
export type ThreadFilter = "active" | "snoozed" | "archived" | "all";
export type LabelColor = "indigo" | "sky" | "violet" | "slate"; // token-only, NEVER gold (§11)
export interface Label { id: string; name: string; color: LabelColor }

export interface ClientContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  entity_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  timezone: string | null;
  created_at: string | null;
  // #482 Phase-2 — relationship facts pulled from the same clients row (self-contained, no extra query).
  lifecycle_stage: string | null;
  entity_type: string | null;
  title: string | null;
  source: string | null;
  tags: string[] | null;
  last_contacted_at: string | null;
  assigned_coach_user_id: string | null;
  // C-2 suppression / DND surfaced on the contact card (§ read-only signal)
  dnd_active: boolean | null;
  dnd_reason: string | null;
  dnd_until: string | null;
}
export interface DbThread {
  id: string;
  thread_key: string;
  contact_id: string | null;
  snoozed_until: string | null;
  archived_at: string | null;
  labels: Label[] | null;
  unread_count: number;
  last_message_at: string | null;
  last_direction: Direction | null;
  clients: ClientContact | null; // joined
}
export interface Suppression { channel: "sms" | "email"; reason: string }

// #482 Phase-2 — the Agents' log reads Paige's action-bus registry per contact for REAL
// attribution. RLS on paige_actions pins an authenticated coach/admin to their OWN tenant
// (tenant_id = current_user_tenant_id()), so the client read is honest + tenant-isolated (§9).
// §13 note: paige_llm_trace exists (shipped #489) but is task/agent/tenant-scoped with NO
// contact_id column, so it cannot power a per-CONTACT log — paige_actions.contact_id is the
// correct source; folding trace-level attribution in later is a tracked follow-up.
export interface PaigeActionRow {
  id: string; action_kind: string; title: string; summary: string | null;
  status: string; autonomy_lane: string; from_department: string; to_department: string;
  created_by_agent: string | null; assigned_subagent_slug: string | null;
  filed_at: string; drafted_at: string | null; executed_at: string | null;
  resolved_at: string | null; error: string | null;
}
export const PAIGE_ACTION_COLS =
  "id, action_kind, title, summary, status, autonomy_lane, from_department, to_department, " +
  "created_by_agent, assigned_subagent_slug, filed_at, drafted_at, executed_at, resolved_at, error";

// clients join carries dnd_* so the contact card reads the opt-out signal with NO extra fetch.
export const THREAD_COLS =
  "id, thread_key, contact_id, snoozed_until, archived_at, labels, unread_count, " +
  "last_message_at, last_direction, " +
  "clients:contact_id(id, first_name, last_name, entity_name, entity_type, title, email, phone, status, " +
  "lifecycle_stage, source, tags, last_contacted_at, assigned_coach_user_id, timezone, " +
  "created_at, dnd_active, dnd_reason, dnd_until)";

// ── selected-view shape (R1): the DbThread + its loaded messages + all the fields the
//    composer / approve / signature seams read. Typed once here, consumed in the page. ─
export interface SelectedView {
  key: string;
  dbThread: DbThread;
  messages: MessageRow[];
  channel: ChannelType;
  name: string;
  hasDraft: boolean;
  contactId: string | null;
  connectorId: string | null;
  toAddress: string;
}

// ── channel presentation ────────────────────────────────────────────────────────────
export const CHANNEL_ICON: Record<ChannelType, LucideIcon> = {
  email: Mail, sms: MessageSquare, whatsapp: MessageCircle,
  instagram: Instagram, facebook: Facebook, voice: Phone,
};
export const CHANNEL_LABEL: Record<ChannelType, string> = {
  email: "Email", sms: "SMS", whatsapp: "WhatsApp",
  instagram: "Instagram", facebook: "Facebook", voice: "Voice",
};

// ── label color tokens (token-only, non-gold, AA both themes §11/§23) ────────────────
export const LABEL_COLOR: Record<LabelColor, string> = {
  indigo: "border-[hsl(var(--primary)/0.45)] bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))]",
  sky:    "border-[hsl(var(--info)/0.45)] bg-[hsl(var(--info)/0.10)] text-[hsl(var(--info))]",
  violet: "border-[hsl(var(--primary-light)/0.5)] bg-[hsl(var(--primary-light)/0.12)] text-[hsl(var(--primary-light))]",
  slate:  "border-border bg-muted text-muted-foreground",
};
export const LABEL_DOT: Record<LabelColor, string> = {
  indigo: "bg-[hsl(var(--primary))]",
  sky:    "bg-[hsl(var(--info))]",
  violet: "bg-[hsl(var(--primary-light))]",
  slate:  "bg-muted-foreground",
};
export const LABEL_COLORS: LabelColor[] = ["indigo", "sky", "violet", "slate"];

// ── inbox view vocabulary (R3/R-B1): the four state filters PLUS the four derived
//    views the Command-Center tiles deep-link into (?filter=drafts|awaiting-reply|
//    waking-today|scheduled). A derived view rides on a base ThreadFilter server query
//    and narrows client-side via a predicate. Unknown slug → keep the default. ────────
export type InboxView = ThreadFilter | "unread" | "drafts" | "awaiting-reply" | "waking-today" | "scheduled";
export const INBOX_VIEWS: InboxView[] = [
  "active", "unread", "snoozed", "archived", "all", "drafts", "awaiting-reply", "waking-today", "scheduled",
];
export const FILTER_LABEL: Record<InboxView, string> = {
  active: "Active", unread: "Unread", snoozed: "Snoozed", archived: "Archived", all: "All",
  drafts: "Drafts", "awaiting-reply": "Awaiting reply", "waking-today": "Waking today",
  scheduled: "Scheduled",
};
/** End of the caller's local day, as an absolute epoch-ms instant. */
export const endOfTodayMs = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

// ── derivations ─────────────────────────────────────────────────────────────────────
export const partyLabel = (p?: MessageParty | null) =>
  p?.display_name?.trim() || p?.address?.trim() || "";
export const msgTime = (m: MessageRow) => new Date(m.sent_at ?? m.created_at).getTime();
export const bodyPreview = (m: MessageRow) =>
  (m.body_text || (m.body_html ? m.body_html.replace(/<[^>]+>/g, " ") : "") || "")
    .replace(/\s+/g, " ").trim();

/** contact-first display name (§36): client record → far-side jsonb → fallback. */
export function contactNameFromClient(c: ClientContact | ClientJoin | null): string {
  const named = c?.entity_name?.trim() || [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim();
  return named || "";
}

// ── snooze presets. "Until they reply" = far-future sentinel; the shipped inbound
//    trigger (trg_messages_upsert_thread) clears snoozed_until on the next inbound,
//    which IS "until they reply" — no fabricated flag column (§13/§31). ───────────────
export const SNOOZE_SENTINEL_UNTIL_REPLY = "9999-12-31T00:00:00.000Z";
export const isUntilReply = (iso: string | null) => iso === SNOOZE_SENTINEL_UNTIL_REPLY;

export function snoozePresets(now = new Date()): { key: string; label: string; until: Date }[] {
  const laterToday = new Date(now.getTime() + 3 * 3600_000);
  const at9 = (d: Date) => { d.setHours(9, 0, 0, 0); return d; };
  const addDaysTo = (target: number) => {
    const d = new Date(now);
    const delta = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + delta);
    return at9(d);
  };
  return [
    { key: "later", label: "Later today", until: laterToday },
    { key: "tomorrow", label: "Tomorrow, 9am", until: addDaysTo((now.getDay() + 1) % 7) },
    { key: "weekend", label: "This weekend", until: addDaysTo(6) }, // Sat
    { key: "nextweek", label: "Next week", until: addDaysTo(1) },   // Mon
  ];
}
