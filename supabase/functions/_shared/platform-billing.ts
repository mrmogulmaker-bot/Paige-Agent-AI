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
  try {
    const { data: existing, error: readErr } = await admin
      .from("platform_billing_accounts")
      .select("stripe_customer_id, stripe_account")
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (readErr) {
      console.error(`[platform-billing] mapping read failed for a tenant: ${readErr.code ?? "unknown"}`);
      return { outcome: "error", code: `mapping_read_failed:${readErr.code ?? "unknown"}` };
    }
    const decision = classifyMapping(existing ?? null, input);
    if (decision === "already_mapped") return { outcome: "already_mapped" };
    if (decision === "conflict") {
      await writeConflictAudit(admin, input, "tenant_already_mapped_to_other_customer", existing!.stripe_account);
      return { outcome: "conflict", existingAccount: existing!.stripe_account as StripeAccount };
    }

    const { error: insErr } = await admin.from("platform_billing_accounts").insert({
      tenant_id: input.tenantId,
      stripe_customer_id: input.stripeCustomerId,
      stripe_account: input.stripeAccount,
      source: input.source,
      created_by: input.actorUserId ?? null,
    });
    if (!insErr) return { outcome: "inserted" };

    if (insErr.code === "23505") {
      // Two uniques can fire. (tenant_id): a concurrent replay of the same event inserted first —
      // re-read and classify, so a replay is `already_mapped`, never an error. (stripe_account,
      // stripe_customer_id): this customer already belongs to a DIFFERENT workspace — the stronger
      // anomaly, audited as such (ids stay out of the payload) and left for a person to resolve.
      const { data: again } = await admin
        .from("platform_billing_accounts")
        .select("stripe_customer_id, stripe_account")
        .eq("tenant_id", input.tenantId)
        .maybeSingle();
      if (again) {
        const d = classifyMapping(again, input);
        if (d === "already_mapped") return { outcome: "already_mapped" };
        await writeConflictAudit(admin, input, "tenant_already_mapped_to_other_customer", again.stripe_account);
        return { outcome: "conflict", existingAccount: again.stripe_account as StripeAccount };
      }
      await writeConflictAudit(admin, input, "customer_shared_across_workspaces", input.stripeAccount);
      return { outcome: "error", code: "mapping_customer_shared_across_workspaces" };
    }
    // A trigger raise (sub-account) or any other refusal: log the code, never the ids.
    console.error(`[platform-billing] mapping insert failed: ${insErr.code ?? "unknown"}`);
    return { outcome: "error", code: `mapping_insert_failed:${insErr.code ?? "unknown"}` };
  } catch (e) {
    // The mapping is an additive side effect of a subscription write; it must never throw past
    // the caller and skip the steps that follow it.
    console.error(`[platform-billing] mapping threw: ${e instanceof Error ? e.name : "unknown"}`);
    return { outcome: "error", code: "mapping_threw" };
  }
}

async function writeConflictAudit(
  admin: any,
  input: UpsertBillingAccountInput,
  kind: "tenant_already_mapped_to_other_customer" | "customer_shared_across_workspaces",
  existingAccount: string,
): Promise<void> {
  console.error(`[platform-billing] mapping conflict (${kind}) for a tenant; mapping left unchanged`);
  const { error } = await admin.from("paige_audit_log").insert({
    tenant_id: input.tenantId,
    actor_user_id: input.actorUserId ?? null,
    actor_role: "system",
    action: "platform_billing_account_conflict",
    target_type: "platform_billing_account",
    target_id: input.tenantId,
    payload: { kind, existing_account: existingAccount, attempted_account: input.stripeAccount, source: input.source },
  });
  if (error) console.error(`[platform-billing] conflict audit insert failed: ${error.code ?? "unknown"}`);
}

export interface UpsertPaymentMethodInput {
  tenantId: string;
  /** The Stripe Customer this payment method was attached to — verified against the
   * tenant's own mapping row before anything is written (defense against a stale/
   * mismatched webhook event ever overwriting the wrong workspace's payment facts). */
  stripeCustomerId: string;
  paymentMethodId: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

export type UpsertPaymentMethodResult =
  | { outcome: "written" }
  | { outcome: "customer_mismatch" }
  | { outcome: "no_mapping" }
  | { outcome: "error"; code: string };

/**
 * The Billing Experience payment-method connect flow (owner brief 2026-09-03, item 4). The ONE
 * writer of `platform_billing_accounts.payment_method_*` — called ONLY from stripe-webhook, on a
 * verified `checkout.session.completed` (mode=setup) event. The connect edge function itself never
 * calls this; it only creates the Stripe-side customer/session and redirects (§18 — same single-
 * writer discipline as `upsertBillingAccount`, and the SAME reason: a client-echoed card summary is
 * never a source of truth, only a verified webhook event is).
 */
export async function upsertPaymentMethod(
  admin: any,
  input: UpsertPaymentMethodInput,
): Promise<UpsertPaymentMethodResult> {
  try {
    const { data: existing, error: readErr } = await admin
      .from("platform_billing_accounts")
      .select("stripe_customer_id")
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (readErr) {
      console.error(`[platform-billing] payment-method mapping read failed: ${readErr.code ?? "unknown"}`);
      return { outcome: "error", code: `mapping_read_failed:${readErr.code ?? "unknown"}` };
    }
    if (!existing) return { outcome: "no_mapping" };
    // The mapping row is the source of truth for "which customer belongs to this workspace" —
    // never trust the webhook event's own customer id without checking it against that row first.
    if (existing.stripe_customer_id !== input.stripeCustomerId) {
      console.error("[platform-billing] payment-method customer mismatch; nothing written");
      return { outcome: "customer_mismatch" };
    }
    const { error: updErr } = await admin
      .from("platform_billing_accounts")
      .update({
        payment_method_id: input.paymentMethodId,
        payment_method_brand: input.brand,
        payment_method_last4: input.last4,
        payment_method_exp_month: input.expMonth,
        payment_method_exp_year: input.expYear,
        payment_method_connected_at: new Date().toISOString(),
        payment_method_updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", input.tenantId);
    if (updErr) {
      console.error(`[platform-billing] payment-method update failed: ${updErr.code ?? "unknown"}`);
      return { outcome: "error", code: `payment_method_update_failed:${updErr.code ?? "unknown"}` };
    }
    return { outcome: "written" };
  } catch (e) {
    console.error(`[platform-billing] payment-method write threw: ${e instanceof Error ? e.name : "unknown"}`);
    return { outcome: "error", code: "payment_method_threw" };
  }
}

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
