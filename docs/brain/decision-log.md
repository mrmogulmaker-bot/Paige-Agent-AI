# Decision Log — chronological one-liners

What was decided/shipped, newest first. Backfilled from what's discoverable (GitHub PRs, dated
CLAUDE.md rulings, doc dates). **No invented dates** — where a date isn't in the source it's omitted.

Sources this pass: GitHub MCP `list_pull_requests` (repo `mrmogulmaker-bot/paige-agent-ai`, PRs
#375–#409, 2026-08-09); `CLAUDE.md` dated ruling headers; `docs/` filenames with dates.

## Recent PRs (#375 → #409)

- **#122 getTierFeatureSet structural tier-lock (§60)** (2026-08-11, owner-MANDATORY) — the §60 ONE HOME for tier→feature mapping: `src/lib/tier/tierFeatures.ts` (`TIER_FEATURE_BASELINE` + `resolveTierKey`/`getTierFeatureSet`/`hasFeature`) + `useTierFeatures()` hook + `lint:tier-features` CI guard (sibling of lint:views/lint:definer-fns) + matrix unit test (16 assertions). Owner-locked cell: `customer_portal_invite` = Solo + Sub-account ONLY (Agency + Super Admin excluded). §1 review crew on the real diff: §39 caught a BLOCKER — a **5th ungated consumer minter** (`WorkspaceSettingsPanel` on the UNIVERSAL Setup surface) — now gated (all 5 honor the lock); §25/§5 fixed a blank-Select reset + a dead Resend button; §18 refactored 2 sites to shared `canOwnSubaccounts()`; resolveTierKey now applies the §51 parent-first invariant. §13 honest: lock is UI/build-time (helper+lint); server RPC `create_tenant_invite_token` does NOT yet tier-gate consumer invites (tracked follow-up, not a §9 IDOR). tsc 0 · lint clean · vitest 16/16. §60 → CLAUDE.md (PROPOSED). Deferral of the helper was REVERSED by explicit owner ruling (§13 correction #7). Owner §32.c owed (portal-invite hidden on Agency Set›Workspace + present on Solo/Sub).
- **#454 / #122 Systems Check load perf** (merged 2026-08-11) — new `systems_check_snapshot(p_scope)` SECURITY DEFINER RPC (migration 20260822000000) collapses the tile's 2-3 serial PostgREST round-trips into one; `useSystemsCheck.ts` + `staleTime:60_000`. §30: not a DB problem (0.24ms query); latency was serial RTTs re-paid on nav. §59-clean (tenant in-body, operator gated, authenticated-only). §32.a parse + §32.b row-match (MMA 10=10) + §39 SHIP. No index/semantics change. Owner §32.c owed.
- **#453 / #121 same-tier feature parity (§16 dept block)** (merged 2026-08-11) — hoisted `PaigeDepartmentStatus` above the `emptyBook` split in PracticeOverview so it renders on every same-tier tenant regardless of book state. §30 DISPROVED the stale-classification hypothesis (real cause = empty-state placement, all 4 PME tenants are `sub_account`); platform sweep found ZERO other feature-gate leaks. Owner then ruled `getTierFeatureSet()` structural helper MANDATORY (own PR). Owner §32.c owed.
- **#451 / D10 tier-taxonomy + "Portfolio" removal** (merged 2026-08-11) — `D10`: owner live-drive found `/agency` rendering a "Portfolio" section (reserved for Enterprise, §57) that duplicated "Your sub-accounts" (§18). Deleted the standalone Portfolio `SectionCard`, folded all 7 capabilities (health chips/meter/ranking/MRR/Health/Clients/Open) into the roster (§58 — nothing lost; metric overlay by `tenant_id`, absent→"—" not 0, §13). New `src/lib/agency/tierLabels.ts` `getTierBookNoun()` = §57 top-down source (People/Sub-accounts/Portfolio-RESERVED/Fleet). Codex caught 2 real fixes (book-noun from agency context when scoped into a child; `portfolioLoading` in table loading) — applied pre-merge. §30 scout + §39/§5 SHIP + §25 design SHIP. Owner §32.c owed. Fast-follow #119: uncapped metric overlay (agency_portfolio_metrics caps at 20) + Fleet/People helper adoption.
- **#450 / doctrine ratification** (merged 2026-08-11) — §57 (Super Admin = source of truth) · §58 (Anti-regression) · §59 (SECURITY DEFINER caller-scope-in-body) flipped PROPOSED → OWNER-LOCKED 2026-08-11. §58 §39-checklist item now binding every PR.
- **#448 / §9 P0 #117 (SECURITY DEFINER fn audit)** (merged 2026-08-11) — `fix(§9)`: audited authenticated `SECURITY DEFINER` functions and closed **20 confirmed cross-tenant leaks** (global-role-bypass + param-IDOR reader patterns + **1 HIGH auth bypass** in `delete_credit_report_upload`, which role-checked a caller-SUPPLIED `_calling_user_id` instead of `auth.uid()`). 2 migrations (`20260821000000` read-hardening + `20260821010000` writer-hardening) + `scripts/ci/definer-fn-lint.mjs` (`lint:definer-fns`) anti-recurrence guard, sibling of `lint:views`. **§32.a/b + §37 producer inventory + §39 peer-gate = SHIP.** Companion to #116 (the VIEW class — same owner-scoped-execution-bypasses-RLS mechanism, different object type). Honest severity: authenticated-only (lower blast radius than #116's anon-reachable PII/FICO), 1 HIGH. Owner §32.c owed. New PROPOSED CLAUDE.md doctrine (DEFINER-fn caller-scope-in-body, companion to #116's view rule).
- **#447 / §9 P0 #116** (merged 2026-08-11) — `fix(§9)`: closed **11 platform-wide `security_invoker=off` VIEW cross-tenant leaks** (anon/cross-tenant reachable — the higher-blast-radius PII/FICO class) + added the `lint:views` CI drift guard. Generalized #55. Companion to #117 (the FUNCTION class).
- **#446 / §9 P0 #55** (merged 2026-08-11) — `fix(§9)`: closed the Command Center cross-tenant approvals leak — `paige_approval_queue_v` had drifted to `security_invoker=off`, bypassing RLS. First case of the class; §10 correction reverses Cowork's "permissive-OR bypass" naming (real cause = view `security_invoker` drift).
- **#444 (hotfix §40/§41/§42)** (merged 2026-08-11, `7f2a9fa3`) — three §32.b runtime bugs from the owner's MMA live-drive; §30 corrected all three handoff premises (live-code/data). **D1 artifact "Preview unavailable"** — NOT the `meta`-vs-`body` field mismatch (`loadDocument` already reads `body`); real cause: the streamed `paige_artifact` frame omitted `tenant_id`, so the card hydrated under the VIEWER's active tenant while the doc is owned by the managed sub-account → `.eq(tenant_id)` miss → null. Fix stamps `personaCtx.tenant_id` on the frame + card reads `a.tenantId ?? activeTenantId`; RLS/loadDocument untouched (§9 — RLS backstops, a frame tenant can only NARROW). **D2 People KPI 2 / list 0** — NOT a SQL over-filter; the client-side "My Queue" view (`scopeMine`, ContactsAdmin.tsx:342) hid contacts assigned to another user while the KPI counted the full array. Fix sources the KPI tiles from `filtered` (auto-escape from an empty My-Queue = §36 fast-follow). **D3 fresh sub-account 0 systems-check runs** — NO creation path fired an onboarding scan on ANY tier (the `systems-check-run-onboarding` runner was orphaned; MMA's runs are all daily-cron). Fix (migration `20260818000000`): a `enqueue_onboarding_systems_check` helper (non-blocking `pg_net`, x-cron-token reused verbatim) wired into `create_subaccount` (sub-accounts) + an AFTER INSERT trigger for top-level tenants (skips operator/system workspace) + an internal-caller gate on the edge fn (`verify_jwt=false`, service/cron OR user-JWT) + a §36 pending state. **§32.a PERSISTED-APPLY PROVEN on prod (2026-08-11):** `schema_migrations` has `20260818000000`; helper + trigger live; `create_subaccount` def contains the enqueue (body verbatim from `20260803120000` + only the 8-line block). §39 peer-gate SHIP; edge-deploy GREEN. Owner §32.c owed (offer letter Opens; fresh sub-account → pending → run row). **D4/D5** (client detail reachability + Paige-send channel picker + comms threading) = separate slice, task #114.
- **#443 (docs §109 close-out)** (merged 2026-08-10) — `docs(brain,§0/§BRAIN.3)`: #442/#109 decision-log + master-doc §10 §30-premise correction (chat was already Anthropic-direct, not Lovable/Gemini) + config-registry `LOVABLE_API_KEY` re-scope (email-trinity only, task #112).
- **#442/#109** (merged 2026-08-10, `b3fb6e44`) — `fix(paige-chat,§34/§30/§37)`: reasoning-tier routing for the #34 approval loop + Lovable dead-code purge. **§30 premise correction (proven with live `paige_llm_trace`): the chat was ALREADY Lovable-free AND Gemini-free** — runs on `claude-haiku-4-5`(classification) + `claude-sonnet-5`(reasoning) + `featherless`; `gatewayCompat` is a direct-Anthropic shim and the `"google/gemini-2.5-*"` strings are legacy labels `tierForLegacyModel` maps to Claude tiers. So the handoff's "swap the chat off Lovable to Gemini" was obsolete — there was nothing to swap. **#34 fix:** a `substantiveTurn` heuristic (regex on the last user message for approval/creation intent — no extra LLM/DB call) upgrades the model label to the reasoning tier (⇒ Sonnet) at all 3 chat call sites, so "approved — run it" reliably emits `document_generate` instead of looping. Reuses the existing legacy-label→tier seam: no new provider, streaming wire-format unchanged (both tiers → `streamAnthropicAsOpenAI`), §17 preserved (trivial lookups stay Haiku). **Lovable purge (SAFE subset):** deleted `parse-business-credit-report` (the one live `api.lovable.app` AI call — orphan, undeployed, §2) + orphan `BuildProgramOutline.tsx`; purged vestigial `LOVABLE_API_KEY="unused"` dead code across 16 edge fns (gatewayCompat ignores it → zero behavior change). §39 peer-gate SHIP; edge-deploy GREEN. **NOT removed (sequenced task #112 — LAUNCH-CRITICAL):** the live email trinity (`auth-email-hook`+`process-email-queue`+`handle-email-suppression`) uses `@lovable.dev` SDKs for HMAC signing + email DELIVERY — ripping out blind silently 401s every signup; needs owner secrets + §32 live-email verify. Owner §32.c live-drive owed (MMA "approved — run it" fires without looping).
- **#441/#29 PaigeArtifactCard** (merged 2026-08-10, `6ca6831b`) — `feat(paige-chat)`: inline "Paige made you a deliverable" handoff card in regular (non-Studio) chat. Backend (`paige-ai-chat`): a `chatArtifacts` collector gated on `!studioSessionId` emits a `paige_artifact` SSE frame per document/image the agent persisted (copy excluded, §19/§21; honest — real `content_id` only, §13); the existing Studio path is byte-identical (§37 producer/consumer inventory — StudioChat only mounts when studioSessionId is set, so the new `artifactType`-bearing frame never reaches its cast). Frontend: new `src/components/paige/chat/PaigeArtifactCard.tsx` REUSES `loadDocument` + `DocumentPreview` (CSS-scaled real thumbnail, §22 — never a glyph-box; §18 no fork), gold ONLY on host-gated Send (§11), reduced-motion guarded, AA both themes. Wired into `PaigeAIChat.tsx` (flagship dashboard chat; `onSend` prefills the composer so Paige drives the send, §10/§16). FloatingChatbot/BrokerPaigeSession = §18 fast-follow (task #111, same card, ~15-line SSE wiring). §1 crew: build + §39 adversarial + §25/§5 design-critic/compliance. Edge-deploy GREEN. Owner §32.c live-drive owed.
- **#440** (merged 2026-08-10, `d77ac546`) — `fix(paige-chat)` #27/#28: tenant-scoped contact dedup guard + FK-audited Tashia cleanup. `crm_create_contact` fuzzy-matches this tenant before insert (pg_trgm `%`-index refined by `similarity()>0.6` OR exact-email; fail-OPEN §33/§5) → `needs_dedup_confirmation` instead of blind-creating (§15/§18 one seam, all tiers). Partial `UNIQUE(tenant_id, lower(email))` TOCTOU backstop. Destructive cleanup migration reparented across all 70 FK cols → 1 survivor, deleted 2 dupes (§9/§51 tenant-guarded, owner-merge-gated). **§32.a PERSISTED-APPLY FULLY PROVEN on prod (2026-08-10):** both migrations (`20260817010000`+`20260817120000`) in `schema_migrations`; `pg_trgm`+`idx_clients_fullname_trgm`+`uq_clients_tenant_email`+`find_duplicate_contacts` live (RPC EXECUTE = `{postgres,service_role}` only, §9/§39 IDOR guard held); exactly 1 Tashia on MMA at `hot_lead`, 2 dupes gone, approval `f279b9c3` linked to survivor; edge-deploy GREEN. Owner §32.c live-drive owed (re-run Tashia flow → no dupes). Follow-up #105 (other blind-insert producers).
- **#434 Codex P1 fast-follow** (2026-08-10) — Codex's independent review caught a §9 leak the crew's own §39/§5 passes rationalized away: the new `AgencyBoard` own-business Systems Check tile trusted `activeTenantId`, which on `/agency` can be a CHILD (Back after `agency_enter_subaccount`) → child's check surfaced/approvable from the agency dashboard. Fixed by gating on the §51 invariant (own top-level tenant). Lesson recorded in `lessons-learned.md #12` (never trust ambient `activeTenantId` on an operator surface). Third-reviewer (Codex/CI) value confirmed.
- **Systems Check tier-availability + §56** (task #99, branch `claude/systems-check-tier-availability`, 2026-08-10) — owner reported the tenant Systems Check missing on fresh sub-accounts. Root cause (§30): the `SystemsCheckTile scope='tenant'` was gated inside the non-empty branch of `PracticeOverview.tsx`'s `{emptyBook ? …}`, so any 0-client tenant (solo OR sub-account) never saw it. Fix hoists it above the empty/non-empty split AND adds it to `AgencyBoard` (`/agency`), matching the operator tile on `OperatorCommandCenter` → uniform across God · Agency · solo · sub-account. New doctrine **§56** (pre-build tier-matrix gate): before ANY build, name which account type(s) it's for + decide per-tier belonging. Crew: engineer + §39 (SHIP) + §5 (ITERATE→AgencyBoard gap closed). ESLint 0 / tsc 18-18. Owner §32.c live-drive owed.
- **#410** (open, DRAFT — owner review) — `docs(brain)`: the Second Brain (`docs/brain/`) + §BRAIN
  doctrine + completeness audit (this PR). Owner-review-gated, NOT auto-merge (doctrine + widespread
  reference impact). *(branch `claude/second-brain`.)*
- **#387** (open) — Harden edge function contracts + producer-inventory doctrine, audits, arch docs.

**Merged (newest first):**
- **#438** (merged 2026-08-10) — `fix(model-router)`: Featherless §34 cheap-tier close-loop. Owner subscribed "Feather Per-Request" DEVELOPER plan ($50/mo, no size cap); open-flexible default 8B→`meta-llama/Llama-3.3-70B-Instruct` + primary env `FEATHERLESS_DEFAULT_MODEL` (§10; alias `FEATHERLESS_CHEAP_MODEL`). §30: the trace `model=null` was a fidelity artifact, not a null-slug bug; root cause was pre-plan reachability. §1/§34 crew SHIP; edge-deploy GREEN on prod. **Owner §32.c owed** (operator Systems Check scan → `operator_llm_failover=pass`, closes #438+#436).
- **#437** (merged 2026-08-10) — `fix(rls)`: RESTRICTIVE service-role-only deny-all on `booking_notifications_sent` + `user_presence` (no-policy tables flagged by operator RLS-coverage check). §9/§51-safe (can only further-restrict); §37 byte-unaffected. **§32.a PERSISTED-APPLY PROVEN** (schema_migrations `20260817000000` + both policies live on prod). Regression-lint gotcha: a multi-line `AS RESTRICTIVE … USING(false)` trips the line-oriented lint — keep `AS RESTRICTIVE` on the deny-clause line (lesson #11).
- **#436** (merged 2026-08-10) — `fix(model-router)` HOTFIX A: `callModel` open-tier cells degrade to the Claude frontier on a genuine provider error (assign-not-throw → flows through §3 voice + §2 finance gates), closing the "88% open-tier error" P0. Edge-deploy GREEN. Complementary to #438.
- **#435** (merged 2026-08-10) — `feat(paige-chat)` #10 Slice A: `offer_letter` + `sales_offer` doc types extend the existing `document_generate` chat tool (NO new Documents tab, §18/§21) + widened `PLACEHOLDER_RE`. §2-clean. Edge-deploy GREEN. D3–D6 = sliced follow-ups; owner §32.c owed (draft an offer letter in chat).
- **#424** (merged 2026-08-10) — `feat(§52/§53)`: Paige operator runtime-context substrate (Phase 1) + operator role tiers. §52 = Super-Admin Paige opens every session already briefed (fix for the 2026-08-09 §36 miss where she asked the founder who he was); `paige_owner_memory` tenant_id→nullable + owner RLS branches + 7 seed rows + `_shared/owner-context.ts` composer + `paige-ai-chat` injection. §53 = `is_platform_operator()` helper + `user_roles` grant-lockdown trigger (super_admin/platform_admin grantable only by an existing super_admin/service; closed a real §9 escalation via `grant_tenant_member_role`). `is_platform_owner()` frozen super_admin-only. **§32.a GREEN on prod.** CLAUDE.md §52+§53. Owner §32.c live-drive owed. Fast-follows: #89 /admin/team tier-leak, #90 taxonomy doc.
- **#423** (merged 2026-08-10) — `feat(#80)`: Systems Check MVP Layer 1 — 4 tables + 10-check registry seed (Owner Trilogy Pillar 1). §32.b + §51 proven; **§32.a GREEN on prod**. Runner/orchestrator/surface = later layers.
- **#415/#421** (merged 2026-08-09/10) — `feat(#31)`: Revenue Integrity Chain (fail-closed trigger + operator audit RPC + always-export CSV). §32.a + live-prod block-test GREEN. Wave 8 launch-gate cleared; prod paid=0 ($0 ARR honest).
- **#411** (merged 2026-08-09, `c40f76d3`) — `feat(wave4-4a.4)`: Interactive Analytics UI primitive
  (`Sparkline`/`DrillContainer`/`MetricEntityCard`/`ExploreChart` in `@/components/ui/page`). **Closes
  Wave 4a.** §32.c live-drive owed (FLIP + recharts geometry + AA both themes).
- **#408** (merged 2026-08-09, `2ee92903`) — `fix(§9,wave-s3)`: operator-scope Super Admin
  Communications + operator Twilio A2P SMS; REUSES master Twilio creds (not new `TWILIO_OPERATOR_*`).
  **§32.a confirmed** — migration `20260812000000` persisted, `operator_conversations`/`operator_messages`
  live on prod. OWED: A2P Messaging Service SID + inbound signing token secrets; operator SMS live-drive.
- **#409** (merged 2026-08-09, `1e726426`) — `fix(voice,§13/§46)`: close ElevenLabs voice leak +
  persist Voice Configuration to CLAUDE.md. **Owner ruled `DEFAULT_TTS_VOICE = 0S5oIfi8zOZixuSj8K6n
  (Ivanna)`** — settled, on record, do not re-ask (§BRAIN.2).
- **#407** (2026-08-09) — Wave4-4a.3: Paige chat compaction + persistence + durable tasking.
- **#406** (2026-08-09) — Wave4-4a.2: L8 Memory Fabric substrate (`paige_owner_memory`).
- **#405** (2026-08-09) — Wave4-4a.1: Agent UI Placement right-rail + ⌘K launcher.
- **#404** (2026-08-09) — signup: reorder to onboarding-before-checkout + compliance staging (#66).
- **#403** (2026-08-09) — signup Slice 1 fast-follows (§37/§39): concurrency-safe entitlements +
  `user_subscriptions` unique (repairs latent stripe-webhook bug).
- **#402** (2026-08-09) — signup Slice 1 (§9/§13/§32/§37/§39): deferred provisioning + restore wiped
  signup trigger + backfill 7 orphan profiles.
- **#401** (2026-08-09) — docs: Multi-Channel Comms spec + Wave 3/4 reorder.
- **#400** (2026-08-08) — #277 Slice 3: per-sub-account Marketplace curation override grain.
- **#399** (2026-08-08) — docs: Cowork doctrine-sync — 4 locked specs + BRD/Architecture/build-order.
- **#398** (2026-08-08) — tooling (§32/§24/§18): Playwright devDep + reusable live-drive helper.
- **#397** (2026-08-08) — brand (§6/§7/§9): resolve tenant brand in 3 client-facing surfaces
  (logo-leak cluster).
- **#396** (2026-08-08) — storage (§9/§32/§37): create `btf-onboarding` bucket for signed-agreement
  PDFs + tenant-isolated read RLS.
- **#395** (2026-08-08) — tier: reverse PLAN tier academy→agency + BRD v2 delta.
- **#394** (2026-08-08) — docs (wave-4 prereq): BRD-MVP + Canonical System Architecture.
- **#393** (2026-08-07) — §51/§9: Antonio Daniel LLC P0s — chat "Invalid input format" +
  **sub-account-never-agency invariant** (DB migration `20260807230000`; see §51 absolute invariant).
- **#392** (2026-08-07) — #277 Slice 2: tenant-side agency-curation visibility branch.
- **#391** (2026-08-07) — #277 Slice 1: agency curation allowlist — table + RLS + trigger + RPC +
  `/agency/marketplace`.
- **#390** (2026-08-06) — Preserve native Clients taxonomy for Fleet Communications.
- **#389** (2026-08-06) — Expose Fleet Contacts and Pipelines entry points.
- **#388** (2026-08-06) — Add Fleet Communications launcher for Paige Operations.
- **#386** (2026-08-07) — paige-tts (§51/§9): operator/Super-Admin TTS playback — resolve platform
  context when no tenant.
- **#385** (2026-08-05) — #272-C: Agency preset visible to Academy+Enterprise only — drop Solo.
- **#384** (2026-08-05) — persona L1 (§3/§7/§18): voice-first default prompt + shared
  `PAIGE_VOICE_BLOCK`.
- **#383** (2026-08-05) — migrations (§13/§24/§32): record applied `202912` test-seed — unblock
  deploy-migrations + Slice 0 persist.
- **#382** (2026-08-05) — #277 Slice 0: `marketplace_items` tier/role/publish substrate —
  Solo/Academy/Enterprise cascade.
- **#381** (2026-08-05) — #277 Slice 4: reconcile middle tier agency→academy (canonical
  Solo/Academy/Enterprise) + kill Practice/Studio tier nouns (§3.b).
- **#380** (2026-08-05) — #277 Slice 3: fix paid-install redirect + confirm-gate destructive uninstall.
- **#379** (2026-08-05) — #271 P0 (§213/§51): restore missing table GRANTs on `marketplace_*`.
- **#378** (2026-08-05) — #269 P0: fix platform-wide marketplace install (null `installed_by_agent`)
  + surface real edge error (§210).
- **#377** (2026-08-05) — #263 (§45): guard n8n Instance-URL against owner-PII autofill.
- **#376** (2026-08-05) — Wave 3 Crew 0 (#164/#184): Blueprints substrate proof + data-drive persona
  scope (kill the funding hardcode).
- **#375** (2026-08-05) — #257/#256 (§18/§43/§213): kill the Setup sub-tab dead-end-redirect pattern.

*Tier-noun history worth noting:* #381 reconciled the middle tier to **academy** (canonical
Solo/Academy/Enterprise, killing "Practice"/"Studio" nouns per §3.b); #395 then **reversed** the PLAN
tier academy→agency. The live Stripe catalog today is **Solo + Agency** (see `config-registry.md`),
and DB plans are solo/agency/enterprise — the public "academy" noun and internal tier labels have
churned; treat the live Stripe + DB state as source of truth over any older doc.

