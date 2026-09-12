# Vibe Studio Media-Provider Due Diligence

**Date:** 2026-09-12 · **Status:** Read-only evaluation, no accounts opened, no credentials connected, no paid calls, no production changes, no product code.
**Assignment:** Owner directive — evaluate KIE AI, Higgsfield, and materially stronger alternatives for the future Vibe Studio media-generation layer, then map collisions against current main.
**Ordering context (owner-ruled):** Vibe Studio publish integration is priority #6 (AFTER Social operations proven). AI media-provider implementation is priority #7 (ONLY after provider decision). This document IS that provider decision input — it starts nothing.

---

## 1. Verdict up front

**Connect, don't build. Defer implementation until Social operations are proven. Decide the contract now.**

| Role | Provider | Why |
|---|---|---|
| **Primary media engine (image + video + image-editing)** | **fal.ai** | Only candidate with a real B2B legal posture (inputs/outputs terms, DPA, SOC 2, uptime SLA, enterprise private endpoints), queue+webhook architecture that matches our Durable Jobs seam, configurable retention with a deletion API, and the broadest API-first model catalog. |
| **Music specialist (Suno suite) — optional secondary** | **KIE AI** | Suno has **no official API**; KIE is the most credible Suno route (generation, lyrics, covers, extension, stems, MIDI, voice). KIE's terms are too thin to be our primary, but acceptable for one isolated capability behind a swappable adapter. |
| **Existing image providers — keep** | Gemini / GPT-Image / Replicate / Ideogram | `generate-image` already runs four providers. The new layer extends this pattern; it does not replace it. |
| **Design reference only — never wire it** | **Higgsfield** | A prosumer creator *product*, not an infrastructure API. Subscription-credit model doesn't meter per-customer, terms carry a broad license-to-use/train grant, API is secondary to the studio. It already served its purpose: Social Studio's design language. |
| **Not recommended as primary** | **Replicate** | Strongest output-ownership clause in the industry, but 1-hour output retention is operationally harsh, frontier video/music catalog lags fal/KIE, and it is already our Flux image provider — no need to expand its role. |

**Build natively (direct model APIs)?** No. Multi-vendor churn is precisely what aggregators absorb; our differentiation is governance (jobs, receipts, metering, approvals), not GPU operations.

---

## 2. Comparison matrix (14 criteria)

