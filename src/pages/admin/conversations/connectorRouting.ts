import type { ChannelType } from "./inbox-shared";

export interface RoutableConnector {
  id: string;
  channel_type: ChannelType;
}

/**
 * One exact connector-selection rule for new conversations.
 * A channel label is never enough when a tenant can have managed, custom,
 * Gmail, and SMTP senders at the same time.
 */
export function selectComposeConnector<T extends RoutableConnector>(
  connectors: T[],
  connectorId: string,
  channel: ChannelType | "",
): T | null {
  if (!connectorId || !channel) return null;
  return connectors.find(
    (connector) => connector.id === connectorId && connector.channel_type === channel,
  ) ?? null;
}
