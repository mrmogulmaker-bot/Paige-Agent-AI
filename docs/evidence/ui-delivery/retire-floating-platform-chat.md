# UI delivery evidence: retire the floating Paige chat from the platform

Owner architecture decision 2026-09-06: there must be NO floating Paige chat anywhere — not on any
authenticated surface (Solo, Command Center, Clients, Campaigns, Settings, Marketplace, Analytics, tenant
portal, mobile shell, embedded tenant surface) and not on the public marketing site (where a signed-in
visitor's session would carry tenant/consumer context into it). This change REMOVES the one floating
widget (`FloatingChatbot`) and its global mount, deletes it and its route gate, updates stale comments
that named it, adds a regression guard, and records the public Product Guide as a separate UNAVAILABLE
product. The dedicated authenticated Paige chat/workspace is untouched.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: ran audit-first (Flow-by-Flow security mode) — footprint scout mapped every floating-chat mount, gate, and public/authenticated route before any removal (decision-log 2026-09-06; task #14).
PAIGE_UI_DESIGN: PASS: read .agents/skills/paige-ui-design/SKILL.md this session; §00 respected — this is a removal executed to the owner's architecture decision, no visual direction invented.
MATERIAL_FLOW_CHANGE: YES: a surface users could open (the floating Paige chat FAB / pop-out) is removed from every route; the only remaining Paige is the dedicated authenticated experience.
FLOW_PROTOTYPE: PASS: the owner's architecture decision 2026-09-06 authorizes the retirement (a removal has no prototype; the owner ruling is the approval reference); pre-launch §4 also lifts the prototype gate.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: purpose — retire the floating chat so the only tenant-aware Paige is the dedicated experience; audience — all platform + public visitors; primary action — the removal plus a regression guard that blocks re-introduction.
VISUAL_DIRECTION: NOT_APPLICABLE: nothing is designed or added; a widget is removed and three stale comments corrected.
AUTOMATED_EVIDENCE: PASS: regression guard src/__tests__/no-floating-platform-chat.test.ts (6 tests) green, including a predicate self-test that proves the guard BITES on the hook-indirected and z-[9999] evasion shapes while clearing the legitimate dedicated shell (independent-review MAJOR finding folded 2026-09-06); no test imported the deleted modules; the source-asserting chat suites stay green.
STATIC_EVIDENCE: PASS: App.tsx transpiles clean after removal; grep confirms zero orphan code references to FloatingChatbot/shouldRenderFloatingChatbot/GatedChatbot (only prose comments remain); useLocation still used; the dead `paige-open-chat` opener has no dispatcher.
RENDERED_EVIDENCE: NOT_APPLICABLE: the change REMOVES a rendered element; there is no new render to capture, and the absence of the mount is a structural/compile-time fact (no source mounts the widget).
BEHAVIORAL_EVIDENCE: UNVERIFIED: the per-persona browser confirmation that no floating chat renders and the dedicated Paige still renders is owed to a browser-capable session (this session is headless); the removal is proven structurally by the guard + the absence of any mount.
AUTHENTICATED_RUNTIME: UNVERIFIED: no signed-in drive from this headless session; the mount removal is a compile-time fact, not a runtime behavior that changed conditionally.
KEYBOARD_FOCUS: NOT_APPLICABLE: an interactive element is removed; none is added.
ZOOM_REFLOW: NOT_APPLICABLE: no new layout is introduced.
REDUCED_MOTION: NOT_APPLICABLE: a widget carrying motion is removed; no new motion is added.
STATE_COVERAGE: PASS: the removal is unconditional — the FAB renders on no route or persona; the guard asserts no mount and no floating overlay posting to a Paige chat backend exists.
TRUTHFUL_STATE_LABELS: PASS: the public Product Guide is honestly labeled UNAVAILABLE (docs/product/public-product-guide-contract.md); no capability is claimed that does not exist, and the old FAB is explicitly NOT repurposed as the guide.
SOLO_UI: NO: the changed files (App.tsx, PaigeArtifactCard.tsx, PaigeAIChat.tsx) are not canonical Solo surfaces (the classifier's isSoloUi is false), and the FAB was already suppressed on /solo before this change.
UNVERIFIED: the browser-driven per-persona confirmation — unauthenticated, authenticated Solo owner, ordinary member, workspace switch, stale session, and spoofed tenant-context all show NO floating chat, and the dedicated Paige chat still renders and is tenant-safe — is owed to a browser-capable session (§32.c). The removal itself is a compile-time fact (nothing mounts the widget) proven by the regression guard; the browser drive re-confirms what the source guarantees.

## Scope and collisions

- Classification: removal of a UI surface (a floating overlay) + a regression guard + a records/contract doc.
- Affected flows: the floating Paige chat (retired). No dedicated Paige surface is touched.
- Neighboring regressions: none — nothing imports the deleted files except the removed App.tsx mount; shared hooks/backend used by dedicated surfaces are untouched.
- Active-owner/file collisions: none known on these files.
- Explicit exclusions: the public Product Guide is NOT built here (UNAVAILABLE); the dedicated Paige chat/workspace is NOT changed; the `paige-ai-chat` / `broker-paige-chat` backends are NOT changed.

## User job and state map

Before: a floating FAB opened a pop-out Paige chat on public and non-deny-listed authenticated routes.
After: no floating Paige chat anywhere; users reach Paige only through the dedicated authenticated chat/
workspace. Known consequence (§58, named, not silent): the client portal and onboarding surfaces lose
their floating Paige entry, and the public marketing pages lose the FAB — both are the intended effect of
the owner's rule; whether the client portal warrants a DEDICATED (non-floating) Paige surface is a
separate owner decision, not built here.

## Evidence index

- Removal diff: src/App.tsx (imports + GatedChatbot wrapper + mount removed); deleted src/components/FloatingChatbot.tsx + src/lib/routing/floatingChatVisibility.ts + its test; stale-comment fixes in PaigeArtifactCard.tsx, PaigeAIChat.tsx, paigeChatError.ts.
- Regression guard: src/__tests__/no-floating-platform-chat.test.ts → 5/5 PASS locally 2026-09-06.
- Static: App.tsx transpile clean; orphan-reference grep clean (code); §50 grep clean.
- Public Product Guide contract: docs/product/public-product-guide-contract.md (status UNAVAILABLE).

## Review and limitations

Independent security review (the owner's required context-isolation review) ran on the pushed diff (383de0fa)
and returned **VERDICT: SHIP — no blockers**: the removal is complete and correct; the dedicated Paige
experience is intact and compiles; the retired FAB genuinely carried own-row consumer PII (name, email,
phone, monthly_revenue, FICO scores — RLS-gated, so a context-boundary leak, NOT a cross-tenant IDOR) into
the tenant `paige-ai-chat` backend while rendering allow-by-default on public + non-shell authenticated
routes, so its deletion is a real, sound isolation improvement; the public Product Guide contract correctly
mandates a separate non-Paige backend, zero tenant reach, operator-only config + audit/rollback/fail-closed,
and explicitly covers the shared-browser case; and the §58 capability loss (client portal / onboarding /
public pages lose the FAB) is named, not silent.

Findings folded before merge (all non-blocking per the SHIP verdict; verified vs source first):
- MAJOR (guard completeness / §13 overclaim): the guard's stated claim overreached — it caught only the
  exact inline-fetch + body-portal shape. Hardened to flag any GLOBAL OVERLAY (a `document.body` portal OR a
  `z-[99xx]` fixed FAB) that REACHES a Paige chat backend (inline paige-ai-chat/broker-paige-chat literal OR
  an imported Paige-chat driver hook — catching the hook-indirected evasion), scanning all non-test source
  (not just App.tsx). Verified false-positive-free on the clean tree (the dedicated shell portals to a host
  ref, `paigePortalHost`, never `document.body`) and demonstrably non-vacuous via an in-file predicate
  self-test. The header comment now states honestly that the guard is a structural BACKSTOP, not a proof, and
  names the residual gap it cannot cover.

Deferred as a tracked doc-reconciliation follow-up (recorded in decision-log; §66's own anchoring case warns
against authoring doc updates under time pressure or by inference, and these require a deliberate grounded
pass rather than a pressured find-replace):
- `docs/doctrine/tier-matrix.md` L1295 (present-tense sync_status rationale) + L1629 ("five of six callers"
  echo arithmetic) — historical doctrine reasoning that names `FloatingChatbot` as one of several callers;
  rewriting the count/rationale correctly needs grounding on whether the portal still parses sync_status
  independently, not a guess.
- `docs/product/agent-ui-placement-spec.md` L14/L140/L161 — a spec partially SUPERSEDED by the 2026-09-06
  decision (it reserved a "single floating widget" for the Customer Portal and referenced the now-deleted
  `FloatingChatbot.tsx` as a pattern source); reconciling it is tied to the still-open owner decision on
  whether the client portal warrants a DEDICATED (non-floating) Paige surface.
- Two stale edge-function comments naming `FloatingChatbot` as a live surface (`paige-ai-chat/index.ts`,
  `_shared/client-context.ts`) — comment-only §13 drift; deliberately kept out of this frontend+docs PR
  because touching `supabase/functions/**` (esp. `_shared/`) triggers broad no-op edge redeploys, so it
  belongs in an isolated backend commit, not mixed into a deploy-free UI retirement.

Clean current-truth map corrections folded here (§66/§BRAIN.3): `docs/brain/codebase-map.md` (dropped
`FloatingChatbot` from the loose-top-level list; retitled the `chat/` dir row) and
`docs/delivery/PAIGE-CHAT-DELIVERY-MAP.md` (dropped "floating widget" from the backend-consumer list; kept
the live `PaigeChat.tsx:376` DOCX bug while noting the retired file shared it).

Limitation (unchanged): the authenticated per-persona browser confirmation is owed to a browser-capable
session (headless); the structural guard + compile-time absence of any mount is the primary, sufficient
proof that no floating chat renders anywhere.
