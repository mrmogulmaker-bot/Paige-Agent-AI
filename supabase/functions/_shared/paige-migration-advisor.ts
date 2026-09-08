/**
 * Paige Self-Knowledge & Migration Advisor — read-only Harness capability.
 *
 * This module deliberately owns no HTTP route, provider credential, approval token,
 * durable receipt, Rail writer, Memory record, or chat surface. It composes the
 * existing Spine registry with caller-scoped evidence and returns an inline plan.
 */
import { PAIGE_SPINE_CAPABILITIES } from "./paige-spine/registry.ts";
import {
  loadN8nReadinessForChat,
  type N8nChatEvidence,
} from "./paige-spine/domains/n8nChatEvidence.ts";
import {
  parseN8nSpineReadiness,
  type N8nSafeReadiness,
} from "./paige-spine/domains/n8nReadiness.ts";
import type { SpineEvidenceRpcClient } from "./paige-spine/resolveEvidence.ts";

export type MigrationDirection = "off_external_to_paige" | "into_external" | "compare_only" | "ambiguous";
export type DeliveryTruth = "LIVE" | "PARTIAL" | "UNAVAILABLE" | "PROOF OWED";
export type EvidenceVerification = "VERIFIED" | "UNVERIFIED";
export type Freshness = "current" | "stale" | "unknown";
export type TenantAvailability = "available" | "unavailable" | "unknown";
export type Eligibility = "eligible" | "ineligible" | "unverified";
export type AuthorityLane = "read" | "draft" | "auto" | "confirm" | "prohibited";

export type RuntimeEvidence = {
  readonly availability: TenantAvailability;
  readonly verification: EvidenceVerification;
  readonly freshness: Freshness;
  readonly observed_at: string | null;
  readonly source: "spine_runtime" | "tenant_runtime" | "release_record";
  readonly source_revision: string;
  readonly evidence_refs: readonly string[];
  readonly conflicts: readonly string[];
};

export type MigrationEvidenceScope = {
  readonly tenant_id: string;
  readonly workspace_ref: string;
  readonly context_epoch: string;
};

export type ScopedN8nInventoryEnvelope = {
  readonly scope: MigrationEvidenceScope;
  readonly payload: unknown;
};

export type MigrationIntent = {
  readonly direction: MigrationDirection;
  readonly source_systems: readonly string[];
  readonly dependency_systems: readonly string[];
  readonly target_state: "paige_managed_operations" | string | null;
  readonly desired_outcomes: readonly string[];
  readonly object_classes: readonly string[];
  readonly assumptions: readonly string[];
  readonly ambiguities: readonly string[];
  readonly clarification: string | null;
};

export type ProviderGovernanceEvidence = {
  readonly provider: string;
  readonly delivery_status: DeliveryTruth;
  readonly authority_lane: AuthorityLane;
  readonly source_revision: string;
  readonly observed_at: string;
};

export type ExternalComparisonEvidenceInput = {
  readonly subject: string;
  readonly claim: string;
  readonly source_url: string;
  readonly publisher: string;
  readonly checked_as_of: string;
  readonly applicable_plan_edition_region: string;
  readonly limitation: string;
  readonly confidence: "high" | "moderate" | "limited";
  readonly reverify_after_days: number;
};

export type MigrationAdvisorInput = {
  readonly utterance: string;
  readonly request_id: string;
  readonly plan_id: string;
  readonly now: string;
  readonly source_revision: string;
  readonly scope: {
    readonly tenant_id: string;
    readonly workspace_ref: string;
    readonly context_epoch: string;
    readonly tier: string;
    role: string;
    is_legal_owner: boolean;
    readonly server_verified: boolean;
    is_current: () => boolean;
  };
  readonly rpc_client: SpineEvidenceRpcClient;
  load_readonly_n8n_inventory: (scope: Readonly<MigrationEvidenceScope>) => Promise<ScopedN8nInventoryEnvelope>;
  readonly capability_runtime_evidence: Readonly<Record<string, RuntimeEvidence>>;
  readonly capability_eligibility: Readonly<Record<string, Eligibility>>;
  readonly provider_governance: readonly ProviderGovernanceEvidence[];
  readonly external_comparison_evidence: ExternalComparisonEvidenceInput[];
};

type WorkflowSummary = {
  readonly workflow_ref: string;
  readonly name: string | null;
  readonly active: boolean | null;
  readonly observed_updated_at: string | null;
};

