// deno test --allow-import --node-modules-dir=none supabase/functions/_shared/agreements/chat-write.test.ts
//
// The draft path is the first WRITE PAIGE may make to an agreement, so these assert the properties
// that make that safe to ship — not that the function returns something.
//
// THREE OF THEM ARE THE WHOLE POINT: the RPC is called with the arguments the caller actually gave
// (a write that silently drops a field is worse than one that refuses), no database text ever
// reaches the result, and a resolved call with no row is never reported as a success.
import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { draftAgreement, type AgreementWriteRpcPort } from "./chat-write.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CONTACT = "22222222-2222-4222-8222-222222222222";
const AGREEMENT = "33333333-3333-4333-8333-333333333333";

type Call = [string, Record<string, unknown> | undefined];

/** A structural port that records what it was asked, so the ARGUMENTS can be asserted, not just the answer. */
function port(reply: { data: unknown; error: { message?: string; code?: string } | null }) {
  const calls: Call[] = [];
  const rpc: AgreementWriteRpcPort["rpc"] = (name, args) => {
    calls.push([name, args]);
    return Promise.resolve(reply);
  };
  return { rpc, calls };
}

const ROW = { id: AGREEMENT, title: "Coaching engagement — Q4", status: "draft" };

Deno.test("creates through the one governed seam, and says it CREATED", async () => {
  const p = port({ data: ROW, error: null });
  const r = await draftAgreement({
    caller: p, expectedTenantId: TENANT, contactId: CONTACT,
    title: "Coaching engagement — Q4", bodyMarkdown: "# Terms",
  });
  // The seam, and the exact arguments. `_agreement_id: null` is what makes this a create.
  assertEquals(p.calls, [["save_paige_agreement", {
    _expected_tenant_id: TENANT, _agreement_id: null, _contact_id: CONTACT,
    _title: "Coaching engagement — Q4", _body_markdown: "# Terms",
  }]]);
  assert(r.success);
  assertEquals(r.created, true);
  assertEquals(r.agreementId, AGREEMENT);
});

Deno.test("revises when given an id, and says it did NOT create", async () => {
  const p = port({ data: ROW, error: null });
  const r = await draftAgreement({
    caller: p, expectedTenantId: TENANT, contactId: CONTACT,
    title: "Revised", bodyMarkdown: "# Terms v2", agreementId: AGREEMENT,
  });
  assertEquals(p.calls[0][1]?._agreement_id, AGREEMENT);
  assert(r.success);
  // CREATED vs REVISED is the distinction that catches this tool's likeliest mistake — a model
  // omitting the id when the person asked to change a draft, and silently minting a duplicate.
  assertEquals(r.created, false);
});

Deno.test("a bad id is refused BEFORE the seam is called, so no write is attempted", async () => {
  for (const bad of ["not-a-uuid", "", "   ", "33333333-3333-4333-8333"]) {
    const p = port({ data: ROW, error: null });
    const r = await draftAgreement({
      caller: p, expectedTenantId: TENANT, contactId: bad,
      title: "T", bodyMarkdown: "B",
    });
    assertEquals(p.calls.length, 0, `called the RPC for contactId ${JSON.stringify(bad)}`);
    assert(!r.success);
    assertEquals(r.reason, "bad_contact_id");
  }
  // And the same for an agreement id that is present but not real.
  const p = port({ data: ROW, error: null });
  const r = await draftAgreement({
    caller: p, expectedTenantId: TENANT, contactId: CONTACT,
    title: "T", bodyMarkdown: "B", agreementId: "nope",
  });
  assertEquals(p.calls.length, 0);
  assert(!r.success);
  assertEquals(r.reason, "bad_agreement_id");
});

Deno.test("no active workspace refuses without calling anything", async () => {
  for (const tid of [null, undefined, ""]) {
    const p = port({ data: ROW, error: null });
    const r = await draftAgreement({
      caller: p, expectedTenantId: tid, contactId: CONTACT, title: "T", bodyMarkdown: "B",
    });
    assertEquals(p.calls.length, 0);
    assert(!r.success);
    assertEquals(r.reason, "no_workspace");
  }
});

