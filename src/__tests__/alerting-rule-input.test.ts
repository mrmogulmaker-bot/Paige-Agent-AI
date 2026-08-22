// Alerting rule-write validation — the gate that decides what may become a stored rule (A5).
//
// WHY THIS EXISTS. A bad decision here does not throw. It stores a rule that LOOKS configured
// in the operator's list and can never fire — bound to a signal with no reader, or promising a
// delivery channel nothing sends on. The operator then believes the platform is being watched
// when it is not, which is strictly worse than an empty list.
//
// `alert-rule-input.ts` is PURE — no DB, no fetch, no clock — so the module under test is
// imported directly rather than mirrored, and there is no copy to drift from what runs in prod.
//
// §13 HONEST — what this CANNOT verify (owed elsewhere): that the edge function's operator gate
// actually holds against a real JWT, that the INSERT lands, and that RLS accepts the write.
// Those need a live DB and are covered by the §32.b prod rollback proof, not by this file.

import { describe, expect, it } from "vitest";
import {
  AUTONOMY_LANES,
  CHANNELS,
  DEPARTMENTS,
  SEVERITIES,
  validateRuleInput,
  type SignalCatalogueEntry,
} from "../../supabase/functions/_shared/alert-rule-input.ts";

/** Mirrors the live catalogue read from prod 2026-08-22: 4 readable, 2 not. */
const CATALOGUE: SignalCatalogueEntry[] = [
  { key: "systems_check.failing_count", is_readable: true },
  { key: "systems_check.blocking_present", is_readable: true },
  { key: "fleet.tenants_at_risk", is_readable: true },
  { key: "llm.error_rate", is_readable: true },
  { key: "llm.failover_rate", is_readable: false },
  { key: "migrations.drift", is_readable: false },
];

const GOOD = {
  name: "Blocking check failing",
  condition: { signal: "systems_check.blocking_present", op: "eq", value: true },
};

function v(input: unknown, opts?: { partial?: boolean }) {
  return validateRuleInput(input, CATALOGUE, opts);
}

describe("the happy path, and the defaults it lands on", () => {
  it("accepts a minimal rule", () => {
    const r = v(GOOD);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.rule?.name).toBe("Blocking check failing");
  });

  it("defaults match the column defaults verified on prod", () => {
    const r = v(GOOD);
    expect(r.rule?.severity).toBe("warning");
    expect(r.rule?.autonomy_lane).toBe("confirm");
    expect(r.rule?.channels).toEqual(["in_app"]);
    expect(r.rule?.department).toBeNull();
    expect(r.rule?.description).toBeNull();
  });

  // The safety default that matters most: a rule nobody has looked at does not start firing.
  it("is INERT by default — is_active must be opted into explicitly", () => {
    expect(v(GOOD).rule?.is_active).toBe(false);
    expect(v({ ...GOOD, is_active: true }).rule?.is_active).toBe(true);
  });

  it("trims the name and empties a whitespace-only description to null", () => {
    const r = v({ ...GOOD, name: "  Spaced  ", description: "   " });
    expect(r.rule?.name).toBe("Spaced");
    expect(r.rule?.description).toBeNull();
  });
});

