import {
  defineCapability,
  objectInputSchema,
  ownerGrantablePermission,
  type CapabilityDefinition,
  type DefinedCapability,
} from "../../../supabase/functions/_shared/capability-kit/mod.ts";

const input = objectInputSchema({
  properties: { id: { type: "string" } },
  required: ["id"],
});

const valid: CapabilityDefinition = {
  identity: {
    id: "knowledge.documents.read",
    version: 1,
    domain: "knowledge",
    owner: "Knowledge",
    humanSurface: null,
    description: "Read one governed document.",
  },
  input,
  effect: "read",
  governance: {
    risk: "read_only",
    approval: "none",
    requiredPermission: ownerGrantablePermission("knowledge.documents.read"),
  },
  tenantScope: {
    source: "server",
    tenantResolver: "current_user_tenant_id",
    actorResolver: "authenticated_user",
    revalidateAt: ["before_execution"],
  },
  availability: { resolver: "capability_status", states: ["live", "unavailable"] },
  providerBinding: { kind: "internal", operation: "documents.read", connectionResolver: null },
  idempotency: { mode: "not_applicable" },
  receipt: {
    rail: true,
    recorder: "record_capability_run",
    redaction: "tenant_safe",
    visibility: "owner_internal",
  },
  outcome: { projector: "capability-record" },
};

defineCapability(valid);

// Root combinators are not members of the builder's root contract.
objectInputSchema({
  properties: {},
  // @ts-expect-error top-level anyOf is forbidden
  anyOf: [],
});

// A plain string cannot impersonate an owner-grantable permission.
const rawPermissionDefinition = {
  ...valid,
  governance: { ...valid.governance, requiredPermission: "owner" },
};
// @ts-expect-error requiredPermission is nominal and constructor-issued
defineCapability(rawPermissionDefinition);

// Mutation declarations cannot omit the required idempotency contract.
const { idempotency: _ignored, ...withoutIdempotency } = {
  ...valid,
  effect: "mutation" as const,
};
// @ts-expect-error mutations require idempotency
defineCapability(withoutIdempotency);

// Structurally similar objects cannot fabricate the DefinedCapability brand.
// @ts-expect-error DefinedCapability is nominal and constructor-issued
const fabricated: DefinedCapability = valid;
void fabricated;
