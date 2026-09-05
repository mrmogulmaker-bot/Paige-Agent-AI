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

/**
 * REPOINTED 2026-09-05 to the migration that actually defines the live reader.
 *
 * History of this pin, kept because it is the whole argument for having it: it read
 * 20261043000000, then 20261201000800, and now 20261203000000. Each time
 * `get_solo_rail_activity` was redefined, this fence went on passing while guarding a
 * file that no longer shipped — which is precisely the failure its own header warns
 * about. A fence that fences nothing is green.
 *
 * 20261203000000 (SCR-2026-09-05) redefines the reader to pass `w.capability_key` into
 * the display projection so PAIGE's own acts can name themselves. Every property below
 * is unchanged by that and must stay that way.
 *
 * Repoint it again whenever the reader moves.
 */
const FIX = readFileSync(
  "supabase/migrations/20261212000000_paige_can_show_her_work.sql",
  "utf8",
);

/** Everything from the reader's own CREATE onward — never the whole file. */
const READER = (() => {
  const i = FIX.indexOf("CREATE OR REPLACE FUNCTION public.get_solo_rail_activity");
  if (i < 0) throw new Error("get_solo_rail_activity is not defined in the pinned migration");
  return FIX.slice(i);
})();

/**
 * The READER's body alone.
 *
 * This file defines several functions, and slicing from the first `$$` to the last would
 * span all of them — `record_rail_event` legitimately calls `has_any_role`, so a whole-file
 * slice would trip the very first assertion below for the wrong reason. Anchor on the
 * reader's own CREATE and take the body that follows it.
 */
const READER_START = FIX.indexOf("CREATE OR REPLACE FUNCTION public.get_solo_rail_activity");
const BODY = (() => {
  if (READER_START < 0) throw new Error("get_solo_rail_activity is not defined in the pinned migration");
  const after = FIX.slice(READER_START);
  return after.slice(after.indexOf("as $$"), after.indexOf("$$;") + 3);
})();

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
    // Sliced from READER, not FIX. The migration names this function in its header comment and
    // defines several others alongside it, so slicing the whole file swept in record_rail_event's
    // `p_tenant_id` and failed an assertion that is about the READER's signature.
    const signature = READER.slice(0, READER.indexOf("returns table"));
    expect(signature).toMatch(/p_limit/);
    expect(signature).not.toMatch(/p_tenant/i);
    // The reader now UNIONs two tables inside a subquery aliased `e`, so the scoping predicate
    // sits on each half rather than on the alias. Assert BOTH halves — strictly stronger than
    // the single `e.tenant_id` check this replaces, because a union can leak by forgetting
    // either one, and only one of them is about contacts.
    expect(BODY).toMatch(/c\.tenant_id\s*=\s*v_tenant/i);
    expect(BODY).toMatch(/w\.tenant_id\s*=\s*v_tenant/i);
  });

  it("does not widen the projection while fixing the gate", () => {
    const returns = READER.slice(READER.indexOf("returns table"), READER.indexOf("language plpgsql"));
    for (const forbidden of ["payload", "ref_table", "ref_id", "actor_user_id", "contact_id"]) {
      expect(returns).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
    expect(returns).not.toMatch(/\btenant_id\b/);
  });

  it("does not re-grant browser access to the raw event table", () => {
    expect(FIX).not.toMatch(/GRANT\s+SELECT\s+ON\s+public\.paige_client_events/i);
  });
});
