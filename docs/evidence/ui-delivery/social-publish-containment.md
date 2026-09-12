# UI delivery evidence: contain Social publishing server-side (Gate A)

Owner ruling (Gate A, 2026-09-12): Social PUBLICATION is an externally-consequential action, and the
governed tenant-safe Social path is not built or proven, so Paige must publish to no social account
through any entry point — and a configured provider key is not authorization. This change denies the
one publishing action at BOTH content-publication seams (`paige-social` `post`, `meta-schedule-post`)
and returns an honest UNAVAILABLE, so the visible Chat flow changes from an attempted publish to a
truthful refusal. It is a backend authority/truth safeguard with no UI file; how the refusal is phrased
in Chat is Claude Design's per §00. This record exists because that visible-flow impact was declared
with a `Visible-Flow-Impact: yes` commit trailer (AGENTS.md backend-to-visible routing).

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: ran audit-first — the §37 producer inventory mapped every publication caller (the Chat social_post tool, a direct service-role call, the cron-token path) and both content-publication seams (paige-social post via Upload-Post, meta-schedule-post via the Meta Graph) before the denial; the affected flow is "a customer asks Paige to post, and gets a truthful UNAVAILABLE refusal instead of a publish"; the durable flow record is this file and src/__tests__/social-publish-containment.test.ts.
PAIGE_UI_DESIGN: PASS: read .agents/skills/paige-ui-design/SKILL.md this session; §00 respected — this is a backend authority/truth safeguard executed to the owner's Gate A ruling, and no visual direction was invented, substituted, or overridden.
MATERIAL_FLOW_CHANGE: YES: the consequence of the Chat "post" flow changes materially — a publication that could reach a provider is replaced by a server-side denial carrying a truthful UNAVAILABLE status.
FLOW_PROTOTYPE: PASS: the owner's Gate A ruling 2026-09-12 authorizes the denial (a refusal has no surface to prototype — the model relays the UNAVAILABLE status, whose phrasing is Claude Design's per §00); pre-launch §4 also lifts the prototype gate.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: purpose — stop Paige publishing to any social account until the governed path is proven; audience — every caller of the publication seams (the Chat tool, a service-role caller, cron); primary action — the server-side denial, plus a regression proving a configured key still cannot publish.
VISUAL_DIRECTION: NOT_APPLICABLE: no interface is designed or added; a backend action is denied and the Chat surface's phrasing of the honest status is Claude Design's (§00).
AUTOMATED_EVIDENCE: PASS: src/__tests__/social-publish-containment.test.ts 13/13 — post denied unconditionally and key-independently, reads and cancel_scheduled preserved, the shared wire body carries success:false, and structural assertions that both seams deny before the provider call (Upload-Post and the Meta Graph call) and before the meta_ads_features_enabled flag read; perturbation-proven, since emptying CONTAINED_ACTIONS turns the denial cases red.
STATIC_EVIDENCE: PASS: lint:action-risk and lint:governed-execution pass; the diff does not touch the inline chat tool list, so chat-tool-registry's pre-existing 8-tool red on main is unchanged and is not introduced by this PR; the containment module is pure, with no I/O, env, or clock.
RENDERED_EVIDENCE: NOT_APPLICABLE: this change adds no rendered element — it denies a backend action, so there is no new surface to capture and the denial is a structural and behavioral fact.
BEHAVIORAL_EVIDENCE: PASS: the structural test asserts, over the real seam source, that each publication seam's denial guard returns before the sole provider-call site, so a configured credential cannot reach a provider through the contained path; the request-to-denial behavior is exercised by the pure predicate over every action name.
AUTHENTICATED_RUNTIME: UNVERIFIED: this headless CI session holds no browser or authenticated tenant, so the deployed "Paige refuses to publish" drive on a signed-in tenant is owed to a browser-capable session or the owner's live look (§32.c); the denial is proven at the unit and structural level and, being a refusal, has no external effect to drive.
KEYBOARD_FOCUS: NOT_APPLICABLE: no interactive element is added or changed.
ZOOM_REFLOW: NOT_APPLICABLE: no layout is introduced or changed.
REDUCED_MOTION: NOT_APPLICABLE: no motion, transition, or animation is added.
STATE_COVERAGE: PASS: the denial is unconditional for the publishing action across every entry point; reads, cancel_scheduled, and unknown actions are preserved and covered; the contained response is a non-success (success:false, ok:false, error, contained:true), so a denied attempt is recorded as FAILED, never as a succeeded publish.
TRUTHFUL_STATE_LABELS: PASS: Social publishing is labeled UNAVAILABLE (the capability is unbuilt, not merely unconnected); reads that actually work stay available; the copy does not advertise account connection, which is not wired (the connect action returns unknown_action) — fixed in this same diff after the independent review flagged the over-claim.
SOLO_UI: NO: the changed files are supabase/functions and a test — no canonical Solo surface changed, and the evidence classifier's isSoloUi is false for every changed path.
UNVERIFIED: the browser-driven, signed-in confirmation that Chat surfaces the honest UNAVAILABLE refusal on the deployed build is owed to a browser-capable session or the owner (§32.c); the denial itself is a unit- and structure-proven backend fact (publication cannot reach a provider), which the live drive would re-confirm.

