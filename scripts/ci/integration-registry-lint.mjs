#!/usr/bin/env node
/**
 * integration-registry-lint — the Integration Capability Registry is a delivery contract.
 *
 * THE RULE IT ENFORCES. A provider integration may not be catalogued dishonestly or incompletely.
 * The registry (docs/integration-registry/integration-capability-registry.json) is the product-
 * governance record every provider PR must read before and update after a change (the delivery rule).
 * A registry a session can quietly edit to imply a provider is connected/available/autonomous — or
 * that ships an entry missing its authority/proof/limits — is worse than none: it lies with authority
 * (§BRAIN). This guard makes the honesty invariants fail CI, they are not a convention. It is the
 * mechanical form of §13 (honest reporting) + §32 (a green build is not a working render) + R1
 * (listed is not connected) applied to the provider catalogue.
 *
 * It is a TRIPWIRE, not a semantic parser (§13): it checks structure + vocabulary + a few honesty
 * invariants. Whether a lane mapping or a status is materially CORRECT stays a human §5/§39 job.
 *
 * Concise + dependency-free (regex/JSON + node only), the shape of definer-fn-lint / binding-ledger-lint.
 *
 *   node scripts/ci/integration-registry-lint.mjs
 *   node scripts/ci/integration-registry-lint.mjs --self-test
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const REGISTRY = "docs/integration-registry/integration-capability-registry.json";

const STATUSES = ["LIVE", "PARTIAL", "PROPOSED", "UNAVAILABLE", "DEFERRED", "PROOF_OWED"];
const LANES = ["read", "draft", "auto", "confirm", "prohibited"];
const TIER_KEYS = ["platform", "solo", "agency_future", "enterprise_future"];
const TIER_VALUES = ["eligible", "ineligible", "resell", "deferred", "na"];
// A status that means "nothing usable is built" may not also declare a real acting lane — the only
// lane an unbuilt integration currently supports is `prohibited` (R1/R2 honesty).
const UNBUILT_STATUSES = ["UNAVAILABLE", "DEFERRED", "PROPOSED"];
// Fields a marketplace-metadata-only entry must NEVER carry (rule R4): per-tenant credentials/usage/
// purchases/billing. The tripwire scans the entry's safe_readable_context for these tokens.
const MARKETPLACE_FORBIDDEN = /\b(credential|token|purchase|billing|per-tenant usage|tenant usage|client material)\b/i;

const TOP_LEVEL = [
  "doc", "schema_version", "cardinal_rule", "status_vocabulary", "authority_lanes",
  "tiers", "taxonomy", "rules", "delivery_rule", "field_schema", "providers",
];
const PROVIDER_FIELDS = [
  "id", "name", "taxonomy", "business_reason", "paige_use_cases", "connection_prerequisite",
  "required_scopes", "safe_readable_context", "allowed_writes_external_effects", "authority_lane",
  "m1_dependency", "canonical_provider_receipt", "rail_mind_memory", "status", "owner",
  "dependency", "next_slice", "tier_eligibility", "sources",
];

function nonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }
function nonEmptyArr(v) { return Array.isArray(v) && v.length > 0; }

/** Pure validator: returns an array of human-readable error strings (empty = valid). */
export function validateRegistry(reg) {
  const errors = [];
  const E = (m) => errors.push(m);

  if (reg == null || typeof reg !== "object") { return ["registry is not an object"]; }

  for (const k of TOP_LEVEL) if (!(k in reg)) E(`missing top-level key: ${k}`);
  if (!nonEmptyStr(reg.cardinal_rule)) E("cardinal_rule must be a non-empty string");

  // status vocabulary must be EXACTLY the six task-mandated words (no ninth vocabulary — §18).
  const vocab = reg.status_vocabulary && typeof reg.status_vocabulary === "object"
    ? Object.keys(reg.status_vocabulary) : [];
  for (const s of STATUSES) if (!vocab.includes(s)) E(`status_vocabulary missing "${s}"`);
  for (const s of vocab) if (!STATUSES.includes(s)) E(`status_vocabulary has unknown status "${s}"`);

  // authority-lane legend must be exactly the five lanes.
  const laneLegend = reg.authority_lanes && typeof reg.authority_lanes === "object"
    ? Object.keys(reg.authority_lanes) : [];
  for (const l of LANES) if (!laneLegend.includes(l)) E(`authority_lanes legend missing "${l}"`);

  // tiers legend must carry the four declared tier keys.
  const tierLegend = reg.tiers && typeof reg.tiers === "object" ? Object.keys(reg.tiers) : [];
  for (const t of TIER_KEYS) if (!tierLegend.includes(t)) E(`tiers legend missing "${t}"`);

  // taxonomy: non-empty, each id/name/description present; collect valid ids.
  const taxIds = new Set();
  if (!nonEmptyArr(reg.taxonomy)) E("taxonomy must be a non-empty array");
  else for (const g of reg.taxonomy) {
    if (!nonEmptyStr(g.id) || !nonEmptyStr(g.name) || !nonEmptyStr(g.description)) {
      E(`taxonomy group needs id/name/description: ${JSON.stringify(g).slice(0, 60)}`);
    } else taxIds.add(g.id);
  }

  // delivery rule must state before + on_merge.
  if (!reg.delivery_rule || !nonEmptyStr(reg.delivery_rule.before) || !nonEmptyStr(reg.delivery_rule.on_merge)) {
    E("delivery_rule must declare non-empty `before` and `on_merge`");
  }

  if (!nonEmptyArr(reg.providers)) { E("providers must be a non-empty array"); return errors; }

  const ids = new Set();
  const groupsCovered = new Set();

  for (const p of reg.providers) {
    const tag = nonEmptyStr(p.id) ? p.id : JSON.stringify(p).slice(0, 40);

    for (const f of PROVIDER_FIELDS) {
      const v = p[f];
      const ok = Array.isArray(v) ? nonEmptyArr(v) : (typeof v === "object" ? v != null : nonEmptyStr(v));
      if (!ok) E(`provider "${tag}": missing/empty field "${f}"`);
    }

    if (nonEmptyStr(p.id)) {
      if (ids.has(p.id)) E(`duplicate provider id "${p.id}"`);
      ids.add(p.id);
    }

    if (nonEmptyStr(p.taxonomy)) {
      if (!taxIds.has(p.taxonomy)) E(`provider "${tag}": taxonomy "${p.taxonomy}" not in taxonomy list`);
      else groupsCovered.add(p.taxonomy);
    }

    if (nonEmptyStr(p.status) && !STATUSES.includes(p.status)) E(`provider "${tag}": unknown status "${p.status}"`);

    if (Array.isArray(p.authority_lane)) {
      for (const l of p.authority_lane) if (!LANES.includes(l)) E(`provider "${tag}": unknown authority lane "${l}"`);
    }

    if (p.tier_eligibility && typeof p.tier_eligibility === "object") {
      for (const t of TIER_KEYS) {
        if (!(t in p.tier_eligibility)) E(`provider "${tag}": tier_eligibility missing "${t}"`);
        else if (!TIER_VALUES.includes(p.tier_eligibility[t])) {
          E(`provider "${tag}": tier_eligibility.${t} has unknown value "${p.tier_eligibility[t]}"`);
        }
      }
    }

    // HONESTY INVARIANT 1 — an unbuilt status may not declare a real acting lane (R1/R2).
    if (UNBUILT_STATUSES.includes(p.status) && Array.isArray(p.authority_lane)) {
      const realLanes = p.authority_lane.filter((l) => l !== "prohibited");
      if (realLanes.length > 0) {
        E(`provider "${tag}": status ${p.status} but declares acting lane(s) [${realLanes.join(", ")}] — an unbuilt integration currently supports only "prohibited" (R1/R2)`);
      }
    }

    // HONESTY INVARIANT 2 — a LIVE entry must name a real canonical provider receipt (not "none").
    if (p.status === "LIVE" && nonEmptyStr(p.canonical_provider_receipt)
        && /^none\b/i.test(p.canonical_provider_receipt.trim())) {
      E(`provider "${tag}": status LIVE but canonical_provider_receipt is "none" — a LIVE effect must be provable (R8)`);
    }

    // HONESTY INVARIANT 3 — a marketplace-metadata-only entry must not carry per-tenant
    // credentials/usage/purchases/billing in its readable context (rule R4).
    if (p.marketplace_metadata_only === true && nonEmptyStr(p.safe_readable_context)) {
      if (!/metadata only/i.test(p.safe_readable_context)) {
        E(`provider "${tag}": marketplace_metadata_only entry must assert "metadata only" in safe_readable_context (R4)`);
      }
      if (MARKETPLACE_FORBIDDEN.test(p.safe_readable_context)) {
        E(`provider "${tag}": marketplace_metadata_only entry names forbidden per-tenant data in safe_readable_context (R4)`);
      }
    }
  }

  // COVERAGE — every taxonomy group must have at least one catalogued provider.
  for (const id of taxIds) if (!groupsCovered.has(id)) E(`taxonomy group "${id}" has no catalogued provider`);

  return errors;
}

