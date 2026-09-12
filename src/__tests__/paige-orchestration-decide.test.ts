/**
 * Layer C — the pure decision core of the connector-neutral act engine (`_shared/paige-orchestration/decide.ts`).
 * Proves condition evaluation (closes the dispatcher's TODO F3), the lane→outcome mapping, the refusal→outcome
 * mapping, and that the TS outcome vocabulary stays in lock-step with the SQL domain `paige_act_outcome`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateConditions,
  laneNonExecuteOutcome,
  refusalToOutcome,
  type EventFacts,
  type ActOutcome,
} from "../../supabase/functions/_shared/paige-orchestration/decide.ts";

const facts: EventFacts = {
  event_key: "contact.created",
  subject_table: "clients",
  subject_id: "11111111-1111-1111-1111-111111111111",
  payload: { source: "web_form", tags: ["vip", "inbound"], score: 42, nested: { stage: "new" } },
};

describe("evaluateConditions — closes TODO F3 (unconditional matches, else all-must-hold)", () => {
  it("matches when conditions are empty / null / undefined (an unconditional automation)", () => {
    expect(evaluateConditions([], facts).matched).toBe(true);
    expect(evaluateConditions(null, facts).matched).toBe(true);
    expect(evaluateConditions(undefined, facts).matched).toBe(true);
  });

  it("evaluates eq / ne / exists / not_exists against top-level and payload fields", () => {
    expect(evaluateConditions([{ field: "event_key", op: "eq", value: "contact.created" }], facts).matched).toBe(true);
    expect(evaluateConditions([{ field: "event_key", op: "eq", value: "deal.won" }], facts).matched).toBe(false);
    expect(evaluateConditions([{ field: "source", op: "eq", value: "web_form" }], facts).matched).toBe(true);
    expect(evaluateConditions([{ field: "payload.source", op: "eq", value: "web_form" }], facts).matched).toBe(true);
    expect(evaluateConditions([{ field: "missing", op: "not_exists" }], facts).matched).toBe(true);
    expect(evaluateConditions([{ field: "source", op: "exists" }], facts).matched).toBe(true);
  });

  it("evaluates in / not_in / contains / gt / lt and dotted nested paths", () => {
    expect(evaluateConditions([{ field: "source", op: "in", value: ["web_form", "referral"] }], facts).matched).toBe(true);
    expect(evaluateConditions([{ field: "source", op: "not_in", value: ["referral"] }], facts).matched).toBe(true);
    expect(evaluateConditions([{ field: "tags", op: "contains", value: "vip" }], facts).matched).toBe(true);
    expect(evaluateConditions([{ field: "tags", op: "contains", value: "cold" }], facts).matched).toBe(false);
    expect(evaluateConditions([{ field: "score", op: "gt", value: 10 }], facts).matched).toBe(true);
    expect(evaluateConditions([{ field: "score", op: "lt", value: 10 }], facts).matched).toBe(false);
    expect(evaluateConditions([{ field: "nested.stage", op: "eq", value: "new" }], facts).matched).toBe(true);
  });

  it("requires ALL conditions to hold (AND)", () => {
    const v = evaluateConditions(
      [{ field: "source", op: "eq", value: "web_form" }, { field: "score", op: "gt", value: 100 }],
      facts,
    );
    expect(v.matched).toBe(false);
    if (!v.matched) expect(v.reason).toContain("score");
  });

  it("FAILS SAFE (not matched) on a non-array or a malformed condition element", () => {
    const nonArray = evaluateConditions({ field: "x", op: "eq" } as unknown, facts);
    expect(nonArray.matched).toBe(false);
    if (!nonArray.matched) expect(nonArray.reason).toContain("not an array");
    const malformed = evaluateConditions([{ nope: true }] as unknown, facts);
    expect(malformed.matched).toBe(false);
    if (!malformed.matched) expect(malformed.reason).toContain("malformed");
  });
});

describe("laneNonExecuteOutcome — only auto proceeds; everything else is a non-execute outcome", () => {
  it("auto proceeds (null), confirm → approval_pending, off → held_by_lane", () => {
    expect(laneNonExecuteOutcome("auto")).toBeNull();
    expect(laneNonExecuteOutcome("confirm")).toBe("approval_pending");
    expect(laneNonExecuteOutcome("off")).toBe("held_by_lane");
  });
  it("fails SAFE to held_by_lane on an unrecognized lane (never silently executes)", () => {
    expect(laneNonExecuteOutcome("weird")).toBe("held_by_lane");
    expect(laneNonExecuteOutcome("")).toBe("held_by_lane");
  });
});

describe("refusalToOutcome — a governed refusal maps to the exact refused_* outcome, never a success", () => {
  it("maps budget / trust / consent, and defaults unmapped codes to refused_authority", () => {
    expect(refusalToOutcome("budget_exceeded")).toBe("refused_budget");
    expect(refusalToOutcome("trust_ceiling")).toBe("refused_trust_compass");
    expect(refusalToOutcome("autonomy_off")).toBe("refused_trust_compass");
    expect(refusalToOutcome("consent_required")).toBe("refused_consent");
    expect(refusalToOutcome("access_denied")).toBe("refused_authority");
    expect(refusalToOutcome("tenant_not_server_derived")).toBe("refused_authority");
    expect(refusalToOutcome("anything_unmapped")).toBe("refused_authority");
  });
});

describe("outcome vocabulary parity — TS type ↔ SQL domain paige_act_outcome", () => {
  it("every ActOutcome the code can produce is a value in the SQL domain CHECK", () => {
    const producible: ActOutcome[] = [
      "condition_not_matched", "held_by_lane", "approval_pending",
      "refused_authority", "refused_budget", "refused_trust_compass", "refused_consent",
      "accepted_for_execution", "retrying", "executed", "failed", "ambiguous", "cancelled",
    ];
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20270122000000_paige_act_execution_ledger.sql"),
      "utf8",
    );
    // the domain block lists each value as a quoted literal; every producible outcome must appear there
    for (const o of producible) {
      expect(migration.includes(`'${o}'`), `SQL domain must include '${o}'`).toBe(true);
    }
  });
});
