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

export function getSoloChannelTruth(connectors: SoloConnectorEvidence[], connectorReadReported = true): SoloChannelTruth[] {
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
    { ...truth("sms", "SMS", "sms", "PARTIAL"), a2p: "Not reported" },
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