export type N8nMigrationInventory = {
  readonly saved_configuration: boolean | null;
  readonly provider_connection_truth: "connected" | "saved_unverified" | "not_connected" | "conflicting" | "unavailable";
  readonly api_state: string | null;
  readonly mcp_state: string | null;
  readonly readiness_freshness: Freshness;
  readonly readiness_observed_at: string | null;
  readonly recorded_workflow_count: number | null;
  readonly approved_workflow_count: number | null;
  readonly workflow_evidence: "current_complete" | "current_partial" | "stale" | "unavailable";
  readonly observed_active_workflow_count: number | null;
  readonly observed_workflows: readonly WorkflowSummary[];
  readonly observed_at: string | null;
  readonly unknowns: readonly string[];
  readonly external_changes: readonly [];
};

const SYSTEM_ALIASES: Readonly<Record<string, readonly RegExp[]>> = {
  gohighlevel: [/\bgo\s*high\s*level\b/i, /\bhighlevel\b/i, /\bghl\b/i],
  hubspot: [/\bhub\s*spot\b/i],
  asana: [/\basana\b/i],
  n8n: [/\bn8n\b/i],
};

const OFF_WORDS = /\b(replace|move\s+off|migrate\s+(?:away\s+)?from|phase\s+out|retire|shut\s+down|take\s+over)\b/i;
const INTO_WORDS = /\b(move|migrate|switch|transfer|go)\b/i;
const COMPARE_WORDS = /\b(compare|versus|vs\.?|better\s+than|difference\s+between)\b/i;

function relationText(text: string): string {
  return text.toLowerCase()
    .replace(/\bgo\s*high\s*level\b|\bhighlevel\b|\bghl\b/g, "gohighlevel")
    .replace(/\bhub\s*spot\b/g, "hubspot")
    .replace(/\s+/g, " ");
}

function explicitDirection(text: string): MigrationDirection | null {
  const normalized = relationText(text);
  const external = "(gohighlevel|hubspot|asana)";
  const off = [
    new RegExp(`\\breplace\\s+(?:our\\s+|the\\s+)?${external}\\b[^.]*\\bwith\\s+paige\\b`),
    new RegExp(`\\bpaige\\s+(?:should\\s+|will\\s+|can\\s+)?replace\\s+(?:our\\s+|the\\s+)?${external}\\b`),
    new RegExp(`\\b(?:move|migrate|switch|transfer)\\s+(?:our\\s+|the\\s+)?${external}\\s+(?:to|into|onto)\\s+paige\\b`),
    new RegExp(`\\bfrom\\s+(?:our\\s+|the\\s+)?${external}\\s+(?:to|into|onto)\\s+paige\\b`),
  ].some((pattern) => pattern.test(normalized));
  const into = [
    new RegExp(`\\breplace\\s+paige\\b[^.]*\\bwith\\s+(?:our\\s+|the\\s+)?${external}\\b`),
    new RegExp(`\\b${external}\\s+(?:should\\s+|will\\s+|can\\s+)?replace\\s+paige\\b`),
    new RegExp(`\\b(?:move|migrate|switch|transfer)\\s+paige\\s+(?:to|into|onto)\\s+(?:our\\s+|the\\s+)?${external}\\b`),
    new RegExp(`\\bfrom\\s+paige\\s+(?:to|into|onto)\\s+(?:our\\s+|the\\s+)?${external}\\b`),
  ].some((pattern) => pattern.test(normalized));
  if (off && into) return "ambiguous";
  if (off) return "off_external_to_paige";
  if (into) return "into_external";
  return null;
}

function systemsIn(text: string): string[] {
  return Object.entries(SYSTEM_ALIASES)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(text)))
    .map(([system]) => system);
}

