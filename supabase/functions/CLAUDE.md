# Edge functions — deploy runbook (auto-loads for any work in this tree)

This is a nested CLAUDE.md: it loads automatically whenever a session works on edge
functions, so the deploy mechanics never have to be re-derived. (Global efficiency
doctrine lives in the root `CLAUDE.md` §24.)

## Deploys are automatic — do NOT hand-marshal

**Edge functions deploy themselves on merge to `main`.** `.github/workflows/deploy-edge-functions.yml`
deploys exactly the functions whose bundle changed — following `_shared` imports transitively via
`.github/scripts/edge-affected.py` (a change to `_shared/claude.ts` redeploys every function that
imports it, directly or through `model-router.ts`) — and moves the `edge-live` git tag to the
deployed commit.

- **Write the code → merge to `main` → CI ships it.** Do **not** paste function source through the
  MCP `deploy_edge_function` tool to deploy — that hand-marshaling of ~60k chars per function is the
  exact expensive, error-prone step this pipeline exists to kill.
- Authenticated by the `SUPABASE_ACCESS_TOKEN` repo secret (set). If it were ever missing, the
  workflow fails loudly with instructions — it never silently no-ops.
- **Manual MCP deploy is a last resort only** (CI genuinely unavailable). If forced to, §13 binds:
  re-fetch with `mcp__Supabase__get_edge_function` and byte-diff the deployed content against the
  repo to prove fidelity before trusting it.

## Checking what's live

Run **`/edge-drift`** — a cheap `edge-live..HEAD` git diff that lists functions whose source is
ahead of prod. On `main` with CI healthy, drift is zero.

## Facts you'd otherwise re-derive

- **Project ref / `project_id`:** `xygzykjyynhzqytbqnzu` — source of truth is `config.toml`.
- **Per-function auth:** `verify_jwt` is declared per function in `config.toml`; functions not listed
  default to `verify_jwt = true`. The CLI (and this CI) read it on deploy, so each function's auth
  posture is preserved automatically — never pass `--no-verify-jwt` unless the function's config
  says `false`.
- **Shared code:** `_shared/*` files are bundled into every function that imports them. A shared-file
  change is a multi-function change — the resolver computes the full affected set; trust it over a
  hand-guess.

## The standing rule

If you catch yourself about to hand-run a multi-step deploy you (or a past session) already ran,
stop — that's the tax this pipeline ended. Merge and let CI ship it.

## Twilio Operator Configuration (§46 — so no future session re-diagnoses)

The **operator** (God/Super-Admin) Communications surface is Paige Agent AI LLC's OWN SMS
line — the platform operator texting/receiving on the platform's own number. It is **NOT**
any tenant's inbox. This is documented here (the nested edge-functions doctrine that
auto-loads for all SMS/comms/edge work) because that is exactly where a future session would
otherwise re-derive it.

**Account / number / service (owner-confirmed 2026-08-09 — REUSES the MASTER account):**
- Operator SMS is the PLATFORM's OWN outbound identity, so it sends from the **platform MASTER
  Twilio account** — the SAME account that already powers phone calls and the tenant number
  registry today. It is **NOT** a separate "operator" Twilio account, and it must **REUSE the
  existing master creds** (already in Supabase edge secrets) — no new account/auth secret is
  pasted (§30 re-diagnosis: the master creds already exist and work).
- A2P phone: **+1 (470) 200-3444** (an imported number on the master account).
- Messaging Service: **"Low Volume Mixed A2P Messaging Service"** — outbound SMS is sent
  through its `MG…` SID (A2P best-practice), **NEVER a raw `From:` number**. The existing
  platform SMS path sends from a raw `From`/`TWILIO_PHONE_NUMBER` (tenant sends resolve their
  MG SID per-tenant from `tenant_a2p_registrations`, NOT from an env), so there is **no master
  MG env to reuse** — the operator MG SID is the ONE genuinely-new secret (see below).
- Voice webhook: currently on the **Twilio demo URL**; re-pointed in slice **4c.2**. Leave it
  alone — this slice is SMS-only.

**Supabase secret NAMES (code references only the NAMES, §34):**
- **REUSED master creds — ALREADY set, no new paste** (resolved via `masterCreds()`, §18 one home):
  - `TWILIO_ACCOUNT_SID` — `AC…` master account (URL path + legacy Basic-auth username).
  - `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET` — preferred API-Key auth (username = `SK…`,
    password = secret). This is the trio the master OUTBOUND path uses today.
