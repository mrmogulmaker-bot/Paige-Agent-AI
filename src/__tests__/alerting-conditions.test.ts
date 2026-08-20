// Alerting condition language — the decision logic that decides whether an alert fires (A2).
//
// WHY THIS EXISTS. A wrong evaluation here does not throw. It silently fires an alert that should
// not have fired, or — far worse — silently fails to fire one that should have, and NOTHING
// notices, because the only thing watching the platform is the thing that just went wrong. `tsc`
// and `vite build` pass happily on a comparator with a flipped sign, or on an unreadable signal
// that collapses to `false`.
//
// `alert-conditions.ts` is PURE by construction — no DB, no fetch, no clock — which is what makes
// this possible: the module under test is imported directly, not mirrored, so there is no copy to
// drift out of sync with what actually runs in prod.
//
// §18 NOTE ON WHERE THIS LIVES. This began as a standalone `.mts` script with its own npm script
// and its own CI step, and it failed in CI twice: the job pins Node 20, which has no type
// stripping and cannot load a `.ts`/`.mts` file at all. The repo ALREADY had a TS-capable headless
// runner wired into CI — vitest — and three sibling tests already import edge-function `_shared`
// code exactly like this. The second path was invented, not needed.
//
// §13 HONEST — what this CANNOT verify (owed elsewhere): that the SIGNAL READERS return the right
// numbers (they need a live DB), that the edge function's auth gate holds, and that the pg_cron
// schedule actually pokes the function on prod.

import { describe, expect, it } from "vitest";
import {
  evaluateCondition,
  shouldFire,
  validateCondition,
  type Condition,
  type SignalValues,
} from "../../supabase/functions/_shared/alert-conditions.ts";

