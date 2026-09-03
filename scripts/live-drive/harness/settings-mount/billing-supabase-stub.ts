/** Billing-only transport fixture. No real account, provider call, or payment credential. */
import { supabase as base } from "../connections-mount/supabase-stub";
const mode = () => new URLSearchParams(window.location.search).get("data");
const tenant = () => new URLSearchParams(window.location.search).get("tenant") === "second" ? "harness-tenant-second" : "harness-tenant";
export const supabase = {
  ...base,
  rpc(name: string, args?: Record<string, unknown>) {
    if (name !== "get_workspace_billing_status") return base.rpc(name, args);
    if (mode() === "issues") return Promise.resolve({ data: null, error: { message: "Synthetic unavailable status" } });
    return Promise.resolve({ error: null, data: [{
      tenant_id: tenant(), workspace_name: "Synthetic Billing workspace", scope: "top_level",
      can_view: mode() !== "readonly", can_manage: mode() !== "readonly",
      access_state: "promotional", revenue_class: "promotional", plan_slug: "solo", plan_name: "Solo",
      amount_due_cents: 0, payment_method_required: false, billed_by: "PAIGE Platform",
      provider_state: mode() === "payment-connected" ? "mapped" : "not_created",
      payment_method_connected: mode() === "payment-connected",
      seats_included: 1, seats_used: 1, contacts_included: 250, contacts_used: 2,
      primary_contact_count: mode() === "duplicate" ? 2 : 0, delegate_count: 0,
      primary_selection_needed: mode() === "duplicate", notice_delivery_state: "unavailable",
    }] });
  },
  functions: {
    ...base.functions,
    invoke(name: string, opts?: { body?: Record<string, unknown> }) {
      if (name !== "platform-billing-connect") return base.functions.invoke(name, opts);
      return Promise.resolve({ error: null, data: { error: mode() === "provider-config" ? "provider_configuration" : "provider_unavailable" } });
    },
  },
};
