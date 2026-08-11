// systems-check-runners/payment_processor_connected.ts — Check #9 (runner_key: payment_processor_connected).
//
// §38 CORRECTED — PROCESSOR-AGNOSTIC. Paige does NOT own the tenant's payment processing, so this check
//   reads a tenant-DECLARED field, it does NOT assume Stripe and does NOT read tenant_stripe_accounts.
//   Baking in a specific processor is the §38 violation this correction exists to kill (master-doc §10 #28).
// SEAM (reuse ONLY this): tenants.payment_processor_declared (enum text, the L2 migration adds it:
//   stripe | paypal | square | bank_merchant | quickbooks_payments | manual | not_yet). Pass if present
//   and NOT 'not_yet'. Per-processor deep-verify is a post-MVP Playbook slice (§38).
//
// §51 tenant-scoped; §32 fail-loud (before the migration lands, the column is absent → the read errors
//   loudly rather than silently passing — honest §13).

import type { CheckRunner } from "../systems-check-runner.ts";
import { throwOnDbError, errorResult, hasText } from "./_kit.ts";

export const runnerKey = "payment_processor_connected";

export const run: CheckRunner = async (ctx, _row) => {
  const { admin, tenantId } = ctx;
  try {
    const res = await admin
      .from("tenants")
      .select("payment_processor_declared")
      .eq("id", tenantId)
      .maybeSingle();
    throwOnDbError(res.error, "tenants.payment_processor_declared");

    const declared = (res.data as { payment_processor_declared?: string } | null)?.payment_processor_declared ?? null;
    const pass = hasText(declared) && declared !== "not_yet";

    return {
      status: pass ? "pass" : "fail",
      evidence: { payment_processor_declared: declared, processor_agnostic: true },
      interpretation: pass
        ? `Payment processor declared: ${declared}.`
        : "No payment processor declared yet — tell Paige which processor the business uses (Stripe, PayPal, Square, a bank merchant account, QuickBooks Payments, or manual).",
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
