import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  EVIDENCE_STATES,
  EXECUTION_OUTCOMES,
  defineCapability,
  isDefinedCapability,
  objectInputSchema,
  ownerGrantablePermission,
} from "../../supabase/functions/_shared/capability-kit/mod.ts";

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
    availability: { resolver: "capability_status", states: ["live", "unavailable"] },
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

test("valid read and mutation declarations are branded and recursively immutable", () => {
  for (const fixture of [readFixture, mutationFixture]) {
    const capability = defineCapability(definitionFromFixture(fixture));
    assert.equal(isDefinedCapability(capability), true);
    assert.equal(Object.isFrozen(capability), true);
    assert.equal(Object.isFrozen(capability.identity), true);
    assert.equal(Object.isFrozen(capability.input.properties), true);
  }
});

test("already-frozen parents cannot hide mutable descendants", () => {
  const revalidateAt = ["before_availability", "before_execution", "before_receipt"];
  const candidate = definitionFromFixture(readFixture);
  candidate.tenantScope = Object.freeze({ ...candidate.tenantScope, revalidateAt });
  const capability = defineCapability(candidate);
  assert.equal(Object.isFrozen(capability.tenantScope), true);
  assert.equal(Object.isFrozen(revalidateAt), true);
  assert.throws(() => revalidateAt.pop(), TypeError);

  const nestedProperties = { value: { type: "string" } };
  const frozenChild = Object.freeze({ type: "object", properties: nestedProperties, additionalProperties: false });
  const schema = objectInputSchema({ properties: { nested: frozenChild } });
  assert.equal(Object.isFrozen(schema.properties.nested), true);
  assert.equal(Object.isFrozen(nestedProperties), true);
});

test("string lengths must be finite non-negative integers", () => {
  for (const minLength of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => objectInputSchema({ properties: { value: { type: "string", minLength } } }), /non-negative integer/);
  }
  assert.throws(() => objectInputSchema({ properties: { value: { type: "string", minLength: 2, maxLength: 1 } } }), /greater than or equal/);
});

test("array cardinalities must be finite non-negative integers", () => {
  for (const minItems of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => objectInputSchema({
      properties: { values: { type: "array", items: { type: "string" }, minItems } },
    }), /non-negative integer/);
  }
  assert.throws(() => objectInputSchema({
    properties: { values: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 1 } },
  }), /greater than or equal/);
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
  assert.throws(() => objectInputSchema(new SchemaRoot()), /plain objects/);
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

console.log(`\n✓ capability-kit focused tests passed — ${passed} cases.`);