export function normalizeMigrationIntent(utterance: string): MigrationIntent {
  const text = typeof utterance === "string" ? utterance.trim() : "";
  const named = systemsIn(text);
  const external = named.filter((system) => system !== "n8n");
  const dependencySystems = named.filter((system) => system === "n8n");
  const lower = text.toLowerCase();
  const desiredOutcomes: string[] = [];
  const objectClasses: string[] = [];
  if (/\b(communication|communications|email|sms|message|phone|conversation)\b/i.test(text)) {
    desiredOutcomes.push("communications_takeover");
    objectClasses.push("communications");
  }
  if (/\b(workflow|automation|n8n)\b/i.test(text)) objectClasses.push("workflows");
  if (/\b(crm|contact|pipeline|lead)\b/i.test(text)) objectClasses.push("crm_records");
  if (/\b(project|task|asana)\b/i.test(text)) objectClasses.push("work_management");
  if (!desiredOutcomes.length && /\boperations?\b/i.test(text)) desiredOutcomes.push("operations_takeover");

  const explicitlyInto = INTO_WORDS.test(text) && external.some((system) => {
    const label = system === "gohighlevel" ? "(?:go\\s*high\\s*level|highlevel|ghl)" : system;
    return new RegExp(`\\b(?:to|into|onto)\\s+${label}\\b`, "i").test(text);
  });
  const offPaige = external.length > 0 && OFF_WORDS.test(text) && (
    /\breplace\b/i.test(text) || /\b(move\s+off|migrate\s+(?:away\s+)?from|phase\s+out|retire|shut\s+down)\b/i.test(text) ||
    (/\btake\s+over\b/i.test(text) && /\b(paige|dependent|operations?|communications?)\b/i.test(text))
  );
  const compare = COMPARE_WORDS.test(text) && external.length > 0;
  const relationalDirection = explicitDirection(text);

  let direction: MigrationDirection = "ambiguous";
  if (relationalDirection) direction = relationalDirection;
  else if (compare && !offPaige && !explicitlyInto) direction = "compare_only";
  else if (explicitlyInto && !offPaige) direction = "into_external";
  else if (offPaige && !explicitlyInto) direction = "off_external_to_paige";

  const ambiguities: string[] = [];
  if (!external.length && direction !== "compare_only") ambiguities.push("The external source system is not identified.");
  if (direction === "ambiguous" && external.length) ambiguities.push("The migration direction is not explicit.");
  if (direction === "off_external_to_paige") {
    if (!objectClasses.length) ambiguities.push("The affected workflow and data classes are not yet identified.");
    ambiguities.push("Named dependencies, cutover criteria, and rollback checkpoints still require inventory.");
  }
  const clarification = direction === "ambiguous"
    ? external[0] === "gohighlevel"
      ? "Are we moving off GHL into Paige-managed operations, or moving work into GHL?"
      : external[0]
        ? `Are we moving off ${external[0]} into Paige-managed operations, or moving work into ${external[0]}?`
        : "Which external system is involved, and are we moving off it into Paige-managed operations or moving work into it?"
    : null;

  return {
    direction,
    source_systems: direction === "into_external" ? ["paige"] : external,
    dependency_systems: dependencySystems,
    target_state: direction === "off_external_to_paige" ? "paige_managed_operations" : direction === "into_external" ? external[0] ?? null : null,
    desired_outcomes: [...new Set(desiredOutcomes)],
    object_classes: [...new Set(objectClasses)],
    assumptions: lower.includes("dependent") ? ["The named source dependency is owner-stated and still requires read-only inventory verification."] : [],
    ambiguities,
    clarification,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const hasOnly = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every((key) => allowed.includes(key));
const isIso = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const safeText = (value: unknown, max: number): string | null => {
  if (typeof value !== "string" || !value.trim() || value.length > max || Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  return value.trim();
};

function coerceReadiness(value: unknown): N8nSafeReadiness | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.api) && "workflowCount" in value.api) return value as N8nSafeReadiness;
  return typeof value.tenant_id === "string" ? parseN8nSpineReadiness(value, value.tenant_id) : null;
}

