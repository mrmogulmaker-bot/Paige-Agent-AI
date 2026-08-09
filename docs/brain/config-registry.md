# Config Registry — infra & integration state

Durable record of the platform's integration configuration so no future session re-diagnoses
"how is X wired / what's the account / which secret drives this."

**§13 rules that govern this file (read before editing):**
1. **NAMES & non-secret identifiers only** — env-var names, phone numbers, account IDs, agent/voice
   IDs, price IDs, product IDs, webhook endpoint IDs, messaging-service names, project refs. **NEVER
   a secret value** (auth token, API key, signing secret, private key). If you discover a value,
   do NOT write it here.
2. **Verify or mark.** Every fact is either **verified this session** (with *how* stated) or tagged
   **`⚠ unverified — confirm`**. Do not assert an unchecked fact.
3. **In-flight ≠ live.** Facts that exist only on an unmerged branch are marked as such — the brain
   tracks `main`/prod, not work in progress.

**Verification legend:** ✅ verified this session (method noted) · ⚠ unverified/in-flight (confirm).

Last full verification pass: **2026-08-09**.

---

## Supabase

| Fact | Value | Verified |
|---|---|---|
| Project ref / `project_id` | `xygzykjyynhzqytbqnzu` | ✅ `supabase/config.toml` line 1 + Supabase MCP `get_project` |
| Prod URL | `https://xygzykjyynhzqytbqnzu.supabase.co` | ✅ derived from ref; appears in live Stripe webhook `url` |
| Migrations applied on prod | **762** | ✅ MCP `SELECT count(*) FROM supabase_migrations.schema_migrations` |
| Latest applied migration | `20260811120000` | ✅ MCP `SELECT max(version)` — matches repo's latest `.sql` (zero drift) |
| Repo migration files | 762 `.sql` | ✅ `find supabase/migrations -name '*.sql' \| wc -l` |
| Edge functions | **242** dirs under `supabase/functions/` | ✅ `ls -d supabase/functions/*/` |
| Tenants | 11 (10 `standalone`, 1 `agency`) | ✅ MCP `SELECT account_type, count(*) FROM tenants GROUP BY 1` |

**Config/settings tables present on prod** (✅ MCP `information_schema.tables ~ 'config|setting|platform_'`):
`admin_app_settings`, `app_settings_owner`, `outbound_webhook_configs`, `paige_config`,
`paige_telegram_config`, `platform_api_keys`, `platform_email_settings`, `platform_invites`,
`platform_invoices`, `platform_legal_profile`, `platform_metered_events`(+`_dead_letter`),
`platform_metering_reconciliation`, `platform_mrr_snapshot`, `platform_number_pricing`,
`platform_phone_numbers`, `platform_subscription_plans`, `platform_subscriptions`,
`platform_usage_events`, `staff_calendar_settings`.

