import { isOwnerGrantablePermissionKey } from "./permission.ts";
import { isCapabilityInputSchema } from "./schema.ts";
import {
  EVIDENCE_STATES,
  EXECUTION_OUTCOMES,
  type CapabilityDefinition,
  type DefinedCapability,
} from "./types.ts";

const DEFINED_CAPABILITY = Symbol("paige.defined-capability");
const DEFINED_CAPABILITIES = new WeakSet<object>();
const IDENTIFIER = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const EFFECTS = new Set(["read", "mutation", "external_effect"]);
const RISKS = new Set(["read_only", "ordinary", "high", "owner_only"]);
const APPROVALS = new Set(["none", "confirm", "owner_only"]);
const AVAILABILITY_STATES = new Set([
  "live", "needs_approval", "needs_setup", "proof_owed", "planned",
  "not_for_tier", "unavailable", "no_applicable",
]);
const REVALIDATION_SEAMS = new Set([
  "before_availability", "before_execution", "before_receipt",
]);
const REQUIRED_REVALIDATION_SEAMS = [...REVALIDATION_SEAMS];

const EXPECTED_KEYS = Object.freeze({
  definition: [
    "identity",
    "input",
    "effect",
    "governance",
    "tenantScope",
    "availability",
    "providerBinding",
    "idempotency",
    "receipt",
    "outcome",
  ],
  identity: ["id", "version", "domain", "owner", "humanSurface", "description"],
  governance: ["risk", "approval", "requiredPermission"],
  tenantScope: ["source", "tenantResolver", "actorResolver", "revalidateAt"],
  availability: ["resolver", "states"],
  providerBinding: ["kind", "operation", "connectionResolver"],
  readIdempotency: ["mode"],
  effectIdempotency: ["mode", "key", "readback", "replay"],
  receipt: ["rail", "recorder", "redaction", "visibility"],
  outcome: ["projector"],
} as const);

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new TypeError(`${label} must be a plain object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: unknown, expected: readonly string[], label: string): Record<string, unknown> {
  const record = plainRecord(value, label);
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} must contain exactly: ${wanted.join(", ")}.`);
  }
  return record;
}

function nonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function freezeDeep<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  return Object.freeze(value);
}

