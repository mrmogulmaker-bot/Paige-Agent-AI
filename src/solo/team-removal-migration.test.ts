/**
 * The Solo Team removal seam, asserted against the migration that defines it.
 *
 * WHAT THIS IS AND IS NOT. These are SOURCE-LEVEL assertions on SQL text. They prove the guards
 * are written, and written in the right order; they do not prove the function runs. Runtime proof
 * against a real workspace is a different and stronger class, and it is reported separately rather
 * than folded in here.
 *
 * WHY ORDER IS ASSERTED AND NOT JUST PRESENCE. Every guard here is worth exactly what it is worth
 * BEFORE the DELETE. A refusal written after the row is gone is not a refusal, and "the string
 * appears somewhere in the file" cannot tell the two apart — so each guard's index is compared
 * against the index of the write. Two of them additionally have to precede the target LOOKUP, not
 * merely the write, and that is asserted separately because the reason is different: a not-found
 * message returned to a caller who was never entitled to ask is a membership oracle.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PATH = "supabase/migrations/20261046000000_an_owner_can_remove_someone_from_their_workspace.sql";
const sql = readFileSync(resolve(process.cwd(), PATH), "utf8");

/** The one function this migration adds — its signature, its header, and its body. */
const body = sql.slice(
  sql.indexOf("CREATE OR REPLACE FUNCTION public.remove_solo_team_member"),
  sql.indexOf("REVOKE ALL ON FUNCTION public.remove_solo_team_member"),
);

/**
 * The same function with every `--` comment stripped.
 *
 * Every "must NOT contain" assertion below runs against THIS, not against `body`. The reason is a
 * real failure caught while writing these: `expect(code).not.toContain("user_roles")` — meant to
 * prove the function does not write that table — failed on the comment that explains why it does
 * not. A prohibition that a comment can violate is measuring prose, and would equally be satisfied
 * by deleting the explanation while leaving the write.
 */
const code = body.replace(/--[^\n]*/g, "");

/**
 * Indexes CODE, never prose. Every ordering assertion below is "this guard precedes the write", and
 * a comment quoting the guard text placed above the DELETE would satisfy that against `body` while
 * the real guard sat after it. No guard string is comment-shadowed today; the point is that it
 * could be, and then the whole ordering suite would be measuring the wrong thing silently.
 */
const at = (needle: string) => {
  const index = code.indexOf(needle);
  expect(index, `expected the function's CODE to contain ${JSON.stringify(needle)}`).toBeGreaterThan(-1);
  return index;
};

const deleteAt = () => at("DELETE FROM public.tenant_members");
const lookupAt = () => at("FOR UPDATE");

describe("remove_solo_team_member — the shape of the seam", () => {
  it("adds one callable function and redefines no neighbour", () => {
    // Scope, asserted mechanically. This slice owns removal. Redefining an adjacent Team function
    // here is how an access-removal change quietly becomes an invitation change.
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    for (const sibling of [
      "FUNCTION public.set_solo_team_member_permission",
      "FUNCTION public.set_solo_team_member_work_profile",
      "FUNCTION public.create_solo_team_invite",
      "FUNCTION public.accept_solo_team_invite",
      "FUNCTION public.get_solo_team_workspace",
    ]) expect(sql).not.toContain(sibling);
  });

  it("runs as DEFINER on a pinned search_path, reachable only by a signed-in caller", () => {
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.remove_solo_team_member(uuid, uuid) FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.remove_solo_team_member(uuid, uuid) TO authenticated;");
  });

  it("derives the actor and the workspace from the session and takes neither as authority", () => {
    // THE ISOLATION STORY. `_expected_tenant_id` is present but is a REFUSAL token: the scope the
    // function acts on is `current_user_tenant_id()` and nothing else, so passing a different
    // workspace id can only make the call fail. It can never select one. That distinction is the
    // whole reason it is safe, so it is asserted rather than trusted to a reader's good faith.
    expect(body).toContain("_actor uuid := auth.uid()");
    expect(body).toContain("_tenant uuid := public.current_user_tenant_id()");
    expect(code).toContain("_expected_tenant_id IS DISTINCT FROM _tenant");
    // The parameter may appear in EXACTLY ONE place in the code: the comparison that refuses. If it
    // is read anywhere else it has stopped being a refusal token and started being a selector.
    expect(code.split("_expected_tenant_id").length - 1, "_expected_tenant_id is read more than once").toBe(2);
    expect(code).toContain("tm.tenant_id = _tenant");
    // The word is in the prose for a human; the assertion above is what actually holds it true.
    expect(body).toContain("refusal-only");
  });

  it("refuses an unauthenticated caller and a caller with no active workspace", () => {
    expect(at("_actor IS NULL OR _tenant IS NULL")).toBeLessThan(deleteAt());
  });
});

