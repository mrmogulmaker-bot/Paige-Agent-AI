# UI delivery evidence: G1b Connections — registry-native connections (MCP gateway)

This record covers the G1b build (issue #1334 / PR #1338). The first commit landed the data layer
(`src/solo/data/useMcpGateway.ts`); **this commit lands the rendered surface** — the MCP gateway
section mounted inside the existing Solo Settings → Integrations leaf, per the owner's 2026-09-22
Option C ruling (Integrations is the only home; the Communications word is not used for this
surface's copy or identifiers, INT-147; one catalogue, folded into the add path, §18).

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow v2.0.1 read in full; mode Existing Project / New Feature, risk R2; affected flow = a Solo tenant connects and governs an MCP tool; frame stated in PR #1338.
PAIGE_UI_DESIGN: PASS: the paige-ui-design router plus all five delivery modules, paige-quality-gates, and review-and-testing read before implementation; Impeccable pinned pbakaus/impeccable@83c2c735777c68e30ea536ab9cc97f7843456945 read and applied as craft-floor, audit, harden, and finish-review only (no visual authority, per CLAUDE.md section 00).
MATERIAL_FLOW_CHANGE: YES: it introduces a new connect-and-govern flow for MCP-gateway connections (list, add, re-key, disconnect); this commit lands its data layer.
FLOW_PROTOTYPE: PASS: owner-approved Connections Studio prototype, Artifact Lw43kPk6PqUduNxNdbCkmD Version 5, approved 2026-09-22; ported verbatim per CLAUDE.md section 00.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: purpose is to let a Solo tenant connect an MCP tool to Paige and govern it; audience is the Solo business owner or tenant admin; primary action is add a connection and manage its lifecycle from Settings then Integrations.
VISUAL_DIRECTION: PASS: the approved pack v5 design tokens and layout; this data-layer commit reuses the established Paige design system and adds no visual surface of its own.
AUTOMATED_EVIDENCE: PASS: 123 of 123 green across four suites, EXIT CODE 0 — a pass count is not a result, and an earlier revision of this record reported a green count over a process that was exiting 1 — src/solo/settings-integrations-gateway.test.tsx 42 of 42 (the new surface, driven through the rendered DOM), including guards for each Codex finding — an unregistered provider stopping honestly instead of opening a prefilled form, an unparseable payload reading as a failed read rather than an empty account, one tool's refusal not following the owner to the next tool, a row whose identity the server did not state never rendering as an invented "Tool", ANY unreadable row failing the whole read rather than a quietly short list, and a write never reported as done on an answer carrying no acknowledgement, src/solo/data/useMcpGateway.tenant.test.tsx 7 of 7, src/solo/settings-integrations.test.tsx 50 of 50 and src/solo/settings-integrations.n8n-tabs.test.tsx 24 of 24, both unchanged in behaviour apart from one completed fixture named under MUST_PRESERVE. Every rpc double returns the real PostgrestFilterBuilder shape — a thenable with then and no catch — rather than a plain Promise, so the suite now guards the crash class described under Review and limitations.
STATIC_EVIDENCE: PASS: tsc --noEmit -p tsconfig.app.json reports 12 errors, byte-identical to the count on a clean origin/main worktree, and zero in any file this branch touches. eslint reports zero errors on all six touched files; the one remaining warning on settings-integrations.tsx is the pre-existing react-refresh/only-export-components warning, present on origin/main at the same declaration. lint:pg-tokens, lint:definer-fns and lint:tier-features pass. lint:gold and lint:views fail identically on a clean origin/main worktree and are the inherited baseline, not this diff.
RENDERED_EVIDENCE: PASS: this session DOES hold Playwright plus the sandbox Chromium, so the surface was rendered in a real browser through the repo's own integrations harness mount (scripts/live-drive/harness/integrations-mount), which mounts the shipped SoloIntegrationsView inside the real shell scroll chain with only the Supabase transport and tenant context stubbed. Sixteen frames captured — four Solo viewports x light and dark x PAIGE closed and open — in scripts/live-drive/artifacts/ (gitignored). Measured identically in all sixteen: no horizontal overflow on the document, exactly ONE vertical scroll owner (the shell main.tcs-main, never a nested scroller inside the page), zero clipped elements inside the section, and a stable 262px section height. This is a LOCAL render, not a deployed one (§13/§32.c).
BEHAVIORAL_EVIDENCE: PASS: every supported flow is driven end to end through the rendered component against test doubles — first use from an empty account, browse the one catalogue, add a listed pasted-key tool, add an unlisted tool by address with nothing prefilled, refuse a private or non-HTTPS address, block submission on a missing detail, route the n8n, Zapier and Social tiles into the shipped drawers, open a tool, re-key it to a confirmed full address, carry a custom header name, withhold re-key where the credential is provider-issued, disconnect reversibly and permanently as two deliberate choices, refuse both to a caller who cannot write, warn before discarding a half-typed key, close on Escape, and drop an open tool when the workspace changes. This is harness evidence against doubles, NOT authenticated runtime; the two are not interchangeable.
AUTHENTICATED_RUNTIME: UNVERIFIED: this session has a browser but NOT credentials — LIVE_DRIVE_EMAIL and LIVE_DRIVE_PASSWORD are unset — so the authenticated Solo route could not be signed into. The blocker is credentials, not capability; naming it precisely matters because the two have different remedies. Per the coordinator's 2026-09-22 direction the authenticated drive of add, re-key and disconnect is POST-DEPLOY OWNER VERIFICATION on the live screen, not a pre-merge gate. No claim of a working production write is made here (§70.1: the gate is a person finishing the job, and that has not been observed).
KEYBOARD_FOCUS: PASS: the drawer reuses the incumbent panel idiom — focus moves to the close control on open, Tab is trapped within the panel, Escape closes when nothing is typed and prompts when something is, and focus returns to the opener on close; the disconnect choice group meets radio semantics with a roving tabindex and arrow-key selection. Escape-closes and the discard prompt are asserted by the automated suite; the remaining keyboard route is structural and is re-checked with the owed browser drive.
ZOOM_REFLOW: UNVERIFIED: not exercised in this pass. The sixteen captures cover viewport geometry rather than page zoom, and the layout introduces no fixed-width container, using the incumbent surface's own auto-fill grid and wrapping rows. Stated as not-measured rather than inferred from the layout.
REDUCED_MOTION: PASS: the block now contains NO keyframe animation at all and its only motion is transitions plus a one-pixel hover translate, both removed under a prefers-reduced-motion reduce guard. The status-dot pulse that previously lived here was REMOVED outright rather than merely guarded: its row reads "Not checked yet", a settled fact, so a pulse implied activity that is not happening, and because the animation was `infinite` its `finished` promise never resolved, which hung every harness settle() that awaits document.getAnimations(). That was found by running the real browser drive, not by reading the file.
STATE_COVERAGE: PASS: first use, loading, empty, populated, a failed read kept distinct from an empty account, validation refusal, write refusal, a dropped concurrent write reported as nothing rather than as a failure, cancellation, the discard prompt, close and Escape, permission refusal, both destructive shapes, and the workspace switch — each asserted by the automated suite. A newly created or re-keyed row reads Not checked yet and is never surfaced as ready before the later verify probe promotes it.
TRUTHFUL_STATE_LABELS: PASS: the current truth label is PARTIAL. List, add, re-key and disconnect are wired to the shipped G1a-1 contract and proven by static and automated evidence; OAuth sign-in, per-tool discovery and single-tool revoke are UNAVAILABLE and say so on the surface as honest stops; the authenticated runtime is UNVERIFIED and owed. A vendor appearing in the catalogue is never a claim that it is connected.
SOLO_UI: YES: src/solo/settings-integrations-gateway.tsx renders inside the Solo Settings then Integrations leaf, with src/solo/data/useMcpGateway.ts as its data layer.
SOLO_1536X770_PAIGE_CLOSED: PASS: rendered in real Chromium through the integrations harness mount at 1536x770 with PAIGE closed, light and dark, frames in scripts/live-drive/artifacts/. Measured: no horizontal overflow, exactly one vertical scroll owner (the shell), zero clipped elements in the section. Harness render of the shipped component, NOT a deployed or authenticated capture.
SOLO_1536X770_PAIGE_OPEN: PASS: rendered in real Chromium through the integrations harness mount at 1536x770 with PAIGE open, light and dark, frames in scripts/live-drive/artifacts/. Measured: no horizontal overflow, exactly one vertical scroll owner (the shell), zero clipped elements in the section. Harness render of the shipped component, NOT a deployed or authenticated capture.
SOLO_1366X768_PAIGE_CLOSED: PASS: rendered in real Chromium through the integrations harness mount at 1366x768 with PAIGE closed, light and dark, frames in scripts/live-drive/artifacts/. Measured: no horizontal overflow, exactly one vertical scroll owner (the shell), zero clipped elements in the section. Harness render of the shipped component, NOT a deployed or authenticated capture.
SOLO_1366X768_PAIGE_OPEN: PASS: rendered in real Chromium through the integrations harness mount at 1366x768 with PAIGE open, light and dark, frames in scripts/live-drive/artifacts/. Measured: no horizontal overflow, exactly one vertical scroll owner (the shell), zero clipped elements in the section. Harness render of the shipped component, NOT a deployed or authenticated capture.
SOLO_1024X768_PAIGE_CLOSED: PASS: rendered in real Chromium through the integrations harness mount at 1024x768 with PAIGE closed, light and dark, frames in scripts/live-drive/artifacts/. Measured: no horizontal overflow, exactly one vertical scroll owner (the shell), zero clipped elements in the section. Harness render of the shipped component, NOT a deployed or authenticated capture.
SOLO_1024X768_PAIGE_OPEN: PASS: rendered in real Chromium through the integrations harness mount at 1024x768 with PAIGE open, light and dark, frames in scripts/live-drive/artifacts/. Measured: no horizontal overflow, exactly one vertical scroll owner (the shell), zero clipped elements in the section. Harness render of the shipped component, NOT a deployed or authenticated capture.
SOLO_900X1000_PAIGE_CLOSED: PASS: rendered in real Chromium through the integrations harness mount at 900x1000 with PAIGE closed, light and dark, frames in scripts/live-drive/artifacts/. Measured: no horizontal overflow, exactly one vertical scroll owner (the shell), zero clipped elements in the section. Harness render of the shipped component, NOT a deployed or authenticated capture.
SOLO_900X1000_PAIGE_OPEN: PASS: rendered in real Chromium through the integrations harness mount at 900x1000 with PAIGE open, light and dark, frames in scripts/live-drive/artifacts/. Measured: no horizontal overflow, exactly one vertical scroll owner (the shell), zero clipped elements in the section. Harness render of the shipped component, NOT a deployed or authenticated capture.
UNVERIFIED: the rendered capture at all four Solo viewports, zoom reflow, and the authenticated-runtime drive against a real tenant. All three need a browser this session does not have, and all three are owed to a browser-capable session or an owner live look. Also owed and named rather than claimed: Integration Capability Registry entries for the providers this catalogue lists, which the registry's delivery rule requires and which cannot be authored honestly here because each needs a dated pricing source (§13 — a fabricated source would be worse than the gap).
OWNER_INTENT: a Solo tenant connects an MCP tool to Paige, approves what she may use, and manages it from Settings then Integrations, ported from approved pack v5 and wired to the shipped G1a-1 registry.
MUST_NOT_HAPPEN: never call a legacy writer or the tenant-mcp-connect edge function; never render a Connect that cannot connect; never surface a connected or usable state a new row has not earned; never render an unreadable account as an empty one; never open a provider-prefilled connection form for a provider with no Integration Capability Registry entry; never leak a secret, since the read returns host and last-4 only and the list read returns no last-4; never fork the Solo shell by tenant.
MUST_PRESERVE: the legacy n8n and Zapier drawers stay live and untouched; the shipped Social surface; the provider card grid and its category filter; the Automations leaf; the n8n OAuth-return effect; the workspace-switch drawer-drop and scope-masking behaviour; the truth-boundary tests. The mount is a pure insertion above the filter bar and removes nothing. TWO changes to tested files are called out rather than left silent (§58). First, settings-integrations.test.tsx gains an explicit get_mcp_connections_v2 fixture returning an empty array: the gateway read was previously falling through the mock's catch-all to a null payload, which this reader now correctly treats as a failed read rather than an empty account, so the fixture completes the world rather than weakening it. Second: settings-integrations.test.tsx previously asserted that is_current_user_tenant_admin was called ZERO times on this surface, as a proxy for the stripe card mounting no n8n seam. The gateway section legitimately reads the caller write permission once on mount, so the assertion now snapshots the count before opening the stripe card and requires it not to increase — the same before-and-after idiom this file already uses twice. The property it proves is unchanged and it still fails if the stripe card mounts that seam; what is genuinely lost is the incidental surface-wide property that nothing on Integrations reads tenant-admin unconditionally.
ACCEPTANCE_CRITERIA: on the real platform a tenant can list, add a bearer, header, url, none, or api-key connection, re-key it, and soft-disconnect or hard-delete it, with OAuth tiles showing an honest sign-in-coming-soon stop, all validated against the shipped RPCs.
MOTION_PURPOSE: the only motion is a one-pixel hover lift on the tool rows and catalogue tiles, signalling that a row is operable. Transform and opacity only, removed under prefers-reduced-motion. No keyframe animation ships on this surface.
PROTECTED_SEAMS: tenant and workspace isolation is AFFECTED and tested — server-derived tenant, no client id, scope masking, with the unit test asserting the masking and the MCP_FORBIDDEN refusal; integration and provider status is AFFECTED, this being the connections seam, and covered by the unit test's state assertions; approval and autonomy, Spine execution, canonical writes, Rail and receipts, chat scroll, Live Conversation, Secure Browser and Vault, durable jobs, responsive shell geometry, and accessibility are NOT AFFECTED by this data-layer hook, which adds new files and touches no shell or shared contract.

INTERNAL_BUILD_IDENTITY: 262579f71a548f41f55caf5c6976d4dd81f6293c; deployment=UNKNOWN; environment=preview; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=https://github.com/mrmogulmaker-bot/Paige-Agent-AI/pull/1338
RELEASE_CHANNEL: production on merge, per the pre-launch stance and the owner's direct instruction to ship. The identity above names the code-bearing head this evidence was measured against; only this doc-only commit follows it, and it changes no shipped code. The previous identity (797ea51) was left standing while four later commits DID change shipped code — the read parser and the write acknowledgement among them — so this record briefly claimed to cover a build it did not. Corrected rather than quietly repointed, because a provenance line that names the wrong build is worse than none.
RELEASE_CLASSIFICATION: internal-only: a new tenant-visible section on an existing settings leaf, on a pre-launch platform with no live customers; no customer release identity is earned or claimed.
CUSTOMER_RELEASE_IDENTITY: none: an owner decision, and not earned while the authenticated runtime proof is still owed.
RELEASE_NOTE_REQUIRED: NO: pre-launch internal build; no customer audience exists to notify.
RELEASE_TRUTH_BOUNDARY: PARTIAL: list, add, re-key and disconnect are bound to the shipped G1a-1 contract with static and automated proof; OAuth sign-in, per-tool discovery and single-tool revoke are UNAVAILABLE and say so on the surface; the authenticated runtime is UNVERIFIED and owed to a browser-capable session.
RELEASE_RECOVERY: position=forward-fix; reference=the section is a single additive mount in src/solo/settings-integrations.tsx; removing that one line restores the previous Integrations surface exactly, and the gateway files have no other dependents.

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

A §39 peer-gate read the real diff adversarially and returned BLOCK on four P1s, all of which were
fixed in this commit and are recorded here because a green suite is exactly what hid them:

1. **Every write crashed before reaching the server.** `supabase.rpc()` returns a
   `PostgrestFilterBuilder` — a thenable with `then` and **no `.catch`** — and the write path called
   `.catch` on it directly. An `as Promise<…>` assertion hid that from `tsc`, and test doubles
   returning real Promises hid it from the suite, so `tsc` was clean and 81 tests were green while
   every add, re-key and disconnect would have thrown a `TypeError` in production, left the button
   stuck on "Adding…" with no error shown, and silently dropped every later write for the life of
   the page. Confirmed by probing the installed `@supabase/postgrest-js` in node (`typeof catch:
   undefined`). Fixed by adopting the builder with `Promise.resolve` first, the idiom the sibling
   `useN8nConnection` already uses. **Proven, not assumed:** restoring the defect turns four of the
   new tests red with `TypeError: supabase.rpc(...).catch is not a function`, and the fix turns them
   green again. Every double in both new test files now returns the real builder shape.
2. **Re-key silently truncated a working endpoint.** The list read returns the endpoint HOST only by
   design, and the form rebuilt the address from it, so re-keying a tool added at a path would have
   re-pointed it at the bare host and cleared its approvals with no way back. The address is now an
   editable field the owner confirms.
3. **Re-key was impossible for four auth kinds.** The writer dropped the header name and forced the
   token to null for everything but bearer, so `header`, `url` and `none` rows were refused by the
   server every time and `oauth` rows could never succeed at all. The form now collects exactly what
   each kind requires, and re-key is withheld where the credential is provider-issued.
4. **Rows owned by the shipped n8n/Zapier path rendered dead controls.** Those writers refuse a
   projected legacy row, and the refusal copy told the owner to "disconnect it and add it again" —
   an instruction that path cannot carry out. The message now names the card that can.

Also fixed from the same pass: an open detail drawer kept painting one workspace's facts after a
switch; the private-address check matched `10.` and `127.` anywhere in the string and refused
legitimate public addresses like `https://api.example.com/v1.10.2/mcp`; a dropped concurrent write
was reported as a definite failure; a refused disconnect produced no visible effect at all; the
discard prompt fired on an untouched form while Cancel bypassed it.

A §5 compliance pass ran alongside it. Fixed from it: INT-147 owner-facing copy in the hook's error
map and the row-label fallback, and the abbreviated form in this surface's own class names and
props — the RPC names, `_connection_id`, the `GatewayConnection` row type and the closed-set
`MCP_*_CONNECTION_*` codes are DB contracts and are unchanged; a §50 trademark hit in tenant-visible
tile copy; and two tiles that claimed more than the God-level Integration Capability Registry allows
(HubSpot `UNAVAILABLE`/`prohibited` and Microsoft 365 `DEFERRED`/`prohibited`, both now stated as
having no direct path yet).

Limitations, stated rather than worked around: the rendered capture at the four Solo viewports, zoom
reflow, and the authenticated runtime drive all need a browser this session does not have and are
owed. The write path additionally depends on the #1322 migration being applied to the target
database. Integration Capability Registry entries for the providers this catalogue lists are owed
and are named above rather than invented, because each requires a dated pricing source.
