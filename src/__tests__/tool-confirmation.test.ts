/**
 * The confirm gate's authorization property, tested directly.
 *
 * Before this binding, `paige-ai-chat`'s gate was `if (autoMode === "confirm" && gateArgs.confirm
 * !== true) { propose }` — and `gateArgs` is the MODEL'S OWN OUTPUT. Tests marked REGRESSION are
 * written so the old behaviour cannot satisfy them.
 *
 * The LIVELOCK block is the more important half. Read its caveat: for an UNPINNED tool
 * `toolIdentity` returns `{}`, so "these two payloads hash the same" holds for any two payloads and
 * would pass against an implementation that pins nothing at all. What those cases actually lock in
 * is that those tools stay OUT of the map — which is asserted directly at the end of this file, and
 * is the assertion carrying the guarantee. A first version of this binding hashed the WHOLE
 * argument object, which is unsatisfiable across a turn: history is rebuilt as `{role, content}`
 * only, so the model regenerates its arguments from prose, and for a tool whose arguments ARE the
 * authored content two generations are never byte-equal. Approve → re-author → refuse →
 * re-propose, silently, forever. Those tests exist so that cannot come back.
 *
 * WHERE THIS SITS IN THE EVIDENCE
 *
 * `scripts/comms-purchase-safety-smoke.mjs` says paige-ai-chat "has no runtime harness". That is
 * out of date: `scripts/client-memory-authz/check.mjs` transpiles and IMPORTS the real handler and
 * invokes it (71 checks, in CI). It does not cover this gate — unconfigured RPCs in its fake return
 * `{data: null}`, so every mutating tool simply proposes and none of its assertions depend on one
 * executing. The database half is proven separately by `scripts/tool-confirmation-sql-proof.sql`.
 */
import { describe, it, expect } from "vitest";
import {
  canonicalizeToolArgs,
  toolIdentity,
  toolIdentityHash,
  decideToolConfirmation,
  TOOL_IDENTITY_FIELDS,
} from "../../supabase/functions/_shared/toolConfirmation.ts";

describe("decideToolConfirmation — the flag alone can never execute", () => {
  it("REGRESSION: confirm:true with NO server-held proposal does NOT execute", () => {
    expect(decideToolConfirmation({ autoMode: "confirm", confirmFlag: true })).toEqual({
      kind: "propose",
      revalidate: true,
    });
  });

  it.each([["no_open_confirmation"], ["same_turn"], ["expired"], ["already_used"], ["error"]] as const)(
    "REGRESSION: confirm:true refused when the claim fails (%s)",
    (reason) => {
      expect(
        decideToolConfirmation({ autoMode: "confirm", confirmFlag: true, claim: { ok: false, reason } }),
      ).toEqual({ kind: "propose", revalidate: true });
    },
  );

  it("executes ONLY when a real proposal was consumed", () => {
    expect(
      decideToolConfirmation({ autoMode: "confirm", confirmFlag: true, claim: { ok: true } }),
    ).toEqual({ kind: "execute" });
  });

  it("a truthy-but-not-ok claim is not enough", () => {
    expect(
      decideToolConfirmation({ autoMode: "confirm", confirmFlag: true, claim: { ok: false } }),
    ).toEqual({ kind: "propose", revalidate: true });
  });

  it("first call (no flag) proposes, and is NOT flagged as a failed revalidation", () => {
    expect(decideToolConfirmation({ autoMode: "confirm", confirmFlag: undefined })).toEqual({
      kind: "propose",
      revalidate: false,
    });
  });

  it.each([[false], ["true"], [1], [null], [{}]])(
    "a non-true confirm flag (%s) proposes rather than executes",
    (flag) => {
      expect(decideToolConfirmation({ autoMode: "confirm", confirmFlag: flag })).toEqual({
        kind: "propose",
        revalidate: false,
      });
    },
  );

  it("an ok claim cannot rescue a call that never asserted confirm", () => {
    expect(
      decideToolConfirmation({ autoMode: "confirm", confirmFlag: undefined, claim: { ok: true } }),
    ).toEqual({ kind: "propose", revalidate: false });
  });

  it("auto executes without any proposal — the workspace already granted it", () => {
    expect(decideToolConfirmation({ autoMode: "auto", confirmFlag: undefined })).toEqual({
      kind: "execute",
    });
  });

  it("off is disabled even with a valid claim", () => {
    expect(
      decideToolConfirmation({ autoMode: "off", confirmFlag: true, claim: { ok: true } }),
    ).toEqual({ kind: "disabled" });
  });
});

