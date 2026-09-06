#!/usr/bin/env node
/**
 * binding-ledger-lint — the Surface Binding Ledger is the release/regression contract.
 *
 * THE RULE IT ENFORCES (Paige OS Integration Program, Phase 0). A surface may not be reported
 * LIVE / "Paige-connected" without a complete ledger entry whose state is LIVE and whose evidence
 * includes authenticated runtime. A rendered page, a green badge, a local UI control, a prototype,
 * or an "Open Paige" button never satisfies a binding link. This is the mechanical form of §13
 * honesty + §32 (a green build is not a working render) applied to the binding chain.
 *
 * WHY A GUARD AND NOT JUST A DOC. A ledger a session can edit to say "LIVE" without proof is worse
 * than none — it lies with authority (§BRAIN). This guard makes the honest-state discipline
 * impossible to skip: the invariants below fail CI, they are not a convention.
 *
 * WHAT IT CHECKS
 *   · the ledger parses and declares its schema_version, state vocabulary, binding chain, evidence classes,
 *     and the authority-lanes legend + intended_capability note
 *   · every surface has all required fields, a state in the vocabulary, and a non-empty reason + sources
 *   · every surface's `chain` carries exactly the 9 declared binding-chain links
 *   · CURRENT-STATE HONESTY INVARIANTS (what is proven TODAY):
 *       - state LIVE                → evidence_class MUST include "authenticated_runtime",
 *                                     and canonical_source + safe_context must be real (not "none")
 *       - state PROOF_OWED          → evidence_class MUST NOT include "authenticated_runtime"
 *                                     (if it had that proof it would be LIVE)
 *       - state INTENTIONALLY_ISOLATED → an isolation_note MUST be present
 *   · INTENDED-TARGET INVARIANTS (owner ruling — absent proof never shrinks the target):
 *       - every surface declares `intended_capability` with all five authority lanes
 *         (read · draft · auto · confirm · prohibited) + a `completion_criterion`
 *       - the completion_criterion must name a REAL action/outcome, not merely "open" or "summarize"
 *   · ids are unique
 *
 *   node scripts/ci/binding-ledger-lint.mjs
 *   node scripts/ci/binding-ledger-lint.mjs --self-test
 */
import fs from "node:fs";

const LEDGER = "docs/binding-ledger/surface-binding-ledger.json";

// The completion_criterion must name a real action/outcome (owner: "not merely that Paige can open or
// summarize it"). A criterion that contains none of these stems reads as passive and fails.
const ACTION_STEMS = [
  "execut", "governed", "verif", "outcome", "rail", "creat", "revis", "advanc", "move", "send", "sent",
  "schedul", "publish", "book", "record", "install", "complet", "driv", "remediat", "updat", "configur",
  "resolv", "maintain", "coordinat", "generat", "promot", "rout", "transition", "action", "entitlement",
  "deliver", "appl", "connect", "scope", "seam",
];
const INTENDED_LANES = ["read", "draft", "auto", "confirm", "prohibited", "completion_criterion"];

