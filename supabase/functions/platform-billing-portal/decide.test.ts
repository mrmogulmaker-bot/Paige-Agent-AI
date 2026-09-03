// deno test supabase/functions/platform-billing-portal/decide.test.ts
// One case per row of docs/delivery/billing-foundation-a-design.md §6.
import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { decidePortalAccess, stripeKeyNameFor, type WorkspaceBillingAuthority } from "./decide.ts";

const owner = (over: Partial<WorkspaceBillingAuthority> = {}): WorkspaceBillingAuthority => ({
  tenant_id: "11111111-1111-1111-1111-111111111111",
  scope: "top_level_solo",
  role: "owner",
  can_manage_billing: true,
  billing_account_state: "mapped",
  ...over,
});

Deno.test("flag off refuses everything, even a mapped owner (not_enabled)", () => {
  assertEquals(decidePortalAccess(false, owner()), { allow: false, status: 403, code: "not_enabled" });
});

Deno.test("unreadable authority (null) is refused, never treated as no-workspace", () => {
  assertEquals(decidePortalAccess(true, null), { allow: false, status: 503, code: "authority_unreadable" });
});

Deno.test("no active workspace (null tenant_id) → no_active_workspace", () => {
  assertEquals(
    decidePortalAccess(true, owner({ tenant_id: null, scope: "none", role: null, can_manage_billing: false, billing_account_state: "not_applicable" })),
    { allow: false, status: 403, code: "no_active_workspace" },
  );
});

Deno.test("sub-account → not_applicable_scope, whatever the role", () => {
  assertEquals(
    decidePortalAccess(true, owner({ scope: "sub_account", can_manage_billing: false, billing_account_state: "not_applicable" })),
    { allow: false, status: 403, code: "not_applicable_scope" },
  );
});

Deno.test("agency / enterprise owner → not_applicable_scope (R8, until a contract exists)", () => {
  for (const scope of ["agency", "enterprise"]) {
    assertEquals(
      decidePortalAccess(true, owner({ scope, can_manage_billing: false, billing_account_state: "not_applicable" })),
      { allow: false, status: 403, code: "not_applicable_scope" },
    );
  }
});

Deno.test("admin / member / coach on a top-level Solo → owner_only (R2)", () => {
  for (const role of ["admin", "member", "coach"]) {
    assertEquals(
      decidePortalAccess(true, owner({ role, can_manage_billing: false })),
      { allow: false, status: 403, code: "owner_only" },
    );
  }
});

Deno.test("owner with no mapping → billing_account_absent (409), never a fallback (R13)", () => {
  assertEquals(decidePortalAccess(true, owner({ billing_account_state: "absent" })), { allow: false, status: 409, code: "billing_account_absent" });
});

Deno.test("owner with ambiguous legacy data → billing_account_ambiguous (409)", () => {
  assertEquals(decidePortalAccess(true, owner({ billing_account_state: "ambiguous" })), { allow: false, status: 409, code: "billing_account_ambiguous" });
});

Deno.test("an unknown state string is refused, not allowed", () => {
  assertEquals(decidePortalAccess(true, owner({ billing_account_state: "suspended" })), { allow: false, status: 503, code: "authority_unreadable" });
});

Deno.test("only a mapped owner of a top-level Solo with the flag on is allowed, and the decision names the tenant", () => {
  assertEquals(decidePortalAccess(true, owner()), { allow: true, tenantId: "11111111-1111-1111-1111-111111111111" });
});

Deno.test("stripeKeyNameFor names the key per account and refuses anything else (no cross-account fallback)", () => {
  assertEquals(stripeKeyNameFor("legacy"), "STRIPE_SECRET_KEY");
  assertEquals(stripeKeyNameFor("v2"), "STRIPE_SECRET_KEY_V2");
  assertEquals(stripeKeyNameFor("other"), null);
});
