import { describe, expect, it } from "vitest";
import {
  SOLO_SETTINGS_DESTINATIONS,
  createSettingsRequestGate,
  resolveSoloSettingsEntry,
} from "./settings-contract";

describe("Solo Settings ownership contract", () => {
  it("locks the approved customer-facing taxonomy and truth labels", () => {
    expect(SOLO_SETTINGS_DESTINATIONS.map(({ key, label, truth }) => [key, label, truth])).toEqual([
      ["setup", "Setup", "PARTIAL"],
      ["team", "Team", "PARTIAL"],
      ["connections", "Connections", "PARTIAL"],
      ["notifications", "Notifications", "PARTIAL"],
      ["security-data", "Security & data", "PARTIAL"],
      ["vault", "Vault", "PROPOSED"],
      ["billing", "Billing", "PARTIAL"],
    ]);
  });

  it("accepts only Conversations or Calendar return paths for the active Solo address", () => {
    expect(resolveSoloSettingsEntry(
      "?origin=conversations&returnTo=%2Fsolo%2F42%2Fclients%2Fconversations",
      "42",
    )).toEqual({ origin: "conversations", returnTo: "/solo/42/clients/conversations" });
    expect(resolveSoloSettingsEntry(
      "?origin=calendar&returnTo=%2Fsolo%2F42%2Fclients%2Fcalendar",
      "42",
    )).toEqual({ origin: "calendar", returnTo: "/solo/42/clients/calendar" });
    expect(resolveSoloSettingsEntry(
      "?origin=calendar&returnTo=https%3A%2F%2Fevil.example%2Fsteal",
      "42",
    )).toEqual({ origin: "calendar", returnTo: null });
    expect(resolveSoloSettingsEntry(
      "?origin=conversations&returnTo=%2Fsolo%2F99%2Fclients%2Fconversations",
      "42",
    )).toEqual({ origin: "conversations", returnTo: null });
  });

  it("invalidates an old account request before the next account settles", () => {
    const gate = createSettingsRequestGate();
    const first = gate.begin();
    const second = gate.begin();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    gate.clear();
    expect(gate.isCurrent(second)).toBe(false);
  });
});
