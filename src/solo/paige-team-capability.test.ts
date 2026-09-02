/**
 * PAIGE's Solo Team capability — the properties that have to hold for her to touch the team.
 *
 * Two kinds of assertion live here and they are deliberately not mixed up. The first block runs
 * REAL CODE: `action-risk.ts` is imported and called, so what it says is what production says. The
 * second block reads the handler's SOURCE, because the chat handler is a Deno edge function with a
 * network-shaped entry point and no seam this suite can drive. That is a weaker class of proof and
 * it is labelled as such — it catches a call site wired to the wrong client, which is the mistake
 * that would actually be made here, and it cannot tell you the function runs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classifyAction, unclassifiedWriteReason } from "../../supabase/functions/_shared/action-risk";

const HANDLER = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");

const TEAM_TOOLS = [
  "team_set_work_profile",
  "team_set_permission",
  "team_invite_member",
  "team_invite_resend",
  "team_invite_revoke",
] as const;

describe("the Team actions are classified, and classified correctly", () => {
  it("puts every act that moves authority or leaves the platform behind the rendered card", () => {
    // `high` is not "a stronger word for important". It is the class whose approval fingerprint
    // travels in the request BODY, which is the one place the model cannot write — so a model
    // reporting "they said yes" cannot open any of these four.
    expect(classifyAction("team_set_permission")).toBe("high");
    expect(classifyAction("team_invite_member")).toBe("high");
    expect(classifyAction("team_invite_resend")).toBe("high");
    expect(classifyAction("team_invite_revoke")).toBe("high");
  });

  it("leaves work details ordinary, because describing a job cannot grant one", () => {
    expect(classifyAction("team_set_work_profile")).toBe("ordinary");
  });

  it("refuses a sixth Team tool nobody classified", () => {
    // The whole point of the fail-closed default. Someone adding `team_remove_member` next month
    // gets an inert tool and a red build, not an ungoverned write.
    expect(classifyAction("team_remove_member")).toBe("unclassified");
    expect(unclassifiedWriteReason("team_remove_member")).toMatch(/no risk classification/);
  });

  it("does not let any Team tool slip past the runtime write backstop", () => {
    for (const tool of TEAM_TOOLS) expect(unclassifiedWriteReason(tool)).toBeNull();
  });
});

describe("the handler's Team call sites (source-level proof, not runtime proof)", () => {
  it("declares each Team tool exactly once", () => {
    for (const tool of TEAM_TOOLS) {
      const declarations = HANDLER.split(`name: "${tool}"`).length - 1;
      expect(declarations, `${tool} declaration count`).toBe(1);
    }
  });

  it("calls the Team seam through the caller's own client, never the service role", () => {
    // THE MISTAKE THIS CATCHES. Every guard on this seam — owner-only for a permission change,
    // owner-or-admin for the rest, the refusal to make anyone an owner — lives inside the SQL
    // function and derives the actor from auth.uid(). Reaching it with `admin` (the service-role
    // client) would satisfy every one of those checks vacuously and hand Paige authority no human
    // in the conversation has. So the client is asserted at the call site, by name.
    expect(HANDLER).toContain('await supabaseClient.rpc("set_solo_team_member_work_profile"');
    expect(HANDLER).toContain('await supabaseClient.rpc("set_solo_team_member_permission"');
    expect(HANDLER).toContain('await supabaseClient.functions.invoke(\n                "solo-team-invitations"');
    expect(HANDLER).not.toContain('admin.rpc("set_solo_team_member_permission"');
    expect(HANDLER).not.toContain('admin.rpc("set_solo_team_member_work_profile"');
    expect(HANDLER).not.toContain('admin.functions.invoke("solo-team-invitations"');
  });

  it("never lets the work-details write reach a permission", () => {
    // The separation the Team screen puts on the editor, asserted in code: the arguments this tool
    // accepts are two text fields and an id. If a `permission` ever appears in this call, the
    // product's central promise about titles has quietly stopped being true.
    const call = HANDLER.slice(
      HANDLER.indexOf('await supabaseClient.rpc("set_solo_team_member_work_profile"'),
    ).slice(0, 400);
    expect(call).toContain("_member_user_id");
    expect(call).toContain("_job_title");
    expect(call).toContain("_responsibilities");
    expect(call).not.toContain("permission");
  });

  it("cannot offer 'owner' as a permission from chat", () => {
    // The database refuses it too. This asserts the tool never even proposes it, so the operator is
    // not read a card describing something that will then fail.
    const decl = HANDLER.slice(HANDLER.indexOf('name: "team_set_permission"')).slice(0, 1200);
    expect(decl).toContain('enum: ["admin", "member"]');
    expect(decl).not.toContain('"owner"');
  });

  it("refuses to act when the seam's workspace is not the one this conversation is about", () => {
    // The defect this closes, found by the seam audit before it shipped: the Team functions resolve
    // their workspace with current_user_tenant_id(), while the conversation resolves its own with
    // get_paige_persona_context — which prefers a linked `clients` row. For a speaker who is a
    // member of one workspace and a client of another they are different tenants, and the READ
    // already fails closed on exactly that (buildTenantTeamContextBlock returns null). The WRITE
    // did not, and member ids for the other workspace are obtainable from crm_list_team, so an
    // action could have landed in a team whose roster this conversation was never shown.
    //
    // The check is asserted at EVERY branch, not once: a fifth Team tool added later without it
    // reopens the hole silently, and this count is what notices.
    expect(HANDLER).toContain("const teamSeamTenantMismatch = async ()");
    const guarded = HANDLER.split("const wrongTenant = await teamSeamTenantMismatch();").length - 1;
    expect(guarded, "every Team branch consults the tenant guard").toBe(3);
    // Null persona tenant is a refusal too, not a pass — "no expected tenant" is the state in which
    // a mismatch is undetectable, which is the worst moment to proceed.
    const body = HANDLER.slice(HANDLER.indexOf("const teamSeamTenantMismatch = async ()")).slice(0, 1600);
    expect(body).toContain("if (!expected)");
    expect(body).toContain("actual !== expected");
  });

  it("carries the email-delivery outcome into the result instead of assuming it", () => {
    // Creating an invitation and delivering its email are two acts and the second fails alone.
    // `emailed` is what stops "invited them" being said about somebody who was never contacted.
    const branch = HANDLER.slice(HANDLER.indexOf('const invokeBody = tc.function.name === "team_invite_member"')).slice(0, 3000);
    expect(branch).toContain("emailed");
    expect(branch).toContain("did NOT go out");
  });
});
