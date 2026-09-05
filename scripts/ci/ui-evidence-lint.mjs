#!/usr/bin/env node
/**
 * ui-evidence-lint.mjs — the Paige UI Delivery guardrail (owner standard, 2026-09-05).
 *
 * WHY: A PR that changes a visible interface must carry the UI Delivery Evidence attestation, so the
 * rendered + behavioral evidence exists and is reviewable (Rule 5 / §32 / §70). This is a GUARDRAIL,
 * not proof: it forces the attestation to be present and non-empty; it cannot certify the agent truly
 * used the skills or that the feature works. That certainty comes from a human/adversarial review of
 * the evidence the attestation points at. A ticked checkbox is deliberately NOT accepted as proof.
 *
 * NARROWLY TARGETED (the boundary that matters):
 *   - It fires ONLY when the PR diff adds/modifies a SHIPPED UI file:
 *       a shipped UI file: src/ tsx or css (globbed in code below)
 *     excluding tests (*.test.*, *.spec.*), stories (*.stories.*), and anything under __tests__/.
 *   - Database-only, edge-function-only, documentation-only, test-only, script/CI-only, and any
 *     other backend-only PR is a NO-OP PASS. A pure-logic src ts change (renders nothing) is
 *     also a no-op — the trigger is .tsx/.css, where visible interface actually lives.
 *
 * SATISFIED when a UI change carries EITHER:
 *   (a) an attestation block in the PR body with a `UI-Delivery-Evidence:` marker AND a non-empty,
 *       non-placeholder `Rendered:` line AND a non-empty, non-placeholder `Behavioral:` line
 *       (an honest `UNVERIFIED: <reason>` / `UNAVAILABLE: <reason>` value is accepted — a silent gap
 *       is not); OR
 *   (b) an explicit `UI-Delivery-Exempt: <reason>` line (reason required) for a src .tsx/.css change
 *       that is genuinely not a visible-interface change.
 *
 * The PR body is read from the PR_BODY env (CI passes github.event.pull_request.body). Changed files
 * are computed from BASE_REF (merge-base) vs HEAD. PR-only: a push to main has no PR body, so the CI
 * step is gated to pull_request events.
 *
 * Dependency-free + regex-based so it runs anywhere `node` runs. `--self-test` runs inline fixtures.
 */

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);

