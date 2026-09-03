/**
 * #804 — client Rail authority is decided inside the workspace the data belongs to, and PAIGE Chat
 * receives only the evidence it renders.
 *
 * HONEST NOTE ABOUT WHAT THIS FILE IS. The migration assertions are static text checks. Static
 * checks are exactly what failed to catch #794: the Slice A suite asserted the new function matched
 * `pce_staff_read`, and matching that policy WAS the defect. So treat them as a regression fence —
 * they stop someone "simplifying" the gate back to the global helper or re-widening the projection.
 * The PROOF is the seeded two-direction behavioural run recorded on the PR: the same caller reading
 * the same client, returning staff-lens rows before the fix and raising 42501 after.
 *
 * The consumer assertions are different in kind and are NOT merely a fence: they check the real call
 * sites in the deployed edge function against the contract this migration establishes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  "supabase/migrations/20261044000000_rail_authority_is_decided_in_this_workspace.sql",
  "utf8",
);
const CHAT = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");

/** Slice out one function body so a prose header comment can never satisfy an assertion. */
function bodyOf(name: string): string {
  const start = MIGRATION.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined in this migration`).toBeGreaterThan(-1);
  const open = MIGRATION.indexOf("as $$", start);
  const close = MIGRATION.indexOf("$$;", open);
  expect(close).toBeGreaterThan(open);
  return MIGRATION.slice(open, close);
}

const READER = bodyOf("get_client_rail");
const CHAT_FN = bodyOf("get_client_rail_for_chat");

describe("#804 — the role question is asked about the workspace the client belongs to", () => {
  for (const [label, body] of [["get_client_rail", READER], ["get_client_rail_for_chat", CHAT_FN]] as const) {
    it(`${label}: no longer consults the tenant-agnostic global role helper`, () => {
      // public.user_roles has no tenant_id. Asking it "is this person staff" and then serving a
      // specific workspace's rows is the whole defect.
      expect(body).not.toMatch(/has_any_role/);
    });

    it(`${label}: gates on an active tenant_members row for the client's OWN tenant`, () => {
      expect(body).toMatch(/from\s+public\.tenant_members\s+m/i);
      expect(body).toMatch(/m\.user_id\s*=\s*v_uid/i);
      expect(body).toMatch(/m\.tenant_id\s*=\s*v_tenant/i);
      expect(body).toMatch(/m\.status\s*=\s*'active'/i);
      expect(body).toMatch(/m\.role\s+in\s*\(\s*'owner',\s*'admin',\s*'coach'\s*\)/i);
    });

    it(`${label}: PRESERVES the active-workspace boundary rather than replacing it`, () => {
      // The instruction is explicit that current_user_tenant_id() must not be weakened. The fix
      // ADDS the membership predicate; it does not swap one check for another.
      expect(body).toMatch(/v_tenant\s*=\s*public\.current_user_tenant_id\(\)/i);
    });

    it(`${label}: every refusal raises 42501 — never an empty result`, () => {
      // A denied caller receiving [] is indistinguishable from "nothing happened for this client".
      expect(body).not.toMatch(/^\s*return;\s*$/m);
      const raises = body.match(/raise exception using errcode\s*=\s*'42501'/gi) ?? [];
      // uid-null, contact-not-found, and not-permitted.
      expect(raises.length).toBeGreaterThanOrEqual(3);
    });

    it(`${label}: keeps the client-subject audience filter exactly as proven`, () => {
      expect(body).toMatch(/e\.audience\s+in\s*\(\s*'client',\s*'both'\s*\)/i);
      expect(body).toMatch(/e\.visibility\s*=\s*'client_visible'/i);
    });
  }

  it("does not leak whether a client id exists: unknown contact raises the same error", () => {
    expect(READER).toMatch(/if\s+v_tenant\s+is\s+null\s+then\s*\n\s*raise exception using errcode\s*=\s*'42501'/i);
    expect(CHAT_FN).toMatch(/if\s+v_tenant\s+is\s+null\s+then\s*\n\s*raise exception using errcode\s*=\s*'42501'/i);
  });
});

describe("#804 — Chat gets the minimum evidence, and nothing else", () => {
  const returns = MIGRATION.slice(
    MIGRATION.indexOf("create or replace function public.get_client_rail_for_chat("),
    MIGRATION.indexOf("as $$", MIGRATION.indexOf("create or replace function public.get_client_rail_for_chat(")),
  );

  it("returns exactly the three fields the model renders", () => {
    expect(returns).toMatch(/event_kind\s+text/);
    expect(returns).toMatch(/title\s+text/);
    expect(returns).toMatch(/occurred_at\s+timestamptz/);
  });

  it("carries no producer payload, actor, record pointer or internal identifier", () => {
    for (const forbidden of ["payload", "actor_user_id", "ref_table", "ref_id", "tenant_id", "contact_id"]) {
      expect(returns, `${forbidden} must not reach the model`).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
    // `id` alone would be the event row's UUID primary key.
    expect(returns).not.toMatch(/^\s{2}id\s+uuid/m);
  });

  it("is not granted to anon, and restores no browser grant on the raw table", () => {
    expect(MIGRATION).toMatch(/revoke all\s+on function public\.get_client_rail_for_chat\(uuid, integer\) from public, anon/i);
    expect(MIGRATION).not.toMatch(/grant\s+execute[\s\S]{0,80}get_client_rail_for_chat[\s\S]{0,40}anon/i);
    expect(MIGRATION).not.toMatch(/GRANT\s+SELECT\s+ON\s+public\.paige_client_events/i);
  });

  it("staff keep the audience they are proven to have — the fix changes WHO is staff, not what staff see", () => {
    // Foundation migration 20260712163259:104 — "Staff read: any audience, own tenant only".
    // Narrowing this would blank owner_internal rows (automation.fired, owner.action_taken,
    // owner.crm_mutation are all owner/owner_internal by registry default) for a legitimate coach.
    expect(CHAT_FN).toMatch(/where e\.contact_id = p_contact_id\s*\n\s*and \(v_is_staff/i);
  });
});

describe("#804 — the only consumer actually uses the safe projection", () => {
  it("neither Chat call site calls the raw reader any more", () => {
    expect(CHAT).not.toMatch(/rpc\(\s*"get_client_rail"\s*,/);
  });

  it("both Chat call sites call the minimum-evidence projection", () => {
    const calls = CHAT.match(/rpc\(\s*"get_client_rail_for_chat"\s*,/g) ?? [];
    expect(calls.length).toBe(2);
  });

  it("neither call site passes a lens any more — the projection has no lens to pick", () => {
    const sites = CHAT.match(/rpc\(\s*"get_client_rail_for_chat"[^)]*\)/g) ?? [];
    expect(sites.length).toBe(2);
    for (const site of sites) expect(site).not.toMatch(/p_lens/);
  });

  it("both call sites BIND the error, so a 42501 refusal cannot be folded into 'no activity'", () => {
    // Hydration previously destructured only `{ data }`. With a raising resolver that would turn a
    // refusal into a silently absent context block.
    expect(CHAT).toMatch(/const \{ data: railRows, error: railHydrationErr \} = await supabaseClient\.rpc\(\s*"get_client_rail_for_chat"/);
    expect(CHAT).toMatch(/const \{ data: railRows, error: railErr \} = await supabaseClient\.rpc\(\s*"get_client_rail_for_chat"/);
    expect(CHAT).toMatch(/if \(railHydrationErr\)/);
  });

  it("keeps the model-facing tool NAME stable — this is a server contract change, not a Chat one", () => {
    expect(CHAT).toMatch(/name: "get_client_rail"/);
  });
});
