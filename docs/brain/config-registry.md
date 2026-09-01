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
| Migrations applied on prod | **764** | ✅ MCP `SELECT count(*) FROM supabase_migrations.schema_migrations` (2026-08-09) |
| Latest applied migration | `20260813000000` | ✅ MCP `SELECT max(version)` — matches repo's latest `.sql` (zero drift); incl. #408/#409 |
| Repo migration files | 764 `.sql` | ✅ `ls supabase/migrations/*.sql \| wc -l` |
| Edge functions | **243** dirs excl. `_shared/` | ✅ `ls -d supabase/functions/*/ \| grep -v _shared` |
| Tenants | 11 (10 `standalone`, 1 `agency`) | ✅ MCP `SELECT account_type, count(*) FROM tenants GROUP BY 1` |

**Config/settings tables present on prod** (✅ MCP `information_schema.tables ~ 'config|setting|platform_'`):
`admin_app_settings`, `app_settings_owner`, `outbound_webhook_configs`, `paige_config`,
`paige_telegram_config`, `platform_api_keys`, `platform_email_settings`, `platform_invites`,
`platform_invoices`, `platform_legal_profile`, `platform_metered_events`(+`_dead_letter`),
`platform_metering_reconciliation`, `platform_mrr_snapshot`, `platform_number_pricing`,
`platform_phone_numbers`, `platform_subscription_plans`, `platform_subscriptions`,
`platform_usage_events`, `staff_calendar_settings`.

