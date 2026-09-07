import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyUiChanges,
  isRegistryNamedTarget,
  parseNameStatus,
  pinnedBundlePaths,
  validateEvidenceText,
  verifyPinnedBundle,
} from "../ui-delivery-evidence.mjs";

const coreEvidence = `
UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: affected-flow packet recorded in PR
PAIGE_UI_DESIGN: PASS: project skill and routed references read before work
MATERIAL_FLOW_CHANGE: NO: existing interaction, presentation-only change
FLOW_PROTOTYPE: NOT_REQUIRED: existing interaction, presentation-only change
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: recorded in the attached flow packet
VISUAL_DIRECTION: PASS: established Paige design-system treatment retained
AUTOMATED_EVIDENCE: PASS: focused component tests passed
STATIC_EVIDENCE: PASS: lint, typecheck, and build passed
RENDERED_EVIDENCE: PASS: evidence/ui/change-wide.png
BEHAVIORAL_EVIDENCE: PASS: scripts/live-drive/change-drive.mjs
KEYBOARD_FOCUS: PASS: recorded in the drive transcript
ZOOM_REFLOW: PASS: recorded at 200 percent
REDUCED_MOTION: PASS: media preference exercised
STATE_COVERAGE: PASS: loading, empty, error, retry, permission, success, cancellation, workspace switch
AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated test credential in this environment
TRUTHFUL_STATE_LABELS: NOT_APPLICABLE: this surface shows no capability status
SOLO_UI: NO: shared public surface only
UNVERIFIED: authenticated runtime only
INTERNAL_BUILD_IDENTITY: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; deployment=NOT_APPLICABLE; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=PR-checks
RELEASE_CHANNEL: development: branch checks only
RELEASE_CLASSIFICATION: internal-only: no customer-visible outcome
CUSTOMER_RELEASE_IDENTITY: none: no customer release proposed
RELEASE_NOTE_REQUIRED: NO: internal-only change
RELEASE_TRUTH_BOUNDARY: UNAVAILABLE: no customer-facing release claim
RELEASE_RECOVERY: position=revert exact commit; reference=PR checks and commit history
`;