## Dated doctrine rulings (from CLAUDE.md headers)

Each is an owner ruling now living in `CLAUDE.md` (see `glossary.md` for the section map):
- **2026-08-07** — §51 absolute invariant: a sub-account is NEVER an agency, enforced structurally
  (DB CHECK + trigger + `agency_current_id` guards, migration `20260807230000`). Forced by the
  Antonio Daniel LLC mis-route (#393).
- **2026-08-01** — §51 authored + hardened (per-tier availability + gating railing) after the fourth
  sub-account-seam bug (#86→#130→#172→#588).
- **2026-08-08** — §2 "Practice"-ban clarification (recommend *business*/*company* until certs land).
- **2026-07-28** — §32 capability-conditional post-deploy scan for auth-gated surfaces.
- **2026-07-26** — §37 response-consumer inventory addendum; §38 money-boundary authored.
- **2026-07-25** — §37 producer inventory authored (Hotfix-1 readiness-scan case).
- **2026-07-22** — §32 migration "proven-persisted-on-prod" addendum (1c-vi / 1c-viii-a collision).
- **2026-07-19** — §27 facelift, §28 approved-is-frozen, §29 bold-swing, §30 strip-then-rebuild,
  §31 real-assets, §32 green-build-≠-render, §33 design-agent-has-eyes, §34 own-your-intelligence
  all dated this day (a heavy doctrine day).
- **2026-07-18** — §1 hard-gate, §24 operational efficiency, §25 design taste, §26 compound-AI.
- **2026-07-17** — §4 merge-on-verified / ship-live, §5 post-deploy scan, §11 studio "video-game"
  bar, §19/§21/§22 studio unification, RED-LINE index.
- **2026-07-16** — §11 banner rule, §18 redundancy gate (mandatory four questions), §19/§20 studio.
- **2026-08-04** — §39 peer-gate authored (#214).

## Known-unbuilt / spec-only status (§13 honesty — "not built" is a valuable brain answer)

A recorded "not built" prevents the exact false-confidence the brain exists to kill. Verified 2026-08-09:

- **SMS/phone verification in SIGNUP — NOT built** (scoped claim). Signup uses **email verification
  only** (`PublicSignup.tsx`, `showSms={false}`); `input-otp` primitive exists but is unwired for
  signup. **BUT SMS phone-verify DOES exist elsewhere** — `send-sms-verification` + `verify-sms-code`
  edge fns + `sms_verifications` table, wired into `NotificationsSettings.tsx` for notification opt-in.
  So "do we have SMS verify?" = yes for notifications, no for signup. (config-registry → "Signup".)
- **Promo account type — spec LOCKED, NOT implemented.** `docs/product/promo-account-type-spec.md`
  exists; there is **no** `account_type='promo'` value or migration in the schema. Do not read the
  LOCKED spec as "built."
- **Twilio A2P carrier submit — NOT wired.** `createBrand()`/`createCampaign()` are honest
  `needs_config` stubs; the A2P **UI + draft + persistence ARE built** (`A2PTab.tsx`, `comms-a2p-*`).
  The gap is the live TrustHub/carrier submit (Wave 4c.2 prereq). (config-registry → Twilio ISV.)
- **Twilio number-purchase charge leg — NOT wired.** `comms-purchase-number` returns
  `charge_wired:false`; search/buy-into-subaccount works, the billing leg does not yet.
- **Client portal — PARTIALLY built.** Beyond the specs (Owner-Trilogy + Customer-Portal taxonomy),
  real surfaces exist: `PortalGateway.tsx`, `PortalStudio.tsx`, `PortalSection.tsx`, portal-config hooks
  (`useClientPortalConfig`/`useClientPortalBrand`/`usePortalConfig`), `ContactPortalPanel.tsx`. Not
  spec-only.
- **Enterprise Stripe plan — no active price** (see config-registry → Stripe): DB plan `enterprise`
  is `is_active` but has no live Stripe price (sales-led/manual invoicing until wired).

## Wave / build-order notes

- Canonical build order lives in `docs/doctrine/canonical-build-order.md`; Wave 5 sequencing in
  `docs/doctrine/wave5-phase1-phase2-sequencing.md`. Current active work (2026-08-09) is **Wave 4-4a**
  (Agent UI Placement → L8 Memory Fabric → chat compaction/durable tasking, PRs #405–#407).
- Money Spine (Lane B, §38): B-i discovery ✅ → B-iv storefront webhook ✅ (posture verify pending) →
  B-ii marketplace paid install (in flight) → B-Platform → B-Meter → … → B-Connect (deferred). See
  `docs/doctrine/money-spine-architecture.md`.

---

*Append newest at the top of the PR section when a PR merges; add a dated ruling row when CLAUDE.md
gains a dated section (§BRAIN.3).*
