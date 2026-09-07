#!/usr/bin/env node
/** Structural release-governance guard. It validates wiring and record honesty, not deployment truth. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const RECORD_KEYS = ["schema_version", "record_id", "record_state", "classification", "internal_builds", "scope", "affected_audience", "benefits", "limitations", "rollback_recovery", "customer_release_identity", "whats_new"];
const BUILD_KEYS = ["commit_sha", "deployment_id", "environment", "release_channel", "deployed_at", "staged_rollout", "migration_status", "edge_status", "checks", "evidence"];
const STAGED_KEYS = ["owner_approval", "eligibility_rule", "rollout_amount", "start_condition", "stop_condition", "monitoring_owner", "recovery_path"];
const STAGED_TEXT_KEYS = ["eligibility_rule", "rollout_amount", "start_condition", "stop_condition", "monitoring_owner", "recovery_path"];
const NOTE_KEYS = ["customer_outcome", "what_changed", "who_can_use_it", "owner_action", "status", "known_limitations", "safe_next_step", "technical_release_reference", "paige_readable_summary"];

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
  requireExactObject(value, ["state", "evidence"], label, findings);
  if (!DELIVERY_STATES.has(value?.state)) findings.push(`${label}.state invalid`);
  requireNonEmptyStrings(value?.evidence, `${label}.evidence`, findings, value?.state === "NOT_APPLICABLE");
}

function requireApproval(value, label, expectedScope, allowedStatuses, findings) {
  if (!requireExactObject(value, ["approval_id", "scope", "status", "reference"], label, findings)) return;
  const idPrefix = expectedScope === "staged_rollout" ? "staged-rollout-" : "customer-publication-";
  if (!new RegExp(`^${idPrefix}[A-Za-z0-9._:-]+$`).test(String(value.approval_id || ""))) findings.push(`${label}.approval_id must identify the ${expectedScope} decision`);
  if (value.scope !== expectedScope) findings.push(`${label}.scope must be ${expectedScope}`);
  if (!allowedStatuses.includes(value.status)) findings.push(`${label}.status invalid`);
  if (!nonEmpty(value.reference)) findings.push(`${label}.reference missing`);
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

export function validateReleaseRecord(record) {
  const findings = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["record is not an object"];
  requireExactObject(record, RECORD_KEYS, "record", findings);
  if (record.schema_version !== "1.0.0") findings.push("schema_version must be 1.0.0");
  if (!nonEmpty(record.record_id)) findings.push("record_id missing");
  if (!RECORD_STATES.has(record.record_state)) findings.push("record_state invalid");
  if (!CLASSIFICATIONS.has(record.classification)) findings.push("classification invalid");

  if (!Array.isArray(record.internal_builds) || record.internal_builds.length === 0) {
    findings.push("internal_builds must contain at least one exact build identity");
  } else {
    record.internal_builds.forEach((build, index) => {
      const label = `internal_builds[${index}]`;
      requireExactObject(build, BUILD_KEYS, label, findings);
      if (!/^[0-9a-f]{40}$/i.test(String(build?.commit_sha || ""))) findings.push(`${label}.commit_sha must be an exact 40-character SHA`);
      if (!nonEmpty(build?.deployment_id)) findings.push(`${label}.deployment_id missing`);
      if (!["local", "development", "preview", "production"].includes(build?.environment)) findings.push(`${label}.environment invalid`);
      if (!CHANNELS.has(build?.release_channel)) findings.push(`${label}.release_channel invalid`);
      if (build?.release_channel === "development" && !["local", "development"].includes(build.environment)) findings.push(`${label} development channel requires local/development environment`);
      if (build?.release_channel === "preview" && build.environment !== "preview") findings.push(`${label} preview channel requires preview environment`);
      if (["production", "staged"].includes(build?.release_channel) && build.environment !== "production") findings.push(`${label} production/staged channel requires production environment`);
      if (!validDateTime(build?.deployed_at)) findings.push(`${label}.deployed_at must be an ISO date-time`);
      if (build?.release_channel === "staged") {
        if (requireExactObject(build?.staged_rollout, STAGED_KEYS, `${label}.staged_rollout`, findings)) {
          for (const field of STAGED_TEXT_KEYS) if (!nonEmpty(build.staged_rollout[field])) findings.push(`${label}.staged_rollout.${field} missing`);
          requireApproval(build.staged_rollout.owner_approval, `${label}.staged_rollout.owner_approval`, "staged_rollout", ["APPROVED"], findings);
          if (record.customer_release_identity && build.staged_rollout.owner_approval?.reference === record.customer_release_identity.owner_approval?.reference)
            findings.push(`${label}.staged_rollout.owner_approval.reference must be distinct from customer publication approval`);
        }
      } else if (build?.staged_rollout !== null) findings.push(`${label}.staged_rollout must be null outside the staged channel`);
      for (const field of ["migration_status", "edge_status"]) requireDeliveryState(build?.[field], `${label}.${field}`, findings);
      requireExactObject(build?.checks, ["ci", "security", "production_checks"], `${label}.checks`, findings);
      for (const field of ["ci", "security", "production_checks"])
        requireEvidenceState(build?.checks?.[field], `${label}.checks.${field}`, findings);
      requireNonEmptyStrings(build?.evidence, `${label}.evidence`, findings);
    });
    const deploymentIds = record.internal_builds.map((build) => build?.deployment_id);
    if (new Set(deploymentIds).size !== deploymentIds.length) findings.push("internal_builds deployment_id values must be unique");
  }

  for (const field of ["scope", "affected_audience", "benefits", "limitations"]) requireNonEmptyStrings(record[field], field, findings);
  requireExactObject(record.rollback_recovery, ["position", "reference"], "rollback_recovery", findings);
  if (!nonEmpty(record.rollback_recovery?.position) || !nonEmpty(record.rollback_recovery?.reference)) findings.push("rollback_recovery missing position/reference");

  const customer = record.customer_release_identity;
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
      requireExactObject(note.technical_release_reference, ["visibility", "build_ids"], "whats_new.technical_release_reference", findings);
      if (note.technical_release_reference?.visibility !== "internal_only" || !Array.isArray(note.technical_release_reference?.build_ids) || note.technical_release_reference.build_ids.length === 0)
        findings.push("technical_release_reference must be internal_only with build_ids[]");
      else {
        requireNonEmptyStrings(note.technical_release_reference.build_ids, "whats_new.technical_release_reference.build_ids", findings);
        const recordedBuildIds = new Set((record.internal_builds || []).map((build) => build?.deployment_id));
        for (const id of note.technical_release_reference.build_ids)
          if (!recordedBuildIds.has(id)) findings.push(`technical release reference ${id} is not a recorded deployment_id`);
      }
    }
  } else if (record.whats_new !== null) {
    findings.push("whats_new must be null when no customer release identity exists");
  }
  if (["minor_candidate", "major_candidate"].includes(record.classification) && customer === null)
    findings.push(`${record.classification} requires a customer release identity`);
  if (["APPROVED", "PUBLISHED"].includes(record.record_state) && customer !== null) {
    if (customer?.owner_approval?.status !== "APPROVED") findings.push(`${record.record_state} customer release requires an APPROVED customer-publication decision`);
    const referenced = new Set(record.whats_new?.technical_release_reference?.build_ids || []);
    for (const [index, build] of (record.internal_builds || []).entries()) {
      if (!referenced.has(build?.deployment_id)) continue;
      for (const field of ["ci", "security", "production_checks"])
        if (build?.checks?.[field]?.state !== "PASS") findings.push(`${record.record_state} release requires internal_builds[${index}].checks.${field}.state PASS`);
    }
  }
  if (record.record_state === "PUBLISHED") {
    if (customer === null) findings.push("PUBLISHED requires a customer release identity");
    const referenced = new Set(record.whats_new?.technical_release_reference?.build_ids || []);
    const referencedBuilds = (record.internal_builds || []).filter((build) => referenced.has(build?.deployment_id));
    if (referencedBuilds.length === 0 || referencedBuilds.some((build) => !["production", "staged"].includes(build?.release_channel) || build.deployment_id === "NOT_APPLICABLE"))
      findings.push("PUBLISHED technical references must resolve only to deployed production or staged builds");
  }
  return findings;
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
  if (fs.existsSync(SCHEMA)) {
    try {
      const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
      if (schema.$id !== "https://paige.ai/schemas/release-record.schema.json") findings.push(`${SCHEMA} has wrong $id`);
      for (const key of ["internal_builds", "customer_release_identity", "whats_new"])
        if (!schema.properties?.[key]) findings.push(`${SCHEMA} missing ${key}`);
    } catch (error) {
      findings.push(`${SCHEMA} invalid JSON: ${error?.message ?? error}`);
    }
  }
  const recordsDir = "docs/release-governance/records";
  if (fs.existsSync(recordsDir)) {
    for (const name of fs.readdirSync(recordsDir).filter((name) => name.endsWith(".json"))) {
      const file = path.join(recordsDir, name);
      try {
        for (const finding of validateReleaseRecord(JSON.parse(fs.readFileSync(file, "utf8")))) findings.push(`${file}: ${finding}`);
      } catch (error) {
        findings.push(`${file} invalid JSON: ${error?.message ?? error}`);
      }
    }
  }
  return findings;
}

if (invokedDirectly() && process.argv.includes("--self-test")) {
  const customerApprovalPending = { approval_id: "customer-publication-decision-pending", scope: "customer_publication", status: "PENDING", reference: "owner-decision-pending" };
  const customerApproval = { approval_id: "customer-publication-owner-message-123", scope: "customer_publication", status: "APPROVED", reference: "owner-message-123" };
  const stagedApproval = { approval_id: "staged-rollout-owner-message-456", scope: "staged_rollout", status: "APPROVED", reference: "owner-message-456" };
  const build = {
    commit_sha: "a".repeat(40), deployment_id: "dpl_123", environment: "production", release_channel: "production", deployed_at: "2026-09-06T20:00:00Z", staged_rollout: null,
    migration_status: { state: "NOT_APPLICABLE", evidence: [] }, edge_status: { state: "NOT_APPLICABLE", evidence: [] },
    checks: { ci: { state: "PASS", evidence: ["run"] }, security: { state: "PASS", evidence: ["run"] }, production_checks: { state: "PASS", evidence: ["run"] } }, evidence: ["proof"],
  };
  const valid = {
    schema_version: "1.0.0", record_id: "release-0.1.0", record_state: "OWNER_DECISION_PENDING", classification: "minor_candidate", internal_builds: [build],
    scope: ["outcome"], affected_audience: ["solo"], benefits: ["benefit"], limitations: ["limit"], rollback_recovery: { position: "forward fix", reference: "runbook" },
    customer_release_identity: { version: "0.1.0", release_name: "Paige Solo Preview", date: "2026-09-06", owner_approval: customerApprovalPending },
    whats_new: { customer_outcome: "Outcome", what_changed: "Change", who_can_use_it: "Solo", owner_action: "None", status: ["PARTIAL", "PROOF OWED"], known_limitations: "Limit", safe_next_step: "Next", technical_release_reference: { visibility: "internal_only", build_ids: ["dpl_123"] }, paige_readable_summary: "Summary" },
  };
  const internal = { ...valid, classification: "internal_only", customer_release_identity: null, whats_new: null };
  const cases = [
    ["valid customer candidate", valid, false],
    ["valid internal-only record", internal, false],
    ["rejects short SHA", { ...valid, internal_builds: [{ ...build, commit_sha: "abc" }] }, true],
    ["rejects unapproved version text", { ...valid, customer_release_identity: { ...valid.customer_release_identity, version: "vNext" } }, true],
    ["rejects invented status", { ...valid, whats_new: { ...valid.whats_new, status: ["SHIPPED"] } }, true],
    ["rejects exposed technical reference", { ...valid, whats_new: { ...valid.whats_new, technical_release_reference: { visibility: "customer", build_ids: ["dpl_123"] } } }, true],
    ["rejects published release with pending approval", { ...valid, record_state: "PUBLISHED" }, true],
    ["rejects published release without green production checks", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, checks: { ...build.checks, production_checks: { state: "UNVERIFIED", evidence: ["not driven"] } } }] }, true],
    ["rejects published development-only release", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [{ ...build, environment: "development", release_channel: "development", deployment_id: "NOT_APPLICABLE" }] }, true],
    ["rejects technical reference to another build", { ...valid, whats_new: { ...valid.whats_new, technical_release_reference: { visibility: "internal_only", build_ids: ["dpl_fake"] } } }, true],
    ["rejects published reference to development when another production build exists", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [build, { ...build, commit_sha: "b".repeat(40), deployment_id: "dev_123", environment: "development", release_channel: "development" }], whats_new: { ...valid.whats_new, technical_release_reference: { visibility: "internal_only", build_ids: ["dev_123"] } } }, true],
    ["rejects staged build without rollout metadata", { ...valid, internal_builds: [{ ...build, release_channel: "staged", staged_rollout: null }] }, true],
    ["accepts staged build with rollout metadata", { ...valid, internal_builds: [{ ...build, release_channel: "staged", staged_rollout: { owner_approval: stagedApproval, eligibility_rule: "named cohort", rollout_amount: "10%", start_condition: "owner approval", stop_condition: "error budget exceeded", monitoring_owner: "release owner", recovery_path: "disable cohort" } }] }, false],
    ["rejects staged build without rollout approval", { ...valid, internal_builds: [{ ...build, release_channel: "staged", staged_rollout: { eligibility_rule: "named cohort", rollout_amount: "10%", start_condition: "owner approval", stop_condition: "error budget exceeded", monitoring_owner: "release owner", recovery_path: "disable cohort" } }] }, true],
    ["rejects pending staged rollout approval", { ...valid, internal_builds: [{ ...build, release_channel: "staged", staged_rollout: { owner_approval: { ...stagedApproval, status: "PENDING" }, eligibility_rule: "named cohort", rollout_amount: "10%", start_condition: "owner approval", stop_condition: "error budget exceeded", monitoring_owner: "release owner", recovery_path: "disable cohort" } }] }, true],
    ["rejects staged approval reused for publication", { ...valid, customer_release_identity: { ...valid.customer_release_identity, owner_approval: { ...customerApproval, reference: stagedApproval.reference } }, internal_builds: [{ ...build, release_channel: "staged", staged_rollout: { owner_approval: stagedApproval, eligibility_rule: "named cohort", rollout_amount: "10%", start_condition: "owner approval", stop_condition: "error budget exceeded", monitoring_owner: "release owner", recovery_path: "disable cohort" } }] }, true],
    ["rejects applied migration without identifiers", { ...valid, internal_builds: [{ ...build, migration_status: { state: "APPLIED", evidence: [] } }] }, true],
    ["rejects schema-forbidden extra property", { ...valid, invented: true }, true],
    ["rejects invalid date-time", { ...valid, internal_builds: [{ ...build, deployed_at: "not-a-date" }] }, true],
    ["rejects normalized invalid calendar date-time", { ...valid, internal_builds: [{ ...build, deployed_at: "2026-02-30T20:00:00Z" }] }, true],
    ["rejects production channel in development environment", { ...valid, internal_builds: [{ ...build, environment: "development" }] }, true],
    ["accepts unreferenced preview with unverified production check", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval: customerApproval }, internal_builds: [build, { ...build, commit_sha: "b".repeat(40), deployment_id: "preview_123", environment: "preview", release_channel: "preview", checks: { ...build.checks, production_checks: { state: "UNVERIFIED", evidence: ["preview only"] } } }] }, false],
    ["rejects minor version with patch component", { ...valid, customer_release_identity: { ...valid.customer_release_identity, version: "0.1.7" } }, true],
    ["rejects major version with minor component", { ...valid, classification: "major_candidate", customer_release_identity: { ...valid.customer_release_identity, version: "2.3.0" } }, true],
    ["rejects duplicate deployment identifiers", { ...valid, internal_builds: [build, { ...build, commit_sha: "b".repeat(40) }] }, true],
    ["rejects duplicate customer status", { ...valid, whats_new: { ...valid.whats_new, status: ["LIVE", "LIVE"] } }, true],
  ];
  let bad = 0;
  for (const [label, record, shouldFail] of cases) {
    const failed = validateReleaseRecord(record).length > 0;
    const ok = failed === shouldFail;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) bad++;
  }
  console.log(bad ? `\n✗ release-governance self-test: ${bad} failure(s).` : `\n✓ release-governance self-test passed — ${cases.length} case(s).`);
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