export function projectN8nMigrationInventory(input: { readonly readiness: unknown; readonly workflow_inventory: unknown; readonly now: string }): N8nMigrationInventory {
  const ready = coerceReadiness(input.readiness);
  const unknowns: string[] = [];
  const readinessDates = ready ? [ready.api.lastSuccessfulCheck, ready.mcp.lastSuccessfulCheck].filter((value): value is string => value !== null) : [];
  const readinessObservedAt = readinessDates.length ? readinessDates.sort((left, right) => Date.parse(right) - Date.parse(left))[0] : null;
  const readinessAge = readinessObservedAt ? Date.parse(input.now) - Date.parse(readinessObservedAt) : Number.NaN;
  const readinessFreshness: Freshness = !readinessObservedAt || !Number.isFinite(readinessAge) || readinessAge < 0 ? "unknown" : readinessAge > 86_400_000 ? "stale" : "current";
  const apiConnected = ready?.api.state === "api_connected" || ready?.api.state === "api_connected_zero";
  const mcpConnected = ready?.mcp.state === "connected_no_approved_tools" || ready?.mcp.state === "connected_approved_tools";
  const saved = ready ? ready.api.state !== "not_connected" || ready.mcp.state !== "mcp_not_configured" : null;
  let connection: N8nMigrationInventory["provider_connection_truth"] = "unavailable";
  if (ready) {
    if (apiConnected || mcpConnected) connection = (!apiConnected && mcpConnected) ? "conflicting" : "connected";
    else if (ready.api.state === "api_saved" || ready.api.state === "api_health_failed") connection = "saved_unverified";
    else connection = "not_connected";
  }

  let workflowEvidence: N8nMigrationInventory["workflow_evidence"] = "unavailable";
  let activeCount: number | null = null;
  let observedAt: string | null = null;
  let workflows: WorkflowSummary[] = [];
  if (input.workflow_inventory !== null && input.workflow_inventory !== undefined) {
    if (!isRecord(input.workflow_inventory) || !hasOnly(input.workflow_inventory, ["ok", "workflows", "total_count", "inventory_complete", "estimated", "observed_at"])) {
      throw new Error("unsafe_n8n_inventory");
    }
    const root = input.workflow_inventory;
    if (root.ok !== true || !Array.isArray(root.workflows) || root.workflows.length > 200 || !Number.isSafeInteger(root.total_count) || Number(root.total_count) < root.workflows.length || typeof root.inventory_complete !== "boolean" || typeof root.estimated !== "boolean" || !isIso(root.observed_at)) {
      throw new Error("unsafe_n8n_inventory");
    }
    workflows = root.workflows.map((value) => {
      if (!isRecord(value) || !hasOnly(value, ["id", "name", "active", "archived", "published", "availableInMCP", "createdAt", "updatedAt"])) throw new Error("unsafe_n8n_inventory");
      const ref = safeText(value.id, 100);
      if (!ref || !/^[A-Za-z0-9_-]+$/.test(ref)) throw new Error("unsafe_n8n_inventory");
      if (value.active !== undefined && typeof value.active !== "boolean") throw new Error("unsafe_n8n_inventory");
      const name = value.name === undefined ? null : safeText(value.name, 200);
      if (value.name !== undefined && name === null) throw new Error("unsafe_n8n_inventory");
      const updated = value.updatedAt === undefined ? null : isIso(value.updatedAt) ? new Date(value.updatedAt).toISOString() : null;
      if (value.updatedAt !== undefined && updated === null) throw new Error("unsafe_n8n_inventory");
      return { workflow_ref: ref, name: null, active: typeof value.active === "boolean" ? value.active : null, observed_updated_at: updated };
    });
    if (workflows.length) unknowns.push("Workflow names and definitions were intentionally omitted from the advisory projection; use scoped references for later approval.");
    observedAt = new Date(root.observed_at as string).toISOString();
    activeCount = workflows.filter((workflow) => workflow.active === true).length;
    const ageMs = Date.parse(input.now) - Date.parse(observedAt);
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 24 * 60 * 60 * 1000) {
      workflowEvidence = "stale";
      unknowns.push("The available workflow inventory is stale and cannot support a cutover decision without a fresh read.");
    } else {
      workflowEvidence = root.inventory_complete === true ? "current_complete" : "current_partial";
      if (root.inventory_complete !== true) unknowns.push("The current workflow inventory is partial; more pages or searches are required.");
    }
  } else {
    unknowns.push("Live workflow inventory was not available; zero approved workflows does not mean the n8n account is empty.");
  }
  if (!ready) unknowns.push("Current n8n connection readiness is unavailable; do not describe the provider as connected or disconnected.");
  else if (readinessFreshness === "stale") unknowns.push("The recorded n8n connection check is stale; preserve it as last-known state and re-verify before a cutover decision.");
  else if (readinessFreshness === "unknown") unknowns.push("The n8n connection state has no verified freshness timestamp; re-verify before a cutover decision.");
  if (connection === "conflicting") unknowns.push("API and MCP connection evidence disagree; resolve the conflict before planning a cutover.");

  return {
    saved_configuration: saved,
    provider_connection_truth: connection,
    api_state: ready?.api.state ?? null,
    mcp_state: ready?.mcp.state ?? null,
    readiness_freshness: readinessFreshness,
    readiness_observed_at: readinessObservedAt,
    recorded_workflow_count: ready?.api.workflowCount ?? null,
    approved_workflow_count: ready?.mcp.approvedWorkflowCount ?? null,
    workflow_evidence: workflowEvidence,
    observed_active_workflow_count: activeCount,
    observed_workflows: workflows,
    observed_at: observedAt,
    unknowns,
    external_changes: [],
  };
}

function current(scope: MigrationAdvisorInput["scope"]): boolean {
  try { return scope.is_current(); } catch { return false; }
}

function scopeMatches(scope: MigrationAdvisorInput["scope"], snapshot: MigrationEvidenceScope): boolean {
  return current(scope) && scope.tenant_id === snapshot.tenant_id && scope.workspace_ref === snapshot.workspace_ref && scope.context_epoch === snapshot.context_epoch;
}

