// Harness stub for the Catalog Offers read (Slice 2A).
//
// MOCK THE PROVIDER, NEVER THE CONTRACT. This replaces only the network read. The component under
// test is the real one, so a regression in its states, copy, geometry or truth-telling is caught.
// Every fixture below is a plausible tenant record — never one of the owner's real accounts (§63).
type Mode = "populated" | "empty" | "readonly" | "error" | "resolving" | "unpriced";

let mode: Mode = "populated";
const listeners = new Set<() => void>();

const price = (id: string, unitAmount: number | null, nickname: string, interval = "one_time") => ({
  id, nickname, unitAmount, currency: "usd", billingInterval: interval, kind: interval, active: true,
});

const OFFERS = [
  {
    id: "o1", name: "Foundations Coaching Program", summary: "A twelve-week group program that takes a new operator from scattered to running a real week.",
    description: "Twelve weekly live sessions, a private cohort channel and the full workbook.",
    availability: "active", productType: "service", deliveryShape: "program",
    pricePresentation: "fixed", customerAction: "apply", category: "Programs",
    imageUrl: null, updatedAt: "2026-08-28T12:00:00Z", prices: [price("p1", 240000, "Full")],
  },
  {
    id: "o2", name: "Fade & Line-Up", summary: "Skin fade, line-up and a hot-towel finish. Forty minutes in the chair.",
    description: null, availability: "active", productType: "service", deliveryShape: "appointment",
    pricePresentation: "from", customerAction: "book", category: "Chair services",
    imageUrl: null, updatedAt: "2026-08-27T09:00:00Z", prices: [price("p2", 3500, "Standard")],
  },
  {
    id: "o3", name: "The Operator's Playbook", summary: "The ninety-page field guide the program is built on. Instant download.",
    description: null, availability: "active", productType: "one_time", deliveryShape: "digital",
    pricePresentation: "fixed", customerAction: "buy", category: "Downloads",
    imageUrl: null, updatedAt: "2026-08-22T09:00:00Z", prices: [price("p3", 4900, "Download")],
  },
  {
    id: "o4", name: "Signature Barber Kit", summary: "Clippers, comb, cape and the shop pomade, boxed.",
    description: null, availability: "paused", productType: "one_time", deliveryShape: "physical",
    pricePresentation: "fixed", customerAction: "buy", category: "Retail",
    imageUrl: null, updatedAt: "2026-07-30T13:44:00Z", prices: [price("p4", 8900, "Boxed")],
  },
  {
    id: "o5", name: "Strategy Intensive", summary: "A half-day working session on one problem.",
    description: null, availability: "draft", productType: "service", deliveryShape: "appointment",
    pricePresentation: null, customerAction: "learn", category: "Advisory",
    imageUrl: null, updatedAt: "2026-08-20T13:00:00Z", prices: [],
  },
  {
    id: "o6", name: "Monthly Advisory Retainer", summary: "Ongoing access, a standing call, and someone in your corner between them.",
    description: null, availability: "active", productType: "service", deliveryShape: "membership",
    pricePresentation: "contact", customerAction: "enquire", category: "Advisory",
    imageUrl: null, updatedAt: "2026-08-12T11:20:00Z", prices: [],
  },
];

// The derived-conflict case: active, claims a fixed price, no amount recorded against it.
const UNPRICED = [{ ...OFFERS[0], id: "o7", name: "Cohort Four — Foundations", prices: [] }];

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

  if (mode === "resolving") return { tenantId: null, phase: "resolving", offers: [], canManage: true, retry: () => {} };
  if (mode === "error") return { tenantId: "t", phase: "error", offers: [], canManage: true, retry: () => setCatalogHarnessMode("populated") };
  if (mode === "empty") return { tenantId: "t", phase: "ready", offers: [], canManage: true, retry: () => {} };
  if (mode === "readonly") return { tenantId: "t", phase: "ready", offers: OFFERS, canManage: false, retry: () => {} };
  if (mode === "unpriced") return { tenantId: "t", phase: "ready", offers: UNPRICED, canManage: true, retry: () => {} };
  return { tenantId: "t", phase: "ready", offers: OFFERS, canManage: true, retry: () => {} };
}
