import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyUiChanges,
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
`;

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
    "src/assets/paige-logo.jpg",
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
