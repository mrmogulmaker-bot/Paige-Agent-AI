# UI delivery evidence: Social live connection repair

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: bug-repair flow traced from the signed-in Integrations card through status RPCs, approval storage, Edge Function configuration, provider initiation, and truthful failure recovery
PAIGE_UI_DESIGN: PASS: the owner explicitly approved the existing Social platform-card and drawer design; this repair preserves that design and changes only behavior and truthful state derivation
MATERIAL_FLOW_CHANGE: YES: a supported Social card can proceed to governed approval instead of being refused by an unnecessary server-secret prerequisite
FLOW_PROTOTYPE: PASS: the approved social-operations-upload-post-flow.html and PR 1199 implementation remain the interaction authority; no new visual pattern is introduced
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a Solo workspace owner selects one platform, confirms the connection action, and enters that platform's provider-hosted consent flow
VISUAL_DIRECTION: PASS: the approved Integrations grid, Social category, platform cards, and drawer remain unchanged
AUTOMATED_EVIDENCE: PASS: focused Social/provider/Integrations Vitest suite passed 72 assertions; the full focused Integrations pair passed 62 assertions
STATIC_EVIDENCE: PASS: TypeScript typecheck, production build, changed-source ESLint with zero errors, Integration Registry lint, and git diff checks passed
RENDERED_EVIDENCE: UNVERIFIED: owner-supplied production screenshot proves the pre-fix failure state; post-fix production rendering awaits deployment
BEHAVIORAL_EVIDENCE: PASS: regression coverage proves structured non-2xx Social errors are shown truthfully and do not poison loaded status on every platform card
AUTHENTICATED_RUNTIME: UNVERIFIED: provider initiation and exact account readback require merged deployment plus the owner's interactive platform consent
KEYBOARD_FOCUS: PASS: no dialog, focus, keyboard, or navigation implementation changed; existing approved drawer behavior and tests remain
ZOOM_REFLOW: PASS: no geometry, layout, sizing, or scroll-owner code changed
REDUCED_MOTION: PASS: no motion code changed
STATE_COVERAGE: PASS: loaded-empty status, action configuration failure, provider unavailable, provider capacity, provider rate limit, retry, and approval remain explicit
TRUTHFUL_STATE_LABELS: PASS: an action failure no longer changes unrelated cards from Setup required to Status unavailable
SOLO_UI: YES: canonical Solo Settings Integrations Social platform grid and drawer
UNVERIFIED: each real platform remains PROOF OWED until its OAuth consent, provider readback, tenant-scoped account record, and receipt are observed
OWNER_INTENT: preserve the approved Social design and make tenant-owned platform connections actually start for Instagram, Facebook, X, TikTok, YouTube, Threads, Snapchat, Reddit, Google Business Profile, LinkedIn, and Pinterest where the provider supports OAuth
MUST_NOT_HAPPEN: no public post, shared provider identity, customer credential form, implicit account selection, fabricated connection, or customer-facing internal provider name
MUST_PRESERVE: server-resolved tenant authority, exact one-time approval, opaque provider profile identity, callback claim, provider readback, and per-platform truth
ACCEPTANCE_CRITERIA: supported platform start reaches exact approval and secure consent; cancellation changes nothing; successful return creates only provider-read tenant accounts; unsupported provider states remain unavailable
MOTION_PURPOSE: NONE: no motion change
PROTECTED_SEAMS: active tenant resolution, owner/admin access, approval CAS, profile identity, OAuth callback token, provider URL allowlist, account readback, receipt, and card truth derivation
INTERNAL_BUILD_IDENTITY: f3164c15ba7ad7664c7842dddc912e5b78118db5; deployment=PR-preview; environment=preview; migrations=NOT_APPLICABLE; edge=PROOF_OWED(paige-social production deployment); evidence=focused-Social-suite-72-passed
RELEASE_CHANNEL: preview: PR 1215; production follows green CI and merge under existing Gate A authority
RELEASE_CLASSIFICATION: patch: repairs a blocked approved connection flow without changing design or widening external effects
CUSTOMER_RELEASE_IDENTITY: none: this repairs the approved Social connection flow without creating a separate named customer release
RELEASE_NOTE_REQUIRED: YES: Social connection initiation changes from unavailable to operable where provider configuration is valid
RELEASE_TRUTH_BOUNDARY: PROOF OWED: implementation and automated behavior are verified; no platform is LIVE until authenticated consent and provider readback succeed
RELEASE_RECOVERY: position=revert PR 1215 and redeploy prior paige-social version; reference=PR 1215
SOLO_1536X770_PAIGE_CLOSED: PASS: no geometry change; owner-supplied production screenshot shows the preserved closed-Paige Integrations layout at desktop width
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: Paige-open post-fix production geometry not exercised
SOLO_1366X768_PAIGE_CLOSED: PASS: no geometry or layout code changed from the approved PR 1199 evidence
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: Paige-open post-fix production geometry not exercised
SOLO_1024X768_PAIGE_CLOSED: PASS: no geometry or layout code changed from the approved PR 1199 evidence
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: Paige-open post-fix production geometry not exercised
SOLO_900X1000_PAIGE_CLOSED: PASS: no geometry or layout code changed from the approved PR 1199 evidence
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: Paige-open post-fix production geometry not exercised

## Scope and collisions

- Classification: approved Solo Social behavior repair.
- Affected flows: status load, OAuth start, failure rendering, approval handoff, provider initiation.
- Neighboring regressions: all non-Social Integrations and existing Social layout/focus behavior.
- Active-owner/file collisions: branch created from current merged main at eb51ca4e04da886a59206a9f2fe68b0ee410d5c0.
- Explicit exclusions: public posting, scheduling, analytics activation, comments, messaging, ads, and manual credentials.

## User job and state map

The active tenant owner opens one platform card, confirms the named connection-only action, consents on the platform-hosted page, returns through the single-use callback, and sees provider-read accounts. Failures preserve the empty connection state and keep unrelated cards truthful.

## Evidence index

- PR: https://github.com/mrmogulmaker-bot/Paige-Agent-AI/pull/1215
- Baseline production evidence: owner-supplied signed-in screenshot on 2026-09-13; no connection, attempt, or approval rows existed after the failed click.
- Database role proof: the three Social status/access RPCs executed successfully as the active authenticated owner and returned can_manage=true with zero rows.
- Provider grounding: https://docs.upload-post.com/api/reference/ and https://docs.upload-post.com/api/user-profiles/
- Automated proof: 72 focused assertions passed; typecheck, build, registry lint, and security audit passed.

## Review and limitations

Self-reviewed, lower assurance because external agents are explicitly prohibited. Provider API-key presence cannot be inspected by the current deployment identity. CI supplies the Deno Edge Function check. Real connection and account readback remain PROOF OWED and require the owner's interactive consent; no public content action is authorized.