test("matches complete canonical provider names and deliberate word aliases", () => {
  const names = ["Ledgerly Pro", "Paige Browser"];
  assert.equal(isRegistryNamedTarget("Ledgerly Pro", names), true);
  assert.equal(isRegistryNamedTarget("Ledgerly", names), true);
  assert.equal(isRegistryNamedTarget("Reliably", names), false);
});
test("verifies the pinned upstream bundle against recorded hashes", () => {
  const result = verifyPinnedBundle();

  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("ignores backend, database, and documentation-only changes", () => {
  const result = classifyUiChanges([
    "supabase/functions/example/index.ts",
    "supabase/migrations/20260101000000_example.sql",
    "docs/architecture/example.md",
    "docs/prototypes/flow.html",
    "docs/design-references/prototypes/flow.css",
  ]);

  assert.equal(result.required, false);
  assert.equal(result.solo, false);
});

test("ignores test-only frontend files", () => {
  const result = classifyUiChanges([
    "src/solo/Pipeline.test.tsx",
    "src/components/__tests__/Button.spec.tsx",
  ]);

  assert.equal(result.required, false);
});

test("recognizes product UI, UI TypeScript, styling config, and root HTML", () => {
  const result = classifyUiChanges([
    "src/components/clients/ClientDrawer.tsx",
    "src/solo/setup-subtab-route.ts",
    "tailwind.config.ts",
    "auth.html",
  ]);

  assert.equal(result.required, true);
  assert.equal(result.solo, true);
  assert.deepEqual(result.uiFiles, [
    "src/components/clients/ClientDrawer.tsx",
    "src/solo/setup-subtab-route.ts",
    "tailwind.config.ts",
    "auth.html",
  ]);
});

test("refuses missing evidence when UI files changed", () => {
  const result = validateEvidenceText("", { required: true, solo: false });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /UI delivery evidence file is required/);
});

test("accepts complete non-Solo evidence with an honest unverified label", () => {
  const result = validateEvidenceText(coreEvidence, { required: true, solo: false });

  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("refuses unchecked placeholders and unsupported status words", () => {
  const result = validateEvidenceText(
    coreEvidence.replace(
      "RENDERED_EVIDENCE: PASS: evidence/ui/change-wide.png",
      "RENDERED_EVIDENCE: TODO",
    ),
    { required: true, solo: false },
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /RENDERED_EVIDENCE/);
});

test("refuses missing or placeholder release-governance evidence", () => {
  const missing = validateEvidenceText(coreEvidence.replace(/^RELEASE_RECOVERY:.*\n/m, ""), { required: true, solo: false });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join("\n"), /RELEASE_RECOVERY/);

  const placeholder = validateEvidenceText(coreEvidence.replace(/^INTERNAL_BUILD_IDENTITY:.*$/m, "INTERNAL_BUILD_IDENTITY: REPLACE_ME"), { required: true, solo: false });
  assert.equal(placeholder.ok, false);
  assert.match(placeholder.errors.join("\n"), /INTERNAL_BUILD_IDENTITY/);

  for (const unresolved of ["none", "N/A", "PROOF_OWED", "rollback", "resolved", "position=forward fix; reference=", "position=   ; reference=runbook"]) {
    const recovery = validateEvidenceText(coreEvidence.replace(/^RELEASE_RECOVERY:.*$/m, `RELEASE_RECOVERY: ${unresolved}`), { required: true, solo: false });
    assert.equal(recovery.ok, false, unresolved);
    assert.match(recovery.errors.join("\n"), /RELEASE_RECOVERY/);
  }

  for (const [field, status] of [["AUTHENTICATED_RUNTIME", "UNVERIFIED"], ["RENDERED_EVIDENCE", "UNVERIFIED"], ["KEYBOARD_FOCUS", "NOT_APPLICABLE"]]) {
    const absentReason = validateEvidenceText(coreEvidence.replace(new RegExp(`^${field}:.*$`, "m"), `${field}: ${status}: none`), { required: true, solo: false });
    assert.equal(absentReason.ok, false, field);
    assert.match(absentReason.errors.join("\n"), new RegExp(field));
  }
});

test("binds customer release identity to its classification", () => {
  const internalWithFakeVersion = validateEvidenceText(coreEvidence.replace("CUSTOMER_RELEASE_IDENTITY: none: no customer release proposed", "CUSTOMER_RELEASE_IDENTITY: 9.9.9 — Fake; owner-decision=fake"), { required: true, solo: false });
  assert.equal(internalWithFakeVersion.ok, false);
  assert.match(internalWithFakeVersion.errors.join("\n"), /CUSTOMER_RELEASE_IDENTITY/);

  const validMinor = validateEvidenceText(coreEvidence.replace("RELEASE_CLASSIFICATION: internal-only: no customer-visible outcome", "RELEASE_CLASSIFICATION: minor-candidate: meaningful owner-visible capability").replace("CUSTOMER_RELEASE_IDENTITY: none: no customer release proposed", "CUSTOMER_RELEASE_IDENTITY: 0.2.0 — Governed Capability; owner-decision=PENDING").replace("RELEASE_NOTE_REQUIRED: NO: internal-only change", "RELEASE_NOTE_REQUIRED: YES: minor candidate requires a note"), { required: true, solo: false });
  assert.equal(validMinor.ok, true, validMinor.errors.join("\n"));

  const missingName = validateEvidenceText(coreEvidence.replace("RELEASE_CLASSIFICATION: internal-only: no customer-visible outcome", "RELEASE_CLASSIFICATION: minor-candidate: meaningful owner-visible capability").replace("CUSTOMER_RELEASE_IDENTITY: none: no customer release proposed", "CUSTOMER_RELEASE_IDENTITY: 0.2.0 —    ; owner-decision=PENDING").replace("RELEASE_NOTE_REQUIRED: NO: internal-only change", "RELEASE_NOTE_REQUIRED: YES: minor candidate requires a note"), { required: true, solo: false });
  assert.equal(missingName.ok, false);
  assert.match(missingName.errors.join("\n"), /release name/);

  const wrongMinor = validateEvidenceText(coreEvidence.replace("RELEASE_CLASSIFICATION: internal-only: no customer-visible outcome", "RELEASE_CLASSIFICATION: minor-candidate: meaningful owner-visible capability").replace("CUSTOMER_RELEASE_IDENTITY: none: no customer release proposed", "CUSTOMER_RELEASE_IDENTITY: 0.2.3 — Wrong Shape; owner-decision=PENDING"), { required: true, solo: false });
  assert.equal(wrongMinor.ok, false);
  assert.match(wrongMinor.errors.join("\n"), /Minor-candidate CUSTOMER_RELEASE_IDENTITY/);

  for (const unresolved of ["none", "N/A", "NOT_APPLICABLE", "PROOF_OWED", "unknown", "PENDING_DECISION", "PENDING_APPROVAL", "APPROVAL_PENDING"]) {
    const absentDecision = validateEvidenceText(coreEvidence.replace("RELEASE_CLASSIFICATION: internal-only: no customer-visible outcome", "RELEASE_CLASSIFICATION: minor-candidate: meaningful owner-visible capability").replace("CUSTOMER_RELEASE_IDENTITY: none: no customer release proposed", `CUSTOMER_RELEASE_IDENTITY: 0.2.0 — Governed Capability; owner-decision=${unresolved}`).replace("RELEASE_NOTE_REQUIRED: NO: internal-only change", "RELEASE_NOTE_REQUIRED: YES: minor candidate requires a note"), { required: true, solo: false });
    assert.equal(absentDecision.ok, false, unresolved);
    assert.match(absentDecision.errors.join("\n"), /owner-decision/);
  }
});

test("cross-checks release channel against build environment and deployment", () => {
  const mismatch = validateEvidenceText(coreEvidence.replace("RELEASE_CHANNEL: development: branch checks only", "RELEASE_CHANNEL: production: claimed live"), { required: true, solo: false });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.errors.join("\n"), /Production\/staged RELEASE_CHANNEL/);

  const production = validateEvidenceText(coreEvidence.replace("INTERNAL_BUILD_IDENTITY: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; deployment=NOT_APPLICABLE; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=PR-checks", "INTERNAL_BUILD_IDENTITY: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; deployment=dpl_123; environment=production; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=production-checks").replace("RELEASE_CHANNEL: development: branch checks only", "RELEASE_CHANNEL: production: deployment dpl_123"), { required: true, solo: false });
  assert.equal(production.ok, true, production.errors.join("\n"));
});

test("requires identifiers for applied migration and edge states", () => {
  const bareApplied = validateEvidenceText(coreEvidence.replace("migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE", "migrations=APPLIED; edge=APPLIED"), { required: true, solo: false });
  assert.equal(bareApplied.ok, false);
  assert.match(bareApplied.errors.join("\n"), /complete APPLIED/);

  const nonsense = validateEvidenceText(coreEvidence.replace("migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE", "migrations=banana; edge=APPLIED(   )"), { required: true, solo: false });
  assert.equal(nonsense.ok, false);
  assert.match(nonsense.errors.join("\n"), /migrations must be|edge must be/);

  for (const detail of ["pending", "unknown", "not applicable"]) {
    const unresolved = validateEvidenceText(coreEvidence.replace("migrations=NOT_APPLICABLE", `migrations=PROOF_OWED(${detail})`), { required: true, solo: false });
    assert.equal(unresolved.ok, false, detail);
    assert.match(unresolved.errors.join("\n"), /migrations must be/);
  }

  const exactApplied = validateEvidenceText(coreEvidence.replace("migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE", "migrations=APPLIED(20260907000001_example); edge=APPLIED(paige-example@v3)"), { required: true, solo: false });
  assert.equal(exactApplied.ok, true, exactApplied.errors.join("\n"));

  const placeholders = validateEvidenceText(coreEvidence.replace("migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE", "migrations=APPLIED(20260907000001_TODO); edge=APPLIED(paige_TODO@v1)"), { required: true, solo: false });
  assert.equal(placeholders.ok, false);
  assert.match(placeholders.errors.join("\n"), /migrations must be|edge must be/);
});

test("rejects anticipated production deployment IDs", () => {
  const anticipated = validateEvidenceText(coreEvidence.replace("INTERNAL_BUILD_IDENTITY: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; deployment=NOT_APPLICABLE; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=PR-checks", "INTERNAL_BUILD_IDENTITY: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; deployment=PENDING_DEPLOYMENT; environment=production; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=production-checks").replace("RELEASE_CHANNEL: development: branch checks only", "RELEASE_CHANNEL: production: awaiting deployment"), { required: true, solo: false });
  assert.equal(anticipated.ok, false);
  assert.match(anticipated.errors.join("\n"), /exact deployment ID/);

  for (const sentinel of ["not applicable", "proof owed", "n / a", "latest", "main", "https://example.vercel.app"]) {
    const spaced = validateEvidenceText(coreEvidence.replace("INTERNAL_BUILD_IDENTITY: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; deployment=NOT_APPLICABLE; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=PR-checks", `INTERNAL_BUILD_IDENTITY: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; deployment=${sentinel}; environment=production; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=production-checks`).replace("RELEASE_CHANNEL: development: branch checks only", "RELEASE_CHANNEL: production: claimed live"), { required: true, solo: false });
    assert.equal(spaced.ok, false, sentinel);
    assert.match(spaced.errors.join("\n"), /exact deployment ID/);
  }
});

test("requires substantive build-identity evidence", () => {
  for (const evidence of ["none", "PROOF_OWED"]) {
    const result = validateEvidenceText(coreEvidence.replace("evidence=PR-checks", `evidence=${evidence}`), { required: true, solo: false });
    assert.equal(result.ok, false, evidence);
    assert.match(result.errors.join("\n"), /substantive link or reproducible reference/);
  }
});

test("requires notes for minor and major candidates", () => {
  const minorWithoutNote = validateEvidenceText(coreEvidence.replace("RELEASE_CLASSIFICATION: internal-only: no customer-visible outcome", "RELEASE_CLASSIFICATION: minor-candidate: meaningful owner-visible capability").replace("CUSTOMER_RELEASE_IDENTITY: none: no customer release proposed", "CUSTOMER_RELEASE_IDENTITY: 0.2.0 — Governed Capability; owner-decision=PENDING"), { required: true, solo: false });
  assert.equal(minorWithoutNote.ok, false);
  assert.match(minorWithoutNote.errors.join("\n"), /require RELEASE_NOTE_REQUIRED: YES/);
});

test("requires a claim boundary after the release truth status", () => {
  const bareStatus = validateEvidenceText(coreEvidence.replace("RELEASE_TRUTH_BOUNDARY: UNAVAILABLE: no customer-facing release claim", "RELEASE_TRUTH_BOUNDARY: LIVE"), { required: true, solo: false });
  assert.equal(bareStatus.ok, false);
  assert.match(bareStatus.errors.join("\n"), /claim boundary/);

  const noValue = validateEvidenceText(coreEvidence.replace("RELEASE_TRUTH_BOUNDARY: UNAVAILABLE: no customer-facing release claim", "RELEASE_TRUTH_BOUNDARY: LIVE: none"), { required: true, solo: false });
  assert.equal(noValue.ok, false);
  assert.match(noValue.errors.join("\n"), /claim boundary/);
});

test("requires complete staged-rollout evidence", () => {
  const stagedBase = coreEvidence.replace("INTERNAL_BUILD_IDENTITY: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; deployment=NOT_APPLICABLE; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=PR-checks", "INTERNAL_BUILD_IDENTITY: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; deployment=dpl_123; environment=production; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=production-checks");
  const incomplete = validateEvidenceText(stagedBase.replace("RELEASE_CHANNEL: development: branch checks only", "RELEASE_CHANNEL: staged: deployment dpl_123"), { required: true, solo: false });
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.errors.join("\n"), /Staged RELEASE_CHANNEL requires/);

  const pendingApproval = validateEvidenceText(stagedBase.replace("RELEASE_CHANNEL: development: branch checks only", "RELEASE_CHANNEL: staged: owner-approval=pending; eligibility= ; amount= ; start= ; stop= ; monitoring-owner= ; recovery=disable cohort"), { required: true, solo: false });
  assert.equal(pendingApproval.ok, false);
  assert.match(pendingApproval.errors.join("\n"), /completed non-placeholder owner-approval/);

  const completeMetadata = "owner-approval=owner-message; eligibility=named cohort; amount=10 percent; start=owner approval; stop=error budget; monitoring-owner=release owner; recovery=disable cohort";
  for (const [key, value] of [["owner-approval", "PENDING_DECISION"], ["eligibility", "NOT_APPLICABLE"], ["amount", "N_A"], ["recovery", "PROOF_OWED"]]) {
    const invalidMetadata = completeMetadata.replace(new RegExp(`${key}=[^;]+`), `${key}=${value}`);
    const staged = validateEvidenceText(stagedBase.replace("RELEASE_CHANNEL: development: branch checks only", `RELEASE_CHANNEL: staged: ${invalidMetadata}`), { required: true, solo: false });
    assert.equal(staged.ok, false, `${key}=${value}`);
    assert.match(staged.errors.join("\n"), new RegExp(`non-placeholder ${key}`));
  }

  const complete = validateEvidenceText(stagedBase.replace("RELEASE_CHANNEL: development: branch checks only", "RELEASE_CHANNEL: staged: owner-approval=owner-message; eligibility=named cohort; amount=10 percent; start=owner approval; stop=error budget; monitoring-owner=release owner; recovery=disable cohort"), { required: true, solo: false });
  assert.equal(complete.ok, true, complete.errors.join("\n"));
});

