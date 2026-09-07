import {
  resolveSecureBrowserAuthority,
  secureBrowserNeedsAdminConfirmation,
  type SecureBrowserAuthorityDeps,
} from "../supabase/functions/_shared/secure-browser-authority.ts";

let failures = 0;
function assert(condition: unknown, message: string) {
  if (condition) console.log(`  PASS: ${message}`);
  else { failures += 1; console.error(`  FAIL: ${message}`); }
}

interface Fixture {
  authenticatedActor?: string | null;
  activeTenant?: string | null;
  contactTenants?: Record<string, string | null>;
  admin?: boolean;
  agency?: boolean;
  platformOwner?: boolean;
  operatorTenant?: string | null;
}

function deps(fixture: Fixture, calls: string[]): SecureBrowserAuthorityDeps {
  return {
    authenticate: async () => { calls.push("authenticate"); return fixture.authenticatedActor ?? null; },
    resolveActiveTenant: async () => { calls.push("activeTenant"); return fixture.activeTenant ?? null; },
    resolveContactTenant: async (contactId, tenantId) => {
      calls.push(`contact:${contactId}:${tenantId ?? "any"}`);
      const resolved = fixture.contactTenants?.[contactId] ?? null;
      return tenantId && resolved !== tenantId ? null : resolved;
    },
    isPlatformOwner: async () => { calls.push("platformOwner"); return fixture.platformOwner === true; },
    resolvePlatformOperatorTenant: async () => { calls.push("operatorTenant"); return fixture.operatorTenant ?? null; },
    isTenantAdmin: async () => { calls.push("admin"); return fixture.admin === true; },
    canAgencyManage: async () => { calls.push("agency"); return fixture.agency === true; },
  };
}

async function refusal(
  expected: string,
  input: Parameters<typeof resolveSecureBrowserAuthority>[0],
  fixture: Fixture,
  calls: string[],
) {
  try {
    await resolveSecureBrowserAuthority(input, deps(fixture, calls));
    assert(false, `refuses with ${expected}`);
  } catch (error) {
    assert(error instanceof Error && error.message === expected, `refuses with ${expected}`);
  }
}

const SERVICE = "service-token";

