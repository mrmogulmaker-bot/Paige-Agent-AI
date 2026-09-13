/* eslint-disable @typescript-eslint/no-explicit-any -- Source-string assertions on the edge handler. */
// @vitest-environment node
//
// WIRING for the trusted task↔thread provenance link (owner ruling 2026-09-13; §9/§13/§32/§37). The
// pure decision is unit-tested in source-thread-link.test.ts and the RLS fence in the SQL SET-ROLE
// test; this proves the EDGE actually wires the server-side validation the security depends on — a
// unit test can't see the handler, so these source assertions are the §32 behavioral guard that the
// raw body thread id is no longer stamped and the claim is validated under RLS on the caller's JWT.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const src = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");

// The crm_create_task handler block (from its branch to the insert's `.single()`).
const at = src.indexOf('tc.function.name === "crm_create_task"');
const block = at >= 0 ? src.slice(at, src.indexOf(".single();", at) + 20) : "";

describe("task↔thread link wiring — trusted server-side, never the raw body (§9/§13)", () => {
  it("imports the one-home decision rule", () => {
    expect(src).toContain('import { resolveSourceThreadLink } from "../_shared/source-thread-link.ts"');
  });

  it("the handler resolves the link through resolveSourceThreadLink, from the body CLAIM", () => {
    expect(at).toBeGreaterThan(-1);
    expect(block).toContain("resolveSourceThreadLink(payloadThreadId,");
  });

  it("validation runs under RLS on the CALLER's JWT client, not the service-role admin client", () => {
    // the validation read MUST be on supabaseClient (RLS-enforced); `admin` would bypass RLS and
    // lose half the cross-tenant fence.
    expect(block).toContain("await supabaseClient");
    expect(block).toContain('.from("paige_chat_threads")');
    // it must NOT validate the thread on the service-role client
    const lookupSlice = block.slice(block.indexOf("resolveSourceThreadLink"), block.indexOf(".insert("));
    expect(lookupSlice).not.toContain("admin.from(\"paige_chat_threads\")");
  });

  it("the lookup is scoped to the claim AND the server-resolved owner + tenant (no cross-tenant / forged match)", () => {
    expect(block).toContain(".eq(\"id\", tid)");
    expect(block).toContain(".eq(\"tenant_id\", crmTenantId)"); // server-resolved tenant, never the body
    expect(block).toContain(".eq(\"caller_user_id\", user.id)"); // the caller's OWN thread only
    expect(block).toContain(".maybeSingle()");
  });

  it("stamps the VALIDATED link, never the raw body thread id", () => {
    expect(block).toContain("source_thread_id: linkThreadId");
    // the pre-hardening behavior (stamping the unvalidated body value) must be gone everywhere
    expect(src).not.toContain("source_thread_id: payloadThreadId");
  });

  it("LINK ≠ PROOF: the task's state is its own status, not derived from the link (§13)", () => {
    // the insert sets an explicit real status; the link is provenance only and never gates completion
    expect(block).toContain('status: "pending"');
    expect(block).not.toMatch(/status:\s*linkThreadId/);
  });
});
