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

// --- API Expense & Operations Layer (v1.1) vocabularies + the M1 disambiguation (owner ruling 2026-09-06) ---
const COST_RESPONSIBILITY = ["platform_paid", "tenant_direct", "shared", "pass_through", "undecided"];
const PRICING_MODEL = ["free_quota", "metered_usage", "fixed_subscription", "per_seat", "per_location", "per_action", "enterprise_contract", "unknown"];
const COST_DRIVER = ["api_calls", "locations", "seats", "documents", "messages", "minutes", "transactions", "ad_spend", "storage", "model_usage", "other"];
const M1_TRACK = ["m1_real_money_spend_control", "llm_cost_metering", "none"];
const EXPENSE_STR_FIELDS = [
  "cost_responsibility", "billing_owner", "operational_owner", "pricing_model", "pricing_source_url",
  "pricing_note", "access_prerequisite", "rate_limits_quotas", "usage_review_cadence",
  "renewal_deprecation_review", "data_privacy_retention", "receipt_reconciliation", "rail_outcome",
  "pause_revoke_path", "next_owner", "next_slice",
];
// The QUALIFIED forms of "M1" a base m1_dependency may use. Everything else is a bare, prohibited "M1".
// checkBaseM1 STRIPS these first, then flags any remaining bare "M1" — so a qualified token elsewhere
// in the string can no longer immunize a separate bare "M1" (the §39 verifier's tripwire hole).
const QUALIFIED_M1_FORMS = /M1 real-money spend control|M1-[ab]\b/gi;

const TOP_LEVEL = [
  "doc", "schema_version", "cardinal_rule", "status_vocabulary", "authority_lanes",
  "tiers", "taxonomy", "rules", "delivery_rule", "field_schema", "providers",
  "cost_tracks", "expense_and_operations_schema", "public_presence_roadmap",
];
const PROVIDER_FIELDS = [
  "id", "name", "taxonomy", "business_reason", "paige_use_cases", "connection_prerequisite",
  "required_scopes", "safe_readable_context", "allowed_writes_external_effects", "authority_lane",
  "m1_dependency", "canonical_provider_receipt", "rail_mind_memory", "status", "owner",
  "dependency", "next_slice", "tier_eligibility", "sources",
];

function nonEmptyStr(v) { return typeof v === "string" && v.trim().length > 0; }
function nonEmptyArr(v) { return Array.isArray(v) && v.length > 0; }

/** Validate an expense_and_operations block (a provider's or a roadmap item's). Pushes errors via E. */
function validateExpenseBlock(eo, tag, E) {
  if (eo == null || typeof eo !== "object") { E(`${tag}: missing expense_and_operations block`); return; }
  for (const f of EXPENSE_STR_FIELDS) if (!nonEmptyStr(eo[f])) E(`${tag}: expense_and_operations missing/empty "${f}"`);
  if (nonEmptyStr(eo.cost_responsibility) && !COST_RESPONSIBILITY.includes(eo.cost_responsibility)) E(`${tag}: unknown cost_responsibility "${eo.cost_responsibility}"`);
  if (nonEmptyStr(eo.pricing_model) && !PRICING_MODEL.includes(eo.pricing_model)) E(`${tag}: unknown pricing_model "${eo.pricing_model}"`);
  if (!nonEmptyArr(eo.expected_cost_driver)) E(`${tag}: expense_and_operations.expected_cost_driver must be a non-empty array`);
  else for (const d of eo.expected_cost_driver) if (!COST_DRIVER.includes(d)) E(`${tag}: unknown expected_cost_driver "${d}"`);
  // pricing_checked_as_of: the KEY must exist (null when not verified). A date-stamp requires a source (R10/§13).
  if (!("pricing_checked_as_of" in eo)) E(`${tag}: expense_and_operations missing "pricing_checked_as_of" (use null if not verified)`);
  else if (eo.pricing_checked_as_of !== null) {
    if (!nonEmptyStr(eo.pricing_checked_as_of)) E(`${tag}: pricing_checked_as_of must be null or an ISO date string`);
    else if (!nonEmptyStr(eo.pricing_source_url) || /^none\b/i.test(eo.pricing_source_url.trim())) {
      E(`${tag}: pricing_checked_as_of is date-stamped but pricing_source_url is missing/"none" — a date-stamp requires an official source (R10/§13)`);
    }
  }
  // money_movement + THE OWNER RULING (2026-09-06): a real-money-moving provider must use the
  // real-money spend-control track, NEVER LLM-token metering or "none".
  const m = eo.money_movement;
  if (m == null || typeof m !== "object") { E(`${tag}: expense_and_operations.money_movement missing`); return; }
  if (typeof m.can_move_real_money !== "boolean") E(`${tag}: money_movement.can_move_real_money must be a boolean`);
  if (!M1_TRACK.includes(m.m1_dependency_track)) E(`${tag}: money_movement.m1_dependency_track "${m.m1_dependency_track}" not one of ${M1_TRACK.join("|")}`);
  if (!nonEmptyStr(m.detail)) E(`${tag}: money_movement.detail required`);
  if (m.can_move_real_money === true && m.m1_dependency_track !== "m1_real_money_spend_control") {
    E(`${tag}: money_movement.can_move_real_money=true but m1_dependency_track="${m.m1_dependency_track}" — a provider that moves real money MUST point to M1 real-money spend control, never LLM-token metering or "none" (owner ruling 2026-09-06)`);
  }
}

