import { describe, expect, it } from "vitest";
import { shouldOfferAccountPicker } from "./accountSelection";

describe("shouldOfferAccountPicker", () => {
  it("offers the picker to an ordinary user with multiple active memberships", () => {
    expect(shouldOfferAccountPicker({ activeMembershipCount: 2, isPlatformStaff: false })).toBe(true);
  });

  it("sends a user with one membership directly to their workspace", () => {
    expect(shouldOfferAccountPicker({ activeMembershipCount: 1, isPlatformStaff: false })).toBe(false);
  });

  it("keeps platform operators on the operator routing path", () => {
    expect(shouldOfferAccountPicker({ activeMembershipCount: 8, isPlatformStaff: true })).toBe(false);
  });

  it("does not treat an empty or failed membership result as authorization", () => {
    expect(shouldOfferAccountPicker({ activeMembershipCount: 0, isPlatformStaff: false })).toBe(false);
  });
});
