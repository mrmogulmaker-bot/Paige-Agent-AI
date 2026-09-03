// usePlatformBillingConnect — the Billing Experience payment-method connect act (owner brief
// 2026-09-03, item 4). Wraps the `platform-billing-connect` edge function: an Owner-only act that
// opens a secure, Stripe-hosted `mode: "setup"` Checkout page for THIS workspace's payment method.
//
// Same decision-decoding discipline as `useWorkspaceBillingAuthority`'s `openPortal()`
// (`decidePortalOpen`): the function answers every refusal as a NON-2xx with `{ error: code }` in
// the body, read through the repo's one helper (`readFunctionErrorBody`, §18) rather than the
// generic transport `.message`.
import { useCallback, useEffect, useRef } from "react";
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

// Non-authorizing UI correlation only. Provider credentials and session IDs never enter storage.
export const PAYMENT_SETUP_RETURN_KEY = "paige.billing.setup-return";
const RETURN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
type SetupMarker = { tenantId: string; userId: string; state: string; startedAt: number };
function readMarker(): SetupMarker | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(PAYMENT_SETUP_RETURN_KEY) ?? "null");
    return value && typeof value.tenantId === "string" && typeof value.userId === "string" && typeof value.state === "string"
      && typeof value.startedAt === "number" ? value : null;
  } catch { return null; }
}
export function clearPaymentSetupReturn() {
  try { window.sessionStorage.removeItem(PAYMENT_SETUP_RETURN_KEY); } catch { /* Storage may be unavailable. */ }
}
// Recheck the server context: another tab can change the active workspace without this tree rerendering.
export async function verifyPaymentSetupActor(tenantId: string, userId: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authority = await supabase.rpc("get_workspace_billing_authority" as any);
    const row = (Array.isArray(authority.data) ? authority.data[0] : authority.data) as { tenant_id?: string; can_manage_billing?: boolean; scope?: string } | null;
    if (authority.error || !row || row.tenant_id !== tenantId || row.can_manage_billing !== true || row.scope !== "top_level_solo") return false;
    const auth = await supabase.auth.getUser();
    return !auth.error && auth.data.user?.id === userId;
  } catch { return false; }
}
export async function consumePaymentSetupReturn(tenantId: string, state: string | null): Promise<{ userId: string } | null> {
  const marker = readMarker();
  clearPaymentSetupReturn();
  const age = marker ? Date.now() - marker.startedAt : -1;
  if (!marker || marker.tenantId !== tenantId || marker.state !== state || age < 0 || age > RETURN_MAX_AGE_MS) return null;
  return await verifyPaymentSetupActor(tenantId, marker.userId) ? { userId: marker.userId } : null;
}

export function usePlatformBillingConnect(activeTenantId: string | null) {
  const tenantRef = useRef(activeTenantId);
  tenantRef.current = activeTenantId;
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    const marker = readMarker();
    if (activeTenantId && marker && marker.tenantId !== activeTenantId) clearPaymentSetupReturn();
    return () => { mounted.current = false; generation.current += 1; };
  }, [activeTenantId]);

  const openPaymentSetup = useCallback(async (): Promise<PaymentSetupResult> => {
    const captured = tenantRef.current;
    const requestGeneration = ++generation.current;
    if (!captured || !mounted.current) return { ok: false, reason: "workspace_changed" };
    clearPaymentSetupReturn();
    try {
      const auth = await supabase.auth.getUser();
      const userId = auth.data.user?.id;
      if (auth.error || !userId) return { ok: false, reason: "owner_only" };
      if (!mounted.current || generation.current !== requestGeneration || tenantRef.current !== captured) return { ok: false, reason: "workspace_changed" };
      const state = crypto.randomUUID();
      const response = await supabase.functions.invoke("platform-billing-connect", {
        body: { expected_tenant_id: captured, return_state: state },
      });
      const decision = await decideConnectOpen(captured, response);
      if (!mounted.current || generation.current !== requestGeneration || tenantRef.current !== captured) {
        return { ok: false, reason: "workspace_changed" };
      }
      if ("refuse" in decision) return { ok: false, reason: decision.refuse };
      if (!await verifyPaymentSetupActor(captured, userId) || !mounted.current || generation.current !== requestGeneration || tenantRef.current !== captured) {
        return { ok: false, reason: "workspace_changed" };
      }
      // If correlation cannot be stored, do not open a flow we cannot safely correlate on return.
      window.sessionStorage.setItem(PAYMENT_SETUP_RETURN_KEY, JSON.stringify({ tenantId: captured, userId, state, startedAt: Date.now() }));
      window.location.assign(decision.open);
      return { ok: true };
    } catch {
      return { ok: false, reason: "network" };
    }
  }, []);

  return { openPaymentSetup };
}
