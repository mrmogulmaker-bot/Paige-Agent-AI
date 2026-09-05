import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const UI_EXTENSIONS = /\.(?:tsx|jsx|css|scss|sass|less|html)$/i;
const UI_TYPESCRIPT_PATH = /^(?:src\/(?:components|pages|routes|solo)\/|src\/operator\/(?:ia|shell|surfaces)\/|src\/lib\/routing\/).+\.ts$/i;
const UI_ASSET_EXTENSIONS = /\.(?:svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|mp4|webm|glb|gltf|splinecode)$/i;
const PUBLIC_UI_EXTENSIONS = /\.(?:html|css|js|mjs|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|mp4|webm|glb|gltf|splinecode)$/i;
const UI_CONFIG_FILES = new Set([
  "postcss.config.js",
  "tailwind.config.ts",
]);
const ROOT_UI_FILES = new Set([
  "analytics-drive.html",
  "auth.html",
  "index.html",
  "privacy.html",
  "sms-terms.html",
  "solo-drive.html",
]);
const TEST_ONLY = /(?:^|\/)(?:__tests__|test|tests|fixtures|snapshots)(?:\/|$)|\.(?:test|spec|stories)\.[^.]+$/i;
const EVIDENCE_PATH = /^docs\/evidence\/ui-delivery\/(?!TEMPLATE\.md$).+\.md$/i;

const CORE_FIELDS = [
  "FLOW_BY_FLOW",
  "PAIGE_UI_DESIGN",
  "MATERIAL_FLOW_CHANGE",
  "FLOW_PROTOTYPE",
  "PURPOSE_AUDIENCE_PRIMARY_ACTION",
  "VISUAL_DIRECTION",
  "AUTOMATED_EVIDENCE",
  "STATIC_EVIDENCE",
  "RENDERED_EVIDENCE",
  "BEHAVIORAL_EVIDENCE",
  "AUTHENTICATED_RUNTIME",
  "KEYBOARD_FOCUS",
  "ZOOM_REFLOW",
  "REDUCED_MOTION",
  "STATE_COVERAGE",
  "TRUTHFUL_STATE_LABELS",
  "SOLO_UI",
  "UNVERIFIED",
];

const SOLO_FIELDS = [
  "SOLO_1536X770_PAIGE_CLOSED",
  "SOLO_1536X770_PAIGE_OPEN",
  "SOLO_1366X768_PAIGE_CLOSED",
  "SOLO_1366X768_PAIGE_OPEN",
  "SOLO_1024X768_PAIGE_CLOSED",
  "SOLO_1024X768_PAIGE_OPEN",
  "SOLO_900X1000_PAIGE_CLOSED",
  "SOLO_900X1000_PAIGE_OPEN",
];
const PINNED_BUNDLE = new Map([
  [".agents/skills/paige-ui-design/vendor/frontend-design/SKILL.md", "e7c8e7fd0bde8eb8a7d9f024fe20eeab4b6cde3f612e8d253334b806c09ca1ff"],
  [".agents/skills/paige-ui-design/vendor/frontend-design/references/accessibility-checklist.md", "de10179e21fa2cf7c098a01dbef5a5e9eed0b262a0526fd9c1b20ad0058e988c"],
  [".agents/skills/paige-ui-design/vendor/frontend-design/scripts/contrast-checker.py", "fa5dfa8258ee2de0cd86b42cbd88d6d2f51f1ee9f700085095e2ace4f9c6fcf6"],
  [".agents/skills/paige-ui-design/vendor/frontend-design/LICENSE.txt", "5b30a24f635a0e31fff6d399e127b67b7a38e1bcaa439bdae8e4f619b25b06af"],
  [".agents/skills/paige-ui-design/vendor/frontend-design/LICENSE-APACHE-2.0.txt", "b87a529a13d5294f97bb847936a82f39e4f8adae2425a3a5fb5f1a7b75d43e6a"],
  [".agents/skills/paige-ui-design/vendor/frontend-design/LICENSE-GITHUB-MIT.txt", "2510b446bc1f0cf9702453075d20cd88631e20e5642658edb7325d9c1eb534f7"],
  [".agents/skills/paige-ui-design/vendor/frontend-design/THIRD_PARTY_NOTICES.md", "912317539cc833b96d789481668a7227a840c6f44e35bcdb3fcaeb1591e76571"],
]);
export const pinnedBundlePaths = Object.freeze([...PINNED_BUNDLE.keys()]);

