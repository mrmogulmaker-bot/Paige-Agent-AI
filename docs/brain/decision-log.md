# Decision Log — chronological one-liners

What was decided/shipped, newest first. Backfilled from what's discoverable (GitHub PRs, dated
CLAUDE.md rulings, doc dates). **No invented dates** — where a date isn't in the source it's omitted.

Sources this pass: GitHub MCP `list_pull_requests` (repo `mrmogulmaker-bot/paige-agent-ai`, PRs
#375–#409, 2026-08-09); `CLAUDE.md` dated ruling headers; `docs/` filenames with dates.

## Recent PRs (#375 → #409)

**Open / in-flight (as of 2026-08-09):**
- **#410** (open, DRAFT — owner review) — `docs(brain)`: the Second Brain (`docs/brain/`) + §BRAIN
  doctrine + completeness audit (this PR). Owner-review-gated, NOT auto-merge (doctrine + widespread
  reference impact). *(branch `claude/second-brain`.)*
- **#387** (open) — Harden edge function contracts + producer-inventory doctrine, audits, arch docs.

**Merged (newest first):**
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
