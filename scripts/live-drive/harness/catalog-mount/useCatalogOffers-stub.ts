// Harness stub for the Catalog Offers read (Slice 2A).
//
// MOCK THE PROVIDER, NEVER THE CONTRACT. This replaces only the network read. The component under
// test is the real one, so a regression in its states, copy, geometry or truth-telling is caught.
// Every fixture below is a plausible tenant record — never one of the owner's real accounts (§63).
type Mode = "populated" | "empty" | "readonly" | "error" | "resolving" | "unpriced"
  | "authority-unknown" | "fields-unavailable" | "instalment" | "recurring" | "empty-pending";

let mode: Mode = "populated";
const listeners = new Set<() => void>();

const price = (id: string, unitAmount: number | null, nickname: string, interval = "one_time",
  kind = interval, installmentsTotal: number | null = null) => ({
  id, nickname, unitAmount, currency: "usd", billingInterval: interval, kind, installmentsTotal, active: true,
});

const OFFERS = [
  {
    id: "o1", name: "Foundations Coaching Program", summary: "A twelve-week group program that takes a new operator from scattered to running a real week.",
    description: "Twelve weekly live sessions, a private cohort channel and the full workbook.",
    availability: "active", billingCadence: "one_time", kind: "service", deliveryShape: "program",
    pricePresentation: "fixed", customerAction: "apply", category: "Programs",
    imageUrl: null, updatedAt: "2026-08-28T12:00:00Z", prices: [price("p1", 240000, "Full")],
  },
  {
    id: "o2", name: "Fade & Line-Up", summary: "Skin fade, line-up and a hot-towel finish. Forty minutes in the chair.",
    description: null, availability: "active", billingCadence: "one_time", kind: "service", deliveryShape: "appointment",
    pricePresentation: "from", customerAction: "book", category: "Chair services",
    imageUrl: null, updatedAt: "2026-08-27T09:00:00Z", prices: [price("p2", 3500, "Standard")],
  },
  {
    id: "o3", name: "The Operator's Playbook", summary: "The ninety-page field guide the program is built on. Instant download.",
    description: null, availability: "active", billingCadence: "one_time", kind: "product", deliveryShape: "digital",
    pricePresentation: "fixed", customerAction: "buy", category: "Downloads",
    imageUrl: null, updatedAt: "2026-08-22T09:00:00Z", prices: [price("p3", 4900, "Download")],
  },
  {
    id: "o4", name: "Signature Barber Kit", summary: "Clippers, comb, cape and the shop pomade, boxed.",
    description: null, availability: "paused", billingCadence: "one_time", kind: "product", deliveryShape: "physical",
    pricePresentation: "fixed", customerAction: "buy", category: "Retail",
    imageUrl: null, updatedAt: "2026-07-30T13:44:00Z", prices: [price("p4", 8900, "Boxed")],
  },
  {
    id: "o5", name: "Strategy Intensive", summary: "A half-day working session on one problem.",
    description: null, availability: "draft", billingCadence: "one_time", kind: null, deliveryShape: "appointment",
    pricePresentation: null, customerAction: "learn", category: "Advisory",
    imageUrl: null, updatedAt: "2026-08-20T13:00:00Z", prices: [],
  },
  {
    id: "o6", name: "Monthly Advisory Retainer", summary: "Ongoing access, a standing call, and someone in your corner between them.",
    description: null, availability: "active", billingCadence: "recurring", kind: "service", deliveryShape: "membership",
    pricePresentation: "contact", customerAction: "enquire", category: "Advisory",
    imageUrl: null, updatedAt: "2026-08-12T11:20:00Z", prices: [],
  },
];

// The derived-conflict case: active, claims a fixed price, no amount recorded against it.
const UNPRICED = [{ ...OFFERS[0], id: "o7", name: "Cohort Four — Foundations", prices: [] }];
// An instalment plan: `unitAmount` is PER INSTALMENT and must never headline as the whole price.
const INSTALMENT = [{ ...OFFERS[0], id: "o8", name: "Foundations — payment plan",
  prices: [price("pi", 50000, "Plan", "month", "installment", 6)] }];
// A recurring plan: `unitAmount` is PER PERIOD. This is one of only two shapes the shipped writer
// produces, so a retainer rendered as a flat one-off price is the commonest form of the lie.
const RECURRING = [{ ...OFFERS[0], id: "o9", name: "Advisory retainer",
  prices: [price("pr", 9900, "Monthly", "month", "recurring", null)] }];

export function setCatalogHarnessMode(next: Mode) {
  mode = next;
  listeners.forEach((listener) => listener());
}

export function useCatalogOffers() {
  const React = (globalThis as { __React?: typeof import("react") }).__React!;
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    listeners.add(force as () => void);
    return () => { listeners.delete(force as () => void); };
  }, [force]);

  const base = (offers: unknown[]) => ({
    tenantId: "t", phase: "ready", offers, canManage: true,
    authorityUnknown: false, fieldsUnavailable: false, retry: () => {},
  });
  if (mode === "resolving") return { ...base([]), tenantId: null, phase: "resolving" };
  if (mode === "error") return { ...base([]), phase: "error", retry: () => setCatalogHarnessMode("populated") };
  if (mode === "empty") return base([]);
  // Empty AND mid-deploy: the state EVERY production tenant is in during the window between the
  // frontend shipping and the migration applying. It is the composition the notice exists for.
  if (mode === "empty-pending") return { ...base([]), fieldsUnavailable: true };
  if (mode === "readonly") return { ...base(OFFERS), canManage: false };
  if (mode === "unpriced") return base(UNPRICED);
  if (mode === "instalment") return base(INSTALMENT);
  if (mode === "recurring") return base(RECURRING);
  if (mode === "authority-unknown") return { ...base(OFFERS), canManage: false, authorityUnknown: true };
  if (mode === "fields-unavailable") return { ...base(OFFERS), fieldsUnavailable: true };
  return base(OFFERS);
}
