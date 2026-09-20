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
