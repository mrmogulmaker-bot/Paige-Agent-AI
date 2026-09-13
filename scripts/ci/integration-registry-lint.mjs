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
// A status that CLAIMS a live runtime. Such a provider MUST cite the real adapter/entry-point code
// that backs it (code_anchors), and those paths MUST exist on disk — the §13/§32 accountability the
// registry steward note named as owed (Upload-Post / fal.ai merged owing entries). The complement of
// UNBUILT_STATUSES.
const RUNTIME_CLAIMING_STATUSES = ["LIVE", "PARTIAL", "PROOF_OWED"];
// CONTROLLED code_anchor `role` vocabulary (owner refinement 2026-09-13). A code anchor proves only
// that a relevant code PATH EXISTS — never that the provider works/connected/customer-ready. The kind
// is drift-proof (lint-enforced), never free prose:
//   provider_adapter       — the provider's own integration code (API client, send seam, OAuth, adapter)
//   callback_readback      — webhook receiver / status callback that reads back the provider's outcome
//   fail_closed_containment — a path that deliberately refuses/contains (e.g. a 503)
//   proven_runtime         — ONLY where genuine authenticated end-to-end §32.c runtime proof exists
//                            (default: DO NOT use — none today; code existing is never runtime proof)
const CODE_ANCHOR_ROLES = ["provider_adapter", "callback_readback", "fail_closed_containment", "proven_runtime"];
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