/** A shipped UI file: src tsx/css, excluding tests/stories. */
export function isUiFile(path) {
  if (!/^src\/.*\.(tsx|css)$/.test(path)) return false;
  if (/\.(test|spec)\.[tj]sx?$/.test(path)) return false;
  if (/\.stories\.[tj]sx?$/.test(path)) return false;
  if (/(^|\/)__tests__\//.test(path)) return false;
  return true;
}

const PLACEHOLDER = /^(<.*>|todo|tbd|t\.b\.d\.?|n\/a|na|\.\.\.|-+|xxx+)$/i;

/** Is an evidence value real (not empty, not the unfilled template placeholder)? */
function isRealValue(v) {
  const t = (v ?? "").trim();
  if (t.length < 10) return false; // a real answer is more than a word
  if (PLACEHOLDER.test(t)) return false;
  if (/^<.*>$/.test(t)) return false; // any angle-bracket template placeholder
  return true;
}

/** Pull the value after a `Label:` marker anywhere in the body (first match). */
function fieldValue(body, label) {
  const re = new RegExp(`${label}\\s*:?[ \\t]*(.+)`, "i");
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Decide whether a UI PR carries the required evidence.
 * @param {{changedFiles:string[], prBody:string}} input
 * @returns {{required:boolean, satisfied:boolean, uiFiles:string[], reasons:string[]}}
 */
export function evaluate({ changedFiles, prBody }) {
  const uiFiles = (changedFiles ?? []).filter(isUiFile);
  const reasons = [];

  if (uiFiles.length === 0) {
    return { required: false, satisfied: true, uiFiles, reasons: ["no shipped UI files changed — no-op pass"] };
  }

  const body = prBody ?? "";

  // (b) explicit exemption
  const exempt = fieldValue(body, "UI-Delivery-Exempt");
  if (exempt !== null) {
    if (isRealValue(exempt)) {
      return { required: true, satisfied: true, uiFiles, reasons: [`exempt: ${exempt.slice(0, 120)}`] };
    }
    reasons.push("UI-Delivery-Exempt present but its reason is empty or a placeholder");
  }

  // (a) attestation block
  const hasMarker = /UI[- ]Delivery[- ]Evidence\s*:?/i.test(body);
  if (!hasMarker) {
    reasons.push("no `UI-Delivery-Evidence:` attestation block in the PR body (and no valid exemption)");
    return { required: true, satisfied: false, uiFiles, reasons };
  }

  const rendered = fieldValue(body, "Rendered");
  const behavioral = fieldValue(body, "Behavioral");
  if (!isRealValue(rendered)) {
    reasons.push(`\`Rendered:\` line is missing, empty, or a placeholder${rendered ? ` ("${rendered.slice(0, 60)}")` : ""}`);
  }
  if (!isRealValue(behavioral)) {
    reasons.push(`\`Behavioral:\` line is missing, empty, or a placeholder${behavioral ? ` ("${behavioral.slice(0, 60)}")` : ""}`);
  }

  const satisfied = isRealValue(rendered) && isRealValue(behavioral);
  if (satisfied) reasons.push("attestation present with real Rendered + Behavioral evidence");
  return { required: true, satisfied, uiFiles, reasons };
}

/* ─────────────────────────────── self-test ─────────────────────────────── */

const GOOD_BLOCK = `
## UI Delivery Evidence
UI-Delivery-Evidence: yes
Skills-used: flow-by-flow, paige-ui-delivery, flow-prototype
Rendered: 1536×770, 1366×768, 1024×768, 900×1000 — one scroll owner, no clip, focus visible
Behavioral: drove record→save→reload; value persisted; cancel + permission-denied paths work
State-labels: accounts LIVE, waiting PARTIAL, placements UNAVAILABLE
`;

const HONEST_UNVERIFIED = `
UI-Delivery-Evidence: yes
Rendered: UNVERIFIED: no browser in this session; owed to next capable session (§32.c)
Behavioral: UNVERIFIED: authenticated live drive owed — headless CI cannot reach the auth surface
`;

const ONLY_CHECKBOXES = `
## UI Delivery Evidence
UI-Delivery-Evidence: yes
- [x] I designed it
- [ ] Rendered
- [ ] Behavioral
`;

const UNFILLED_TEMPLATE = `
UI-Delivery-Evidence: yes
Rendered: <viewports checked + result, or "UNVERIFIED: <reason>">
Behavioral: <flow driven end to end + result, or "UNVERIFIED: <reason>">
`;

function selfTest() {
  const cases = [
    { name: "UI + good block", in: { changedFiles: ["src/solo/social-command.tsx"], prBody: GOOD_BLOCK }, want: { required: true, satisfied: true } },
    { name: "UI css + good block", in: { changedFiles: ["src/solo/social-command.css"], prBody: GOOD_BLOCK }, want: { required: true, satisfied: true } },
    { name: "UI + honest UNVERIFIED", in: { changedFiles: ["src/solo/x.tsx"], prBody: HONEST_UNVERIFIED }, want: { required: true, satisfied: true } },
    { name: "UI + exemption", in: { changedFiles: ["src/solo/x.tsx"], prBody: "UI-Delivery-Exempt: pure prop-type rename, no rendered change; verified in diff" }, want: { required: true, satisfied: true } },
    { name: "UI + NO block", in: { changedFiles: ["src/solo/x.tsx"], prBody: "Fixed a thing." }, want: { required: true, satisfied: false } },
    { name: "UI + only checkboxes", in: { changedFiles: ["src/solo/x.tsx"], prBody: ONLY_CHECKBOXES }, want: { required: true, satisfied: false } },
    { name: "UI + unfilled template", in: { changedFiles: ["src/solo/x.tsx"], prBody: UNFILLED_TEMPLATE }, want: { required: true, satisfied: false } },
    { name: "UI + empty exemption reason", in: { changedFiles: ["src/solo/x.tsx"], prBody: "UI-Delivery-Exempt: <why>" }, want: { required: true, satisfied: false } },
    { name: "DB-only migration", in: { changedFiles: ["supabase/migrations/20260101_x.sql"], prBody: "" }, want: { required: false, satisfied: true } },
    { name: "edge-fn-only", in: { changedFiles: ["supabase/functions/paige-tts/index.ts"], prBody: "" }, want: { required: false, satisfied: true } },
    { name: "docs-only", in: { changedFiles: ["docs/paige-ui-delivery/README.md"], prBody: "" }, want: { required: false, satisfied: true } },
    { name: "test-only tsx", in: { changedFiles: ["src/solo/social-command.render.test.tsx"], prBody: "" }, want: { required: false, satisfied: true } },
    { name: "stories-only", in: { changedFiles: ["src/solo/x.stories.tsx"], prBody: "" }, want: { required: false, satisfied: true } },
    { name: "__tests__ dir", in: { changedFiles: ["src/__tests__/x.tsx"], prBody: "" }, want: { required: false, satisfied: true } },
    { name: "pure-logic ts", in: { changedFiles: ["src/solo/social-truth.ts"], prBody: "" }, want: { required: false, satisfied: true } },
    { name: "script/ci-only", in: { changedFiles: ["scripts/ci/ui-evidence-lint.mjs"], prBody: "" }, want: { required: false, satisfied: true } },
    { name: "mixed UI+backend needs block", in: { changedFiles: ["supabase/migrations/x.sql", "src/solo/x.tsx"], prBody: "no block" }, want: { required: true, satisfied: false } },
  ];

  let ok = true;
  for (const c of cases) {
    const got = evaluate(c.in);
    const pass = got.required === c.want.required && got.satisfied === c.want.satisfied;
    if (!pass) {
      ok = false;
      console.error(`SELF-TEST FAIL: ${c.name} — want ${JSON.stringify(c.want)}, got {required:${got.required}, satisfied:${got.satisfied}} :: ${got.reasons.join("; ")}`);
    } else {
      console.log(`  ok  ${c.name}`);
    }
  }
  console.log(ok ? "SELF-TEST: PASS — ui-evidence guardrail behaves correctly." : "SELF-TEST: FAIL.");
  return ok;
}

/* ─────────────────────────────── CLI ─────────────────────────────── */

function changedFilesFromGit() {
  const base = process.env.BASE_REF || process.env.BASE || "";
  const head = process.env.HEAD_REF || "HEAD";
  let range;
  if (base) {
    range = `${base} ${head}`;
  } else {
    // Local fallback: try merge-base with origin/main; if that fails, we cannot determine the set.
    try {
      const mb = execSync("git merge-base origin/main HEAD", { encoding: "utf8" }).trim();
      range = `${mb} HEAD`;
    } catch {
      return null;
    }
  }
  try {
    const out = execSync(`git diff --name-only --diff-filter=AMR ${range}`, { encoding: "utf8" });
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    console.error(`[ui-evidence-lint] git diff failed: ${e.message}`);
    return null;
  }
}

function main() {
  if (process.argv.slice(2).includes("--self-test")) {
    process.exit(selfTest() ? 0 : 1);
  }

  const changedFiles = changedFilesFromGit();
  if (changedFiles === null) {
    console.log("✓ ui-evidence-lint: could not determine changed files (no BASE_REF, no origin/main); skipping. CI provides BASE_REF.");
    process.exit(0);
  }

  const prBody = process.env.PR_BODY ?? "";
  const { required, satisfied, uiFiles, reasons } = evaluate({ changedFiles, prBody });

  if (!required) {
    console.log("✓ ui-evidence-lint: no shipped UI files changed — no-op pass (backend/DB/docs/test/tooling).");
    process.exit(0);
  }

  if (satisfied) {
    console.log(`✓ ui-evidence-lint: ${uiFiles.length} UI file(s) changed; attestation present. (${reasons.join("; ")})`);
    process.exit(0);
  }

  console.error("");
  console.error("✗ ui-evidence-lint FAILED — this PR changes shipped UI but carries no UI Delivery Evidence:");
  for (const f of uiFiles) console.error(`    • ${f}`);
  console.error("");
  for (const r of reasons) console.error(`    - ${r}`);
  console.error("");
  console.error("  Add the UI Delivery Evidence block to the PR body (see docs/PULL_REQUEST_TEMPLATE.md");
  console.error("  and docs/paige-ui-delivery/UI-EVIDENCE-TEMPLATE.md). Required non-placeholder lines:");
  console.error("    UI-Delivery-Evidence: yes");
  console.error("    Rendered:   <viewports checked + result, or 'UNVERIFIED: <reason>'>");
  console.error("    Behavioral: <flow driven end to end + result, or 'UNVERIFIED: <reason>'>");
  console.error("  A ticked checkbox is not accepted (Rule 5 — it renders ≠ it works).");
  console.error("  If these src changes are genuinely NOT a visible-interface change, add instead:");
  console.error("    UI-Delivery-Exempt: <specific reason>");
  console.error("");
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
