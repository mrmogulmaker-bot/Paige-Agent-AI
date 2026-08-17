# Codebase Map — shipped surface area (routes · components · edge functions · gates · integrations)

The brain's answer to *"do we have surface/feature X **built**?"* — a navigable index of the real
shipped code, so a session stops answering "is this built?" from memory (the §BRAIN.2 / false-confidence
trap: "if it's not in the brain it doesn't exist"). This complements `config-registry.md` (which records
*integration wiring*) — this file records *what surfaces and functions exist*.

**§13 rules for this file:** every row points at a real path verified this pass (2026-08-09, from
`origin/main` @ `c40f76d3`). Counts are approximate where noted. A surface here proves the code exists;
it does **not** prove the feature is fully wired end-to-end (integration state lives in
`config-registry.md`, and honest "built-but-not-wired" gaps are called out inline).

> **Router topology — check ALL THREE routers.** Routes are split across three files; any "do we have
> surface X?" answer must check each: **`src/App.tsx`** (public / `/app` tenant / `/broker` / `/onboard`),
> **`src/pages/Admin.tsx`** (`/admin/*` operator console + `/admin/platform/*` super-admin), and
> **`src/components/admin/AgencyLayout.tsx`** (`/agency/*`).
>
> **TARGET taxonomy (§65, planned — NOT yet code).** The current `/admin` route is overloaded 4 ways
> (Solo + Sub-account + Agency + God all log in there — the naming-debt §65 fixes). The LOCKED target
> matrix + staged redirect-safe migration live in **`docs/doctrine/route-and-url-taxonomy.md`**:
> Operator `/operator` · Agency `/agency/{account}` · Enterprise `/enterprise/{account}` · Solo
> `/solo/{account}` · Sub-account `/business/{account}` · Client `/portal/:tenantSlug`. Until the
> code-rename slices ship, THIS map reflects the current routes; consult the taxonomy doc for where each
> is headed.

---

## 1. Routes / surfaces (by audience section)

### Public / marketing (`src/App.tsx`)
Homepage `/` (`PaigeHome`; `/premium`,`/legacy` legacy heroes) · auth `/auth` (`/login`→/auth),
operator login `/operator` · signup `/signup`·`/get-started`·`/onboarding`·`/signup/coach-qualify`,
`/join-platform` · marketing `/about`·`/pricing`·`/blog`·`/welcome` · legal `/terms`·`/privacy`·`/legal/:slug` ·
affiliate/broker `/affiliates`·`/broker`·`/broker/accept-invite` · public tenant storefront `/store/:slug` ·
Growth-OS public renderers `/p/:tenantSlug/:pageSlug` (page), `/f/:tenantSlug/:funnelSlug` (funnel),
`/form/:id` · portal gateway `/portal/:tenantSlug` · invites `/accept-invite`·`/join/:token`·`/reset-password` ·
MCP consent `/mcp/authorize` · OAuth callbacks `/auth/google-calendar/callback`·`/auth/gmail/callback` ·
unsubscribe `/unsubscribe`·`/u/:token`.

### Tenant / consumer (`/app/*`, gated by `RequireCompleteSignup`, shell `AppShell`)
Index (agent home) + `credit`, `funding`, `funding-journey`, `disputes`, `learn`(+`/:courseId`),
`business`/`business-profile`, `financial-profile`, `support`, `settings`, `agreements`, `affiliate`,
`approvals`, `actions`, `planning`, `paige-team`.

### Client onboarding wizard (`/onboard/*`, magic-link, shell `OnboardLayout`)
`welcome` (Step 1) · `agreement` (Step 2); unknown paths self-heal → Step 1 → `/app`.

### Broker / sub-account workspace (`/broker/app/*`, shell `BrokerWorkspace`)
Index (`BrokerOverview`), `clients`, `sessions`(+`/:relationshipId` `BrokerPaigeSession`), `team`,
`commissions`, `mcc`, `settings`. Public broker apply at `/broker`.

### Agency operator (`/agency/*`, `AgencyLayout`, server-proven agency-manager gate)
Index (`AgencyBoard`), `team` (`AgencyTeamPanel`), `paige-team`, `marketplace` (`AgencyMarketplace`).
Small client surface by design — most agency management is server-side.