async function main() {
  console.log("\n[1] invalid JWT cannot probe contact existence or create downstream writes");
  for (const contactId of ["known", "unknown"]) {
    const calls: string[] = [];
    await refusal("browser_session_invalid", {
      bearerToken: "invalid", serviceKey: SERVICE, contactId,
    }, { authenticatedActor: null, contactTenants: { known: "tenant-a", unknown: null } }, calls);
    assert(calls.join(",") === "authenticate", `invalid JWT + ${contactId} performs authentication only`);
    assert(!calls.some((call) => call.startsWith("contact:")), `invalid JWT + ${contactId} performs zero tenant/contact reads`);
  }

  console.log("\n[2] direct owner/admin is tenant-derived and truthfully attributed");
  {
    const calls: string[] = [];
    const result = await resolveSecureBrowserAuthority(
      { bearerToken: "owner-jwt", serviceKey: SERVICE, contactId: "a", tenantHint: "tenant-b" },
      deps({ authenticatedActor: "owner", activeTenant: "tenant-a", contactTenants: { a: "tenant-a" }, admin: true }, calls),
    );
    assert(result.tenantId === "tenant-a", "direct caller uses active tenant, not the body tenant hint");
    assert(result.actorRole === "admin" && result.invocationKind === "admin", "direct admin provenance remains admin");
  }

  console.log("\n[3] authorized representative is allowed but never relabeled admin");
  {
    const calls: string[] = [];
    const result = await resolveSecureBrowserAuthority(
      { bearerToken: "agency-jwt", serviceKey: SERVICE },
      deps({ authenticatedActor: "rep", activeTenant: "tenant-child", admin: false, agency: true }, calls),
    );
    assert(result.actorRole === "agency" && result.invocationKind === "agency", "direct agency provenance remains agency");
    assert(secureBrowserNeedsAdminConfirmation(2, 0, result.invocationKind, undefined), "first-N agency run still requires admin confirmation");
    assert(!secureBrowserNeedsAdminConfirmation(2, 0, result.invocationKind, "confirmed"), "explicit confirmation releases first-N agency run");
  }

  console.log("\n[4] revoked or unscoped representative fails closed before writes");
  {
    const calls: string[] = [];
    await refusal("browser_actor_not_authorized", { bearerToken: "agency-jwt", serviceKey: SERVICE }, {
      authenticatedActor: "rep", activeTenant: "tenant-child", admin: false, agency: false,
    }, calls);
    assert(calls.includes("admin") && calls.includes("agency"), "authority is rechecked for the resolved tenant");
  }

  console.log("\n[5] direct contact lookup follows authorization and does not reveal placement");
  for (const contactId of ["known", "unknown"]) {
    const calls: string[] = [];
    await refusal("browser_actor_not_authorized", {
      bearerToken: "member-jwt", serviceKey: SERVICE, contactId,
    }, { authenticatedActor: "member", activeTenant: "tenant-a", contactTenants: { known: "tenant-a", unknown: null } }, calls);
    assert(!calls.some((call) => call.startsWith("contact:")), "unauthorized direct actor cannot probe " + contactId + " contact");
  }
  {
    const calls: string[] = [];
    await refusal("browser_contact_not_available", {
      bearerToken: "owner-jwt", serviceKey: SERVICE, contactId: "b", tenantHint: "tenant-b",
    }, { authenticatedActor: "owner", activeTenant: "tenant-a", contactTenants: { b: "tenant-b" }, admin: true }, calls);
    assert(calls.includes("contact:b:tenant-a"), "authorized direct contact lookup is constrained to the active tenant");
  }

  console.log("\n[6] tenant-less human platform owner uses the designated operator workspace");
  {
    const result = await resolveSecureBrowserAuthority(
      { bearerToken: "platform-owner-jwt", serviceKey: SERVICE },
      deps({ authenticatedActor: "platform-owner", platformOwner: true, operatorTenant: "operator-tenant" }, []),
    );
    assert(result.tenantId === "operator-tenant", "platform owner resolves the canonical operator tenant");
    assert(result.actorRole === "platform_owner" && result.invocationKind === "platform_owner", "platform-owner provenance remains explicit");
    assert(!secureBrowserNeedsAdminConfirmation(2, 0, result.invocationKind, undefined), "platform owner satisfies the owner confirmation lane");
  }

  console.log("\n[7] internal service preserves MCP channel and re-authorizes its actor");
  {
    const calls: string[] = [];
    await refusal("browser_human_actor_required", { bearerToken: SERVICE, serviceKey: SERVICE, tenantHint: "tenant-a" }, {}, calls);
    assert(calls.length === 0, "internal service without actor performs zero tenant reads or writes");

    const actorlessContactCalls: string[] = [];
    await refusal("browser_human_actor_required", { bearerToken: SERVICE, serviceKey: SERVICE, contactId: "a" }, { contactTenants: { a: "tenant-a" } }, actorlessContactCalls);
    assert(actorlessContactCalls.length === 0, "actorless internal service cannot use a contact to probe tenant data");

    const missingTenantCalls: string[] = [];
    await refusal("browser_authority_unresolved", { bearerToken: SERVICE, serviceKey: SERVICE, invokerUserId: "owner" }, {}, missingTenantCalls);
    assert(missingTenantCalls.length === 0, "internal human actor without contact or tenant source performs zero reads or writes");

    const mismatchCalls: string[] = [];
    await refusal("browser_contact_not_available", { bearerToken: SERVICE, serviceKey: SERVICE, contactId: "b", tenantHint: "tenant-a", invokerUserId: "owner" }, { contactTenants: { b: "tenant-b" }, admin: true }, mismatchCalls);
    assert(mismatchCalls.join(",") === "contact:b:tenant-a", "internal contact/hint mismatch is normalized before authority checks or writes");

    const contactDerived = await resolveSecureBrowserAuthority(
      { bearerToken: SERVICE, serviceKey: SERVICE, contactId: "a", invokerUserId: "owner" },
      deps({ contactTenants: { a: "tenant-a" }, admin: true }, []),
    );
    assert(contactDerived.tenantId === "tenant-a" && contactDerived.invocationKind === "mcp", "internal human actor may derive tenant from a same-tenant contact");

    const adminResult = await resolveSecureBrowserAuthority(
      { bearerToken: SERVICE, serviceKey: SERVICE, tenantHint: "tenant-a", invokerUserId: "owner" },
      deps({ admin: true }, []),
    );
    assert(adminResult.actorRole === "admin" && adminResult.invocationKind === "mcp", "internal admin remains MCP invocation with admin authority");

    const agencyResult = await resolveSecureBrowserAuthority(
      { bearerToken: SERVICE, serviceKey: SERVICE, tenantHint: "tenant-child", invokerUserId: "rep" },
      deps({ agency: true }, []),
    );
    assert(agencyResult.actorRole === "agency" && agencyResult.invocationKind === "mcp", "internal representative remains MCP invocation with agency authority");
    assert(secureBrowserNeedsAdminConfirmation(2, 0, agencyResult.invocationKind, undefined), "internal MCP run cannot impersonate admin confirmation");
  }

  console.log(`\n${failures === 0 ? "ALL AUTHORITY CHECKS PASSED" : `${failures} AUTHORITY CHECK(S) FAILED`}`);
  if (failures > 0) Deno.exit(1);
}

await main();