// ---- self-test: prove the guard catches what it claims ----------------------------------------
function selfTest() {
  const raw = fs.readFileSync(REGISTRY, "utf8");
  const real = JSON.parse(raw);
  const clone = () => JSON.parse(raw);
  const fails = [];

  // The real registry must pass.
  const realErrors = validateRegistry(real);
  if (realErrors.length) fails.push(`real registry should pass but failed:\n    ${realErrors.join("\n    ")}`);

  let mutationCount = 0;
  const mustFail = (label, mutate) => {
    mutationCount += 1;
    const r = clone();
    mutate(r);
    if (validateRegistry(r).length === 0) fails.push(`mutation "${label}" should have failed but passed`);
  };

  mustFail("unknown status", (r) => { r.providers[0].status = "SORTA_LIVE"; });
  mustFail("unknown lane", (r) => { r.providers[0].authority_lane = ["yolo"]; });
  mustFail("duplicate id", (r) => { r.providers[1].id = r.providers[0].id; });
  mustFail("missing required field", (r) => { delete r.providers[0].canonical_provider_receipt; });
  mustFail("bad taxonomy ref", (r) => { r.providers[0].taxonomy = "nope"; });
  mustFail("missing tier key", (r) => { delete r.providers[0].tier_eligibility.solo; });
  mustFail("bad tier value", (r) => { r.providers[0].tier_eligibility.solo = "maybe"; });
  mustFail("dropped status word", (r) => { delete r.status_vocabulary.DEFERRED; });
  mustFail("unbuilt status with real lane", (r) => {
    const p = r.providers.find((x) => ["UNAVAILABLE", "DEFERRED", "PROPOSED"].includes(x.status));
    p.authority_lane = ["read"];
  });
  mustFail("LIVE without receipt", (r) => {
    const p = r.providers.find((x) => x.status === "LIVE");
    p.canonical_provider_receipt = "none";
  });
  mustFail("marketplace entry leaks per-tenant data", (r) => {
    const p = r.providers.find((x) => x.marketplace_metadata_only === true);
    p.safe_readable_context = "global metadata only, plus per-tenant billing and purchase history";
  });
  mustFail("taxonomy group with no provider", (r) => {
    r.taxonomy.push({ id: "orphan_group", name: "Orphan", description: "no providers here" });
  });
  mustFail("missing delivery rule", (r) => { delete r.delivery_rule; });
  mustFail("missing cardinal rule", (r) => { delete r.cardinal_rule; });

  if (fails.length) {
    console.error("✗ integration-registry-lint SELF-TEST FAILED:");
    for (const f of fails) console.error(`    • ${f}`);
    process.exit(1);
  }
  console.log(`✓ integration-registry-lint self-test: real registry valid; ${mutationCount} honesty/structure mutations all caught.`);
  process.exit(0);
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  let reg;
  try {
    reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  } catch (e) {
    console.error(`✗ integration-registry-lint: cannot read/parse ${REGISTRY}: ${e.message}`);
    process.exit(1);
  }

  const errors = validateRegistry(reg);
  if (errors.length) {
    console.error("");
    console.error("✗ integration-registry-lint FAILED — the Integration Capability Registry is incomplete or dishonest:");
    for (const e of errors) console.error(`    • ${e}`);
    console.error("");
    console.error(`  The registry is the delivery contract for every provider integration (${REGISTRY}).`);
    console.error("  Fix the entry, or fix the claim. Listing a provider never means it is connected/available/autonomous (R1).");
    console.error("");
    process.exit(1);
  }

  console.log(`✓ integration-registry-lint: ${reg.providers.length} providers, all ${reg.taxonomy.length} taxonomy groups covered, honest status vocabulary.`);
  process.exit(0);
}

// CLI runs ONLY when this file is the process entry point — importing (for validateRegistry) is
// side-effect-free (§13 clean code).
function invokedDirectly() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch { return false; }
}
if (invokedDirectly()) main();