// The OWNER-APPROVED Public Presence roadmap order (report section 4). The JSON is the source of truth
// for this sequence, so CI enforces it (Codex P2). Reordering, inserting, or dropping an item fails
// until this constant is updated — an owner re-prioritization is deliberate, not accidental drift.
const EXPECTED_ROADMAP_ORDER = [
  "google-search-console", "google-business-profile", "bing-webmaster", "apple-business-connect",
  "yelp", "facebook-presence", "linkedin", "directory-network",
];

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
  // pricing_checked_as_of: the KEY must exist (null when not verified). When a next owner date-stamps
  // it, the date must be a real ISO date AND the source must be a real URL — string-presence is not
  // enough or "not-an-iso-date" + "internal notes" would masquerade as dated source verification
  // (§13 / R10; §39 verifier 1(a) + Codex P2).
  if (!("pricing_checked_as_of" in eo)) E(`${tag}: expense_and_operations missing "pricing_checked_as_of" (use null if not verified)`);
  else if (eo.pricing_checked_as_of !== null) {
    if (!nonEmptyStr(eo.pricing_checked_as_of) || !/^\d{4}-\d{2}-\d{2}$/.test(eo.pricing_checked_as_of.trim())) {
      E(`${tag}: pricing_checked_as_of must be null or an ISO date (YYYY-MM-DD), not "${eo.pricing_checked_as_of}"`);
    } else if (!nonEmptyStr(eo.pricing_source_url) || !/^https?:\/\/\S+/i.test(eo.pricing_source_url.trim())) {
      E(`${tag}: pricing_checked_as_of is date-stamped but pricing_source_url is not an official URL (http(s)://…) — a date-stamp requires a real source (R10/§13)`);
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

  // field_schema must be a non-null object AND declare the code_anchors contract (the accountability
  // field, v1.2). A non-object field_schema (null/string/number/array) would otherwise skip this
  // check and silently drop the entire code_anchors requirement — a hole in the honesty guard itself
  // (Codex P2). Require the object first, then that it describes code_anchors.
  if (reg.field_schema == null || typeof reg.field_schema !== "object" || Array.isArray(reg.field_schema)) {
    E("field_schema must be a non-null object (its legend declares the code_anchors contract)");
  } else if (!nonEmptyStr(reg.field_schema.code_anchors)) {
    E('field_schema is missing the "code_anchors" field description');
  }

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

    // HONESTY INVARIANT 4 (v1.2) — code_anchors accountability. A runtime-claiming status
    // (LIVE/PARTIAL/PROOF_OWED) MUST cite the real adapter/entry-point code that backs it, each entry
    // a {path, role, note?} object with non-empty string path + role. An unbuilt status
    // (UNAVAILABLE/DEFERRED/PROPOSED) has no runtime to anchor, so code_anchors MUST be absent or []
    // — declaring real anchors on an unbuilt integration is the dishonesty (mirrors INVARIANT 1). The
    // dead-anchor resolve (findDeadCodeAnchors, in main) then proves each cited path exists on disk.
    const anchors = p.code_anchors;
    if (RUNTIME_CLAIMING_STATUSES.includes(p.status)) {
      if (!nonEmptyArr(anchors)) {
        E(`provider "${tag}": status ${p.status} requires a non-empty code_anchors array citing the real adapter/entry-point code that backs it (§13/§32)`);
      } else {
        for (const a of anchors) {
          if (a == null || typeof a !== "object" || Array.isArray(a)) {
            E(`provider "${tag}": each code_anchors entry must be an object {path, role, note?}`);
            continue;
          }
          if (!nonEmptyStr(a.path)) E(`provider "${tag}": code_anchors entry missing non-empty string "path"`);
          else if (a.path.startsWith("/") || a.path.split("/").includes("..")) E(`provider "${tag}": code_anchors path "${a.path}" must be repo-relative — no absolute path, no ".." traversal (an anchor must identify repository code, never a CI-host file — Codex P2)`);
          if (!nonEmptyStr(a.role)) E(`provider "${tag}": code_anchors entry missing non-empty string "role"`);
          else if (!CODE_ANCHOR_ROLES.includes(a.role)) E(`provider "${tag}": code_anchors entry role "${a.role}" is not one of ${CODE_ANCHOR_ROLES.join("|")} (a controlled, drift-proof vocabulary — owner refinement 2026-09-13)`);
          if ("note" in a && typeof a.note !== "string") E(`provider "${tag}": code_anchors entry "note" must be a string when present`);
        }
      }
    } else if (UNBUILT_STATUSES.includes(p.status)) {
      if (anchors !== undefined && !(Array.isArray(anchors) && anchors.length === 0)) {
        E(`provider "${tag}": status ${p.status} is unbuilt — code_anchors must be ABSENT or [] (declaring real anchors on an unbuilt integration is dishonest, R1/R2)`);
      }
    }
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
    // Enforce the OWNER-APPROVED sequence (Codex P2): items sorted by `order` must match the approved
    // id sequence exactly, and orders must be contiguous 1..N — so a reorder/insert/drop fails CI.
    const byOrder = [...rp.items].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    const sortedIds = byOrder.map((it) => it.id);
    if (JSON.stringify(sortedIds) !== JSON.stringify(EXPECTED_ROADMAP_ORDER)) {
      E(`public_presence_roadmap by ascending order is [${sortedIds.join(", ")}] but the approved sequence is [${EXPECTED_ROADMAP_ORDER.join(", ")}] — fix the order, or update EXPECTED_ROADMAP_ORDER on a deliberate owner re-prioritization`);
    }
    const actualOrders = rp.items.map((it) => Number(it.order)).sort((a, b) => a - b);
    const contiguous = EXPECTED_ROADMAP_ORDER.map((_, i) => i + 1);
    if (JSON.stringify(actualOrders) !== JSON.stringify(contiguous)) {
      E(`public_presence_roadmap order values must be contiguous 1..${EXPECTED_ROADMAP_ORDER.length} (got [${actualOrders.join(", ")}])`);
    }
  }

  return errors;
}

// DEAD CODE ANCHORS (v1.2) — mirrors binding-ledger-lint's findDeadAnchors. The registry cites the
// real adapter/entry-point code in each runtime-claiming provider's code_anchors. A rename or delete
// leaves an anchor pointing at code that no longer exists while the provider still claims a built
// runtime — the registry lying with authority (§BRAIN). `exists` is injected so this stays a PURE,
// unit-testable function; main() passes anchorExists (fs-backed), the self-test passes a fake.
export function findDeadCodeAnchors(reg, exists) {
  const findings = [];
  for (const p of reg?.providers ?? []) {
    if (!Array.isArray(p?.code_anchors)) continue; // structural validity is validateRegistry's job
    for (const a of p.code_anchors) {
      const path = a && typeof a.path === "string" ? a.path : null;
      if (!path) continue;
      if (!exists(path)) findings.push(`provider "${p.id}": code_anchor '${path}' does not exist`);
    }
  }
  return findings;
}