| Criterion | KIE AI | Higgsfield | fal.ai | Replicate |
|---|---|---|---|---|
| **Image** | Nano Banana, GPT-Image (aggregated) | Strong (studio) | Excellent (FLUX family + others, 600+ models) | Good (Flux + community) — **already wired** |
| **Video** | Excellent breadth: Veo 3.1, Seedance, Kling | Excellent cinematic (their core product) | Excellent: frontier + open video models | Lags on frontier video |
| **Music** | **Best: full Suno suite** (gen, lyrics, covers, extend, stems, MIDI, music video) + voice | Weak/absent | Weak (no Suno) | Weak |
| **Editing** | Music-editing only; video/image editing thin | **Best editing UX** — but studio-product, not API | Image-editing models ( Kontext-class, inpaint, upscale); video thin | Many community edit models |
| **API + MCP** | REST task API; webhooks via `callBackUrl`; unified polling endpoint | Cloud API portal + official Python SDK + MCP; secondary to studio | **Best API design**: sync, queue, SSE streaming, WebSocket; HMAC webhooks | Clean REST + webhooks; MCP available |
| **Reliability/quality** | Aggregator 24/7 monitoring claim; no SLA | Studio-grade output; API maturity unproven | **SOC 2, 99.99% uptime claim, GCP Marketplace, private endpoints** | Mature, stable; no SLA on standard tier |
| **Pricing / predictability** | Cheapest (claims 30–84% below official); prepaid credits; prices can shift | Subscription credits ($9–$129/mo consumer-shaped) — poor fit for metering | Per-model, prepaid, predictable; ~30–50% below Replicate historically | Per-second GPU ($0.000225/s–$0.001525/s H100) + per-model |
| **Customer metering feasibility** | Per-task credit logs (kie.ai/logs) — workable | **Poor** — plans are per-seat/subscription | **Good** — per-request pricing, enterprise analytics | Good — per-prediction billing |
| **Commercial rights / output ownership** | ⚠️ **No output-ownership clause at all**; no API-specific terms | Users own outputs + commercial use OK (post-backlash), BUT broad license to use/sublicense/train | ✅ ToS distinguishes Inputs vs Output Content; customer owns inputs; outputs usable per AUP; DPA available | ✅ **Strongest**: "Customer owns and will continue to own all rights, title, and interest in Outputs" |
| **Data retention / privacy / training** | Media auto-deleted after **14 days** (documented); logs kept longer; deletion on request | No published retention/deletion specifics; training license concern | ✅ Configurable CDN lifecycle (≥7-day guarantee), per-request lifecycle headers, **deletion API** | ✅ **1-hour auto-delete** of prediction files (privacy-max, ops-heavy); manual delete |
| **Tenant isolation** | None at provider — single platform key; isolation is ours | None (consumer accounts) | **Private endpoints (enterprise)** — the only provider-level option | None on standard tier |
| **Moderation / safety** | AUP; moderation at discretion | Trust & Safety policies; likeness-rights attestation | AUP + legal center (DPA, sub-processors) | AUP; sole responsibility on customer |
| **Rate limits / queueing** | Documented: **20 new requests/10s, 100+ concurrent tasks** | Undocumented | Queue-first design; enterprise scaling | Prediction queue; webhook-based |
| **Webhooks / jobs** | ✅ Callbacks per task type + unified polling | Webhooks undocumented publicly | ✅ **Queue + webhooks with HMAC verification** | ✅ Webhooks configured per prediction |
| **Drafts / versions / approvals / export / publishing** | ❌ None — raw generation API (fine: that's OUR Harness job) | Studio-native drafts/galleries (wrong layer for us) | ❌ None (correct — our layer owns this) | ❌ None (correct) |
| **Integration complexity with Paige** | Low (task/callback mirrors Durable Jobs) | Medium-high (auth-shaped, product-shaped) | **Lowest risk** (queue/subscribe is a 1:1 match to our jobs seam) | Low (already proven in `generate-image`) |

Rights fine print that applies to **every** provider: platform terms assign contract rights, but the **underlying model license still governs** (e.g., Suno commercial terms, Veo/Kling/Seedance licensing). US copyright law currently gives no copyright to purely AI-generated work regardless. Vibe Studio must surface per-model commercial-use flags rather than promise customers ownership.

---

## 3. Provider detail

### 3.1 KIE AI — capability-rich, legally thin
- **What it is:** unified aggregator API (kie.ai / docs.kie.ai). Marketing: 30–84% below official APIs; "production-level use cases and commercial workflows."
- **Strengths:** the only single API covering image + video + the full Suno music suite + voice. Async task model (submit → task ID → poll OR `callBackUrl` webhook) is a direct match for Durable Jobs. Explicit rate limits (20 req/10s, 100+ concurrent). 14-day media auto-delete is decent default hygiene. Per-task credit logs make usage metering feasible.
- **Fatal weakness as primary:** the Terms of Use contain **no output-ownership or commercial-rights assignment, no API-specific terms, no retention clause, no SLA, and a license to use customer content for "operating and improving our services."** For a platform that *resells* generated media to paying coaching customers, that is not an acceptable primary-engine posture.
- **Continuity risk:** aggregator access to Suno (no official API exists) and other models is negotiated access that can break or reprice overnight.

### 3.2 Higgsfield — the wrong shape
- **What it is:** creator studio (cinematic video, effects, editing) with a secondary Cloud API (cloud.higgsfield.ai), official Python SDK, MCP integrations.
- **Terms:** post-backlash update states users own prompts/inputs/outputs with no commercial restrictions — but third-party analyses document a broad perpetual license grant (use/sublicense/train). No published retention or deletion terms surfaced.
- **Why not:** subscription-credit plans ($9–$129/mo) are consumer-shaped and cannot meter per-customer generation; the API is secondary to the studio; enterprise posture unproven; music absent. Its real value to us was UX inspiration — already banked in Social Studio's design.

### 3.3 fal.ai — the platform-grade engine
- **What it is:** infra-first inference platform, 600+ models (FLUX image family, frontier + open video, audio), Google Cloud Marketplace listing.
- **Legal/ops posture:** ToS distinguishes Inputs / Output Content / Usage Data; customer owns inputs; outputs usable per AUP; DPA + legal center; SOC 2; 99.99% uptime claim; enterprise **private endpoints** (the only provider-level tenant-isolation option found anywhere).
- **Data lifecycle:** CDN retention configurable per-request (`X-Fal-Object-Lifecycle-Preference`) and account-wide; ≥7-day guarantee; **Platform API can delete payloads and output files** — meets privacy-compliance needs.
- **Job architecture:** sync, async queue, SSE streaming, WebSocket; **webhooks with HMAC signature verification** — a 1:1 fit for our Durable Jobs + webhook-secret patterns.
- **Gap:** no Suno. Music is the one reason KIE stays on the board.

### 3.4 Replicate — strong terms, wrong role
- Strongest ownership clause found ("Customer owns… all rights, title, and interest in Outputs"). Output files auto-deleted **after 1 hour** — excellent privacy, brutal operations (must fetch-and-copy immediately; we already do exactly this in `generate-image`, which is partly why it works there). Frontier video/music lag. Already our Flux image provider; keep it in that seat, don't expand.

---

## 4. Recommended operating model (design now, build at priority #7)

One governed seam, many adapters — mirroring the proven `generate-image` pattern:

1. **`paige-media` edge function** — submit generation → `durable_jobs` row (idempotency key, lease, provider adapter) → provider task ID recorded.
2. **`paige-media-webhook` edge function** — receives provider callbacks (HMAC-verified, secret in vault/admin settings — same pattern as the Resend webhook work), correlates to the job, marks ready.
3. **`paige-media-sweeper` (cron)** — lease-expiry polling fallback; **copies final assets into the `paige-generated` Supabase Storage bucket immediately**, then calls the provider deletion API where available (fal) — provider URLs are never hotlinked and never long-lived.
4. **Provider adapters** behind one interface: `submit / poll / parseCallback / estimateCost / capabilities / licenseClass`. fal adapter first; KIE adapter (Suno only) optional; swapping providers is a config change, not a rewrite.
5. **Budget + metering** — per-tenant media credits ledger; **budget-ladder enforcement before submit** (reuse `router-budget`); Rail receipt per generation (model, params hash, cost, license class, commercial-use flag) via `record_capability_run` with redaction.
6. **Cost tiering** — draft on cheap models, finalize on premium; video is the budget killer (Veo-class generation can cost more per clip than a customer's monthly seat) → premium video requires owner approval gate by default.
7. **Rights metadata on every asset row** — provider, model, license class, `commercial_ok` flag, generated_at. Vibe Studio surfaces this; we never promise customers copyright.
8. **Safety pass-through** — provider moderation failures return as governed VERA denials, never silent errors.

---

## 5. Risks (ranked)

1. **KIE legal gap** (if used beyond music): no output-ownership clause = contractual exposure reselling content. *Mitigation: fal primary; KIE isolated to music; swap-able adapter; optionally request written commercial-rights confirmation before any music launch.*
2. **Aggregator continuity**: Suno has no official API; KIE's access (and pricing) can break. *Mitigation: adapter seam + feature flag; music can be dark-shipped off.*
3. **Video unit economics**: premium video cost vs customer pricing mismatch. *Mitigation: budget ladder, tiered models, approval gates, per-tenant daily caps.*
4. **Rights stack reality**: model-level licenses govern beyond platform ToS. *Mitigation: licenseClass + commercial_ok on every asset; UI disclosure.*
5. **Retention ops**: fal ≥7 days, KIE 14 days, Replicate 1 hour — all mean "copy on completion." *Mitigation: sweeper owns this; provider URLs never stored as source of truth.*
6. **Webhook ingress surface**: a new public endpoint that can spend money. *Mitigation: HMAC verification + idempotency keys + job-lease checks (patterns already proven).*
7. **Provider-side tenant isolation**: none at aggregators — every provider sees one platform key. *Mitigation: our RLS/job rows/storage paths ARE the isolation; fal private endpoints when volume justifies enterprise.*

---

## 6. Exact owner decisions required

1. **Provider posture** — approve: fal.ai primary (image/video/editing) + KIE as Suno-music-only secondary? OR single-provider simplicity (fal only, music deferred)? OR KIE-everything accepting the rights gap (not recommended)?
2. **Music in V1?** Suno via KIE now, or defer music until after Social operations proof?
3. **Video exposure policy** — which models at which tier, per-tenant daily caps, and whether premium video always requires owner approval.
4. **Customer billing shape** — metered media credits (marketplace-compatible, matches "funding = marketplace layer" ruling) vs included quota per plan.
5. **Confirm Higgsfield = design reference only** — never a wired provider.
6. **Account/budget timing** — owner opens the fal (± KIE) account and sets an initial prepaid ceiling when priority #7 begins; agents never open accounts (standing constraint).
7. **Green-light sequencing** — Vibe publish integration only after priority #3 (connect → authorize → draft → approve → publish → readback → analytics) passes on real accounts.

---

## 7. Collision map — current main (verified 2026-09-12)

Read-only sweep of the five seams. Verified with esbuild that `social-studio.tsx` parses cleanly (a suspected syntax error at line ~383 was a false alarm).

### Seam ownership today

| Seam | Surface | State |
|---|---|---|
| Vibe Studio (solo) | `src/solo/vibe.tsx` (+ agency port `src/agency/vibe.tsx`) | **100% fixture.** Fake build animation, dead Publish/Preview buttons, renders the `GR` fixture from `growth2.tsx:19`. Opened via `paige-studio` CustomEvent from Campaigns, deliberately not a route. |
| Vibe Studio (real) | `src/pages/admin/VibeStudio.tsx` + `components/admin/studio/*` (~StudioShell 2.5k lines) + `useGeneratePage` → `growth-page-draft`/`growth-studio-route` functions | **Real conversational studio** — same name, different lineage. Image mode calls `generate-image`. |
| Social Studio | `src/solo/social-studio.tsx` (627 lines) | **Read-only real** (`paige_social_posts` select), **writes all local/TODO** — composer never inserts, swipe archive/publish are TODOs (504, 508), ZION insight unreachable. |
| Social connections | `src/solo/settings-integrations-social.tsx` | Wall shows **14 platforms**; reads `paige_social_accounts` (real); **Connect is broken 3 ways**: calls `action:"connect"` that `paige-social` doesn't implement, with a user JWT the function rejects (service-role/cron only), expecting a `connect_url` nothing returns. |
| Social publishing | `supabase/functions/paige-social/index.ts` | Upload-Post adapter (post/schedule/analytics/comments/accounts). **Never writes `paige_social_posts`** — Rail RPC only → chat-published posts are invisible to Social Studio's feed. |
| Media generation | `supabase/functions/generate-image/index.ts` | **Real, image only**: gemini (nano-banana-class)/openai/replicate-flux/ideogram → `paige-generated` bucket + `marketing_content`. **Video: zero providers. Music: zero. KIE: zero hits anywhere on main.** |

### The 11 collisions

| # | Collision | Where |
|---|---|---|
| 1 | Connect button calls an unimplemented action with auth the backend rejects | `settings-integrations-social.tsx:74-102` vs `paige-social/index.ts:55-64,179` |
| 2 | `paige_social_posts` shipped June-2026 schema (no `tenant_id`/`content`/`targets`, old statuses); Jan-2027 migration's `create table if not exists` is a **no-op**; no ALTER exists — Social Studio reads a table whose real shape doesn't match | migration `20260627193825` vs `20270117000000` |
| 3 | Social Studio writes nothing (composer/swipe/editor local-only; ZION card dead) | `social-studio.tsx:459,504,508,604-614` |
| 4 | Two surfaces claim Campaigns→Social: SocialStudio renders; SocialCommand + `useSocialCommand` + `social-truth` (with its contract tests) orphaned | `growth2.tsx:441` vs `314-317` |
| 5 | Platform check constraint allows 8 platforms; the wall shows 14 | `20270117000000:22` vs `settings-integrations-social.tsx:20-35` |
| 6 | Three account representations: declared handles (`tenants.features->social_handles`), OAuth rows (`paige_social_accounts`), remote Upload-Post profiles | `useSocialCommand.ts`, migration, `paige-social` |
| 7 | Two publishing stacks: Upload-Post (NEXUS/paige-social) vs Meta Graph (`meta-schedule-post` + admin `SocialAdmin.tsx`) | functions + `src/pages/admin/SocialAdmin.tsx:42` |
| 8 | `paige-social` never persists to `paige_social_posts` — publishing and the Studio feed are disconnected | `paige-social/index.ts:114-130` |
| 9 | "Vibe Studio" names both the solo/agency fixture overlays and the real admin studio; `GR` fixture kept alive solely for the solo fixture | `src/solo/vibe.tsx:4,65` |
| 10 | Dead tool→table entry `update_social_accounts` (no such tool defined) | `paige-ai-chat/index.ts:12159` |
| 11 | Media AI split: image real (4 providers), video/music absent, KIE absent — Vibe fixture implies creative capability that doesn't exist yet | `generate-image/index.ts`; negative greps |

### Sequencing implication

Collisions 1, 2, 3, 5, 8 are **inside priority #3 (Social operations proof)** and must be resolved there — a media provider changes none of them. Collision 9 + 11 define the Vibe work at priority #6/#7: one real Vibe Studio lineage, real assets from `paige-media`, publish through the *proven* social seam. This is exactly why the owner's ordering (Social first, Vibe publish second, media provider last) is correct — nothing in this evaluation should jump the queue.

---

## 8. Sources

- KIE: [Terms of Use](https://kie.ai/terms-of-use) · [Privacy Policy](https://kie.ai/privacy-policy) · [Getting Started / retention + rate limits](https://kie.ai/getting-started) · [docs.kie.ai](https://docs.kie.ai/) · [Suno callbacks](https://docs.kie.ai/suno-api/extend-music-callbacks) · [Task detail API](https://docs.kie.ai/market/common/get-task-detail)
- Higgsfield: [Terms of Use Agreement](https://higgsfield.ai/terms-of-use-agreement) · [Ownership help center](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially) · [Terms update blog](https://higgsfield.ai/blog/terms-of-use-privacy-policy-update) · [Cloud API](https://cloud.higgsfield.ai/) · [Python SDK](https://github.com/higgsfield-ai/higgsfield-client) · [MindStudio TOS analysis](https://www.mindstudio.ai/blog/higgsfield-terms-of-service-backlash)
- fal.ai: [Terms of Service](https://fal.ai/legal/terms-of-service) · [Legal center](https://fal.ai/legal) · [Retention docs](https://fal.ai/docs/documentation/model-apis/media-expiration) · [fal CDN](https://fal.ai/docs/documentation/model-apis/fal-cdn) · [Queue + webhooks](https://fal.ai/docs/documentation/model-apis/inference/queue) · [GCP Marketplace / enterprise](https://blog.fal.ai/fal-is-now-available-through-google-cloud-marketplace/) · [Trust center](https://trust.fal.ai/controls)
- Replicate: [Terms](https://replicate.com/terms) · [Data retention](https://replicate.com/docs/topics/predictions/data-retention) · [Output files (1-hour)](https://replicate.com/docs/topics/predictions/output-files) · [Pricing analyses](https://www.spheron.network/blog/replicate-pricing-2026-per-second-cost/) · [Webhooks/lifecycle](https://replicate.com/docs/topics/predictions/lifecycle)
- Suno official-API absence context: [Reddit deep-dive](https://www.reddit.com/r/SaaS/comments/1nk4yiw/is_there_an_official_suno_api_a_deep_dive_for/)
