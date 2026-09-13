import { describe, expect, it } from "vitest";
import { normalizeSignupMobile, signupPhoneCountryOptions } from "./signupMobile";

describe("normalizeSignupMobile", () => {
  it("accepts ordinary ten-digit US numbers without requiring +1", () => {
    expect(normalizeSignupMobile("4244575247", "US")).toBe("+14244575247");
    expect(normalizeSignupMobile("(424) 457-5247", "US")).toBe("+14244575247");
  });

  it("accepts an explicitly entered US country code", () => {
    expect(normalizeSignupMobile("1 424 457 5247", "US")).toBe("+14244575247");
    expect(normalizeSignupMobile("+1 (424) 457-5247", "US")).toBe("+14244575247");
  });

  it("uses the selected country for a local international number", () => {
    expect(normalizeSignupMobile("020 7946 0958", "GB")).toBe("+442079460958");
    expect(normalizeSignupMobile("02 9374 4000", "AU")).toBe("+61293744000");
  });

  it("lets an explicit international prefix override the selector", () => {
    expect(normalizeSignupMobile("+44 20 7946 0958", "US")).toBe("+442079460958");
  });

  it("rejects missing and invalid input", () => {
    expect(normalizeSignupMobile("", "US")).toBeNull();
    expect(normalizeSignupMobile("555-1212", "US")).toBeNull();
  });

  it("offers a labeled international country list with calling codes", () => {
    const countries = signupPhoneCountryOptions("en");
    expect(countries.length).toBeGreaterThan(200);
    expect(countries).toContainEqual({ code: "US", label: "United States", callingCode: "+1" });
    expect(countries).toContainEqual({ code: "GB", label: "United Kingdom", callingCode: "+44" });
  });
});