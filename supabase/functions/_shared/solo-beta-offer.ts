/**
 * Immutable, provider-observation validator for the approved Solo Beta offer.
 *
 * This module deliberately does not read environment variables or grant access.
 * Callers must supply both configured identifiers and fresh Stripe evidence.
 */

export const SOLO_BETA_OFFER_CODE = "paige-solo-beta-monthly-v1" as const;
export const SOLO_BETA_PRODUCT_NAME = "Paige Solo Beta" as const;
export const SOLO_BETA_UNIT_AMOUNT_CENTS = 7_450 as const;
export const SOLO_BETA_CURRENCY = "usd" as const;
export const SOLO_BETA_INTERVAL = "month" as const;
export const SOLO_BETA_INTERVAL_COUNT = 1 as const;

export type SoloBetaValidationPurpose =
  | "checkout_fulfillment"
  | "lifecycle_sync";

export type SoloBetaOfferErrorCode =
  | "offer_code_mismatch"
  | "provider_mode_not_test"
  | "product_identity_missing"
  | "product_identity_mismatch"
  | "price_identity_missing"
  | "price_identity_mismatch"
  | "price_not_active"
  | "amount_mismatch"
  | "currency_mismatch"
  | "recurring_required"
  | "interval_mismatch"
  | "interval_count_mismatch"
  | "trial_not_allowed"
  | "subscription_status_not_eligible";

export interface SoloBetaOfferValidationInput {
  offerCode: string | null;
  purpose: SoloBetaValidationPurpose;
  livemode: boolean | null;
  configuredProductId: string | null;
  configuredPriceId: string | null;
  observedProductId: string | null;
  observedPriceId: string | null;
  priceActive: boolean | null;
  unitAmountCents: number | null;
  currency: string | null;
  recurring: {
    interval: string | null;
    intervalCount: number | null;
  } | null;
  trialEnd: number | null;
  subscriptionStatus: string | null;
}

export interface ValidatedSoloBetaOffer {
  code: typeof SOLO_BETA_OFFER_CODE;
  providerMode: "test";
  productId: string;
  priceId: string;
  unitAmountCents: typeof SOLO_BETA_UNIT_AMOUNT_CENTS;
  currency: typeof SOLO_BETA_CURRENCY;
  interval: typeof SOLO_BETA_INTERVAL;
  intervalCount: typeof SOLO_BETA_INTERVAL_COUNT;
  subscriptionStatus: "active" | "past_due" | "canceled" | "unpaid" | "paused";
}

export type SoloBetaOfferValidationResult =
  | { ok: true; offer: ValidatedSoloBetaOffer }
  | { ok: false; code: SoloBetaOfferErrorCode };

const LIFECYCLE_STATUSES = new Set(["active", "past_due", "canceled", "unpaid", "paused"]);

function missingIdentifier(value: string | null): boolean {
  return value === null || value.length === 0;
}

/**
 * Verifies that fresh provider evidence is exactly the owner-approved test offer.
 * It is intentionally fail-closed and returns stable, non-sensitive error codes.
 */
export function validateSoloBetaOffer(
  input: SoloBetaOfferValidationInput,
): SoloBetaOfferValidationResult {
  if (input.offerCode !== SOLO_BETA_OFFER_CODE) {
    return { ok: false, code: "offer_code_mismatch" };
  }
  if (input.livemode !== false) {
    return { ok: false, code: "provider_mode_not_test" };
  }
  if (
    missingIdentifier(input.configuredProductId) ||
    missingIdentifier(input.observedProductId)
  ) {
    return { ok: false, code: "product_identity_missing" };
  }
  if (input.configuredProductId !== input.observedProductId) {
    return { ok: false, code: "product_identity_mismatch" };
  }
  if (
    missingIdentifier(input.configuredPriceId) ||
    missingIdentifier(input.observedPriceId)
  ) {
    return { ok: false, code: "price_identity_missing" };
  }
  if (input.configuredPriceId !== input.observedPriceId) {
    return { ok: false, code: "price_identity_mismatch" };
  }
  if (input.purpose === "checkout_fulfillment" && input.priceActive !== true) {
    return { ok: false, code: "price_not_active" };
  }
  if (input.unitAmountCents !== SOLO_BETA_UNIT_AMOUNT_CENTS) {
    return { ok: false, code: "amount_mismatch" };
  }
  if (input.currency !== SOLO_BETA_CURRENCY) {
    return { ok: false, code: "currency_mismatch" };
  }
  if (input.recurring === null) {
    return { ok: false, code: "recurring_required" };
  }
  if (input.recurring.interval !== SOLO_BETA_INTERVAL) {
    return { ok: false, code: "interval_mismatch" };
  }
  if (input.recurring.intervalCount !== SOLO_BETA_INTERVAL_COUNT) {
    return { ok: false, code: "interval_count_mismatch" };
  }
  if (input.trialEnd !== null && input.trialEnd !== 0) {
    return { ok: false, code: "trial_not_allowed" };
  }

  const statusEligible = input.purpose === "checkout_fulfillment"
    ? input.subscriptionStatus === "active"
    : input.subscriptionStatus !== null &&
      LIFECYCLE_STATUSES.has(input.subscriptionStatus);

  if (!statusEligible) {
    return { ok: false, code: "subscription_status_not_eligible" };
  }

  return {
    ok: true,
    offer: {
      code: SOLO_BETA_OFFER_CODE,
      providerMode: "test",
      productId: input.configuredProductId as string,
      priceId: input.configuredPriceId as string,
      unitAmountCents: SOLO_BETA_UNIT_AMOUNT_CENTS,
      currency: SOLO_BETA_CURRENCY,
      interval: SOLO_BETA_INTERVAL,
      intervalCount: SOLO_BETA_INTERVAL_COUNT,
      subscriptionStatus: input.subscriptionStatus as
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "paused",
    },
  };
}
