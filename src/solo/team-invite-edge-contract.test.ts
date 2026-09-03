import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HANDLER = readFileSync(
  resolve(process.cwd(), "supabase/functions/solo-team-invitations/index.ts"),
  "utf8",
);

describe("solo-team-invitations passes the named workspace to the one authority", () => {
  it("sends the expected workspace on all three invitation acts", () => {
    for (const rpc of ["create_solo_team_invite", "resend_solo_team_invite", "revoke_solo_team_invite"]) {
      const at = HANDLER.indexOf(`admin.rpc("${rpc}"`);
      expect(at, `${rpc} is called`).toBeGreaterThan(-1);
      const call = HANDLER.slice(at, HANDLER.indexOf("});", at));
      expect(call, `${rpc} names the workspace`).toContain("_expected_tenant_id: expectedTenantId");
      expect(call, `${rpc} names the verified actor`).toContain("_actor: user.id");
    }
  });

  it("never invents a workspace the caller did not name", () => {
    // The repaired defect was a server filling in a workspace nobody named. A missing value must
    // reach the database and be refused there — not be defaulted, inferred, or repaired here.
    expect(HANDLER).toContain(
      'const expectedTenantId = typeof body.expectedTenantId === "string" ? body.expectedTenantId : null;',
    );
    const assignment = HANDLER.slice(
      HANDLER.indexOf("const expectedTenantId ="),
      HANDLER.indexOf("try {", HANDLER.indexOf("const expectedTenantId =")),
    );
    expect(assignment).not.toMatch(/active_tenant_id|current_user_tenant_id|tenant_members/);
  });

  it("derives the actor from a verified token, never from the request body", () => {
    // The §59 justification for an `_actor` parameter rests entirely on this being true.
    expect(HANDLER).toContain("await authed.auth.getUser()");
    expect(HANDLER).toContain("if (userError || !user) return json({ ok: false, error: \"Unauthorized\" }, 401);");
    const getUserAt = HANDLER.indexOf("await authed.auth.getUser()");
    const firstRpcAt = HANDLER.indexOf("admin.rpc(");
    expect(getUserAt, "the token is verified before any RPC").toBeLessThan(firstRpcAt);
    expect(HANDLER).not.toMatch(/_actor:\s*body\./);
  });

  it("refuses before sending when the database resolved a different workspace", () => {
    const at = HANDLER.indexOf("if (expectedTenantId && invite.tenant_id && invite.tenant_id !== expectedTenantId)");
    expect(at, "the returned workspace is compared with the requested one").toBeGreaterThan(-1);
    // An email cannot be recalled, so the comparison has to precede the send.
    expect(at).toBeLessThan(HANDLER.indexOf('admin.functions.invoke("send-portal-invite"'));
  });

  it("maps every authority refusal to 403, including the newly worded one", () => {
    // §37 response contract: the HTTP status is derived from the message text, so a new refusal
    // wording silently becomes a 400 unless it is listed. "was not named" contains none of the
    // older phrases.
    const denied = HANDLER.match(/const denied = (.+);/)?.[1] ?? "";
    for (const phrase of ["only an owner", "not authorized", "was not named"]) {
      expect(denied, `${phrase} is treated as a refusal`).toContain(phrase);
    }
    expect(HANDLER).toContain("denied ? 403 : 400");
  });

  it("still reports email delivery separately from invitation creation", () => {
    expect(HANDLER).toContain("const emailed = !sendError && sendData?.emailed === true;");
    expect(HANDLER).toContain("emailed,");
  });
});
