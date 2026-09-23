import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CAPABILITY_AVAILABILITY_STATES,
  EVIDENCE_STATES,
  EXECUTION_OUTCOMES,
  defineCapability,
  isDefinedCapability,
  objectInputSchema,
  ownerGrantablePermission,
} from "../../supabase/functions/_shared/capability-kit/mod.ts";
import {
  PER_CAPABILITY_AVAILABILITY_STATES,
} from "../../supabase/functions/_shared/paige-capability-status/resolver.ts";
import { classifyAction, mutatingTools } from "../../supabase/functions/_shared/action-risk.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures", "capability-kit");

async function readJson(name) {
  return JSON.parse(await readFile(join(FIXTURES, name), "utf8"));
}

function definitionFromFixture(fixture) {
  const effect = fixture.effect;
  return {
    identity: {
      id: fixture.id,
      version: 1,
      domain: fixture.id.split(".")[0],
      owner: "Capability Kit fixture",
      humanSurface: null,
      description: "Contract fixture only.",
    },
    input: objectInputSchema(fixture.input),
    effect,
    governance: {
      actionRiskKey: effect === "read" ? null : "crm_create_contact",
      risk: effect === "read" ? "read_only" : "ordinary",
      approval: effect === "read" ? "none" : "confirm",
      requiredPermission: ownerGrantablePermission(fixture.permission),
    },
    tenantScope: {
      source: "server",
      tenantResolver: "current_user_tenant_id",
      actorResolver: "authenticated_user",
      revalidateAt: ["before_availability", "before_execution", "before_receipt"],
    },
    availability: { resolver: "paige-capability-status", states: ["live", "unavailable"] },
    providerBinding: { kind: "internal", operation: fixture.id, connectionResolver: null },
    idempotency: effect === "read"
      ? { mode: "not_applicable" }
      : { mode: "required", key: "tenant+actor+request", readback: "canonical_record", replay: "return_recorded_result" },
    receipt: { rail: true, recorder: "record_capability_run", redaction: "tenant_safe", visibility: "owner_internal" },
    outcome: { projector: "capability-record" },
  };
}