## Release governance

INTERNAL_BUILD_IDENTITY: 70144b2b9e782fef1600a3121a7d15a62dbe32cc; deployment=draft PR #1164 — Vercel preview READY, edge functions redeploy on merge to main; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-social and meta-schedule-post redeploy via deploy-edge-functions.yml on merge to main); evidence=this record and src/__tests__/social-publish-containment.test.ts (13/13)
RELEASE_CHANNEL: development: draft PR #1164 on branch claude/blissful-einstein-pbnraa, shipping to production on merge to main under Gate A (§4)
RELEASE_CLASSIFICATION: internal-only: a server-side safeguard that DENIES an externally-consequential action, adding no customer-facing capability
CUSTOMER_RELEASE_IDENTITY: none: internal safeguard only, Social publishing stays UNAVAILABLE by design and no customer-visible capability is added
RELEASE_NOTE_REQUIRED: NO: internal-only denial of an unproven action, with nothing to announce to customers
RELEASE_TRUTH_BOUNDARY: LIVE: the containment (deny publication at both seams, honest UNAVAILABLE, no false receipt) is proven by unit and structural tests, and Social publishing itself stays UNAVAILABLE by design until the governed path ships
RELEASE_RECOVERY: position=forward-fix preferred — reverting the commit re-opens publication and is acceptable only once the governed path exists; reference=PR #1164 and supabase/functions/_shared/social-publish-containment.ts

## Scope and collisions

- Classification: backend authority/truth safeguard (an edge-function denial); no UI file, no migration.
- Affected flows: any Chat/service/cron path that asked Paige to publish socially now receives a truthful UNAVAILABLE refusal; safe reads (accounts, analytics, post_analytics, audience, comments, status, scheduled) and cancel_scheduled are preserved.
- Neighboring regressions: the two content-publication seams (paige-social post, meta-schedule-post) are the only publishers found by the broadened §37 inventory; other Meta functions are reads or ad-conversion measurement, not content publication, and are untouched.
- Active-owner/file collisions: this branch owns the containment module; #1158 (Capability Gateway) and #1159/#1160 are merged on main and are not modified here.
- Explicit exclusions: the governed Social capability is NOT built here; account connection is NOT wired here; the now-unreachable `content` reference in the post branch is left for the lift-path rebuild (documented, and unreachable while the denial stands).

## User job and state map

Before: a caller could ask Paige to publish a social post, and the request reached the Upload-Post or Meta Graph provider. After: every publish request is denied server-side at the seam with an honest UNAVAILABLE (reason plus setup path), before any provider call, success claim, or receipt/Rail; the response is a non-success so no false "succeeded" audit row is written. Reads and cancel_scheduled continue to work. Side effects: none created; a previously-possible external side effect (a published post) is now prevented. Scroll owner: not applicable (no surface).

## Evidence index

- `npx vitest run src/__tests__/social-publish-containment.test.ts` -> 13/13.
- `npm run lint:action-risk` (scripts/ci/action-risk-lint.mjs) -> pass.
- `npm run lint:governed-execution` (scripts/ci/governed-execution-lint.mjs) -> pass.
- `node scripts/ci/ui-delivery-evidence.mjs --base origin/main --head HEAD` -> PASS (this record routes via the Visible-Flow-Impact: yes trailer).
- chat-tool-registry: red on main and unchanged by this diff (the inline tool list is not touched); reported as inherited drift, not this PR's regression.

Timestamp: 2026-09-12. No secrets or customer data in this record.

## Review and limitations

Independent adversarial review (§39) on the pushed diff found two real BLOCKERs (a second uncontained Meta Graph publisher, and a false "succeeded" audit receipt) — both fixed on 70144b2. The Codex review then raised two more findings, both folded here: this record + the Visible-Flow-Impact declaration answer the visible-flow evidence gap, and the containment copy no longer advertises account connection (which is not wired). Remaining limitation: the authenticated, signed-in browser drive of the deployed refusal is owed to a browser-capable session or the owner (§32.c); the denial is a unit- and structure-proven backend fact.
