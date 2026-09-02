/**
 * `_shared/checked-write.ts` — does a durable write that did not land SAY so?
 *
 * WHY THIS FILE EXISTS. Mutation testing found the gap. A static sweep proved every write in
 * `paige-ai-chat` is wrapped, and driving the handler proved the wrapper is called — but gutting
 * the wrapper's error read left every suite in the repository green. "The helper is called" and
 * "the helper works" are different claims, and only the first was covered.
 *
 * The wrapped writes are not reachable from the handler harness (probed: analytics, thread
 * summary/title, kb telemetry, client_memory, deal activities — none fire under its fixtures), so
 * the logic was moved to a shared module and is tested here directly. That is the honest fix: not a
 * runtime assertion that witnesses nothing, but a unit test of the thing that decides.
 *
 * Run: node --import ./scripts/knowledge-scope/register.mjs scripts/checked-write/check.mjs
 */
import { writeOutcome, checkedWrite } from "../../supabase/functions/_shared/checked-write.ts";

let passed = 0;
const failures = [];
const assert = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`); }
};

// ── THE CENTRAL CASE. This is what postgrest actually returns for a CHECK violation: it RESOLVES.
const rejected = writeOutcome({ error: { message: "violates check constraint", code: "23514" }, data: null });
assert("a resolved postgrest error is a FAILED write", rejected.ok === false, JSON.stringify(rejected));
assert("…and carries the code, so the cause is findable", rejected.code === "23514", JSON.stringify(rejected));
assert("…and the message", rejected.message === "violates check constraint", JSON.stringify(rejected));

// A successful write: `error` present but null. The shape that must NOT be read as a failure.
assert("a clean write with error:null is a SUCCESS", writeOutcome({ error: null, data: [{ id: 1 }] }).ok === true);
assert("an empty result object is a SUCCESS", writeOutcome({}).ok === true);

// ── THE HONEST LIMIT, ASSERTED SO IT STAYS DOCUMENTED.
// A function that awaits a write and returns nothing is indistinguishable from one that succeeded.
// This cannot detect that and must not pretend to — which is exactly why `logSyncFailure` had to be
// changed to RETURN its insert. If this assertion ever flips, someone has made the checker guess.
assert("undefined is treated as success — a wrapper MUST return its write's result",
  writeOutcome(undefined).ok === true);
assert("…and so is null, for the same reason", writeOutcome(null).ok === true);

{
  const logs = [];
  const ok = await checkedWrite("t", Promise.reject(new Error("network down")), (m) => logs.push(m));
  assert("a THROWN write is a failed write", ok === false);
  assert("…and is logged, not swallowed",
    logs.some((l) => /write THREW/.test(l) && /network down/.test(l)), JSON.stringify(logs));
}

// ── THE POINT OF THE WHOLE THING: a rejection is AUDIBLE and NAMED.
{
  const logs = [];
  const ok = await checkedWrite("client_memory:turn",
    Promise.resolve({ error: { message: "denied by policy", code: "42501" } }), (m) => logs.push(m));
  assert("a rejected write returns false", ok === false);
  assert("…is logged loudly", logs.length === 1 && /write REJECTED/.test(logs[0]), JSON.stringify(logs));
  assert("…and names WHICH write, so it can be found in a log full of them",
    /client_memory:turn/.test(logs[0]), JSON.stringify(logs));
  assert("…and carries the code", /42501/.test(logs[0]), JSON.stringify(logs));
}

// A write that landed says nothing. A checker that logged on success would train people to ignore it.
{
  const logs = [];
  const ok = await checkedWrite("fine", Promise.resolve({ error: null }), (m) => logs.push(m));
  assert("a write that landed returns true and stays quiet", ok === true && logs.length === 0, JSON.stringify(logs));
}

// A postgrest builder is a THENABLE, not a Promise — `then` but no `catch`/`finally`. If this stops
// working, every real call site is broken.
{
  const thenable = { then: (res) => res({ error: { message: "x", code: "23505" } }) };
  const ok = await checkedWrite("thenable", thenable, () => {});
  assert("a bare thenable (what postgrest returns) is handled", ok === false);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
