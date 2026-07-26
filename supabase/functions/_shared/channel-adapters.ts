// =============================================================================
// Comms Slice C-1 — channel adapter contract (the ONE shape every channel maps to)
// =============================================================================
// NormalizedMessage is the canonical row shape for public.messages: every channel
// (email now; sms/whatsapp/instagram/facebook/voice in C-2..C-5) normalizes its
// provider payload INTO this on inbound, and renders FROM this on outbound. The
// jsonb sender/recipients/attachments/meta generalize across channels where a
// flat email "to_address" would not (SMS/voice "to" is a phone; IG is a handle).
//
// §18: this is the single home for the channel abstraction — inbound adapters
// (handle-inbound-email etc.) and the outbound dispatcher (send-message) both
// reason over this contract; no per-channel bespoke shape.
// §32: the C-1 email path routes THROUGH this registry so the abstraction is
// exercised live, not merely compiled.
// =============================================================================

export type ChannelType =
  | "email"
  | "sms"
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "voice";

export type MessageDirection = "inbound" | "outbound";

export type MessageStatus =
  | "draft"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "received"
  | "read";

/** One party on a message — an email address, a phone number, or a channel handle. */
export interface MessageParty {
  address: string;
  display_name?: string;
}

export interface MessageAttachment {
  url: string;
  mime?: string;
  name?: string;
}

/**
 * The canonical unified-inbox message. Maps 1:1 to public.messages columns.
 * tenant_id is intentionally omitted from the adapter contract — it is SERVER
 * DERIVED by the set_message_tenant() trigger from the connector/contact (§9),
 * never carried in from a provider payload.
 */
export interface NormalizedMessage {
  thread_key: string;
  channel_type: ChannelType;
  direction: MessageDirection;
  status?: MessageStatus;
  contact_id?: string | null;
  connector_id?: string | null;
  sender?: MessageParty | null;
  recipients?: MessageParty[];
  subject?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  attachments?: MessageAttachment[];
  provider_message_id?: string | null;
  in_reply_to_provider_id?: string | null;
  action_id?: string | null;
  meta?: Record<string, unknown>;
  sent_at?: string | null;
}

/** The result of an outbound send through a provider. */
export interface Delivery {
  ok: boolean;
  provider_message_id?: string | null;
  status: MessageStatus;
  error?: string | null;
}

/**
 * Per-channel send constraints the composer/Send button reasons over (§36).
 * Channels with session windows / quiet hours / template rules (WhatsApp, SMS)
 * fill these; email has none, so its adapter returns null.
 */
export interface SendConstraints {
  mustUseTemplate: boolean;
  windowClosesAt: string | null; // ISO — after this, a fresh outbound needs a template/opt-in
  requiresHumanEdit: boolean;
  quietHoursTz: string | null;
  maxLength: number | null;
}

/** A thread context enough to compute constraints (last inbound time, channel, connector). */
export interface ThreadContext {
  channel_type: ChannelType;
  connector_id?: string | null;
  last_inbound_at?: string | null;
  config?: Record<string, unknown>;
}

/** Inbound: a raw provider webhook event -> a NormalizedMessage (direction 'inbound'). */
export interface InboundChannelAdapter {
  channel_type: ChannelType;
  onEvent(raw: unknown): NormalizedMessage;
}

/** Outbound: a NormalizedMessage -> a provider send. `send` performs the provider call. */
export interface OutboundChannelAdapter {
  channel_type: ChannelType;
  send(msg: NormalizedMessage, ctx: OutboundSendContext): Promise<Delivery>;
  /** null = no constraints (email). Non-null for windowed/limited channels. */
  getSendConstraints(thread: ThreadContext): SendConstraints | null;
}

/** What the dispatcher hands an outbound adapter to actually perform the send. */
export interface OutboundSendContext {
  from: MessageParty;          // resolved tenant sender identity (§38 tenant-owned)
  to: string;                  // primary recipient address/phone/handle
  replyTo?: string | null;
  providerApiKey?: string | null;
  vaultCredentials?: Record<string, string> | null; // per-tenant creds (SMS subaccount, etc.)
  connectorConfig?: Record<string, unknown> | null;
}

// -----------------------------------------------------------------------------
// Registries — the one place channel adapters are looked up (§18 one home).
// C-1 registers only email; C-2..C-5 add their adapters here, no new dispatcher.
// -----------------------------------------------------------------------------
const INBOUND = new Map<ChannelType, InboundChannelAdapter>();
const OUTBOUND = new Map<ChannelType, OutboundChannelAdapter>();

export function registerInboundAdapter(a: InboundChannelAdapter): void {
  INBOUND.set(a.channel_type, a);
}
export function registerOutboundAdapter(a: OutboundChannelAdapter): void {
  OUTBOUND.set(a.channel_type, a);
}
export function getInboundAdapter(ch: ChannelType): InboundChannelAdapter | undefined {
  return INBOUND.get(ch);
}
export function getOutboundAdapter(ch: ChannelType): OutboundChannelAdapter | undefined {
  return OUTBOUND.get(ch);
}

/** Compute constraints for a thread via its channel's outbound adapter (null if none / unknown). */
export function getSendConstraints(thread: ThreadContext): SendConstraints | null {
  return OUTBOUND.get(thread.channel_type)?.getSendConstraints(thread) ?? null;
}
