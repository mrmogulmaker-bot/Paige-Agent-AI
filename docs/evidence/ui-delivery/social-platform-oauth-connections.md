# UI delivery evidence: Social platform OAuth connections

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: affected-flow packet is recorded in docs/evidence/ui-delivery/social-tenant-connections.md and exercised by the focused Social suite
PAIGE_UI_DESIGN: PASS: project paige-ui-design instructions, accessibility reference, and no-ai-design-slop audit were read before the shared Integrations catalogue change
MATERIAL_FLOW_CHANGE: YES: Social changes from one generic setup card to platform-specific tenant OAuth entry, readback, reconnect, disconnect, and repeated-account states
FLOW_PROTOTYPE: PASS: owner-approved social-operations-upload-post-flow.html established the platform-card direction and the customer-facing Social naming
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Solo owner opens Social in Integrations and securely connects one exact platform identity owned by the active workspace
VISUAL_DIRECTION: PASS: approved Solo Integrations card grammar, typography, tokens, drawer pattern, and restrained platform marks are preserved
AUTOMATED_EVIDENCE: PASS: focused Vitest suite passed 77 of 77 assertions for catalogue, repeated accounts, OAuth request, callback binding, and containment
STATIC_EVIDENCE: PASS: production build plus migration-version, definer-function, action-risk, governed-execution, registry, ledger, ESLint, JSON, and diff checks passed
RENDERED_EVIDENCE: UNVERIFIED: the local unauthenticated route correctly redirected to auth, so signed-in implementation geometry requires the deployed preview
BEHAVIORAL_EVIDENCE: PASS: component tests cover category filtering, platform drawers, multiple same-platform identities, approval initiation, reconnect, disconnect, and unavailable Reddit
AUTHENTICATED_RUNTIME: UNVERIFIED: deployment and interactive owner consent are required before tenant account discovery and provider readback can be observed
KEYBOARD_FOCUS: PASS: drawer test coverage and retained shared dialog trap prove opener focus, tab containment, Escape handling, and close behavior
ZOOM_REFLOW: UNVERIFIED: authenticated deployed rendering is required to observe browser zoom and actual application scroll ownership
REDUCED_MOTION: PASS: no state motion was added and the shared reduced-motion rule remains active
STATE_COVERAGE: PASS: loading, read failure, empty, authorization required, verified, reauthorization, disconnected, provider limit, callback mismatch, and provider unavailable states are represented
TRUTHFUL_STATE_LABELS: PASS: only provider-read accounts are verified; OAuth-unavailable and unproven actions remain unavailable or proof owed
SOLO_UI: YES: canonical Solo Settings Integrations catalogue and platform-specific Social drawer
UNVERIFIED: authenticated provider consent, account readback, repeated-platform identities, reconnect, disconnect, receipt visibility, and responsive production geometry require deployment and owner interaction
OWNER_INTENT: Social is a reusable tenant-owned multi-account integration with individual platform OAuth choices and no customer-facing internal provider identity
MUST_NOT_HAPPEN: no shared credential publishing, implicit account selection, brand-specific identity, fake platform support, credential paste, or public posting
MUST_PRESERVE: common Integrations information architecture, server-resolved tenant authority, one-time approval gate, provider readback, receipts, and Social containment
ACCEPTANCE_CRITERIA: an authorized owner can connect distinct accounts on the same supported platform and Paige shows only exact tenant-scoped provider readback
MOTION_PURPOSE: NONE: no motion change; status changes are communicated through text, tone, and semantic live regions
PROTECTED_SEAMS: tenant context, confirmation approval, provider adapter, callback claim, account readback, selection, disconnect, capability receipt, Integration Registry, and Binding Ledger are covered
INTERNAL_BUILD_IDENTITY: d95e225676fa700796573a47eab7fe76aa7ec1b4; deployment=local-build; environment=local; migrations=PROOF_OWED(database-contract-ci); edge=PROOF_OWED(pr-deployment); evidence=focused-Social-suite-77-of-77
RELEASE_CHANNEL: development: PR 1199 awaits required CI and preview evidence before any production merge
RELEASE_CLASSIFICATION: minor-candidate: this adds a customer-facing tenant OAuth connection capability
CUSTOMER_RELEASE_IDENTITY: 0.1.0 — Social platform connections; owner-decision=approved-2026-09-12
RELEASE_NOTE_REQUIRED: YES: customers need the supported OAuth catalogue and connection-only boundary
RELEASE_TRUTH_BOUNDARY: PROOF OWED: platform initiation is implemented but no tenant account is LIVE until authenticated provider readback and receipt evidence exist
RELEASE_RECOVERY: position=forward-fix or revert PR 1199 before any provider consent if validation fails; reference=docs/evidence/ui-delivery/social-tenant-connections.md
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: signed-in deployed preview is required for exact geometry
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: signed-in deployed preview is required for exact geometry
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: signed-in deployed preview is required for exact geometry
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: signed-in deployed preview is required for exact geometry
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: signed-in deployed preview is required for exact geometry
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: signed-in deployed preview is required for exact geometry
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: signed-in deployed preview is required for exact geometry
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: signed-in deployed preview is required for exact geometry

## Scope and collisions

- Classification: Material Solo UI plus tenant-safe connection-contract extension.
- Affected flows: Integrations catalogue, OAuth start, callback readback, account selection, reconnect, and disconnect.
- Neighboring regressions: Existing integrations retain the shared catalogue layout and behavior.
- Active-owner/file collisions: Rebased onto current main; the Integration Registry conflict preserved main's code anchors and updated only the Social entry.
- Explicit exclusions: Publishing, scheduling, analytics, comments, messaging, ads, manual-credential custody, and public content.

## Evidence index

- PR: https://github.com/mrmogulmaker-bot/Paige-Agent-AI/pull/1199
- Provider grounding: https://docs.upload-post.com/api/connect-api/ and https://docs.upload-post.com/api/user-profiles/
- Automated commands and limitations are recorded in docs/evidence/ui-delivery/social-tenant-connections.md.

## Review and limitations

Social remains PROOF OWED until database replay, edge deployment, authenticated OAuth consent, exact account readback, receipt evidence, and signed-in responsive verification succeed. Connecting an account does not authorize a public post.
