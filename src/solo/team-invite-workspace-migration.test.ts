import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PATH = "supabase/migrations/20261045000000_an_invitation_is_sent_to_the_workspace_the_owner_named.sql";
const sql = readFileSync(resolve(process.cwd(), PATH), "utf8");

/**
 * Negative assertions run against a comment-stripped copy. Without it a test proving the resolver
 * never falls back to a guess can be satisfied by the paragraph explaining why it must not — the
 * assertion would pass on prose while the code did the opposite.
 */
const code = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

/** The body of one function, so an assertion cannot be satisfied by a different function's text. */
function bodyOf(name: string): string {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  const end = code.indexOf("$function$;", start);
  expect(end, `${name} body terminates`).toBeGreaterThan(start);
  return code.slice(start, end);
}

const INVITE_FUNCTIONS = ["create_solo_team_invite", "resend_solo_team_invite", "revoke_solo_team_invite"];

describe("invitation workspace authority — the resolver", () => {
  it("proves authority in the exact workspace that was named, and never picks one", () => {
    const body = bodyOf("solo_team_invite_authority");
    expect(body).toContain("tm.tenant_id = _expected_tenant_id");
    expect(body).toContain("tm.user_id = _actor");
    expect(body).toContain("tm.status = 'active'");
    expect(body).toContain("tm.is_owner OR tm.role IN ('owner'::public.tenant_role, 'admin'::public.tenant_role)");
    // The whole point: no fallback, no ordering, no arbitrary pick.
    expect(body).not.toMatch(/COALESCE\s*\(/i);
    expect(body).not.toMatch(/ORDER\s+BY/i);
    expect(body).not.toMatch(/LIMIT\s+1/i);
  });

  it("refuses a missing workspace instead of choosing one, and refuses an unknown actor", () => {
    const body = bodyOf("solo_team_invite_authority");
    expect(body).toContain("IF _expected_tenant_id IS NULL THEN");
    expect(body).toContain("the workspace for this invitation was not named");
    expect(body).toContain("IF _actor IS NULL THEN");
    expect(body).toContain("not authorized to manage team invitations");
    // Every refusal is 42501 so the edge function maps them to 403 rather than a generic 400.
    const raises = body.match(/RAISE EXCEPTION[^;]+;/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(3);
    for (const raise of raises) expect(raise).toContain("42501");
  });

  it("holds no elevated grant of its own", () => {
    expect(code).toContain(
      "REVOKE ALL ON FUNCTION public.solo_team_invite_authority(uuid, uuid) FROM PUBLIC, anon, authenticated;",
    );
    expect(code).toContain(
      "GRANT EXECUTE ON FUNCTION public.solo_team_invite_authority(uuid, uuid) TO service_role;",
    );
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.solo_team_invite_authority[\s\S]*?SECURITY INVOKER/);
  });
});

describe("invitation workspace authority — the three invitation functions", () => {
  it("stops reading the raw active-workspace pointer entirely", () => {
    // The defect was a raw read of profiles.active_tenant_id. A stale pointer can only steer an
    // invitation if something still READS it, so the claim is about executable bodies — the
    // COMMENT ON text names the column deliberately and is not a read.
    for (const name of [...INVITE_FUNCTIONS, "solo_team_invite_authority"]) {
      const body = bodyOf(name);
      expect(body, `${name} does not read the raw pointer`).not.toContain("active_tenant_id");
      expect(body, `${name} does not touch profiles`).not.toMatch(/public\.profiles/i);
    }
  });

  it("never substitutes the auth.uid()-keyed resolver, which is NULL under service_role", () => {
    for (const name of [...INVITE_FUNCTIONS, "solo_team_invite_authority"]) {
      const body = bodyOf(name);
      expect(body, `${name} does not call the auth.uid() resolver`).not.toContain("current_user_tenant_id()");
      expect(body, `${name} does not depend on auth.uid()`).not.toContain("auth.uid()");
    }
  });

  it("resolves every one of them through the single shared resolver, before any other work", () => {
    for (const name of INVITE_FUNCTIONS) {
      const body = bodyOf(name);
      expect(body, `${name} calls the resolver`).toContain(
        "_tenant := public.solo_team_invite_authority(_actor, _expected_tenant_id);",
      );
      // Authority is proved before anything is read, written, or validated.
      const resolved = body.indexOf("solo_team_invite_authority");
      for (const later of ["INSERT INTO", "UPDATE public.", "SELECT * INTO"]) {
        const at = body.indexOf(later);
        if (at > -1) expect(at, `${name} proves authority before ${later}`).toBeGreaterThan(resolved);
      }
    }
  });

  it("takes the expected workspace as a real parameter on all three", () => {
    for (const name of INVITE_FUNCTIONS) {
      expect(bodyOf(name), `${name} accepts _expected_tenant_id`).toContain("_expected_tenant_id uuid");
    }
  });

  it("drops the guessing signatures rather than leaving them callable beside the new ones", () => {
    // PostgREST picks an overload by the argument names supplied, so a surviving 5-argument form
    // would leave the vulnerable path one omitted parameter away.
    expect(code).toContain("DROP FUNCTION IF EXISTS public.create_solo_team_invite(uuid, text, text, text, text);");
    expect(code).toContain("DROP FUNCTION IF EXISTS public.resend_solo_team_invite(uuid, uuid);");
    expect(code).toContain("DROP FUNCTION IF EXISTS public.revoke_solo_team_invite(uuid, uuid);");
    const dropAt = code.indexOf("DROP FUNCTION IF EXISTS public.create_solo_team_invite");
    const createAt = code.indexOf("CREATE OR REPLACE FUNCTION public.create_solo_team_invite(");
    expect(dropAt, "the old signature is dropped before the new one is created").toBeLessThan(createAt);
  });

  it("carries the proved workspace through the resend re-entry", () => {
    // A resend delegates to create. Passing the PROVED workspace rather than the raw parameter is
    // what stops a resend and a create from ever resolving differently.
    expect(bodyOf("resend_solo_team_invite")).toContain(
      "RETURN public.create_solo_team_invite(_actor, _tenant, _old.email,",
    );
  });

  it("keeps every invitation write inside the proved workspace", () => {
    expect(bodyOf("resend_solo_team_invite")).toContain("WHERE id = _invite_id AND tenant_id = _tenant AND kind = 'team'");
    expect(bodyOf("revoke_solo_team_invite")).toContain("WHERE id = _invite_id AND tenant_id = _tenant AND kind = 'team'");
    expect(bodyOf("create_solo_team_invite")).toContain("WHERE tenant_id = _tenant AND kind = 'team'");
  });

  it("returns the workspace it acted on, so a caller can prove it was not redirected", () => {
    expect(bodyOf("create_solo_team_invite")).toContain("'tenant_id', _tenant");
  });

  it("preserves the protections that already shipped", () => {
    const body = bodyOf("create_solo_team_invite");
    expect(body).toContain("team invitations may grant only Admin or Member");
    expect(body).toContain("a valid email address is required");
    expect(body).toContain("this person already belongs to the workspace");
    expect(body).toContain("work profile is too long");
    expect(bodyOf("resend_solo_team_invite")).toContain("an accepted invitation cannot be resent");
    expect(bodyOf("revoke_solo_team_invite")).toContain("pending team invitation not found");
    // Admins keep invitation authority; only permission changes and removal are owner-only.
    expect(bodyOf("solo_team_invite_authority")).toContain("'admin'::public.tenant_role");
  });

  it("stays unreachable from the browser on every new signature", () => {
    for (const sig of [
      "public.create_solo_team_invite(uuid, uuid, text, text, text, text)",
      "public.resend_solo_team_invite(uuid, uuid, uuid)",
      "public.revoke_solo_team_invite(uuid, uuid, uuid)",
    ]) {
      expect(code).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated;`);
      expect(code).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role;`);
      expect(code).not.toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated;`);
    }
  });

  it("keeps every function pinned to a fixed search_path", () => {
    const definitions = code.match(/CREATE OR REPLACE FUNCTION public\.[\s\S]*?AS \$function\$/g) ?? [];
    expect(definitions.length).toBe(4);
    for (const definition of definitions) {
      expect(definition).toContain("SET search_path TO 'public', 'pg_temp'");
    }
  });
});
