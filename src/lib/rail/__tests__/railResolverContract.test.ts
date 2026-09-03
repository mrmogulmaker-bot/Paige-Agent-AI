/**
 * Rail Recovery #746 — Slice A. The safety contract of the server-owned Rail resolver.
 *
 * This is a FOUNDATION slice: it introduces `get_solo_rail_activity` and changes no screen. The
 * value it must hold is that the resolver cannot later be widened by accident, so these assertions
 * read the migration itself. They are static (they do not execute SQL); the executable proof is the
 * rollback apply recorded on the PR and the persisted-apply CI does on merge (§32.a).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  "supabase/migrations/20261042000000_the_owner_can_read_their_own_rail.sql",
  "utf8",
);

describe("#746 Slice A — the resolver refuses rather than returning an empty timeline", () => {
  it("raises 42501 instead of RETURN on a failed authorization check", () => {
    // The whole point of #746: at the time this was written, `get_client_rail` and
    // `get_platform_rail` both `RETURN;`ed when the caller failed their check, so a refusal was
    // indistinguishable from an empty workspace. A reader that returns zero rows on denial
    // reproduces the empty-feed lie one layer down.
    //
    // Both have since been corrected, and the comment is updated rather than left asserting the
    // opposite of live behaviour: `get_client_rail` by 20261044000000, and `get_platform_rail` by
    // 20261049000000. No Rail reader still answers a denial with an empty set.
    expect(SQL).toMatch(/RAISE EXCEPTION[\s\S]*?42501/i);
    expect(SQL).toMatch(/auth\.uid\(\)/);
  });
});

describe("#746 Slice A — the caller cannot name a workspace", () => {
  it("takes only p_limit — there is no tenant parameter to supply", () => {
    const signature = SQL.slice(SQL.indexOf("get_solo_rail_activity"), SQL.indexOf("RETURNS TABLE"));
    expect(signature).toMatch(/p_limit/);
    expect(signature).not.toMatch(/p_tenant|tenant_id\s+uuid/i);
  });

  it("resolves the workspace server-side", () => {
    expect(SQL).toMatch(/current_user_tenant_id\(\)/);
  });
});

describe("#746 Slice A — the projection carries no identifier, payload or source record", () => {
  const forbidden = ["payload", "ref_table", "ref_id", "actor_user_id"];
  const returnsBlock = SQL.slice(SQL.indexOf("RETURNS TABLE"), SQL.indexOf("LANGUAGE plpgsql"));

  it.each(forbidden)("does not return %s", (col) => {
    expect(returnsBlock).not.toMatch(new RegExp(`\\b${col}\\b`));
  });

  it("does not return tenant_id or contact_id", () => {
    // An owner-visible history needs neither, and both are internal identifiers.
    expect(returnsBlock).not.toMatch(/\btenant_id\b/);
    expect(returnsBlock).not.toMatch(/\bcontact_id\b/);
  });
});

describe("#746 Slice A — the browser keeps no table access", () => {
  it("re-asserts the SELECT revoke on the event table", () => {
    expect(SQL).toMatch(/REVOKE SELECT ON public\.paige_client_events FROM[^;]*authenticated/i);
  });

  it("denies anonymous execution and grants only the authenticated path", () => {
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.get_solo_rail_activity\(integer\) FROM[^;]*anon/i);
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_solo_rail_activity\(integer\) TO[^;]*authenticated/i);
  });
});
