// platform-billing-connect/decide.ts — the PURE authority decision for the Billing Experience
// payment-method connect flow (owner brief 2026-09-03, item 4).
//
// Same shape as platform-billing-portal/decide.ts and deliberately reuses its
// WorkspaceBillingAuthority row (get_workspace_billing_authority() is the ONE resolver for
// "who may act on this workspace's platform billing" — §18, no second authority read). The
// DECISION differs from the portal's: the portal only opens for an ALREADY-mapped workspace
// (there is something to manage); connect is how a mapping comes to exist in the first place, so
// it must also allow `absent` — that is the ordinary case for every workspace before its first
// payment method. `ambiguous` still refuses: a workspace whose provider records disagree needs a
// platform review before any new provider object is created for it, never a guess.

export interface WorkspaceBillingAuthority {
  tenant_id: string | null;
  scope: "none" | "sub_account" | "agency" | "enterprise" | "top_level_solo" | string;
  role: string | null;
  can_manage_billing: boolean;
  billing_account_state: "not_applicable" | "mapped" | "ambiguous" | "absent" | string;
}

export type ConnectRefusalCode =
  | "no_active_workspace"
  | "not_applicable_scope"
  | "owner_only"
  | "billing_account_ambiguous"
  | "authority_unreadable";

export type ConnectDecision =
  | { allow: true; tenantId: string; billingAccountState: "mapped" | "absent" }
  | { allow: false; status: number; code: ConnectRefusalCode };

/** Owner copy is NOT here (§00); this is the contract. */
export function decideConnectAccess(
  authority: WorkspaceBillingAuthority | null,
): ConnectDecision {
  if (!authority) return { allow: false, status: 503, code: "authority_unreadable" };
  if (!authority.tenant_id) return { allow: false, status: 403, code: "no_active_workspace" };
  if (authority.scope !== "top_level_solo") return { allow: false, status: 403, code: "not_applicable_scope" };
  if (!authority.can_manage_billing) return { allow: false, status: 403, code: "owner_only" };
  if (authority.billing_account_state === "ambiguous") return { allow: false, status: 409, code: "billing_account_ambiguous" };
  // Only these two states may proceed — an unmodelled value fails closed rather than defaulting
  // into "go ahead and create a provider object" (R13: never guess).
  if (authority.billing_account_state !== "mapped" && authority.billing_account_state !== "absent") {
    return { allow: false, status: 503, code: "authority_unreadable" };
  }
  return { allow: true, tenantId: authority.tenant_id, billingAccountState: authority.billing_account_state };
}

/** Which secret NAME serves an account. Never a fallback across accounts (T11, same as the portal). */
export function stripeKeyNameFor(account: string): "STRIPE_SECRET_KEY" | "STRIPE_SECRET_KEY_V2" | null {
  if (account === "legacy") return "STRIPE_SECRET_KEY";
  if (account === "v2") return "STRIPE_SECRET_KEY_V2";
  return null;
}
