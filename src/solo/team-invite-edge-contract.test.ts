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
    // Three-way now: an authority refusal is 403, an authored validation refusal 400, and an
    // unrecognised failure 500 — which is honest, because an unrecognised failure IS a server fault.
    expect(HANDLER).toContain("denied ? 403 : authored ? 400 : 500");
  });

  it("shows only the sentences this seam authored, never raw database text", () => {
    // The Team screen renders this string verbatim, so whatever is thrown reaches a person. A
    // PostgrestError's message is raw PostgREST/Postgres text: during a deploy window PGRST202
    // would have put a backend function signature in product copy (§11).
    expect(HANDLER).toContain("const AUTHORED_REFUSALS = [");
    const listStart = HANDLER.indexOf("const AUTHORED_REFUSALS = [");
    // Asserted, because an unfound terminator returns -1 and `slice(start, -1)` would silently
    // capture the REST OF THE FILE — 43 phantom entries measured — turning the guard over-broad
    // rather than red. Round 5.
    const listEnd = HANDLER.indexOf("\n];", listStart);
    expect(listEnd, "the allowlist terminator was found").toBeGreaterThan(listStart);
    // Comments stripped BEFORE parsing, block form first so a `/* … */` wrapper cannot survive as
    // a line-comment fragment. The array is interleaved with `//` notes, so a parser reading raw
    // source cannot tell a live entry from a commented-out one: round 5 measured that commenting
    // out `"team invitation not found"` left the runtime allowlist at 11 and the guard green —
    // round 4's hole restored by a one-character edit, which is the ordinary way somebody disables
    // a line. The exact-head read then found `/* … */` still passed, so both forms are stripped.
    const list = HANDLER.slice(listStart, listEnd)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

    // DERIVED FROM THE MIGRATION, not from a hardcoded copy. Round 3 of the adversarial read: the
    // previous version listed sentences by hand, so a REWORD was caught by other tests but an
    // ADDITION was not — a new RAISE would have shown generic copy with nothing to notice it.
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261047000000_an_invitation_is_sent_to_the_workspace_the_owner_named.sql"),
      "utf8",
    );
    // Compared as PARSED ENTRIES, not as source text. Round 4: `toContain` on the raw array text
    // let an entry be deleted silently whenever another entry contains it — dropping
    // "team invitation not found" still passed, because "pending team invitation not found" holds
    // it as a substring. The handler matches by EQUALITY, so the test must too, or a resend on a
    // missing invite quietly becomes generic copy at HTTP 500 with this guard green.
    const entries = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(entries.length, "the allowlist entries parsed").toBeGreaterThanOrEqual(12);

    const raised = [...migration.matchAll(/RAISE EXCEPTION '([^']+)'/g)].map((m) => m[1]);
    expect(raised.length, "the migration's raises were found").toBeGreaterThanOrEqual(10);
    for (const sentence of new Set(raised)) {
      expect(entries, `the migration raises "${sentence}" — it must reach the operator`).toContain(sentence);
    }

    // This function's own throws travel too. The count floor matters: change these to single quotes
    // or a template literal and the regex yields nothing, the loop body never runs, and the test
    // passes while the allowlist silently loses both entries.
    const own = [...HANDLER.matchAll(/throw new Error\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(own.length, "this function's own throws were found").toBeGreaterThanOrEqual(2);
    for (const thrown of own) {
      expect(entries, `this function throws "${thrown}" — it must reach the operator`).toContain(thrown);
    }

    // Everything else is logged and replaced, and equality is what keeps caller-controlled text
    // (a uuid cast error quoting the caller's own input) from carrying a phrase past the filter.
    expect(HANDLER).toContain("const authored = AUTHORED_REFUSALS.includes(message);");
    expect(HANDLER).toContain("if (!authored) console.error");
    expect(HANDLER).toMatch(/error: authored\s*\?\s*message/);
    expect(HANDLER).toContain("The invitation could not be completed just now.");
  });

  it("still reports email delivery separately from invitation creation", () => {
    expect(HANDLER).toContain("const emailed = !sendError && sendData?.emailed === true;");
    expect(HANDLER).toContain("emailed,");
  });
});
