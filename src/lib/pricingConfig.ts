/**
 * Paige AI Pricing Configuration
 *
 * Maps plan slugs to Stripe price IDs and product IDs.
 *
 * Tier names + prices were updated 2026-04-18 as part of the funding-
 * intelligence repositioning (see paige_repositioning_spec.md §6).
 *
 * Old (legacy, kept for grandfathered subscribers): starter $47,
 * professional $97, premium $197, enterprise $497.
 *
 * New: Starter $49 / Growth $149 / Scale $397 / Broker $497 / Enterprise custom.
 */

export const PRICING_CONFIG = {
  starter: {
    priceId: "price_1TNQjuKPsmWO0z4OdXmm1eKe",
    productId: "prod_UM91vlT3xo5hX5",
    amount: 4900, // $49.00
    name: "Starter",
  },
  growth: {
    priceId: "price_1TNQl4KPsmWO0z4OxxVgQcEZ",
    productId: "prod_UM93Wgfmi9OrxI",
    amount: 14900, // $149.00
    name: "Growth",
  },
  scale: {
    priceId: "price_1TNQleKPsmWO0z4OtzQWit9o",
    productId: "prod_UM93XvRocbJoxR",
    amount: 39700, // $397.00
    name: "Scale",
  },
  broker: {
    priceId: "price_1TNQmXKPsmWO0z4OUDEitTtf",
    productId: "prod_UM94Ve16RkIbjp",
    amount: 49700, // $497.00
    name: "Broker",
  },
  // Broker Workspace — financial professionals managing client rosters.
  // Different from the funding-intelligence "broker" tier above. See /broker.
  broker_workspace: {
    priceId: "price_1TOsOmKPsmWO0z4Oy8yiuhvJ",
    productId: "prod_UNdgXGpuhBRm55",
    amount: 19700, // $197.00
    name: "Broker Workspace",
  },
  enterprise: {
    // Enterprise = custom pricing — fall back to legacy $497/mo price as default
    // Sales overrides on a per-customer basis via Stripe Quotes.
    priceId: "price_1SIHFGKPsmWO0z4O268FATQ8",
    productId: "prod_TEkkY2JB9BWsth",
    amount: 49700,
    name: "Enterprise",
  },

  // ─── Legacy (deprecated 2026-04-18) ─────────────────────────────────────
  // Retained so existing subscribers and old links keep resolving. Do not
  // surface in the pricing UI.
  professional: {
    priceId: "price_1SIHEyKPsmWO0z4OaFaUwl58",
    productId: "prod_TEkk3Vr0rtOzrW",
    amount: 9700,
    name: "Professional (legacy)",
  },
  premium: {
    priceId: "price_1SIHF7KPsmWO0z4OXier2L7d",
    productId: "prod_TEkk1OV31G4sSk",
    amount: 19700,
    name: "Premium (legacy)",
  },
} as const;

export type PlanSlug = keyof typeof PRICING_CONFIG;

export function getPriceId(planSlug: PlanSlug): string {
  return PRICING_CONFIG[planSlug].priceId;
}

export function getProductId(planSlug: PlanSlug): string {
  return PRICING_CONFIG[planSlug].productId;
}