function containsScopeIdentity(value: string, scope: MigrationEvidenceScope): boolean {
  const normalizedValue = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return Object.values(scope).some((part) => {
    const normalizedPart = part.toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalizedPart.length > 0 && normalizedValue.includes(normalizedPart);
  });
}

function failure(error: "owner_role_required" | "scope_unverified" | "scope_changed") {
  return {
    ok: false as const,
    error,
    verified: [] as readonly string[],
    unknowns: ["Tenant-scoped advisory evidence was not assembled."],
    not_changed: ["external systems", "provider connections", "tenant data", "external messages"] as readonly string[],
    external_changes: [] as readonly [],
  };
}

function authorityLane(classification: string | undefined): AuthorityLane {
  if (classification === "read") return "read";
  if (classification === "mutate" || classification === "external_effect") return "confirm";
  return "prohibited";
}

function comparisonEvidence(evidence: readonly ExternalComparisonEvidenceInput[], now: string) {
  return evidence.map((item) => {
    if (!isRecord(item) || !hasOnly(item, ["subject", "claim", "source_url", "publisher", "checked_as_of", "applicable_plan_edition_region", "limitation", "confidence", "reverify_after_days"])) throw new Error("invalid_external_comparison_evidence");
    const subject = safeText(item.subject, 80), claim = safeText(item.claim, 500), publisher = safeText(item.publisher, 120);
    const applicable = safeText(item.applicable_plan_edition_region, 240), limitation = safeText(item.limitation, 500);
    let url: URL;
    try { url = new URL(item.source_url); } catch { throw new Error("invalid_external_comparison_evidence"); }
    if (!subject || !claim || !publisher || !applicable || !limitation || url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !/^\d{4}-\d{2}-\d{2}$/.test(item.checked_as_of) || !(["high", "moderate", "limited"] as const).includes(item.confidence) || !Number.isInteger(item.reverify_after_days) || item.reverify_after_days < 1 || item.reverify_after_days > 365) {
      throw new Error("invalid_external_comparison_evidence");
    }
    const checked = Date.parse(`${item.checked_as_of}T00:00:00.000Z`);
    const age = Date.parse(now) - checked;
    const freshness: Freshness = !Number.isFinite(age) || age < 0 ? "unknown" : age > item.reverify_after_days * 86_400_000 ? "stale" : "current";
    return {
      subject,
      claim,
      source_url: url.toString(),
      publisher,
      checked_as_of: item.checked_as_of,
      applicable_plan_edition_region: applicable,
      limitation,
      confidence: item.confidence,
      reverify_after_days: item.reverify_after_days,
      freshness,
      evidence_class: "external_research" as const,
    };
  });
}

function derivedFreshness(observedAt: string | null, now: string, staleAfterDays: number): Freshness {
  if (!observedAt) return "unknown";
  const age = Date.parse(now) - Date.parse(observedAt);
  if (!Number.isFinite(age) || age < 0) return "unknown";
  return age > staleAfterDays * 86_400_000 ? "stale" : "current";
}

function safeEvidenceRefs(refs: readonly string[]): string[] {
  if (!Array.isArray(refs) || refs.length > 20) throw new Error("invalid_capability_runtime_evidence");
  return refs.map((ref) => {
    const safe = safeText(ref, 200);
    if (!safe || !/^[A-Za-z0-9._:/-]+$/.test(safe)) throw new Error("invalid_capability_runtime_evidence");
    return safe;
  });
}

export function isVerifiedCoverageNow(capability: {
  readonly delivery_truth: DeliveryTruth;
  readonly tenant_availability: TenantAvailability;
  readonly eligibility: Eligibility;
  readonly evidence_verification: EvidenceVerification;
  readonly freshness: Freshness;
  readonly authority_lane: AuthorityLane;
  readonly conflicts: readonly string[];
}): boolean {
  return capability.delivery_truth !== "UNAVAILABLE" && capability.tenant_availability === "available" && capability.eligibility === "eligible" && capability.evidence_verification === "VERIFIED" && capability.freshness === "current" && capability.authority_lane === "read" && capability.conflicts.length === 0;
}