describe("remove_solo_team_member — who may act", () => {
  it("admits only the workspace owner, and never an admin", () => {
    expect(body).toContain("public.is_tenant_owner(_actor, _tenant)");
    expect(body).toContain("only the workspace owner may remove someone from this workspace");
    // is_tenant_admin is the easy mistake: it admits admins, who must never remove people.
    expect(code).not.toContain("is_tenant_admin");
  });

  it("settles authority BEFORE it looks the target up, so a refusal is never a membership oracle", () => {
    // "That person is not on this workspace's team" is information. Told to somebody who was never
    // entitled to ask, it answers "is user X in workspace Y" for any X they can name.
    expect(at("public.is_tenant_owner(_actor, _tenant)")).toBeLessThan(lookupAt());
    expect(at("_expected_tenant_id IS DISTINCT FROM _tenant")).toBeLessThan(lookupAt());
  });

  it("refuses self-removal", () => {
    expect(body).toContain("_member_user_id = _actor");
    expect(body).toContain("you cannot remove yourself from this workspace");
    expect(at("_member_user_id = _actor")).toBeLessThan(deleteAt());
  });
});

describe("remove_solo_team_member — who may be removed", () => {
  it("takes the target row under lock, and has an explicit not-found branch", () => {
    // Without the lock, grant_co_owner can flip the target to is_owner between an unlocked read
    // and the write, and there is no BEFORE DELETE trigger on tenant_members to catch the result.
    expect(code).toMatch(/SELECT \* INTO _target[\s\S]{0,240}FOR UPDATE/);
    expect(at("_target.id IS NULL")).toBeLessThan(deleteAt());
    expect(body).toContain("that person is not on this workspace");
  });

  it("looks the target up without a status filter, so no membership becomes unremovable", () => {
    // UNIQUE (tenant_id, user_id) means at most one row can match. Filtering by status here would
    // make a non-active row invisible to this function while create_solo_team_invite still counts
    // it as belonging to the workspace — unremovable AND un-re-invitable at the same time.
    const lookup = code.slice(code.indexOf("SELECT * INTO _target"), code.indexOf("FOR UPDATE"));
    expect(lookup).not.toContain("status");
  });

  it("refuses an owner outright, which is what makes the sole owner unreachable", () => {
    // Ownership transfer and any multi-owner rule are a separate assignment. Refusing EVERY owner
    // makes "the sole owner is never removable" true without depending on a count that could be
    // got wrong; the role restriction below is the second, independent guard on the same thing.
    expect(body).toContain("_target.is_owner OR _target.role = 'owner'::public.tenant_role");
    expect(body).toContain("an owner cannot be removed from this workspace here");
    expect(at("an owner cannot be removed from this workspace here")).toBeLessThan(deleteAt());
  });

  it("removes only an Admin or a Member, and refuses anything else rather than guessing", () => {
    // The roster shows legacy specialised permissions (coach) truthfully and this surface does not
    // relabel or reassign them. Refusing is honest. Silently removing one would not be.
    expect(body).toContain("_target.role NOT IN ('admin'::public.tenant_role, 'member'::public.tenant_role)");
    expect(body).toContain("only an Admin or a Member can be removed from this workspace");
    expect(at("only an Admin or a Member can be removed from this workspace")).toBeLessThan(deleteAt());
  });
});