/** A base m1_dependency string that uses "M1" must qualify EVERY occurrence (real-money / M1-a / M1-b). */
function checkBaseM1(m1, tag, E) {
  if (!nonEmptyStr(m1)) return;
  const stripped = m1.replace(QUALIFIED_M1_FORMS, ""); // remove the allowed forms; a bare "M1" left over is unqualified
  if (/\bM1\b/i.test(stripped)) {
    E(`${tag}: m1_dependency uses the unqualified token "M1" — name the track ("M1 real-money spend control" for spend, "internal LLM-cost metering" for model usage, or "none") (owner ruling 2026-09-06)`);
  }
}

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

    // API Expense & Operations Layer (v1.1): every provider carries an expense block + a QUALIFIED m1.
    validateExpenseBlock(p.expense_and_operations, `provider "${tag}"`, E);
    checkBaseM1(p.m1_dependency, `provider "${tag}"`, E);
  }

  // COVERAGE — every taxonomy group must have at least one catalogued provider.
  for (const id of taxIds) if (!groupsCovered.has(id)) E(`taxonomy group "${id}" has no catalogued provider`);

  // COST TRACKS — the M1 disambiguation must declare both named tracks (owner ruling 2026-09-06).
  const ct = reg.cost_tracks;
  if (ct == null || typeof ct !== "object") E("cost_tracks missing");
  else {
    for (const k of ["llm_cost_metering", "m1_real_money_spend_control", "none"]) {
      if (!nonEmptyStr(ct[k])) E(`cost_tracks missing/empty "${k}"`);
    }
  }

  // PUBLIC PRESENCE ROADMAP — ordered, each item a valid roadmap entry with an expense block.
  const rp = reg.public_presence_roadmap;
  if (rp == null || typeof rp !== "object" || !nonEmptyArr(rp.items)) {
    E("public_presence_roadmap.items must be a non-empty array");
  } else {
    const orders = new Set();
    const rmIds = new Set();
    for (const it of rp.items) {
      const rtag = `roadmap "${nonEmptyStr(it.id) ? it.id : JSON.stringify(it).slice(0, 40)}"`;
      for (const f of ["id", "provider", "product_or_api", "business_purpose", "status"]) {
        if (!nonEmptyStr(it[f])) E(`${rtag}: missing/empty "${f}"`);
      }
      if (nonEmptyStr(it.id)) { if (rmIds.has(it.id)) E(`${rtag}: duplicate roadmap id`); rmIds.add(it.id); }
      if (nonEmptyStr(it.status) && !STATUSES.includes(it.status)) E(`${rtag}: unknown status "${it.status}"`);
      if (typeof it.order !== "number") E(`${rtag}: order must be a number`);
      else { if (orders.has(it.order)) E(`${rtag}: duplicate order ${it.order}`); orders.add(it.order); }
      if (it.tier_eligibility && typeof it.tier_eligibility === "object") {
        for (const t of TIER_KEYS) {
          if (!(t in it.tier_eligibility)) E(`${rtag}: tier_eligibility missing "${t}"`);
          else if (!TIER_VALUES.includes(it.tier_eligibility[t])) E(`${rtag}: tier_eligibility.${t}="${it.tier_eligibility[t]}" invalid`);
        }
      } else E(`${rtag}: tier_eligibility missing`);
      validateExpenseBlock(it.expense_and_operations, rtag, E);
    }
  }

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
  // --- Expense & Operations Layer (v1.1) ---
  mustFail("missing expense block", (r) => { delete r.providers[0].expense_and_operations; });
  mustFail("bad cost_responsibility", (r) => { r.providers[0].expense_and_operations.cost_responsibility = "somebody"; });
  mustFail("bad pricing_model", (r) => { r.providers[0].expense_and_operations.pricing_model = "cheap"; });
  mustFail("bad cost_driver", (r) => { r.providers[0].expense_and_operations.expected_cost_driver = ["vibes"]; });
  mustFail("date-stamp without source", (r) => {
    const p = r.providers[0].expense_and_operations;
    p.pricing_checked_as_of = "2026-09-06"; p.pricing_source_url = "none";
  });
  mustFail("real money on wrong M1 track", (r) => {
    const p = r.providers.find((x) => x.expense_and_operations.money_movement.can_move_real_money === true);
    p.expense_and_operations.money_movement.m1_dependency_track = "llm_cost_metering";
  });
  mustFail("real money on 'none' track", (r) => {
    const p = r.providers.find((x) => x.expense_and_operations.money_movement.can_move_real_money === true);
    p.expense_and_operations.money_movement.m1_dependency_track = "none";
  });
  mustFail("unqualified M1 in base m1_dependency", (r) => {
    r.providers[0].m1_dependency = "must meter (M1) before autonomous use";
  });
  mustFail("unqualified M1 immunized by a qualified token", (r) => {
    r.providers[0].m1_dependency = "meter M1 first, then M1-b caps apply";
  });
  mustFail("missing cost_tracks", (r) => { delete r.cost_tracks; });
  mustFail("cost_tracks missing real-money track", (r) => { delete r.cost_tracks.m1_real_money_spend_control; });
  mustFail("missing public_presence_roadmap", (r) => { delete r.public_presence_roadmap; });
  mustFail("roadmap item bad status", (r) => { r.public_presence_roadmap.items[0].status = "SOON"; });
  mustFail("roadmap duplicate order", (r) => { r.public_presence_roadmap.items[1].order = r.public_presence_roadmap.items[0].order; });
  mustFail("roadmap item missing expense block", (r) => { delete r.public_presence_roadmap.items[0].expense_and_operations; });
  mustFail("roadmap real-money wrong track", (r) => {
    const it = r.public_presence_roadmap.items.find((x) => x.expense_and_operations.money_movement.can_move_real_money === true);
    it.expense_and_operations.money_movement.m1_dependency_track = "llm_cost_metering";
  });

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
