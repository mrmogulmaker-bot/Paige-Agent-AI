# UI delivery evidence: G1b Connections — registry-native connections (MCP gateway)

This record covers the G1b Connections build (issue #1334 / PR #1338). This commit lands the
**data layer only** (`src/solo/data/useMcpGateway.ts` + its unit test); the rendered
Connections/Catalogue surface follows on the same branch and this record is updated then.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow v2.0.1 read in full; mode Existing Project / New Feature, risk R2; affected flow = a Solo tenant connects and governs an MCP tool; frame stated in PR #1338.
PAIGE_UI_DESIGN: PASS: the paige-ui-design router plus all five delivery modules, paige-quality-gates, and review-and-testing read before implementation; Impeccable pinned pbakaus/impeccable@83c2c735777c68e30ea536ab9cc97f7843456945 read and applied as craft-floor, audit, harden, and finish-review only (no visual authority, per CLAUDE.md section 00).
MATERIAL_FLOW_CHANGE: YES: it introduces a new connect-and-govern flow for MCP-gateway connections (list, add, re-key, disconnect); this commit lands its data layer.
FLOW_PROTOTYPE: PASS: owner-approved Connections Studio prototype, Artifact Lw43kPk6PqUduNxNdbCkmD Version 5, approved 2026-09-22; ported verbatim per CLAUDE.md section 00.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: purpose is to let a Solo tenant connect an MCP tool to Paige and govern it; audience is the Solo business owner or tenant admin; primary action is add a connection and manage its lifecycle from Settings then Integrations.
VISUAL_DIRECTION: PASS: the approved pack v5 design tokens and layout; this data-layer commit reuses the established Paige design system and adds no visual surface of its own.
AUTOMATED_EVIDENCE: PASS: src/solo/data/useMcpGateway.tenant.test.tsx runs 7 of 7 green — no-tenant-argument read, host-and-aggregates-only parse with no secret shape, workspace-switch masking, a failed read kept distinct from an empty account, a non-admin write refused with MCP_FORBIDDEN, a named-parameter REST create carrying the expected-tenant guard, and a duplicate-label refusal mapped to owner-facing copy.
STATIC_EVIDENCE: PASS: tsc --noEmit -p tsconfig.app.json reports zero errors in the new files, and eslint is clean on src/solo/data/useMcpGateway.ts and its test.
RENDERED_EVIDENCE: UNVERIFIED: this commit adds only the data-layer hook, so no Solo surface renders from it and there is no frame to capture at any geometry until the Connections and Catalogue surface lands on this branch.
BEHAVIORAL_EVIDENCE: UNVERIFIED: the interactive add, re-key, and disconnect surface is not part of this commit; the hook's behavior is exercised by the automated unit test above rather than by a driven browser flow.
AUTHENTICATED_RUNTIME: UNVERIFIED: the authenticated Solo route cannot be driven headless from this session, and the write RPCs require the #1322 migration applied to the target database, so the authenticated drive is owed to a browser-capable session or an owner live look once the surface ships.
KEYBOARD_FOCUS: UNVERIFIED: no interactive control ships in this data-layer commit, so there is no keyboard route to exercise yet.
ZOOM_REFLOW: UNVERIFIED: no rendered surface ships in this commit, so there is no layout to reflow at 200 percent yet.
REDUCED_MOTION: UNVERIFIED: the hook contains no motion, and motion behavior belongs to the surface commit, so it is not exercised here.
STATE_COVERAGE: PASS: the data layer models every connection state honestly — loading, empty, populated, a failed read kept distinct from an empty account, and a write refusal via MCP_FORBIDDEN — each asserted by the unit test; a newly created connection is never surfaced as connected before the G2 verify probe promotes it.
TRUTHFUL_STATE_LABELS: PASS: the current truth label is PARTIAL — the hook binds the shipped G1a-1 contract, proven by static and automated evidence, while the authenticated runtime stays UNVERIFIED and the rendered surface UNAVAILABLE until it ships.
SOLO_UI: YES: src/solo/data/useMcpGateway.ts is the data layer for the Solo Settings then Integrations Connections surface.
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: no Solo surface renders from this data-layer commit, so there is no frame to capture at 1536x770 with PAIGE closed until the Connections surface lands.
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: no Solo surface renders from this data-layer commit, so there is no frame to capture at 1536x770 with PAIGE open until the Connections surface lands.
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: no Solo surface renders from this data-layer commit, so there is no frame to capture at 1366x768 with PAIGE closed until the Connections surface lands.
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: no Solo surface renders from this data-layer commit, so there is no frame to capture at 1366x768 with PAIGE open until the Connections surface lands.
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: no Solo surface renders from this data-layer commit, so there is no frame to capture at 1024x768 with PAIGE closed until the Connections surface lands.
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: no Solo surface renders from this data-layer commit, so there is no frame to capture at 1024x768 with PAIGE open until the Connections surface lands.
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: no Solo surface renders from this data-layer commit, so there is no frame to capture at 900x1000 with PAIGE closed until the Connections surface lands.
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: no Solo surface renders from this data-layer commit, so there is no frame to capture at 900x1000 with PAIGE open until the Connections surface lands.
UNVERIFIED: the rendered Connections and Catalogue surface, its interactive flows, the four Solo viewports, and the authenticated-runtime drive are not part of this data-layer commit; each lands with the surface commit on this branch and is recorded then.
OWNER_INTENT: a Solo tenant connects an MCP tool to Paige, approves what she may use, and manages it from Settings then Integrations, ported from approved pack v5 and wired to the shipped G1a-1 registry.
MUST_NOT_HAPPEN: never call a legacy writer or the tenant-mcp-connect edge function; never render a Connect that cannot connect; never surface a connected or usable state a new row has not earned; never leak a secret, since the read returns host and last-4 only and the list read returns no last-4; never fork the Solo shell by tenant.
MUST_PRESERVE: the legacy n8n and Zapier drawers stay live and untouched; the shipped Social connections surface; the workspace-switch drawer-drop and scope-masking behavior; the connections truth-boundary tests. This commit touches none of them — it adds new files only.
ACCEPTANCE_CRITERIA: on the real platform a tenant can list, add a bearer, header, url, none, or api-key connection, re-key it, and soft-disconnect or hard-delete it, with OAuth tiles showing an honest sign-in-coming-soon stop, all validated against the shipped RPCs.
MOTION_PURPOSE: NONE: no motion in this data-layer commit; the surface commit records its motion and reduced-motion behavior.
PROTECTED_SEAMS: tenant and workspace isolation is AFFECTED and tested — server-derived tenant, no client id, scope masking, with the unit test asserting the masking and the MCP_FORBIDDEN refusal; integration and provider status is AFFECTED, this being the connections seam, and covered by the unit test's state assertions; approval and autonomy, Spine execution, canonical writes, Rail and receipts, chat scroll, Live Conversation, Secure Browser and Vault, durable jobs, responsive shell geometry, and accessibility are NOT AFFECTED by this data-layer hook, which adds new files and touches no shell or shared contract.

INTERNAL_BUILD_IDENTITY: ddf15a2da4b4783de166ced0a74ad4af6ecf2a52; deployment=7QLWG36pyt8af9bXbxPnTaw37uAY; environment=preview; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=https://github.com/mrmogulmaker-bot/Paige-Agent-AI/pull/1338
RELEASE_CHANNEL: preview: Vercel preview build on the branch; data-layer only, not a customer release.
RELEASE_CLASSIFICATION: internal-only: a data-layer hook with no customer-visible change in this commit.
CUSTOMER_RELEASE_IDENTITY: none: internal data-layer slice; the customer-visible Connections surface is a later commit and an owner decision.
RELEASE_NOTE_REQUIRED: NO: internal-only data-layer change with no customer-visible surface.
RELEASE_TRUTH_BOUNDARY: PARTIAL: the useMcpGateway data layer binds the shipped G1a-1 contract with static and automated proof; the rendered surface is UNAVAILABLE until it ships and the authenticated runtime stays UNVERIFIED.
RELEASE_RECOVERY: position=forward-fix; reference=reverting commit ddf15a2 on branch claude/loving-gates-d0mi47 removes the two new files, which have no dependents.

## Scope and collisions

- Classification: data layer for a Solo UI surface (recognized `.ts` path under `src/solo/`).
- Affected flows: connect / list / re-key / disconnect an MCP-gateway connection (data layer this commit; UI to follow).
- Neighboring regressions: none — new files only; the legacy n8n/Zapier drawers, Social surface, and existing tests are untouched.
- Active-owner/file collisions: none.
- Explicit exclusions: OAuth start/callback (G1a-3); per-connection tool-list read and single-tool revoke (G1a-4); the verify probe that promotes a new row to connected (G2).

## User job and state map

Purpose, audience, and primary action are recorded in the fields above. The data layer covers loading,
empty, populated, failed-read-distinct-from-empty, write-refusal, and the honest not-yet-connected state;
the full first-use, validation, success, retry, cancellation, close/Back, permission, destructive, and
workspace-switch states are the surface commit's, driven and recorded there.

## Evidence index

- `src/solo/data/useMcpGateway.tenant.test.tsx` — 7/7 (vitest run), commit ddf15a2.
- `tsc --noEmit -p tsconfig.app.json` — zero errors in the new files.
- `eslint src/solo/data/useMcpGateway.ts …` — clean.

## Review and limitations

Independent review is the exact-head Codex pass plus the Impeccable finish-review on the surface commit.
Limitations: everything requiring the rendered or authenticated surface is `UNVERIFIED` here and owed to
the surface commit; the write path additionally depends on the #1322 migration being applied to the
target database.
