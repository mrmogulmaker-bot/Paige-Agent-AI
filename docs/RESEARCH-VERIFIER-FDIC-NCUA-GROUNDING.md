# Research Verifier + FDIC/NCUA Skills — Phase-0 Grounding

**Owner:** Antonio · **Prepared:** 2026-07-20 by Claude Code (grounding crew) · **Status:** grounding only — no product code until owner confirms the sequence.

Grounds the 2026-07-19 handoff: Paige shipped a bank/CU roster that was **17% accurate** (5 of 6 wrong/dead/misattributed) because she ran the §15 innovation half (propose the better format) but skipped the §5 verification half — she answered from **training recall**, not authoritative sources, with **no verifier pass** gating the output.

Three fixes: (1) a mandatory pre-send verifier gate, (2) authoritative FDIC/NCUA lookup skills, (3) a skills-folder hygiene audit. This doc is the §18 four-question grounding for all three, from a 3-scout read of the actual codebase.

---

## Blocker cleared first: L1 `paige_llm_trace` works

The handoff flagged "L1.1 is 0-rows in prod — diagnose before wiring telemetry." **Done this session (PR #146).** The writer was never broken — a real trace row landed once real chat traffic hit the instrumented path; the "0 rows" was pre-launch traffic. The one real defect (a `tenant_id` FK silently dropping God/platform/non-`tenants` traces via the writer's swallowing catch) is fixed and verified live. So `reasoningOnTrace`, verifier telemetry, and skill-call telemetry now land on **working** plumbing.

---

## The §18 headline: almost nothing here is net-new

| Capability the handoff asks for | What ALREADY exists in-repo | Verdict |
|---|---|---|
| Cross-check an institution against FDIC/NCUA | **`search-local-lenders`** already fetches live `api.fdic.gov` + NCUA ArcGIS | **EXTRACT & REUSE**, don't build a 3rd HTTP client |
| A verify→redraft loop | **`runReasoning`** (`_shared/reasoning/engine.ts`, #144) + **`critiqueImageAndIterate`** (its image sibling) | **EXTEND** — text analogue, no engine changes |
| An entity cross-check verifier + adapter registry | **`business-verifier`** edge fn + `business_verifier` sub-agent + `_shared/businessVerifyAdapters/{secEdgar,sos,opencorporates,dnb…}` | **EXTEND** — add bank/CU adapters to this family |
| A cited-research producer with an anti-fabrication gate | **`paige-deep-research`** (`validateAndBind`/`validateProfile` deterministic grounding gate) | **EXTEND** — add the semantic verifier alongside the grounding gate |
| A "skill" that wraps a gov API + caches with TTL | **`fetch-economic-rates`** (FRED + `economic_rates_cache` TTL pattern) | **MIRROR** the pattern |
| Marketplace platform-default skill registration | `marketplace_items` (`item_type='skill'`, `origin='first_party'`, `scope='public'`, `default_for_new_tenants`) + `_versions.install_manifest {kind:'skill_flag'}` | **EXTEND** — seed rows |

Net-new is small: **one generic `paige_data_cache` table**, **the bank/CU adapters** (extracted from `search-local-lenders`), and **the verifier's institution-extraction step**.

---

## Fix 1 — Pre-send verifier gate (grounded)

- **THE chokepoint is ONE function: `paige-deep-research/index.ts`**, between the existing validation (`validateAndBind` :859 / `validateProfile` :1667) and the return (`buildResult`/`json(result)` :1663–1688). **`paige-orchestrator` is NOT the research producer** (it's a generic `paige_subagents` tool router); `paige-ai-chat`'s `deep_research` handler (:5861–5939) just `fetch`es `paige-deep-research`. So the handoff's "orchestrator gate" actually lives in `paige-deep-research` — hooking here covers **every** caller (§18 one home). Hooking it in the chat handler would fork it (chat-only + re-extract what the engine already has structured as `Finding.name/website/phone`).
- **The drafting agent = `synthesize()` (:770–848)**, model call `routedChatCompletion("doc_draft")` (:835).
- **Two DISTINCT gates, not a dup:** the existing `validateAndBind` checks "does this string appear verbatim in a cited source" (a *grounding* gate). The verifier checks "is this institution alive / correctly-named / geographically-correct against authoritative sources" (a *semantic cross-check*). The verifier **extends**; it reuses the existing `confidence` (`high|medium|low`) + `unverified_notes[]`/`unverifiedFields[]` seams for per-item low-confidence disclaimers.
- **`runReasoning` fits with no engine changes:** `initial` = drafted `Finding[]`/`DeepResearchResult`; `evaluate` = verifier agent → `ReasoningVerdict {verdict: SHIP|ITERATE, refinedInstruction: <flags>, findings: <per-item>}`; `generate` = re-`synthesize()` with flags appended. Honor the trace contract (`trace.ts`): `needsConfig` verdict for an intentional degrade (cross-check source offline), `null` only on genuine throw. Wire `reasoningOnTrace(ctx)` for L1.
- **The verifier's cross-check calls the Fix-2 FDIC/NCUA adapters** (extracted from `search-local-lenders`) + the existing `businessVerifyAdapters` for non-bank entities. Register the verifier in `paige_subagents` as a **platform default** (`tenant_id=null`) so every tenant gets it — `business_verifier`/`financial-research` are the precedent.
- **Small blocker:** `paige-deep-research` has **no `tenant_id`** in its request contract (`DeepResearchRequest` :82–98) and `paige-ai-chat` (:5877) doesn't forward `personaCtx.tenant_id`. Add `tenant_id` to the contract + forward it + thread into the verifier's `TraceCtx`/`paige_audit_log` insert (set explicitly; `null` = honest platform scope). Confirm the #206 tenant-passing seam while there.

## Fix 2 — FDIC/NCUA lookup skills (grounded)

- **A "skill" = a `paige_skills` row + a `case` branch in `skill-runner/index.ts`'s `switch(skill.slug)`** (not a manifest or its own edge fn). Slugs are snake_case (`fdic_bank_lookup`, `ncua_credit_union_lookup`).
- **Reuse, don't reinvent:** `search-local-lenders` already calls live FDIC + NCUA. Extract that fetch/parse logic into shared adapters (proposed `_shared/institutionLookup/{fdic,ncua}.ts`, mirroring `businessVerifyAdapters/`), consumed by **both** the new skills **and** the Fix-1 verifier. Wrap with the **`fetch-economic-rates`** cache-with-TTL shape.
- **`paige_data_cache` is net-new** (no generic cache exists; `economic_rates_cache` is FRED-specific). Model on its TTL mechanics: keys `(source, entity_id, fetched_at)` + `expires_at` + `jsonb` payload, 7–30d TTL, service-role-write / authed-read RLS.
- **`skill-runner` gap:** it runs service-role and does **not** set `tenant_id` or write `paige_audit_log` today → net-new plumbing: thread a `tenant_id` input + insert an audit row (pattern: `skill-forge` :123–128).
- **Marketplace registration:** first-party (`owner_tenant_id IS NULL` vendor), `scope='public'`, `item_type='skill'`, `default_for_new_tenants=false` (opt-in), `_versions.install_manifest.functions[] = [{kind:'skill_flag', slug}]`. Install → `set_tenant_skill(tenant, slug, true)` per tenant.
- **§9/§2:** a pure name/geo/status lookup is factual reference data → §2-clean as an operator default. **BUT a real §2 landmine:** `_shared/model-router-gates.ts` `FINANCE_PATTERNS` has a bare `/\bcredit\b/i` (:134) that **false-positives on "credit union"** — the NCUA skill's own name. Keep these skills off any `assertNoFinanceInDefault`/finance-gate path, or add a "credit union" allow-carve. Do not let it silently trip.

## Fix 3 — Skills-folder hygiene audit (grounded inventory)

**Tier 1 — factual claims, NO lookup, NO verifier (the wrong-roster archetype; patch or pull before tenant exposure):**
1. **`subagent-funding-path`** (`:31 CATALOG`) — hardcoded funding-product roster asserting `fico_min`, `est_amount`, **`reports_to_consumer` (safety-relevant)** as fact. Highest harm.
2. **`subagent-stack-strategist`** (`:30 CATALOG`) — hardcoded vendor roster asserting which bureaus each vendor `reports_to`. Churns constantly.
3. **`search-sba-lenders`** → `_shared/sba-lender-data.ts` (42 static entries) — the literal "static roster, no live lookup, no verifier" case; header even says "refresh quarterly." **Cleanest win: rewire to a live source the way `search-local-lenders` already does.**

**Tier 2 — LLM synthesis, sources but NO enforced verifier:** `subagent-market-research` (unenforced `[n]` citations + a hardwired `FUNDING IMPLICATIONS` section = §2 concern), `skill-runner` skills `research_to_concept_brief` / `draft_and_email_document` (drafts + **emails** unchecked) / `build_game_plan`, and `generate-lender-summary` (derived ratios unverified).

**GOOD (the models to copy, not patch):** `paige-deep-research` (deterministic grounding gate), `search-local-lenders` (live FDIC/NCUA), `business-verifier` + `verify_business_sos`, `subagent-fundability` (deterministic over tenant's own rows).

**§2 nuance for Tier-1 funding subagents (per the 2026-07-09 clarification):** funding is an allowed *offer*, never a *default*. So `subagent-funding-path`/`stack-strategist` are not "pull entirely" — the correct action is **(a)** gate them behind the per-tenant funding opt-in (dovetails #176/#206) **and (b)** give their factual claims an authoritative lookup or verifier. `search-sba-lenders` is coaching-generic-adjacent and is purely an accuracy fix.

---

## Proposed sequence (owner to confirm)

The scouts confirm the dependency order:

1. **Fix 2 first** — extract FDIC/NCUA adapters from `search-local-lenders` → `_shared/institutionLookup/*`; add `paige_data_cache`; wrap as `fdic_bank_lookup` + `ncua_credit_union_lookup` skills (runner branches + `paige_skills` rows + marketplace items) with tenant-scoped audit. *These are the authoritative substrate everything else calls.*
2. **Fix 1 next** — wrap `paige-deep-research`'s synth+validate in `runReasoning` with a verifier agent that calls the Fix-2 adapters; thread `tenant_id`; wire `reasoningOnTrace`. *The gate that uses the substrate.*
3. **Fix 3 last** — rewire/verify the Tier-1 rosters (`search-sba-lenders` → live source; funding subagents → lookup + funding-opt-in gate) and add the verifier to Tier-2 draft-then-send paths. *Migrate the rest onto the substrate.*

Each phase ships as its own slice (§4) with the full crew (design/build + adversarial verifier + compliance officer, §1/§5) and, being data-correctness work, a live headless smoke test against the real FDIC/NCUA endpoints (§32) before merge. Owner chose "wait for the skills" on re-verifying the original ~35-name roster — so the roster sweep runs via the Fix-2 skills once they exist, not by hand.

**Decisions that need owner input before Phase 1** — see the chat message accompanying this doc.
