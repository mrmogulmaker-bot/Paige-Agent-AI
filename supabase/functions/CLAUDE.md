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

**Account / number / service (owner-confirmed):**
- Twilio account: **"Paige Agent AI LLC"** (the operator account — distinct from the platform
  MASTER creds used to provision tenant *subaccounts*, and from any tenant's own subaccount).
- A2P phone: **+1 (470) 200-3444**.
- Messaging Service: **"Low Volume Mixed A2P Messaging Service"** — outbound SMS is sent
  through its `MG…` SID (A2P best-practice), **NEVER a raw `From:` number**.
- Voice webhook: currently on the **Twilio demo URL**; it is re-pointed in slice **4c.2**
  (voice inbound). Leave the voice demo webhook alone — this slice is SMS-only.

**Supabase secret NAMES (owner pastes the VALUES; code references only the NAMES, §34):**
- `TWILIO_OPERATOR_ACCOUNT_SID` — `AC…` operator account (URL path + legacy Basic-auth username).
- `TWILIO_OPERATOR_MESSAGING_SERVICE_SID` — `MG…` the Messaging Service outbound sends through.
- `TWILIO_OPERATOR_API_KEY_SID` / `TWILIO_OPERATOR_API_KEY_SECRET` — preferred API-Key auth
  (Basic-auth username = `SK…`, password = secret).
- `TWILIO_OPERATOR_AUTH_TOKEN` — fallback Basic-auth password AND the secret Twilio signs
  inbound webhooks with (X-Twilio-Signature validation). **Set this** so the inbound handler
  can enforce signature validation instead of accepting-unsigned.
These are **operator-scoped and independent** of the platform `TWILIO_*` master creds — the
operator seam never falls back to master creds (§9 clean seam).

**Edge functions:**
- **Sender:** `paige-operator-sms-send` — owner-gated (`is_platform_owner()` derived from the
  JWT, never the body), sends via `sendOperatorSms` (Messaging Service SID), persists the
  outbound message to `operator_messages` / `operator_conversations`. `verify_jwt` = default
  true.
- **Inbound:** `paige-operator-sms-inbound` — `verify_jwt = false` (Twilio sends no JWT);
  validates `X-Twilio-Signature` with the operator Auth Token BEFORE trusting the payload,
  then threads the inbound message. Set its Twilio webhook to:
  `https://xygzykjyynhzqytbqnzu.supabase.co/functions/v1/paige-operator-sms-inbound`
- Shared seam: `_shared/operator-twilio.ts` (reuses `_shared/twilio.ts` `sendSms` +
  `validateTwilioSignature` — §18 one home; no forked HTTP or signature code).
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
