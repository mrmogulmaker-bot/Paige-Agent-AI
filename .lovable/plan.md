
# Phase 3 — Tier 3 Connectors (Signature, Booking, Observability, Social, Enrichment)

Builds on Phase 1 (foundation) and Phase 2 (8 connectors). Strict MMA-only scope is preserved — zero credit repair / Mogul Credit / Plaid / Nav / SmartCredit / FCRA references anywhere in code or UI.

Recommended build order matches the brief: Sentry → PostHog → DocuSign → Cal.com → Apollo → Meta.

---

## 1. Database

Four new tables, all admin-scoped (service role for webhook writes). Pattern matches Phase 2: `paige_*` namespace, `updated_at` trigger, RLS, GRANTs in the same migration.

### `paige_signature_envelopes`
DocuSign envelopes tied to a contact.
- envelope_id (unique), contact_id (fk clients), envelope_type enum (`vip_app | coach_agreement | dfy_engagement | refund | term_sheet | other`)
- template_id, status enum (`sent | delivered | completed | declined | voided`)
- sent_at, signed_at, completed_pdf_url, metadata jsonb, created_by user_id

### `paige_bookings`
Cal.com bookings linked to a contact (or NULL until resolved).
- cal_event_id (unique), contact_id (fk clients, nullable), event_type enum, scheduled_at, duration_min
- status enum (`confirmed | canceled | rescheduled | no_show | completed`)
- attendee_responses jsonb, metadata jsonb

### `paige_social_posts`
Meta Graph posts (FB + IG).
- platform enum (`facebook | instagram`), platform_post_id (unique per platform), caption, media_urls jsonb
- scheduled_at, posted_at, status enum (`scheduled | posted | failed | deleted`), metrics jsonb (likes/comments/reach), created_by user_id

### `paige_enrichment_log`
Append-only Apollo enrichment ledger (history + idempotency).
- subject_type enum (`person | company`), subject_key (email or domain), contact_id (fk clients, nullable)
- provider text default 'apollo', payload jsonb, succeeded bool, error text
- Index on (subject_type, subject_key, created_at desc) for "most recent enrichment for X".