export function defineCapability(definition: CapabilityDefinition): DefinedCapability {
  const root = exactKeys(definition, EXPECTED_KEYS.definition, "Capability definition");
  const identity = exactKeys(root.identity, EXPECTED_KEYS.identity, "Capability identity");
  const governance = exactKeys(root.governance, EXPECTED_KEYS.governance, "Capability governance");
  const tenantScope = exactKeys(root.tenantScope, EXPECTED_KEYS.tenantScope, "Capability tenant scope");
  const availability = exactKeys(root.availability, EXPECTED_KEYS.availability, "Capability availability");
  const providerBinding = exactKeys(root.providerBinding, EXPECTED_KEYS.providerBinding, "Capability provider binding");
  const receipt = exactKeys(root.receipt, EXPECTED_KEYS.receipt, "Capability receipt");
  const outcome = exactKeys(root.outcome, EXPECTED_KEYS.outcome, "Capability outcome");

  if (!isCapabilityInputSchema(root.input)) {
    throw new TypeError("Capability input must come from objectInputSchema().");
  }
  if (!isOwnerGrantablePermissionKey(governance.requiredPermission)) {
    throw new TypeError("requiredPermission must come from ownerGrantablePermission().");
  }
  if (!EFFECTS.has(String(root.effect))) throw new TypeError("Capability effect is invalid.");
  if (!RISKS.has(String(governance.risk))) throw new TypeError("Capability risk is invalid.");
  if (!APPROVALS.has(String(governance.approval))) throw new TypeError("Capability approval class is invalid.");
  if ((governance.risk === "owner_only") !== (governance.approval === "owner_only")) {
    throw new TypeError("owner_only risk and approval must be declared together.");
  }
  if (!IDENTIFIER.test(String(identity.id))) throw new TypeError("Capability identity.id is invalid.");
  if (!Number.isInteger(identity.version) || Number(identity.version) < 1) {
    throw new TypeError("Capability identity.version must be a positive integer.");
  }
  for (const [label, value] of [
    ["identity.domain", identity.domain],
    ["identity.owner", identity.owner],
    ["identity.description", identity.description],
    ["tenantScope.tenantResolver", tenantScope.tenantResolver],
    ["tenantScope.actorResolver", tenantScope.actorResolver],
    ["availability.resolver", availability.resolver],
    ["providerBinding.operation", providerBinding.operation],
    ["receipt.recorder", receipt.recorder],
    ["outcome.projector", outcome.projector],
  ] as const) nonEmpty(value, label);

  if (tenantScope.source !== "server") {
    throw new TypeError("Capability tenant authority must be server-derived.");
  }
  const revalidateAt = tenantScope.revalidateAt;
  if (!Array.isArray(revalidateAt) ||
    revalidateAt.some((seam) => !REVALIDATION_SEAMS.has(String(seam))) ||
    REQUIRED_REVALIDATION_SEAMS.some((seam) => !revalidateAt.includes(seam))) {
    throw new TypeError("Capability tenant scope must revalidate at every authority seam.");
  }
  if (!Array.isArray(availability.states) || availability.states.length === 0 ||
    availability.states.some((state) => !AVAILABILITY_STATES.has(String(state))) ||
    new Set(availability.states).size !== availability.states.length) {
    throw new TypeError("Capability availability must declare at least one state.");
  }
  if (!["internal", "mcp", "partner"].includes(String(providerBinding.kind))) {
    throw new TypeError("Capability provider binding kind is invalid.");
  }
  if (providerBinding.connectionResolver !== null) {
    nonEmpty(providerBinding.connectionResolver, "providerBinding.connectionResolver");
  } else if (providerBinding.kind !== "internal") {
    throw new TypeError("External provider bindings require a connection resolver.");
  }
  if (receipt.rail !== true || receipt.redaction !== "tenant_safe") {
    throw new TypeError("Capability receipts must use the tenant-safe Rail contract.");
  }
  if (!["owner_internal", "tenant_member", "platform_operator"].includes(String(receipt.visibility))) {
    throw new TypeError("Capability receipt visibility is invalid.");
  }

  const effect = root.effect;
  const idempotency = effect === "read"
    ? exactKeys(root.idempotency, EXPECTED_KEYS.readIdempotency, "Read idempotency")
    : exactKeys(root.idempotency, EXPECTED_KEYS.effectIdempotency, "Effect idempotency");
  if (effect === "read") {
    if (idempotency.mode !== "not_applicable") {
      throw new TypeError("Read capabilities must declare idempotency as not_applicable.");
    }
  } else {
    if (effect !== "mutation" && effect !== "external_effect") {
      throw new TypeError("Capability effect is invalid.");
    }
    if (idempotency.mode !== "required") {
      throw new TypeError("Mutation and external-effect capabilities require idempotency.");
    }
    nonEmpty(idempotency.key, "idempotency.key");
    nonEmpty(idempotency.readback, "idempotency.readback");
    if (!["return_recorded_result", "reconcile_then_return"].includes(String(idempotency.replay))) {
      throw new TypeError("Capability idempotency replay policy is invalid.");
    }
  }

  const capability = {
    ...definition,
    executionOutcomes: EXECUTION_OUTCOMES,
    evidenceStates: EVIDENCE_STATES,
  } as DefinedCapability;
  Object.defineProperty(capability, DEFINED_CAPABILITY, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  const frozen = freezeDeep(capability);
  DEFINED_CAPABILITIES.add(frozen);
  return frozen;
}

export function isDefinedCapability(value: unknown): value is DefinedCapability {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Record<PropertyKey, unknown>)[DEFINED_CAPABILITY] === true &&
      DEFINED_CAPABILITIES.has(value as object) &&
      Object.isFrozen(value),
  );
}
