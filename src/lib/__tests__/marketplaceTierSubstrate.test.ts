import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Static invariant guard for the Wave 3.9 Slice 0 marketplace_items tier/role/publish
// substrate migration (#277). The RUNTIME behaviour is proven by the §32 BEGIN..ROLLBACK
// proof against prod (SET LOCAL ROLE authenticated + per-user jwt.claims); this test locks
// the SECURITY-CRITICAL clauses into place so a future edit cannot silently strip or loosen
// them (§13/§32/§39). It reads the migration SQL and asserts the load-bearing predicates are
// present — it does NOT touch a database.
const SQL = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260805170000_marketplace_items_tier_metadata_substrate.sql",
  ),
  "utf8",
);

// strip SQL line-comments, then collapse whitespace, so multi-line SQL (with inline
// `-- ...` annotations between clauses) is matchable as single-line substrings
const FLAT = SQL.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ");

describe("marketplace tier/role/publish substrate migration (#277, 3-tier cascade)", () => {
  it("adds the five metadata columns", () => {
    for (const col of [
      "available_to_tiers",
      "installable_by_role",
      "source_type",
      "publisher_tenant_id",
      "publish_status",
    ]) {
      expect(FLAT).toContain(`ADD COLUMN IF NOT EXISTS ${col}`);
    }
  });

  it("constrains source_type and publish_status to their vocabularies (text + CHECK)", () => {
    expect(FLAT).toContain(
      "source_type IN ('platform','tenant_published','third_party')",
    );
    expect(FLAT).toContain(
      "publish_status IN ('draft','in_review','approved','suspended')",
    );
  });

  it("constrains the tier/role arrays to the canonical vocab via jsonb <@ containment", () => {
    // ONLY the three canonical tiers — Solo/Agency/Enterprise (no Free/Team/Academy)
    expect(FLAT).toContain(
      `available_to_tiers <@ '["Solo","Agency","Enterprise"]'::jsonb`,
    );
    expect(FLAT).toContain(
      `installable_by_role <@ '["tenant_admin","agency_owner","staff","client"]'::jsonb`,
    );
    // both are guarded as arrays
    expect(FLAT).toContain("jsonb_typeof(available_to_tiers) = 'array'");
    expect(FLAT).toContain("jsonb_typeof(installable_by_role) = 'array'");
  });

  it("enforces provenance integrity: platform => no publisher; non-platform => a publisher", () => {
    expect(FLAT).toContain("mp_items_publisher_provenance_ck");
    expect(FLAT).toMatch(
      /source_type\s*=\s*'platform'\s+AND\s+publisher_tenant_id\s+IS\s+NULL/i,
    );
    expect(FLAT).toMatch(
      /source_type\s*<>\s*'platform'\s+AND\s+publisher_tenant_id\s+IS\s+NOT\s+NULL/i,
    );
  });

  it("indexes both jsonb gate columns with GIN so ?| is index-assisted", () => {
    expect(FLAT).toContain(
      "CREATE INDEX IF NOT EXISTS mp_items_tiers_gin ON public.marketplace_items USING gin (available_to_tiers)",
    );
    expect(FLAT).toContain(
      "CREATE INDEX IF NOT EXISTS mp_items_roles_gin ON public.marketplace_items USING gin (installable_by_role)",
    );
  });

  it("resolves subscription tier from platform_subscriptions, NOT account_type (#272)", () => {
    expect(FLAT).toContain("FROM public.platform_subscriptions ps");
    expect(FLAT).toContain(
      "JOIN public.platform_subscription_plans pl ON pl.id = ps.plan_id",
    );
    // must NOT reuse account_tier() (the #272 trap: that is account STRUCTURE, not billing tier)
    expect(FLAT).not.toContain("account_tier(");
    // only a LIVE plan grants a tier — past_due/canceled do NOT
    expect(FLAT).toContain("ps.status IN ('active','trialing')");
  });

  it("fails closed to the most-restrictive tier (Solo) on no/unknown subscription", () => {
    // unknown slug -> Solo (the ELSE arm) and no row -> Solo (the COALESCE default)
    expect(FLAT).toMatch(/ELSE 'Solo'/);
    expect(FLAT).toMatch(/LIMIT 1\),\s*'Solo'/);
    // the stale Free/Team/Academy vocabulary must NOT reappear as tier values
    expect(FLAT).not.toContain(`available_to_tiers <@ '["Free"`);
    expect(FLAT).not.toMatch(/WHEN 'team' THEN 'Team'/i);
  });

  it("cascades higher tiers over the lower-tier catalog (Option B, at-or-below key set)", () => {
    expect(FLAT).toContain(
      `WHEN 'Enterprise' THEN ARRAY['Enterprise','Agency','Solo']`,
    );
    expect(FLAT).toContain(`WHEN 'Agency' THEN ARRAY['Agency','Solo']`);
    expect(FLAT).toContain(`ELSE ARRAY['Solo']`);
  });

  it("role resolver only grants agency_owner for a GENUINE governing agency (no self-fallback leak)", () => {
    // the governing agency is parent-if-agency / self-if-agency / else NONE — gated on account_type
    expect(FLAT).toContain(`par.account_type IN ('agency','enterprise')`);
    expect(FLAT).toContain(`t.account_type IN ('agency','enterprise')`);
    // the buggy self-fallback (COALESCE(parent, _tenant_id) passed straight to agency_team_role)
    // that over-granted every standalone owner the agency_owner key must NOT be present
    expect(FLAT).not.toMatch(
      /agency_team_role\(\s*COALESCE\(\(SELECT t\.parent_tenant_id[^)]*\),\s*_tenant_id\)/i,
    );
  });

  it("READ policy AND-s the new tier/role/publish gates on top of the preserved §9 scope", () => {
    // publish lifecycle gate
    expect(FLAT).toContain("publish_status = 'approved'");
    // cascading tier gate via ?| over the at-or-below key set
    expect(FLAT).toContain(
      "available_to_tiers ?| public._mp_tier_cascade_keys( public.current_tenant_tier())",
    );
    // role gate via ?| over the caller's resolved role keys
    expect(FLAT).toContain(
      "installable_by_role ?| public._mp_caller_role_keys()",
    );
    // §9 scope clause PRESERVED (own-tenant / own-agency / public)
    expect(FLAT).toContain(
      "scope = 'tenant' AND visible_to_tenant_id = public.current_user_tenant_id()",
    );
    expect(FLAT).toContain(
      "scope = 'agency' AND public.agency_team_role(visible_to_agency_id, auth.uid()) IS NOT NULL",
    );
    // Super Admin still short-circuits to see everything
    expect(FLAT).toContain("public.is_platform_owner() OR (");
  });

  it("WRITE policy is owner-LOCKED (no vendor-tenant-admin branch survives)", () => {
    expect(FLAT).toMatch(
      /CREATE POLICY mp_items_write ON public\.marketplace_items\s+FOR ALL TO authenticated\s+USING\s*\(public\.is_platform_owner\(\)\)\s+WITH CHECK\s*\(public\.is_platform_owner\(\)\)/,
    );
    // the dead vendor branch must be gone from the write policy
    expect(FLAT).not.toContain(
      "v.owner_tenant_id IS NOT NULL AND is_tenant_admin",
    );
  });

  it("browse RPC parity: BOTH overloads gate identically to the table read (§37)", () => {
    expect(FLAT).toContain("i.publish_status = 'approved'");
    expect(FLAT).toContain(
      "i.available_to_tiers ?| public._mp_tier_cascade_keys( public.current_tenant_tier(_tenant_id))",
    );
    // one-arg overload uses auth.uid(); service-role overload uses the passed actor
    expect(FLAT).toContain(
      "i.installable_by_role ?| public._mp_caller_role_keys(_tenant_id, auth.uid())",
    );
    expect(FLAT).toContain(
      "i.installable_by_role ?| public._mp_caller_role_keys(_tenant_id, _actor_user_id)",
    );
  });

  it("§2: backfill never seeds a default and never touches the finance flag", () => {
    // the backfill sets tiers/roles/provenance/publish but flips NO default_for_new_tenants
    expect(FLAT).not.toMatch(/default_for_new_tenants\s*=\s*true/i);
    // and does not touch is_finance (funding/funding_preset opt-in gating untouched)
    expect(FLAT).not.toMatch(/SET[^;]*is_finance/i);
  });

  it("backfills EVERY existing row uniformly to all-tiers / tenant-admin / platform / approved", () => {
    expect(FLAT).toContain(
      `available_to_tiers = '["Solo","Agency","Enterprise"]'::jsonb`,
    );
    expect(FLAT).toContain(`installable_by_role = '["tenant_admin"]'::jsonb`);
    expect(FLAT).toMatch(/source_type\s*=\s*'platform'/);
    expect(FLAT).toMatch(/publish_status\s*=\s*'approved'/);
  });
});