describe("validateCondition — rejects what an evaluator must never be handed", () => {
  const bad: Array<[string, unknown]> = [
    ["a bare number", 3],
    ["null", null],
    ["an array", [{ signal: "a", op: "gte", value: 1 }]],
    ["an empty all_of (vacuously true — would fire forever)", { all_of: [] }],
    ["an empty any_of (vacuously false — would never fire)", { any_of: [] }],
    ["an unknown op", { signal: "a", op: "roughly", value: 1 }],
    ["a comparison with no value", { signal: "a", op: "gte" }],
    ["a comparison with a string value", { signal: "a", op: "gte", value: "1" }],
    ["a negative for_minutes", { signal: "a", op: "gte", value: 1, for_minutes: -5 }],
    ["a non-numeric for_minutes", { signal: "a", op: "gte", value: 1, for_minutes: "10" }],
    ["neither a leaf nor a node", { nonsense: true }],
  ];

  it.each(bad)("rejects %s, with a stated reason", (_label, raw) => {
    const r = validateCondition(raw);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  // These three are rejected ON PURPOSE — see the OPS comment in alert-conditions.ts. Each could
  // only ever produce a rule that silently never fires (or fires meaninglessly), which is worse
  // than a missing feature: the operator sees a saved rule and believes it is watching something.
  //
  // NOTE the `value: 1` on each. Without it they would be rejected merely for missing a value and
  // the assertion would pass while proving nothing about the op set — which is exactly how the
  // first version of this test stayed green under sabotage.
  const deadOps: Array<[string, unknown]> = [
    ["`changed` — needs a previous reading this substrate does not keep", { signal: "a", op: "changed", value: 1 }],
    ["`present` — trivially true for every readable signal", { signal: "a", op: "present", value: 1 }],
    ["`absent` — can never be true; an unreadable signal skips the rule instead", { signal: "a", op: "absent", value: 1 }],
  ];
  it.each(deadOps)("rejects %s BECAUSE the op is not in the language", (_label, raw) => {
    expect(validateCondition(raw).ok).toBe(false);
  });

  it("rejects a condition nested past the depth guard", () => {
    let deep: Condition = { signal: "a", op: "gte", value: 1 };
    for (let i = 0; i < 12; i++) deep = { all_of: [deep] };
    expect(validateCondition(deep).ok).toBe(false);
  });

  it("reports every dependency and the LARGEST sustain in the tree", () => {
    const c: Condition = {
      any_of: [
        { signal: "systems_check.blocking_present", op: "eq", value: true },
        {
          all_of: [
            { signal: "fleet.tenants_at_risk", op: "gte", value: 3, for_minutes: 30 },
            { signal: "llm.error_rate", op: "gt", value: 0.1, for_minutes: 15 },
            { signal: "fleet.tenants_at_risk", op: "lt", value: 99 },
          ],
        },
      ],
    };
    const r = validateCondition(c);
    expect(r.ok).toBe(true);
    expect([...r.signals].sort()).toEqual([
      "fleet.tenants_at_risk",
      "llm.error_rate",
      "systems_check.blocking_present",
    ]);
    // A sweep must wait for the LONGEST hold in the tree, not the first one it walks past.
    expect(r.sustainMinutes).toBe(30);
  });
});

describe("evaluateCondition — comparisons mean what they say", () => {
  const v: SignalValues = { n: 5, t: true, f: false };
  const cases: Array<[string, Condition, boolean]> = [
    ["gte is inclusive at the boundary", { signal: "n", op: "gte", value: 5 }, true],
    ["gt is exclusive at the boundary", { signal: "n", op: "gt", value: 5 }, false],
    ["lte is inclusive at the boundary", { signal: "n", op: "lte", value: 5 }, true],
    ["lt is exclusive at the boundary", { signal: "n", op: "lt", value: 5 }, false],
    ["eq matches", { signal: "n", op: "eq", value: 5 }, true],
    ["neq matches", { signal: "n", op: "neq", value: 4 }, true],
    ["a boolean signal compares true", { signal: "t", op: "eq", value: true }, true],
    ["a FALSE boolean reading is false, not unreadable", { signal: "f", op: "eq", value: true }, false],
  ];
  it.each(cases)("%s", (_label, c, want) => {
    expect(evaluateCondition(c, v)).toBe(want);
  });

  it("gte on a boolean reading is undefined, not a coerced comparison", () => {
    expect(evaluateCondition({ signal: "t", op: "gte", value: 1 }, v)).toBeUndefined();
  });

  it("an undecidable-but-fully-read condition reports not_evaluated, never a quiet pass", () => {
    // The ONLY way a fully-readable rule still comes back undecided. The evaluator must treat it
    // exactly like an unreadable signal: skip, and do NOT stamp last_evaluated_at.
    const met = evaluateCondition({ signal: "t", op: "gte", value: 1 }, v);
    expect(
      shouldFire({ met, sustainMinutes: 0, metSince: null, lastFiredAt: null, now: new Date() }).reason,
    ).toBe("not_evaluated");
  });
});

describe("evaluateCondition — THE §13 RULE: unreadable is not false", () => {
  // The assertions that matter most in this file. A monitoring system that treats "could not look"
  // as "looked and it was fine" reports green while blind — the exact failure alerting exists to
  // prevent, arriving through the alerting system itself.
  const blind: SignalValues = { readable: 1 };

  it("a leaf on an unreadable signal is undefined, NOT false", () => {
    expect(evaluateCondition({ signal: "unread", op: "gte", value: 1 }, blind)).toBeUndefined();
  });

  it("all_of with a true side and an unreadable side is undefined, NOT true", () => {
    expect(
      evaluateCondition(
        { all_of: [{ signal: "readable", op: "gte", value: 1 }, { signal: "unread", op: "gte", value: 1 }] },
        blind,
      ),
    ).toBeUndefined();
  });

  it("any_of with a false side and an unreadable side is undefined, NOT false", () => {
    expect(
      evaluateCondition(
        { any_of: [{ signal: "readable", op: "lt", value: 0 }, { signal: "unread", op: "gte", value: 1 }] },
        blind,
      ),
    ).toBeUndefined();
  });

  it("all_of short-circuits on a definite false — an unreadable sibling cannot rescue it", () => {
    expect(
      evaluateCondition(
        { all_of: [{ signal: "readable", op: "lt", value: 0 }, { signal: "unread", op: "gte", value: 1 }] },
        blind,
      ),
    ).toBe(false);
  });

  it("any_of short-circuits on a definite true — an unreadable sibling cannot block it", () => {
    expect(
      evaluateCondition(
        { any_of: [{ signal: "readable", op: "gte", value: 1 }, { signal: "unread", op: "gte", value: 1 }] },
        blind,
      ),
    ).toBe(true);
  });
});

describe("shouldFire — sustained-for, and at most once per episode", () => {
  const now = new Date("2026-08-20T12:00:00Z");
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  it("does not fire, and says why, when there is nothing to fire on", () => {
    expect(shouldFire({ met: undefined, sustainMinutes: 0, metSince: null, lastFiredAt: null, now }).reason)
      .toBe("not_evaluated");
    expect(shouldFire({ met: false, sustainMinutes: 0, metSince: null, lastFiredAt: null, now }).reason)
      .toBe("condition_false");
    expect(shouldFire({ met: true, sustainMinutes: 0, metSince: null, lastFiredAt: null, now }).reason)
      .toBe("episode_just_opened");
  });

  it("honours sustained-for", () => {
    expect(shouldFire({ met: true, sustainMinutes: 30, metSince: minsAgo(10), lastFiredAt: null, now }).fire).toBe(false);
    expect(shouldFire({ met: true, sustainMinutes: 30, metSince: minsAgo(31), lastFiredAt: null, now }).fire).toBe(true);
    expect(shouldFire({ met: true, sustainMinutes: 0, metSince: minsAgo(0), lastFiredAt: null, now }).fire).toBe(true);
  });

  it("fires at most once per episode, and again on a NEW episode", () => {
    // Without this a rule re-fires every tick for as long as the condition holds, which is how an
    // alerting system teaches its operator to ignore it.
    const episodeStart = minsAgo(60);
    expect(shouldFire({ met: true, sustainMinutes: 0, metSince: episodeStart, lastFiredAt: minsAgo(55), now }).reason)
      .toBe("already_fired_this_episode");
    expect(shouldFire({ met: true, sustainMinutes: 0, metSince: episodeStart, lastFiredAt: episodeStart, now }).reason)
      .toBe("already_fired_this_episode");
    expect(shouldFire({ met: true, sustainMinutes: 0, metSince: episodeStart, lastFiredAt: minsAgo(600), now }).fire)
      .toBe(true);
  });
});

describe("end to end — the JSONB a stored rule actually carries", () => {
  it("validates, evaluates and fires", () => {
    const stored = {
      all_of: [
        { signal: "systems_check.failing_count", op: "gte", value: 1 },
        { signal: "systems_check.blocking_present", op: "eq", value: true, for_minutes: 10 },
      ],
    };
    const v = validateCondition(stored);
    expect(v.ok).toBe(true);

    const values: SignalValues = {};
    for (const s of v.signals) values[s] = s.endsWith("_present") ? true : 3;

    const met = evaluateCondition(stored as Condition, values);
    expect(met).toBe(true);

    expect(
      shouldFire({
        met,
        sustainMinutes: v.sustainMinutes,
        metSince: new Date(Date.now() - 20 * 60_000),
        lastFiredAt: null,
        now: new Date(),
      }).fire,
    ).toBe(true);
  });
});
