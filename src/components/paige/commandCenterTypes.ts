// Shared shapes for the "Your Paige" command center (cc-spec §2 / §6). The
// selector emits a FocusedClient; WorkspaceBody holds it and derives focusProse
// so the chat side (focus banner) and the rail (mini-card) never disagree.

export interface FocusedClient {
  id: string;
  name: string;
  entity: string | null;
  email: string | null;
  stage: string | null;
}

/** A quick-action chip above the composer (cc-spec §3). */
export interface QuickChip {
  label: string;
  prompt: string;
  /** Only "What needs my attention?" auto-sends; everything else prefills. */
  autoSend?: boolean;
  /** Chip only appears when a customer is focused (e.g. "Summarize this customer"). */
  visibleWhenFocused?: boolean;
}

/** First name only, for the focused relabels ("Needs your approval · {First}"). */
export function firstNameOf(client: Pick<FocusedClient, "name"> | null): string {
  if (!client?.name) return "";
  return client.name.trim().split(/\s+/)[0] ?? "";
}

/** The prose Paige reads so a focused customer scopes her actions (cc-spec §2.a). */
export function buildFocusProse(client: FocusedClient | null): string | undefined {
  if (!client) return undefined;
  return (
    `The operator is focused on this customer. Name: ${client.name}. ` +
    `Business: ${client.entity ?? "—"}. Stage: ${client.stage ?? "—"}. ` +
    `Email: ${client.email ?? "—"}. When they ask you to act, act on this customer ` +
    `unless they say otherwise.`
  );
}