/** Validate a parsed ledger object. Returns an array of finding strings; empty means pass. */
export function validateLedger(ledger) {
  const findings = [];
  if (!ledger || typeof ledger !== "object") return ["ledger is not an object"];

  if (typeof ledger.schema_version !== "string" || !ledger.schema_version)
    findings.push("schema_version missing");

  const vocab = ledger.state_vocabulary;
  if (!vocab || typeof vocab !== "object")
    findings.push("state_vocabulary missing");
  const states = vocab ? Object.keys(vocab) : [];

  const chainLinks = Array.isArray(ledger.binding_chain) ? ledger.binding_chain : [];
  if (chainLinks.length !== 9)
    findings.push(`binding_chain must declare 9 links, found ${chainLinks.length}`);

  const evidenceClasses = Array.isArray(ledger.evidence_classes) ? ledger.evidence_classes : [];
  if (!evidenceClasses.includes("authenticated_runtime"))
    findings.push("evidence_classes must include 'authenticated_runtime' (the proof bar for LIVE)");

  if (!ledger.authority_lanes || typeof ledger.authority_lanes !== "object")
    findings.push("authority_lanes legend missing — the intended-capability dimension must be declared");
  if (typeof ledger.intended_capability_note !== "string" || !ledger.intended_capability_note.trim())
    findings.push("intended_capability_note missing — the current-state-vs-intended-target distinction must be stated");

  const surfaces = ledger.surfaces;
  if (!Array.isArray(surfaces) || surfaces.length === 0)
    return findings.concat("surfaces is empty — a ledger with no surfaces proves nothing");

  const seen = new Set();
  for (const s of surfaces) {
    const id = s && s.id ? s.id : "<no id>";
    if (!s.id) findings.push("a surface has no id");
    else if (seen.has(s.id)) findings.push(`duplicate surface id: ${s.id}`);
    else seen.add(s.id);

    for (const field of ["surface", "group", "owner_component", "state", "state_reason", "next_slice"]) {
      if (!s[field] || (typeof s[field] === "string" && !s[field].trim()))
        findings.push(`${id}: missing ${field}`);
    }
    if (!Array.isArray(s.tier_scope) || s.tier_scope.length === 0)
      findings.push(`${id}: tier_scope must be a non-empty array`);
    if (!Array.isArray(s.sources) || s.sources.length === 0)
      findings.push(`${id}: sources must be a non-empty array — every row is grounded`);
    if (!Array.isArray(s.evidence_class) || s.evidence_class.length === 0)
      findings.push(`${id}: evidence_class must be a non-empty array`);
    else
      for (const ec of s.evidence_class)
        if (evidenceClasses.length && !evidenceClasses.includes(ec))
          findings.push(`${id}: unknown evidence_class '${ec}'`);

    if (s.state && states.length && !states.includes(s.state))
      findings.push(`${id}: state '${s.state}' is not in the declared vocabulary`);

    // chain shape: exactly the declared links
    const chain = s.chain;
    if (!chain || typeof chain !== "object") {
      findings.push(`${id}: chain missing`);
    } else if (chainLinks.length === 9) {
      for (const link of chainLinks)
        if (!(link in chain)) findings.push(`${id}: chain missing link '${link}'`);
      for (const k of Object.keys(chain))
        if (!chainLinks.includes(k)) findings.push(`${id}: chain has unknown link '${k}'`);
    }

    // HONESTY INVARIANTS
    const hasAuthRuntime = Array.isArray(s.evidence_class) && s.evidence_class.includes("authenticated_runtime");
    if (s.state === "LIVE") {
      if (!hasAuthRuntime)
        findings.push(`${id}: state LIVE requires evidence_class to include 'authenticated_runtime' — a rendered page/badge/prototype is not proof`);
      const cs = chain && chain.canonical_source && chain.canonical_source.status;
      const sc = chain && chain.safe_context && chain.safe_context.status;
      if (cs === "none") findings.push(`${id}: state LIVE but canonical_source is 'none'`);
      if (sc === "none" || sc === "isolated")
        findings.push(`${id}: state LIVE but safe_context is '${sc}' — a LIVE binding needs a real safe context, not none/isolated`);
    }
    if (s.state === "PROOF_OWED" && hasAuthRuntime)
      findings.push(`${id}: state PROOF_OWED but evidence_class includes 'authenticated_runtime' — if the proof exists it is LIVE, not PROOF_OWED`);
    if (s.state === "INTENTIONALLY_ISOLATED" && (!s.isolation_note || !String(s.isolation_note).trim()))
      findings.push(`${id}: state INTENTIONALLY_ISOLATED requires an isolation_note`);

    // INTENDED OPERATING CAPABILITY — the product target across authority lanes. This is SEPARATE from
    // `state` (current proof): an absent current proof never shrinks the intended target (owner ruling).
    const ic = s.intended_capability;
    if (!ic || typeof ic !== "object") {
      findings.push(`${id}: intended_capability missing — every surface declares its operating target (read/draft/auto/confirm/prohibited + completion_criterion)`);
    } else {
      for (const lane of INTENDED_LANES)
        if (typeof ic[lane] !== "string" || !ic[lane].trim())
          findings.push(`${id}: intended_capability.${lane} missing or empty`);
      const cc = typeof ic.completion_criterion === "string" ? ic.completion_criterion.toLowerCase() : "";
      if (cc && !ACTION_STEMS.some((st) => cc.includes(st)))
        findings.push(`${id}: completion_criterion must name a REAL action/outcome — not merely that Paige can open or summarize the surface`);
    }
  }
  return findings;
}