describe("remove_solo_team_member — what removal actually does", () => {
  it("ends access by deleting the membership, and reaches nothing wider", () => {
    expect(body).toContain("WHERE id = _target.id");
    // It is an access change, not an erasure. None of these belong anywhere near it.
    for (const forbidden of [
      /DELETE FROM (public\.)?profiles/,
      /DELETE FROM auth\.users/,
      /DELETE FROM (public\.)?audit_logs/,
      /DELETE FROM (public\.)?contacts/,
      /DELETE FROM (public\.)?tenant_invite_tokens/,
      /DELETE FROM (public\.)?user_roles/,
    ]) expect(code).not.toMatch(forbidden);
  });

  it("leaves the global role revocation to the trigger that already owns it", () => {
    // trg_sync_tenant_member_to_user_roles fires AFTER DELETE and drops the mapped app_role iff no
    // other ACTIVE membership still grants it. A second writer here would revoke a role the person
    // still legitimately holds in another workspace.
    expect(code).not.toContain("user_roles");
    expect(sql).toContain("trg_sync_tenant_member_to_user_roles");
  });

  it("confirms the row actually went before it claims anything", () => {
    expect(code).toContain("GET DIAGNOSTICS");
    expect(code).toContain("ROW_COUNT");
    // The assertion this test is NAMED for, and which it did not previously make: deleting the
    // comparison while keeping the GET DIAGNOSTICS line used to leave this test green.
    expect(code).toContain("_removed <> 1");
    expect(at("GET DIAGNOSTICS")).toBeLessThan(at("INSERT INTO public.audit_logs"));
  });

  it("clears the removed person's pointer at a workspace they can no longer reach", () => {
    // Nothing else resets it: the profiles guard fires only when active_tenant_id CHANGES, so a
    // stale value is never revalidated, and three invitation RPCs read that column raw — which is
    // how a person removed from A is told they are not the owner of their own workspace B.
    expect(body).toContain("UPDATE public.profiles");
    expect(body).toContain("SET active_tenant_id = NULL");
    expect(body).toContain("WHERE user_id = _member_user_id");
    expect(body).toContain("AND active_tenant_id = _tenant");
    expect(at("UPDATE public.profiles")).toBeGreaterThan(deleteAt());
  });

  it("records who did it, to whom, and what they held — without copying identity into the log", () => {
    expect(body).toContain("INSERT INTO public.audit_logs");
    expect(body).toContain("'member_removed'");
    expect(body).toContain("'target_user_id', _member_user_id");
    expect(body).toContain("'role'");
    // Ids and the role, matching the sibling Team writes. An email or a display name in a durable
    // log is payload this action has no reason to spread.
    expect(code).not.toContain("au.email");
    expect(code).not.toContain("full_name");
  });

  it("echoes the workspace it acted on, so the screen can refuse to claim the wrong one", () => {
    expect(body).toContain("'tenant_id', _tenant");
    expect(body).toContain("'membership_id', _target.id");
    expect(body).toContain("'removed_user_id', _member_user_id");
    expect(code).not.toContain("'email'");
    expect(code).not.toContain("'token'");
  });
});

describe("the table underneath — a guarded function is not a boundary on its own", () => {
  it("withdraws every destructive verb from both browser roles", () => {
    // Without this, the owner-only function above is advice rather than a boundary: measured on
    // production, `authenticated` held DELETE on tenant_members and the "Tenant admins manage
    // members" policy is FOR ALL admitting is_tenant_admin(tenant_id) — so an admin, who must never
    // remove anyone, could DELETE any membership row (every owner's included) through PostgREST.
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tenant_members FROM anon, authenticated;");
  });

  it("names TRUNCATE explicitly, because row-level security does not reach it", () => {
    // MEASURED, NOT ASSUMED, and the distinction is the whole point. On a scratch table with a
    // deny-everything policy, DELETE as `authenticated` removed 0 of 3 rows and TRUNCATE as
    // `authenticated` removed all 3. anon and authenticated both held TRUNCATE on the real table,
    // granted by project-level default privileges rather than by any migration here — so no amount
    // of policy work would have found or fixed it.
    // Against the REVOKE statement, not against the paragraph explaining it: the previous version
    // of this assertion passed on the comment block alone, so removing TRUNCATE from the grant list
    // would not have failed it.
    const revoke = sql.slice(sql.indexOf("REVOKE INSERT, UPDATE, DELETE, TRUNCATE"));
    expect(revoke).toMatch(/^REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.tenant_members FROM anon, authenticated;/);
  });

  it("leaves reads alone, because roughly ten browser reads depend on them", () => {
    expect(sql).not.toMatch(/REVOKE[^;]*SELECT[^;]*ON public\.tenant_members/);
  });

  it("no longer describes itself as advisory, because it is no longer advisory", () => {
    // The first draft of this migration carried a comment admitting the function was advisory
    // against direct table access. That sentence was true when written and false the moment the
    // revoke landed, and a stale caveat is its own kind of lie.
    const fnComment = sql.slice(sql.indexOf("COMMENT ON FUNCTION public.remove_solo_team_member"));
    expect(fnComment).not.toMatch(/advisory/i);
    expect(fnComment).toContain("SUPPORTED removal");
  });
});
