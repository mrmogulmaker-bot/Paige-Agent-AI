// systems-check-runners/payment_methods_declared.ts — Check #10 (runner_key: payment_methods_declared).
//
// §38 CORRECTED — PROCESSOR-AGNOSTIC. This is the runner the L2 migration RE-POINTS the registry row
//   check_id='payment_method_options' at (runner_key 'payment_methods_declared', data_source
//   'native_seam') — replacing the old Stripe-native 'stripe_payment_methods_read'/'external_vendor'
//   binding. It reads a tenant-DECLARED list, NEVER Stripe.
// SEAM (reuse ONLY this): tenants.payment_methods_declared (text[], the L2 migration adds it:
//   cards | ach | zelle | wire | check | cash | bank_transfer | crypto | other). Pass if length >= 1.
//
// §51 tenant-scoped; §32 fail-loud (absent column before the migration → honest 'error', never a false pass).

import type { CheckRunner } from "../systems-check-runner.ts";
import { throwOnDbError, errorResult } from "./_kit.ts";

export const runnerKey = "payment_methods_declared";

export const run: CheckRunner = async (ctx, _row) => {
  const { admin, tenantId } = ctx;
  try {
    const res = await admin
      .from("tenants")
      .select("payment_methods_declared")
      .eq("id", tenantId)
      .maybeSingle();
    throwOnDbError(res.error, "tenants.payment_methods_declared");

    const raw = (res.data as { payment_methods_declared?: unknown } | null)?.payment_methods_declared;
    const methods = Array.isArray(raw) ? (raw as unknown[]).filter((m) => typeof m === "string" && m.trim().length > 0) : [];
    const pass = methods.length >= 1;

    return {
      status: pass ? "pass" : "fail",
      evidence: { payment_methods_declared: methods, count: methods.length, processor_agnostic: true },
      interpretation: pass
        ? `${methods.length} payment method(s) declared: ${methods.join(", ")}.`
        : "No payment methods declared yet — tell Paige which methods the business accepts (cards, ACH, Zelle, wire, check, cash, bank transfer, crypto, or other).",
      metric: { name: "payment_methods_declared_count", value: methods.length },
    };
  } catch (e) {
    return errorResult(e, runnerKey);
  }
};
