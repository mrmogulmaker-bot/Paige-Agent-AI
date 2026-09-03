// The client-agreements read, stubbed at the NETWORK boundary only.
//
// Everything above this line renders unchanged: `AgreementEditor`, the band, the readiness row,
// the shared pill and every token. What is replaced is the one thing a local harness cannot have —
// a tenant-scoped round trip to PostgREST. That is also the honest limit of what any frame from
// here proves: it is a render, never an authenticated runtime.

export type AgreementsMode =
  | "none"
  | "no-clients"
  | "populated"
  | "unreadable"
  | "readonly"
  | "error";

let mode: AgreementsMode = "none";
const listeners = new Set<() => void>();

export function setAgreementsHarnessMode(next: AgreementsMode) {
  mode = next;
  listeners.forEach((l) => l());
}

const CLIENTS = [
  { id: "c1", name: "Jordan Avery" },
  { id: "c2", name: "Meridian Advisory" },
];

const AGREEMENTS = [
  {
    id: "a1", contactId: "c1", offerId: "p1", title: null, notes: "Renewed after the pilot",
    termKind: "recurring", billingInterval: "month", intervalCount: 1, installmentsTotal: null,
    paymentSchedule: null, priceBasis: "negotiated",
    agreedAmountMinor: 250000, agreedCurrency: "usd",
    // Deliberately DIFFERENT from the agreed figure — the pair is the whole point of the snapshot,
    // and a fixture where they match would hide a surface that conflated them.
    catalogSnapshotMinor: 300000, catalogSnapshotCurrency: "usd",
    catalogSnapshotAt: "2026-09-01T10:00:00Z",
    startsOn: "2026-09-01", renewsOn: "2026-10-01", endsOn: null,
    status: "active", updatedAt: "2026-09-01T10:00:00Z",
  },
  {
    id: "a2", contactId: "c2", offerId: "p2", title: null, notes: null,
    termKind: "installment", billingInterval: null, intervalCount: null, installmentsTotal: 3,
    paymentSchedule: null, priceBasis: "negotiated",
    agreedAmountMinor: 90000, agreedCurrency: "usd",
    catalogSnapshotMinor: null, catalogSnapshotCurrency: null, catalogSnapshotAt: null,
    startsOn: "2026-08-15", renewsOn: null, endsOn: null,
    status: "draft", updatedAt: "2026-08-15T09:00:00Z",
  },
];

const base = {
  tenantId: "tenant-harness",
  phase: "ready" as const,
  agreements: [] as typeof AGREEMENTS,
  clients: CLIENTS,
  clientsReadable: true,
  agreementsReadable: true,
  canManage: true,
  authorityUnknown: false,
  retry: () => {},
  saveAgreement: async () => ({ ok: true, result: {} }),
  setAgreementStatus: async () => ({ ok: true, result: {} }),
};

function snapshot() {
  switch (mode) {
    case "populated":
      return { ...base, agreements: AGREEMENTS };
    case "no-clients":
      return { ...base, clients: [] };
    case "unreadable":
      // 200 / [] / no error — what a caller outside the policy actually receives. The surface must
      // say "unknown", never "none".
      return { ...base, agreements: [], clients: [], clientsReadable: false, agreementsReadable: false };
    case "readonly":
      return { ...base, agreements: AGREEMENTS, canManage: false };
    case "error":
      return { ...base, phase: "error" as const, agreements: [], clients: [] };
    default:
      return base;
  }
}

export function useSoloAgreements() {
  const React = (globalThis as { __React?: typeof import("react") }).__React!;
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const listener = () => force((n: number) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return snapshot();
}