describe("signals — the rule that can never fire is refused, not stored", () => {
  it.each([["llm.failover_rate"], ["migrations.drift"]])(
    "rejects a condition bound to the unreadable signal %s",
    (key) => {
      const r = v({ ...GOOD, condition: { signal: key, op: "gt", value: 1 } });
      expect(r.ok).toBe(false);
      expect(r.errors.join(" ")).toContain("no reader");
      expect(r.errors.join(" ")).toContain("never evaluated");
    },
  );

  it("rejects a signal that is not in the catalogue at all", () => {
    const r = v({ ...GOOD, condition: { signal: "made.up", op: "gte", value: 1 } });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("Unknown signal");
  });

  // The unreadable signal is easy to hide inside a group — that is exactly where it would slip
  // through, because the group as a whole still looks well-formed.
  it("finds an unreadable signal nested inside all_of/any_of", () => {
    const r = v({
      ...GOOD,
      condition: {
        all_of: [
          { signal: "systems_check.failing_count", op: "gte", value: 1 },
          { any_of: [{ signal: "migrations.drift", op: "gt", value: 0 }] },
        ],
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("migrations.drift");
  });

  it("accepts a group where every signal is readable", () => {
    const r = v({
      ...GOOD,
      condition: {
        all_of: [
          { signal: "systems_check.failing_count", op: "gte", value: 3 },
          { signal: "llm.error_rate", op: "gt", value: 0.1, for_minutes: 30 },
        ],
      },
    });
    expect(r.ok).toBe(true);
  });

  it("defers to the evaluator's own language rules rather than re-implementing them", () => {
    // `present` is rejected by validateCondition itself — proving this module calls it
    // instead of carrying a second, driftable copy of the operator list.
    const r = v({ ...GOOD, condition: { signal: "llm.error_rate", op: "present" } });
    expect(r.ok).toBe(false);
  });
});

describe("enumerations are pinned to the live CHECK constraints", () => {
  it("accepts every allowed severity and lane", () => {
    for (const s of SEVERITIES) expect(v({ ...GOOD, severity: s }).ok).toBe(true);
    for (const l of AUTONOMY_LANES) expect(v({ ...GOOD, autonomy_lane: l }).ok).toBe(true);
  });

  it.each([
    ["severity", "critical"],
    ["autonomy_lane", "manual"],
    ["department", "engineering"],
  ])("rejects an out-of-vocabulary %s", (field, bad) => {
    const r = v({ ...GOOD, [field]: bad });
    expect(r.ok).toBe(false);
  });

  it("accepts every department in the live action-bus vocabulary", () => {
    for (const d of DEPARTMENTS) expect(v({ ...GOOD, department: d }).ok).toBe(true);
  });
});

describe("channels — a declaration must not become a promise", () => {
  it("accepts the one channel that actually delivers", () => {
    expect(v({ ...GOOD, channels: CHANNELS.slice() }).ok).toBe(true);
  });

  it.each([["email"], ["sms"], ["whatsapp"]])(
    "rejects %s, and says why rather than silently dropping it",
    (ch) => {
      const r = v({ ...GOOD, channels: [ch] });
      expect(r.ok).toBe(false);
      expect(r.errors.join(" ")).toContain("External delivery is not built");
    },
  );

  it("treats an empty array as in_app rather than as no delivery at all", () => {
    expect(v({ ...GOOD, channels: [] }).rule?.channels).toEqual(["in_app"]);
  });
});

describe("malformed payloads are refused with a reason, never coerced", () => {
  it.each([
    ["a bare string", "rule"],
    ["null", null],
    ["an array", []],
    ["a number", 7],
  ])("rejects %s", (_label, bad) => {
    expect(v(bad).ok).toBe(false);
  });

  it.each([
    ["a missing name", { condition: GOOD.condition }],
    ["a blank name", { ...GOOD, name: "   " }],
    ["a non-string name", { ...GOOD, name: 42 }],
    ["an over-long name", { ...GOOD, name: "x".repeat(121) }],
    ["a missing condition", { name: "No condition" }],
    ["a non-boolean is_active", { ...GOOD, is_active: "yes" }],
    ["a non-array channels", { ...GOOD, channels: { in_app: true } }],
    ["a non-string description", { ...GOOD, description: 5 }],
  ])("rejects %s", (_label, bad) => {
    const r = v(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("never returns a rule alongside errors", () => {
    const r = v({ name: "", condition: null });
    expect(r.ok).toBe(false);
    expect(r.rule).toBeUndefined();
  });

  it("reports every problem at once rather than one per round-trip", () => {
    const r = v({ ...GOOD, severity: "nope", autonomy_lane: "nope", department: "nope" });
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("partial updates leave untouched fields alone", () => {
  it("allows name and condition to be omitted", () => {
    const r = v({ severity: "urgent" }, { partial: true });
    expect(r.ok).toBe(true);
  });

  it("still validates the fields that ARE supplied", () => {
    expect(v({ severity: "nope" }, { partial: true }).ok).toBe(false);
    expect(
      v({ condition: { signal: "migrations.drift", op: "gt", value: 0 } }, { partial: true }).ok,
    ).toBe(false);
  });
});
