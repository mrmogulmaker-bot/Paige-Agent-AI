import { describe, expect, it } from "vitest";
import {
  SOLO_BETA_OFFER_CODE,
  SOLO_BETA_PRODUCT_NAME,
  validateSoloBetaOffer,
  type SoloBetaOfferValidationInput,
} from "../../../supabase/functions/_shared/solo-beta-offer";
import {
  readInvoiceSubscriptionId,
  readSubscriptionItemPeriod,
} from "../../../supabase/functions/_shared/solo-beta-stripe-shapes";

const exact = (overrides: Partial<SoloBetaOfferValidationInput> = {}): SoloBetaOfferValidationInput => ({
  offerCode: SOLO_BETA_OFFER_CODE,
  purpose: "checkout_fulfillment",
  livemode: false,
  configuredProductId: "prod_beta",
  configuredPriceId: "price_beta_monthly",
  observedProductId: "prod_beta",
  observedPriceId: "price_beta_monthly",
  priceActive: true,
  unitAmountCents: 7_450,
  currency: "usd",
  recurring: { interval: "month", intervalCount: 1 },
  trialEnd: null,
  subscriptionStatus: "active",
  ...overrides,
});

describe("Solo Beta Stripe contract", () => {
  it("accepts only the approved named test offer", () => {
    expect(SOLO_BETA_PRODUCT_NAME).toBe("Paige Solo Beta");
    expect(validateSoloBetaOffer(exact()).ok).toBe(true);
  });

  it.each([
    ["live mode", { livemode: true }],
    ["wrong product", { observedProductId: "prod_other" }],
    ["wrong price", { observedPriceId: "price_other" }],
    ["wrong amount", { unitAmountCents: 14_900 }],
    ["wrong currency", { currency: "eur" }],
    ["annual interval", { recurring: { interval: "year", intervalCount: 1 } }],
    ["multi-month interval", { recurring: { interval: "month", intervalCount: 12 } }],
    ["trial", { trialEnd: 1_900_000_000 }],
    ["unverified status", { subscriptionStatus: "incomplete" }],
  ] satisfies Array<[string, Partial<SoloBetaOfferValidationInput>]>)(("fails closed for %s"), (_label, mutation) => {
    expect(validateSoloBetaOffer(exact(mutation)).ok).toBe(false);
  });

  it("reads billing periods from Basil subscription items and rejects malformed periods", () => {
    expect(readSubscriptionItemPeriod({
      current_period_start: 1_700_000_000,
      current_period_end: 1_702_592_000,
    })).toEqual({
      start: "2023-11-14T22:13:20.000Z",
      end: "2023-12-14T22:13:20.000Z",
    });
    expect(readSubscriptionItemPeriod({ current_period_start: 20, current_period_end: 10 })).toBeNull();
    expect(readSubscriptionItemPeriod(null)).toBeNull();
  });

  it("reads invoice subscriptions only from the Basil subscription parent", () => {
    expect(readInvoiceSubscriptionId({
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_beta" } },
    })).toBe("sub_beta");
    expect(readInvoiceSubscriptionId({ parent: { type: "quote_details" } })).toBeNull();
  });
});
