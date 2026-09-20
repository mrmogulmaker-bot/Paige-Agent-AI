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