if (process.argv.includes("--self-test")) {
  const base = {
    schema_version: "1.0.0",
    state_vocabulary: { LIVE: "", PARTIAL: "", READ_ONLY_CONTEXT: "", INTENTIONALLY_ISOLATED: "", UNAVAILABLE: "", PROOF_OWED: "" },
    binding_chain: ["canonical_source", "tenant_scope", "safe_context", "authority", "governed_write", "verified_outcome", "rail_evidence", "mind_eligibility", "memory_retention"],
    evidence_classes: ["production_catalog", "production_data", "automated_test", "rendered_structural", "authenticated_runtime", "source_read"],
    authority_lanes: { read: "", draft: "", auto: "", confirm: "", prohibited: "", completion_criterion: "" },
    intended_capability_note: "current state vs intended target",
  };
  const fullChain = () => ({
    canonical_source: { status: "real" }, tenant_scope: { status: "server_resolved" }, safe_context: { status: "wired" },
    authority: { status: "governed" }, governed_write: { status: "wired" }, verified_outcome: { status: "wired" },
    rail_evidence: { producer: "wired", read: "resolver" }, mind_eligibility: { axis_a: "PARTIAL", axis_b: "NO" }, memory_retention: { status: "n/a" },
  });
  const fullIntended = () => ({
    read: "read safe facts", draft: "draft a proposal", auto: "auto within policy", confirm: "confirm before execute",
    prohibited: "secrets never cross", completion_criterion: "Paige executes a governed action with a verified Rail outcome",
  });
  const surface = (over = {}) => ({
    id: "x.y", surface: "X", group: "g", tier_scope: ["solo"], owner_component: "f.tsx:1",
    chain: fullChain(), intended_capability: fullIntended(), state: "PARTIAL", state_reason: "r",
    evidence_class: ["source_read"], next_slice: "n", sources: ["d.md"], ...over,
  });
  const cases = [
    ["passes a valid PARTIAL surface", { ...base, surfaces: [surface()] }, 0],
    ["passes a valid LIVE surface with auth runtime", { ...base, surfaces: [surface({ state: "LIVE", evidence_class: ["authenticated_runtime", "automated_test"] })] }, 0],
    ["FAILS LIVE without authenticated_runtime", { ...base, surfaces: [surface({ state: "LIVE", evidence_class: ["automated_test"] })] }, 1],
    ["FAILS LIVE with a 'none' canonical_source", { ...base, surfaces: [surface({ state: "LIVE", evidence_class: ["authenticated_runtime"], chain: { ...fullChain(), canonical_source: { status: "none" } } })] }, 1],
    ["FAILS LIVE with an 'isolated' safe_context", { ...base, surfaces: [surface({ state: "LIVE", evidence_class: ["authenticated_runtime"], chain: { ...fullChain(), safe_context: { status: "isolated" } } })] }, 1],
    ["FAILS PROOF_OWED that claims authenticated_runtime", { ...base, surfaces: [surface({ state: "PROOF_OWED", evidence_class: ["authenticated_runtime"] })] }, 1],
    ["FAILS INTENTIONALLY_ISOLATED without isolation_note", { ...base, surfaces: [surface({ state: "INTENTIONALLY_ISOLATED" })] }, 1],
    ["passes INTENTIONALLY_ISOLATED with isolation_note", { ...base, surfaces: [surface({ state: "INTENTIONALLY_ISOLATED", isolation_note: "never crosses" })] }, 0],
    ["FAILS an unknown state", { ...base, surfaces: [surface({ state: "SORTA_LIVE" })] }, 1],
    ["FAILS a duplicate id", { ...base, surfaces: [surface(), surface()] }, 1],
    ["FAILS a chain missing a link", { ...base, surfaces: [surface({ chain: (() => { const c = fullChain(); delete c.memory_retention; return c; })() })] }, 1],
    ["FAILS an empty sources array", { ...base, surfaces: [surface({ sources: [] })] }, 1],
    ["FAILS an unknown evidence_class", { ...base, surfaces: [surface({ evidence_class: ["vibes"] })] }, 1],
    ["FAILS empty surfaces", { ...base, surfaces: [] }, 1],
    ["FAILS a surface missing intended_capability", { ...base, surfaces: [surface({ intended_capability: undefined })] }, 1],
    ["FAILS intended_capability missing a lane", { ...base, surfaces: [surface({ intended_capability: (() => { const c = fullIntended(); delete c.auto; return c; })() })] }, 1],
    ["FAILS a weak open/summarize completion_criterion", { ...base, surfaces: [surface({ intended_capability: { ...fullIntended(), completion_criterion: "Paige can open and summarize the plan" } })] }, 1],
    ["passes a real-action completion_criterion", { ...base, surfaces: [surface({ intended_capability: { ...fullIntended(), completion_criterion: "Paige sends a governed follow-up with a verified outcome" } })] }, 0],
    ["FAILS a ledger missing authority_lanes", { ...base, authority_lanes: undefined, surfaces: [surface()] }, 1],
  ];
  let bad = 0;
  for (const [label, ledger, wantFindings] of cases) {
    const got = validateLedger(ledger);
    const ok = wantFindings === 0 ? got.length === 0 : got.length >= 1;
    if (ok) console.log(`  ok   ${label}`);
    else { console.log(`  FAIL ${label} — expected ${wantFindings ? ">=1" : "0"} finding(s), got ${got.length}: ${JSON.stringify(got)}`); bad++; }
  }
  console.log(bad ? `\n✗ binding-ledger-lint self-test: ${bad} failure(s).` : `\n✓ binding-ledger-lint self-test passed — ${cases.length} runtime case(s).`);
  process.exit(bad ? 1 : 0);
}

if (!fs.existsSync(LEDGER)) {
  console.log(`✗ binding-ledger-lint: ${LEDGER} is missing — that is a resolver failure, not a pass.`);
  process.exit(1);
}
let ledger;
try {
  ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
} catch (e) {
  console.log(`✗ binding-ledger-lint: ${LEDGER} is not valid JSON — ${e?.message ?? e}`);
  process.exit(1);
}
const findings = validateLedger(ledger);
if (findings.length) {
  console.log(`✗ binding-ledger-lint: ${findings.length} finding(s) in ${LEDGER}\n`);
  for (const f of findings) console.log(`  • ${f}`);
  console.log("\n  The Surface Binding Ledger is the release contract. Fix the entry, or fix the claim.");
  console.log("  A surface is not LIVE without authenticated runtime proof (§13/§32).");
  process.exit(1);
}
console.log(`✓ binding-ledger-lint: ${ledger.surfaces.length} surface(s), all entries complete and honestly stated.`);
