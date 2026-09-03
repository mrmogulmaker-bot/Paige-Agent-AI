// deno test supabase/functions/platform-billing-connect/decide.test.ts
import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { decideConnectAccess, stripeKeyNameFor, type WorkspaceBillingAuthority } from "./decide.ts";

const owner = (over: Partial<WorkspaceBillingAuthority> = {}): WorkspaceBillingAuthority => ({
  tenant_id: "11111111-1111-1111-1111-111111111111",
  scope: "top_level_solo",
  role: "owner",
  can_manage_billing: true,
  billing_account_state: "absent",
  ...over,
});

Deno.test("unreadable authority (null) is refused, never treated as no-workspace", () => {
  assertEquals(decideConnectAccess(null), { allow: false, status: 503, code: "authority_unreadable" });
});

Deno.test("no active workspace (null tenant_id) → no_active_workspace", () => {
  assertEquals(
    decideConnectAccess(owner({ tenant_id: null, scope: "none", role: null, can_manage_billing: false, billing_account_state: "not_applicable" })),
    { allow: false, status: 403, code: "no_active_workspace" },
  );
});

Deno.test("sub-account → not_applicable_scope, whatever the role", () => {
  assertEquals(
    decideConnectAccess(owner({ scope: "sub_account", can_manage_billing: false, billing_account_state: "not_applicable" })),
    { allow: false, status: 403, code: "not_applicable_scope" },
  );
});

Deno.test("agency / enterprise owner → not_applicable_scope", () => {
  for (const scope of ["agency", "enterprise"]) {
    assertEquals(
      decideConnectAccess(owner({ scope, can_manage_billing: false, billing_account_state: "not_applicable" })),
      { allow: false, status: 403, code: "not_applicable_scope" },
    );
  }
});

Deno.test("admin / member / coach on a top-level Solo → owner_only", () => {
  for (const role of ["admin", "member", "coach"]) {
    assertEquals(
      decideConnectAccess(owner({ role, can_manage_billing: false })),
      { allow: false, status: 403, code: "owner_only" },
    );
  }
});

Deno.test("owner with NO mapping (absent) is ALLOWED — this is the ordinary bootstrap case, unlike the portal", () => {
  assertEquals(
    decideConnectAccess(owner({ billing_account_state: "absent" })),
    { allow: true, tenantId: "11111111-1111-1111-1111-111111111111", billingAccountState: "absent" },
  );
});

Deno.test("owner already mapped is ALLOWED — reconnecting/replacing reuses the existing customer", () => {
  assertEquals(
    decideConnectAccess(owner({ billing_account_state: "mapped" })),
    { allow: true, tenantId: "11111111-1111-1111-1111-111111111111", billingAccountState: "mapped" },
  );
});

Deno.test("owner with ambiguous legacy data → billing_account_ambiguous (409), never create a new provider object over a conflict", () => {
  assertEquals(decideConnectAccess(owner({ billing_account_state: "ambiguous" })), { allow: false, status: 409, code: "billing_account_ambiguous" });
});

Deno.test("an unknown state string is refused, not allowed (R13 — never default into creating a provider object)", () => {
  assertEquals(decideConnectAccess(owner({ billing_account_state: "suspended" })), { allow: false, status: 503, code: "authority_unreadable" });
});

Deno.test("stripeKeyNameFor names the key per account and refuses anything else (no cross-account fallback)", () => {
  assertEquals(stripeKeyNameFor("legacy"), "STRIPE_SECRET_KEY");
  assertEquals(stripeKeyNameFor("v2"), "STRIPE_SECRET_KEY_V2");
  assertEquals(stripeKeyNameFor("other"), null);
});
