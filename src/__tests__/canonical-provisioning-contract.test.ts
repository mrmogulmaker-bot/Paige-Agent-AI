/**
 * Canonical Solo Provisioning Contract — source-level wiring proof (PR 3).
 *
 * The pgTAP suite (supabase/tests/canonical_solo_provisioning.sql) proves the
 * SQL semantics on the replayed schema. THIS file pins the wiring and the
 * no-dead-flag guarantee at the source level, so a refactor that silently
 * drops the assert call from any producer — or reintroduces the dead
 * solo_shell_enabled into provisioning — fails CI without a database.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  authorizedRootForTier,
  workspaceRootForTenant,
} from "@/lib/auth/workspaceEntry";
import { resolveTierKey } from "@/lib/tier/tierFeatures";

const sql = (path: string) => readFileSync(path, "utf8");
const MIGRATION = "supabase/migrations/20270325000000_canonical_solo_provisioning_contract.sql";

describe("every Solo producer calls the canonical contract on its CREATE path", () => {
  it("provision_tenant (public signup) asserts standalone provisions", () => {
    const src = sql(MIGRATION);
    // The function block for provision_tenant must contain the guarded assert.
    const start = src.indexOf("create or replace function public.provision_tenant(");
    const end = src.indexOf("create or replace function public.provision_tenant_as(");
    const body = src.slice(start, end);
    expect(body).toContain("perform public.assert_canonical_solo_tenant(_tenant);");
    expect(body).toMatch(/if _type = 'standalone' then\s+perform public\.assert_canonical_solo_tenant/);
  });

  it("provision_tenant_as (the paid path's primitive) asserts standalone provisions", () => {
    const src = sql(MIGRATION);
    const start = src.indexOf("create or replace function public.provision_tenant_as(");
    const end = src.indexOf("create or replace function public.operator_provision_tenant(");
    const body = src.slice(start, end);
    expect(body).toContain("perform public.assert_canonical_solo_tenant(_tenant);");
  });

  it("operator_provision_tenant requires an owner, stamps is_owner=true, and asserts UNCONDITIONALLY", () => {
    const src = sql(MIGRATION);
    const start = src.indexOf("create or replace function public.operator_provision_tenant(");
    const body = src.slice(start);
    // The ownerless bypass is REMOVED: the requirement fails closed BEFORE the
    // tenants INSERT (the raise must appear earlier in the body than the INSERT).
    const requireAt = body.indexOf("OPERATOR_PROVISION_OWNER_REQUIRED");
    const insertAt = body.indexOf("insert into public.tenants (");
    expect(requireAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(requireAt);
    // The historical defect fix: explicit is_owner on the membership INSERT.
    expect(body).toMatch(/is_owner, joined_at\)\s+values \(_tenant\.id, _owner_user_id, 'owner', 'active', true/);
    // The contract call is UNCONDITIONAL — no producer-identity bypass.
    expect(body).not.toMatch(/if _owner_user_id is not null then\s+perform public\.assert_canonical_solo_tenant/);
    expect(body).toMatch(/perform public\.assert_canonical_solo_tenant\(_tenant\);\s+return _tenant;/);
    // account_type is now explicit on the INSERT, not inherited from the default.
    expect(body).toMatch(/_status::public\.tenant_status, 'standalone',/);
  });

  it("the trusted membership write captures and restores the EXACT original claims (never synthesized)", () => {
    const src = sql(MIGRATION);
    const body = src.slice(src.indexOf("create or replace function public.operator_provision_tenant("));
    // Captured at function entry, before any logic runs.
    expect(body).toMatch(/_original_claims text := current_setting\('request\.jwt\.claims', true\);/);
    // Cleared ONLY around the bounded write, then restored verbatim.
    const clearAt = body.indexOf("perform set_config('request.jwt.claims', '', true);");
    const writeAt = body.indexOf("insert into public.tenant_members");
    const restoreAt = body.indexOf("perform set_config('request.jwt.claims', coalesce(_original_claims, ''), true);");
    expect(clearAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(clearAt);
    expect(restoreAt).toBeGreaterThan(writeAt);
    // The synthesized-claim reconstruction is GONE.
    expect(body).not.toMatch(/set_config\('request\.jwt\.claims', json_build_object/);
    // The is_platform_owner() gate precedes the trusted write.
    expect(body.indexOf("is_platform_owner()")).toBeLessThan(clearAt);
  });

  it("the assert itself checks all five structural conditions and writes nothing", () => {
    const src = sql(MIGRATION);
    const body = src.slice(src.indexOf("create or replace function public.assert_canonical_solo_tenant"), src.indexOf("create or replace function public.provision_tenant("));
    for (const condition of [
      "parent_tenant_id is not null",
      "account_type <> 'standalone'",
      "account_number is null",
      "is_owner = true",
      "tenant_features tf",
    ]) {
      expect(body).toContain(condition);
    }
    // Read-only contract: the assert contains no INSERT/UPDATE/DELETE in
    // EXECUTABLE SQL (comment prose may legitimately describe writes).
    const bodyExecutable = body
      .split(/\r?\n/)
      .filter((l) => !/^\s*--/.test(l))
      .join("\n");
    expect(bodyExecutable).not.toMatch(/\b(insert|update|delete)\b/i);
    // §59: revoked from every direct caller.
    expect(src).toMatch(/revoke all on function public\.assert_canonical_solo_tenant\(public\.tenants\) from public, anon, authenticated/);
  });
});

describe("the provisioning contract has NO dead-flag dependency", () => {
  it("solo_shell_enabled appears in no EXECUTABLE provisioning SQL (comments excluded)", () => {
    // The migration's header comment names the dead flag precisely to state it
    // is excluded — documentation, not a dependency. The contract checks the
    // executable surface: strip `--` comment lines, then require the flag to
    // be absent entirely.
    const executable = (path: string) =>
      sql(path)
        .split(/\r?\n/)
        .filter((l) => !/^\s*--/.test(l))
        .join("\n");
    for (const file of [MIGRATION, "supabase/tests/canonical_solo_provisioning.sql"]) {
      expect(executable(file), file).not.toContain("solo_shell_enabled");
    }
  });
});

describe("a provisioned tenant routes canonically through the REAL seam (end-to-end shape)", () => {
  // The exact row shape the producers now guarantee, driven through the real
  // classification + routing functions — proving "canonical by construction"
  // lands at /solo/{account}/… with no flag input.
  const provisionedRow = {
    account_type: "standalone" as const,
    parent_tenant_id: null,
    account_number: 42,
    features: {} as Record<string, unknown> | null,
  };

  it("classifies as solo and emits the canonical solo root", () => {
    const tier = resolveTierKey({
      isPlatformStaff: false,
      account_type: provisionedRow.account_type,
      parent_tenant_id: provisionedRow.parent_tenant_id,
    });
    expect(tier).toBe("solo");
    expect(authorizedRootForTier(tier, provisionedRow.account_number)).toBe("/solo/42/command-center");
    expect(workspaceRootForTenant(provisionedRow)).toBe("/solo/42/command-center");
  });

  it("the empty features object changes nothing — flags are not routing inputs", () => {
    expect(workspaceRootForTenant({ ...provisionedRow, features: { solo_shell_enabled: false } }))
      .toBe("/solo/42/command-center");
    expect(workspaceRootForTenant({ ...provisionedRow, features: null }))
      .toBe("/solo/42/command-center");
  });
});