test("requires Flow Prototype evidence for a material flow change", () => {
  const result = validateEvidenceText(
    coreEvidence
      .replace(
        "MATERIAL_FLOW_CHANGE: NO: existing interaction, presentation-only change",
        "MATERIAL_FLOW_CHANGE: YES: adds a destructive confirmation flow",
      )
      .replace(
        "FLOW_PROTOTYPE: NOT_REQUIRED: existing interaction, presentation-only change",
        "FLOW_PROTOTYPE: NOT_REQUIRED: skipped",
      ),
    { required: true, solo: false },
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /FLOW_PROTOTYPE/);
});

test("refuses placeholders even when the status word looks valid", () => {
  const result = validateEvidenceText(
    coreEvidence.replace("RENDERED_EVIDENCE: PASS: evidence/ui/change-wide.png", "RENDERED_EVIDENCE: PASS: TODO"),
    { required: true, solo: false },
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /RENDERED_EVIDENCE/);
});

test("rejects unresolved values after PASS", () => {
  for (const evidence of ["FLOW_BY_FLOW: PASS: pending", "AUTOMATED_EVIDENCE: PASS: none", "AUTOMATED_EVIDENCE: PASS: proof pending", "AUTHENTICATED_RUNTIME: PASS: unknown result", "AUTOMATED_EVIDENCE: PASS: proof pending; evidence/ui/pending-state.png", "AUTOMATED_EVIDENCE: PASS: pending:evidence/ui/foo.png"]) {
    const [field] = evidence.split(":");
    const result = validateEvidenceText(coreEvidence.replace(new RegExp(`^${field}:.*$`, "m"), evidence), { required: true, solo: false });
    assert.equal(result.ok, false, evidence);
  }

  const validStatePath = validateEvidenceText(coreEvidence.replace("RENDERED_EVIDENCE: PASS: screenshot", "RENDERED_EVIDENCE: PASS: evidence/ui/pending-state.png"), { required: true, solo: false });
  assert.equal(validStatePath.ok, true, validStatePath.errors.join("\n"));

  const honestUnverified = validateEvidenceText(coreEvidence.replace("AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated test credential in this environment", "AUTHENTICATED_RUNTIME: UNVERIFIED: approval pending for production tenant access"), { required: true, solo: false });
  assert.equal(honestUnverified.ok, true, honestUnverified.errors.join("\n"));

  const explicitCause = validateEvidenceText(coreEvidence.replace("AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated test credential in this environment", "AUTHENTICATED_RUNTIME: UNVERIFIED: production tenant credentials unavailable; runtime proof pending"), { required: true, solo: false });
  assert.equal(explicitCause.ok, true, explicitCause.errors.join("\n"));

  for (const targetedInability of ["runtime proof pending; unable to access Okta", "runtime proof pending; cannot test Stripe", "runtime proof pending; unable to access Grammarly", "runtime proof pending; unable to access Calendly", "runtime proof pending; unable to access Fly"]){
    const explicitTargetedInability = validateEvidenceText(coreEvidence.replace("AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated test credential in this environment", `AUTHENTICATED_RUNTIME: UNVERIFIED: ${targetedInability}`), { required: true, solo: false });
    assert.equal(explicitTargetedInability.ok, true, explicitTargetedInability.errors.join("\n"));
  }

  for (const credentialCause of ["production credentials expired; runtime proof pending", "credentials revoked; proof pending", "API key expired; runtime proof pending", "OAuth token revoked; proof pending", "production API timed out; runtime proof pending", "production API unreachable; runtime proof pending", "API rate limit prevented testing; runtime proof pending"]){
    const explicitCredentialCause = validateEvidenceText(coreEvidence.replace("AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated test credential in this environment", `AUTHENTICATED_RUNTIME: UNVERIFIED: ${credentialCause}`), { required: true, solo: false });
    assert.equal(explicitCredentialCause.ok, true, explicitCredentialCause.errors.join("\n"));
  }

  for (const sentenceCause of ["production tenant credentials unavailable. Runtime proof pending", "production tenant credentials unavailable – runtime proof pending"]){
    const explicitSentenceCause = validateEvidenceText(coreEvidence.replace("AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated test credential in this environment", `AUTHENTICATED_RUNTIME: UNVERIFIED: ${sentenceCause}`), { required: true, solo: false });
    assert.equal(explicitSentenceCause.ok, true, explicitSentenceCause.errors.join("\n"));
  }

  const bareUnverified = validateEvidenceText(coreEvidence.replace("AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated test credential in this environment", "AUTHENTICATED_RUNTIME: UNVERIFIED: pending"), { required: true, solo: false });
  assert.equal(bareUnverified.ok, false);
  for (const unresolvedReason of ["proof pending", "unknown result", "proof is still currently pending", "result remains entirely unknown", "proof pending for pending verification", "proof pending later validation", "proof pending, status unchanged", "proof pending. Status remains unchanged", "API key status unchanged; runtime proof pending", "runtime proof pending; cannot verify", "runtime proof pending; unable to verify", "runtime proof pending; cannot test", "runtime proof pending; unable to access", "runtime proof pending; cannot test successfully", "runtime proof pending; cannot test it", "runtime proof pending; unable to access directly", "runtime proof pending; cannot test It", "runtime proof pending; cannot test Successfully", "runtime proof pending; unable to access Directly", "runtime proof pending; cannot test Reliably", "runtime proof pending; cannot test Easily", "runtime proof pending; cannot test Securely"]) {
    const unresolvedNonPass = validateEvidenceText(coreEvidence.replace("AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated test credential in this environment", `AUTHENTICATED_RUNTIME: UNVERIFIED: ${unresolvedReason}`), { required: true, solo: false });
    assert.equal(unresolvedNonPass.ok, false, unresolvedReason);
  }

  const unknownNotApplicable = validateEvidenceText(coreEvidence.replace("AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated test credential in this environment", "AUTHENTICATED_RUNTIME: NOT_APPLICABLE: unknown result"), { required: true, solo: false });
  assert.equal(unknownNotApplicable.ok, false);
});

