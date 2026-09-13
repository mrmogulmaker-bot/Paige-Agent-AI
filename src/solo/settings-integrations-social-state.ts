type SocialCardInput = {
  loading: boolean;
  statusError: string | null;
  connections: Array<{ status: string }>;
  accounts: Array<{ status: string }>;
};

export function socialCardState(social: SocialCardInput) {
  if (social.loading) return { account: "Checking…", tone: "neutral" as const };
  if (social.statusError) return { account: "Status unavailable", tone: "warn" as const };
  if (social.accounts.some((account) => account.status === "connected")) {
    const count = social.accounts.filter((account) => account.status === "connected").length;
    return { account: `${count} verified ${count === 1 ? "account" : "accounts"}`, tone: "ok" as const };
  }
  if (social.connections.some((connection) => connection.status === "authorizing" || connection.status === "setup_required")) {
    return { account: "Setup not finished", tone: "neutral" as const };
  }
  if (social.connections.some((connection) => connection.status === "needs_reauth" || connection.status === "error")) {
    return { account: "Needs attention", tone: "warn" as const };
  }
  return { account: "Setup required", tone: "neutral" as const };
}
