import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { compileCanonicalReleaseSchema } from "../ci/release-governance-lint.mjs";
import { resolveCustomerUpdateManifest } from "./customer-update-manifest.mjs";

const validateCanonicalSchema = compileCanonicalReleaseSchema(JSON.parse(fs.readFileSync(new URL("../../docs/release-governance/release-record.schema.json", import.meta.url), "utf8")));

const build = {
  commit_sha: "a".repeat(40),
  deployment_id: "deployment-123",
  environment: "production",
  release_channel: "production",
  customer_release_scope: "referenced",
  deployed_at: "2026-09-06T20:00:00Z",
  staged_rollout: null,
  migration_status: { state: "NOT_APPLICABLE", evidence: [], identifiers: [], proof_owed: null },
  edge_status: { state: "PROOF_OWED", evidence: ["Authenticated edge interaction proof is pending"], identifiers: [], proof_owed: { boundary: "Authenticated edge interaction proof is pending", excluded_from_live_claim: "Authenticated edge-backed interaction" } },
  proof_boundaries: [],
  checks: {
    ci: { state: "PASS", evidence: ["ci"] },
    security: { state: "PASS", evidence: ["security"] },
    production_checks: { state: "PASS", evidence: ["production"] },
  },
  evidence: ["evidence"],
};

const release = {
  schema_version: "1.0.0",
  record_id: "release-0.1.0",
  record_state: "PUBLISHED",
  history: null,
  classification: "minor_candidate",
  internal_builds: [build],
  scope: ["governed workspace"],
  affected_audience: ["Solo owners"],
  benefits: ["Clearer workspace"],
  limitations: ["Authenticated production proof remains owed"],
  rollback_recovery: { position: "forward fix", reference: "runbook" },
  customer_release_identity: {
    version: "0.1.0",
    release_name: "Paige Solo Preview",
    date: "2026-09-06",
    owner_approval: {
      approval_id: "customer-publication-owner-message-123",
      scope: "customer_publication",
      status: "APPROVED",
      reference: "owner-message-123",
    },
  },
  whats_new: {
    customer_outcome: "Your governed workspace foundations are ready to use.",
    what_changed: "The approved foundation is available in your workspace.",
    who_can_use_it: "Solo owners included in this release.",
    owner_action: "Reload when you are ready.",
    status: ["PARTIAL", "PROOF OWED"],
    known_limitations: "Authenticated production proof remains owed.",
    proof_owed: { visibility: "customer_and_internal", source: "referenced_builds.proof_boundaries_or_delivery_status.proof_owed" },
    safe_next_step: "Use only the available workspace actions.",
    technical_release_reference: {
      visibility: "internal_only",
      source: "internal_builds.customer_release_scope=referenced",
    },
    paige_readable_summary: "The approved foundation is available with stated limits.",
  },
};

const resolve = (records, buildId = `${"a".repeat(40)}-build`) =>
  resolveCustomerUpdateManifest({ records, buildId, validateCanonicalSchema, now: new Date("2026-09-07T00:00:00Z") });

test("publishes only customer-safe fields for the exact referenced build", () => {
  const result = resolve([release]);
  assert.deepEqual(result, {
    schemaVersion: 1,
    releaseName: "Paige Solo Preview",
    version: "0.1.0",
    date: "2026-09-06",
    customerOutcome: release.whats_new.customer_outcome,
    whatChanged: release.whats_new.what_changed,
    whoCanUseIt: release.whats_new.who_can_use_it,
    ownerAction: release.whats_new.owner_action,
    status: ["PARTIAL", "PROOF OWED"],
    knownLimitations: release.whats_new.known_limitations,
    safeNextStep: release.whats_new.safe_next_step,
  });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /deployment-123|a{40}|owner-message|runbook|internal_only/);
});

test("fails closed for a routine build with no customer release", () => {
  assert.equal(resolve([]), null);
  assert.equal(resolve([release], `${"b".repeat(40)}-build`), null);
});