- **Up to TWO possibly-owed secrets the owner may still need to paste:**
  1. **A2P Messaging Service SID** — `TWILIO_OPERATOR_MESSAGING_SERVICE_SID` (preferred) or generic
     `TWILIO_MESSAGING_SERVICE_SID` — `MG…` for the "Low Volume Mixed A2P Messaging Service". The
     master OUTBOUND config sends via raw `From`, so it does NOT already cover A2P Messaging-Service
     sending. Until it is set, the operator send degrades to `needs_config`
     (`operator_messaging_service_not_configured`) — never a raw-From A2P violation (§13).
  2. **Inbound signing token** — `TWILIO_OPERATOR_AUTH_TOKEN` (preferred) or `TWILIO_AUTH_TOKEN`
     — the account Auth Token Twilio signs inbound webhooks with (`X-Twilio-Signature`
     validation). HONEST CAVEAT (§13/§39): the master path validated here authenticates OUTBOUND
     with the **API-Key trio**, and `_shared/twilio.ts` (owner-confirmed 2026-07-27) notes prod
     intentionally does NOT rely on a raw `TWILIO_AUTH_TOKEN` for its sends — so we must NOT assume
     an account Auth Token is already present in edge secrets just because outbound works. If
     `TWILIO_AUTH_TOKEN` is in fact set on prod, inbound validation already works with no new paste;
     if it is not, the owner pastes `TWILIO_OPERATOR_AUTH_TOKEN` (the account Auth Token from the
     master account's console). Either way the inbound function **FAILS CLOSED** (401, nothing
     written) when no token resolves — it never trusts an unsigned payload — so a missing token is a
     safe degrade, not a security hole. Confirm which of the two applies during the activation runbook.
- **Optional operator OVERRIDES (only used if explicitly set — for a future dedicated operator
  account):** `TWILIO_OPERATOR_ACCOUNT_SID` / `_API_KEY_SID` / `_API_KEY_SECRET` / `_AUTH_TOKEN`.
  When a full override trio is set it wins; otherwise the master creds are used.

**Edge functions:**
- **Sender:** `paige-operator-sms-send` — owner-gated (`is_platform_owner()` derived from the
  JWT, never the body), sends via `sendOperatorSms` (master creds + Messaging Service SID),
  persists the outbound message to `operator_messages` / `operator_conversations`. `verify_jwt`
  = default true. Short-circuits `needs_config` BEFORE any DB write so no pre-config inbox
  artifacts appear.
- **Inbound:** `paige-operator-sms-inbound` — `verify_jwt = false` (Twilio sends no JWT);
  validates `X-Twilio-Signature` with the master `TWILIO_AUTH_TOKEN` (or the operator override)
  BEFORE trusting the payload — **FAILS CLOSED** (401, nothing written) when no token is
  resolvable, unless the dev-only `ALLOW_UNSIGNED_OPERATOR_SMS=true` flag is set. Set its Twilio
  webhook to: `https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/paige-operator-sms-inbound`
- Shared seam: `_shared/operator-twilio.ts` (reuses `_shared/twilio.ts` `sendSms`,
  `validateTwilioSignature`, AND `masterCreds` — §18 one home; no forked HTTP, signature, or
  cred-resolution code).
- Headless smoke: `scripts/operator-sms-smoke.mts`
  (`node --experimental-strip-types scripts/operator-sms-smoke.mts`).

**Data store & §9 boundary — DO NOT MERGE WITH `/admin/clients-hub/*`:**
- Operator conversations live in `public.operator_conversations` / `public.operator_messages`,
  RLS-gated to `is_platform_owner()` ONLY (no `tenant_id` column — operator-global). A tenant
  can NEVER read/write operator data; the operator surface never reads a tenant's conversations.
- This is the **OPERATOR** surface (`/admin/platform/fleet-communications`, component
  `PlatformFleetCommunications.tsx`). It was previously a bug: it scope-switched the operator
  INTO their own tenant and rendered the TENANT inbox `/admin/clients-hub/conversations` — a
  §9 operator-vs-tenant seam violation (wave-s3 fixed it). The tenant inbox
  (`/admin/clients-hub/conversations`, `ClientsConversations.tsx`, tables `messages`/`threads`)
  stays the ONE tenant comms home (§18). **Never** merge operator comms into `clients-hub`, and
  never store operator SMS in `paige_conversations` (its `tenant_id IS NULL` RLS makes NULL-tenant
  rows visible to EVERY tenant — an operator leak).
