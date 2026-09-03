// The canonical offer read, stubbed at the network boundary. Sales calls the REAL hook in
// production; here only the round trip is replaced, so the offers table and the quick-create
// path render against the real component.
const OFFERS = [
  {
    id: "offer-1", name: "Twelve-week advisory program", summary: "Weekly sessions and a plan.",
    description: null, availability: "active", billingCadence: "recurring", kind: "service",
    deliveryShape: "program", pricePresentation: "fixed", customerAction: "apply",
    category: "Programs", imageUrl: null, updatedAt: "2026-08-28T12:00:00Z",
    prices: [{ id: "p1", nickname: "Standard", unitAmount: 240000, currency: "usd",
               billingInterval: "month", kind: "recurring", installmentsTotal: null, active: true }],
  },
  {
    id: "offer-2", name: "Onboarding toolkit", summary: null, description: null,
    availability: "draft", billingCadence: "one_time", kind: "product", deliveryShape: "digital",
    pricePresentation: "fixed", customerAction: "buy", category: "Downloads", imageUrl: null,
    updatedAt: "2026-08-20T12:00:00Z",
    // No price recorded — the table must show an em-dash, never a zero.
    prices: [],
  },
];

export function useCatalogOffers() {
  return {
    tenantId: "harness-tenant", phase: "ready", offers: OFFERS, canManage: true,
    authorityUnknown: false, fieldsUnavailable: false, retry: () => {},
    saveOffer: async () => ({ ok: true, result: { id: "offer-new" } }),
    setOfferStatus: async () => ({ ok: true, result: {} }),
  };
}
