// Authority matrix for acting on a sub-agent or its proposal.
//
// This is the regression test for a real cross-tenant defect: `subagent-forge` gated
// disable/approve/reject on a TENANT-LEVEL `admin` app_role read from the global
// `user_roles` table, then wrote by globally-unique `slug` with NO tenant predicate,
// on the service-role client (RLS bypassed). Measured on production at the time:
// 9 non-operator admins across 11 workspaces could each disable all 24 platform-default
// agents for the whole fleet.
//
// Every §51 tier is asserted, including the two that must always be refused.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideSubagentAuthority, type SubagentCaller } from "./subagent-authority.ts";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

const operator: SubagentCaller = { isOperator: true, isAdmin: false, tenantId: null };
const operatorInTenant: SubagentCaller = { isOperator: true, isAdmin: true, tenantId: TENANT_A };
const adminA: SubagentCaller = { isOperator: false, isAdmin: true, tenantId: TENANT_A };
const adminB: SubagentCaller = { isOperator: false, isAdmin: true, tenantId: TENANT_B };
const memberA: SubagentCaller = { isOperator: false, isAdmin: false, tenantId: TENANT_A };
const anonymous: SubagentCaller = { isOperator: false, isAdmin: false, tenantId: null };
/** An `admin` whose active workspace never resolved — the app_role alone is not authority (§59). */
const adminNoTenant: SubagentCaller = { isOperator: false, isAdmin: true, tenantId: null };

Deno.test("platform default (tenant_id null) — operator may act", () => {
  assertEquals(decideSubagentAuthority(operator, null, "agent").allowed, true);
  assertEquals(decideSubagentAuthority(operatorInTenant, null, "agent").allowed, true);
});

Deno.test("platform default — NO workspace tier may act, whatever their role", () => {
  for (const caller of [adminA, adminB, memberA, anonymous, adminNoTenant]) {
    const d = decideSubagentAuthority(caller, null, "agent");
    assertEquals(d.allowed, false, `expected refusal for ${JSON.stringify(caller)}`);
    if (!d.allowed) {
      assertEquals(d.status, 403);
      assertEquals(d.reason.includes("platform operator only"), true);
    }
  }
});

Deno.test("tenant-owned — the owning workspace's admin may act", () => {
  assertEquals(decideSubagentAuthority(adminA, TENANT_A, "agent").allowed, true);
  assertEquals(decideSubagentAuthority(adminB, TENANT_B, "agent").allowed, true);
});

Deno.test("tenant-owned — another workspace's admin may NOT act", () => {
  const d = decideSubagentAuthority(adminB, TENANT_A, "agent");
  assertEquals(d.allowed, false);
  if (!d.allowed) assertEquals(d.reason.includes("your own workspace"), true);
});

Deno.test("tenant-owned — the operator may act across any workspace", () => {
  assertEquals(decideSubagentAuthority(operator, TENANT_A, "agent").allowed, true);
  assertEquals(decideSubagentAuthority(operator, TENANT_B, "agent").allowed, true);
});

Deno.test("tenant-owned — a non-admin member of the owning workspace may NOT act", () => {
  assertEquals(decideSubagentAuthority(memberA, TENANT_A, "agent").allowed, false);
});

Deno.test("the global admin app_role alone is not authority (§59)", () => {
  // Same role, no resolved workspace — must never satisfy a tenant-scoped check.
  assertEquals(decideSubagentAuthority(adminNoTenant, TENANT_A, "agent").allowed, false);
  assertEquals(decideSubagentAuthority(adminNoTenant, null, "agent").allowed, false);
});

Deno.test("anonymous is refused everywhere", () => {
  assertEquals(decideSubagentAuthority(anonymous, null, "agent").allowed, false);
  assertEquals(decideSubagentAuthority(anonymous, TENANT_A, "agent").allowed, false);
});

Deno.test("the noun reaches the refusal copy, so proposals read correctly too", () => {
  const d = decideSubagentAuthority(adminA, null, "proposal");
  assertEquals(d.allowed, false);
  if (!d.allowed) assertEquals(d.reason.includes("Platform-default proposals"), true);
});