describe("toolIdentityHash — the LIVELOCK cases (a whole-argument hash made these unapprovable)", () => {
  it("LIVELOCK: document_generate is approvable even though the model re-authors every block", async () => {
    // The killer case. `blocks` IS the document; two generations are never byte-equal, and the
    // model cannot copy the first one because tool calls do not cross a turn boundary.
    const proposed = await toolIdentityHash("document_generate", {
      doc_type: "proposal",
      title: "Q4 Retainer Proposal",
      blocks: [{ h: "Scope" }, { p: "We will deliver four workshops." }],
    });
    const reAuthored = await toolIdentityHash("document_generate", {
      doc_type: "proposal",
      title: "Q4 Retainer Proposal — v2",
      blocks: [{ h: "Overview" }, { p: "Four workshops, delivered quarterly." }, { p: "Pricing follows." }],
    });
    expect(reAuthored).toBe(proposed);
  });

  it.each([
    ["growth_page_save", { blocks: [{ hero: "A" }] }, { blocks: [{ hero: "B" }, { cta: "C" }] }],
    ["n8n_create_workflow", { nodes: [1], connections: {} }, { nodes: [1, 2], connections: { a: 1 } }],
    ["draft_marketing_content", { body: "first draft" }, { body: "a rather different draft" }],
    ["crm_create_task", { title: "Call Dana", notes: "re: renewal" }, { title: "Ring Dana", notes: "renewal chat" }],
  ])("LIVELOCK: %s stays approvable when the model re-writes its content", async (tool, a, b) => {
    expect(await toolIdentityHash(tool, b)).toBe(await toolIdentityHash(tool, a));
  });

  it("LIVELOCK: crm_create_contact's confirm_new on a dedup retry does not invalidate the approval", async () => {
    // A legitimate second-call field. A whole-argument hash treated it as a different action and
    // made the operator approve the same contact twice.
    const first = await toolIdentityHash("crm_create_contact", { name: "Dana Ruiz", email: "d@x.co" });
    const retry = await toolIdentityHash("crm_create_contact", {
      name: "Dana Ruiz",
      email: "d@x.co",
      confirm: true,
      confirm_new: true,
    });
    expect(retry).toBe(first);
  });
});

