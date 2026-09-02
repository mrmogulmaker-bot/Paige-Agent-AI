// platform-billing-portal/decide.ts — the PURE authority decision (Billing Foundation A).
//
// Everything that decides whether THIS caller may open the hosted billing portal for THIS
// workspace lives here, with no I/O, so the whole decision table in
// docs/delivery/billing-foundation-a-design.md §6 is pinned by decide.test.ts. index.ts only
// gathers the inputs (from the server-derived authority read — never from a request body) and
// carries out the one side effect after `allow`.

export interface WorkspaceBillingAuthority {
  tenant_id: string | null;
  scope: "none" | "sub_account" | "agency" | "enterprise" | "top_level_solo" | string;
  role: string | null;
  can_manage_billing: boolean;
  billing_account_state: "not_applicable" | "mapped" | "ambiguous" | "absent" | string;
}

export type PortalRefusalCode =
  | "not_enabled"
  | "no_active_workspace"
  | "not_applicable_scope"
  | "owner_only"
  | "billing_account_absent"
  | "billing_account_ambiguous"
  | "authority_unreadable";

export type PortalDecision =
  | { allow: true; tenantId: string }
  | { allow: false; status: number; code: PortalRefusalCode };

/** Owner copy is NOT here (§00 — the Solo hook maps codes to copy); this is the contract. */
export function decidePortalAccess(
  flagEnabled: boolean,
  authority: WorkspaceBillingAuthority | null,
): PortalDecision {
  // T10: a deployed route is inert until the authenticated drive proves it (default off).
  if (!flagEnabled) return { allow: false, status: 403, code: "not_enabled" };
  // A read that returned nothing is not "no workspace" — it is unknown, and unknown is refused.
  if (!authority) return { allow: false, status: 503, code: "authority_unreadable" };
  if (!authority.tenant_id) return { allow: false, status: 403, code: "no_active_workspace" };
  if (authority.scope !== "top_level_solo") return { allow: false, status: 403, code: "not_applicable_scope" };
  if (!authority.can_manage_billing) return { allow: false, status: 403, code: "owner_only" };
  if (authority.billing_account_state === "absent") return { allow: false, status: 409, code: "billing_account_absent" };
  if (authority.billing_account_state === "ambiguous") return { allow: false, status: 409, code: "billing_account_ambiguous" };
  if (authority.billing_account_state !== "mapped") return { allow: false, status: 503, code: "authority_unreadable" };
  return { allow: true, tenantId: authority.tenant_id };
}

/** Which secret NAME serves a mapping. Never a fallback across accounts (T11). */
export function stripeKeyNameFor(account: string): "STRIPE_SECRET_KEY" | "STRIPE_SECRET_KEY_V2" | null {
  if (account === "legacy") return "STRIPE_SECRET_KEY";
  if (account === "v2") return "STRIPE_SECRET_KEY_V2";
  return null;
}
