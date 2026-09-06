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
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

function invokedDirectly() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

function requireEvidenceState(value, label, findings) {
  if (!CHECKS.has(value?.state) || !Array.isArray(value?.evidence) || value.evidence.length === 0)
    findings.push(`${label} must include PASS/FAIL/UNVERIFIED and non-empty evidence[]`);
}

export function validateReleaseRecord(record) {
  const findings = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["record is not an object"];
  if (record.schema_version !== "1.0.0") findings.push("schema_version must be 1.0.0");
  if (!nonEmpty(record.record_id)) findings.push("record_id missing");
  if (!RECORD_STATES.has(record.record_state)) findings.push("record_state invalid");
  if (!CLASSIFICATIONS.has(record.classification)) findings.push("classification invalid");

  if (!Array.isArray(record.internal_builds) || record.internal_builds.length === 0) {
    findings.push("internal_builds must contain at least one exact build identity");
  } else {
    record.internal_builds.forEach((build, index) => {
      const label = `internal_builds[${index}]`;
      if (!/^[0-9a-f]{40}$/i.test(String(build?.commit_sha || ""))) findings.push(`${label}.commit_sha must be an exact 40-character SHA`);
      if (!nonEmpty(build?.deployment_id)) findings.push(`${label}.deployment_id missing`);
      if (!nonEmpty(build?.environment)) findings.push(`${label}.environment missing`);
      if (!CHANNELS.has(build?.release_channel)) findings.push(`${label}.release_channel invalid`);
      if (!nonEmpty(build?.deployed_at)) findings.push(`${label}.deployed_at missing`);
      for (const field of ["migration_status", "edge_status"])
        if (!nonEmpty(build?.[field]?.state) || !Array.isArray(build?.[field]?.evidence)) findings.push(`${label}.${field} must include state and evidence[]`);
      for (const field of ["ci", "security", "production_checks"])
        requireEvidenceState(build?.checks?.[field], `${label}.checks.${field}`, findings);
      if (!Array.isArray(build?.evidence) || build.evidence.length === 0) findings.push(`${label}.evidence must not be empty`);
    });
  }

  for (const field of ["scope", "affected_audience", "benefits", "limitations"])
    if (!Array.isArray(record[field]) || record[field].length === 0 || record[field].some((value) => !nonEmpty(value))) findings.push(`${field} missing or empty`);
  if (!nonEmpty(record.rollback_recovery?.position) || !nonEmpty(record.rollback_recovery?.reference)) findings.push("rollback_recovery missing position/reference");

  const customer = record.customer_release_identity;
  if (customer !== null) {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(String(customer?.version || ""))) findings.push("customer version must be semantic x.y.z");
    if (!nonEmpty(customer?.release_name) || !nonEmpty(customer?.date) || !nonEmpty(customer?.owner_approval_reference)) findings.push("customer identity missing name/date/owner approval");
    const note = record.whats_new;
    if (!note || typeof note !== "object") findings.push("whats_new required with customer identity");
    else {
      for (const field of ["customer_outcome", "what_changed", "who_can_use_it", "owner_action", "known_limitations", "safe_next_step", "paige_readable_summary"])
        if (!nonEmpty(note[field])) findings.push(`whats_new.${field} missing`);
      if (!Array.isArray(note.status) || note.status.length === 0 || note.status.some((state) => !CUSTOMER_STATES.has(state))) findings.push("whats_new.status invalid");
      if (note.technical_release_reference?.visibility !== "internal_only" || !Array.isArray(note.technical_release_reference?.build_ids) || note.technical_release_reference.build_ids.length === 0)
        findings.push("technical_release_reference must be internal_only with build_ids[]");
    }
  } else if (record.whats_new !== null) {
    findings.push("whats_new must be null when no customer release identity exists");
  }
  if (["minor_candidate", "major_candidate"].includes(record.classification) && customer === null)
    findings.push(`${record.classification} requires a customer release identity`);
  if (["APPROVED", "PUBLISHED"].includes(record.record_state) && customer !== null) {
    if (/pending/i.test(String(customer?.owner_approval_reference || ""))) findings.push(`${record.record_state} customer release requires a completed owner approval reference`);
    for (const [index, build] of (record.internal_builds || []).entries())
      for (const field of ["ci", "security", "production_checks"])
        if (build?.checks?.[field]?.state !== "PASS") findings.push(`${record.record_state} release requires internal_builds[${index}].checks.${field}.state PASS`);
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
  const build = {
    commit_sha: "a".repeat(40), deployment_id: "dpl_123", environment: "production", release_channel: "production", deployed_at: "2026-09-06T20:00:00Z",
    migration_status: { state: "NOT_APPLICABLE", evidence: [] }, edge_status: { state: "NOT_APPLICABLE", evidence: [] },
    checks: { ci: { state: "PASS", evidence: ["run"] }, security: { state: "PASS", evidence: ["run"] }, production_checks: { state: "PASS", evidence: ["run"] } }, evidence: ["proof"],
  };
  const valid = {
    schema_version: "1.0.0", record_id: "release-0.1.0", record_state: "OWNER_DECISION_PENDING", classification: "minor_candidate", internal_builds: [build],
    scope: ["outcome"], affected_audience: ["solo"], benefits: ["benefit"], limitations: ["limit"], rollback_recovery: { position: "forward fix", reference: "runbook" },
    customer_release_identity: { version: "0.1.0", release_name: "Paige Solo Preview", date: "2026-09-06", owner_approval_reference: "pending" },
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
    ["rejects published release without green production checks", { ...valid, record_state: "PUBLISHED", customer_release_identity: { ...valid.customer_release_identity, owner_approval_reference: "owner-message-123" }, internal_builds: [{ ...build, checks: { ...build.checks, production_checks: { state: "UNVERIFIED", evidence: ["not driven"] } } }] }, true],
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
