/**
 * Paige AI Pricing Configuration
 * Maps plan slugs to Stripe price IDs and product IDs
 */

export const PRICING_CONFIG = {
  starter: {
    priceId: "price_1SIHEnKPsmWO0z4Ov62sBqVg",
    productId: "prod_TEkkzqf6jscnks",
    amount: 4700, // $47.00
    name: "Starter",
  },
  professional: {
    priceId: "price_1SIHEyKPsmWO0z4OaFaUwl58",
    productId: "prod_TEkk3Vr0rtOzrW",
    amount: 9700, // $97.00
    name: "Professional",
  },
  premium: {
    priceId: "price_1SIHF7KPsmWO0z4OXier2L7d",
    productId: "prod_TEkk1OV31G4sSk",
    amount: 19700, // $197.00
    name: "Premium",
  },
  enterprise: {
    priceId: "price_1SIHFGKPsmWO0z4O268FATQ8",
    productId: "prod_TEkkY2JB9BWsth",
    amount: 49700, // $497.00 (custom pricing available)
    name: "Enterprise",
  },
} as const;

export type PlanSlug = keyof typeof PRICING_CONFIG;

export function getPriceId(planSlug: PlanSlug): string {
  return PRICING_CONFIG[planSlug].priceId;
}

export function getProductId(planSlug: PlanSlug): string {
  return PRICING_CONFIG[planSlug].productId;
}