test("rejects unresolved tokens in UI applied identifiers", () => {
  for (const [field, applied] of [["migrations", "APPLIED(20260907000001_PROOF_OWED)"], ["edge", "APPLIED(none@v1)"]]) {
    const result = validateEvidenceText(coreEvidence.replace(`${field}=NOT_APPLICABLE`, `${field}=${applied}`), { required: true, solo: false });
    assert.equal(result.ok, false, `${field}=${applied}`);
    assert.match(result.errors.join("\n"), new RegExp(`${field} must be`));
  }
});

test("requires every Solo viewport with PAIGE closed and open", () => {
  const result = validateEvidenceText(coreEvidence, { required: true, solo: true });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /SOLO_1536X770_PAIGE_CLOSED/);
  assert.match(result.errors.join("\n"), /SOLO_900X1000_PAIGE_OPEN/);
});

test("accepts complete Solo viewport evidence", () => {
  const soloEvidence = `${coreEvidence.replace(
    "SOLO_UI: NO: shared public surface only",
    "SOLO_UI: YES: canonical Solo shell surface",
  )}
SOLO_1536X770_PAIGE_CLOSED: PASS: evidence/ui/1536-closed.png
SOLO_1536X770_PAIGE_OPEN: PASS: evidence/ui/1536-open.png
SOLO_1366X768_PAIGE_CLOSED: PASS: evidence/ui/1366-closed.png
SOLO_1366X768_PAIGE_OPEN: PASS: evidence/ui/1366-open.png
SOLO_1024X768_PAIGE_CLOSED: PASS: evidence/ui/1024-closed.png
SOLO_1024X768_PAIGE_OPEN: PASS: evidence/ui/1024-open.png
SOLO_900X1000_PAIGE_CLOSED: PASS: evidence/ui/900-closed.png
SOLO_900X1000_PAIGE_OPEN: PASS: evidence/ui/900-open.png
`;

  const result = validateEvidenceText(soloEvidence, { required: true, solo: true });

  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("pins every vendored source, license, and notice file", () => {
  assert.deepEqual(pinnedBundlePaths, [
    ".agents/skills/paige-ui-design/vendor/frontend-design/SKILL.md",
    ".agents/skills/paige-ui-design/vendor/frontend-design/references/accessibility-checklist.md",
    ".agents/skills/paige-ui-design/vendor/frontend-design/scripts/contrast-checker.py",
    ".agents/skills/paige-ui-design/vendor/frontend-design/LICENSE.txt",
    ".agents/skills/paige-ui-design/vendor/frontend-design/LICENSE-APACHE-2.0.txt",
    ".agents/skills/paige-ui-design/vendor/frontend-design/LICENSE-GITHUB-MIT.txt",
    ".agents/skills/paige-ui-design/vendor/frontend-design/THIRD_PARTY_NOTICES.md",
  ]);
});

test("recognizes deleted UI and requires a newly added evidence record", () => {
  const deletedUi = classifyUiChanges([
    { status: "D", path: "src/components/clients/OldDrawer.tsx" },
    { status: "M", path: "docs/evidence/ui-delivery/old-record.md" },
  ]);

  assert.equal(deletedUi.required, true);
  assert.deepEqual(deletedUi.uiFiles, ["src/components/clients/OldDrawer.tsx"]);
  assert.deepEqual(deletedUi.evidenceFiles, []);

  const withNewRecord = classifyUiChanges([
    { status: "D", path: "src/components/clients/OldDrawer.tsx" },
    { status: "A", path: "docs/evidence/ui-delivery/delete-old-drawer.md" },
  ]);
  assert.deepEqual(withNewRecord.evidenceFiles, ["docs/evidence/ui-delivery/delete-old-drawer.md"]);
});

test("recognizes UI assets, embedded scripts, media, and canonical Solo owners", () => {
  const result = classifyUiChanges([
    "src/assets/hero-banner.jpg",
    "public/embed.js",
    "public/paige-motion.glb",
    "src/components/tenant-relationships/TenantRelationshipsClientsWorkspace.tsx",
  ]);

  assert.equal(result.required, true);
  assert.equal(result.solo, true);
});

test("refuses an untouched evidence template", () => {
  const template = readFileSync("docs/evidence/ui-delivery/TEMPLATE.md", "utf8");
  const result = validateEvidenceText(template, { required: true, solo: false });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /FLOW_BY_FLOW|PAIGE_UI_DESIGN|MATERIAL_FLOW_CHANGE/);
});

test("recognizes every tracked Solo naming shape", () => {
  const result = classifyUiChanges([
    "src/solo-drive-entry.tsx",
    "src/pages/admin/conversations/solo/SoloConversationsWorkspace.tsx",
    "src/pages/admin/conversations/solo/SoloConversationsWorkspace.css",
    "src/pages/admin/conversations/solo/soloConversationModel.ts",
  ]);

  assert.equal(result.required, true);
  assert.equal(result.solo, true);
});

test("a UI rename across the recognized boundary keeps both paths", () => {
  const changes = parseNameStatus(
    "R100\tsrc/components/clients/OldDrawer.tsx\tdocs/retired/OldDrawer.tsx\n",
  );
  const result = classifyUiChanges(changes);

  assert.deepEqual(changes, [
    { status: "R", path: "src/components/clients/OldDrawer.tsx" },
    { status: "R", path: "docs/retired/OldDrawer.tsx" },
  ]);
  assert.equal(result.required, true);
  assert.deepEqual(result.uiFiles, ["src/components/clients/OldDrawer.tsx"]);
});
