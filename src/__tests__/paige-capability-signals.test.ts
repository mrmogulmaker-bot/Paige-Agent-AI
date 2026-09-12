/* eslint-disable @typescript-eslint/no-explicit-any -- Executed edge helper, loaded through a transpile port. */
// @vitest-environment node
//
// Piece 3b — the MVP capability SIGNAL builder. "What can Paige do for THIS tenant right now?"
// (§13/§36/§70). Piece 3a built the pure decision core (signals → one honest availability). This
// builds the pure FACT→SIGNAL layer that the edge dispatch feeds with server-resolved truth
// (caller tier, the ceiling-clamped autonomy lane, the Spine maturity). MVP scope = the two
// domains the owner named: contacts + connections. Only capabilities that GENUINELY ship are
// modeled (§947 — never a hoped-for capability).
//
// Two assertions, both on the real pure modules loaded through the transpile port:
//   1. the SIGNAL SHAPE — does each fact land in the right signal (key, actionKind, maturity,
//      tierEligible, lane)?
//   2. the END-TO-END — composing buildCapabilitySignals → resolveCapabilityStatus yields the
//      honest availability a caller would actually be told.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";

function port(path: string) {
  const src = readFileSync(path, "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const out: any = {};
  // Both modules import ONLY types (erased by TS). A value import here would throw.
  new Function("require", "exports", js)((k: string) => { throw new Error(`unexpected runtime import: ${k}`); }, out);
  return out;
}

const { buildCapabilitySignals } = port("supabase/functions/_shared/paige-capability-status/signals.ts");
const { resolveCapabilityStatus } = port("supabase/functions/_shared/paige-capability-status/resolver.ts");

const facts = (over: Record<string, unknown> = {}) => ({
  callerTier: "tenant",
  contactCreateLane: "confirm",
  integrationsListMaturity: "PARTIAL",
  ...over,
});
const byKey = (rows: any[]) => Object.fromEntries(rows.map((r) => [r.key, r]));

describe("buildCapabilitySignals — MVP contacts + connections (§13/§947)", () => {
  it("emits exactly the three shipped MVP capabilities, no fabricated ones", () => {
    const rows = buildCapabilitySignals(facts());
    expect(rows).toHaveLength(3);
    expect(rows.map((r: any) => r.key).sort()).toEqual(
      ["crm.create_contact", "crm.search_contacts", "integrations.list"].sort(),
    );
  });

  it("models the read verbs as reads (lane-independent) and the create as a create", () => {
    const m = byKey(buildCapabilitySignals(facts()));
    expect(m["crm.search_contacts"].actionKind).toBe("read");
    expect(m["integrations.list"].actionKind).toBe("read");
    expect(m["crm.create_contact"].actionKind).toBe("create");
    // creating a contact needs no connected provider
    expect(m["crm.create_contact"].requiresConnection).toBe(false);
  });

  it("threads the ceiling-clamped autonomy lane onto the create signal verbatim", () => {
    expect(byKey(buildCapabilitySignals(facts({ contactCreateLane: "auto" })))["crm.create_contact"].autonomyLane).toBe("auto");
    expect(byKey(buildCapabilitySignals(facts({ contactCreateLane: "off" })))["crm.create_contact"].autonomyLane).toBe("off");
  });

  it("reads Spine maturity for integrations.list; an unregistered seam is UNAVAILABLE, never faked LIVE", () => {
    expect(byKey(buildCapabilitySignals(facts({ integrationsListMaturity: "PARTIAL" })))["integrations.list"].maturity).toBe("PARTIAL");
    // null (no registry row resolved) must degrade to UNAVAILABLE so the resolver says "planned"
    expect(byKey(buildCapabilitySignals(facts({ integrationsListMaturity: null })))["integrations.list"].maturity).toBe("UNAVAILABLE");
  });

  it("a non-client tier is eligible for the tenant book; a sealed client seat is not", () => {
    for (const tier of ["tenant", "subaccount", "agency", "god"]) {
      const rows = buildCapabilitySignals(facts({ callerTier: tier }));
      for (const r of rows) expect(r.tierEligible).toBe(true);
    }
    const clientRows = buildCapabilitySignals(facts({ callerTier: "client" }));
    for (const r of clientRows) expect(r.tierEligible).toBe(false);
  });
});

describe("end-to-end: buildCapabilitySignals → resolveCapabilityStatus (the answer a caller is told)", () => {
  const answer = (over: Record<string, unknown> = {}) =>
    byKey(resolveCapabilityStatus(buildCapabilitySignals(facts(over))));

  it("a Solo tenant on a confirm lane: sees contacts/connections LIVE, adding a contact NEEDS_APPROVAL", () => {
    const a = answer();
    expect(a["crm.search_contacts"].availability).toBe("live");
    expect(a["integrations.list"].availability).toBe("live");
    expect(a["crm.create_contact"].availability).toBe("needs_approval");
    expect(a["crm.create_contact"].reason).toBeTruthy();
  });

  it("an auto lane makes adding a contact LIVE", () => {
    expect(answer({ contactCreateLane: "auto" })["crm.create_contact"].availability).toBe("live");
  });

  it("an off lane is NEEDS_APPROVAL with the manual reason", () => {
    const c = answer({ contactCreateLane: "off" })["crm.create_contact"];
    expect(c.availability).toBe("needs_approval");
    expect(c.reason).toMatch(/manual/i);
  });

  it("a sealed client seat is told NOT_FOR_TIER on every MVP capability", () => {
    const a = answer({ callerTier: "client" });
    for (const key of ["crm.search_contacts", "crm.create_contact", "integrations.list"]) {
      expect(a[key].availability).toBe("not_for_tier");
      expect(a[key].reason).toBeTruthy();
    }
  });

  it("an unregistered integrations seam is PLANNED, not claimed", () => {
    expect(answer({ integrationsListMaturity: null })["integrations.list"].availability).toBe("planned");
  });
});
