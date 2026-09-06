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
import { fileURLToPath } from "node:url";

const LEDGER = "docs/binding-ledger/surface-binding-ledger.json";

// Importing this module (for `completionNamesRealAction` / `validateLedger`) must be side-effect-free:
// the CLI runs ONLY when this file is the process entry point, never on import (§13 clean code / m3).
function invokedDirectly() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

// The completion_criterion must name a REAL action/outcome (owner: "not merely that Paige can open or
// summarize it"). A raw substring allowlist cannot tell a verb from a noun — "open and summarize the
// connected records" laundered through the stems "connect"/"record" (§39 verifier M1). Two changes fix
// that, and both are verified against the live ledger's 24 in-scope criteria + the exact bypass string:
//
//   1. STRONG_VERB is curated to VERB forms only. The laundering-prone stems are removed: bare
//      `records?` (the plural NOUN "records") — while `recorded|recording` (the real verb) is kept —
//      and `connect*` entirely (adjective "connected", noun "connection"). With those gone, the bypass
//      "open and summarize the connected records" contains NO strong verb and fails on (1) alone.
//   2. A passive framing verb (open/summarize/view/display/show/list/browse/monitor) is allowed only
//      when EXCUSED, and "excused" is judged robustly, not by a fixed character window:
//        (a) CLAUSE-SCOPED NEGATION — a negator anywhere in the passive verb's own clause (delimited by
//            . ; : or —) excuses it: "— not a static submissions list", "not just browsing a catalogue".
//        (b) PRECONDITION — a passive verb FOLLOWED by a real action verb is a setup, not the claim:
//            "An owner opens Paige … and Paige acts through a governed tool, outcome recorded".
//      An un-excused passive verb (the bypass's "open"/"summarize", were a stray strong verb present)
//      still fails.
//
// A surface whose completion is legitimately out of this program's scope sets `out_of_scope: true` and
// is exempt from the action bar — an honest scope-out is distinguished structurally, never laundered.
// The guard is a TRIPWIRE for the open/summarize cop-out, not a semantic parser of English; whether a
// lane's mapping is correct stays a human §5/§39 responsibility (the comment below).
const STRONG_VERB = /\b(execut\w*|govern\w*|verif\w*|creat\w*|revis\w*|advanc\w*|moves?|moved|moving|sends?|sent|sending|schedul\w*|publish\w*|books?|booked|booking|recorded|recording|install\w*|complet\w*|driv\w*|remediat\w*|updat\w*|configur\w*|resolv\w*|maintain\w*|coordinat\w*|generat\w*|promot\w*|routes?|routed|routing|transition\w*|deliver\w*|perform\w*|chang\w*|recall\w*|activat\w*|launch\w*|adjust\w*|wires?|wired|wiring|ships?|shipped|shipping|redline\w*|models?|modeled|modeling|reaches?|reached)\b/i;
const PASSIVE_VERB = /\b(open|opens|opening|summari[sz]e[sd]?|summari[sz]ing|view|views|viewing|display|displays|displayed|displaying|show|shows|showing|lists?|listing|browse|browses|browsing|monitor|monitors|monitoring)\b/gi;
const NEGATOR = /\b(not|never|rather|instead|no longer|nor)\b/i;
const CLAUSE_DELIMS = ['.', ';', ':', '—']; // — = em dash "—"
const INTENDED_LANES = ["read", "draft", "auto", "confirm", "prohibited", "completion_criterion"];

// The guard enforces PRESENCE of all six lanes + a real-action completion_criterion. It does NOT
// verify the SEMANTIC correctness of each lane (e.g. the §16/§67 lane mapping, or that a §38/§53
// prohibition is right) — that stays a human §5 compliance responsibility (§39 verifier / compliance MINOR-3).

/** True when a real-action completion_criterion; false when it reads as merely open/summarize. */
export function completionNamesRealAction(text) {
  const cc = String(text || "");
  if (!STRONG_VERB.test(cc)) return false; // no genuine action verb at all → not a real action
  for (const m of cc.matchAll(PASSIVE_VERB)) {
    const idx = m.index;
    // (a) clause-scoped negation: negator anywhere in this passive verb's own clause excuses it.
    const clauseStart = Math.max(-1, ...CLAUSE_DELIMS.map((d) => cc.lastIndexOf(d, idx - 1)));
    if (NEGATOR.test(cc.slice(clauseStart + 1, idx))) continue;
    // (b) precondition: a passive verb followed by a real action verb is a setup, not the claim.
    if (STRONG_VERB.test(cc.slice(idx + m[0].length))) continue;
    return false; // an un-excused passive verb dominates → not a real action
  }
  return true;
}

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
      if ("out_of_scope" in s && typeof s.out_of_scope !== "boolean")
        findings.push(`${id}: out_of_scope must be a boolean when present`);
      const cc = typeof ic.completion_criterion === "string" ? ic.completion_criterion : "";
      // An honestly out-of-scope surface (portal, operator) is exempt from the real-action bar — its
      // completion is legitimately "out of scope", not an evasive passivity.
      if (cc && s.out_of_scope !== true && !completionNamesRealAction(cc))
        findings.push(`${id}: completion_criterion must name a REAL action/outcome — not merely that Paige can open or summarize the surface (set out_of_scope:true for a genuine scope-out)`);
    }
  }
  return findings;
}

if (invokedDirectly() && process.argv.includes("--self-test")) {
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
    ["FAILS a passive criterion that launders a noun stem (verifier M1)", { ...base, surfaces: [surface({ intended_capability: { ...fullIntended(), completion_criterion: "Paige can open and summarize the connected records" } })] }, 1],
    ["FAILS a passive criterion that mentions an outcome noun", { ...base, surfaces: [surface({ intended_capability: { ...fullIntended(), completion_criterion: "Paige can view the action items and the tenant scope" } })] }, 1],
    ["passes a real-action completion_criterion", { ...base, surfaces: [surface({ intended_capability: { ...fullIntended(), completion_criterion: "Paige sends a governed follow-up with a verified outcome" } })] }, 0],
    ["passes a NEGATED passive mention alongside a real action", { ...base, surfaces: [surface({ intended_capability: { ...fullIntended(), completion_criterion: "Paige advances a mission and records the outcome — not a displayed plan" } })] }, 0],
    ["passes a precondition passive verb followed by a real action", { ...base, surfaces: [surface({ intended_capability: { ...fullIntended(), completion_criterion: "An owner opens Paige and she executes a governed action, outcome recorded" } })] }, 0],
    ["FAILS a strong verb with an un-excused trailing passive verb", { ...base, surfaces: [surface({ intended_capability: { ...fullIntended(), completion_criterion: "Paige governs the account and then displays the dashboard" } })] }, 1],
    ["passes an out_of_scope surface exempt from the action bar", { ...base, surfaces: [surface({ out_of_scope: true, intended_capability: { ...fullIntended(), completion_criterion: "Out of this program's scope; the seam is recorded only" } })] }, 0],
    ["FAILS out_of_scope that is not a boolean", { ...base, surfaces: [surface({ out_of_scope: "yes" })] }, 1],
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

function runLedgerLint() {
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
}

if (invokedDirectly() && !process.argv.includes("--self-test")) runLedgerLint();
