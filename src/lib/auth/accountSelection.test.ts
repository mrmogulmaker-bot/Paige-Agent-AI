import { describe, expect, it } from "vitest";
import { shouldOfferAccountPicker, shouldPauseForWorkspaceChoiceAtLogin } from "./accountSelection";

describe("shouldOfferAccountPicker", () => {
  it("offers the picker to an ordinary user with multiple active memberships", () => {
    expect(shouldOfferAccountPicker({ activeMembershipCount: 2, isPlatformStaff: false })).toBe(true);
  });

  it("keeps the in-workspace switch control hidden for one membership", () => {
    expect(shouldOfferAccountPicker({ activeMembershipCount: 1, isPlatformStaff: false })).toBe(false);
  });

  it("pauses an established user at login with one active membership", () => {
    expect(shouldPauseForWorkspaceChoiceAtLogin({ activeMembershipCount: 1, isPlatformStaff: false })).toBe(true);
  });

  it("does not invent a login choice without membership or Platform authority", () => {
    expect(shouldPauseForWorkspaceChoiceAtLogin({ activeMembershipCount: 0, isPlatformStaff: false })).toBe(false);
  });

  it("pauses platform staff at the chooser even with no direct tenant membership", () => {
    expect(shouldOfferAccountPicker({ activeMembershipCount: 0, isPlatformStaff: true })).toBe(true);
  });

  it("pauses platform staff at the chooser when tenant memberships are also available", () => {
    expect(shouldOfferAccountPicker({ activeMembershipCount: 8, isPlatformStaff: true })).toBe(true);
  });

  it("does not treat an empty or failed membership result as authorization", () => {
    expect(shouldOfferAccountPicker({ activeMembershipCount: 0, isPlatformStaff: false })).toBe(false);
  });
});
