import type { ChannelType, DbThread, MessageRow } from "../inbox-shared";

export type CapabilityTruth = "LIVE" | "PARTIAL" | "UNAVAILABLE" | "PROPOSED";

export interface SoloConnectorEvidence {
  channel_type: ChannelType;
  active: boolean;
  status: string;
  from_address: string | null;
  provider?: string | null;
}

export interface SoloChannelTruth {
  id: string;
  label: string;
  availability: CapabilityTruth;
  identity: string;
  providerConnection: string;
  providerSource: string;
  sendPermission: string;
  inbound: string;
  webhookHealth: string;
  operationalHealth: string;
  a2p?: string;
  setupOwner: "Settings → Connections" | "Clients → Portal" | "Not available";
}

export function conversationNeedsAttention(
  thread: DbThread,
  messages: MessageRow[],
  nowMs = Date.now(),
): boolean {
  if (thread.archived_at) return false;
  if (thread.snoozed_until && new Date(thread.snoozed_until).getTime() > nowMs) return false;
  const hasDraft = messages.some((item) => item.direction === "outbound" && item.status === "draft");
  const overdueReply = thread.last_direction === "inbound"
    && !!thread.last_message_at
    && nowMs - new Date(thread.last_message_at).getTime() > 3 * 86_400_000;
  return thread.unread_count > 0 || hasDraft || overdueReply;
}

export function canSendInSolo(mode: "human" | "draft" | "governed", channel: string): boolean {
  return mode !== "governed" && (channel === "email" || channel === "sms");
}

export function buildSoloConversationLinks(account: string, contactId: string | null) {
  const safeAccount = encodeURIComponent(account);
  const base = `/solo/${safeAccount}`;
  const returnTo = `${base}/clients/conversations`;
  return {
    people: `${base}/clients/people${contactId ? `?person=${encodeURIComponent(contactId)}` : ""}`,
    portal: `${base}/clients/portal`,
    campaigns: `${base}/growth`,
    connections: `${base}/settings/connections?origin=conversations&returnTo=${encodeURIComponent(returnTo)}`,
  };
}

function connectorEvidence(connectors: SoloConnectorEvidence[], channel: ChannelType) {
  return connectors.find((item) => item.channel_type === channel && item.active && item.status === "active");
}

/**
 * The SMS half of the channel disclosure, from the ONE canonical resolver.
 *
 * Only the fields the resolver actually proves. Absent readiness leaves every
 * field exactly as it was — connector presence is still never upgraded into
 * A2P, webhook or operational proof, which is the contract
 * `soloConversationModel.test.ts` locks.
 */
export interface SoloCommsReadinessEvidence {
  can_send_sms: boolean;
  a2p: "approved" | "submitted" | "prepared" | "absent";
  number_e164: string | null;
  delivery: { state: "no_activity" | "delivering" | "mixed" | "failing"; last_inbound_at: string | null };
}

export function getSoloChannelTruth(
  connectors: SoloConnectorEvidence[],
  connectorReadReported = true,
  readiness?: SoloCommsReadinessEvidence | null,
): SoloChannelTruth[] {
  const truth = (
    id: string,
    label: string,
    channel?: ChannelType,
    availability: CapabilityTruth = "UNAVAILABLE",
  ): SoloChannelTruth => {
    const evidence = channel ? connectorEvidence(connectors, channel) : undefined;
    return {
      id,
      label,
      availability: evidence ? "PARTIAL" : availability,
      identity: evidence?.from_address?.trim() || "Not assigned",
      providerConnection: evidence ? "Connected" : connectorReadReported ? "Not connected" : "Not reported",
      providerSource: evidence?.provider?.trim() || "Not reported",
      sendPermission: "Not reported",
      inbound: "Not reported",
      webhookHealth: "Not reported",
      operationalHealth: "Not reported",
      setupOwner: "Settings → Connections",
    };
  };

  return [
    {
      ...truth("portal", "Portal", undefined, "PARTIAL"),
      identity: "Not applicable",
      providerConnection: "Not a proven message transport",
      providerSource: "Portal access",
      sendPermission: "Not proven",
      inbound: "Not proven",
      webhookHealth: "Not applicable",
      setupOwner: "Clients → Portal",
    },
    truth("email", "Email", "email", "PARTIAL"),
    {
      ...truth("sms", "SMS", "sms", "PARTIAL"),
      // Readiness fills ONLY what it proves. Without it every field stays
      // "Not reported" — the disclosure never infers permission from a connector.
      ...(readiness
        ? {
            identity: readiness.number_e164 ?? "Not assigned",
            sendPermission: readiness.can_send_sms
              ? "Permitted to send"
              : "Not permitted — setup incomplete",
            a2p:
              readiness.a2p === "approved" ? "Approved"
              : readiness.a2p === "submitted" ? "Filed with carriers"
              : readiness.a2p === "prepared" ? "Prepared, not submitted"
              : "Not registered",
            inbound: readiness.delivery.last_inbound_at ? "Replies received" : "No replies received",
            operationalHealth:
              readiness.delivery.state === "delivering" ? "Delivering"
              : readiness.delivery.state === "no_activity" ? "Nothing sent yet"
              : readiness.delivery.state === "mixed" ? "Some messages did not arrive"
              : "Messages are not arriving",
            // Deliberately still NOT reported: nothing in this repository records
            // webhook registration health, so claiming it would be a fabrication.
            webhookHealth: "Not reported",
          }
        : { a2p: "Not reported" }),
    },
    truth("voice", "Phone / outbound voice", "voice", "PARTIAL"),
    {
      ...truth("video", "Video calling", undefined, "UNAVAILABLE"),
      identity: "Not applicable",
      providerConnection: "Unavailable",
      providerSource: "Unavailable",
      sendPermission: "Not applicable",
      inbound: "Not applicable",
      webhookHealth: "Not applicable",
      operationalHealth: "Unavailable",
      setupOwner: "Not available",
    },
    truth("instagram", "Instagram", "instagram", "PARTIAL"),
    truth("facebook", "Facebook / Messenger", "facebook", "PARTIAL"),
    {
      ...truth("apple-business", "Apple Messages for Business", undefined, "UNAVAILABLE"),
      identity: "Not applicable",
      providerConnection: "Unavailable",
      providerSource: "Business channel only; ordinary consumer iMessage is not offered",
      sendPermission: "Not applicable",
      inbound: "Not applicable",
      webhookHealth: "Not applicable",
      operationalHealth: "Unavailable",
      setupOwner: "Not available",
    },
  ];
}

export interface AccountEpochToken { account: string | null; epoch: number }

export function createAccountEpochGuard(initialAccount: string | null) {
  let account = initialAccount;
  let epoch = 0;
  return {
    capture: (): AccountEpochToken => ({ account, epoch }),
    advance: (nextAccount: string | null) => { account = nextAccount; epoch += 1; },
    accept: (token: AccountEpochToken) => token.account === account && token.epoch === epoch,
  };
}