export async function runReadOnlyMigrationAdvisor(input: MigrationAdvisorInput) {
  if (!input.scope.server_verified || !input.scope.tenant_id || !input.scope.workspace_ref || !input.scope.context_epoch) return failure("scope_unverified");
  if (input.scope.role !== "owner" || input.scope.is_legal_owner !== true) return failure("owner_role_required");
  if (!current(input.scope)) return failure("scope_changed");
  const scopeSnapshot = Object.freeze({ tenant_id: input.scope.tenant_id, workspace_ref: input.scope.workspace_ref, context_epoch: input.scope.context_epoch });
  if (!/^[0-9a-f]{40}$/i.test(input.source_revision) || !isIso(input.now)) throw new Error("invalid_advisor_build_identity");
  if (!/^req_[0-9a-f]{32}$/i.test(input.request_id) || !/^plan_[0-9a-f]{32}$/i.test(input.plan_id) || containsScopeIdentity(input.request_id, scopeSnapshot) || containsScopeIdentity(input.plan_id, scopeSnapshot)) throw new Error("invalid_advisor_artifact_identity");

  const intent = normalizeMigrationIntent(input.utterance);
  const n8nEvidence: N8nChatEvidence = await loadN8nReadinessForChat(input.rpc_client, scopeSnapshot.tenant_id, { isCurrent: () => scopeMatches(input.scope, scopeSnapshot) });
  if (!scopeMatches(input.scope, scopeSnapshot) || n8nEvidence.status === "scope_changed" || n8nEvidence.status === "wrong_workspace") return failure("scope_changed");
  let inventoryEnvelope: ScopedN8nInventoryEnvelope;
  try {
    inventoryEnvelope = await input.load_readonly_n8n_inventory(scopeSnapshot);
  } catch {
    inventoryEnvelope = { scope: scopeSnapshot, payload: null };
  }
  if (!scopeMatches(input.scope, scopeSnapshot)) return failure("scope_changed");
  if (!isRecord(inventoryEnvelope) || !hasOnly(inventoryEnvelope, ["scope", "payload"]) || !isRecord(inventoryEnvelope.scope) || !hasOnly(inventoryEnvelope.scope, ["tenant_id", "workspace_ref", "context_epoch"]) || inventoryEnvelope.scope.tenant_id !== scopeSnapshot.tenant_id || inventoryEnvelope.scope.workspace_ref !== scopeSnapshot.workspace_ref || inventoryEnvelope.scope.context_epoch !== scopeSnapshot.context_epoch) return failure("scope_changed");
  const n8nInventory = projectN8nMigrationInventory({
    readiness: n8nEvidence.status === "available" ? n8nEvidence.readiness : null,
    workflow_inventory: inventoryEnvelope.payload,
    now: input.now,
  });

  const knownKeys = new Set<string>(PAIGE_SPINE_CAPABILITIES.map((capability) => capability.key));
  if (Object.keys(input.capability_runtime_evidence).some((key) => !knownKeys.has(key)) || Object.keys(input.capability_eligibility).some((key) => !knownKeys.has(key))) {
    throw new Error("unknown_spine_capability_evidence");
  }
  const capabilityManifest = PAIGE_SPINE_CAPABILITIES.map((capability) => {
    const runtime = input.capability_runtime_evidence[capability.key];
    if (runtime && (!isRecord(runtime) || !hasOnly(runtime, ["availability", "verification", "freshness", "observed_at", "source", "source_revision", "evidence_refs", "conflicts"]) || !(["available", "unavailable", "unknown"] as const).includes(runtime.availability) || !(["VERIFIED", "UNVERIFIED"] as const).includes(runtime.verification) || !(["current", "stale", "unknown"] as const).includes(runtime.freshness) || !(["spine_runtime", "tenant_runtime", "release_record"] as const).includes(runtime.source) || (runtime.observed_at !== null && !isIso(runtime.observed_at)) || !/^[0-9a-f]{40}$/i.test(runtime.source_revision) || !Array.isArray(runtime.conflicts) || runtime.conflicts.some((conflict) => safeText(conflict, 300) === null))) throw new Error("invalid_capability_runtime_evidence");
    const eligibility = input.capability_eligibility[capability.key] ?? "unverified";
    if (!(["eligible", "ineligible", "unverified"] as const).includes(eligibility)) throw new Error("invalid_capability_eligibility");
    const sourceRevisionMatches = runtime?.source_revision === input.source_revision;
    const freshness = runtime ? derivedFreshness(runtime.observed_at, input.now, "evidence" in capability ? capability.evidence.staleAfterDays : 1) : "unknown";
    const conflicts = runtime ? [
      ...(runtime.conflicts.length ? ["Canonical runtime evidence reported a conflict."] : []),
      ...(!sourceRevisionMatches ? ["Runtime evidence is not bound to the executing build identity."] : []),
      ...(runtime.freshness !== freshness ? ["Caller freshness disagrees with freshness derived from the observation timestamp."] : []),
    ] : [];
    const evidenceRefs = runtime ? safeEvidenceRefs(runtime.evidence_refs) : [];
    const evidenceVerification: EvidenceVerification = runtime?.verification === "VERIFIED" && sourceRevisionMatches && conflicts.length === 0 ? "VERIFIED" : "UNVERIFIED";
    const deliveryTruth = capability.maturity as DeliveryTruth;
    const canNow = deliveryTruth !== "UNAVAILABLE" && runtime?.availability === "available" && eligibility === "eligible" && evidenceVerification === "VERIFIED" && freshness === "current" && authorityLane(capability.action?.classification) === "read";
    return {
      capability_key: capability.key,
      domain: capability.domain,
      human_surface: capability.humanSurface,
      delivery_truth: deliveryTruth,
      chat_binding: capability.chatBinding,
      mind_binding: capability.mindBinding,
      tenant_availability: runtime?.availability ?? "unknown",
      eligibility,
      authority_lane: authorityLane(capability.action?.classification),
      approval_authority: capability.action?.approvalAuthority ?? "none",
      evidence_verification: evidenceVerification,
      freshness,
      observed_at: runtime?.observed_at ?? null,
      evidence_source: runtime?.source ?? "spine_registry",
      source_revision: runtime?.source_revision ?? input.source_revision,
      release_identity: { revision: input.source_revision, verification: "UNVERIFIED" as const },
      evidence_refs: evidenceRefs,
      conflicts,
      can_now: canNow ? "Tenant-safe read coverage is verified for this capability." : null,
      cannot_yet: canNow ? null : "This capability is not verified as currently available, eligible, fresh, read-only coverage for this tenant.",
      next_gate: canNow ? "No external-action authority is implied." : "Refresh or resolve the unavailable truth dimension before relying on this capability.",
      limitations: [
        "Registry presence does not prove tenant connection, eligibility, authority, authenticated proof, or customer release.",
        ...(capability.action?.classification === "external_effect" ? ["External execution is outside this read-only advisor and requires the canonical approval path."] : []),
      ],
    };
  });

  const providerGroups = new Map<string, ProviderGovernanceEvidence[]>();
  input.provider_governance.forEach((provider) => {
    if (!isRecord(provider) || !hasOnly(provider, ["provider", "delivery_status", "authority_lane", "source_revision", "observed_at"]) || !safeText(provider.provider, 80) || !isIso(provider.observed_at) || !/^[0-9a-f]{40}$/i.test(provider.source_revision) || !(["LIVE", "PARTIAL", "UNAVAILABLE", "PROOF OWED"] as const).includes(provider.delivery_status) || !(["read", "draft", "auto", "confirm", "prohibited"] as const).includes(provider.authority_lane)) throw new Error("invalid_provider_governance_evidence");
    const key = provider.provider.trim().toLowerCase();
    providerGroups.set(key, [...(providerGroups.get(key) ?? []), provider]);
  });
  const providerGovernance = [...providerGroups.entries()].map(([provider, records]) => {
    const ordered = [...records].sort((left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at));
    const first = ordered[0];
    const conflict = ordered.length > 1 || ordered.some((record) => record.delivery_status !== first.delivery_status || record.authority_lane !== first.authority_lane || record.source_revision !== first.source_revision) || first.source_revision !== input.source_revision;
    const freshness = derivedFreshness(first.observed_at, input.now, 1);
    return {
      provider,
      delivery_status: conflict ? "UNAVAILABLE" as const : first.delivery_status,
      authority_lane: conflict ? "prohibited" as const : first.authority_lane,
      source_revision: first.source_revision,
      observed_at: first.observed_at,
      evidence_verification: conflict || freshness !== "current" ? "UNVERIFIED" as const : "VERIFIED" as const,
      freshness,
      conflicts: conflict ? ["Provider governance evidence conflicts or is not bound to the executing build identity."] : [],
      evidence_class: "integration_registry_governance" as const,
    };
  });
  const providerGaps = providerGovernance.filter((provider) => provider.delivery_status !== "LIVE" || provider.authority_lane !== "read" || provider.evidence_verification !== "VERIFIED" || provider.freshness !== "current" || provider.conflicts.length > 0).map((provider) => `Provider governance gap for ${provider.provider}: delivery ${provider.delivery_status}, authority ${provider.authority_lane}, freshness ${provider.freshness}, evidence ${provider.evidence_verification}.`);
  const externalEvidence = comparisonEvidence(input.external_comparison_evidence, input.now);
  const coverageNow = capabilityManifest.filter(isVerifiedCoverageNow);
  const gaps = capabilityManifest.filter((capability) => capability.delivery_truth !== "LIVE" || capability.tenant_availability !== "available" || capability.eligibility !== "eligible" || capability.evidence_verification !== "VERIFIED" || capability.freshness !== "current" || capability.authority_lane !== "read");
  const phases = [
    { phase: 1, name: "Verified inventory", action: "Read current tenant connections and safely inventory named workflow dependencies; do not change them." },
    { phase: 2, name: "Coverage and gap map", action: "Map each source-system responsibility to verified Paige coverage, prerequisites, unavailable paths, and owners." },
    { phase: 3, name: "Parallel validation", action: "Design a reversible parallel run with success criteria, checkpoints, budget boundaries, and rollback; execution remains unapproved." },
    { phase: 4, name: "Bounded cutover", action: "Request separate scoped approval for each named route, workflow, data class, provider, or communication change, then verify readback." },
    { phase: 5, name: "Source retirement", action: "Only after cutover proof, request a separate approval for named deactivation, archival, disconnection, or account-retirement steps." },
  ];
  const approvalRequirements = [
    { action_class: "n8n workflow state", scope: "Each exact workflow reference and activate/deactivate/archive operation", approval: "Legal owner approval through the canonical Spine path", status: "not_requested" },
    { action_class: "communications routing or sending", scope: "Each channel, sender, audience, message class, timing, and rollback", approval: "Legal owner approval through the canonical Spine path", status: "not_requested" },
    { action_class: "data movement", scope: "Each object class, source, destination, mapping, dry-run result, and rollback", approval: "Legal owner approval through the canonical Spine path", status: "not_requested" },
    { action_class: "provider connection or account retirement", scope: "Each named connection/account plus export, recovery, readback, and stop conditions", approval: "Separate legal owner approval through the canonical Spine path", status: "not_requested" },
  ];
  const notChanged = ["n8n workflow states", "GoHighLevel account or connections", "HubSpot account or connections", "Asana account or connections", "provider routing", "tenant data", "external messages"];
  const verified = [
    "Canonical Spine registry declarations were read from the executing server module.",
    n8nEvidence.status === "available" ? `Tenant-scoped n8n readiness was read at ${input.now}; provider last-success timestamps remain historical evidence.` : "The n8n readiness read was unavailable and was not interpreted as disconnected",
    n8nInventory.workflow_evidence === "current_complete" ? `Complete read-only n8n inventory observed ${n8nInventory.observed_at}` : `n8n workflow inventory state: ${n8nInventory.workflow_evidence}`,
  ];

  return {
    ok: true as const,
    advisor_status: "PROOF OWED" as const,
    migration_execution_status: "UNAVAILABLE" as const,
    intent,
    capability_manifest: capabilityManifest,
    provider_governance: providerGovernance,
    n8n_inventory: n8nInventory,
    sections: [
      { kind: "paige_coverage_now" as const, items: coverageNow },
      { kind: "gaps_and_truth" as const, items: [...gaps, ...providerGaps, ...n8nInventory.unknowns] },
      { kind: "phased_transition" as const, items: phases },
      { kind: "exact_owner_approval" as const, items: approvalRequirements },
    ],
    external_comparison_evidence: externalEvidence,
    external_changes: [] as readonly [],
    receipt: {
      artifact_type: "migration_advisory_response" as const,
      durability: "inline_only" as const,
      request_id: input.request_id,
      plan_id: input.plan_id,
      requested: {
        direction: intent.direction,
        source_systems: intent.source_systems,
        target_state: intent.target_state,
        desired_outcomes: intent.desired_outcomes,
      },
      read: ["Paige Spine capability registry", "caller-scoped n8n readiness", "read-only workflow inventory when available", "supplied canonical provider governance", "dated external comparison evidence"],
      as_of: input.now,
      build_identity: { source_revision: input.source_revision, verification: "UNVERIFIED" as const, note: "The server supplied this build identity; bind it to a deployed release record before a customer-release claim." },
      provider_observations: {
        readiness_read_at: input.now,
        readiness_freshness: n8nInventory.readiness_freshness,
        readiness_observed_at: n8nInventory.readiness_observed_at,
        workflow_inventory_observed_at: n8nInventory.observed_at,
      },
      drafted: "A read-only phased transition advisory plan.",
      external_changes: [] as readonly [],
      verified,
      not_changed: notChanged,
      remaining_gaps: [...intent.ambiguities, ...providerGaps, ...n8nInventory.unknowns],
      required_approvals: approvalRequirements,
      rollback_boundary: "No rollback was needed because this advisory performed no external change. Any later approved phase must define its own checkpoint, rollback or forward-fix, and readback.",
    },
  };
}