### §65 URL-driven Agency shell (`/agency/{account_number}/{branch}/{subtab}`, `AgencyEntry`→`AgencyApp`)
The NEW deep-linkable Agency tree (owner 2026-08-17). `src/agency/AgencyEntry.tsx` dispatches `/agency/*`:
a NUMERIC first segment → the URL-driven `AgencyApp` (15 branches, each a real route); anything else →
the legacy `AgencyLayout` board above (§58, no collision). **The route registry is config-as-data at
`src/lib/routing/tierBranches.ts`** (`TIER_TREES`: operator/agency/enterprise/solo/sub_account; §11c
sub_account inherits the SOLO tree; §3/§61 enterprise = agency superset) — the ONE HOME (§18) for
tier→branch→subtab mapping (slug ≠ internal key by design). `AgencyApp` derives `branch` from splat `[0]`;
each screen's sub-tab is derived from splat `[1]` via **`src/lib/routing/useSubtabRoute.ts`** (drop-in
replacement for a screen's local sub-tab `useState` — reads the URL, navigates on set; DUAL-MODE §58: no
`:account` param → plain local state, so the sub-account inline `/admin` takeover path is byte-unchanged).
12 agency screens are sub-tabbed (CommandCenter·paige·automations·clients·calendar·growth·analytics·
billing·marketplace·vault·team·setup); Client Support + Integrations have none. Per-account address =
`tenants.account_number` (net-new bigint, migration `20260916000000`; §9 address-NOT-grant — RLS still
gates data). Tests: `src/lib/routing/tierBranches.test.ts`.

### Admin / operator console (`/admin/*`, `Admin.tsx`)
Grouped tab layouts: **Clients Hub** (`clients-hub`+`/pipeline`,`/conversations`{manual-actions,snippets,
trigger-links,analytics,settings},`/delivery`,`/portal`; `clients`, `contacts/:id`, `clients/:id/journey`) ·
**Setup** (`setup`+`/general`,`/brand`,`/automations`,`/integrations`,`/legal`,`/billing`,`/playbook`) ·
**Team/Planning** (`team`,`planning`) · **Funding** (`funding`,`funding-pipeline`,`funding-lens`,
`business-credit`,`owner-credit`,`banking` — all under `FundingRoute` gate) · **Knowledge**
(`knowledge`,`knowledge-base`,`tenant-knowledge`,`network-kb`) · **Studio** (`studio`+`/new`,`/library`,
`/:sessionId`) · **Growth/Campaigns** (`campaigns`,`social`,`leads/enrichment`) · **Workflows**
(`workflows/runs`(+`/:id`),`workflows/:key`) · **Ops** (`analytics`,`maintenance`,`security`,`approvals`,
`notifications`,`data-registry`,`observability/usage`,`observability/errors`,`bookings`,`signatures`) ·
**Marketplace** (`marketplace`) · **Paige config** (`playbook`,`sub-agents`,`actions`,`skills`,`paige-team`) ·
**Integrations** (`/n8n`,`/zapier`,`/telegram`,`/email`,`/docusign`,`/cal`,`/meta`,`/meta-pixel`,`/apollo`,
`/plaid`,`/smartcredit`,`/subscriptions`,`/ai-activity`,`/nav`).