**Core Supabase edge secret NAMES** (✅ grep `Deno.env.get`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. Deploy auth uses the `SUPABASE_ACCESS_TOKEN` **repo secret** (per
`supabase/functions/CLAUDE.md`; ⚠ presence not re-verified this session — CLAUDE.md asserts it is set).

---

## Stripe (§38 — Paige holds its OWN rails only)

| Fact | Value | Verified |
|---|---|---|
| Account ID | `acct_1TvndiLUcYKxolNa` | ✅ Stripe MCP `get_stripe_account_info` |
| Display name | "Paige Agent AI" | ✅ same |
| Mode | livemode (all prices/webhooks `livemode:true`) | ✅ Stripe MCP |

**Active platform-subscription prices** (✅ Stripe MCP `GetPrices active:true` — all livemode):

| Plan | Interval | Price ID | Amount | Product | lookup_key |
|---|---|---|---|---|---|
| Solo | monthly | `price_1TzkVaLUcYKxolNaTMOGad1D` | $149.00 | `prod_UzjzWtdtKzWlIp` | `solo_monthly` |
| Solo | annual | `price_1TzkVdLUcYKxolNaKu56Gkjh` | $1,490.00 | `prod_UzjzWtdtKzWlIp` | `solo_annual` |
| Agency | monthly | `price_1TzkVgLUcYKxolNahULDkCfw` | $397.00 | `prod_UzjziZpD2L269e` | `agency_monthly` |
| Agency | annual | `price_1TzkVzLUcYKxolNagIGowZMC` | $3,970.00 | `prod_UzjziZpD2L269e` | `agency_annual` |

**⚠ Finding — Enterprise plan has no active Stripe price.** DB `platform_subscription_plans` lists
`solo`, `agency`, **`enterprise`** all `is_active=true` (✅ MCP), but live Stripe returned **only
Solo + Agency** active prices (`has_more:false`). Enterprise is registered in the plan table with no
active Stripe price yet — confirm whether that's intentional (sales-led/manual invoicing) before
wiring an Enterprise checkout.

**Webhook endpoints** (✅ Stripe MCP `GetWebhookEndpoints`, both → `.../functions/v1/stripe-webhook`):

| Endpoint ID | Status | Notes |
|---|---|---|
| `we_1U2NB0LUcYKxolNaxGCRBI0y` | **enabled** | "production webhook (secret handed to Supabase `STRIPE_WEBHOOK_SECRET`)"; core checkout/subscription/invoice + `charge.refunded` events |
| `we_1U2MDCLUcYKxolNaPHAi9mYk` | **disabled** | broader event set (customer/billing/account/plan/invoice.*) |

**Stripe edge secret NAMES** (✅ grep): `STRIPE_SECRET_KEY`, `STRIPE_SECRET_KEY_V2`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET_V2`, and price-ID env names
`STRIPE_PRICE_STANDARD`/`_V2`, `STRIPE_PRICE_PREMIUM`/`_V2`, `STRIPE_PRICE_VIP`/`_V2`,
`STRIPE_ADDITIONAL_BUSINESS_PRICE_ID`, `STRIPE_BROKER_BETA_STARTER_PRICE_ID`,
`STRIPE_BROKER_WORKSPACE_PRICE_ID`, `STRIPE_BROKER_CLIENT_COUPON_CODE`.

**⚠ Finding — legacy price env names vs the live Solo/Agency catalog.** The
`STRIPE_PRICE_{STANDARD,PREMIUM,VIP}(_V2)` env names are a *legacy* (consumer funding-coaching)
tier scheme; the current **platform-subscription** catalog is Solo/Agency (above). Do not assume
the `STANDARD/PREMIUM/VIP` env names map to the current plan tiers — confirm the resolver before
relying on either. (Secret **values** intentionally not recorded.)

---

## Twilio (SMS / voice — last-mile telecom commodity, §34)

**Platform-wide Twilio secret NAMES** (✅ grep `Deno.env.get`): `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_FROM`,
`TWILIO_PHONE_NUMBER`, `TWILIO_STATUS_CALLBACK_URL`, `TWILIO_MESSAGING_SERVICE_SID` (referenced),
`VOICE_TWIML_URL`, `VOICE_STT_STREAM_URL`, `VOICE_STREAM_SECRET`.

**Sending pattern** (✅ `_shared/bookingNotify.ts`): `TWILIO_FROM` falls back to `TWILIO_PHONE_NUMBER`;
messages sent E.164-normalized.

**Live tenant phone numbers on prod** (✅ MCP `SELECT phone_number, source, status FROM
tenant_phone_numbers`): `+14705177009` (source `marketplace`, active) and `+14705706068` (source
`marketplace`, active). **Both marketplace-provisioned.**

**Operator (God/Super-Admin) A2P line — ⚠ IN-FLIGHT, not yet live:**
- The number **+1 (470) 200-3444** is referenced in `main` source *comments* (`send-message/index.ts`,
  `provision-tenant-twilio/index.ts`) as "the Super Admin's imported operator number," described as a
  `tenant_phone_numbers` row with `source='imported'`. **⚠ That row is NOT present in prod today** —
  the only `tenant_phone_numbers` rows are the two `marketplace` numbers above. Treat +1 470 200 3444
  as *intended/documented but not yet a live provisioned row.*
- Operator A2P config — Twilio account **"Paige Agent AI LLC"**, Messaging Service **"Low Volume Mixed
  A2P Messaging Service"** (outbound via its `MG…` SID, never a raw `From:`), voice webhook currently
  on the Twilio demo URL (re-point scheduled slice 4c.2), plus secret names
  `TWILIO_OPERATOR_ACCOUNT_SID` (`AC…`) and `TWILIO_OPERATOR_MESSAGING_SERVICE_SID` (`MG…`) — is
  specified in the **in-flight, unmerged** branch `claude/s3-operator-communications` (PR **#408**),
  in `supabase/functions/CLAUDE.md` "Twilio Operator Configuration." **⚠ Not in `main`; confirm on
  #408 merge.** (Source: PR #408 branch, read read-only this session.)

---

## Voice / TTS / STT (ElevenLabs + fallbacks)

**⚠ ElevenLabs MCP is disconnected this session** — facts below are verified from **repo source**, not
from the ElevenLabs API.

**Platform voice (✅ verified in `main` source):**
- `_shared/tts-router.ts`: `PRIMARY_ELEVENLABS_VOICE = "6aDn1KB0hjpdcocrUkmq"` — the owner-locked
  female "Warm" voice, the platform default on every tier (`DEFAULT_TTS_VOICE = {provider:"elevenlabs",
  id: PRIMARY_ELEVENLABS_VOICE}`). Alternates: `g6xIsTj2HwM6VR4iXFCw` ("Clear", backup female),
  `vBKc2FfBKJfcZNyEt1n6` ("Deep", male). (Voice IDs are non-secret identifiers.)
- `_shared/elevenlabs.ts`: `DEFAULT_VOICE = Deno.env.get("ELEVENLABS_VOICE_ID") ?? "21m00Tcm4TlvDq8ikWAM"`
  (Rachel — generic fallback). **This is the only path that honors the `ELEVENLABS_VOICE_ID` edge
  secret.** OpenAI TTS is the honest degrade fallback (comment cites §13/#579).
- Model comes from `_shared/model-router.ts` `voiceCell` → `elevenlabsTts` (`eleven_multilingual_v2`).

**ElevenLabs secret NAMES** (✅ grep): `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`,
`ELEVENLABS_BASE_URL`. (No `ELEVENLABS_API_KEY` name surfaced in the grep — ⚠ confirm how the
ElevenLabs client authenticates; the key may be injected under a different name or via the router.)

**⚠ ConvAI voice-leak lesson (in-flight PR #409 / branch `claude/voice-fix-ivanna`):** the TTS path
does **not** read the ElevenLabs ConvAI agent — updating a ConvAI agent's voice has **no effect** on
Paige's spoken voice (the ConvAI stack was removed in #170 / §49 Wave A). The authoritative voice knob
is `PRIMARY_ELEVENLABS_VOICE` in `tts-router.ts` (hardcoded) and `ELEVENLABS_VOICE_ID` (only for the
`elevenlabs.ts` legacy path). This diagnosis is being persisted as a "Voice Configuration" CLAUDE.md
section on PR #409 — **⚠ not yet in `main`.** See `lessons-learned.md` → "voice live-drive trap."

**Voice feature-flag / cost secret NAMES** (✅ grep): `VOICE_COPILOT_ENABLED`,
`VOICE_COPILOT_COST_CAP_USD`.

---

## GitHub Actions / CI (✅ `.github/workflows/`)

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | pull_request + push | Typecheck/build/lint/test gate |
| `deploy-migrations.yml` | push (to `main`) | `supabase db push` → `migration list` verify → moves `db-live` tag (§32 persisted-apply) |
| `deploy-edge-functions.yml` | push (to `main`) | Deploys only changed functions (follows `_shared` imports via `.github/scripts/edge-affected.py`); moves `edge-live` tag (§24) |
| `migration-lint.yml` | pull_request | Migration shape lint (§208/§213) |
| `premerge-migration-proof.yml` | pull_request | Pre-merge `BEGIN..ROLLBACK` migration proof (§32.a) |
| `security-audit.yml` ("Security Audit") | pull_request + push | Security audit gate |

Repo: **`mrmogulmaker-bot/paige-agent-ai`** (✅ this is the accessible repo for GitHub MCP; a
`mrmogulmaker/paige-agent-ai` path is **not** configured for the session). Default branch `main`.
`GITHUB_TOKEN`, `GITHUB_REPO` also appear as edge secret names (Paige→GitHub seam).

---

## MCP servers (this session)

- **Supabase MCP** — project `xygzykjyynhzqytbqnzu`; used for all prod queries above. ✅ connected.
- **Stripe MCP** — read; account `acct_1TvndiLUcYKxolNa`. ✅ connected.
- **GitHub MCP** — repo `mrmogulmaker-bot/paige-agent-ai`. ✅ connected.
- **ElevenLabs MCP** — ⚠ **disconnected** this session (voice facts sourced from repo instead).
- No `.mcp.json` committed in-repo (✅ checked) — MCP wiring is session/host-level, not repo config.
- Other connectors surfaced but **not authorized** this session (OAuth required, non-interactive):
  Cloudflare, Courtroom5, Jotform, Lovable AI, Paige_Agent_AI, PayPal — ⚠ unavailable until authorized.

---

## Other third-party integrations (secret NAMES only — ✅ grep `Deno.env.get`)

Grouped by domain; these are the env-var **names**, evidence the integration exists in the edge layer.
Values intentionally omitted.

- **LLM / model router (§14/§34):** `ANTHROPIC_API_KEY`, `OPENAI_BASE_URL`, `GROQ_BASE_URL`,
  `FEATHERLESS_BASE_URL`/`FEATHERLESS_CHEAP_MODEL`, `GEMINI_BASE_URL`/`GEMINI_IMAGE_MODEL`,
  `VOYAGE_API_KEY` (voyage-3 embeddings, §26). LangGraph bridge: `LANGGRAPH_API_KEY`/`_BASE_URL`,
  `LANGGRAPH_BRIDGE_API_KEY`/`_URL`, plus `PAIGE_OS_*` bridge keys/URLs.
- **Image / 3D generation (Studio):** `REPLICATE_BASE_URL`, `IDEOGRAM_BASE_URL`, `MESHY_BASE_URL`,
  `STUDIO_REPLICATE_IMAGE_MODEL`, `STUDIO_REPLICATE_3D_MODEL`, `LOVABLE_API_KEY`/`LOVABLE_SEND_URL`.
- **Visual critique (§33):** `VISUAL_RENDERER_URL`, `VISUAL_RENDERER_SECRET`,
  `STUDIO_VISUAL_CRITIQUE_ENABLED`, `STUDIO_CRITIQUE_MAX_ITERATIONS`, `STUDIO_CRITIQUE_COST_CAP_USD`.
- **Email:** `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, plus from-address names
  `PLATFORM_DEFAULT_EMAIL_FROM`, `BILLING_EMAIL_FROM`, `WELCOME_EMAIL_FROM`, `CALENDAR_EMAIL_FROM`,
  `PLATFORM_SUPPORT_EMAIL`.
- **Calendars / meetings:** Google (`GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`, `CALENDAR_ENCRYPTION_KEY`,
  `CALENDAR_OAUTH_REDIRECT_ORIGIN`, `GOOGLE_DRIVE_API_KEY`), Cal.com (`CAL_API_KEY`, `CAL_BASE_URL`,
  `CAL_WEBHOOK_SECRET`), Zoom (`ZOOM_CLIENT_ID`/`_SECRET`, `ZOOM_OAUTH_REDIRECT_URL`).
- **Accounting / banking:** QuickBooks (`QUICKBOOKS_CLIENT_ID`/`_SECRET`,
  `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`), Plaid (`PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`).
- **Credit / financial data (funding lane — per-tenant opt-in, §2):** `SMARTCREDIT_API_KEY`/
  `_WEBHOOK_SECRET`, `ISOFTPULL_API_KEY`/`_WEBHOOK_SECRET`/`ISOFTPULL_ENABLED`, `ARRAY_API_KEY`/
  `ARRAY_APP_KEY`, `NAV_API_KEY`/`NAV_PARTNER_ID`, business bureaus (`EQUIFAX_BUSINESS_API_KEY`,
  `EXPERIAN_BUSINESS_API_KEY`, `TU_BUSINESS_API_KEY`/`_MEMBER_CODE`, `DNB_API_KEY`/`_SECRET`,
  `LEXISNEXIS_USER`/`_PASSWORD`/`_BUSINESS_ENDPOINT`, `OPENCORPORATES_API_KEY`), `LENDFLOW_ENABLED`,
  `FRED_API_KEY`, `SSN_ENCRYPTION_KEY`.
- **Enrichment / research:** Apollo (`APOLLO_API_KEY`), Firecrawl (`FIRECRAWL_API_KEY`),
  Browserbase (`BROWSERBASE_API_KEY`/`_PROJECT_ID`).
- **Docs / signing:** DocuSign (`DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`,
  `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_BASE_URI`, `DOCUSIGN_RSA_PRIVATE_KEY`, `DOCUSIGN_WEBHOOK_HMAC_KEY`).
- **Social / ads:** Meta (`META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`, `META_DEFAULT_PAGE_ID`,
  `META_IG_BUSINESS_ID`, `META_WEBHOOK_VERIFY_TOKEN`).
- **Notifications:** Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_DEFAULT_ADMIN_CHAT_ID`), Web Push
  (`VAPID_PUBLIC_KEY`/`_PRIVATE_KEY`/`_SUBJECT`).
- **Observability:** Sentry (`SENTRY_DSN`), PostHog (`POSTHOG_API_KEY`/`POSTHOG_HOST`).
- **Zapier bridge:** `call-zapier-action` edge fn (Paige→Zapier). Platform/bridge keys:
  `PAIGE_MCP_PLATFORM_KEY`, `PAIGE_BRIDGE_API_KEY`, `PAIGE_OS_CLAUDE_PLATFORM_KEY`.
- **Misc app config:** `APP_PUBLIC_URL`, `PUBLIC_SITE_URL`, `PAIGE_APP_ORIGIN`,
  `EVAL_COST_CAP_USD`/`EVAL_MAX_CASES` (§34 L2 evals), `SLA_WATCHER_CRON_SECRET`,
  `COMMS_LEGACY_DUAL_WRITE`.

*(This is the inventory of integration **existence**, not an endorsement that each is configured/live.
A name here proves the edge code references it; it does not prove the secret is set on prod.)*

---

*Regenerate the verified rows whenever infra changes; any config-touching PR updates this file in the
same commit (§BRAIN.3). Never paste a secret value — if you need to prove a secret is set, cite the
deploy/CI check, not the value.*