describe("toolIdentityHash — what IS pinned, for the tools whose identity the operator sees", () => {
  it("REGRESSION: a contact approval binds the tenant-scoped subject and exact patch", async () => {
    const proposed = await toolIdentityHash("crm_update_contact", {
      client_ref: "CR-ALPHA", website: "https://alpha.example", tags: ["vip"], do_not_contact: false,
    });
    expect(await toolIdentityHash("crm_update_contact", {
      confirm: true, tags: ["vip"], website: "https://alpha.example", client_ref: "CR-ALPHA", do_not_contact: false,
    })).toBe(proposed);
    expect(await toolIdentityHash("crm_update_contact", {
      client_ref: "CR-BETA", website: "https://alpha.example", tags: ["vip"], do_not_contact: false,
    })).not.toBe(proposed);
    expect(await toolIdentityHash("crm_update_contact", {
      client_ref: "CR-ALPHA", website: "https://substituted.example", tags: ["vip"], do_not_contact: false,
    })).not.toBe(proposed);
    expect(await toolIdentityHash("crm_update_contact", {
      client_ref: "CR-ALPHA", website: "https://alpha.example", tags: ["other"], do_not_contact: true,
    })).not.toBe(proposed);
  });

  it("REGRESSION: approving one phone number does not approve a different one", async () => {
    const approved = await toolIdentityHash("comms_buy_number", { phone_number: "+15550001111", monthly_cents: 115 });
    const swapped = await toolIdentityHash("comms_buy_number", { phone_number: "+15559998888", monthly_cents: 115 });
    expect(swapped).not.toBe(approved);
  });

  it("the price is NOT part of the identity — it has its own guard, and pinning it would livelock", async () => {
    const a = await toolIdentityHash("comms_buy_number", { phone_number: "+15550001111", monthly_cents: 115 });
    const b = await toolIdentityHash("comms_buy_number", { phone_number: "+15550001111", monthly_cents: 130 });
    expect(b).toBe(a);
  });

  it.each([
    ["member_grant_role", { user_id: "u1", role: "admin" }, { user_id: "u1", role: "coach" }],
    ["member_grant_role", { user_id: "u1", role: "admin" }, { user_id: "u2", role: "admin" }],
    ["member_revoke_role", { user_id: "u1", role: "admin" }, { user_id: "u2", role: "admin" }],
    ["crm_delete_contact", { contact_id: "c1" }, { contact_id: "c2" }],
    ["n8n_delete_workflow", { workflow_id: "w1" }, { workflow_id: "w2" }],
    ["n8n_archive_workflow", { workflow_id: "w1" }, { workflow_id: "w2" }],
    ["zapier_run_action", { tool_name: "send" }, { tool_name: "delete" }],
    ["comms_set_primary_number", { number_id: "n1" }, { number_id: "n2" }],
  ])("REGRESSION: %s — a different subject is a different approval", async (tool, a, b) => {
    expect(await toolIdentityHash(tool, b)).not.toBe(await toolIdentityHash(tool, a));
  });

  it("a pinned tool ignores fields outside its identity", async () => {
    const a = await toolIdentityHash("comms_buy_number", { phone_number: "+15550001111" });
    const b = await toolIdentityHash("comms_buy_number", { phone_number: "+15550001111", friendly_name: "Main line" });
    expect(b).toBe(a);
  });

  it("REGRESSION: the same arguments to a different tool never share an approval", async () => {
    expect(await toolIdentityHash("n8n_delete_workflow", { workflow_id: "w1" }))
      .not.toBe(await toolIdentityHash("n8n_archive_workflow", { workflow_id: "w1" }));
  });

  it("key order does not change the hash", async () => {
    const a = await toolIdentityHash("member_grant_role", { role: "admin", user_id: "u1" });
    const b = await toolIdentityHash("member_grant_role", { user_id: "u1", role: "admin" });
    expect(b).toBe(a);
  });

  it("produces a hex sha-256", async () => {
    expect(await toolIdentityHash("crm_create_task", { title: "t" })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for a tool with no arguments at all", async () => {
    expect(await toolIdentityHash("document_generate", undefined))
      .toBe(await toolIdentityHash("document_generate", {}));
  });
});

describe("pinned identity for multiplexed and publish-live tools", () => {
  it("REGRESSION: pipeline_configure — an archive approval cannot be spent on a different command", async () => {
    // It multiplexes 11 command types behind one tool name. Unpinned, they all hashed identically,
    // and the strict token check only fires for archive-pipeline, so the siblings executed on
    // credit the archive path had minted.
    const archivePipeline = await toolIdentityHash("pipeline_configure", {
      command: { type: "archive-pipeline", pipelineRef: "PPL-7", confirmationToken: "t" },
    });
    for (const other of ["archive-stage", "move-deal", "update-pipeline", "create-stage"]) {
      expect(
        await toolIdentityHash("pipeline_configure", { command: { type: other } }),
        `${other} shares an approval with archive-pipeline`,
      ).not.toBe(archivePipeline);
    }
  });

  it("pipeline_configure ignores everything except the command type", async () => {
    const a = await toolIdentityHash("pipeline_configure", { command: { type: "move-deal", dealId: "d1" } });
    const b = await toolIdentityHash("pipeline_configure", { command: { type: "move-deal", dealId: "d2" } });
    expect(b).toBe(a);
  });

  it.each([
    ["n8n_run_workflow", { workflow_id: "w1" }, { workflow_id: "w2" }],
    ["n8n_activate_workflow", { workflow_id: "w1" }, { workflow_id: "w2" }],
    ["n8n_deactivate_workflow", { workflow_id: "w1" }, { workflow_id: "w2" }],
    ["n8n_update_workflow", { workflow_id: "w1" }, { workflow_id: "w2" }],
    ["growth_page_publish", { page_id: "p1" }, { page_id: "p2" }],
    ["growth_funnel_publish", { funnel_id: "f1" }, { funnel_id: "f2" }],
  ])("REGRESSION: %s — publishing/running a DIFFERENT subject is a different approval", async (tool, a, b) => {
    expect(await toolIdentityHash(tool, b)).not.toBe(await toolIdentityHash(tool, a));
  });

  it("a dotted path that does not resolve is omitted, not recorded as undefined", () => {
    expect(toolIdentity("pipeline_configure", {})).toEqual({});
    expect(toolIdentity("pipeline_configure", { command: "not-an-object" })).toEqual({});
    expect(toolIdentity("pipeline_configure", { command: { type: "x" } })).toEqual({ "command.type": "x" });
  });
});

describe("the map's boundary — this is what the LIVELOCK cases actually guarantee", () => {
  it.each([
    ["document_generate"], ["growth_page_save"], ["n8n_create_workflow"],
    ["draft_marketing_content"], ["content_save"], ["crm_create_task"],
    ["crm_create_contact"], ["generate_image"], ["growth_funnel_build"],
  ])("%s is NOT pinned — its arguments are authored content the model re-writes", (tool) => {
    expect(TOOL_IDENTITY_FIELDS[tool]).toBeUndefined();
  });

  it("no pinned field is a content-bearing argument", () => {
    // A tier-2 entry may be a looked-up id; it may never be something the model composes.
    const contentish = /^(blocks|body|content|nodes|connections|prompt|notes|description|steps|stages)$/;
    for (const [tool, fields] of Object.entries(TOOL_IDENTITY_FIELDS)) {
      for (const f of fields) {
        // Contact patch values, including notes, are rendered verbatim by describeConfirm; they
        // are visible tier-1 identity rather than hidden model-authored content.
        if (tool === "crm_update_contact") continue;
        expect(contentish.test(f.split(".").pop()!), `${tool}.${f} looks like authored content`).toBe(false);
      }
    }
  });
});

describe("toolIdentity", () => {
  it("returns nothing for an unlisted tool — that is the safe default, not an oversight", () => {
    expect(toolIdentity("document_generate", { title: "x", blocks: [1] })).toEqual({});
  });

  it("returns only the listed fields", () => {
    expect(toolIdentity("member_grant_role", { user_id: "u1", role: "admin", note: "ignore me" }))
      .toEqual({ user_id: "u1", role: "admin" });
  });

  it("omits a listed field that is absent rather than inventing undefined", () => {
    expect(toolIdentity("member_grant_role", { user_id: "u1" })).toEqual({ user_id: "u1" });
  });

  it("survives a non-object argument payload", () => {
    expect(toolIdentity("comms_buy_number", null)).toEqual({});
    expect(toolIdentity("comms_buy_number", "nope")).toEqual({});
    expect(toolIdentity("comms_buy_number", [1, 2])).toEqual({});
  });

  it("every pinned tool names at least one field, and the map is frozen", () => {
    for (const [tool, fields] of Object.entries(TOOL_IDENTITY_FIELDS)) {
      expect(fields.length, `${tool} pins no fields`).toBeGreaterThan(0);
    }
    expect(Object.isFrozen(TOOL_IDENTITY_FIELDS)).toBe(true);
  });
});

describe("canonicalizeToolArgs", () => {
  it("orders keys deeply", () => {
    expect(Object.keys(canonicalizeToolArgs({ b: 1, a: 2 }) as object)).toEqual(["a", "b"]);
    expect(canonicalizeToolArgs({ outer: { b: 1, a: 2 } })).toEqual({ outer: { a: 2, b: 1 } });
  });

  it("passes primitives and null through untouched", () => {
    expect(canonicalizeToolArgs("s")).toBe("s");
    expect(canonicalizeToolArgs(7)).toBe(7);
    expect(canonicalizeToolArgs(null)).toBe(null);
    expect(canonicalizeToolArgs(undefined)).toBe(undefined);
  });

  it("recurses through arrays without reordering them", () => {
    expect(canonicalizeToolArgs([{ b: 1, a: 2 }, "z"])).toEqual([{ a: 2, b: 1 }, "z"]);
  });
});
