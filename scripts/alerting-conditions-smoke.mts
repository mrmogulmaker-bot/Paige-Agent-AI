// Alerting condition language — headless runtime smoke test (A2, §32).
//
// WHY THIS EXISTS. A wrong evaluation here does not throw. It silently fires an alert that should
// not have fired, or — far worse — silently fails to fire one that should have, and NOTHING
// notices, because the only thing watching the platform is the thing that just went wrong. `tsc`
// and `vite build` pass happily on a comparator with a flipped sign or an unreadable signal that
// collapses to `false`. This runs the real decision logic against real shapes so that class of
// defect is caught before it ships.
//
// `alert-conditions.ts` is PURE by construction — no DB, no fetch, no clock — which is exactly what
// makes this possible: the module under test is imported directly, not mirrored, so there is no
// copy to drift out of sync with the code that actually runs in prod.
//
// Run:  node scripts/alerting-conditions-smoke.mts   (type stripping is default from Node 22.18;
//       do NOT add --experimental-strip-types — Node 24 REMOVED that flag and errors on it, which
//       is exactly how this step first failed in CI while passing locally on Node 22.)
// Exit: 0 = the decision logic behaves; non-zero = a defect (fix before shipping).
//
// §13 HONEST — what this CANNOT verify (owed elsewhere): that the SIGNAL READERS return the right
// numbers (they need a live DB; `alert-signals.ts` reads real tables), that the edge function's
// auth gate holds (proved by the shared helpers' own coverage plus a deployed call), and that the
// pg_cron schedule actually pokes the function on prod (owed to the §32.a post-merge confirmation).

import {
  evaluateCondition,
  shouldFire,
  validateCondition,
  type Condition,
  type SignalValues,
} from "../supabase/functions/_shared/alert-conditions.ts";

let failures = 0;
const fail = (msg: string) => {
  console.error(`✗ ${msg}`);
  failures++;
};
const ok = (msg: string) => console.log(`✓ ${msg}`);
const eq = (actual: unknown, expected: unknown, msg: string) => {
  if (actual === expected) ok(msg);
  else fail(`${msg} — expected ${String(expected)}, got ${String(actual)}`);
};

// ── 1. validation rejects what an evaluator must never be handed ──────────────────────────────
{
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
    // These three are rejected ON PURPOSE — see the NEEDS_VALUE comment in alert-conditions.ts.
    // Each could only ever produce a rule that silently never fires (or fires meaninglessly),
    // which is worse than a missing feature because the operator sees a saved rule and believes
    // it is watching something.
    // NOTE the `value: 1` on each: without it these would be rejected merely for missing a value,
    // and the case would pass while proving nothing about the op set. They must be rejected
    // BECAUSE the op is not in the language.
    ["`changed` — needs a previous reading this substrate does not keep", { signal: "a", op: "changed", value: 1 }],
    ["`present` — trivially true for every readable signal", { signal: "a", op: "present", value: 1 }],
    ["`absent` — can never be true; an unreadable signal skips the rule instead", { signal: "a", op: "absent", value: 1 }],
  ];
  for (const [label, raw] of bad) {
    const r = validateCondition(raw);
    if (r.ok) fail(`validation ACCEPTED ${label}`);
    else if (r.errors.length === 0) fail(`validation rejected ${label} with no stated reason`);
  }
  ok(`validation rejects all ${bad.length} malformed shapes, each with a stated reason`);

  // A rule nested past the recursion guard must be rejected, not silently truncated.
  let deep: Condition = { signal: "a", op: "gte", value: 1 };
  for (let i = 0; i < 12; i++) deep = { all_of: [deep] };
  eq(validateCondition(deep).ok, false, "validation rejects a condition nested past the depth guard");
}

// ── 2. validation reports the dependencies + the sustain the evaluator needs ──────────────────
{
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
  eq(r.ok, true, "a real nested rule validates");
  eq(
    [...r.signals].sort().join(","),
    "fleet.tenants_at_risk,llm.error_rate,systems_check.blocking_present",
    "every distinct signal in the tree is reported, deduplicated",
  );
  // The LARGEST sustain wins: a sweep must wait for the longest hold in the tree, not the first
  // one it happens to walk past.
  eq(r.sustainMinutes, 30, "sustainMinutes is the largest for_minutes anywhere in the tree");
}

// ── 3. comparisons mean what they say ─────────────────────────────────────────────────────────
{
  const v: SignalValues = { n: 5, t: true, f: false };
  const cases: Array<[Condition, boolean, string]> = [
    [{ signal: "n", op: "gte", value: 5 }, true, "gte is inclusive at the boundary"],
    [{ signal: "n", op: "gt", value: 5 }, false, "gt is exclusive at the boundary"],
    [{ signal: "n", op: "lte", value: 5 }, true, "lte is inclusive at the boundary"],
    [{ signal: "n", op: "lt", value: 5 }, false, "lt is exclusive at the boundary"],
    [{ signal: "n", op: "eq", value: 5 }, true, "eq matches"],
    [{ signal: "n", op: "neq", value: 4 }, true, "neq matches"],
    [{ signal: "t", op: "eq", value: true }, true, "a boolean signal compares true"],
    [{ signal: "f", op: "eq", value: true }, false, "a FALSE boolean reading is false, not unreadable"],
  ];
  for (const [c, want, msg] of cases) eq(evaluateCondition(c, v), want, msg);

  // An ordered comparison against a boolean is an authoring error validation cannot catch (the
  // value type is legal in isolation). It must resolve to "could not evaluate", never to a
  // coerced 0/1 answer nobody intended.
  eq(
    evaluateCondition({ signal: "t", op: "gte", value: 1 }, v),
    undefined,
    "gte on a boolean reading is undefined, not a coerced comparison",
  );
  // This is the ONLY way a fully-readable rule still comes back undecided, and the evaluator
  // must treat it exactly like an unreadable signal — skip, and do NOT stamp last_evaluated_at.
  eq(
    shouldFire({ met: evaluateCondition({ signal: "t", op: "gte", value: 1 }, v), sustainMinutes: 0, metSince: null, lastFiredAt: null, now: new Date() }).reason,
    "not_evaluated",
    "an undecidable-but-fully-read condition reports not_evaluated, never a quiet pass",
  );
}

