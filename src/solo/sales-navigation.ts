/** Navigation hints are never authorization or saved form data. */
export const SALES_PANELS = ["quick-offer", "payment-handling", "commercial-terms"] as const;
export type SalesPanel = typeof SALES_PANELS[number];
export function isSalesPanel(value: unknown): value is SalesPanel {
  return typeof value === "string" && (SALES_PANELS as readonly string[]).includes(value);
}
export function readSalesPanel(search: string, key = "panel"): SalesPanel | null {
  const values = new URLSearchParams(search).getAll(key);
  return values.length === 1 && isSalesPanel(values[0]) ? values[0] : null;
}
export function salesPath(account: string, panel?: SalesPanel | null): string {
  const base = `/solo/${encodeURIComponent(account)}/growth/sales`;
  return panel && isSalesPanel(panel) ? `${base}?panel=${panel}` : base;
}
// A one-use, current-session candidate, never persisted or serialized into a URL.
// The destination MUST re-read client authority before selecting it.
let clientReturn: { tenantId: string; account: string; candidate: string | null } | null = null;
export function beginClientReturn(tenantId: string, account: string) {
  clientReturn = { tenantId, account, candidate: null };
}
export function getClientReturn(tenantId: string, account: string) {
  return clientReturn?.tenantId === tenantId && clientReturn?.account === account;
}
export function completeClientReturn(tenantId: string, account: string, contactId: string) {
  if (getClientReturn(tenantId, account) && contactId) clientReturn!.candidate = contactId;
}
export function consumeClientReturn(tenantId: string, account: string): string | null {
  if (!getClientReturn(tenantId, account)) { clientReturn = null; return null; }
  const candidate = clientReturn!.candidate;
  clientReturn = null;
  return candidate;
}
export function clearClientReturn() { clientReturn = null; }
