import { describe, it, expect } from "vitest";
import { readSalesPanel, salesPath, beginClientReturn, getClientReturn, completeClientReturn, consumeClientReturn, clearClientReturn } from "./sales-navigation";
describe("Sales bounded navigation", () => {
  it("accepts only a single exact panel enum", () => {
    expect(readSalesPanel("?panel=quick-offer")).toBe("quick-offer");
    for (const query of ["?panel=other", "?panel=quick-offer&panel=payment-handling", "?panel=https://evil.test", "?panel=Quick-Offer", "?panel="]) expect(readSalesPanel(query)).toBe(null);
    expect(salesPath("owner", "commercial-terms")).toBe("/solo/owner/growth/sales?panel=commercial-terms");
  });
  it("requires the initiating tenant and account for a one-time Client return", () => {
    clearClientReturn(); beginClientReturn("a", "one");
    expect(getClientReturn("b", "two")).toBe(false);
    completeClientReturn("b", "two", "foreign");
    expect(consumeClientReturn("a", "one")).toBe(null);
    expect(getClientReturn("a", "one")).toBe(false);
    beginClientReturn("a", "one");
    completeClientReturn("a", "one", "authorized-candidate");
    expect(consumeClientReturn("a", "one")).toBe("authorized-candidate");
    expect(consumeClientReturn("a", "one")).toBe(null);
    beginClientReturn("a", "one"); clearClientReturn();
    expect(getClientReturn("a", "one")).toBe(false);
  });
});