// ── 4. THE §13 RULE: unreadable is not false ──────────────────────────────────────────────────
// This is the assertion that matters most in the file. A monitoring system that treats "could not
// look" as "looked and it was fine" reports green while blind — the exact failure alerting exists
// to prevent, arriving through the alerting system itself.
{
  const blind: SignalValues = { readable: 1 };

  eq(
    evaluateCondition({ signal: "unread", op: "gte", value: 1 }, blind),
    undefined,
    "a leaf on an unreadable signal is undefined, NOT false",
  );

  eq(
    evaluateCondition({ all_of: [{ signal: "readable", op: "gte", value: 1 }, { signal: "unread", op: "gte", value: 1 }] }, blind),
    undefined,
    "all_of with a true side and an unreadable side is undefined, NOT true",
  );

  eq(
    evaluateCondition({ any_of: [{ signal: "readable", op: "lt", value: 0 }, { signal: "unread", op: "gte", value: 1 }] }, blind),
    undefined,
    "any_of with a false side and an unreadable side is undefined, NOT false",
  );

  // Short-circuiting is the one place an unreadable sibling legitimately cannot change the answer.
  eq(
    evaluateCondition({ all_of: [{ signal: "readable", op: "lt", value: 0 }, { signal: "unread", op: "gte", value: 1 }] }, blind),
    false,
    "all_of short-circuits on a definite false — an unreadable sibling cannot rescue it",
  );
  eq(
    evaluateCondition({ any_of: [{ signal: "readable", op: "gte", value: 1 }, { signal: "unread", op: "gte", value: 1 }] }, blind),
    true,
    "any_of short-circuits on a definite true — an unreadable sibling cannot block it",
  );
}

// ── 5. firing: sustained-for, and once per episode ────────────────────────────────────────────
{
  const now = new Date("2026-08-20T12:00:00Z");
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  eq(shouldFire({ met: undefined, sustainMinutes: 0, metSince: null, lastFiredAt: null, now }).reason,
    "not_evaluated", "an unevaluated rule does not fire, and says so");
  eq(shouldFire({ met: false, sustainMinutes: 0, metSince: null, lastFiredAt: null, now }).reason,
    "condition_false", "a false condition does not fire");
  eq(shouldFire({ met: true, sustainMinutes: 0, metSince: null, lastFiredAt: null, now }).reason,
    "episode_just_opened", "a true condition with no open episode does not fire");

  eq(shouldFire({ met: true, sustainMinutes: 30, metSince: minsAgo(10), lastFiredAt: null, now }).fire,
    false, "a 30-minute sustain does not fire after 10 minutes");
  eq(shouldFire({ met: true, sustainMinutes: 30, metSince: minsAgo(31), lastFiredAt: null, now }).fire,
    true, "a 30-minute sustain fires after 31 minutes");
  eq(shouldFire({ met: true, sustainMinutes: 0, metSince: minsAgo(0), lastFiredAt: null, now }).fire,
    true, "with no sustain, an open episode fires immediately");

  // The anti-spam rule. Without it a rule re-fires on every 5-minute tick for as long as the
  // condition holds, which is how an alerting system teaches its operator to ignore it.
  const episodeStart = minsAgo(60);
  eq(shouldFire({ met: true, sustainMinutes: 0, metSince: episodeStart, lastFiredAt: minsAgo(55), now }).reason,
    "already_fired_this_episode", "a rule fires at most once per episode");
  eq(shouldFire({ met: true, sustainMinutes: 0, metSince: episodeStart, lastFiredAt: episodeStart, now }).reason,
    "already_fired_this_episode", "a firing exactly at the episode start still counts as this episode");
  eq(shouldFire({ met: true, sustainMinutes: 0, metSince: episodeStart, lastFiredAt: minsAgo(600), now }).fire,
    true, "a NEW episode fires again even though the rule fired for an older one");
}

// ── 6. the end-to-end shape a stored rule actually takes ──────────────────────────────────────
// Validate → evaluate → decide, on the JSONB a rule row really carries. If the three stages
// disagree about the shape, this is where it shows.
{
  const stored = {
    all_of: [
      { signal: "systems_check.failing_count", op: "gte", value: 1 },
      { signal: "systems_check.blocking_present", op: "eq", value: true, for_minutes: 10 },
    ],
  };
  const v = validateCondition(stored);
  if (!v.ok) fail(`a realistic stored rule failed validation: ${v.errors.join("; ")}`);
  const values: SignalValues = {};
  for (const s of v.signals) values[s] = s.endsWith("_present") ? true : 3;
  const met = evaluateCondition(stored as Condition, values);
  const d = shouldFire({
    met,
    sustainMinutes: v.sustainMinutes,
    metSince: new Date(Date.now() - 20 * 60_000),
    lastFiredAt: null,
    now: new Date(),
  });
  eq(met, true, "the stored rule evaluates true against readings that should trip it");
  eq(d.fire, true, "and fires once its 10-minute sustain is satisfied");
}

// ── result ────────────────────────────────────────────────────────────────────────────────────
if (failures) {
  console.error(`\n${failures} failure(s) — alerting would fire wrongly or stay silent. Fix before shipping.`);
  process.exit(1);
}
console.log("\nAlerting conditions smoke: clean.");
