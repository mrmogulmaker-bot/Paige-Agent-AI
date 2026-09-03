// The Sales-operations read, stubbed at the NETWORK boundary only.
//
// Everything above this line in the real stack renders unchanged: `SalesOps`, `growth2`'s `Sales`,
// `GrowthHub`, the shared pill and every token. What is replaced is the one thing a local harness
// cannot have — a tenant-scoped round trip to PostgREST. That is also the honest limit of what any
// frame produced here proves.

export type Mode =
  | "first-use"
  | "declared"
  | "not-yet"
  | "unrecognised-processor"
  | "populated"
  | "activity-unreadable"
  | "readonly"
  | "authority-unknown"
  | "loading"
  | "resolving"
  | "unavailable"
  | "error"
  | "save-refused";

let mode: Mode = "first-use";
const listeners = new Set<() => void>();

export function setSalesHarnessMode(next: Mode) {
  mode = next;
  listeners.forEach((l) => l());
}

const ORDERS = [
  {
    id: "o1", productId: null, customerName: "A returning client", customerEmail: null,
    amountTotal: 240000, currency: "usd", status: "complete", createdAt: "2026-08-20T12:00:00Z",
  },
  {
    id: "o2", productId: null, customerName: null, customerEmail: "someone@example.com",
    amountTotal: 45000, currency: "usd", status: "pending", createdAt: "2026-08-24T09:00:00Z",
  },
  {
    id: "o3", productId: null, customerName: "An earlier client", customerEmail: null,
    // No amount recorded. The surface must render an em-dash here, never a zero.
    amountTotal: null, currency: null, status: "refunded", createdAt: null,
  },
];

function snapshot() {
  const base = {
    tenantId: "harness-tenant",
    phase: "ready" as const,
    processor: null as string | null,
    processorUnrecognised: false,
    methods: [] as string[],
    orders: [] as typeof ORDERS,
    ordersReadable: true,
    canManage: true,
    authorityUnknown: false,
    retry: () => {},
    declarePaymentHandling: async () => ({ ok: true, result: {} }),
  };

  switch (mode) {
    case "declared":
      return { ...base, processor: "square", methods: ["cards", "ach"], orders: ORDERS };
    case "not-yet":
      return { ...base, processor: "not_yet", methods: [] };
    case "unrecognised-processor":
      return { ...base, processor: null, processorUnrecognised: true };
    case "populated":
      return { ...base, processor: "paypal", methods: ["cards", "check"], orders: ORDERS };
    case "activity-unreadable":
      // A plain member: RLS filters every row and returns no error, so readability is derived
      // from authority rather than from an error channel.
      return { ...base, canManage: false, ordersReadable: false, orders: [] };
    case "readonly":
      return { ...base, canManage: false, processor: "manual", methods: ["cash", "check"] };
    case "authority-unknown":
      return { ...base, canManage: false, authorityUnknown: true };
    case "loading":
      return { ...base, phase: "loading" as const };
    case "resolving":
      return { ...base, phase: "resolving" as const };
    case "unavailable":
      return { ...base, tenantId: null, phase: "unavailable" as const, canManage: false };
    case "error":
      return { ...base, phase: "error" as const, canManage: false };
    case "save-refused":
      return {
        ...base,
        declarePaymentHandling: async () => ({
          ok: false,
          message: "your active workspace changed before this could save; nothing was written",
        }),
      };
    default:
      return base;
  }
}

export const DECLARED_PROCESSORS = [
  "stripe", "paypal", "square", "bank_merchant", "quickbooks_payments", "manual", "not_yet",
] as const;
export const DECLARED_METHODS = [
  "cards", "ach", "zelle", "wire", "check", "cash", "bank_transfer", "crypto", "other",
] as const;

export function useSoloSalesOps() {
  const React = (globalThis as { __React?: typeof import("react") }).__React!;
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const listener = () => force((n: number) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return snapshot();
}
