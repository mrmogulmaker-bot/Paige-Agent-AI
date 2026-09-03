/**
 * Rail reader security — the platform Rail refuses rather than returning an empty result.
 *
 * `get_platform_rail` gates correctly on `is_platform_owner()`, so this is NOT a disclosure
 * defect and must not be described as one. What it does wrong is the shape of the refusal: it
 * `RETURN;`s, so a caller who is denied receives a successful, empty result set that is
 * indistinguishable from "the platform Rail has no events". That is the same empty-feed lie the
 * #746 line of work exists to delete, on the last reader still carrying it.
 *
 * These assertions are STATIC — they read the migration text and do not execute SQL. The
 * executable proof is the local replay recorded on the PR and the persisted apply CI performs on
 * merge. A static assertion alone never proves the deployed body changed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  "supabase/migrations/20261049000000_the_platform_rail_refuses_rather_than_returning_empty.sql",
  "utf8",
);

/** The body of `get_platform_rail` only, so a match cannot come from another statement. */
const BODY = (() => {
  const start = SQL.toLowerCase().indexOf("create or replace function public.get_platform_rail");
  expect(start, "the migration must redefine get_platform_rail").toBeGreaterThan(-1);
  const end = SQL.toLowerCase().indexOf("$function$", SQL.toLowerCase().indexOf("$function$", start) + 1);
  return SQL.slice(start, end > start ? end : undefined);
})();

describe("get_platform_rail — a denied caller is told, not handed an empty timeline", () => {
  it("raises 42501 on the authorization failure", () => {
    expect(BODY).toMatch(/raise\s+exception[\s\S]*?42501/i);
  });

  it("no longer answers a failed check with a bare RETURN", () => {
    // The exact defect: `IF NOT public.is_platform_owner() THEN RETURN; END IF;`
    expect(BODY).not.toMatch(/is_platform_owner\(\)\s*then\s*return\s*;/i);
  });

  it("still gates on platform ownership — the fix changes the refusal, never the authority", () => {
    expect(BODY).toMatch(/is_platform_owner\(\)/i);
  });

  it("preserves the platform-owner authority level and does not widen to platform_admin", () => {
    // §53: is_platform_owner() is frozen as super_admin-only. A refusal repair must not quietly
    // promote this reader to the wider operator helper.
    expect(BODY).not.toMatch(/is_platform_operator\(\)/i);
  });
});

describe("get_platform_rail — the projection is unchanged by this slice", () => {
  const signature = BODY.slice(0, BODY.toLowerCase().indexOf("language"));

  it("returns the same columns it already returned", () => {
    for (const col of [
      "id", "tenant_id", "contact_id", "event_kind", "surface",
      "actor_type", "audience", "visibility", "title", "summary", "occurred_at",
    ]) {
      expect(signature.toLowerCase()).toContain(col);
    }
  });

  it("still carries no raw payload or internal source reference", () => {
    // tenant_id and contact_id ARE returned here and that is correct: this reader exists so a
    // platform owner can see across tenants, and it is gated to exactly that caller. What must
    // never appear is the raw event payload or the producer's internal row pointers.
    for (const forbidden of ["payload", "ref_table", "ref_id", "actor_user_id"]) {
      expect(signature.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("keeps the caller-supplied limit bounded", () => {
    expect(BODY).toMatch(/least\s*\(\s*greatest/i);
  });
});

describe("the execute grant is not widened by the repair", () => {
  it("keeps anon revoked and authenticated granted", () => {
    expect(SQL).toMatch(/revoke\s+all\s+on\s+function\s+public\.get_platform_rail[\s\S]*?anon/i);
    expect(SQL).toMatch(/grant\s+execute\s+on\s+function\s+public\.get_platform_rail[\s\S]*?authenticated/i);
  });
});
