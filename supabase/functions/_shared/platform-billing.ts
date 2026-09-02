// _shared/platform-billing.ts — Billing Foundation A: the ONE home for "which platform Stripe
// Customer belongs to this workspace" as seen from an edge function (§18).
//
// Two callers, both service-role:
//   • stripe-webhook (both platform write sites of checkout.session.completed) →
//     upsertBillingAccount(): record the verified customer ↔ workspace mapping. Never overwrites
//     an existing mapping that names a DIFFERENT customer — that is a conflict, audited, left for
//     an operator (R13: never guess). A trigger raise (sub-account) comes back as an error object
//     and is logged; it never breaks the subscription write.
//   • customer-portal (the LEGACY consumer lane) → isPlatformCustomer(): the email-found customer
//     must never be a PLATFORM customer. A platform customer is anything referenced by ANY
//     LAYER-1 source, not just the mapping table — the backfill skips ambiguous tenants, and a
//     guard that only knew the mapping table would leave exactly those reachable by email (A1).
//
// No secret values, no email, no customer id ever reaches a log line from here (§13 T12).
// deno-lint-ignore-file no-explicit-any

export type StripeAccount = "legacy" | "v2";

export interface UpsertBillingAccountInput {
  tenantId: string;
  stripeCustomerId: string;
  stripeAccount: StripeAccount;
  source: "checkout" | "operator";
  /** who is acting, for the audit row; null for a webhook */
  actorUserId?: string | null;
}

export type UpsertBillingAccountResult =
  | { outcome: "inserted" }
  | { outcome: "already_mapped" }
  | { outcome: "conflict"; existingAccount: StripeAccount }
  | { outcome: "error"; code: string };

/** Pure: given what the table already holds, decide what the upsert means. Tested. */
export function classifyMapping(
  existing: { stripe_customer_id: string; stripe_account: string } | null,
  incoming: { stripeCustomerId: string; stripeAccount: StripeAccount },
): "insert" | "already_mapped" | "conflict" {
  if (!existing) return "insert";
  if (existing.stripe_customer_id === incoming.stripeCustomerId && existing.stripe_account === incoming.stripeAccount) {
    return "already_mapped";
  }
  return "conflict";
}

export async function upsertBillingAccount(
  admin: any,
  input: UpsertBillingAccountInput,
): Promise<UpsertBillingAccountResult> {
  const { data: existing, error: readErr } = await admin
    .from("platform_billing_accounts")
    .select("stripe_customer_id, stripe_account")
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (readErr) return { outcome: "error", code: `mapping_read_failed:${readErr.code ?? "unknown"}` };

  const decision = classifyMapping(existing ?? null, input);
  if (decision === "already_mapped") return { outcome: "already_mapped" };

  if (decision === "conflict") {
    // Audited, never resolved here. The row that exists stays; an operator decides.
    await admin.from("paige_audit_log").insert({
      tenant_id: input.tenantId,
      actor_user_id: input.actorUserId ?? null,
      actor_role: "system",
      action: "platform_billing_account_conflict",
      target_type: "platform_billing_account",
      target_id: input.tenantId,
      payload: { source: input.source, incoming_account: input.stripeAccount, existing_account: existing!.stripe_account },
    }).then(
      () => {},
      (e: unknown) => console.error("[platform-billing] conflict audit insert failed", String((e as any)?.message ?? e)),
    );
    return { outcome: "conflict", existingAccount: existing!.stripe_account as StripeAccount };
  }

  const { error: insErr } = await admin.from("platform_billing_accounts").insert({
    tenant_id: input.tenantId,
    stripe_customer_id: input.stripeCustomerId,
    stripe_account: input.stripeAccount,
    source: input.source,
    created_by: input.actorUserId ?? null,
  });
  if (insErr) {
    // 23505 = the customer is already mapped to ANOTHER tenant (unique per account) — a real
    // conflict too; 42501 = the top-level trigger refused a sub-account. Both are logged, neither
    // is retried, neither touches the subscription write the caller is in the middle of.
    return { outcome: "error", code: `mapping_insert_failed:${insErr.code ?? "unknown"}` };
  }
  return { outcome: "inserted" };
}

/** True when the customer is referenced by ANY LAYER-1 source (mapping, subscription, tenant). */
export async function isPlatformCustomer(admin: any, stripeCustomerId: string): Promise<boolean | null> {
  const checks = await Promise.all([
    admin.from("platform_billing_accounts").select("tenant_id").eq("stripe_customer_id", stripeCustomerId).limit(1),
    admin.from("platform_subscriptions").select("tenant_id").eq("stripe_customer_id", stripeCustomerId).limit(1),
    admin.from("tenants").select("id").eq("stripe_customer_id", stripeCustomerId).limit(1),
  ]);
  // A failed read is NOT "not a platform customer" — that would reopen A1 on every outage (§13).
  if (checks.some((c) => c.error)) return null;
  return checks.some((c) => Array.isArray(c.data) && c.data.length > 0);
}

/** Pure: what the legacy lane must do with the answer. Tested. */
export function decideLegacyPortal(
  isPlatform: boolean | null,
): { allow: true } | { allow: false; status: number; code: string } {
  if (isPlatform === null) return { allow: false, status: 503, code: "platform_customer_check_failed" };
  if (isPlatform) return { allow: false, status: 409, code: "platform_customer_use_workspace_billing" };
  return { allow: true };
}