export function verifyPinnedBundle(root = process.cwd()) {
  const errors = [];
  for (const [file, expected] of PINNED_BUNDLE) {
    const content = readFileSync(resolve(root, file), "utf8").replace(/\r\n/g, "\n");
    const actual = createHash("sha256").update(content).digest("hex");
    if (actual !== expected) errors.push(`${file}: expected ${expected}, received ${actual}`);
  }
  return { ok: errors.length === 0, errors };
}

function normalize(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isTestOnly(path) {
  return TEST_ONLY.test(path);
}

function isUiFile(path) {
  if (isTestOnly(path)) return false;
  if (ROOT_UI_FILES.has(path)) return true;
  if (UI_CONFIG_FILES.has(path)) return true;
  if (/^src\//.test(path) && UI_EXTENSIONS.test(path)) return true;
  if (UI_TYPESCRIPT_PATH.test(path)) return true;
  if (/^src\/assets\//.test(path) && UI_ASSET_EXTENSIONS.test(path)) return true;
  if (/^public\//.test(path) && PUBLIC_UI_EXTENSIONS.test(path)) return true;
  return false;
}

function isSoloUi(path) {
  return path === "solo-drive.html"
    || /(?:^|[/_.-])solo(?:[/_.-]|$)/i.test(path)
    || /^(?:src\/solo\/|src\/components\/(?:tenant-shell|tenant-relationships|tenant-calendar|growth)\/)/i.test(path)
    || /TenantCommandCenterShell/i.test(path);
}

function changeRecord(entry) {
  if (typeof entry === "string") return { status: "M", path: normalize(entry) };
  return {
    status: String(entry.status ?? "M").slice(0, 1).toUpperCase(),
    path: normalize(entry.path ?? ""),
  };
}

export function classifyUiChanges(files) {
  const changes = files.map(changeRecord).filter((entry) => entry.path);
  const uiFiles = changes.filter((entry) => isUiFile(entry.path)).map((entry) => entry.path);
  return {
    required: uiFiles.length > 0,
    solo: uiFiles.some(isSoloUi),
    uiFiles,
    evidenceFiles: changes.filter((entry) => entry.status === "A" && EVIDENCE_PATH.test(entry.path)).map((entry) => entry.path),
  };
}

function fieldsFrom(text) {
  const fields = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]+):\s*(.+?)\s*$/.exec(line);
    if (match) fields.set(match[1], match[2]);
  }
  return fields;
}

function isEvidenceValue(value) {
  return /^(?:PASS|UNVERIFIED|NOT_APPLICABLE):\s*\S.+$/i.test(value ?? "")
    && !hasPlaceholder(value);
}

function hasPlaceholder(value) {
  return /\b(?:TODO|TBD|PLACEHOLDER|REPLACE_ME|ADD_LINK|LINK_HERE)\b/i.test(value ?? "");
}

function isPassWithEvidence(value) {
  return /^PASS:\s*\S.+$/i.test(value ?? "") && !hasPlaceholder(value);
}

export function validateEvidenceText(text, classification) {
  if (!classification.required) return { ok: true, errors: [] };
  if (!text.trim()) {
    return { ok: false, errors: ["A changed docs/evidence/ui-delivery/*.md UI delivery evidence file is required."] };
  }

  const fields = fieldsFrom(text);
  const errors = [];
  if (fields.get("UI_DELIVERY_EVIDENCE_VERSION") !== "1") {
    errors.push("UI_DELIVERY_EVIDENCE_VERSION must be 1.");
  }
  for (const key of CORE_FIELDS) {
    if (!fields.has(key)) errors.push(`${key} is required.`);
  }
  if (!isPassWithEvidence(fields.get("FLOW_BY_FLOW"))) errors.push("FLOW_BY_FLOW must be PASS: with a non-placeholder evidence reference.");
  if (!isPassWithEvidence(fields.get("PAIGE_UI_DESIGN"))) errors.push("PAIGE_UI_DESIGN must be PASS: with a non-placeholder evidence reference.");

  const materialFlow = fields.get("MATERIAL_FLOW_CHANGE");
  if (!/^(?:YES|NO):\s*\S.+$/i.test(materialFlow ?? "") || hasPlaceholder(materialFlow)) {
    errors.push("MATERIAL_FLOW_CHANGE must be YES: reason or NO: reason.");
  }
  const flowPrototype = fields.get("FLOW_PROTOTYPE");
  if (/^YES:/i.test(materialFlow ?? "")) {
    if (!isPassWithEvidence(flowPrototype)) {
      errors.push("FLOW_PROTOTYPE must be PASS with a prototype/approval reference for a material flow change.");
    }
  } else if (!/^(?:PASS|NOT_REQUIRED):\s*\S.+$/i.test(flowPrototype ?? "") || hasPlaceholder(flowPrototype)) {
    errors.push("FLOW_PROTOTYPE must be PASS: evidence or NOT_REQUIRED: reason.");
  }

  for (const key of CORE_FIELDS.filter((key) => ![
    "FLOW_BY_FLOW",
    "PAIGE_UI_DESIGN",
    "MATERIAL_FLOW_CHANGE",
    "FLOW_PROTOTYPE",
    "SOLO_UI",
    "UNVERIFIED",
  ].includes(key))) {
    if (fields.has(key) && !isEvidenceValue(fields.get(key))) {
      errors.push(`${key} must begin PASS:, UNVERIFIED:, or NOT_APPLICABLE: and include evidence or a reason.`);
    }
  }

  const soloValue = fields.get("SOLO_UI");
  if (!/^(?:YES|NO):\s*\S.+$/i.test(soloValue ?? "") || hasPlaceholder(soloValue)) {
    errors.push("SOLO_UI must be YES: scope or NO: reason.");
  }
  const unverified = fields.get("UNVERIFIED")?.trim();
  if (!unverified || hasPlaceholder(unverified)) {
    errors.push("UNVERIFIED must name remaining behavior and its reason, or state none with the completed proof boundary.");
  }
  if (classification.solo && !/^YES:/i.test(soloValue ?? "")) {
    errors.push("SOLO_UI must be YES when a recognized Solo UI path changed.");
  }
  if (classification.solo || /^YES:/i.test(soloValue ?? "")) {
    for (const key of SOLO_FIELDS) {
      if (!fields.has(key)) errors.push(`${key} is required for Solo UI work.`);
      else if (!isEvidenceValue(fields.get(key))) errors.push(`${key} must include PASS:, UNVERIFIED:, or NOT_APPLICABLE: with evidence or a reason.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function parseNameStatus(output) {
  return output.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    const [status, ...paths] = line.split("\t");
    const kind = status.slice(0, 1);
    if (/^[RC]/.test(status)) return paths.map((path) => ({ status: kind, path }));
    return [{ status: kind, path: paths[0] }];
  });
}

function changedFiles(base, head) {
  const output = execFileSync("git", ["diff", "--name-status", "--diff-filter=ACMRD", `${base}...${head}`], { encoding: "utf8" });
  return parseNameStatus(output);
}

export function run({ base, head }) {
  const bundle = verifyPinnedBundle();
  if (!bundle.ok) {
    console.error("Paige UI skill bundle integrity: FAIL");
    for (const error of bundle.errors) console.error(`  - ${error}`);
    return 1;
  }

  const files = changedFiles(base, head);
  const classification = classifyUiChanges(files);
  if (!classification.required) {
    console.log("UI delivery evidence: not required; no recognized UI source changed.");
    return 0;
  }
  if (classification.evidenceFiles.length === 0) {
    console.error("UI delivery evidence: FAIL");
    console.error("Recognized UI files changed:");
    for (const file of classification.uiFiles) console.error(`  - ${file}`);
    console.error("Add a non-template docs/evidence/ui-delivery/*.md record based on TEMPLATE.md.");
    return 1;
  }

  const failures = [];
  for (const file of classification.evidenceFiles) {
    const result = validateEvidenceText(readFileSync(file, "utf8"), classification);
    if (!result.ok) failures.push({ file, errors: result.errors });
  }
  if (failures.length > 0) {
    console.error("UI delivery evidence: FAIL");
    for (const failure of failures) {
      console.error(`${failure.file}:`);
      for (const error of failure.errors) console.error(`  - ${error}`);
    }
    return 1;
  }

  console.log(`UI delivery evidence: PASS (${classification.uiFiles.length} UI file(s), ${classification.evidenceFiles.length} evidence record(s)).`);
  console.log("This guard validates an attestation record; it does not prove the skill was used or the evidence is truthful.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseIndex = process.argv.indexOf("--base");
  const headIndex = process.argv.indexOf("--head");
  if (baseIndex < 0 || headIndex < 0 || !process.argv[baseIndex + 1] || !process.argv[headIndex + 1]) {
    console.error("Usage: node scripts/ci/ui-delivery-evidence.mjs --base <sha> --head <sha>");
    process.exit(2);
  }
  process.exit(run({ base: process.argv[baseIndex + 1], head: process.argv[headIndex + 1] }));
}
