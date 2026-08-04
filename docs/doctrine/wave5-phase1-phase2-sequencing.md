# Wave 5 Sequencing Standard — Phase 1 (finish it completely) → Phase 2 (platform-feature redo)

**Owner-locked 2026-08-03 (Tasks #235 + #236).** Owner's ruling, verbatim:
*"I want to finish that part completely and then redo the rest of the platform features."*

This is the standing sequencing gate that governs what may start next. It sits alongside
the §196 pre-launch roadmap and the §16/§17 operating/growth maps; it does **not** replace
them — it gates *when* they resume.

---

## Phase 1 — Finish Wave 5 COMPLETELY (definition of done)

Wave 5 (#204) is the §200/§45/§2/§7/§213.e audit + remediation that proves the platform is
genuinely tenant-generic. Phase 1 is **not** "the wrap after the hotfixes" — it is the
completion of that proof. Definition of done, all of it:

1. **Read-only audit** (6 lens-auditors + synthesizer) → findings ranked. **Done** — 0
   CRITICAL; L1 §200 phantoms PASS; L4 §2 finance CLEAN; the real class was §45 sellability
   (operator identity hardcoded in ship-facing code).
2. **CRITICAL/HIGH findings → immediate hotfix, folded into the current bundle.**
3. **MEDIUM findings → Wave-5-build slices, iterated until shipped.**
4. **LOW findings → tracked follow-ups (may defer).**
5. **Full remediation shipped to `main` + §32 dual-leg prod-confirmed.**
6. **Platform verified tenant-generic end-to-end:** grep-clean of MMA/operator phantoms;
   tier-conditional code replaced by generic predicates (§213.e); Enterprise
   configured-not-excepted; §2 finance-clean in platform defaults; §45 no operator PII on
   any ship-facing surface; §200 config-as-data throughout.

### The bundle that satisfies Phase 1 (as executed)
- **#227** sub-account owner correction (§213.e) — merged + §32 dual-leg prod-confirmed.
- **Group A** #229 (chatbot `/agency` hide) · #233 (login-context reset) · #228 (owner-row
  kebab Tier-2 hide) — merged.
- **§45 de-brand** — the audit's core finding, folded as **one config-as-data seam** (§18):
  foundation `resolve_operator_identity` (merged + prod-confirmed) + the 21-site consumer
  migration (UI + edge slices, merged). N5 (`paige-ai-chat` §2 chat-prompt de-hardcode) is
  the paired slice, **owner-review-before-ship gated**.
- **Wave 5 F10–F15 tier-drift** (support-SLA slug spoof, `canSubaccounts` literal, trial-
  checkout hardcoded price, dead pricing registry, dead-code funding nav, onboarding
  catch-all) — MEDIUM/LOW; **fire in Phase-1's tail, after the de-brand seam ships.**

Phase 1 closes only when the whole bundle is on `main`, prod-confirmed, and the
tenant-generic checklist (item 6) holds.

---

## Phase 2 — Platform-feature redo (per §221)

Every existing user-facing capability is audited and re-verified through:
**Tier × Role matrix (#221) + §51 six-tier check + §50 impact assessment + §213.e
current-and-future + §37 producer inventory + §36 intuitiveness moat.** Findings route to a
polish PR or a feature workstream. This is **not a rewrite** — it is a systematic
verification pass that surfaces everything the platform ships with taxonomy discipline.

---

## THE GATE — nothing new starts until Phase 1 clears

- **In-flight Wave-5 work continues** (the bundle above).
- **NO new capability workstreams** queue ahead — e.g. #45 Super Admin, #232 Agency-tier,
  #338 Slice B privacy, #340 coach self-service, #223 Money Spine Rebill — all queue behind.
- **NO §196 pre-launch advancement** — Practice Blueprints, Owner Trilogy, L8 Memory Fabric
  **build**, Paige Quality Wave, Playwright, BETA, SOC 2 — all queue behind. (Scope briefs
  already filed, e.g. the L8 Memory Fabric brief and the Practice Blueprints Slice-1
  substrate, stay **scope/park-only** until Phase 1 clears — parked, never merged early.)

## Order of operations

1. Current in-flight bundle lands (done: #227 + Group A + §45 foundation + §45 consumers;
   pending: N5 owner approval).
2. Wave 5 remediation iterates until the platform is verified tenant-generic.
3. Wave 5 prod-confirmed via §32 dual-leg.
4. **THEN** Phase 2 (platform-feature redo per §221) opens.
5. **THEN** the §196 pre-launch sequence resumes.

## Discipline reminders (per this ruling)

- No pre-launch capability builds slip in "while we're waiting" — the wait **is** the point.
- The hotfix bundle discovering more Wave-5 findings mid-audit is **expected and correct** —
  that is why the audit runs in parallel with the bundle (the drift-catch).
- Every finding gets a §213.e re-attack ("current + future tiers/settings, not just today's").
- Every remediation is framework-generic (§213 — no per-tenant patches).

---

*Related: §196 (pre-launch roadmap) · §200 (platform-independence audit) · §45 (sellability) ·
§2 (finance-not-default) · §213/§213.e (framework-level scope) · §221 (Tier × Role matrix) ·
§51 (six-tier discipline) · §32 (dual-leg verification) · §37 (producer inventory).*