let passed = 0;
function test(name, body) {
  try {
    body();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}`);
    throw error;
  }
}

const readFixture = await readJson("valid-read.json");
const mutationFixture = await readJson("valid-mutation.json");
const invalidCases = await readJson("invalid-cases.json");

// Every action the canonical policy classifies — the real RISK-derived set, not a fixture list.
// `mutatingTools()` is `RISK_BY_TOOL.keys()`, so membership here IS "a hand-curated RISK entry".
const CLASSIFIED_ACTION_KEYS = [...mutatingTools()].sort();

test("valid read and mutation declarations are branded and recursively immutable", () => {
  for (const fixture of [readFixture, mutationFixture]) {
    const capability = defineCapability(definitionFromFixture(fixture));
    assert.equal(isDefinedCapability(capability), true);
    assert.equal(Object.isFrozen(capability), true);
    assert.equal(Object.isFrozen(capability.identity), true);
    assert.equal(Object.isFrozen(capability.input.properties), true);
  }
});

test("shallow-frozen parents are snapshotted without freezing caller-owned children", () => {
  const revalidateAt = ["before_availability", "before_execution", "before_receipt"];
  const candidate = definitionFromFixture(readFixture);
  candidate.tenantScope = Object.freeze({ ...candidate.tenantScope, revalidateAt });
  const capability = defineCapability(candidate);
  assert.notStrictEqual(capability, candidate);
  assert.notStrictEqual(capability.input, candidate.input);
  assert.notStrictEqual(capability.governance.requiredPermission, candidate.governance.requiredPermission);
  assert.notStrictEqual(capability.tenantScope, candidate.tenantScope);
  assert.notStrictEqual(capability.tenantScope.revalidateAt, revalidateAt);
  assert.equal(Object.isFrozen(capability.tenantScope.revalidateAt), true);
  assert.equal(Object.isFrozen(revalidateAt), false);
  revalidateAt.push("before_execution");
  assert.equal(capability.tenantScope.revalidateAt.length, 3);

  const nestedProperties = { value: { type: "string" } };
  const frozenChild = Object.freeze({ type: "object", properties: nestedProperties, additionalProperties: false });
  const schema = objectInputSchema({ properties: { nested: frozenChild } });
  assert.notStrictEqual(schema.properties.nested, frozenChild);
  assert.notStrictEqual(schema.properties.nested.properties, nestedProperties);
  assert.equal(Object.isFrozen(schema.properties.nested), true);
  assert.equal(Object.isFrozen(nestedProperties), false);
});

test("declarations and schemas reject accessors, Proxies, functions, symbols, and non-plain prototypes", () => {
  let getterCalls = 0;
  const candidate = definitionFromFixture(readFixture);
  Object.defineProperty(candidate.identity, "owner", {
    enumerable: true,
    get() { getterCalls += 1; return "Accessor"; },
  });
  assert.throws(() => defineCapability(candidate), /accessors/);
  assert.equal(getterCalls, 0);

  const proxied = definitionFromFixture(readFixture);
  proxied.identity = new Proxy(proxied.identity, {});
  assert.throws(() => defineCapability(proxied), /Proxy/);
  assert.throws(() => objectInputSchema(new Proxy({ properties: {} }, {})), /Proxy/);

  const schemaWithGetter = { properties: {} };
  Object.defineProperty(schemaWithGetter, "description", {
    enumerable: true,
    get() { getterCalls += 1; return "Accessor"; },
  });
  assert.throws(() => objectInputSchema(schemaWithGetter), /accessors/);
  assert.equal(getterCalls, 0);

  assert.throws(() => objectInputSchema({ properties: { value: { type: "string", transform() {} } } }), /functions/);
  assert.throws(() => objectInputSchema({ properties: { value: Symbol("value") } }), /symbols/);
  assert.throws(() => defineCapability({ ...definitionFromFixture(readFixture), identity: new (class Identity {})() }), /plain prototype/);
});

test("availability states are the canonical resolver's exact per-capability set", () => {
  assert.strictEqual(CAPABILITY_AVAILABILITY_STATES, PER_CAPABILITY_AVAILABILITY_STATES);
  assert.deepEqual([...CAPABILITY_AVAILABILITY_STATES].sort(), [...PER_CAPABILITY_AVAILABILITY_STATES].sort());
});

test("every accepted schema keyword validates type and value before branding", () => {
  const nested = (value) => () => objectInputSchema({ properties: { value } });
  const cases = [
    ["description", () => objectInputSchema({ description: 42, properties: {} })],
    ["properties", () => objectInputSchema({ properties: [] })],
    ["required", () => objectInputSchema({ properties: { value: { type: "string" } }, required: ["missing"] })],
    ["required type", () => objectInputSchema({ properties: { value: { type: "string" } }, required: "value" })],
    ["required uniqueness", nested({ type: "object", properties: { child: { type: "string" } }, required: ["child", "child"], additionalProperties: false })],
    ["type", nested({ type: "date" })],
    ["nested description", nested({ type: "boolean", description: 42 })],
    ["anyOf", nested({ anyOf: [] })],
    ["enum non-empty", nested({ type: "string", enum: [] })],
    ["enum declared type", nested({ type: "string", enum: [1] })],
    ["enum uniqueness", nested({ type: "string", enum: ["same", "same"] })],
    ["minLength", nested({ type: "string", minLength: -1 })],
    ["maxLength", nested({ type: "string", maxLength: Number.POSITIVE_INFINITY })],
    ["length range", nested({ type: "string", minLength: 2, maxLength: 1 })],
    ["pattern type", nested({ type: "string", pattern: 42 })],
    ["pattern syntax", nested({ type: "string", pattern: "[" })],
    ["format type", nested({ type: "string", format: 42 })],
    ["format value", nested({ type: "string", format: "invented" })],
    ["minimum", nested({ type: "number", minimum: Number.NaN })],
    ["maximum", nested({ type: "integer", maximum: Number.POSITIVE_INFINITY })],
    ["numeric range", nested({ type: "integer", minimum: 2, maximum: 1 })],
    ["items", nested({ type: "array", items: null })],
    ["minItems", nested({ type: "array", items: { type: "string" }, minItems: -1 })],
    ["maxItems", nested({ type: "array", items: { type: "string" }, maxItems: 0.5 })],
    ["item range", nested({ type: "array", items: { type: "string" }, minItems: 2, maxItems: 1 })],
    ["nested properties", nested({ type: "object", properties: [], additionalProperties: false })],
    ["additionalProperties", nested({ type: "object", properties: {}, additionalProperties: true })],
    ["unsafe property name", nested({ type: "object", properties: { constructor: { type: "string" } }, additionalProperties: false })],
    ["unknown keyword", nested({ type: "string", minLength: 1, unvalidatedKeyword: true })],
  ];
  for (const [keyword, build] of cases) assert.throws(build, undefined, keyword);
});

test("the provider-safe subset accepts one valid instance of every keyword", () => {
  const schema = objectInputSchema({
    description: "All supported keywords.",
    properties: {
      choice: { description: "Union", anyOf: [{ type: "null" }, { type: "boolean", description: "Flag" }] },
      code: { type: "string", description: "Code", enum: ["AA", "BB"], minLength: 2, maxLength: 2, pattern: "^[A-Z]{2}$" },
      identifier: { type: "string", format: "uuid" },
      count: { type: "integer", description: "Count", minimum: 0, maximum: 10 },
      ratio: { type: "number", minimum: -1.5, maximum: 1.5 },
      values: { type: "array", description: "Values", items: { type: "string" }, minItems: 1, maxItems: 3 },
      nested: { type: "object", description: "Nested", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
    },
    required: ["code"],
  });
  assert.equal(schema.type, "object");
});

test("mutations must match the canonical action-risk policy", () => {
  const candidate = definitionFromFixture(mutationFixture);
  assert.throws(() => defineCapability({
    ...candidate,
    governance: { ...candidate.governance, risk: "read_only", approval: "none" },
  }), /canonical action-risk policy/);
  assert.throws(() => defineCapability({
    ...candidate,
    governance: { ...candidate.governance, actionRiskKey: "crm_create_unclassified_thing" },
  }), /canonical action-risk policy/);
});

// THE INVARIANT THIS PAIR EXISTS FOR. If the canonical policy says a key is an action, the kit
// must accept it; if the policy does not, the kit must refuse it. Both directions are asserted
// against the REAL policy rather than one hand-picked key, because a suite that exercised only
// `crm_create_contact` is precisely what let a second, redundant precondition ship in front of
// `classifyAction()` and veto 32 already-curated actions (INT-003 follow-up).
test("every action key the canonical policy classifies is declarable through the kit", () => {
  assert.ok(CLASSIFIED_ACTION_KEYS.length > 0, "the canonical policy classifies at least one action");
  const candidate = definitionFromFixture(mutationFixture);
  const refused = [];
  for (const actionRiskKey of CLASSIFIED_ACTION_KEYS) {
    const risk = classifyAction(actionRiskKey);
    const approval = risk === "owner_only" ? "owner_only" : "confirm";
    let capability;
    try {
      capability = defineCapability({
        ...candidate,
        governance: { ...candidate.governance, actionRiskKey, risk, approval },
      });
    } catch (error) {
      refused.push(`${actionRiskKey} — ${error.message}`);
      continue;
    }
    assert.equal(isDefinedCapability(capability), true, actionRiskKey);
    assert.equal(capability.governance.actionRiskKey, actionRiskKey);
    assert.equal(capability.governance.risk, risk);
    assert.equal(capability.governance.approval, approval);
  }
  if (refused.length > 0) {
    assert.fail(
      `the kit refused ${refused.length}/${CLASSIFIED_ACTION_KEYS.length} classified action keys:\n  ` +
      refused.join("\n  "),
    );
  }
});

test("an unclassified key is refused on policy membership, whatever its verb reads like", () => {
  const candidate = definitionFromFixture(mutationFixture);
  // `revise` and `purge` are absent from MUTATION_VERB; `create` is present. All three must be
  // refused, and refused by the POLICY branch — so acceptance is gated by curation, not by a regex.
  for (const actionRiskKey of ["crm_create_unclassified_thing", "widget_revise", "widget_purge"]) {
    assert.equal(classifyAction(actionRiskKey), "unclassified", actionRiskKey);
    assert.throws(() => defineCapability({
      ...candidate,
      governance: { ...candidate.governance, actionRiskKey },
    }), /must exist in the canonical action-risk policy/, actionRiskKey);
  }
});

// The veto that replaced the verb precondition. Removing a check obliges the remaining ones to be
// stronger, so `read_only` is refused outright for anything that writes or reaches outside the
// platform. `ActionRisk` cannot even express `read_only` and no entry classifies one, so the risk
// comparison below happens to reject it today — but that is the table's present composition doing
// the work, not a rule, and this asserts the rule.
test("mutation and external-effect capabilities cannot declare read_only risk", () => {
  const candidate = definitionFromFixture(mutationFixture);
  for (const effect of ["mutation", "external_effect"]) {
    assert.throws(() => defineCapability({
      ...candidate,
      effect,
      governance: { ...candidate.governance, risk: "read_only", approval: "none" },
    }), /read_only/, effect);
  }
});

// The premise the most-restrictive fold in `action-risk.ts` rests on: with the array deduplicated,
// folding is a no-op. `RISK` is hand-maintained and both its maps were last-wins, so a second tuple
// for an existing key silently re-classified it — `crm_update_task` carried two until the INT-003
// follow-up. The fold means a duplicate can now only RAISE a class, but a policy that quietly
// contradicts itself is still a policy nobody can read, so the array is asserted unique here.
// The tidier home for this is `action-risk-lint`, which rejects no duplicates today; that guard is
// outside this change and is routed rather than widened into.
// SYNCHRONOUS deliberately: `test()` above calls `body()` without awaiting it, so an async body
// prints "ok" and increments the pass count before it can possibly fail, and the failure surfaces
// only as an unhandled rejection. Node exits non-zero on one today, so it would not have gone
// unnoticed — but a test whose green depends on that is the shape this whole change exists to fix.
test("the canonical action-risk policy declares each key exactly once", () => {
  const policy = readFileSync(
    join(HERE, "..", "..", "supabase", "functions", "_shared", "action-risk.ts"),
    "utf8",
  );
  const region = policy.slice(
    policy.indexOf("const RISK: ReadonlyArray"),
    policy.indexOf("const RISK_RANK"),
  );
  const keys = [...region.matchAll(/\[\s*"([a-z0-9_]+)"\s*,\s*"(?:ordinary|high|owner_only)"/g)]
    .map((match) => match[1]);
  assert.ok(keys.length > 0, "the RISK array parsed to at least one tuple");
  const repeated = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
  assert.deepEqual(repeated, [], `RISK declares these keys more than once: ${repeated.join(", ")}`);
  assert.equal(keys.length, mutatingTools().size, "every parsed tuple survives into the fold");
});

test("external effects require the canonical high-risk class", () => {
  const candidate = definitionFromFixture(mutationFixture);
  assert.throws(() => defineCapability({ ...candidate, effect: "external_effect" }), /external_effect.*high/);
  const elevated = {
    ...candidate,
    effect: "external_effect",
    governance: { ...candidate.governance, actionRiskKey: "calendar_book_meeting", risk: "high" },
  };
  assert.equal(isDefinedCapability(defineCapability(elevated)), true);
});

test("governance seam identifiers are closed to canonical implementations", () => {
  const candidate = definitionFromFixture(readFixture);
  for (const changed of [
    { ...candidate, tenantScope: { ...candidate.tenantScope, tenantResolver: "request_body_tenant" } },
    { ...candidate, tenantScope: { ...candidate.tenantScope, actorResolver: "request_body_actor" } },
    { ...candidate, availability: { ...candidate.availability, resolver: "local_status" } },
    { ...candidate, receipt: { ...candidate.receipt, recorder: "local_audit" } },
    { ...candidate, outcome: { projector: "local_outcome" } },
  ]) assert.throws(() => defineCapability(changed), /canonical/);

  assert.throws(() => defineCapability({
    ...candidate,
    providerBinding: { kind: "mcp", operation: "documents.read", connectionResolver: "request_url" },
  }), /canonical/);
  assert.equal(isDefinedCapability(defineCapability({
    ...candidate,
    providerBinding: { kind: "mcp", operation: "documents.read", connectionResolver: "mcp-gateway" },
  })), true);
});

test("execution outcomes and evidence states remain separate exact dimensions", () => {
  const capability = defineCapability(definitionFromFixture(readFixture));
  assert.deepEqual(capability.executionOutcomes, EXECUTION_OUTCOMES);
  assert.deepEqual(capability.evidenceStates, EVIDENCE_STATES);
  assert.equal(capability.executionOutcomes.includes("recorded"), false);
  assert.equal(capability.evidenceStates.includes("succeeded"), false);
});

test("a structurally similar object cannot fabricate the capability brand", () => {
  const genuine = defineCapability(definitionFromFixture(readFixture));
  const copiedDescriptors = Object.create(
    Object.getPrototypeOf(genuine),
    Object.getOwnPropertyDescriptors(genuine),
  );
  Object.freeze(copiedDescriptors);
  assert.equal(isDefinedCapability(copiedDescriptors), false);
});

test("copied private symbols cannot fabricate schema or permission authority", () => {
  const candidate = definitionFromFixture(readFixture);
  const copy = (value) => Object.freeze(Object.create(
    Object.getPrototypeOf(value),
    Object.getOwnPropertyDescriptors(value),
  ));
  assert.throws(() => defineCapability({
    ...candidate,
    governance: { ...candidate.governance, requiredPermission: copy(candidate.governance.requiredPermission) },
  }), /ownerGrantablePermission/);
  assert.throws(() => defineCapability({ ...candidate, input: copy(candidate.input) }), /objectInputSchema/);
});

test("schema roots must be plain objects", () => {
  class SchemaRoot { constructor() { this.properties = {}; } }
  assert.throws(() => objectInputSchema(new SchemaRoot()), /plain/);
});

for (const fixture of invalidCases) {
  test(`rejects ${fixture.name}`, () => {
    if (fixture.stage === "schema") {
      assert.throws(() => objectInputSchema({ properties: {}, ...fixture.rootExtra }));
      return;
    }
    if (fixture.stage === "permission") {
      assert.throws(() => ownerGrantablePermission(fixture.permission));
      return;
    }
    const candidate = definitionFromFixture(mutationFixture);
    if (fixture.omit) delete candidate[fixture.omit];
    if (fixture.extra) Object.assign(candidate, fixture.extra);
    assert.throws(() => defineCapability(candidate));
  });
}

console.log(
  `\n✓ capability-kit focused tests passed — ${passed} cases; ` +
  `${CLASSIFIED_ACTION_KEYS.length} classified action keys proven declarable.`,
);