Deno.test("every refusal is mapped by code, and NO database text reaches the result", async () => {
  const cases: Array<[{ code: string; message: string }, string]> = [
    [{ code: "40001", message: "someone else changed this agreement while you were editing it" }, "conflict"],
    [{ code: "42501", message: "only an owner or admin may draft an agreement with a client" }, "refused"],
    [{ code: "42501", message: "that client is not in this workspace" }, "refused"],
    [{ code: "23514", message: "this agreement has already been sent; draft a new one rather than changing it" }, "already_sent"],
    [{ code: "23514", message: "give this agreement a title" }, "empty_title"],
    [{ code: "23514", message: "an agreement needs a body before it can be saved" }, "empty_body"],
    // An UNRECOGNISED code degrades to the safe generic reason rather than to a wrong one.
    [{ code: "XX000", message: "internal engine detail nobody outside should read" }, "unavailable"],
  ];
  for (const [error, expected] of cases) {
    const p = port({ data: null, error });
    const r = await draftAgreement({
      caller: p, expectedTenantId: TENANT, contactId: CONTACT, title: "T", bodyMarkdown: "B",
    });
    assert(!r.success);
    assertEquals(r.reason, expected, `code ${error.code} / ${error.message}`);
    // THE NO-ECHO RULE. These refusals are authored for a human but raised on STANDARD SQLSTATEs,
    // not the reserved PA### class that means "a person wrote this for another person" — so they
    // are mapped, never forwarded. Raw database text must not reach a model or a transcript.
    assert(!r.message.includes(error.message), `echoed the database's own words for ${error.code}`);
  }
});

Deno.test("a resolved call with NO row is never reported as a success", async () => {
  for (const data of [null, undefined, {}, { id: 42 }, { title: "no id here" }]) {
    const p = port({ data, error: null });
    const r = await draftAgreement({
      caller: p, expectedTenantId: TENANT, contactId: CONTACT, title: "T", bodyMarkdown: "B",
    });
    assert(!r.success, `reported success for readback ${JSON.stringify(data)}`);
    assertEquals(r.reason, "no_readback");
    // AND IT MUST NOT ADVISE A RETRY. The write may have landed; on the create path a second
    // attempt mints a second draft, so the one thing this sentence may never say is "try again".
    assert(!/try again/i.test(r.message), "advised a retry that could duplicate a landed write");
  }
});

Deno.test("a THROW is reported as unavailable, not as a refusal", async () => {
  const rpc: AgreementWriteRpcPort["rpc"] = () => Promise.reject(new Error("socket hang up"));
  const r = await draftAgreement({
    caller: { rpc }, expectedTenantId: TENANT, contactId: CONTACT, title: "T", bodyMarkdown: "B",
  });
  assert(!r.success);
  assertEquals(r.reason, "unavailable");
  assert(!r.message.includes("socket hang up"));
});

Deno.test("titles and bodies are trimmed, and whitespace-only is refused", async () => {
  const p = port({ data: ROW, error: null });
  await draftAgreement({
    caller: p, expectedTenantId: TENANT, contactId: `  ${CONTACT}  `,
    title: "  Coaching engagement  ", bodyMarkdown: "  # Terms  ",
  });
  assertEquals(p.calls[0][1]?._title, "Coaching engagement");
  assertEquals(p.calls[0][1]?._body_markdown, "# Terms");
  assertEquals(p.calls[0][1]?._contact_id, CONTACT);

  for (const [title, body, reason] of [["   ", "B", "empty_title"], ["T", "   ", "empty_body"]] as const) {
    const q = port({ data: ROW, error: null });
    const r = await draftAgreement({
      caller: q, expectedTenantId: TENANT, contactId: CONTACT, title, bodyMarkdown: body,
    });
    assertEquals(q.calls.length, 0);
    assert(!r.success);
    assertEquals(r.reason, reason);
  }
});
