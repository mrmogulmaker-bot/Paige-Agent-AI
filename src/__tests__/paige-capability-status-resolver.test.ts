/* eslint-disable @typescript-eslint/no-explicit-any -- Executed edge helper, loaded through a transpile port. */
// @vitest-environment node
//
// Piece 3 — the tenant capability-status resolver. "What can Paige do for THIS tenant right now?"
// answered truthfully (§13/§36/§70). This tests the PURE decision core: given the composed signals
// (tier eligibility × evidence × Spine maturity × connection × autonomy lane), it returns exactly
// one honest availability per capability, most-restrictive-wins. No DB, no side effects.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";

function load() {
  const src = readFileSync("supabase/functions/_shared/paige-capability-status/resolver.ts", "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const out: any = {};
  new Function("require", "exports", js)((k: string) => { throw new Error(`unexpected runtime import: ${k}`); }, out);
  return out;
}

const { resolveCapabilityStatus } = load();
const base = {
  key: "crm.create_contact",
  label: "Create a contact",
  actionKind: "create",
  maturity: "LIVE",
  tierEligible: true,
};
const one = (over: Record<string, unknown>) => resolveCapabilityStatus([{ ...base, ...over }])[0];

describe("resolveCapabilityStatus — one honest availability per capability (§13)", () => {
  it("not eligible for the tier wins over everything else (most-restrictive)", () => {
    const r = one({ tierEligible: false, maturity: "LIVE", autonomyLane: "auto" });
    expect(r.availability).toBe("not_for_tier");
    expect(r.reason).toBeTruthy();
  });

  it("missing evidence is UNAVAILABLE, never a hoped-for live", () => {
    expect(one({ evidenceMissing: true }).availability).toBe("unavailable");
  });

  it("an unshipped seam is PLANNED, not claimed", () => {
    expect(one({ maturity: "UNAVAILABLE" }).availability).toBe("planned");
  });

  it("a capability needing an unconnected provider is NEEDS_SETUP", () => {
    expect(one({ requiresConnection: true, connected: false }).availability).toBe("needs_setup");
    expect(one({ requiresConnection: true, connected: true, autonomyLane: "auto" }).availability).toBe("live");
  });

  it("a mutating act is LIVE only on an auto lane; confirm/off require the owner", () => {
    expect(one({ autonomyLane: "auto" }).availability).toBe("live");
    expect(one({ autonomyLane: "confirm" }).availability).toBe("needs_approval");
    const off = one({ autonomyLane: "off" });
    expect(off.availability).toBe("needs_approval");
    expect(off.reason).toMatch(/manual/i);
  });

  it("a built-but-unproven, fails-closed path is PROOF_OWED — Paige may attempt, never promise", () => {
    // proofOwed wins over the cheerful live/approval below it, so the owner is never told a
    // fails-closed path is something she can rely on (§13/§70).
    const auto = one({ proofOwed: true, autonomyLane: "auto" });
    expect(auto.availability).toBe("proof_owed");
    expect(auto.reason).toMatch(/isn't proven/i);
    expect(one({ proofOwed: true, actionKind: "read", autonomyLane: null }).availability).toBe("proof_owed");
    // but a more-restrictive disposition still wins over proofOwed (most-restrictive order):
    expect(one({ proofOwed: true, tierEligible: false }).availability).toBe("not_for_tier");
    expect(one({ proofOwed: true, requiresConnection: true, connected: false }).availability).toBe("needs_setup");
    expect(one({ proofOwed: true, maturity: "UNAVAILABLE" }).availability).toBe("planned");
  });

  it("a capability behind an un-installed Marketplace package is NEEDS_SETUP — entitlement wins over connection/lane", () => {
    // requiresPackage + not entitled → needs_setup, with the package-install reason (the finance/credit
    // Funding & Coaching Tools bundle — §2 finance is opt-in, never a default). Fail-closed: anything but
    // an explicit packageEntitled:true refuses.
    const missing = one({ requiresPackage: true, packageEntitled: false, autonomyLane: "auto" });
    expect(missing.availability).toBe("needs_setup");
    expect(missing.reason).toMatch(/Funding & Coaching Tools/);
    expect(one({ requiresPackage: true, autonomyLane: "auto" }).availability).toBe("needs_setup"); // undefined ⇒ refuse
    // entitled ⇒ the entitlement branch is transparent; the resolved lane decides.
    expect(one({ requiresPackage: true, packageEntitled: true, autonomyLane: "auto" }).availability).toBe("live");
    expect(one({ requiresPackage: true, packageEntitled: true, autonomyLane: "confirm" }).availability).toBe("needs_approval");
    // entitlement wins over a satisfied connection + auto lane (the package-install reason, not the connection one).
    const overConn = one({ requiresPackage: true, packageEntitled: false, requiresConnection: true, connected: true, autonomyLane: "auto" });
    expect(overConn.availability).toBe("needs_setup");
    expect(overConn.reason).toMatch(/Funding & Coaching Tools/);
    // …but tier / evidence / maturity still win OVER a missing entitlement (the more fundamental "no").
    expect(one({ requiresPackage: true, packageEntitled: false, tierEligible: false }).availability).toBe("not_for_tier");
    expect(one({ requiresPackage: true, packageEntitled: false, evidenceMissing: true }).availability).toBe("unavailable");
    expect(one({ requiresPackage: true, packageEntitled: false, maturity: "UNAVAILABLE" }).availability).toBe("planned");
  });

  it("BACKWARD-COMPAT: a signal that omits requiresPackage resolves exactly as before", () => {
    // The entitlement branch fires ONLY when requiresPackage === true, so every pre-existing signal (none
    // of which set it) is unchanged. An ordinary auto-lane create with no package field is still live.
    expect(one({ autonomyLane: "auto" }).availability).toBe("live");
    expect(one({ requiresPackage: false, packageEntitled: false, autonomyLane: "auto" }).availability).toBe("live");
    expect(one({ actionKind: "read", autonomyLane: null }).availability).toBe("live");
  });

  it("a read with a shipped seam is LIVE now", () => {
    expect(one({ key: "crm.list", label: "See your contacts", actionKind: "read", autonomyLane: null }).availability).toBe("live");
    // a PARTIAL read is still reachable now
    expect(one({ actionKind: "read", maturity: "PARTIAL", autonomyLane: null }).availability).toBe("live");
  });

  it("maps a batch preserving key/label/actionKind and a reason on every non-live row", () => {
    const rows = resolveCapabilityStatus([
      { ...base, autonomyLane: "confirm" },
      { key: "x.y", label: "Z", actionKind: "read", maturity: "LIVE", tierEligible: false },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].key).toBe("crm.create_contact");
    expect(rows[1].availability).toBe("not_for_tier");
    for (const r of rows) if (r.availability !== "live") expect(r.reason).toBeTruthy();
  });
});