// Resolve a code_anchor path to a concrete adapter FILE. A bare DIRECTORY is rejected: directory
// existence does not detect file-level drift — a provider's adapter file can be deleted or moved
// while sibling files keep the directory alive, so a dir anchor would report green after the seam
// disappeared (Codex P2). A concrete path must therefore resolve to a FILE, and a glob (a single `*`
// in its LAST path segment) must match ≥1 FILE. Dependency-free; only a last-segment `*` is supported.
function anchorExists(p) {
  if (typeof p !== "string" || !p) return false;
  // Repo-containment backstop (Codex P2): never stat a path outside the repo tree — an absolute path
  // (/etc/passwd) or a `..` escape must not satisfy the dead-anchor check with a CI-host file. The pure
  // validateRegistry already rejects such shapes structurally; this is defense-in-depth at the fs layer.
  if (p.startsWith("/") || p.split("/").includes("..")) return false;
  // lstatSync (NOT statSync) so a SYMLINK does not satisfy the check: statSync follows a link, so a
  // committed anchor `adapter.ts -> /etc/passwd` would resolve to a CI-host file (Codex P2). lstat does
  // not follow — a symlink is isSymbolicLink()=true / isFile()=false, so it is rejected; a real regular
  // file is isFile()=true either way.
  const isFile = (f) => { try { return fs.lstatSync(f).isFile(); } catch { return false; } };
  if (!p.includes("*")) return isFile(p);
  const slash = p.lastIndexOf("/");
  const dir = slash === -1 ? "." : p.slice(0, slash);
  const pattern = p.slice(slash + 1);
  const star = pattern.indexOf("*");
  const pre = pattern.slice(0, star);
  const suf = pattern.slice(star + 1);
  let entries;
  try { entries = fs.readdirSync(dir); } catch { return false; }
  return entries.some((e) => e.length >= pre.length + suf.length && e.startsWith(pre) && e.endsWith(suf) && isFile(`${dir}/${e}`));
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
  mustFail("date-stamp with non-ISO date", (r) => {
    const p = r.providers[0].expense_and_operations;
    p.pricing_checked_as_of = "not-an-iso-date"; p.pricing_source_url = "https://example.com/pricing";
  });
  mustFail("date-stamp with non-URL source", (r) => {
    const p = r.providers[0].expense_and_operations;
    p.pricing_checked_as_of = "2026-09-06"; p.pricing_source_url = "internal notes";
  });
  mustFail("roadmap approved sequence reversed", (r) => {
    const items = r.public_presence_roadmap.items;
    const a = items[0].order; items[0].order = items[1].order; items[1].order = a;
  });
  mustFail("roadmap order not contiguous", (r) => {
    r.public_presence_roadmap.items[0].order = 99;
  });
  // --- code_anchors accountability (v1.2) ---
  mustFail("runtime provider missing code_anchors", (r) => {
    const p = r.providers.find((x) => ["LIVE", "PARTIAL", "PROOF_OWED"].includes(x.status));
    delete p.code_anchors;
  });
  mustFail("unbuilt provider declares code_anchors", (r) => {
    const p = r.providers.find((x) => ["UNAVAILABLE", "DEFERRED", "PROPOSED"].includes(x.status));
    p.code_anchors = [{ path: "supabase/functions/_shared/twilio.ts", role: "send seam" }];
  });
  mustFail("runtime code_anchor entry missing role", (r) => {
    const p = r.providers.find((x) => ["LIVE", "PARTIAL", "PROOF_OWED"].includes(x.status));
    p.code_anchors = [{ path: "supabase/functions/_shared/twilio.ts" }];
  });
  mustFail("code_anchor role outside the controlled vocabulary", (r) => {
    const p = r.providers.find((x) => ["LIVE", "PARTIAL", "PROOF_OWED"].includes(x.status));
    p.code_anchors = [{ path: "supabase/functions/_shared/twilio.ts", role: "send seam" }];
  });
  // A non-object field_schema must fail — otherwise the code_anchors contract check is silently
  // skipped and CI accepts a registry with the whole accountability field removed (Codex P2).
  mustFail("non-object field_schema (string) skips the code_anchors contract", (r) => {
    r.field_schema = "not an object";
  });
  mustFail("null field_schema skips the code_anchors contract", (r) => {
    r.field_schema = null;
  });
  // A code_anchor path must be repo-relative — an absolute path or a `..` escape must fail (Codex P2).
  mustFail("code_anchor path is absolute (escapes the repo)", (r) => {
    const p = r.providers.find((x) => ["LIVE", "PARTIAL", "PROOF_OWED"].includes(x.status));
    p.code_anchors = [{ path: "/etc/passwd", role: "provider_adapter" }];
  });
  mustFail("code_anchor path uses .. traversal (escapes the repo)", (r) => {
    const p = r.providers.find((x) => ["LIVE", "PARTIAL", "PROOF_OWED"].includes(x.status));
    p.code_anchors = [{ path: "../../../etc/passwd", role: "provider_adapter" }];
  });

  // Prove the DEAD-ANCHOR RESOLVER actually catches a missing path — not just the structural rules.
  // With exists=()=>false, every cited anchor on the real registry must be flagged (>=1).
  const deadProof = findDeadCodeAnchors(real, () => false);
  if (deadProof.length === 0) {
    fails.push("findDeadCodeAnchors with exists=()=>false flagged nothing — the dead-anchor resolver is not reading code_anchors paths");
  }
  // Prove the anchorExists glob branch resolves a single `*` in the last segment (both directions).
  if (!anchorExists("supabase/functions/_shared/twilio*.ts")) {
    fails.push("anchorExists glob matcher failed to resolve a real glob 'supabase/functions/_shared/twilio*.ts'");
  }
  if (anchorExists("supabase/functions/_shared/zzz-no-such-file*.ts")) {
    fails.push("anchorExists glob matcher wrongly resolved a non-existent glob");
  }
  // Prove a bare DIRECTORY is REJECTED (Codex P2 — dir existence must not satisfy a file-level anchor).
  if (anchorExists("supabase/functions/")) {
    fails.push("anchorExists accepted a bare directory — a dir anchor cannot detect file-level drift (Codex P2)");
  }
  if (!anchorExists("supabase/functions/_shared/twilio.ts")) {
    fails.push("anchorExists rejected a real file 'supabase/functions/_shared/twilio.ts' — the file resolver is broken");
  }
  // Prove the repo-containment backstop (Codex P2): a path outside the repo tree must NOT resolve.
  if (anchorExists("/etc/passwd")) {
    fails.push("anchorExists accepted an absolute path outside the repo (Codex P2)");
  }
  if (anchorExists("../package.json")) {
    fails.push("anchorExists accepted a parent-traversal path escaping the repo (Codex P2)");
  }

  if (fails.length) {
    console.error("✗ integration-registry-lint SELF-TEST FAILED:");
    for (const f of fails) console.error(`    • ${f}`);
    process.exit(1);
  }
  console.log(`✓ integration-registry-lint self-test: real registry valid; ${mutationCount} honesty/structure mutations all caught; dead-anchor resolver + glob matcher proven.`);
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
  // Dead-anchor resolve (v1.2): every cited code_anchor path must exist on disk. A runtime-claiming
  // provider may not point at code that has been renamed or deleted (§13/§32/§BRAIN).
  errors.push(...findDeadCodeAnchors(reg, anchorExists));
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

  const anchorCount = reg.providers.reduce((n, p) => n + (Array.isArray(p.code_anchors) ? p.code_anchors.length : 0), 0);
  console.log(`✓ integration-registry-lint: ${reg.providers.length} providers, all ${reg.taxonomy.length} taxonomy groups covered, honest status vocabulary, ${anchorCount} code_anchors all resolve on disk.`);
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
