// usePlatformBillingConnect — the Billing Experience payment-method connect act (owner brief
// 2026-09-03, item 4). Wraps the `platform-billing-connect` edge function: an Owner-only act that
// opens a secure, Stripe-hosted `mode: "setup"` Checkout page for THIS workspace's payment method.
//
// Same decision-decoding discipline as `useWorkspaceBillingAuthority`'s `openPortal()`
// (`decidePortalOpen`): the function answers every refusal as a NON-2xx with `{ error: code }` in
// the body, read through the repo's one helper (`readFunctionErrorBody`, §18) rather than the
// generic transport `.message`.
import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readFunctionErrorBody } from "@/lib/integrations/connectError";
import { PAYMENT_SETUP_REFUSAL_COPY } from "../billing-contract";

export type PaymentSetupRefusal = keyof typeof PAYMENT_SETUP_REFUSAL_COPY | "network";
export type PaymentSetupResult = { ok: true } | { ok: false; reason: PaymentSetupRefusal };

const KNOWN: ReadonlySet<string> = new Set(Object.keys(PAYMENT_SETUP_REFUSAL_COPY));

/** Pure, tested: turn the function's response into a decision the hook can act on. */
export async function decideConnectOpen(
  capturedTenantId: string | null,
  response: { data: unknown; error: unknown },
): Promise<{ open: string } | { refuse: PaymentSetupRefusal }> {
  if (response.error || (response.data && typeof (response.data as { error?: unknown }).error === "string")) {
    const body = await readFunctionErrorBody(response.error, response.data);
    const raw = body?.error;
    return { refuse: typeof raw === "string" && KNOWN.has(raw) ? (raw as PaymentSetupRefusal) : "network" };
  }
  const data = (response.data ?? {}) as { url?: unknown; tenant_id?: unknown };
  if (typeof data.url !== "string" || typeof data.tenant_id !== "string") return { refuse: "network" };
  if (!capturedTenantId || data.tenant_id !== capturedTenantId) return { refuse: "workspace_changed" };
  return { open: data.url };
}

export function usePlatformBillingConnect(activeTenantId: string | null) {
  const tenantRef = useRef(activeTenantId);
  tenantRef.current = activeTenantId;

  /** Opens payment setup for the workspace the click was made in, or explains why not. Full-page
   * redirect (not a new tab) — a Stripe hosted collection page is a "complete this and come back"
   * flow, not an alongside-your-account-page one. */
  const openPaymentSetup = useCallback(async (): Promise<PaymentSetupResult> => {
    const captured = tenantRef.current;
    const response = await supabase.functions.invoke("platform-billing-connect");
    const decision = await decideConnectOpen(captured, response);
    const stillHere = tenantRef.current === captured;
    const result: PaymentSetupResult = !stillHere
      ? { ok: false, reason: "workspace_changed" }
      : "open" in decision
        ? { ok: true }
        : { ok: false, reason: decision.refuse };
    if (result.ok && "open" in decision) {
      window.location.assign(decision.open);
    }
    return result;
  }, []);

  return { openPaymentSetup };
}