test("fails closed for staged or stale build identity without owner eligibility", () => {
  assert.equal(resolve([{ ...release, internal_builds: [{ ...build, release_channel: "staged", staged_rollout: { owner_approval: { approval_id: "staged-rollout-owner-message-456", scope: "staged_rollout", status: "APPROVED", reference: "owner-message-456" }, eligibility_rule: "named cohort", rollout_amount: "10%", start_condition: "approved", stop_condition: "error threshold", monitoring_owner: "release owner", recovery_path: "disable cohort" } }] }]), null);
  assert.equal(resolve([release], `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-newer-build`), null);
});

test("fails closed unless publication and customer approval are final", () => {
  assert.equal(resolve([{ ...release, record_state: "APPROVED" }]), null);
  assert.equal(resolve([{ ...release, customer_release_identity: { ...release.customer_release_identity, owner_approval: { ...release.customer_release_identity.owner_approval, status: "PENDING" } } }]), null);
});

test("fails closed for invalid, ambiguous, future, or superseded records", () => {
  assert.equal(resolve([{ ...release, unexpected: true }]), null);
  assert.equal(resolve([release, { ...release, record_id: "release-duplicate", internal_builds: [{ ...build, deployment_id: "deployment-456" }] }]), null);
  assert.equal(resolve([{ ...release, customer_release_identity: { ...release.customer_release_identity, date: "2026-09-08" } }]), null);
  const correction = {
    ...release,
    record_id: "release-0.1.0-retracted",
    record_state: "RETRACTED",
    history: { supersedes_record_id: release.record_id, reason: "Publication withdrawn", corrected_values: [] },
  };
  assert.equal(resolve([release, correction]), null);
});

test("fails closed when customer fields contain internal technical references", () => {
  const exposed = {
    ...release,
    whats_new: { ...release.whats_new, what_changed: `Commit ${"a".repeat(40)} deployed through Vercel.` },
  };
  assert.equal(resolve([exposed]), null);
});

test("accepts an approved current correction and excludes its superseded predecessor", () => {
  const corrected = {
    ...release,
    record_id: "release-0.1.0-correction",
    record_state: "CORRECTED",
    scope: ["governed workspace foundations"],
    history: {
      supersedes_record_id: release.record_id,
      reason: "Corrected the release scope description",
      corrected_values: [{
        field_path: "/scope/0",
        previous_exists: true,
        previous_value: "governed workspace",
        replacement_exists: true,
        replacement_value: "governed workspace foundations",
      }],
    },
  };
  assert.equal(resolve([release, corrected])?.releaseName, "Paige Solo Preview");
});

test("allows an approved release on its effective calendar date", () => {
  const result = resolveCustomerUpdateManifest({
    records: [release],
    buildId: `${"a".repeat(40)}-build`,
    validateCanonicalSchema,
    now: new Date("2026-09-06T00:00:00Z"),
  });
  assert.equal(result?.version, "0.1.0");
});

test("fails closed without the canonical schema validator or for schema-only invalid data", () => {
  assert.equal(resolveCustomerUpdateManifest({ records: [release], buildId: `${"a".repeat(40)}-build` }), null);
  assert.equal(resolve([{ ...release, scope: ["add link"] }]), null);
});
test("fails closed when a correction descends only from an unpublished record", () => {
  const approvedOnly = { ...release, record_id: "release-approved-only", record_state: "APPROVED" };
  const corrected = {
    ...release,
    record_id: "release-approved-only-correction",
    record_state: "CORRECTED",
    scope: ["governed workspace foundations"],
    history: {
      supersedes_record_id: approvedOnly.record_id,
      reason: "Corrected the approved candidate scope description",
      corrected_values: [{
        field_path: "/scope/0",
        previous_exists: true,
        previous_value: "governed workspace",
        replacement_exists: true,
        replacement_value: "governed workspace foundations",
      }],
    },
  };
  assert.equal(resolve([approvedOnly, corrected]), null);
});