**Solo shell overlay** (`src/solo/**` → `SoloApp`, faithful port of the Claude Design Solo pack; merged
#503 2026-08-16): a flag-gated (`VITE_SOLO_SHELL_ENABLED`, default OFF) early-return takeover in
`Admin.tsx` — for STRICT solo-standalone tenants ONLY (`tierKey==='solo' && soloStandalone`, wrapped in
`AdminLoaderBoundary` + lazy code-split) it renders the ported Rail/TopBar shell + **13** fixture-data
screens (Command Center · Paige · Trust Compass · Automations · Clients · **Calendar** (incl. webinars) ·
Growth · Analytics · Marketplace · Business Vault · Integrations · Team · Setup) instead of `AdminLayout`.
Sub-account/Agency/God each get their OWN Claude Design pack later (owner-ruled 2026-08-15 — the prior
"sub-accounts inherit Solo" reading is RETRACTED; §60 governs feature availability, NOT visual design).
Flag OFF ⇒ prod render byte-unchanged (§58); fixture-data now, real wiring + activation are owner-gated
later phases. Lint exemptions scoped to `src/solo/**` only (eslint override + gold-discipline skip, §63).

### Super-admin / platform (`/admin/platform/*`)
`tenants`, `team`, `fleet-communications`, `sending`, `sends`, `intelligence`, `settings`, `affiliates`,
`invites`, `marketplace`, `money`, `doctrine`, `prompt-forge`, `model-router`, `compliance`,
`content-defaults`, `analytics`, `deploy-health`.
**Operator Communications** = `/admin/platform/fleet-communications` (`PlatformFleetCommunications.tsx`) —
the operator's OWN SMS line (PR #408, §9 seam). Store: `operator_conversations`/`operator_messages`
(owner-only RLS, no `tenant_id`). NEVER merge with the tenant inbox `/admin/clients-hub/conversations`.

---

## 2. Domain components (`src/components/**` top-level → what lives here)

| Folder | ~files | What lives here |
|---|---|---|
| `dashboard/` | 126 | Tenant `/app` dashboard sections (LearningVault, ProfileSettings, business-profile, AffiliateTracking, RepositioningNotice…) — largest folder |
| `admin/` | 116 | Operator/God console + `/admin/platform/*`, `AgencyLayout`, Studio layout, `FundingRoute`, tab layouts, `comms/` (Numbers/A2P/Conversations) |
| `ui/` | 78 | Design-system primitives (shadcn) + `ui/page/` premium layer (`PageShell`/`PageHeader`/`DataTableShell`/… + analytics primitives `Sparkline`/`DrillContainer`/`MetricEntityCard`/`ExploreChart`, PR #411) |
| `paige/` | 29 | Paige agent chrome — chat / session / persona / team-directory UI (right-rail + ⌘K launcher, PR #405) |
| `landing/` | 18 | Marketing homepage sections |
| `premium-motion/` | 14 | Animation/motion primitives |
| `credit/` | 14 | Credit-intelligence UI (incl. `SoftPullAuthorizationCard` iSoftPull gate) |
| `chat/` | 12 | Floating chat / conversational widgets (`MessageAudioButton` TTS play) |
| `funding/` · `affiliates/` | 10 each | Funding matches/portfolio · affiliate tracking/apply |
| `team/` | 8 | Team hub / `TeamViewToggle` (`TEAM_VIEW_ENABLED` gate) |
| `funding-journey/` | 7 | Funding journey stepper |
| `auth/` | 6 | Route guards (`RequireCompleteSignup`, `ClientOnlyRouteGuard`) |
| `clients/`·`support/`·`legal/` | 6/6/5 | Client admin UI · support requests · legal renderers |
| `planning/`·`app/` | 4 each | Planning board · `/app` shell helpers |
| `funding-lens/`·`onboarding/`·`growth/` | 3 each | Funding-lens analytics · onboarding steps · Growth-OS block editors |
| `analytics/`·`seo/`·`setup/`·`client/` | 2 each | Analytics widgets · MetaPixel/SEO · setup panels · client-portal bits |
| `voice/`·`marketplace/`·`broker/`·`business/`·`brand/`·`security/`·`approvals/`·`notifications/` … | 1 each | Thin single-component feature areas |

Loose top-level: `FloatingChatbot`, `PaigeCore`/`PaigeScene`/`PaigeHero3D`/`PaigePremiumFigure` (3D hero),
`PlatformUpdateBanner`, `InstallPWA`, `ThemeToggle`, `PageTransition`.

---

## 3. Edge functions (~241 dirs under `supabase/functions/`, excl. `_shared/`)

Grouped by theme with the load-bearing names (not all 241 enumerated — group + key fns):

| Group | ~n | Load-bearing functions |
|---|---|---|
| **paige-\*** (agent core) | 22 | `paige-orchestrator`, `paige-ai-chat`, `paige-public-chat`, `paige-context-router`, `paige-bridge`, `paige-action-worker`, `paige-mcp` |
| **subagent-\*** (specialists) | 13 | `subagent-forge`, `subagent-fundability`, `subagent-funding-path`, `subagent-compliance`, `subagent-sales-pipeline`, `subagent-email-composer` |
| **comms / SMS / email / send** | ~30 | `send-message`, `send-notification`, `handle-inbound-sms`, `handle-inbound-email`, `process-email-queue`, `send-transactional-email`, `comms-search-numbers`, `comms-purchase-number`, `comms-a2p-draft`, `comms-a2p-submit`, `paige-operator-sms-send`, `paige-operator-sms-inbound` |
| **Twilio** | 4 | `twilio-inbound-webhook`, `twilio-status-callback`, `provision-tenant-twilio`, `send-sms` (+ shared `_shared/twilio.ts`, `_shared/operator-twilio.ts`) |
| **Stripe / checkout / billing** | ~8 | `stripe-webhook`, `handle-stripe-webhook`, `create-checkout`, `create-trial-checkout`, `tenant-stripe-connect`, `platform-subscription-checkout` |
| **Credit** | 12 | `analyze-credit-report`, `calculate-credit-factors`, `generate-credit-predictions`, `extract-business-credit-report`, `detect-credit-alerts` |
| **Funding** | 4 | `match-funding-products`, `generate-funding-projection`, `send-funding-report`, `subagent-funding-path` |
| **Plaid** | 9 | `plaid-create-link-token`, `plaid-exchange-token`, `plaid-sync-transactions`, `plaid-webhook`, `paige-plaid-*` |
| **QuickBooks** | 7 | `quickbooks-oauth-initiate/callback`, `quickbooks-sync-financials`, `quickbooks-webhook`, `quickbooks-refresh-token` |
| **Credit-pull vendors** | 4 | `isoftpull-initiate`, `isoftpull-webhook`, `smartcredit-pull-snapshot`, `handle-smartcredit-alert-webhook` |
| **Calendar / booking** | ~8 | `google-calendar-oauth-start/callback/disconnect`, `cal-list-bookings`, `cal-cancel-booking`, `handle-cal-webhook`, `public-booking`, `process-booking-notifications` |
| **Zoom** | 3 | `zoom-oauth-start/callback/disconnect` |
| **Voice / STT / TTS** | ~6 | `paige-tts`, `paige-stt`, `paige-dictate`, `voice-command-processor`, `voice-twiml`, `voice-access-token` |
| **Studio / skills** | 5 | `studio-learn-from-artifact`, `studio-visual-critique`, `skill-forge`, `skill-runner`, `growth-studio-route` |
| **Growth OS** | 7 | `growth-page-draft`, `growth-funnel-draft`, `growth-form-draft`, `growth-inbound`, `growth-process-submission`, `growth-block-edit` |
| **Knowledge base / embeddings** | ~8 | `kb-search`, `kb-ingest-doc/file/url`, `kb-promote-to-network`, `embed-text`, `embed-client-financials`, `backfill-memory-embeddings` |
| **Meta / social** | 6 | `handle-meta-webhook`, `meta-capi-admin`, `meta-track-conversion`, `meta-schedule-post`, `meta-get-insights` |
| **Google / Gmail** | 6 | `gmail-oauth-start/callback/disconnect`, `google-calendar-*` |
| **Apollo (enrichment)** | 3 | `apollo-search-people`, `apollo-enrich-person`, `apollo-enrich-company` |
| **Tenant provisioning** | ~8 | `tenant-signup`, `tenant-checkout-session`, `manage-tenant-domain`, `tenant-stripe-connect`, `tenant-journey`, `provision-tenant-twilio` |
| **Broker** | 5 | `broker-paige-chat`, `broker-admin-action`, `broker-auto-approve`, `broker-workspace-checkout`, `send-broker-team-invite` |
| **Marketplace** | 2 | `marketplace-install`, `marketplace-checkout-session` |
| **Affiliate** | ~3 | `invite-affiliate`, `affiliate-monthly-statement-cron`, `track-referral-click` |
| **Webhooks (generic in/out)** | ~14 | `handle-inbound-webhook`, `fire-outbound-webhooks`, `webhook-inbound`, per-vendor `handle-*-webhook` |
| **DocuSign / signatures** | 2 | `docusign-send-envelope`, `handle-docusign-webhook` |
| **Automation connectors** | ~3 | `paige-n8n`, `call-zapier-action`, `send-telegram` |
| **Privacy / GDPR / consent** | 4 | `export-clients-csv` (data export), `request-data-deletion` + `process-data-deletion` (GLBA/CCPA right-to-erasure), `log-consent` (consent audit trail) — admin route `/admin/.../data-registry` |
| **Content drafting (standalone copy, §19)** | 1 | `content-draft` — the ONE home for standalone marketing copy (posts, ads, email campaigns, captions, blog outlines, SMS broadcasts); Paige drafts in chat, never a Studio artifact type |
| **Web search / deep research** | ~4 | `paige-web-search`, `paige-deep-research`, `web-search`, `paige-problem-reverse-engineer` |
| **Browser automation (Twin-A)** | 1 | `browser-use` (Browserbase headless Chrome; secrets `BROWSERBASE_*`) |
| **Web push** | ~1 | `send-push-notification` (VAPID; `VAPID_*` secrets + client push-subscription path) |
| **Operator/God user-management** | ~5 | `admin-list-users`, `admin-delete-user`, `admin-force-signout`, `admin-account-actions`, `admin-drop-bucket` |
| **Invoicing / payment confirmation** | ~2 | `generate-invoice`, `send-payment-confirmation-email` (+ `platform_invoices` table, §38) |
| **LMS backend** | ~3 | `issue-certificate`, `track-lesson-progress`, `enroll-user-in-course` (front end = `/learn` + `LearningVault`) |
| **Scheduler / cron / reminders** | ~6 | `schedule-automated-tasks`, `coaching-reminder-cron`, `plan-reminder-cron`, `weekly-summary-cron`, `task-reminder-notifications`, `dispatch-stage-automation` |
| **SMS phone-verify (notifications)** | 2 | `send-sms-verification`, `verify-sms-code` (+ `sms_verifications` table) — wired in `NotificationsSettings.tsx`; NOT wired into signup (see decision-log Known-unbuilt) |

*(The count churns as functions ship; index the **theme groups + load-bearing names** here, not a bare
number. `/edge-drift` shows what's ahead of prod.)*

---

## 4. Feature flags / gates (name → where read)

**Compile-time boolean kill-switches (client):**
- `VITE_SOLO_SHELL_ENABLED` (env, default **off**) — `src/pages/Admin.tsx`; when `"true"` AND the tenant is a STRICT solo-standalone (`useTierFeatures().tierKey==='solo' && soloStandalone`, i.e. literal `account_type==='standalone'` + no `parent_tenant_id`), an early return replaces the whole tenant admin shell with the faithful-ported Claude Design Solo pack `SoloApp` (`src/solo/**`, lazy-loaded → separate chunk, wrapped in `AdminLoaderBoundary`). Fixture-data greenfield; OFF everywhere until owner-activated. Never fires for sub-account/agency/enterprise/god (canonical `resolveTierKey` + the strict `isSoloStandalone` in `src/lib/tier/tierFeatures.ts` reject null/unknown account_type).
- `TEAM_VIEW_ENABLED = false` — `src/lib/roleViews/commandCenterRegistry.ts`; Team view stays OFF until flipped (read in `PracticeOverview`, `TeamHub`, `ContactsAdmin`, `team/TeamViewToggle`).
- `HOST_SPLIT_ENABLED = false` — `src/lib/hostRouting.ts`; gates app/marketing host split.
- `ISOFTPULL_ENABLED_CLIENT = false` — `src/components/credit/SoftPullAuthorizationCard.tsx`; hides soft-pull UI until server keys set.
- `STUDIO_THINKING_ENABLED` — reasoning stream gate in `paige-ai-chat` (read by `admin/studio/chat/ReasoningPanel`).

**Runtime per-tenant gates (server / DB):**
- **`funding_enabled`** — the central §2 finance gate. Derived in `_shared/client-context.ts` from the
  `is_finance` marketplace-catalog install OR `features.finance_in_scope` / `features.playbook === "funding"`;
  consumed by `get_paige_persona_context()` + `paige-orchestrator`. **The single most load-bearing gate** —
  it governs whether the entire funding vertical is visible per tenant (§2 opt-in, never a platform default).
- **`_shared/finance-gate.ts`** — `looksLikeFinanceAgent()` / `FINANCE_DOMAINS` / `FINANCE_KEYWORDS`; the
  canonical finance classifier enforced at agent-creation (`subagent-forge`) + invocation (`paige-orchestrator`).
- **`features.*` playbook flags** — tenant `features` JSON read in `client-context.ts`; presets in `src/lib/playbook/presets.ts`.
- **Model-router gates** — `_shared/model-router-gates.ts` + `_shared/model-allowlist.ts` gate which LLM a tier may use; peers `visual-critique-gate.ts`, `finance-gate.ts`.
- **`FundingRoute`** — `src/components/admin/FundingRoute.tsx`; client guard wrapping all `/admin/funding*` surfaces.

*(There is **no** generic `feature_flags`/`platform_features` registry table — gating is compile-time consts +
the derived `funding_enabled` signal + marketplace-install checks.)*

---

## 5. Third-party integration entry points

| Vendor | Entry point | Wired? |
|---|---|---|
| **Twilio** | `_shared/twilio.ts` (+ `_shared/operator-twilio.ts`, `_shared/twilio-media.ts`); `twilio-inbound-webhook`, `twilio-status-callback`, `provision-tenant-twilio` | ✅ (ISV/reseller — see config-registry "Twilio ISV Architecture") |
| **ElevenLabs** | `_shared/elevenlabs.ts` + `_shared/tts-router.ts` → `paige-tts`; auth `ELEVENLABS_API_KEY` via `envKey()` | ✅ (in-app TTS); ConvAI phone path UNWIRED |
| **Stripe** | no shared module (SDK inline); `stripe-webhook`/`handle-stripe-webhook`, `create-checkout`, `tenant-stripe-connect` | ✅ |
| **Meta (FB/IG)** | `handle-meta-webhook`, `meta-capi-admin`, `meta-track-conversion`; client `seo/MetaPixel` | ✅ |
| **Google** | Calendar `google-calendar-oauth-*`; Gmail `_shared/gmail.ts` + `gmail-oauth-*` | ✅ |
| **Microsoft / Outlook** | — | ❌ NOT WIRED |
| **Zoom** | `_shared/zoomMeetings.ts` + `zoom-oauth-start/callback/disconnect` | ✅ |
| **Vercel** | client `@vercel/speed-insights` only; deploy is CI | ✅ (build/CI, not runtime) |
| **GitHub** | CI only (`.github/workflows/`), no runtime module | ✅ (CI only) |
| **n8n** | `paige-n8n` + `_shared/workflowDispatch.ts` | ✅ |
| **Zapier** | `call-zapier-action` | ✅ |
| **Plaid** | `plaid-create-link-token`, `plaid-exchange-token`, `plaid-webhook`, `paige-plaid-*` | ✅ (funding lane) |
| **QuickBooks** | `_shared/quickbooks-utils.ts`; `quickbooks-oauth-*`, `quickbooks-sync-financials`, `quickbooks-webhook` | ✅ (funding lane) |
| **DocuSign** | `_shared/docusignJwt.ts`; `docusign-send-envelope`, `handle-docusign-webhook` | ✅ |
| **Apollo / iSoftPull / SmartCredit / SMTP** | `apollo-*`; `isoftpull-*`; `smartcredit-*`; `_shared/smtp.ts` | ✅ (funding/enrichment lane) |
| **Browserbase** | `browser-use` (headless Chrome, Twin-A browser agent; `BROWSERBASE_*` secrets) | ✅ |
| **Firecrawl** | web crawl for research (`FIRECRAWL_API_KEY`) | ✅ |
| **LLM / media providers** | `_shared/`: `claude.ts`, `openai.ts`, `groq.ts`, `gemini-image.ts`, `replicate.ts`, `voyage.ts`, `ideogram.ts`, `meshy.ts` (via model-router §14) | ✅ |

---

*Regenerate the verified rows when surface area changes; any PR that adds a route/surface/edge-fn family or
an integration entry point updates this file in the same commit (§BRAIN.3). Verified 2026-08-09 @ `c40f76d3`.*
