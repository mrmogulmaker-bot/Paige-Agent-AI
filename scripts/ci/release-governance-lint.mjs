#!/usr/bin/env node
/** Structural release-governance guard. It validates wiring and record honesty, not deployment truth. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const POLICY = "docs/doctrine/release-governance-and-customer-update-policy.md";
const SCHEMA = "docs/release-governance/release-record.schema.json";
const MARKER = "RELEASE_GOVERNANCE_POLICY";
const POINTERS = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/PAIGE-MASTER-PROJECT-REFERENCE.md",
  "docs/brain/README.md",
  ".claude/skills/second-brain/SKILL.md",
  "docs/PULL_REQUEST_TEMPLATE.md",
  ".github/PULL_REQUEST_TEMPLATE/ui-delivery.md",
  "docs/evidence/ui-delivery/TEMPLATE.md",
  "docs/guides/how-paige-ui-work-gets-designed-tested-released.md",
  "docs/OPS.md",
];
const CHANNELS = new Set(["development", "preview", "production", "staged"]);
const CHECKS = new Set(["PASS", "FAIL", "UNVERIFIED"]);
const CUSTOMER_STATES = new Set(["LIVE", "PARTIAL", "UNAVAILABLE", "PROOF OWED"]);
const CLASSIFICATIONS = new Set(["internal_only", "patch", "minor_candidate", "major_candidate"]);
const RECORD_STATES = new Set(["DRAFT", "OWNER_DECISION_PENDING", "APPROVED", "PUBLISHED", "CORRECTED", "RETRACTED"]);
const DELIVERY_STATES = new Set(["APPLIED", "NOT_APPLICABLE", "PROOF_OWED", "FAILED"]);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const normalizeSentinel = (value) => String(value ?? "").trim().replace(/[^A-Za-z0-9]+/g, " ").replace(/\s+/g, " ").toLowerCase();
const hasPlaceholder = (value) => /\b(?:todo|tbd|placeholder|replace me|pending|unknown)\b/.test(normalizeSentinel(value));
const isNoValue = (value) => new Set(["none", "n a", "na", "not applicable"]).has(normalizeSentinel(value));
const isUnresolvedValue = (value) => /\b(?:todo|tbd|placeholder|replace me)\b/.test(normalizeSentinel(value)) || new Set(["pending", "unknown", "none", "n a", "na", "not applicable", "proof owed"]).has(normalizeSentinel(value));
const hasNoValueToken = (value) => /\b(?:none|n a|not applicable)\b/.test(normalizeSentinel(value)) || normalizeSentinel(value) === "na";
const hasUnresolvedToken = (value) => hasPlaceholder(value) || hasNoValueToken(value) || /\bproof owed\b/.test(normalizeSentinel(value));
const isUnresolvedDeploymentId = (value) => hasUnresolvedToken(value) || /^(?:https?:\/\/|refs\/heads\/)/i.test(String(value ?? "").trim()) || new Set(["latest", "main", "production", "prod", "current", "head"]).has(normalizeSentinel(value));
const isNoLimitation = (value) => isNoValue(value) || /^no known limitations?$/.test(normalizeSentinel(value));
const isUnresolvedEvidence = (value) => {
  const raw = String(value ?? "").trim();
  const prose = raw
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/(?:^|[\s;])(?:[A-Za-z]:)?[^\s;:]*[\\/]\S+\.[A-Za-z0-9]{1,10}(?:[?#]\S*)?/g, " ")
    .trim();
  if (!prose) return false;
  if (isUnresolvedValue(prose)) return true;
  const normalized = normalizeSentinel(prose);
  const subject = "(?:proof|result|evidence|verification|check|runtime|decision|approval)";
  const unresolved = "(?:pending|unknown|proof owed)";
  return new RegExp(`(?:\\b${subject}\\b.*\\b${unresolved}\\b|\\b${unresolved}\\b.*\\b${subject}\\b)`).test(normalized);
};
const PROOF_SCOPE_KINDS = new Set(["authenticated_workflow", "production_runtime", "provider_capability", "permission", "audience_tier"]);
const PROOF_BLOCKER_KINDS = new Set(["access_unavailable", "credentials_unavailable", "provider_unavailable", "permission_denied", "evidence_not_captured", "production_check_unavailable"]);
const CORRECTABLE_ROOTS = ["classification", "internal_builds", "scope", "affected_audience", "benefits", "limitations", "rollback_recovery", "customer_release_identity", "whats_new"];
const CORRECTABLE_POINTER = new RegExp(`^/(?:${CORRECTABLE_ROOTS.join("|")})(?:/|$)`);
const escapePointerSegment = (value) => String(value).replace(/~/g, "~0").replace(/\//g, "~1");
const readJsonPointer = (value, pointer) => {
  if (!CORRECTABLE_POINTER.test(String(pointer || ""))) return { found: false };
  let current = value;
  for (const rawSegment of pointer.slice(1).split("/")) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/.test(segment) || Number(segment) >= current.length) return { found: false };
      current = current[Number(segment)];
    } else {
      if (current === null || typeof current !== "object" || !Object.hasOwn(current, segment)) return { found: false };
      current = current[segment];
    }
  }
  return { found: true, value: current };
};
const sameJsonValue = (left, right) => isDeepStrictEqual(left, right);
const collectJsonDifferences = (before, after, path, output) => {
  if (sameJsonValue(before, after)) return;
  const beforeObject = before !== null && typeof before === "object";
  const afterObject = after !== null && typeof after === "object";
  const sameContainer = beforeObject && afterObject && Array.isArray(before) === Array.isArray(after);
  if (!sameContainer) {
    output.set(path, { previous_exists: before !== undefined, previous_value: before ?? null, replacement_exists: after !== undefined, replacement_value: after ?? null });
    return;
  }
  const keys = Array.isArray(before)
    ? Array.from({ length: Math.max(before.length, after.length) }, (_, index) => String(index))
    : [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  if (keys.length === 0) {
    output.set(path, { previous_exists: true, previous_value: before, replacement_exists: true, replacement_value: after });
    return;
  }
  for (const key of keys) {
    const beforeExists = Object.hasOwn(before, key);
    const afterExists = Object.hasOwn(after, key);
    if (!beforeExists || !afterExists) {
      output.set(`${path}/${escapePointerSegment(key)}`, { previous_exists: beforeExists, previous_value: beforeExists ? before[key] : null, replacement_exists: afterExists, replacement_value: afterExists ? after[key] : null });
    } else collectJsonDifferences(before[key], after[key], `${path}/${escapePointerSegment(key)}`, output);
  }
};
const correctionDifferences = (before, after) => {
  const output = new Map();
  for (const root of CORRECTABLE_ROOTS) collectJsonDifferences(before?.[root], after?.[root], `/${root}`, output);
  return output;
};
const validContextualReplacement = (path, value) => {
  if (typeof value !== "string" || !isUnresolvedValue(value)) return true;
  if (/^\/whats_new\/status\/(?:0|[1-9]\d*)$/.test(path)) return value === "PROOF OWED";
  if (/^\/internal_builds\/(?:0|[1-9]\d*)\/(?:migration_status|edge_status)\/state$/.test(path)) return value === "PROOF_OWED";
  return false;
};
const RECORD_KEYS = ["schema_version", "record_id", "record_state", "history", "classification", "internal_builds", "scope", "affected_audience", "benefits", "limitations", "rollback_recovery", "customer_release_identity", "whats_new"];
const BUILD_KEYS = ["commit_sha", "deployment_id", "environment", "release_channel", "customer_release_scope", "deployed_at", "staged_rollout", "migration_status", "edge_status", "proof_boundaries", "checks", "evidence"];
const STAGED_KEYS = ["owner_approval", "eligibility_rule", "rollout_amount", "start_condition", "stop_condition", "monitoring_owner", "recovery_path"];
const STAGED_TEXT_KEYS = ["eligibility_rule", "rollout_amount", "start_condition", "stop_condition", "monitoring_owner", "recovery_path"];
const NOTE_KEYS = ["customer_outcome", "what_changed", "who_can_use_it", "owner_action", "status", "known_limitations", "proof_owed", "safe_next_step", "technical_release_reference", "paige_readable_summary"];

export function compileCanonicalReleaseSchema(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function canonicalSchemaFindings(validate, record) {
  if (validate(record)) return [];
  return (validate.errors || []).map((error) => `canonical schema ${error.instancePath || "/"} ${error.message}`);
}

function invokedDirectly() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

function requireEvidenceState(value, label, findings) {
  requireExactObject(value, ["state", "evidence"], label, findings);
  if (!CHECKS.has(value?.state) || !Array.isArray(value?.evidence) || value.evidence.length === 0)
    findings.push(`${label} must include PASS/FAIL/UNVERIFIED and non-empty evidence[]`);
  else if (value.evidence.some((item) => !nonEmpty(item))) findings.push(`${label}.evidence must contain only non-empty strings`);
  else if (value.state === "PASS" && value.evidence.some(isUnresolvedEvidence)) findings.push(`${label}.evidence must contain resolved proof when state is PASS`);
}

function requireExactObject(value, keys, label, findings) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    findings.push(`${label} must be an object`);
    return false;
  }
  const actual = Object.keys(value);
  for (const key of keys) if (!Object.hasOwn(value, key)) findings.push(`${label}.${key} missing`);
  for (const key of actual) if (!keys.includes(key)) findings.push(`${label}.${key} is not allowed`);
  return true;
}

function requireNonEmptyStrings(value, label, findings, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => !nonEmpty(item)))
    findings.push(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array of non-empty strings`);
}

function requireDeliveryState(value, label, findings) {
  requireExactObject(value, ["state", "evidence", "identifiers", "proof_owed"], label, findings);
  if (!DELIVERY_STATES.has(value?.state)) findings.push(`${label}.state invalid`);
  requireNonEmptyStrings(value?.evidence, `${label}.evidence`, findings, value?.state === "NOT_APPLICABLE");
  if (value?.state === "APPLIED" && Array.isArray(value?.evidence) && value.evidence.some(isUnresolvedEvidence)) findings.push(`${label}.evidence must contain resolved proof when state is APPLIED`);
  if (value?.state === "PROOF_OWED" && Array.isArray(value?.evidence) && value.evidence.some(isUnresolvedValue)) findings.push(`${label}.evidence must substantively describe why proof remains owed`);
  requireNonEmptyStrings(value?.identifiers, `${label}.identifiers`, findings, value?.state !== "APPLIED");
  if (value?.state !== "APPLIED" && Array.isArray(value?.identifiers) && value.identifiers.length > 0) findings.push(`${label}.identifiers must be empty unless state is APPLIED`);
  if (value?.state === "APPLIED" && Array.isArray(value?.identifiers)) {
    const pattern = label.endsWith("migration_status") ? /^\d{14}_[A-Za-z0-9_-]+$/ : /^[A-Za-z0-9._-]+@v?[A-Za-z0-9._-]+$/;
    if (value.identifiers.some((identifier) => !pattern.test(identifier) || hasUnresolvedToken(identifier))) findings.push(`${label}.identifiers must contain exact non-placeholder ${label.endsWith("migration_status") ? "migration IDs" : "function@version IDs"}`);
  }
  if (value?.state === "PROOF_OWED") {
    requireExactObject(value.proof_owed, ["boundary", "excluded_from_live_claim"], `${label}.proof_owed`, findings);
    for (const field of ["boundary", "excluded_from_live_claim"]) {
      const detail = String(value.proof_owed?.[field] || "").trim();
      if (!nonEmpty(detail) || isUnresolvedValue(detail)) findings.push(`${label}.proof_owed.${field} must precisely name the owed boundary`);
    }
  } else if (value?.proof_owed !== null) findings.push(`${label}.proof_owed must be null unless state is PROOF_OWED`);
}

function requireApproval(value, label, expectedScope, allowedStatuses, findings) {
  if (!requireExactObject(value, ["approval_id", "scope", "status", "reference"], label, findings)) return;
  const idPrefix = expectedScope === "staged_rollout" ? "staged-rollout-" : "customer-publication-";
  if (!new RegExp(`^${idPrefix}[A-Za-z0-9._:-]+$`).test(String(value.approval_id || ""))) findings.push(`${label}.approval_id must identify the ${expectedScope} decision`);
  if (value.scope !== expectedScope) findings.push(`${label}.scope must be ${expectedScope}`);
  if (!allowedStatuses.includes(value.status)) findings.push(`${label}.status invalid`);
  if (!nonEmpty(value.reference)) findings.push(`${label}.reference missing`);
  else if (value.status === "APPROVED" && hasUnresolvedToken(value.reference)) findings.push(`${label}.reference must identify a completed approval decision`);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validDateTime(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(String(value || ""));
  if (!match || !validDate(match[1])) return false;
  const [, , hour, minute, second, , offsetHour, offsetMinute] = match;
  return Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59 && (!offsetHour || (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59));
}

function compareRecordHistory(baseRecords, currentRecords) {
  const findings = [];
  for (const [name, original] of baseRecords) {
    if (!currentRecords.has(name)) findings.push(`${name} was deleted; release records are additive and immutable`);
    else if (currentRecords.get(name).replace(/\r\n/g, "\n") !== original.replace(/\r\n/g, "\n")) findings.push(`${name} was rewritten; add a correction record instead`);
  }
  return findings;
}

function validateRecordHistory(base, recordsDir) {
  if (!base) return [];
  try {
    const names = execFileSync("git", ["ls-tree", "-r", "--name-only", base, "--", recordsDir], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
    const before = new Map(names.map((name) => [name, execFileSync("git", ["show", `${base}:${name}`], { encoding: "utf8" })]));
    const current = new Map(names.filter((name) => fs.existsSync(name)).map((name) => [name, fs.readFileSync(name, "utf8")]));
    return compareRecordHistory(before, current);
  } catch (error) {
    return [`could not compare release-record history with ${base}: ${error?.message ?? error}`];
  }
}

function listJsonFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(file);
    }
  }
  return files.sort();
}

export function validateReleaseRecord(record) {
  const findings = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["record is not an object"];
  requireExactObject(record, RECORD_KEYS, "record", findings);
  if (record.schema_version !== "1.0.0") findings.push("schema_version must be 1.0.0");
  if (!nonEmpty(record.record_id)) findings.push("record_id missing");
  if (!RECORD_STATES.has(record.record_state)) findings.push("record_state invalid");
  if (["CORRECTED", "RETRACTED"].includes(record.record_state)) {
    requireExactObject(record.history, ["supersedes_record_id", "reason", "corrected_values"], "history", findings);
    if (!nonEmpty(record.history?.supersedes_record_id) || !nonEmpty(record.history?.reason)) findings.push("corrected/retracted record history requires supersedes_record_id and reason");
    else if (hasUnresolvedToken(record.history.reason)) findings.push("corrected/retracted record history.reason must be resolved prose; record former placeholders in corrected_values");
    if (!Array.isArray(record.history?.corrected_values)) findings.push("corrected/retracted record history.corrected_values must be an array");
    else {
      if (record.record_state === "CORRECTED" && record.history.corrected_values.length === 0) findings.push("CORRECTED record history.corrected_values must contain at least one changed field");
      if (record.record_state === "RETRACTED" && record.history.corrected_values.length !== 0) findings.push("RETRACTED record history.corrected_values must be empty; use CORRECTED for field repairs");
      record.history.corrected_values.forEach((item, index) => {
      const label = `history.corrected_values[${index}]`;
      requireExactObject(item, ["field_path", "previous_exists", "previous_value", "replacement_exists", "replacement_value"], label, findings);
        if (!CORRECTABLE_POINTER.test(String(item?.field_path || "")) || !/^\/(?:[^~/]|~[01])+(?:\/(?:[^~/]|~[01])+)*$/.test(String(item?.field_path || ""))) findings.push(`${label}.field_path must be a JSON Pointer to a correctable release field`);
        if (typeof item?.previous_exists !== "boolean" || typeof item?.replacement_exists !== "boolean" || (!item?.previous_exists && !item?.replacement_exists)) findings.push(`${label} must declare at least one existing side`);
        if (!item?.previous_exists && item?.previous_value !== null) findings.push(`${label}.previous_value must be null when previous_exists is false`);
        if (!item?.replacement_exists && item?.replacement_value !== null) findings.push(`${label}.replacement_value must be null when replacement_exists is false`);
        if (item?.replacement_exists && !validContextualReplacement(String(item?.field_path || ""), item?.replacement_value)) findings.push(`${label}.replacement_value is unresolved for this field`);
      });
    }
  } else if (record.history !== null) findings.push("history must be null unless record_state is CORRECTED or RETRACTED");
  if (!CLASSIFICATIONS.has(record.classification)) findings.push("classification invalid");

  if (!Array.isArray(record.internal_builds) || record.internal_builds.length === 0) {
    findings.push("internal_builds must contain at least one exact build identity");
  } else {
    record.internal_builds.forEach((build, index) => {
      const label = `internal_builds[${index}]`;
      requireExactObject(build, BUILD_KEYS, label, findings);
      if (!/^[0-9a-f]{40}$/i.test(String(build?.commit_sha || ""))) findings.push(`${label}.commit_sha must be an exact 40-character SHA`);
      if (!nonEmpty(build?.deployment_id)) findings.push(`${label}.deployment_id missing`);
      else if (build.deployment_id !== "NOT_APPLICABLE" && isUnresolvedDeploymentId(build.deployment_id)) findings.push(`${label}.deployment_id must not contain an anticipated or placeholder token`);
      if (!["local", "development", "preview", "production"].includes(build?.environment)) findings.push(`${label}.environment invalid`);
      if (!CHANNELS.has(build?.release_channel)) findings.push(`${label}.release_channel invalid`);
      if (!["referenced", "supporting"].includes(build?.customer_release_scope)) findings.push(`${label}.customer_release_scope invalid`);
      if (build?.release_channel === "development" && !["local", "development"].includes(build.environment)) findings.push(`${label} development channel requires local/development environment`);
      if (build?.release_channel === "preview" && build.environment !== "preview") findings.push(`${label} preview channel requires preview environment`);
      if (["production", "staged"].includes(build?.release_channel) && (build.environment !== "production" || isUnresolvedDeploymentId(build.deployment_id))) findings.push(`${label} production/staged channel requires production environment and exact deployment ID`);
      if (!validDateTime(build?.deployed_at)) findings.push(`${label}.deployed_at must be an ISO date-time`);
      if (build?.release_channel === "staged") {
        if (requireExactObject(build?.staged_rollout, STAGED_KEYS, `${label}.staged_rollout`, findings)) {
          for (const field of STAGED_TEXT_KEYS) {
            const value = String(build.staged_rollout[field] || "").trim();
            if (!nonEmpty(value) || hasPlaceholder(value) || isNoValue(value) || /\bproof owed\b/.test(normalizeSentinel(value))) findings.push(`${label}.staged_rollout.${field} must be a completed non-placeholder value`);
          }
          requireApproval(build.staged_rollout.owner_approval, `${label}.staged_rollout.owner_approval`, "staged_rollout", ["APPROVED"], findings);
          if (record.customer_release_identity && build.staged_rollout.owner_approval?.reference === record.customer_release_identity.owner_approval?.reference)
            findings.push(`${label}.staged_rollout.owner_approval.reference must be distinct from customer publication approval`);
        }
      } else if (build?.staged_rollout !== null) findings.push(`${label}.staged_rollout must be null outside the staged channel`);
      for (const field of ["migration_status", "edge_status"]) requireDeliveryState(build?.[field], `${label}.${field}`, findings);
      if (!Array.isArray(build?.proof_boundaries)) findings.push(`${label}.proof_boundaries must be an array`);
      else build.proof_boundaries.forEach((boundary, boundaryIndex) => {
        const boundaryLabel = `${label}.proof_boundaries[${boundaryIndex}]`;
        requireExactObject(boundary, ["scope", "blocker", "boundary", "excluded_from_live_claim", "evidence"], boundaryLabel, findings);
        requireExactObject(boundary?.scope, ["kind", "reference"], `${boundaryLabel}.scope`, findings);
        if (!PROOF_SCOPE_KINDS.has(boundary?.scope?.kind)) findings.push(`${boundaryLabel}.scope.kind invalid`);
        if (!nonEmpty(boundary?.scope?.reference) || hasUnresolvedToken(boundary?.scope?.reference)) findings.push(`${boundaryLabel}.scope.reference must name the affected scope`);
        requireExactObject(boundary?.blocker, ["kind", "detail"], `${boundaryLabel}.blocker`, findings);
        if (!PROOF_BLOCKER_KINDS.has(boundary?.blocker?.kind)) findings.push(`${boundaryLabel}.blocker.kind invalid`);
        if (!nonEmpty(boundary?.blocker?.detail) || hasUnresolvedToken(boundary?.blocker?.detail)) findings.push(`${boundaryLabel}.blocker.detail must name the substantive blocker`);
        for (const field of ["boundary", "excluded_from_live_claim"]) {
          const detail = String(boundary?.[field] || "").trim();
          if (!nonEmpty(detail) || isUnresolvedValue(detail)) findings.push(`${boundaryLabel}.${field} must precisely name the owed boundary`);
        }
        requireNonEmptyStrings(boundary?.evidence, `${boundaryLabel}.evidence`, findings);
        if (Array.isArray(boundary?.evidence) && boundary.evidence.some(isUnresolvedValue)) findings.push(`${boundaryLabel}.evidence must substantively describe why proof remains owed`);
      });
      requireExactObject(build?.checks, ["ci", "security", "production_checks"], `${label}.checks`, findings);
      for (const field of ["ci", "security", "production_checks"])
        requireEvidenceState(build?.checks?.[field], `${label}.checks.${field}`, findings);
      requireNonEmptyStrings(build?.evidence, `${label}.evidence`, findings);
      if (Array.isArray(build?.evidence) && build.evidence.some(isUnresolvedEvidence)) findings.push(`${label}.evidence must contain a substantive link or reproducible reference`);
    });
    const deploymentIds = record.internal_builds.map((build) => build?.deployment_id).filter((id) => id !== "NOT_APPLICABLE");
    if (new Set(deploymentIds).size !== deploymentIds.length) findings.push("actual internal_builds deployment_id values must be unique");
  }

  for (const field of ["scope", "affected_audience", "benefits", "limitations"]) requireNonEmptyStrings(record[field], field, findings);
  requireExactObject(record.rollback_recovery, ["position", "reference"], "rollback_recovery", findings);
  if (!nonEmpty(record.rollback_recovery?.position) || !nonEmpty(record.rollback_recovery?.reference)) findings.push("rollback_recovery missing position/reference");

  const customer = record.customer_release_identity;
  const customerPublicationRecord = record.record_state === "PUBLISHED" || (record.record_state === "CORRECTED" && customer !== null);
  if (customer !== null) {
    requireExactObject(customer, ["version", "release_name", "date", "owner_approval"], "customer_release_identity", findings);
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(String(customer?.version || ""))) findings.push("customer version must be semantic x.y.z");
    if (!nonEmpty(customer?.release_name) || !validDate(customer?.date)) findings.push("customer identity missing valid name/date");
    requireApproval(customer?.owner_approval, "customer_release_identity.owner_approval", "customer_publication", ["PENDING", "APPROVED"], findings);
    if (record.classification === "patch" && !/^0\.(0|[1-9]\d*)\.[1-9]\d*$/.test(String(customer.version))) findings.push("patch customer version must be 0.x.y with y greater than zero during Solo Preview");
    if (record.classification === "minor_candidate" && !/^0\.[1-9]\d*\.0$/.test(String(customer.version))) findings.push("minor_candidate version must be 0.x.0 during Solo Preview");
    if (record.classification === "major_candidate" && !/^[1-9]\d*\.0\.0$/.test(String(customer.version))) findings.push("major_candidate version must be x.0.0");
    const note = record.whats_new;
    if (!note || typeof note !== "object") findings.push("whats_new required with customer identity");
    else {
      requireExactObject(note, NOTE_KEYS, "whats_new", findings);
      for (const field of ["customer_outcome", "what_changed", "who_can_use_it", "owner_action", "known_limitations", "safe_next_step", "paige_readable_summary"])
        if (!nonEmpty(note[field])) findings.push(`whats_new.${field} missing`);
      if (!Array.isArray(note.status) || note.status.length === 0 || note.status.some((state) => !CUSTOMER_STATES.has(state))) findings.push("whats_new.status invalid");
      else if (new Set(note.status).size !== note.status.length) findings.push("whats_new.status must be unique");
      else if (note.status.includes("PARTIAL") && (isNoLimitation(note.known_limitations) || !Array.isArray(record.limitations) || !record.limitations.some((item) => nonEmpty(item) && !isNoLimitation(item)))) findings.push("PARTIAL status requires a substantive known limitation");
      requireExactObject(note.proof_owed, ["visibility", "source"], "whats_new.proof_owed", findings);
      if (note.proof_owed?.visibility !== "customer_and_internal" || note.proof_owed?.source !== "referenced_builds.proof_boundaries_or_delivery_status.proof_owed") findings.push("whats_new.proof_owed must resolve to build-bound proof facts");
      requireExactObject(note.technical_release_reference, ["visibility", "source"], "whats_new.technical_release_reference", findings);
      if (note.technical_release_reference?.visibility !== "internal_only" || note.technical_release_reference?.source !== "internal_builds.customer_release_scope=referenced")
        findings.push("technical_release_reference must resolve internally to builds marked customer_release_scope referenced");
    }
  } else if (record.whats_new !== null) {
    findings.push("whats_new must be null when no customer release identity exists");
  }
  if (record.classification === "internal_only" && (customer !== null || record.whats_new !== null))
    findings.push("internal_only records must not carry a customer release identity or What's New note");
  const referencedBuilds = (record.internal_builds || []).filter((build) => build?.customer_release_scope === "referenced");
  const scopedBuildIds = new Set(referencedBuilds.map((build) => build.deployment_id));
  if (customer === null && scopedBuildIds.size > 0) findings.push("records without a customer identity must mark every internal build as supporting");
  if (customer !== null && scopedBuildIds.size === 0) findings.push("customer release identity requires at least one internal build marked customer_release_scope referenced");
  if (customer !== null) {
    const hasOwedProof = referencedBuilds.some((build) => [build?.migration_status?.state, build?.edge_status?.state].includes("PROOF_OWED") || (Array.isArray(build?.proof_boundaries) && build.proof_boundaries.length > 0));
    if (hasOwedProof && !record.whats_new?.status?.includes("PROOF OWED")) findings.push("Referenced PROOF_OWED delivery state must be disclosed as PROOF OWED in the customer What's New status");
    if (record.whats_new?.status?.includes("PROOF OWED") && !hasOwedProof) findings.push("Customer PROOF OWED status requires an exact referenced build boundary");
  }
  if (["minor_candidate", "major_candidate"].includes(record.classification) && customer === null)
    findings.push(`${record.classification} requires a customer release identity`);
  if ((record.record_state === "APPROVED" || customerPublicationRecord) && customer !== null) {
    if (customer?.owner_approval?.status !== "APPROVED") findings.push(`${record.record_state} customer release requires an APPROVED customer-publication decision`);
    for (const [index, build] of (record.internal_builds || []).entries()) {
      if (build?.customer_release_scope !== "referenced") continue;
      for (const field of ["ci", "security", "production_checks"])
        if (build?.checks?.[field]?.state !== "PASS") findings.push(`${record.record_state} release requires internal_builds[${index}].checks.${field}.state PASS`);
    }
  }
  if (customerPublicationRecord) {
    if (customer === null) findings.push("PUBLISHED requires a customer release identity");
    if (hasUnresolvedToken(customer?.release_name)) findings.push("PUBLISHED customer release name must be resolved");
    for (const field of ["scope", "affected_audience", "benefits"])
      if (record[field]?.some(hasUnresolvedToken)) findings.push(`PUBLISHED ${field} must contain substantive customer facts`);
    if (record.limitations?.some(hasPlaceholder)) findings.push("PUBLISHED limitations must contain resolved customer facts");
    for (const field of ["position", "reference"])
      if (hasUnresolvedToken(record.rollback_recovery?.[field])) findings.push(`PUBLISHED rollback_recovery.${field} must be resolved`);

    if (referencedBuilds.some((build) => build?.evidence?.some(isUnresolvedEvidence))) findings.push("PUBLISHED referenced builds must contain resolved build evidence");
    if (referencedBuilds.length === 0 || referencedBuilds.some((build) => !["production", "staged"].includes(build?.release_channel) || build.deployment_id === "NOT_APPLICABLE"))
      findings.push("PUBLISHED technical references must resolve only to deployed production or staged builds");
    if (referencedBuilds.some((build) => [build?.migration_status?.state, build?.edge_status?.state].includes("FAILED")))
      findings.push("PUBLISHED technical references must not include FAILED migration or edge delivery state");

    for (const field of ["customer_outcome", "what_changed", "who_can_use_it", "owner_action", "known_limitations", "safe_next_step", "paige_readable_summary"])
      if (hasPlaceholder(record.whats_new?.[field])) findings.push(`PUBLISHED whats_new.${field} must contain resolved customer copy`);
    for (const field of ["customer_outcome", "what_changed", "who_can_use_it", "safe_next_step", "paige_readable_summary"])
      if (hasUnresolvedToken(record.whats_new?.[field])) findings.push(`PUBLISHED whats_new.${field} must contain substantive customer copy`);
  }
  return findings;
}

export function validateReleaseRecordSet(records) {
  const findings = [];
  const byId = new Map();
  for (const record of records) {
    if (!nonEmpty(record?.record_id)) continue;
    if (byId.has(record.record_id)) findings.push(`record_id ${record.record_id} is duplicated`);
    else byId.set(record.record_id, record);
  }
  for (const record of records) {
    if (!["CORRECTED", "RETRACTED"].includes(record?.record_state)) continue;
    const target = record.history?.supersedes_record_id;
    if (!nonEmpty(target)) continue;
    if (record.record_state === "RETRACTED" && (record.history?.corrected_values || []).length !== 0) findings.push(`${record.record_id} RETRACTED history.corrected_values must be empty; use CORRECTED for field repairs`);
    if (target === record.record_id) findings.push(`${record.record_id} history must not supersede itself`);
    else if (!byId.has(target)) findings.push(`${record.record_id} history target ${target} does not resolve to an existing release record`);
    else {
      const predecessor = byId.get(target);
      if (
        record.record_state === "CORRECTED" &&
        (predecessor.record_state === "PUBLISHED" || predecessor.customer_release_identity !== null) &&
        record.customer_release_identity === null
      ) findings.push(`${record.record_id} corrects a customer-facing record and must preserve its customer release identity; use RETRACTED to withdraw it`);
      if (record.record_state === "CORRECTED") {
        const expected = correctionDifferences(predecessor, record);
        const declared = new Map();
        for (const [index, item] of (record.history?.corrected_values || []).entries()) {
          const label = `${record.record_id} history.corrected_values[${index}]`;
          const pointer = String(item?.field_path || "");
          if (declared.has(pointer)) findings.push(`${label}.field_path duplicates another correction entry`);
          else declared.set(pointer, item);
          const before = readJsonPointer(predecessor, pointer);
          const after = readJsonPointer(record, pointer);
          if (before.found !== item?.previous_exists) findings.push(`${label}.previous_exists does not match predecessor`);
          if (after.found !== item?.replacement_exists) findings.push(`${label}.replacement_exists does not match correction record`);
          if (before.found && !sameJsonValue(before.value, item?.previous_value)) findings.push(`${label}.previous_value does not match predecessor`);
          if (after.found && !sameJsonValue(after.value, item?.replacement_value)) findings.push(`${label}.replacement_value does not match correction record`);
          if (item?.replacement_exists && !validContextualReplacement(pointer, item.replacement_value)) findings.push(`${label}.replacement_value must be resolved, except PROOF OWED at an approved status path`);
          if (before.found && after.found && sameJsonValue(before.value, after.value)) findings.push(`${label}.field_path does not identify a changed value`);
        }
        for (const [pointer, difference] of expected) {
          const item = declared.get(pointer);
          if (!item) findings.push(`${record.record_id} history.corrected_values missing changed field ${pointer}`);
          else if (!sameJsonValue(difference, { previous_exists: item.previous_exists, previous_value: item.previous_value, replacement_exists: item.replacement_exists, replacement_value: item.replacement_value })) findings.push(`${record.record_id} history.corrected_values does not exactly describe ${pointer}`);
        }
        for (const pointer of declared.keys()) if (!expected.has(pointer)) findings.push(`${record.record_id} history.corrected_values declares unchanged or invalid field ${pointer}`);
      }
    }
  }
  for (const record of records) {
    const seen = new Set();
    let current = record;
    while (["CORRECTED", "RETRACTED"].includes(current?.record_state) && nonEmpty(current.history?.supersedes_record_id)) {
      if (seen.has(current.record_id)) {
        findings.push(`${record.record_id} history contains a correction cycle`);
        break;
      }
      seen.add(current.record_id);
      current = byId.get(current.history.supersedes_record_id);
      if (!current) break;
    }
  }
  return [...new Set(findings)];
}

export function validateRepository() {
  const findings = [];
  for (const file of [POLICY, SCHEMA, ...POINTERS]) if (!fs.existsSync(file)) findings.push(`${file} missing`);
  for (const file of POINTERS)
    if (fs.existsSync(file) && !fs.readFileSync(file, "utf8").includes(MARKER)) findings.push(`${file} missing ${MARKER} pointer`);
  if (fs.existsSync(POLICY)) {
    const policy = fs.readFileSync(POLICY, "utf8");
    for (const phrase of ["Internal build identity", "Release channel", "Customer release identity", "Paige Solo Preview", "PROOF OWED", "Required What's New format", "Future Updates UI handoff"])
      if (!policy.includes(phrase)) findings.push(`${POLICY} missing '${phrase}'`);
  }
  let validateCanonicalSchema = null;
  if (fs.existsSync(SCHEMA)) {
    try {
      const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
      if (schema.$id !== "https://paige.ai/schemas/release-record.schema.json") findings.push(`${SCHEMA} has wrong $id`);
      for (const key of ["internal_builds", "customer_release_identity", "whats_new"])
        if (!schema.properties?.[key]) findings.push(`${SCHEMA} missing ${key}`);
      validateCanonicalSchema = compileCanonicalReleaseSchema(schema);
    } catch (error) {
      findings.push(`${SCHEMA} invalid or not compilable: ${error?.message ?? error}`);
    }
  }
  const recordsDir = "docs/release-governance/records";
  findings.push(...validateRecordHistory(process.env.RELEASE_GOVERNANCE_BASE, recordsDir));
  if (fs.existsSync(recordsDir)) {
    const records = [];
    for (const file of listJsonFiles(recordsDir)) {
      try {
        const record = JSON.parse(fs.readFileSync(file, "utf8"));
        records.push(record);
        if (validateCanonicalSchema) for (const finding of canonicalSchemaFindings(validateCanonicalSchema, record)) findings.push(`${file}: ${finding}`);
        for (const finding of validateReleaseRecord(record)) findings.push(`${file}: ${finding}`);
      } catch (error) {
        findings.push(`${file} invalid JSON: ${error?.message ?? error}`);
      }
    }
    for (const finding of validateReleaseRecordSet(records)) findings.push(`${recordsDir}: ${finding}`);
  }
  return findings;
}

if (invokedDirectly() && process.argv.includes("--self-test")) {
  const customerApprovalPending = { approval_id: "customer-publication-decision-pending", scope: "customer_publication", status: "PENDING", reference: "owner-decision-pending" };
  const customerApproval = { approval_id: "customer-publication-owner-message-123", scope: "customer_publication", status: "APPROVED", reference: "owner-message-123" };
  const stagedApproval = { approval_id: "staged-rollout-owner-message-456", scope: "staged_rollout", status: "APPROVED", reference: "owner-message-456" };
  const build = {
    commit_sha: "a".repeat(40), deployment_id: "dpl_123", environment: "production", release_channel: "production", customer_release_scope: "referenced", deployed_at: "2026-09-06T20:00:00Z", staged_rollout: null,
    migration_status: { state: "NOT_APPLICABLE", evidence: [], identifiers: [], proof_owed: null }, edge_status: { state: "NOT_APPLICABLE", evidence: [], identifiers: [], proof_owed: null }, proof_boundaries: [],
    checks: { ci: { state: "PASS", evidence: ["run"] }, security: { state: "PASS", evidence: ["run"] }, production_checks: { state: "PASS", evidence: ["run"] } }, evidence: ["proof"],
  };
  const valid = {
    schema_version: "1.0.0", record_id: "release-0.1.0", record_state: "OWNER_DECISION_PENDING", history: null, classification: "minor_candidate", internal_builds: [build],
    scope: ["outcome"], affected_audience: ["solo"], benefits: ["benefit"], limitations: ["limit"], rollback_recovery: { position: "forward fix", reference: "runbook" },
    customer_release_identity: { version: "0.1.0", release_name: "Paige Solo Preview", date: "2026-09-06", owner_approval: customerApprovalPending },
    whats_new: { customer_outcome: "Outcome", what_changed: "Change", who_can_use_it: "Solo", owner_action: "None", status: ["PARTIAL"], known_limitations: "Limit", proof_owed: { visibility: "customer_and_internal", source: "referenced_builds.proof_boundaries_or_delivery_status.proof_owed" }, safe_next_step: "Next", technical_release_reference: { visibility: "internal_only", source: "internal_builds.customer_release_scope=referenced" }, paige_readable_summary: "Summary" },
  };
  const internal = { ...valid, classification: "internal_only", internal_builds: [{ ...build, customer_release_scope: "supporting" }], customer_release_identity: null, whats_new: null };
  const cases = [
    ["valid customer candidate", valid, false],
    ["valid internal-only record", internal, false],
    ["rejects referenced build without customer identity", { ...internal, classification: "patch", internal_builds: [{ ...build, customer_release_scope: "referenced" }] }, true],
    ["rejects customer identity on internal-only record", { ...valid, classification: "internal_only", record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } }, true],
    ["rejects short SHA", { ...valid, internal_builds: [{ ...build, commit_sha: "abc" }] }, true],
    ["rejects unapproved version text", { ...valid, customer_release_identity: { ...valid.customer_release_identity, version: "vNext" } }, true],
    ["rejects invented status", { ...valid, whats_new: { ...valid.whats_new, status: ["SHIPPED"] } }, true],
    ["rejects exposed technical reference", { ...valid, whats_new: { ...valid.whats_new, technical_release_reference: { visibility: "customer", source: "internal_builds.customer_release_scope=referenced" } } }, true],
    ["rejects published release with pending approval", { ...valid, record_state: "PUBLISHED" }, true],
    ["rejects published release without green production checks", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, checks: { ...build.checks, production_checks: { state: "UNVERIFIED", evidence: ["not driven"] } } }] }, true],
    ["rejects published development-only release", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, environment: "development", release_channel: "development", deployment_id: "NOT_APPLICABLE" }] }, true],
    ["rejects published placeholder deployment identifier", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, deployment_id: "TODO-deployment" }] }, true],
    ["rejects pending deployment identifier", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, deployment_id: "PENDING_DEPLOYMENT" }] }, true],
    ["rejects symbolic latest deployment identifier", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, deployment_id: "latest" }] }, true],
    ["rejects symbolic main deployment identifier", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, deployment_id: "main" }] }, true],
    ["rejects deployment URL as the identifier", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, deployment_id: "https://example.vercel.app" }] }, true],
    ["rejects free-form technical build list", { ...valid, whats_new: { ...valid.whats_new, technical_release_reference: { visibility: "internal_only", build_ids: ["dpl_fake"] } } }, true],
    ["rejects published reference to development when another production build exists", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, customer_release_scope: "supporting" }, { ...build, commit_sha: "b".repeat(40), deployment_id: "dev_123", environment: "development", release_channel: "development" }] }, true],
    ["rejects staged build without rollout metadata", { ...valid, internal_builds: [{ ...build, release_channel: "staged", staged_rollout: null }] }, true],
    ["accepts staged build with rollout metadata", { ...valid, internal_builds: [{ ...build, release_channel: "staged", staged_rollout: { owner_approval: stagedApproval, eligibility_rule: "named cohort", rollout_amount: "10%", start_condition: "owner approval", stop_condition: "error budget exceeded", monitoring_owner: "release owner", recovery_path: "disable cohort" } }] }, false],
    ["rejects staged build without rollout approval", { ...valid, internal_builds: [{ ...build, release_channel: "staged", staged_rollout: { eligibility_rule: "named cohort", rollout_amount: "10%", start_condition: "owner approval", stop_condition: "error budget exceeded", monitoring_owner: "release owner", recovery_path: "disable cohort" } }] }, true],
    ["rejects pending staged rollout approval", { ...valid, internal_builds: [{ ...build, release_channel: "staged", staged_rollout: { owner_approval: { ...stagedApproval, status: "PENDING" }, eligibility_rule: "named cohort", rollout_amount: "10%", start_condition: "owner approval", stop_condition: "error budget exceeded", monitoring_owner: "release owner", recovery_path: "disable cohort" } }] }, true],
    ["rejects placeholder approved publication reference", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: { ...customerApproval, reference: "pending" } } }, true],
    ["rejects placeholder staged rollout metadata", { ...valid, internal_builds: [{ ...build, release_channel: "staged", staged_rollout: { owner_approval: stagedApproval, eligibility_rule: "TBD", rollout_amount: "pending", start_condition: "TODO", stop_condition: "unknown", monitoring_owner: "none", recovery_path: "N/A" } }] }, true],
    ["rejects staged approval reused for publication", { ...valid, customer_release_identity: { ...valid.customer_release_identity, owner_approval: { ...customerApproval, reference: stagedApproval.reference } }, internal_builds: [{ ...build, release_channel: "staged", staged_rollout: { owner_approval: stagedApproval, eligibility_rule: "named cohort", rollout_amount: "10%", start_condition: "owner approval", stop_condition: "error budget exceeded", monitoring_owner: "release owner", recovery_path: "disable cohort" } }] }, true],
    ["rejects applied migration without identifiers", { ...valid, internal_builds: [{ ...build, migration_status: { state: "APPLIED", evidence: ["migration applied"], identifiers: [], proof_owed: null } }] }, true],
    ["rejects generic APPLIED identifiers", { ...valid, internal_builds: [{ ...build, migration_status: { state: "APPLIED", evidence: ["done"], identifiers: ["done"], proof_owed: null } }] }, true],
    ["rejects placeholder-shaped APPLIED migration identifier", { ...valid, internal_builds: [{ ...build, migration_status: { state: "APPLIED", evidence: ["migration log"], identifiers: ["20260907000001_TODO"], proof_owed: null } }] }, true],
    ["rejects placeholder-shaped APPLIED edge identifier", { ...valid, internal_builds: [{ ...build, edge_status: { state: "APPLIED", evidence: ["function deployment"], identifiers: ["TODO@v1"], proof_owed: null } }] }, true],
    ["accepts exact APPLIED identifiers", { ...valid, internal_builds: [{ ...build, migration_status: { state: "APPLIED", evidence: ["migration log"], identifiers: ["20260907000001_example"], proof_owed: null }, edge_status: { state: "APPLIED", evidence: ["function deployment"], identifiers: ["paige-example@v3"], proof_owed: null } }] }, false],
    ["rejects schema-forbidden extra property", { ...valid, invented: true }, true],
    ["rejects invalid date-time", { ...valid, internal_builds: [{ ...build, deployed_at: "not-a-date" }] }, true],
    ["rejects normalized invalid calendar date-time", { ...valid, internal_builds: [{ ...build, deployed_at: "2026-02-30T20:00:00Z" }] }, true],
    ["rejects production channel in development environment", { ...valid, internal_builds: [{ ...build, environment: "development" }] }, true],
    ["accepts unreferenced preview with unverified production check", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [build, { ...build, commit_sha: "b".repeat(40), deployment_id: "preview_123", environment: "preview", release_channel: "preview", customer_release_scope: "supporting", checks: { ...build.checks, production_checks: { state: "UNVERIFIED", evidence: ["preview only"] } } }] }, false],
    ["rejects technical reference marked only supporting", { ...valid, internal_builds: [{ ...build, customer_release_scope: "supporting" }] }, true],
    ["rejects minor version with patch component", { ...valid, customer_release_identity: { ...valid.customer_release_identity, version: "0.1.7" } }, true],
    ["rejects major version with minor component", { ...valid, classification: "major_candidate", customer_release_identity: { ...valid.customer_release_identity, version: "2.3.0" } }, true],
    ["rejects duplicate deployment identifiers", { ...valid, internal_builds: [build, { ...build, commit_sha: "b".repeat(40) }] }, true],
    ["accepts repeated NOT_APPLICABLE for non-deployed history", { ...internal, internal_builds: [{ ...build, commit_sha: "b".repeat(40), deployment_id: "NOT_APPLICABLE", environment: "development", release_channel: "development", customer_release_scope: "supporting" }, { ...build, commit_sha: "c".repeat(40), deployment_id: "NOT_APPLICABLE", environment: "development", release_channel: "development", customer_release_scope: "supporting" }] }, false],
    ["rejects published failed migration state", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, migration_status: { state: "FAILED", evidence: ["migration 202609060001 failed"], identifiers: [], proof_owed: null } }] }, true],
    ["rejects undisclosed referenced proof owed", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, edge_status: { state: "PROOF_OWED", evidence: ["authenticated proof pending"], identifiers: [], proof_owed: { boundary: "Authenticated edge interaction proof is pending", excluded_from_live_claim: "Edge-backed authenticated interaction" } } }], whats_new: { ...valid.whats_new, status: ["LIVE"] } }, true],
    ["rejects undisclosed referenced proof owed in an owner-decision candidate", { ...valid, internal_builds: [{ ...build, edge_status: { state: "PROOF_OWED", evidence: ["authenticated proof pending"], identifiers: [], proof_owed: { boundary: "Authenticated edge interaction proof is pending", excluded_from_live_claim: "Edge-backed authenticated interaction" } } }], whats_new: { ...valid.whats_new, status: ["LIVE"] } }, true],
    ["accepts exact proof-owed boundary excluded from LIVE", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, edge_status: { state: "PROOF_OWED", evidence: ["authenticated proof pending"], identifiers: [], proof_owed: { boundary: "Authenticated edge interaction proof is pending", excluded_from_live_claim: "Edge-backed authenticated interaction" } } }], whats_new: { ...valid.whats_new, status: ["PARTIAL", "PROOF OWED"], proof_owed: { visibility: "customer_and_internal", source: "referenced_builds.proof_boundaries_or_delivery_status.proof_owed" } } }, false],
    ["accepts authenticated proof owed outside migration and edge delivery", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, proof_boundaries: [{ scope: { kind: "authenticated_workflow", reference: "Authenticated owner workspace workflow" }, blocker: { kind: "access_unavailable", detail: "Production account access was unavailable during verification" }, boundary: "Authenticated owner workflow proof was not completed for this deployment", excluded_from_live_claim: "Authenticated owner workflow", evidence: ["Production account access was unavailable during verification"] }] }], whats_new: { ...valid.whats_new, status: ["PARTIAL", "PROOF OWED"], known_limitations: "Authenticated owner workflow remains outside the live claim" } }, false],
    ["rejects undisclosed authenticated proof boundary", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, proof_boundaries: [{ scope: { kind: "authenticated_workflow", reference: "Authenticated owner workspace workflow" }, blocker: { kind: "access_unavailable", detail: "Production account access was unavailable during verification" }, boundary: "Authenticated owner workflow proof was not completed for this deployment", excluded_from_live_claim: "Authenticated owner workflow", evidence: ["Production account access was unavailable during verification"] }] }], whats_new: { ...valid.whats_new, status: ["LIVE"] } }, true],
    ["rejects placeholder general proof boundary", { ...valid, internal_builds: [{ ...build, proof_boundaries: [{ scope: { kind: "authenticated_workflow", reference: "TODO" }, blocker: { kind: "access_unavailable", detail: "pending" }, boundary: "TODO", excluded_from_live_claim: "pending", evidence: ["unknown"] }] }] }, true],
    ["rejects unstructured generic general proof boundary", { ...valid, internal_builds: [{ ...build, proof_boundaries: [{ boundary: "runtime proof pending", excluded_from_live_claim: "claim pending", evidence: ["proof pending"] }] }] }, true],
    ["accepts precise proof boundary that truthfully says pending", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, proof_boundaries: [{ scope: { kind: "authenticated_workflow", reference: "Authenticated client edit and save workflow" }, blocker: { kind: "access_unavailable", detail: "Production account access was unavailable during verification" }, boundary: "Authenticated client edit and save proof is pending because production account access was unavailable", excluded_from_live_claim: "Authenticated client edit and save workflow", evidence: ["Production account access was unavailable during the scheduled authenticated verification"] }] }], whats_new: { ...valid.whats_new, status: ["PARTIAL", "PROOF OWED"], known_limitations: "Authenticated client editing remains outside the live claim" } }, false],
    ["accepts concise proof boundary with concrete scope", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, proof_boundaries: [{ scope: { kind: "provider_capability", reference: "Okta login workflow" }, blocker: { kind: "access_unavailable", detail: "Okta production account access was unavailable during verification" }, boundary: "Okta login proof remains pending", excluded_from_live_claim: "Okta login workflow", evidence: ["Okta production account access was unavailable during verification"] }] }], whats_new: { ...valid.whats_new, status: ["PARTIAL", "PROOF OWED"], known_limitations: "Okta login remains outside the live claim" } }, false],
    ["rejects unstructured modifier-only proof boundary", { ...valid, internal_builds: [{ ...build, proof_boundaries: [{ boundary: "runtime proof remains pending later", excluded_from_live_claim: "claim pending later", evidence: ["proof pending later"] }] }] }, true],
    ["rejects placeholder proof-owed boundary", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, edge_status: { state: "PROOF_OWED", evidence: ["authenticated proof pending"], identifiers: [], proof_owed: { boundary: "TODO: write exact boundary", excluded_from_live_claim: "TBD - fill later" } } }], whats_new: { ...valid.whats_new, status: ["LIVE", "PROOF OWED"], known_limitations: "None" } }, true],
    ["rejects correction without history", { ...valid, record_state: "CORRECTED" }, true],
    ["rejects placeholder correction reason", { ...valid, record_state: "CORRECTED", history: { supersedes_record_id: "release-0.0.9", reason: "PROOF_OWED", corrected_values: [] }, customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } }, true],
    ["rejects unresolved correction phrase without repair context", { ...valid, record_state: "CORRECTED", history: { supersedes_record_id: "release-0.0.9", reason: "pending deployment ID", corrected_values: [] }, customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } }, true],
    ["rejects TODO correction phrase without repair context", { ...valid, record_state: "CORRECTED", history: { supersedes_record_id: "release-0.0.9", reason: "TODO status", corrected_values: [] }, customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } }, true],
    ["rejects unrelated correction context before unresolved work", { ...valid, record_state: "CORRECTED", history: { supersedes_record_id: "release-0.0.9", reason: "Updated notes; deployment ID pending", corrected_values: [] }, customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } }, true],
    ["rejects correction context tied to another field", { ...valid, record_state: "CORRECTED", history: { supersedes_record_id: "release-0.0.9", reason: "Corrected copy but status remains TODO", corrected_values: [] }, customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } }, true],
    ["accepts correction reason that explains a former placeholder", { ...valid, record_state: "CORRECTED", history: { supersedes_record_id: "release-0.0.9", reason: "Corrected deployment identity and status", corrected_values: [{ field_path: "/internal_builds/0/deployment_id", previous_exists: true, previous_value: "pending", replacement_exists: true, replacement_value: "dpl_123" }, { field_path: "/whats_new/status/0", previous_exists: true, previous_value: "TODO", replacement_exists: true, replacement_value: "LIVE" }] }, customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } }, false],
    ["accepts structurally complete correction", { ...valid, record_state: "CORRECTED", affected_audience: ["Solo owners"], history: { supersedes_record_id: "release-0.0.9", reason: "Corrected audience scope", corrected_values: [{ field_path: "/affected_audience/0", previous_exists: true, previous_value: "solo", replacement_exists: true, replacement_value: "Solo owners" }] }, customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } }, false],
    ["accepts internal PROOF_OWED correction replacement", { ...valid, record_state: "CORRECTED", history: { supersedes_record_id: "release-0.0.9", reason: "Corrected migration proof state", corrected_values: [{ field_path: "/internal_builds/0/migration_status/state", previous_exists: true, previous_value: "APPLIED", replacement_exists: true, replacement_value: "PROOF_OWED" }] }, customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } }, false],
    ["rejects customer PROOF OWED spelling at internal state", { ...valid, record_state: "CORRECTED", history: { supersedes_record_id: "release-0.0.9", reason: "Corrected migration proof state", corrected_values: [{ field_path: "/internal_builds/0/migration_status/state", previous_exists: true, previous_value: "APPLIED", replacement_exists: true, replacement_value: "PROOF OWED" }] }, customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } }, true],
    ["rejects retraction records with correction entries", { ...valid, record_state: "RETRACTED", history: { supersedes_record_id: "release-0.0.9", reason: "Retracted the customer release", corrected_values: [{ field_path: "/scope/0", previous_exists: true, previous_value: "outcome", replacement_exists: true, replacement_value: "invented" }] }, customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } }, true],
    ["rejects customer correction without publication gates", { ...valid, record_state: "CORRECTED", history: { supersedes_record_id: "release-0.0.9", reason: "Corrected customer outcome", corrected_values: [] }, whats_new: { ...valid.whats_new, customer_outcome: "TODO" } }, true],
    ["rejects duplicate customer status", { ...valid, whats_new: { ...valid.whats_new, status: ["LIVE", "LIVE"] } }, true],
    ["rejects PARTIAL without a substantive limitation", { ...valid, limitations: ["None"], whats_new: { ...valid.whats_new, known_limitations: "None" } }, true],
    ["rejects placeholder evidence on passed checks", { ...valid, internal_builds: [{ ...build, checks: { ...build.checks, ci: { state: "PASS", evidence: ["TODO"] } } }] }, true],
    ["rejects placeholder evidence on applied delivery", { ...valid, internal_builds: [{ ...build, migration_status: { state: "APPLIED", evidence: ["TODO"], identifiers: ["20260907000001_example"], proof_owed: null } }] }, true],
    ["rejects placeholder published customer copy", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, whats_new: { ...valid.whats_new, customer_outcome: "TODO", what_changed: "TBD", paige_readable_summary: "REPLACE_ME" } }, true],
    ["rejects proof-owed published live outcome", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, whats_new: { ...valid.whats_new, status: ["LIVE"], customer_outcome: "PROOF_OWED" } }, true],
    ["rejects normalized placeholder approval reference", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: { ...customerApproval, reference: "PENDING_DECISION" } } }, true],
    ["rejects normalized no-value approval reference", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: { ...customerApproval, reference: "PROOF_OWED" } } }, true],
    ["rejects placeholder published release name", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, release_name: "TODO", owner_approval: customerApproval } }, true],
    ["rejects unresolved published release name", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, release_name: "PROOF_OWED", owner_approval: customerApproval } }, true],
    ["rejects placeholder published build evidence", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, evidence: ["TODO"] }] }, true],
    ["rejects absent build evidence before publication", { ...internal, internal_builds: [{ ...build, customer_release_scope: "supporting", evidence: ["none"] }] }, true],
    ["accepts a build evidence path containing a state word", { ...internal, internal_builds: [{ ...build, customer_release_scope: "supporting", evidence: ["evidence/ui/pending-state.png"] }] }, false],
    ["accepts a PASS check evidence path containing a state word", { ...internal, internal_builds: [{ ...build, customer_release_scope: "supporting", checks: { ...build.checks, ci: { state: "PASS", evidence: ["evidence/ui/pending-state.png"] } } }] }, false],
    ["rejects unresolved prose in PASS check evidence", { ...internal, internal_builds: [{ ...build, customer_release_scope: "supporting", checks: { ...build.checks, ci: { state: "PASS", evidence: ["proof pending"] } } }] }, true],
    ["rejects placeholder published release facts", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, scope: ["TODO"], rollback_recovery: { position: "TBD", reference: "REPLACE_ME" } }, true],
    ["rejects no-value sentinels in published facts", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, scope: ["None"], affected_audience: ["N/A"], benefits: ["none"], rollback_recovery: { position: "forward fix", reference: "none" } }, true],
    ["rejects proof-owed sentinels in required published facts", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, scope: ["PROOF_OWED"], affected_audience: ["PROOF OWED"], benefits: ["proof-owed"], rollback_recovery: { position: "forward fix", reference: "PROOF_OWED" } }, true],
    ["rejects no-evidence sentinel for passed checks", { ...valid, internal_builds: [{ ...build, checks: { ...build.checks, ci: { state: "PASS", evidence: ["none"] } } }] }, true],
    ["rejects production build without deployment ID", { ...valid, internal_builds: [build, { ...build, commit_sha: "b".repeat(40), deployment_id: "NOT_APPLICABLE", customer_release_scope: "supporting" }] }, true],
    ["rejects normalized absent production deployment IDs", { ...valid, internal_builds: [{ ...build, deployment_id: "not_applicable" }] }, true],
    ["rejects punctuated anticipated deployment IDs", { ...valid, internal_builds: [{ ...build, deployment_id: "pending/deployment" }] }, true],
    ["rejects proof-owed evidence on passed checks", { ...valid, internal_builds: [{ ...build, checks: { ...build.checks, ci: { state: "PASS", evidence: ["PROOF_OWED"] } } }] }, true],
    ["rejects proof-owed evidence on applied delivery", { ...valid, internal_builds: [{ ...build, migration_status: { state: "APPLIED", evidence: ["proof-owed"], identifiers: ["20260907000001_example"], proof_owed: null } }] }, true],
    ["rejects proof-owed token in applied identifiers", { ...valid, internal_builds: [{ ...build, migration_status: { state: "APPLIED", evidence: ["migration log"], identifiers: ["20260907000001_PROOF_OWED"], proof_owed: null } }] }, true],
    ["rejects normalized no-value publication facts", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, scope: ["NOT_APPLICABLE"], affected_audience: ["N_A"], rollback_recovery: { position: "forward fix", reference: "NOT-APPLICABLE" } }, true],
    ["rejects normalized no-evidence sentinel for passed checks", { ...valid, internal_builds: [{ ...build, checks: { ...build.checks, ci: { state: "PASS", evidence: ["NOT_APPLICABLE"] } } }] }, true],
    ["rejects exact unresolved proof boundary values", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, edge_status: { state: "PROOF_OWED", evidence: ["authenticated proof remains outstanding"], identifiers: [], proof_owed: { boundary: "pending", excluded_from_live_claim: "proof owed" } } }], whats_new: { ...valid.whats_new, status: ["PARTIAL", "PROOF OWED"] } }, true],
    ["rejects absent evidence for proof-owed delivery", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, edge_status: { state: "PROOF_OWED", evidence: ["none"], identifiers: [], proof_owed: { boundary: "Authenticated edge interaction proof remains outstanding", excluded_from_live_claim: "Edge-backed authenticated interaction" } } }], whats_new: { ...valid.whats_new, status: ["PARTIAL", "PROOF OWED"] } }, true],
    ["rejects normalized staged rollout placeholders", { ...valid, internal_builds: [{ ...build, release_channel: "staged", staged_rollout: { owner_approval: stagedApproval, eligibility_rule: "PENDING_DECISION", rollout_amount: "NOT_APPLICABLE", start_condition: "owner approval", stop_condition: "error budget exceeded", monitoring_owner: "REPLACE-ME", recovery_path: "PROOF_OWED" } }] }, true],
    ["accepts legitimate words containing placeholder substrings", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, release_name: "Mastodon Connections", owner_approval: customerApproval }, whats_new: { ...valid.whats_new, customer_outcome: "Routing changes depending on owner settings" } }, false],
  ];
  let bad = 0;
  for (const [label, record, shouldFail] of cases) {
    const failed = validateReleaseRecord(record).length > 0;
    const ok = failed === shouldFail;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) bad++;
  }
  const historyCases = [
    ["accepts additive release record", new Map([["old.json", "old"]]), new Map([["old.json", "old"], ["new.json", "new"]]), false],
    ["rejects deleted release record", new Map([["old.json", "old"]]), new Map(), true],
    ["rejects rewritten release record", new Map([["old.json", "old"]]), new Map([["old.json", "changed"]]), true],
  ];
  for (const [label, before, current, shouldFail] of historyCases) {
    const failed = compareRecordHistory(before, current).length > 0;
    const ok = failed === shouldFail;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) bad++;
  }
  const predecessor = { ...valid, record_id: "release-0.0.9", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } };
  const internalPredecessor = { ...internal, record_id: "release-internal-0.0.9" };
  const correction = { ...valid, record_id: "release-0.1.0-correction", record_state: "CORRECTED", scope: ["corrected outcome"], history: { supersedes_record_id: predecessor.record_id, reason: "Corrected outcome scope", corrected_values: [{ field_path: "/scope/0", previous_exists: true, previous_value: "outcome", replacement_exists: true, replacement_value: "corrected outcome" }] }, customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } };
  const additionalBuild = { ...build, commit_sha: "b".repeat(40), deployment_id: "build_2" };
  const reorderedAdditionalBuild = Object.fromEntries(Object.entries(additionalBuild).reverse());
  const recordSetCases = [
    ["accepts correction linked to an existing predecessor", [predecessor, correction], false],
    ["accepts an internal correction linked to an internal predecessor", [internalPredecessor, { ...internal, record_id: "release-internal-0.0.9-correction", record_state: "CORRECTED", scope: ["corrected internal outcome"], history: { supersedes_record_id: internalPredecessor.record_id, reason: "Corrected internal outcome", corrected_values: [{ field_path: "/scope/0", previous_exists: true, previous_value: "outcome", replacement_exists: true, replacement_value: "corrected internal outcome" }] } }], false],
    ["rejects an internal correction that erases a customer-facing predecessor", [{ ...valid, record_id: "release-0.1.0-published", record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } }, { ...internal, record_id: "release-0.1.0-hidden-correction", record_state: "CORRECTED", history: { supersedes_record_id: "release-0.1.0-published", reason: "Incorrectly hid the customer release", corrected_values: [] } }], true],
    ["rejects correction linked to a missing predecessor", [correction], true],
    ["rejects correction with invented previous value", [predecessor, { ...correction, history: { ...correction.history, corrected_values: [{ ...correction.history.corrected_values[0], previous_value: "invented" }] } }], true],
    ["rejects correction with replacement not present in current record", [predecessor, { ...correction, history: { ...correction.history, corrected_values: [{ ...correction.history.corrected_values[0], replacement_value: "different outcome" }] } }], true],
    ["rejects correction with a missing JSON Pointer", [predecessor, { ...correction, history: { ...correction.history, corrected_values: [{ field_path: "/scope/9", previous_exists: true, previous_value: "outcome", replacement_exists: true, replacement_value: "corrected outcome" }] } }], true],
    ["rejects JavaScript-only array length pointers", [predecessor, { ...correction, scope: ["outcome", "second outcome"], history: { ...correction.history, corrected_values: [{ field_path: "/scope/length", previous_exists: true, previous_value: 1, replacement_exists: true, replacement_value: 2 }] } }], true],
    ["rejects correction history that omits another changed field", [predecessor, { ...correction, benefits: ["corrected benefit"] }], true],
    ["rejects unresolved replacement outside an allowed status field", [predecessor, { ...correction, scope: ["TODO"], history: { ...correction.history, corrected_values: [{ field_path: "/scope/0", previous_exists: true, previous_value: "outcome", replacement_exists: true, replacement_value: "TODO" }] } }], true],
    ["accepts structured correction values regardless of object key order", [predecessor, { ...predecessor, record_id: "release-build-correction", record_state: "CORRECTED", internal_builds: [build, additionalBuild], history: { supersedes_record_id: predecessor.record_id, reason: "Recorded the additional supporting build", corrected_values: [{ field_path: "/internal_builds/1", previous_exists: false, previous_value: null, replacement_exists: true, replacement_value: reorderedAdditionalBuild }] } }], false],
    ["rejects retraction histories with invented correction values", [predecessor, { ...predecessor, record_id: "release-retracted", record_state: "RETRACTED", history: { supersedes_record_id: predecessor.record_id, reason: "Retracted the release", corrected_values: [{ field_path: "/scope/0", previous_exists: true, previous_value: "invented", replacement_exists: true, replacement_value: "outcome" }] } }], true],
    ["accepts PROOF OWED as a contextual correction replacement", [{ ...valid, record_id: "release-status-before", whats_new: { ...valid.whats_new, status: ["LIVE"] } }, { ...valid, record_id: "release-status-correction", record_state: "CORRECTED", whats_new: { ...valid.whats_new, status: ["PROOF OWED"] }, history: { supersedes_record_id: "release-status-before", reason: "Corrected the customer truth status", corrected_values: [{ field_path: "/whats_new/status/0", previous_exists: true, previous_value: "LIVE", replacement_exists: true, replacement_value: "PROOF OWED" }] } }], false],
    ["rejects correction self-reference", [{ ...correction, history: { ...correction.history, supersedes_record_id: correction.record_id } }], true],
    ["rejects duplicate record identifiers", [predecessor, { ...valid, record_id: predecessor.record_id }], true],
    ["rejects correction cycle", [{ ...correction, history: { ...correction.history, supersedes_record_id: "release-cycle-b" } }, { ...correction, record_id: "release-cycle-b", history: { ...correction.history, supersedes_record_id: correction.record_id } }], true],
  ];
  for (const [label, records, shouldFail] of recordSetCases) {
    const failed = validateReleaseRecordSet(records).length > 0;
    const ok = failed === shouldFail;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) bad++;
  }
  const canonicalSchema = compileCanonicalReleaseSchema(JSON.parse(fs.readFileSync(SCHEMA, "utf8")));
  const published = { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval } };
  const schemaCases = [
    ["canonical schema accepts a valid published record", published, false],
    ["canonical schema accepts state words inside artifact paths", { ...internal, internal_builds: [{ ...build, customer_release_scope: "supporting", evidence: ["evidence/ui/pending-state.png"], checks: { ...build.checks, ci: { state: "PASS", evidence: ["evidence/ui/pending-state.png"] } } }] }, false],
    ["canonical schema accepts a described artifact containing state words", { ...internal, internal_builds: [{ ...build, customer_release_scope: "supporting", evidence: ["evidence/ui/pending-state.png"], checks: { ...build.checks, ci: { state: "PASS", evidence: ["screenshot: evidence/ui/pending-state.png"] } } }] }, false],
    ["canonical schema accepts a Markdown-wrapped local artifact", { ...internal, internal_builds: [{ ...build, customer_release_scope: "supporting", evidence: ["evidence/ui/pending-state.png"], checks: { ...build.checks, ci: { state: "PASS", evidence: ["[run](evidence/ui/result.png)"] } } }] }, false],
    ["canonical schema rejects unresolved prose beside an artifact path", { ...internal, internal_builds: [{ ...build, customer_release_scope: "supporting", evidence: ["build run"], checks: { ...build.checks, ci: { state: "PASS", evidence: ["proof pending; evidence/ui/pending-state.png"] } } }] }, true],
    ["canonical schema rejects bare unresolved prose beside a neutral artifact path", { ...internal, internal_builds: [{ ...build, customer_release_scope: "supporting", evidence: ["build run"], checks: { ...build.checks, ci: { state: "PASS", evidence: ["pending; artifacts/ui/foo.png"] } } }] }, true],
    ["canonical schema rejects unresolved prose fused to an artifact path", { ...internal, internal_builds: [{ ...build, customer_release_scope: "supporting", evidence: ["build run"], checks: { ...build.checks, ci: { state: "PASS", evidence: ["pending:evidence/ui/foo.png"] } } }] }, true],
    ["canonical schema rejects publication placeholders missed by handwritten code", { ...published, scope: ["add link"] }, true],
    ["canonical schema rejects symbolic deployment aliases", { ...published, internal_builds: [{ ...build, deployment_id: "latest" }] }, true],
    ["canonical schema rejects a URL-only deployment identifier", { ...published, internal_builds: [{ ...build, deployment_id: "https://example.vercel.app" }] }, true],
    ["canonical schema rejects an empty corrected-values list", { ...correction, history: { ...correction.history, corrected_values: [] } }, true],
    ["canonical schema accepts PROOF OWED as a contextual replacement value", { ...correction, history: { ...correction.history, corrected_values: [{ field_path: "/whats_new/status/0", previous_exists: true, previous_value: "LIVE", replacement_exists: true, replacement_value: "PROOF OWED" }] } }, false],
    ["canonical schema accepts PROOF_OWED for internal delivery state", { ...correction, history: { ...correction.history, corrected_values: [{ field_path: "/internal_builds/0/migration_status/state", previous_exists: true, previous_value: "APPLIED", replacement_exists: true, replacement_value: "PROOF_OWED" }] } }, false],
    ["canonical schema rejects customer spelling at internal delivery state", { ...correction, history: { ...correction.history, corrected_values: [{ field_path: "/internal_builds/0/edge_status/state", previous_exists: true, previous_value: "APPLIED", replacement_exists: true, replacement_value: "PROOF OWED" }] } }, true],
    ["canonical schema rejects internal spelling at customer status", { ...correction, history: { ...correction.history, corrected_values: [{ field_path: "/whats_new/status/0", previous_exists: true, previous_value: "LIVE", replacement_exists: true, replacement_value: "PROOF_OWED" }] } }, true],
    ["canonical schema rejects JavaScript-only array length pointers", { ...correction, history: { ...correction.history, corrected_values: [{ field_path: "/scope/length", previous_exists: true, previous_value: 1, replacement_exists: true, replacement_value: 2 }] } }, true],
    ["canonical schema rejects leading-zero array pointers", { ...correction, history: { ...correction.history, corrected_values: [{ field_path: "/scope/01", previous_exists: true, previous_value: "outcome", replacement_exists: true, replacement_value: "corrected outcome" }] } }, true],
    ["canonical schema rejects named array pointers", { ...correction, history: { ...correction.history, corrected_values: [{ field_path: "/scope/foo", previous_exists: true, previous_value: "outcome", replacement_exists: true, replacement_value: "corrected outcome" }] } }, true],
    ["canonical schema rejects negative build indices", { ...correction, history: { ...correction.history, corrected_values: [{ field_path: "/internal_builds/-1/deployment_id", previous_exists: true, previous_value: "build_1", replacement_exists: true, replacement_value: "build_2" }] } }, true],
    ["canonical schema rejects TODO at an approved status path", { ...correction, history: { ...correction.history, corrected_values: [{ field_path: "/whats_new/status/0", previous_exists: true, previous_value: "LIVE", replacement_exists: true, replacement_value: "TODO" }] } }, true],
    ["canonical schema rejects structured values at an approved status path", { ...correction, history: { ...correction.history, corrected_values: [{ field_path: "/whats_new/status/0", previous_exists: true, previous_value: "LIVE", replacement_exists: true, replacement_value: { state: "PROOF OWED" } }] } }, true],
    ["canonical schema rejects correction entries on retracted records", { ...correction, record_state: "RETRACTED" }, true],
    ["canonical schema rejects unresolved replacements outside allowed status fields", { ...correction, history: { ...correction.history, corrected_values: [{ field_path: "/scope/0", previous_exists: true, previous_value: "outcome", replacement_exists: true, replacement_value: "TODO" }] } }, true],
    ["canonical schema rejects placeholder correction reasons", { ...correction, history: { ...correction.history, reason: "pending" } }, true],
    ["canonical schema rejects unresolved correction phrases without repair context", { ...correction, history: { ...correction.history, reason: "pending deployment ID" } }, true],
    ["canonical schema rejects TODO correction phrases without repair context", { ...correction, history: { ...correction.history, reason: "TODO status" } }, true],
    ["canonical schema rejects unrelated correction context before unresolved work", { ...correction, history: { ...correction.history, reason: "Updated notes; deployment ID pending" } }, true],
    ["canonical schema rejects correction context tied to another field", { ...correction, history: { ...correction.history, reason: "Corrected copy but status remains TODO" } }, true],
    ["canonical schema accepts ordinary words containing sentinel substrings", { ...correction, history: { ...correction.history, reason: "Clarified behavior depending on environment" } }, false],
    ["canonical schema accepts a correction reason that names the repaired placeholder", { ...correction, history: { ...correction.history, reason: "Corrected customer status after authenticated run 42 passed", corrected_values: [{ field_path: "/whats_new/status/0", previous_exists: true, previous_value: "PROOF OWED", replacement_exists: true, replacement_value: "LIVE" }] } }, false],
    ["canonical schema rejects unstructured generic general proof boundary", { ...published, internal_builds: [{ ...build, proof_boundaries: [{ boundary: "runtime proof pending", excluded_from_live_claim: "claim pending", evidence: ["proof pending"] }] }], whats_new: { ...published.whats_new, status: ["PARTIAL", "PROOF OWED"] } }, true],
    ["canonical schema accepts a precise proof boundary that truthfully says pending", { ...published, internal_builds: [{ ...build, proof_boundaries: [{ scope: { kind: "authenticated_workflow", reference: "Authenticated client edit and save workflow" }, blocker: { kind: "access_unavailable", detail: "Production account access was unavailable during verification" }, boundary: "Authenticated client edit and save proof is pending because production account access was unavailable", excluded_from_live_claim: "Authenticated client edit and save workflow", evidence: ["Production account access was unavailable during the scheduled authenticated verification"] }] }], whats_new: { ...published.whats_new, status: ["PARTIAL", "PROOF OWED"], known_limitations: "Authenticated client editing remains outside the live claim" } }, false],
    ["canonical schema accepts a concise proof boundary with concrete scope", { ...published, internal_builds: [{ ...build, proof_boundaries: [{ scope: { kind: "provider_capability", reference: "Okta login workflow" }, blocker: { kind: "access_unavailable", detail: "Okta production account access was unavailable during verification" }, boundary: "Okta login proof remains pending", excluded_from_live_claim: "Okta login workflow", evidence: ["Okta production account access was unavailable during verification"] }] }], whats_new: { ...published.whats_new, status: ["PARTIAL", "PROOF OWED"], known_limitations: "Okta login remains outside the live claim" } }, false],
    ["canonical schema rejects unstructured modifier-only proof boundary", { ...published, internal_builds: [{ ...build, proof_boundaries: [{ boundary: "runtime proof remains pending later", excluded_from_live_claim: "claim pending later", evidence: ["proof pending later"] }] }], whats_new: { ...published.whats_new, status: ["PARTIAL", "PROOF OWED"] } }, true],
    ["canonical schema rejects approved records with failed referenced checks", { ...valid, record_state: "APPROVED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, checks: { ...build.checks, security: { state: "FAIL", evidence: ["security run failed"] } } }] }, true],
  ];
  for (const [label, record, shouldFail] of schemaCases) {
    const failed = canonicalSchemaFindings(canonicalSchema, record).length > 0;
    const ok = failed === shouldFail;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) bad++;
  }
  const total = cases.length + historyCases.length + recordSetCases.length + schemaCases.length;
  console.log(bad ? `\n✗ release-governance self-test: ${bad} failure(s).` : `\n✓ release-governance self-test passed — ${total} case(s).`);
  process.exit(bad ? 1 : 0);
}

if (invokedDirectly() && !process.argv.includes("--self-test")) {
  const findings = validateRepository();
  if (findings.length) {
    console.log(`✗ release-governance-lint: ${findings.length} finding(s)\n`);
    for (const finding of findings) console.log(`  • ${finding}`);
    process.exit(1);
  }
  console.log("✓ release-governance-lint: policy, schema, and required agent/PR/closeout pointers are present.");
}
