export type SettingsTruth = "LIVE" | "PARTIAL" | "UNAVAILABLE" | "PROPOSED";

export type SoloSettingsKey =
  | "setup"
  | "team"
  | "connections"
  | "notifications"
  | "security-data"
  | "vault"
  | "billing";

export const SOLO_SETTINGS_DESTINATIONS: ReadonlyArray<{
  key: SoloSettingsKey;
  label: string;
  truth: SettingsTruth;
}> = [
  { key: "setup", label: "Setup", truth: "PARTIAL" },
  { key: "team", label: "Team", truth: "PARTIAL" },
  { key: "connections", label: "Connections", truth: "PARTIAL" },
  { key: "notifications", label: "Notifications", truth: "PARTIAL" },
  { key: "security-data", label: "Security & data", truth: "PARTIAL" },
  { key: "vault", label: "Vault", truth: "PROPOSED" },
  { key: "billing", label: "Billing", truth: "PARTIAL" },
] as const;

export type SoloSettingsEntry = {
  origin: "conversations" | "calendar";
  returnTo: string | null;
} | null;

/**
 * Return navigation is address-only UI state. It never supplies tenant authority: only the
 * server-resolved active tenant may do that. The exact account segment and destination are
 * allowlisted so a copied query cannot escape the active Solo workspace.
 */
export function resolveSoloSettingsEntry(search: string, accountNumber: string): SoloSettingsEntry {
  const params = new URLSearchParams(search);
  const origin = params.get("origin");
  if (origin !== "conversations" && origin !== "calendar") return null;

  const expected = origin === "conversations"
    ? `/solo/${accountNumber}/clients/conversations`
    : `/solo/${accountNumber}/clients/calendar`;
  return { origin, returnTo: params.get("returnTo") === expected ? expected : null };
}

/** A tiny epoch gate used by tenant-scoped readers to reject late responses after switching. */
export function createSettingsRequestGate() {
  let epoch = 0;
  return {
    begin() {
      epoch += 1;
      return epoch;
    },
    isCurrent(token: number) {
      return token === epoch;
    },
    clear() {
      epoch += 1;
    },
  };
}

