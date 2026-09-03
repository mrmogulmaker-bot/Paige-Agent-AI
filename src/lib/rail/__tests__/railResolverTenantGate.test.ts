/**
 * Rail remediation #794 — the resolver's role check must be TENANT-SCOPED.
 *
 * HONEST NOTE ABOUT WHAT THIS FILE IS AND IS NOT. These are static assertions over the migration
 * text. Static assertions are exactly what FAILED to catch the original defect: the Slice A suite
 * asserted the function faithfully reproduced `pce_staff_read`, and reproducing that policy WAS the
 * defect. So this file is a regression fence, not the proof. The proof is the seeded two-direction
 * behavioural run on a disposable database, recorded on the PR — one call that returns rows before
 * the fix and raises 42501 after, for the same caller.
 *
 * What this fence is good for: someone later "simplifying" the gate back to the global helper, or
 * copying `pce_staff_read` into the next reader, trips it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FIX = readFileSync(
  "supabase/migrations/20261043000000_the_rail_reader_checks_the_right_tenant.sql",
  "utf8",
);

/** The function body, so assertions cannot be satisfied by prose in the header comment. */
const BODY = FIX.slice(FIX.indexOf("as $$"), FIX.lastIndexOf("$$;"));

describe("#794 — the role question is asked about the workspace the rows come from", () => {
  it("no longer consults the tenant-agnostic global role helper", () => {
    // `has_any_role` reads public.user_roles, which has no tenant_id. Asking it a question about
    // "is this person staff" and then returning a specific tenant's rows is the whole defect.
    expect(BODY).not.toMatch(/has_any_role/);
  });

  it("gates on an active tenant_members row for the SAME resolved tenant", () => {
    expect(BODY).toMatch(/from\s+public\.tenant_members\s+m/i);
    expect(BODY).toMatch(/m\.user_id\s*=\s*v_uid/i);
    // The load-bearing line: the membership must be in the tenant whose rows are returned.
    expect(BODY).toMatch(/m\.tenant_id\s*=\s*v_tenant/i);
    expect(BODY).toMatch(/m\.status\s*=\s*'active'/i);
  });

  it("accepts only the three staff seats, never a plain member", () => {
    const gate = BODY.slice(BODY.indexOf("tenant_members"), BODY.indexOf("raise exception", BODY.indexOf("tenant_members")));
    expect(gate).toMatch(/m\.role\s+in\s*\(\s*'owner',\s*'admin',\s*'coach'\s*\)/i);
    expect(gate).not.toMatch(/'member'/);
  });

  it("still refuses rather than returning an empty timeline", () => {
    // The Slice A property must survive the remediation.
    expect(BODY).toMatch(/raise exception using errcode\s*=\s*'42501'/i);
    expect(BODY).not.toMatch(/\breturn;\s*$/m);
  });

  it("still takes no tenant parameter and still filters by the server-resolved tenant", () => {
    const signature = FIX.slice(FIX.indexOf("get_solo_rail_activity"), FIX.indexOf("returns table"));
    expect(signature).toMatch(/p_limit/);
    expect(signature).not.toMatch(/p_tenant/i);
    expect(BODY).toMatch(/e\.tenant_id\s*=\s*v_tenant/i);
  });

  it("does not widen the projection while fixing the gate", () => {
    const returns = FIX.slice(FIX.indexOf("returns table"), FIX.indexOf("language plpgsql"));
    for (const forbidden of ["payload", "ref_table", "ref_id", "actor_user_id", "contact_id"]) {
      expect(returns).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
    expect(returns).not.toMatch(/\btenant_id\b/);
  });

  it("does not re-grant browser access to the raw event table", () => {
    expect(FIX).not.toMatch(/GRANT\s+SELECT\s+ON\s+public\.paige_client_events/i);
  });
});