All four tables get:
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` + `GRANT ALL ... TO service_role`
- RLS `ENABLE`
- "admins manage" policy via `public.has_role(auth.uid(), 'admin')`
- service_role write policy for webhooks
- `updated_at` trigger reusing `public.update_updated_at_column()`

### Schema additions to existing tables
- `paige_config` extension: `posthog_project_url text`, `sentry_org_slug text`, `sentry_project_slug text`, `docusign_default_brand_id text`, `cal_default_event_type_id text`, `meta_default_page_id text` — all nullable, for admin UI deep-links and defaults.

### Bridge verbs (extend `BridgeVerb` union)
- `booking_created` — fires Cal booking-followup workflow
- `signature_completed` — fires VIP onboarding / DFY kickoff workflow based on envelope_type
- `social_comment_received` — routes Meta comments through CS Triage when support-shaped

All routed via existing `fireAndForgetBridge` + outbox; no new transport code.

---

## 2. Edge Functions (14)

All authenticated functions reuse `_shared/adminAuth.ts` from Phase 2 (`requireAdmin`, `corsHeaders`, `jsonResponse`). Public webhooks live in their own files with provider-specific signature verification.

### DocuSign
- `docusign-send-envelope` (admin) — body: `{ contact_id, envelope_type, template_id, prefill?: object }`. Mints JWT, calls DocuSign Envelopes API, writes a row to `paige_signature_envelopes` with status `sent`.
- `handle-docusign-webhook` (public, HMAC-verified via DocuSign Connect HMAC1 header) — updates status, stores completed PDF URL, fires `signature_completed` bridge verb when status = `completed`.

### Cal.com
- `handle-cal-webhook` (public, verifies `X-Cal-Signature-256`) — upserts `paige_bookings`, links to `clients` by attendee email, fires `booking_created` bridge verb.
- `cal-list-bookings` (admin) — proxies Cal.com REST list with status / date filters.
- `cal-cancel-booking` (admin) — cancels via Cal API and updates the row.

### Meta Graph (FB + IG)
- `meta-schedule-post` (admin) — body: `{ platform, caption, media_urls, scheduled_at? }`. Inserts row, calls Graph API.
- `meta-list-comments` (admin) — by `platform_post_id`, returns recent comments.
- `meta-get-insights` (admin) — pulls reach / engagement / impressions for a post or page summary.
- `handle-meta-webhook` (public, verifies Meta `X-Hub-Signature-256` with `META_APP_SECRET`) — incoming comments / DMs → optional `social_comment_received` bridge verb.

### Apollo
- `apollo-enrich-person` (admin) — by email, returns company + title + social, writes `paige_enrichment_log`.
- `apollo-enrich-company` (admin) — by domain, returns size + industry + funding.
- `apollo-search-people` (admin) — prospect search proxy with pagination.
- DB trigger `trg_clients_apollo_enrich` (after-insert on `clients`) calls `pg_net` to async-POST the new contact's email to `apollo-enrich-person`. Non-blocking; failures land in `paige_enrichment_log` with `succeeded=false`.

### Sentry
- `sentry-tunnel` (public, rate-limited) — DSN-style ingest endpoint Lovable can POST to so the Sentry DSN never ships in client JS. Forwards to Sentry `/envelope`.

### PostHog
- No edge function needed for client tracking (PostHog JS SDK posts direct).
- Server-side helper module `supabase/functions/_shared/posthog.ts` exposes `capture(distinctId, event, props)` used by Stripe/n8n/approval handlers to capture backend events.

### `supabase/config.toml`
Add `verify_jwt = false` for all webhook + tunnel functions:
`handle-docusign-webhook`, `handle-cal-webhook`, `handle-meta-webhook`, `sentry-tunnel`.
All others remain `verify_jwt = true`.

---

## 3. Frontend Instrumentation

- **Sentry**: `@sentry/react` initialized in `src/main.tsx` with DSN from `import.meta.env.VITE_SENTRY_DSN` (publishable, safe to ship). React Router instrumentation + error boundary wrapping `Admin` routes. `tracesSampleRate: 0.1`. Server-side Sentry SDK initialized in shared edge function helper.
- **PostHog**: `posthog-js` initialized once in `src/main.tsx` with `VITE_POSTHOG_KEY` + `VITE_POSTHOG_HOST`. `posthog.identify(user.id, { role })` in `AppShell` post-auth. Auto-capture on; manual `posthog.capture` on Approve / Send / Run Workflow / Trigger Campaign buttons.

Both instrumentations are admin-aware: only initialize when env keys are present, so dev previews without keys stay quiet.

---

## 4. Admin UI Screens

All new routes under `/admin/integrations/*` (and `/admin/observability/*`) following Phase 2 patterns. Added as tiles to the existing `IntegrationsHub.tsx`.

| Route | Page | Notes |
|---|---|---|
| `/admin/integrations/docusign` | `DocuSignConfig.tsx` | Default brand, template picker, recent envelopes list + manual "Send envelope" form |
| `/admin/signatures` | `SignaturesAdmin.tsx` | All envelopes, status filter, contact link, "Open PDF" |
| `/admin/integrations/cal` | `CalIntegrationConfig.tsx` | Default event type, webhook setup help, recent bookings preview |
| `/admin/bookings` | `BookingsAdmin.tsx` | Calendar + list view, filter by event_type, upcoming + past |
| `/admin/integrations/meta` | `MetaIntegrationConfig.tsx` | Page + IG business IDs, token age, webhook verify URL |
| `/admin/social` | `SocialAdmin.tsx` | Content calendar, scheduled posts, recent metrics, comment inbox |
| `/admin/integrations/apollo` | `ApolloIntegrationConfig.tsx` | Toggle auto-enrich on contact insert, manual lookup form, recent enrichments table |
| `/admin/leads/enrichment` | `LeadsEnrichment.tsx` | History of enrichments with payload preview |
| `/admin/observability/usage` | `UsageAnalytics.tsx` | PostHog deep-link card; summary stats from `paige_*` tables (workflow runs, approvals, sends) |
| `/admin/observability/errors` | `ErrorTracking.tsx` | Sentry deep-link card; recent edge-function failure summary from `paige_workflow_runs.status='failed'` and audit failures |

`IntegrationsHub.tsx` gets 6 new tiles in alphabetical-ish order with status badges:
- Apollo (Auto-enrich on / off based on a feature flag in `paige_config`)
- Cal.com (Connected / Not configured)
- DocuSign (Connected / Not configured)
- Meta Graph (Tokens valid / expired soonest)
- PostHog (Connected via env / Disabled)
- Sentry (Connected via env / Disabled)

`AdminLayout.tsx` top-bar "More" menu adds: Signatures, Bookings, Social (no change to the primary nav row).

---

## 5. Env Var Manifest

User-provided runtime secrets (Project Settings → Secrets) — Antonio supplies:

- DocuSign: `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_RSA_PRIVATE_KEY`, `DOCUSIGN_BASE_URI`, `DOCUSIGN_WEBHOOK_HMAC_KEY`
- Cal.com: `CAL_API_KEY`, `CAL_WEBHOOK_SECRET`, `CAL_BASE_URL` (optional, defaults to `https://api.cal.com/v1`)
- Meta: `META_APP_ID`, `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`, `META_IG_BUSINESS_ID`, `META_WEBHOOK_VERIFY_TOKEN`
- Apollo: `APOLLO_API_KEY`
- Sentry (server): `SENTRY_DSN`
- PostHog (server, optional): `POSTHOG_API_KEY`, `POSTHOG_HOST`

Frontend public values (safe to embed, auto-injected by Lovable):
- `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`

---

## 6. Out of Scope (per brief)
YouTube Data, LinkedIn, Zoom native, Twilio Voice / Vapi / Bland, Slack, GitHub / Vercel, Buffer / Hootsuite — all deferred to a future Phase 4.

Permanent forbidden list (unchanged): Plaid, Nav.com, SmartCredit, any credit-repair tooling, Mogul Credit features.

---

## 7. Clarifying Questions for Antonio

1. **DocuSign templates** — do you already have template IDs in DocuSign for each `envelope_type` (vip_app, coach_agreement, dfy_engagement, refund, term_sheet)? If so, we'll store them in a `paige_config.docusign_templates` jsonb map so the admin UI shows a friendly picker. If not, I'll ship the form with a free-text `template_id` field for now.
2. **Cal.com flavor** — Cal.com Cloud or self-hosted? And do you have the default event type IDs we should associate with vip_intro / dfy_discovery / coffee_hour / workshop? The webhook handler classifies bookings by event-type-id mapping.
3. **Auto-enrich on `clients` insert** — confirm you want Apollo to fire automatically for every new contact (the brief says yes; I want to flag that this consumes Apollo credits on every signup). The flag will live in `paige_config.apollo_auto_enrich` default `true` so you can flip it off without a redeploy.
4. **Meta scope** — pages + IG business account both authorized under the same System User token, correct? And which IG account is canonical (the `META_IG_BUSINESS_ID`)?
5. **Sentry org/project slugs** — needed for the deep-link card in `/admin/observability/errors`. Safe to ship without and you can fill in via the new `paige_config` fields after deploy.
6. **PostHog dashboard** — do you want the Usage screen to embed a specific PostHog insight (give me the share URL) or stay as a deep-link summary?
7. **Bookings ↔ contact matching** — when a Cal booking comes in with an email we don't recognize, should we (a) auto-create a `clients` row tagged `source=cal_booking`, or (b) leave `contact_id` NULL and surface it in `/admin/bookings` as "Unmatched" for an admin to claim? Default if you don't answer: (b), safer.

---

## Technical details (for engineering)

- Webhook signature verification: DocuSign Connect HMAC1 (`X-DocuSign-Signature-1`), Cal.com `X-Cal-Signature-256` (HMAC-SHA256 of body), Meta `X-Hub-Signature-256` (HMAC-SHA256 with `META_APP_SECRET`). All implemented with `crypto.subtle` in the edge function — no external deps.
- DocuSign JWT: `npm:jsonwebtoken@9` for RS256 signing; access token cached for 50 minutes in module scope to avoid per-call minting.
- Apollo trigger uses `pg_net` (already enabled for the Phase 1 outbox cron) — no new extensions.
- Sentry tunnel pattern: standard `https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-tunnel-option` — forwards `X-Sentry-Auth` and body unchanged. Rate-limited via in-memory token bucket per IP to prevent abuse.
- PostHog server helper uses `posthog-node` via `npm:` specifier; failures are swallowed and logged.
- All new admin screens follow Phase 2 patterns: `Card` + `Badge` status, `sonner` toasts, `supabase.functions.invoke`, no inline styles, semantic tokens only.

Once approved I'll build in the recommended order (Sentry → PostHog → DocuSign → Cal → Apollo → Meta) and ship each connector tile working before moving to the next.
