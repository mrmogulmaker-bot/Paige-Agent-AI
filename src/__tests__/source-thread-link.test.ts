/* eslint-disable @typescript-eslint/no-explicit-any -- Executed edge helper, loaded through a transpile port. */
// @vitest-environment node
//
// The trusted task↔thread provenance link (owner ruling 2026-09-13; §9/§13/§18). When Paige creates
// a task from a chat conversation, the thread association must come from TRUSTED SERVER-SIDE context:
// the body `threadId` is a CLAIM, trusted only after the server validates it is the caller's OWN
// thread in the resolved tenant. This tests the PURE decision (`resolveSourceThreadLink`) over the
// injected validation `lookup`. The lookup's REAL security — cross-tenant / forged / expired denial
// via RLS + owner+tenant filters — is proven by the SQL SET-ROLE test
// (supabase/tests/source_thread_link_scope.sql) and the edge wiring assertions
// (task-thread-link-wiring.test.ts); here we prove the decision is correct for each case.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";

function port(path: string) {
  const js = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const out: any = {};
  // Imports ONLY a type (erased at transpile). A runtime import here would throw.
  new Function("require", "exports", js)((k: string) => { throw new Error(`unexpected runtime import: ${k}`); }, out);
  return out;
}

const { resolveSourceThreadLink } = port("supabase/functions/_shared/source-thread-link.ts");

// A fake validation lookup standing in for the edge's RLS-scoped owner+tenant read. `owned` is the
// set of thread ids the CALLER actually owns in the resolved tenant (what the real RLS query would
// return a row for). Anything not in the set is "not found" → null, exactly as a cross-tenant,
// forged, or expired thread reads under RLS.
const lookupOver = (owned: Set<string>) => async (id: string) => (owned.has(id) ? id : null);

const OWN = "11111111-1111-4111-8111-111111111111";   // the caller's own thread, in their tenant
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222"; // a thread in ANOTHER tenant
const FORGED = "33333333-3333-4333-8333-333333333333";  // a random / non-existent uuid
const EXPIRED = "44444444-4444-4444-8444-444444444444";  // a deleted / expired thread

describe("resolveSourceThreadLink — the trusted link decision (§9/§13)", () => {
  it("SAME-TENANT create: the caller's own thread validates and is linked", async () => {
    expect(await resolveSourceThreadLink(OWN, lookupOver(new Set([OWN])))).toBe(OWN);
  });

  it("CROSS-TENANT denial: another tenant's thread does not validate → no link (never attached)", async () => {
    // The RLS owner+tenant lookup finds nothing for a foreign thread, so the decision is null: the
    // task is created with NO link to the other tenant's conversation.
    expect(await resolveSourceThreadLink(OTHER_TENANT, lookupOver(new Set([OWN])))).toBeNull();
  });

  it("FORGED-thread denial: a random / non-existent uuid does not validate → no link", async () => {
    expect(await resolveSourceThreadLink(FORGED, lookupOver(new Set([OWN])))).toBeNull();
  });

  it("ACCOUNT-SWITCH: under the NEW account's scope the old thread no longer validates → no link", async () => {
    // After switching accounts the edge re-resolves user.id + tenant, so the lookup's "owned" set is
    // the NEW account's threads; a thread from the previous account is not in it → null.
    const afterSwitch = lookupOver(new Set(["55555555-5555-4555-8555-555555555555"]));
    expect(await resolveSourceThreadLink(OWN, afterSwitch)).toBeNull();
  });

  it("HONEST unavailable: an expired/deleted thread does not validate → no link (not a dangling id)", async () => {
    expect(await resolveSourceThreadLink(EXPIRED, lookupOver(new Set([OWN])))).toBeNull();
  });

  it("NO claim (non-thread caller: client portal / doc-only) → null, and lookup is never called", async () => {
    let called = 0;
    const counting = async (id: string) => { called++; return id; };
    expect(await resolveSourceThreadLink(null, counting)).toBeNull();
    expect(await resolveSourceThreadLink(undefined, counting)).toBeNull();
    expect(await resolveSourceThreadLink("", counting)).toBeNull();
    expect(called, "a non-thread caller must not trigger a validation read").toBe(0);
  });

  it("RETRY/idempotency: the decision is deterministic — the same claim + ownership yields the same link", async () => {
    const lookup = lookupOver(new Set([OWN]));
    const a = await resolveSourceThreadLink(OWN, lookup);
    const b = await resolveSourceThreadLink(OWN, lookup);
    expect(a).toBe(OWN);
    expect(b).toBe(a); // a retried create re-resolves to the SAME link (no drift, no second identity)
  });

  it("a lookup that returns a DIFFERENT id than asked is rejected (defensive identity check)", async () => {
    // The real query filters by `id`, so this can't happen in practice; the guard ensures the link is
    // never something other than the exact claim that was validated.
    const mischievous = async (_id: string) => OWN;
    expect(await resolveSourceThreadLink(OTHER_TENANT, mischievous)).toBeNull();
  });
});