**Platform alerting substrate** (A1, migration `20260922000000`, 2026-08-20 — ✅ §32.b rollback-proved on
prod pre-merge; ✅ §32.a persisted-apply CONFIRMED post-merge: `schema_migrations` carries
`20260922000000`, all three tables exist on prod, all three report `relrowsecurity` AND
`relforcerowsecurity`):
`paige_alert_signal` (signal catalogue, config-as-data), `paige_alert_rule`, `paige_alert_firing`.
All three RLS **ENABLED + FORCED**, every policy gated on `is_platform_operator()` (§53 — the delegated
operator tier, NOT the frozen `is_platform_owner()`). `service_role` holds ALL on each — granted up front
because the systems-check family shipping WITHOUT them produced a runtime `permission denied` that the
rollback proofs structurally could not catch (they run as owner, not service_role; hotfix #94).
Five seeded signals; **`migrations.drift` ships `is_readable = false` on purpose** — an edge function
cannot read git, so a rule bound to it must report "never evaluated", never a pass.

**Platform alerting evaluator** (A2, migration `20260923000000` + edge function `alerting-evaluate`,
2026-08-20 — ✅ §32.b rollback-proved on prod pre-merge). Adds `paige_alert_rule.condition_met_since`
(episode bookkeeping — what makes `for_minutes` meaningful and firing edge-triggered, at most once per
episode) and a `pg_cron` job **`alerting-evaluate`** on `*/5 * * * *` that pokes the function via
`net.http_post` with `public.cron_token_header()` — the SAME poke shape as the systems-check operator
schedule (§18, one convention). The function is `verify_jwt = false` in `config.toml` so the cron poster
can reach it, and fails closed in-function to an internal caller (service-role bearer OR `x-cron-token`)
or an operator JWT (`is_platform_operator()`, §53).

**A2 carries a §13 catalogue correction, recorded rather than quietly patched.** A1 seeded
`llm.failover_rate` as readable; it is NOT — `paige_llm_trace` has no failover marker (its columns are
`status`, `error_class`, `provider`, `model`, `tier`), verified against the live schema. A2 flips that
signal to `is_readable = false` with the reason in its `notes`, and registers **`llm.error_rate`** —
which the schema genuinely supports — as its own key. Pointing the existing key at an error rate would
have shipped a number whose name says one thing and whose value means another.

**A2 writes firings and does NOT deliver them.** Every firing lands `delivery_status = 'pending'`;
delivery is A3 and routes through `_shared/channel-adapters.ts` (§18 — the existing single home for
multi-channel delivery). A fire is not a delivery.

**Core Supabase edge secret NAMES** (✅ grep `Deno.env.get`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. Deploy auth uses the `SUPABASE_ACCESS_TOKEN` **repo secret** (per
`supabase/functions/CLAUDE.md`; ⚠ presence not re-verified this session — CLAUDE.md asserts it is set).

**⚠ In-flight, not deployed (2026-08-31) — Solo Team management:** local branch adds the JWT-verified
`solo-team-invitations` edge function, the `get_solo_team_workspace` / work-profile / permission /
invite / acceptance RPC family, and `get_paige_team_context`. The browser receives no raw invite token;
the invitation function invokes the existing `send-portal-invite` function server-side. Migration
apply, function deployment, email delivery and authenticated tenant behavior are UNVERIFIED.

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

## Signup / onboarding / provisioning (✅ code + migration-verified 2026-08-09)

- **Signup verification = EMAIL only.** `src/pages/PublicSignup.tsx` uses email verification
  (`CommunicationsConsent … showSms={false}`, "click it to verify your account"). **SMS/phone
  verification is NOT wired into the signup flow** — the `input-otp` primitive exists and OTP is used
  for Auth/MFA, but signup doesn't use it. **SMS phone-verify itself DOES exist** for notification
  opt-in: `send-sms-verification` + `verify-sms-code` edge fns + `sms_verifications` table, wired in
  `NotificationsSettings.tsx`. *(So "do we have SMS verify?" = yes for notifications, no for signup —
  see `decision-log.md` → "Known-unbuilt / spec-only status.")*
- **`signup_intake` table** — migration `20260810000000_signup_flow_reorder_intake.sql` (PR #404,
  onboarding-before-checkout reorder). Consumers: `stripe-webhook`, `WorkspaceProvisioner.tsx`.
- **Acceptance/completion gate** — migration `20260714013653_signup_completion_gate.sql`; client guard
  `src/components/auth/RequireCompleteSignup.tsx` (wraps `/app/*`). Deferred provisioning + restored
  signup trigger landed in #402; concurrency-safe entitlements + `user_subscriptions` unique in #403
  (repairs the latent stripe-webhook subscription-record bug).

## Tenant classification & revenue integrity (§29/#412 merged · §31/#415 in-flight)

**Three ORTHOGONAL axes on a tenant — never conflate them** (✅ code + migration + MCP-verified 2026-08-09):

| Axis | Where | Values | Who sets it |
|---|---|---|---|
| **Topology** | `tenants.account_type` | `standalone` · `sub_account` · `agency` · `enterprise` | provisioning; §51-locked |
| **Lifecycle** | `tenants.status` (enum) | `trial` · `active` · `past_due` · `canceled` · `suspended` | billing/lifecycle |
| **Revenue-class** | `tenant_revenue_classification.revenue_class` (dedicated operator-only table, #412) | `promotional` · `paid` · `internal_test` | operator; default `promotional` |

- **Why revenue-class is a SEPARATE table, not a `tenants` column** (§9/§18/§51): a column on `tenants` would (a) be read by every tenant member via `Members read own tenant` RLS (operator-internal leak) and (b) collide with the §51-locked `account_type`. So it lives in `tenant_revenue_classification`, RLS `is_platform_owner()`-only + FORCE. Read seams: `get_tenant_revenue_breakdown()` (operator RPC), `operator_dashboard_metrics` (reconciled to `revenue_class='paid'` only, #412).
- **§51 ABSOLUTE INVARIANT (DB-locked, migration `20260807230000`):** a child (`parent_tenant_id` not null) can NEVER be `agency`/`enterprise` — enforced 3 layers deep (`tenants` CHECK `tenants_subaccount_not_agency` · `agency_team_members` trigger · `agency_current_id()` both branches). Do not weaken without an owner ruling.
- **Current prod distribution** (✅ MCP, 2026-08-09, post-#412): **9 tenants** — `promotional 8`, `internal_test 1`, **`paid 0`**. (Was 11 before #412 deleted 2 retired tenants — supersedes the "Tenants 11" row in the Supabase section above.) **Real ARR = $0** — every tenant is comped/internal; the 3 live `platform_subscriptions.status='active'` rows are comped (NULL `stripe_subscription_id`).
- **"Real revenue" / paid definition (one canonical form across surfaces):** `revenue_class='paid'` AND a live Stripe subscription (`status='active'` + non-null `stripe_subscription_id`). Used by `get_tenant_revenue_breakdown().paying_count` (#412) and the #31 gate below.

**⚠ Revenue integrity chain — IN-FLIGHT (PR #415, task #31, owner §32.c-gated — NOT yet on main):**
- Migration `20260815120000_revenue_integrity_chain.sql` adds a fail-closed trigger `enforce_revenue_integrity_chain()` on `tenant_revenue_classification`: a row may only be MINTED `revenue_class='paid'` when the tenant owner has a **subscriber** agreement in `legal_acceptances` (slug in `subscriber_agreement_slugs()` = `saas-standalone`/`saas-agency`/`saas-enterprise`) AND a live active Stripe sub. Enforced at the transition; already-paid rows aren't re-gated (no auto-demote — reconcile follow-up, task #85).
- Audit seam: `operator_revenue_integrity_audit(_tenant_id)` — `is_platform_owner`-gated RPC (RAISES 42501); Fleet Console "Revenue Integrity" section + CSV export consume it (§10/§18 one home).
- Verified §32.b against the verbatim file (COMPILE PASS + reject/accept/edit), §37 producer-inventory clean, §39 + §5 both passed. Marked in-flight per §BRAIN — move to a "merged" fact when PR #415 lands on main.

## Twilio (SMS / voice — last-mile telecom commodity, §34)

**Platform-wide Twilio secret NAMES** (✅ grep `Deno.env.get`): `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_FROM`,
`TWILIO_PHONE_NUMBER`, `TWILIO_STATUS_CALLBACK_URL`, `TWILIO_MESSAGING_SERVICE_SID` (referenced),
`VOICE_TWIML_URL`, `VOICE_STT_STREAM_URL`, `VOICE_STREAM_SECRET`.

**Sending pattern** (✅ `_shared/bookingNotify.ts`): `TWILIO_FROM` falls back to `TWILIO_PHONE_NUMBER`;
messages sent E.164-normalized.

**⚠ Auth model — prod uses the API-Key TRIO, NOT the account Auth Token** (✅ `_shared/twilio.ts`
`masterCreds()` + comment `:242-244`): master requests authenticate Basic-auth with **username =
`TWILIO_API_KEY_SID` (SK…), password = `TWILIO_API_KEY_SECRET`**, URL path addressing
`TWILIO_ACCOUNT_SID`. **`TWILIO_AUTH_TOKEN` is a LEGACY fallback the code says prod does NOT carry** —
do not assume it is set just because SMS/voice work (they run on the API-Key trio). It matters for one
thing: **inbound webhook `X-Twilio-Signature` validation** needs the account Auth Token, so the operator
inbound fn may still owe `TWILIO_OPERATOR_AUTH_TOKEN` (or `TWILIO_AUTH_TOKEN`) — see operator note below.

**Live tenant phone numbers on prod** (✅ MCP `SELECT phone_number, source, status FROM
tenant_phone_numbers`): `+14705177009` (source `marketplace`, active) and `+14705706068` (source
`marketplace`, active). **Both marketplace-provisioned.**

### Twilio ISV / Reseller Architecture (✅ `_shared/twilio.ts`, `provision-tenant-twilio`, code-verified 2026-08-09)

**Paige is a Twilio ISV/RESELLER, NOT a BYO-Twilio host.** There is ONE platform **master** Twilio
account; each tenant gets its **own Twilio SUBaccount minted under that master**. Tenants never bring
their own Twilio and never see the word "Twilio" — they search an area code and click Buy. *(A prior
session wrongly proposed a "tenant BYO-Twilio" pattern — that is contradicted by every file below; do
not re-propose it.)* Module header `_shared/twilio.ts:24-35` states the model explicitly.

| Plane | Home (code + table) |
|---|---|
| **Subaccount provisioning** | `supabase/functions/provision-tenant-twilio/` (super-admin-only, `is_platform_owner()`) — mints a subaccount, mints a subaccount-scoped API Key, vaults the secret, mints the TwiML voice app; `adopt` mode reconciles orphans. Wrappers in `_shared/twilio.ts`: `createSubaccount()`, `createSubaccountApiKey()`, `ensureTwimlApp()`. Table **`tenant_twilio_subaccounts`** (1-per-tenant: `twilio_subaccount_sid`, `api_key_sid` SK…, `auth_token_vault_ref`, `twiml_app_sid`, `status`). |
| **Number search + purchase** | `comms-search-numbers` + `comms-purchase-number` (JWT-gated; tenant server-derived) → buys into the tenant's OWN subaccount → records **`tenant_phone_numbers`** (`source='marketplace'`). UI `src/components/admin/comms/NumbersTab.tsx`. Resale price in **`platform_number_pricing`** (§38: Twilio wholesale + flat $0.05 Paige-held fee). ⚠ **charge leg NOT wired** — `comms-purchase-number` returns `charge_wired:false` (honest, §13). |
| **A2P 10DLC registration** | UI EXISTS: `src/components/admin/comms/A2PTab.tsx` — coach fills a brand form, **Paige drafts the campaign copy** (`comms-a2p-draft`), coach approves, `comms-a2p-submit` persists. Table **`tenant_a2p_registrations`**. ⚠ **carrier/TrustHub submit NOT wired** — `createBrand()`/`createCampaign()` in `_shared/twilio.ts` are honest `needs_config` stubs (never a fabricated SID); `comms-a2p-submit` returns `a2p_submit_wired:false`, status stays `pending`. **This is the Wave 4c.2 prereq gap — the gap is the live carrier submit, NOT the UI.** |
| **Credential resolution** | `masterCreds()` / `masterBasicAuthHeader()` (master, API-Key trio) and `resolveTwilioCreds(admin, tenantId)` (per-tenant subaccount — reads `tenant_twilio_subaccounts`, decrypts the subaccount API-Key secret via the `read_channel_secret` SECURITY-DEFINER Vault RPC; service-role only). All in `_shared/twilio.ts`. |

**Operator (God/Super-Admin) SMS surface — REUSES the existing master Twilio account (PR #408 MERGED
2026-08-09, `2ee92903`):**
- The operator SMS surface does **NOT** require new `TWILIO_OPERATOR_*` account secrets. It **reuses the
  platform's EXISTING master Twilio account** (resolved via `masterCreds()`, §18 one home; shared seam
  `_shared/operator-twilio.ts`). Surface `/admin/platform/fleet-communications`
  (`PlatformFleetCommunications.tsx`); store `operator_conversations`/`operator_messages` (owner-only
  RLS, no `tenant_id`). **§32.a confirmed on prod:** migration `20260812000000` persisted, both tables
  exist. *(Supersedes the earlier framing of new `TWILIO_OPERATOR_*` secrets — that was wrong; see
  `lessons-learned.md` → "Assumed unprovisioned.")*
- **Two possibly-owed secrets (both fail-closed/degrade safely until pasted):**
  1. **A2P Messaging Service SID** — `TWILIO_OPERATOR_MESSAGING_SERVICE_SID` (or `TWILIO_MESSAGING_SERVICE_SID`),
     `MG…` for "Low Volume Mixed A2P Messaging Service". Operator send goes via the MG SID, never a raw
     `From:` — without it the send degrades to `needs_config` (`operator_messaging_service_not_configured`).
  2. **Inbound signing token** — `TWILIO_OPERATOR_AUTH_TOKEN` (or `TWILIO_AUTH_TOKEN`), the account Auth
     Token Twilio signs inbound webhooks with. Per `masterCreds()`, prod authenticates OUTBOUND with the
     API-Key trio and does NOT rely on a raw Auth Token, so its presence can't be assumed — the inbound
     fn **FAILS CLOSED** (401, nothing written) if no token resolves. ⚠ Confirm which of the two applies
     during activation.
- Operator A2P config — account **"Paige Agent AI LLC"** (⚠ vendor/Twilio account name — pending rename to Paige Agent AI Inc., owner-owed), operator number **+1 (470) 200-3444**. Voice
  webhook currently on the Twilio demo URL (re-point scheduled slice 4c.2).
- **⚠ Live-data note:** +1 470 200 3444 is referenced in `main` source comments as the Super Admin's
  imported number, but that `tenant_phone_numbers source='imported'` row is **not present in prod today**
  (only the two `marketplace` numbers above exist). Confirm provisioning state during operator SMS activation.

---

## Voice / TTS / STT (ElevenLabs + fallbacks)

**⚠ ElevenLabs MCP is disconnected this session** — facts below are verified from **repo source**, not
from the ElevenLabs API.

**Platform default voice — ON RECORD, do NOT re-ask (§200 owner-locked, §BRAIN.2):**
- **`DEFAULT_TTS_VOICE` is now `0S5oIfi8zOZixuSj8K6n` ("Ivanna")** — owner-ruled 2026-08-09, merged in
  **PR #409 (commit `1e726426`)**. This is a **settled decision on record**; it must NOT be re-surfaced
  as an open question (see `lessons-learned.md` → "Re-ruled a settled decision"). §200 owner-locked.
  *(Sourced from the PR #409 ruling relayed by the coordinator 2026-08-09; ⚠ confirm the exact
  `tts-router.ts` constant on the next repo pull into this brain, per §BRAIN.3.)*
- `6aDn1KB0hjpdcocrUkmq` ("Warm") is now a **selectable alternate**, no longer the default. Other
  alternates: `g6xIsTj2HwM6VR4iXFCw` ("Clear", backup female), `vBKc2FfBKJfcZNyEt1n6` ("Deep", male).
  (Voice IDs are non-secret identifiers.)
- `_shared/elevenlabs.ts`: `DEFAULT_VOICE = Deno.env.get("ELEVENLABS_VOICE_ID") ?? "21m00Tcm4TlvDq8ikWAM"`
  (Rachel — generic fallback for the legacy path only). **This is the only path that honors the
  `ELEVENLABS_VOICE_ID` edge secret.** OpenAI TTS is the honest degrade fallback (comment cites §13/#579).
- Model comes from `_shared/model-router.ts` `voiceCell` → `elevenlabsTts` (`eleven_multilingual_v2`).

**ElevenLabs secret NAMES** (✅ grep): `ELEVENLABS_API_KEY` (the auth key — accessed via the
case-insensitive `envKey("ELEVENLABS_API_KEY")` helper, so a raw `Deno.env.get` grep misses it; real
refs `elevenlabs.ts:23`, `tts-router.ts:186`, `model-router.ts:449/454`), `ELEVENLABS_VOICE_ID`,
`ELEVENLABS_MODEL`, `ELEVENLABS_BASE_URL`.

**Three independent voice systems** (✅ code-verified; the trap: they are NOT the same knob — a prior
session "fixed" the wrong one). Full detail in CLAUDE.md → "Voice Configuration"; the quick table:

| System | Entry | Voice / model | Reads `ELEVENLABS_VOICE_ID`? | Wired in app? |
|---|---|---|---|---|
| **1. In-app chat Direct-TTS** (what the owner hears) | `paige-tts` → `_shared/tts-router.ts` | `PRIMARY_ELEVENLABS_VOICE`/`DEFAULT_TTS_VOICE` = **`0S5oIfi8zOZixuSj8K6n` (Ivanna)**, `eleven_multilingual_v2`; OpenAI `nova` fallback | **NO** (hardcodes the constant) | ✅ YES |
| **2. Studio voiceover** | `_shared/elevenlabs.ts` via model-router `voiceCell` | `ELEVENLABS_VOICE_ID` ?? `21m00Tcm4TlvDq8ikWAM` (Rachel) | **YES** (only path that does) | ✅ Studio-VO lane only |
| **3. ConvAI agent** (phone) | agent `agent_1601k7…` | Ivanna + `eleven_turbo_v2_5` (per docs) | N/A | **❌ UNWIRED** (ConvAI removed #170; agent id appears only in docs, never in `src/`/`supabase/`) |

**ConvAI voice-leak lesson (PR #409, MERGED 2026-08-09, commit `1e726426`):** the TTS path does
**not** read the ElevenLabs ConvAI agent — updating a ConvAI agent's voice has **no effect** on
Paige's spoken voice (the ConvAI stack was removed in #170 / §49 Wave A). The authoritative voice knob
is `DEFAULT_TTS_VOICE`/`PRIMARY_ELEVENLABS_VOICE` in `tts-router.ts` (hardcoded — now `0S5oIfi8zOZixuSj8K6n`
Ivanna) and `ELEVENLABS_VOICE_ID` (only for the `elevenlabs.ts` legacy path). #409 also persisted a
"Voice Configuration" section to CLAUDE.md. See `lessons-learned.md` → "voice live-drive trap."

**Voice feature-flag / cost secret NAMES** (✅ grep): `VOICE_COPILOT_ENABLED`,
`VOICE_COPILOT_COST_CAP_USD`.

---

## Repo-local agent config (`.claude/`)

`.gitignore` ignores `.claude/*` and then NEGATES the parts that are shared, so session-local
state stays out while shared assets are versioned. Two negations exist:

| Path | Why it is versioned |
|---|---|
| `!.claude/commands/` | Shared project commands (e.g. `/edge-drift`) — "so every session (and every teammate) gets them" |
| `!.claude/skills/` | Holds `README.md` plus **our own** `knowledge-closeout/` skill — the repo close-out procedure (§0/§BRAIN.3/§66), versioned so it loads on every fresh container (§64). The third-party §69 skill (`flow-by-flow` + its sibling `flow-prototype`) is **NOT vendored** — its bundle ships no `LICENSE`, and the MIT notice can neither be fetched nor reconstructed without inventing a copyright holder, so redistribution is blocked pending an owner decision. **Corrected 2026-09-01:** an earlier revision claimed the account-synced install delivers `SKILL.md` only and left §69 half-installed. It does not — the synced `SKILL.md` inlines every `references/*.md` and the template (77 KB) and is self-contained, so a fresh container gets the complete skill. What the snapshot lacks is our 2026-09-01 close-out addition, which is why that now ships as the repo-local skill instead |

Contains **no secrets** — these are markdown process documents, and **no third-party content**:
`.claude/skills/` holds `README.md` and our own `knowledge-closeout/SKILL.md`. (An earlier revision of #708 vendored the two
MIT bundles with an assembled `LICENSE`; both, and a `PROVENANCE.md`, were removed before merge
because the notice could not be obtained without inventing a copyright holder. Those paths do not
exist — do not follow references to them.)

## GitHub Actions / CI (✅ `.github/workflows/`)

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | pull_request + push | Typecheck/build/lint/test gate |
| `deploy-migrations.yml` | push (to `main`) | `supabase db push` → `migration list` verify → moves `db-live` tag (§32 persisted-apply) |
| `deploy-edge-functions.yml` | push (to `main`) | Deploys only changed functions (follows `_shared` imports via `.github/scripts/edge-affected.py`); moves `edge-live` tag (§24) |
| `migration-lint.yml` | pull_request | Migration shape lint (§208/§213) |
| `premerge-migration-proof.yml` | pull_request | Pre-merge `BEGIN..ROLLBACK` migration proof (§32.a) |
| `security-audit.yml` ("Security Audit") | pull_request + push | Security audit gate |

**RLS anon/cross-tenant-reach drift guards (npm scripts wired into `ci.yml`):**

| Script | Guards | Added |
|---|---|---|
| `lint:views` | Fails any migration that lets a VIEW drift to `security_invoker=off` (the #116 11-view anon/cross-tenant leak class). | PR #447 / §9 P0 #116 |
| `lint:definer-fns` (`scripts/ci/definer-fn-lint.mjs`) | Fails any migration granting a new public `SECURITY DEFINER` function to `anon`/`PUBLIC` without an inline `-- definer-anon-exempt: <reason>` escape (the #117 owner-bypass fn class). Sibling of `lint:views`. | PR #448 / §9 P0 #117 |

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
  `FEATHERLESS_API_KEY`, `FEATHERLESS_BASE_URL`, `FEATHERLESS_DEFAULT_MODEL` (primary open-flexible
  slug override; back-compat alias `FEATHERLESS_CHEAP_MODEL`), `FEATHERLESS_MODEL_<KIND>` (per-job-kind
  overrides), `GEMINI_BASE_URL`/`GEMINI_IMAGE_MODEL`, `VOYAGE_API_KEY` (voyage-3 embeddings, §26).
  LangGraph bridge: `LANGGRAPH_API_KEY`/`_BASE_URL`, `LANGGRAPH_BRIDGE_API_KEY`/`_URL`, plus
  `PAIGE_OS_*` bridge keys/URLs.
  - Featherless plan: **"Feather Per-Request" DEVELOPER** ($50/mo credit, per-request billing, NO
    model-size cap) subscribed 2026-08-10 → open-flexible default is `meta-llama/Llama-3.3-70B-Instruct`
    (allow-listed). Cheap-tier §34 economics restored; Claude remains the frontier/rescue tier.
- **Image / 3D generation (Studio):** `REPLICATE_BASE_URL`, `IDEOGRAM_BASE_URL`, `MESHY_BASE_URL`,
  `STUDIO_REPLICATE_IMAGE_MODEL`, `STUDIO_REPLICATE_3D_MODEL`.
- **`LOVABLE_API_KEY` / `LOVABLE_SEND_URL` (§34 — scoped for removal, task #112):** post-PR #442 these
  are used by ONLY the live **email trinity** (`auth-email-hook` + `process-email-queue` +
  `handle-email-suppression` — `@lovable.dev` HMAC-signing + email DELIVERY) + `preview-transactional-email`
  (caller-auth) + `ship-26-legacy-cleanup` (Drive-push). The Paige chat + the 16 credit/subagent fns NO
  LONGER reference Lovable (purged in #442 — they always ran on direct-Anthropic via `gatewayCompat`). Do
  NOT assume the chat touches Lovable (§10 corrections log 2026-08-10). Removing these is a launch-critical
  email-provider migration (owner-set replacement secret + §32 live-email verify) — see task #112.
- **Visual critique (§33):** `VISUAL_RENDERER_URL`, `VISUAL_RENDERER_SECRET`,
  `STUDIO_VISUAL_CRITIQUE_ENABLED`, `STUDIO_CRITIQUE_MAX_ITERATIONS`, `STUDIO_CRITIQUE_COST_CAP_USD`.
- **Paige browser — self-hosted headless browser (Task #126, §32.c self-verify + §17 public-web browse):**
  edge secret NAMES `PAIGE_BROWSER_URL` + `PAIGE_BROWSER_SECRET` (skill-runner → the Fly host's
  `/self-verify` and `/browse-public-url`; unset → honest `needs_config`, §13). Fly-side (on the
  `paige-browser` app, NOT edge): `PAIGE_BROWSER_SHARED_SECRET` (must equal the edge `PAIGE_BROWSER_SECRET`),
  `PAIGE_BROWSER_WILDCARD_ENABLED` (`true` = wildcard public browsing ON, owner-flipped 2026-08-13),
  `PAIGE_BROWSER_MAX_CONTENT_BYTES` (default 500000). Audit rail: `paige_browser_usage` (written by the
  CALLER edge fn via service_role; the Fly host is DB-free, §9/§34).
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

### Operator act-as RPCs (Slice 2, 2026-08-20)

- `public.operator_enter_tenant(uuid)` / `public.operator_exit_tenant()` — SECURITY DEFINER,
  `SET search_path = public`, `EXECUTE` granted to `authenticated` only (REVOKEd from `PUBLIC`/`anon`).
  The grant is NOT the guard (§59): each body re-enforces `is_platform_operator()` and RAISEs 42501
  before any read or write.
- They are the ONLY audited path that changes an operator's `profiles.active_tenant_id`. The header
  `TenantSwitcher` and the Fleet Console `Enter` controls both reach them through
  `useTenantContext.switchTenant`, which routes platform staff to the RPCs and everyone else to the
  direct profile write.
- Every enter/exit writes `paige_audit_log` with `action = 'operator.tenant.enter' | 'operator.tenant.exit'`
  and `actor_role = 'platform_operator'`, in the same transaction as the scope change.
- No secret or env var is involved.

*(This is the inventory of integration **existence**, not an endorsement that each is configured/live.
A name here proves the edge code references it; it does not prove the secret is set on prod.)*

---

*Regenerate the verified rows whenever infra changes; any config-touching PR updates this file in the
same commit (§BRAIN.3). Never paste a secret value — if you need to prove a secret is set, cite the
deploy/CI check, not the value.*

### A2P legal identity ownership — draft 2026-09-01

- Tenant legal sender data is owner-confirmed in Setup and canonical in `tenant_legal_profile`.
- Full EIN/tax registration numbers are write-only from the browser and stored in Supabase Vault;
  browser reads receive only the last four digits.
- Tenant Customer Profile, Trust Product, Brand, Campaign, and Messaging Service SIDs are
  server-owned fields on the tenant's A2P registration record.
- The platform operator's Twilio Primary Customer Profile belongs to the master account and must not
  be copied into tenant subaccounts. No SID or secret value belongs in this registry.
