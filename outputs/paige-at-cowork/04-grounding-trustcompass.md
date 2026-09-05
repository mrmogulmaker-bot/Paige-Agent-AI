# Grounding Report 04 — Trust Compass derivation substrate (F04)

**Program:** PAIGE-at-Cowork-Level · **Phase:** 1 · **Flow:** F04 (every Impact-high action gets an
evidence-based Trust Compass posture BEFORE it happens) · **Date:** 2026-09-05 · **Base:** `b0af098`.
Repo citations = Explore scout; prod facts = **CC-verified**. **Trust Compass is a DERIVED projection over five
sources — never its own source of truth (§57). The UI card is out of scope; CC builds the backend contract +
derivation.**

---

## Derivation spec (`docs/doctrine/command-center-four-surfaces.md`)
- Question: *"Can I trust this agent to do it?"* (`:27`). The loop is the dependency AND the acceptance test:
  `Mind → Game Plan → Systems Check → Trust Compass governs delegation → act → results return via Rail/Spine/
  Mind → next Game Plan` (`:32-40`).
- **5 postures** (`:71`): Delegate · Monitor · Ask First · Not Ready · Paused.
- **5 dimensions** (`:72-79`): Authority · Grounding · Readiness · Impact · Accountability.
- **No-fabrication rule** (`:84`): every state grounded in enforced authority + real evidence — posture MUST
  derive, never be stored or invented.
- **§4.2 seam** (`:86-97`): the Solo reader must be a **NEW tenant-scoped projection**, never a widened grant on
  operator-only `get_platform_trust_compass()`; a tenant never learns the platform posture, only its effect on
  its own tool.

## The five sources → dimensions (current reality)
| Dimension | Source | Wired? |
|---|---|---|
| **Readiness** | `systems_check_snapshot(p_scope)` (DEFINER, §59 in-body scope) — **CC-verified live** | **YES** |
| **Authority** | Spine `team.authority` adapter + `resolve_tool_autonomy` effective lane — **live**, bindings PARTIAL | PARTIAL |
| **Grounding** | Spine `business_context.readiness` + Mind projection | PARTIAL |
| **Impact** | `_shared/action-risk.ts` classifier + Spine `riskPolicyKey` | YES (classifier) |
| **Accountability** | Rail named-agent rows | **NO — blocked on F05** |

Spine registry `_shared/paige-spine/registry.ts` (brain measures 17 registered now). Governed seam
`_shared/paige-spine/governedExecution.ts:365` `decideGovernedExecution` — consumes `autonomyLane`
(`auto|confirm|off`), **clamps `auto`+`high` → `confirm`** (`:501`); this is where a posture must bind before an act.

## Autonomy substrate (§67/§68 — the posture spine)
- `autonomy_lane` = `text CHECK (… IN ('auto','confirm','off'))`, re-declared per table (not a shared enum).
- `paige_action_kinds` registry — **CC-verified prod: 34 rows** (seeded 10, grown); each carries executor,
  `requires_approval`, `default_autonomy_lane`, from/to dept + safety CHECKs.
- `resolve_tool_autonomy(uuid,text)` — **CC-verified live**; reads `tenant_tool_autonomy`, **clamps by
  `trust_effective_rung()`** (rung 0→off, rung 1→auto↓confirm); DEFINER, pins caller to own tenant.
- `trust_effective_rung()` — **CC-verified live; NO-ARG signature** (§13 correction: the scout wrote `(uuid)`;
  it derives the caller). Implements §68 decay (walk down to highest in-date, safety-proof-passing rung; floors at 1).
- Ceiling (Trust Compass, account, operator-set) / Grant (per process, human) / Floor (per capability) →
  `effective = min(grant, floor, ceiling)`.
- Posture→lane mapping is **NOT yet codified** (grep: no capability→dimension table, no posture rows). Natural
  map: Delegate/Monitor→`auto`, Ask First→`confirm`, Not Ready/Paused→`off` (cardinality is Owner Q).

## EXISTS vs DOESN'T (Trust Compass itself)
**EXISTS:** platform-ceiling fns `get/set_platform_trust_compass`, `trust_effective_rung()`,
`platform_safety_proof()`, stored blob `admin_app_settings['paige_trust_compass']`; Solo `src/solo/compass.tsx`
(572 lines) whose dial is an **in-memory fixture, non-authoritative**; `useSoloTrust.ts` reads
`paige_action_kinds` platform-default lanes (not per-tenant posture); operator `TrustCompass.tsx`; Trust Compass
is a **top-level Solo nav item, NOT a Command Center tab**.

**DOES NOT EXIST (proven, grep):** `resolve_trust_compass_posture` RPC; a `{posture, dimensions, evidence_refs}`
derivation layer; a capability→dimension mapping; a Trust Compass Command Center tab (`CommandCenter.tsx` =
`sys`+`mind` only); a Business Game Plan surface/producer (no `GamePlan` component; "Who does what next" lives
only in the prototype); any Rail producer writing acting-agent attribution (= F05).

## NEEDS-BUILDING (delta)
1. **Derivation layer** producing per `capability_key`+`tenant_id`: `{posture, dimensions:{authority, grounding,
   readiness, impact, accountability}, evidence_refs}` — derived from the 5 sources, honoring no-fabrication.
2. **RPC `resolve_trust_compass_posture(p_tenant_id, p_capability_key)`** — SECURITY DEFINER, §59 in-body
   caller-scope (tenant from `current_user_tenant_id()`, never `p_tenant_id`); a **new tenant-scoped
   projection**, never a widened operator grant.
3. **Dimension wiring** per the table above.
4. **Posture→lane codification** that CLAMPS (never widens), reconciled with `resolve_tool_autonomy`'s
   `min(grant, ceiling)`.
5. **Impact-high-before-the-act:** resolve posture at `decideGovernedExecution` / the action bus BEFORE dispatch
   for every high-impact (`high`/`external_effect`/`owner_only`) action. **This is F01's
   `trust_compass_autonomy_consult` contract — F04 and F01 share this seam.**
6. **F05 dependency:** Accountability stays `incomplete` until named-agent Rail rows exist; represent as
   incomplete, never simulate.

## OWNER / PROD QUESTIONS
1. **RESOLVED by CC prod check:** #925 (`20261201000800`) AND #939 (`20261212000000`) are **both applied on
   prod** (the scout's/brain's "not applied" was stale). So the Rail capacity for Accountability is live; only
   the writers are missing (F05).
2. Posture cardinality: are "Not Ready" and "Paused" both `off`, or is one a distinct state?
3. Unit of posture: per-`capability_key`, per-department (the existing `useSoloTrust` model), or both?
4. Confirm the projection may expose derived per-capability posture while never revealing the platform
   ceiling/posture/attestation window (§4.2 seam).
5. Runtime liveness (owed §32.c): does the live tool loop actually call `resolve_tool_autonomy` before a write,
   and what is the current effective ceiling (an earlier `operator_rls_coverage` failure capped it 3→2)?

## PROD VERIFICATION LEDGER (CC-run, §13)
- Live: `resolve_tool_autonomy(uuid,text)`, `systems_check_snapshot(text)`, `get_solo_rail_activity(integer)`,
  `trust_effective_rung()` (no-arg). `paige_action_kinds` = 34 rows. No `resolve_trust_compass_posture`.
  #925+#939 migrations applied. (Supabase MCP, 2026-09-05.)
- OWED: runtime confirm that the tool loop consults the ceiling; current effective-rung value; §32.c drive.
