// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => ({ activeTenantId: null, loading: false }) }));
import { parseWorkspaceBillingStatusRow } from "./useWorkspaceBillingStatus";

describe("billing status browser privacy", () => {
  it("retains connected readiness but never parses legacy card or provider fields", () => {
    const status = parseWorkspaceBillingStatusRow({
      tenant_id: "tenant-a", payment_method_connected: true,
      payment_method_brand: "PrivateBrand", payment_method_last4: "9876",
      payment_method_exp_month: 12, payment_method_exp_year: 2099,
      payment_method_id: "private-method", stripe_customer_id: "private-customer",
    });
    expect(status.paymentMethodConnected).toBe(true);
    expect(JSON.stringify(status)).not.toMatch(/PrivateBrand|9876|2099|private-method|private-customer/);
    expect(Object.keys(status).filter((key) => /Brand|Last4|ExpMonth|ExpYear/.test(key))).toEqual([]);
  });
});
