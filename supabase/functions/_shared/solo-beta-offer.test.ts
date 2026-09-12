import {
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";

import {
  SOLO_BETA_OFFER_CODE,
  validateSoloBetaOffer,
  type SoloBetaOfferValidationInput,
} from "./solo-beta-offer.ts";

const validOffer = (
  overrides: Partial<SoloBetaOfferValidationInput> = {},
): SoloBetaOfferValidationInput => ({
  offerCode: SOLO_BETA_OFFER_CODE,
  purpose: "checkout_fulfillment",
  livemode: false,
  configuredProductId: "prod_solo_beta",
  configuredPriceId: "price_solo_beta_monthly",
  observedProductId: "prod_solo_beta",
  observedPriceId: "price_solo_beta_monthly",
  priceActive: true,
  unitAmountCents: 7_450,
  currency: "usd",
  recurring: { interval: "month", intervalCount: 1 },
  trialEnd: null,
  subscriptionStatus: "active",
  ...overrides,
});

Deno.test("Solo Beta offer accepts the exact approved test-mode monthly offer", () => {
  assertEquals(validateSoloBetaOffer(validOffer()), {
    ok: true,
    offer: {
      code: "paige-solo-beta-monthly-v1",
      providerMode: "test",
      productId: "prod_solo_beta",
      priceId: "price_solo_beta_monthly",
      unitAmountCents: 7_450,
      currency: "usd",
      interval: "month",
      intervalCount: 1,
      subscriptionStatus: "active",
    },
  });
});

Deno.test("Solo Beta offer rejects live-mode evidence", () => {
  assertEquals(validateSoloBetaOffer(validOffer({ livemode: true })), {
    ok: false,
    code: "provider_mode_not_test",
  });
});

Deno.test("Solo Beta offer requires its canonical offer code", () => {
  assertEquals(validateSoloBetaOffer(validOffer({ offerCode: "solo-monthly" })), {
    ok: false,
    code: "offer_code_mismatch",
  });
});

Deno.test("Solo Beta offer fails closed when product identity is missing or mismatched", () => {
  assertEquals(
    validateSoloBetaOffer(validOffer({ configuredProductId: null })),
    { ok: false, code: "product_identity_missing" },
  );
  assertEquals(
    validateSoloBetaOffer(validOffer({ observedProductId: "prod_other" })),
    { ok: false, code: "product_identity_mismatch" },
  );
});

Deno.test("Solo Beta offer fails closed when price identity is missing or mismatched", () => {
  assertEquals(
    validateSoloBetaOffer(validOffer({ configuredPriceId: null })),
    { ok: false, code: "price_identity_missing" },
  );
  assertEquals(
    validateSoloBetaOffer(validOffer({ observedPriceId: "price_other" })),
    { ok: false, code: "price_identity_mismatch" },
  );
  assertEquals(validateSoloBetaOffer(validOffer({ priceActive: false })), {
    ok: false,
    code: "price_not_active",
  });
});

Deno.test("Solo Beta offer requires exactly 7450 usd", () => {
  assertEquals(validateSoloBetaOffer(validOffer({ unitAmountCents: 7_449 })), {
    ok: false,
    code: "amount_mismatch",
  });
  assertEquals(validateSoloBetaOffer(validOffer({ currency: "eur" })), {
    ok: false,
    code: "currency_mismatch",
  });
});

Deno.test("Solo Beta offer requires monthly recurring interval count one", () => {
  assertEquals(validateSoloBetaOffer(validOffer({ recurring: null })), {
    ok: false,
    code: "recurring_required",
  });
  assertEquals(
    validateSoloBetaOffer(
      validOffer({ recurring: { interval: "year", intervalCount: 1 } }),
    ),
    { ok: false, code: "interval_mismatch" },
  );
  assertEquals(
    validateSoloBetaOffer(
      validOffer({ recurring: { interval: "month", intervalCount: 12 } }),
    ),
    { ok: false, code: "interval_count_mismatch" },
  );
});

Deno.test("Solo Beta offer rejects any trial", () => {
  assertEquals(validateSoloBetaOffer(validOffer({ trialEnd: 1_800_000_000 })), {
    ok: false,
    code: "trial_not_allowed",
  });
  assertEquals(validateSoloBetaOffer(validOffer({ trialEnd: 0 })).ok, true);
});

Deno.test("checkout fulfillment requires an active subscription", () => {
  for (const status of ["past_due", "canceled", "trialing", "incomplete"]) {
    const result = validateSoloBetaOffer(
      validOffer({ subscriptionStatus: status }),
    );
    assertFalse(result.ok);
    assertEquals(result.code, "subscription_status_not_eligible");
  }
});

Deno.test("lifecycle sync recognizes active plus entitlement-revoking paid states", () => {
  for (const subscriptionStatus of ["active", "past_due", "canceled", "unpaid", "paused"]) {
    assertEquals(
      validateSoloBetaOffer(
        validOffer({ purpose: "lifecycle_sync", subscriptionStatus }),
      ).ok,
      true,
    );
  }

  for (const subscriptionStatus of [
    "trialing",
    "incomplete",
    "incomplete_expired",
  ]) {
    assertEquals(
      validateSoloBetaOffer(
        validOffer({ purpose: "lifecycle_sync", subscriptionStatus }),
      ),
      { ok: false, code: "subscription_status_not_eligible" },
    );
  }
});
