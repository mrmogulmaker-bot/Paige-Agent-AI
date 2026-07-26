# Phase 2d: Undeployed Edge Function Disposition Audit

**Date:** 2026-07-25
**Scope:** Six local Edge Function directories reported absent from the live Paige Agent AI Supabase deployment
**Status:** Read-only recommendations; owner approval is required before deployment, deletion, or caller changes

## Executive summary

| Function | Recommendation | Confidence | Immediate owner decision |
|---|---|---:|---|
| `compliance-utils` | **B — SUPERSEDED AND SHOULD DELETE** | High | Approve removal of the orphan, non-endpoint utility directory; retain the dedicated `log-consent` and `request-data-deletion` capabilities. |
| `create-checkout` | **A — ACTIVE AND SHOULD DEPLOY** | High | Deploy only after confirming the four hard-coded Stripe price IDs and legacy `/dashboard` return route are still canonical. It is not superseded by `tenant-checkout-session`. |
| `generate-invoice` | **A — ACTIVE AND SHOULD DEPLOY** | High | Deploy after the already-documented tenant-branding fix, or explicitly accept the temporary Paige/Mogul Maker static invoice branding. |
| `parse-business-credit-report` | **C — INCOMPLETE, BEHIND DEV FLAG** | High | Do not deploy yet; its only named UI producer is no longer rendered, and the implementation depends on Lovable AI plus weakly validated model output. |
| `plaid-create-link-token` | **B — SUPERSEDED AND SHOULD DELETE** | Medium-high | Approve removal in favor of the gated `paige-plaid-*` connection flow; no request producer or response consumer was found. |
| `sync-business-credit-bureaus` | **C — INCOMPLETE, BEHIND DEV FLAG** | High | Do not deploy; the implementation is explicitly placeholder code, while three repository producers currently point at it and must be disabled or migrated before any eventual removal. |

The two initial supersession hypotheses resolve differently:

- `create-checkout` and `tenant-checkout-session` serve different products. The former sells Paige platform subscriptions to authenticated users; the latter sells tenant-owned storefront products through Stripe Connect. They are not substitutes.
- `plaid-create-link-token` has no producer and is architecturally displaced by the gated, contact-scoped `paige-plaid-link-token-create` / `paige-plaid-public-token-exchange` family.

## Method and limits

This audit applies CLAUDE.md §37's producer-inventory rule to both request and response contracts. For each function, the repository was searched across all eight producer classes:

1. Frontend callers.
2. Sibling Edge Functions.
3. Database triggers.
4. `pg_cron` and `pg_net` migrations.
5. GitHub Actions.
6. External webhook and OAuth providers.
7. n8n, Zapier, and MCP callers.
8. Tests and operational scripts.

The audit also searched for consumers of each response shape and exported symbol references for `compliance-utils`. Exact-slug searches were supplemented with searches for Supabase `functions.invoke`, `/functions/v1/` URLs, relevant RPCs, and likely superseder names.

This is a repository-static inventory, not runtime telemetry. “None found” means no producer or consumer was found in the checked repository snapshot; it does not prove that an undocumented external caller does not exist. The live-deployment fact (these six functions are not deployed) comes from the owner-provided read-only Supabase enumeration. Before deleting either recommended directory, the owner should additionally check Supabase invocation logs, Vercel environment/code outside this checkout, n8n/Zapier inventories, and MCP tool registries.

The connected checkout was not yet synchronized to the later Hotfix 1 / doctrine merge commits when this report was authored. That does not alter the six function bodies or the producer references recorded below, but the exact searches should be rerun immediately before a deletion PR.

## 1. `compliance-utils`

### What the code is

`supabase/functions/compliance-utils/index.ts` is not an HTTP Edge Function: it has no `Deno.serve`/`serve` handler. It exports TypeScript helpers for consent events, compliance checkpoints, financial API logging, disclosure lookup, disclaimers, validation, and data-deletion requests. No repository file imports any of those exports.

Dedicated HTTP capabilities now occupy part of the same responsibility:

- `supabase/functions/log-consent/index.ts` implements the consent-write endpoint.
- `supabase/functions/request-data-deletion/index.ts` and `supabase/functions/process-data-deletion/index.ts` implement the data-deletion lifecycle.

Leaving a shared library under a top-level function slug is misleading: deployment tooling treats top-level directories as deployable functions even though this directory cannot serve a request.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend callers | **None found.** No invocation of `compliance-utils`; no imports of its exported helpers. |
| Sibling Edge Functions | **None found.** No import of `logConsentEvent`, `createComplianceCheckpoint`, `logFinancialAPICall`, `verifyConsent`, `getDisclosure`, `appendEducationalDisclaimer`, `validateAPICall`, or `requestDataDeletion` from this directory. `log-consent` defines its own helper instead. |
| Database triggers | **None found.** |
| `pg_cron` / `pg_net` migrations | **None found.** |
| GitHub Actions | **None found.** |
| External webhook / OAuth providers | **Not applicable; no HTTP handler or callback contract exists.** |
| n8n / Zapier / MCP | **None found.** |
| Tests / operational scripts | **None found.** |
| Response consumers | **None found.** There is no HTTP response contract; exported helper result shapes have no import consumers. |

### Recommendation: **B — SUPERSEDED AND SHOULD DELETE**

Delete the orphan top-level directory after the external/runtime checks described above. The superseding homes are the dedicated `log-consent` and data-deletion endpoints for implemented capabilities. If any of the remaining generic helpers are needed later, move only the required, tested helper into `supabase/functions/_shared/` as part of its first real consumer—not pre-emptively.

This recommendation follows the one-home-per-capability rule: retaining an unused pseudo-function alongside dedicated endpoints creates ambiguity without preserving a callable feature.

## 2. `create-checkout`

### What the code is

This is an authenticated platform-subscription checkout. It maps four Paige plan slugs to hard-coded production Stripe price IDs and returns `{ url }` for a subscription Checkout Session tied to the authenticated user's email and user ID.

`tenant-checkout-session` is not a superseder. It is a public tenant-storefront checkout keyed by a `tenant_prices` row, uses Stripe Connect destination charges/application fees, records `tenant_orders`, and returns `{ url, session_id }`. The two functions have different actors, catalogs, order stores, payment flows, and response contracts.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend callers | **One active code path:** `src/components/dashboard/UpgradeModal.tsx` invokes `create-checkout` with `{ planSlug }`. `UpgradeModal` is mounted by `src/pages/Dashboard.tsx` and by the personal/business document components. |
| Sibling Edge Functions | **None found.** |
| Database triggers | **None found.** |
| `pg_cron` / `pg_net` migrations | **None found.** |
| GitHub Actions | **None found.** |
| External webhook / OAuth providers | **None found.** Stripe is an outbound dependency, not a producer of this endpoint. |
| n8n / Zapier / MCP | **None found.** |
| Tests / operational scripts | **None found.** The consolidated platform audit calls it the “only wired checkout,” but that is documentation rather than a caller. |
| Response consumers | `UpgradeModal` reads `data.url` and opens it in a new tab. No consumer expects `session_id`. Errors are surfaced through the Supabase invocation error/toast path. |

### Recommendation: **A — ACTIVE AND SHOULD DEPLOY**

The undeployed state leaves a reachable upgrade action pointing at a missing backend. Deploy it in the next approved deployment window, subject to a focused preflight:

1. Confirm each hard-coded Stripe price ID remains valid for production and matches `subscription_plans` slugs/prices.
2. Confirm `/dashboard?subscription=...` remains a supported return path (the current app has newer `/app` routing patterns).
3. Add method validation and preserve `verify_jwt = true` in the Phase 2b config.
4. Confirm the Stripe webhook/order/subscription reconciliation handles sessions created by this function.

Do not replace its caller with `tenant-checkout-session`; doing so would mix platform subscriptions with tenant storefront commerce.

## 3. `generate-invoice`

### What the code is

This authenticated endpoint loads an `orders` row constrained by both `orderId` and the authenticated `user.id`, renders invoice HTML, and returns `{ invoiceHTML, invoiceUrl }`, where `invoiceUrl` is a base64 data URL.

The implementation still hard-codes `PaigeAgent.ai`, `Mogul Maker Academy`, and a Paige support address. `docs/architecture/SPRINT_C1_TENANT_READINESS.md` already records tenant invoice branding as pending work.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend callers | **One reachable caller:** `src/components/dashboard/PaymentHistory.tsx` invokes `generate-invoice` with `{ orderId: payment.id }`. `PaymentHistory` is rendered by the Dashboard `payments` section. |
| Sibling Edge Functions | **None found.** |
| Database triggers | **None found.** |
| `pg_cron` / `pg_net` migrations | **None found.** |
| GitHub Actions | **None found.** |
| External webhook / OAuth providers | **None found.** |
| n8n / Zapier / MCP | **None found.** |
| Tests / operational scripts | **None found.** |
| Response consumers | `PaymentHistory` reads only `data.invoiceUrl` and opens it in a new tab. No repository consumer reads `invoiceHTML`. |

### Recommendation: **A — ACTIVE AND SHOULD DEPLOY**

The payment-history UI exposes the capability today, and the endpoint enforces order ownership. Deploy it after owner acceptance of one of these paths:

- preferred: complete the documented tenant-branding lookup before deployment; or
- temporary: explicitly accept static Paige/Mogul Maker branding for platform-owned `orders` only and document that tenant storefront orders are out of scope.

Phase 2b should set `verify_jwt = true`. A follow-up should also return 401/404 rather than a generic 500 for auth/order misses and consider a safer downloadable artifact than a potentially large data URL.

## 4. `parse-business-credit-report`

### What the code is

This authenticated, user-self-only endpoint downloads the most recent `business_credit_report` document, sends the full PDF to `https://api.lovable.app/v1/ai/chat` using `LOVABLE_API_KEY`, extracts the first bracketed JSON array from free-form model output, and inserts those values into `credit_accounts` with minimal schema validation.

The only exact-slug caller is in `BuildProgramOutline`. Although `Dashboard.tsx` imports that component, the current business-credit/build sections render `BusinessInfrastructureAssessment` instead; no JSX use of `BuildProgramOutline` was found. The current report-upload paths invoke the newer `analyze-credit-report` and `sync-credit-report-data` pipeline instead.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend callers | **One dormant source reference:** `BuildProgramOutline.tsx` invokes it with `{ userId }`, but the component is not rendered in the current route tree. Current upload components invoke `analyze-credit-report` instead. |
| Sibling Edge Functions | **None found.** |
| Database triggers | **None found.** |
| `pg_cron` / `pg_net` migrations | **None found.** |
| GitHub Actions | **None found.** |
| External webhook / OAuth providers | **None found.** Lovable AI is an outbound dependency. |
| n8n / Zapier / MCP | **None found.** |
| Tests / operational scripts | **None found.** |
| Response consumers | The dormant `BuildProgramOutline` caller reads `data.accountsAdded` for a toast. No consumer reads `totalParsed`. The newer analysis pipeline has a different response/data contract and is not a drop-in slug replacement. |

### Recommendation: **C — INCOMPLETE, BEHIND DEV FLAG**

Do not deploy this endpoint in its present form. Keep it non-production (or remove it in a later owner-approved consolidation) until the owner decides whether it has any role beside `analyze-credit-report` / `sync-credit-report-data`.

Reasons:

- no reachable producer was found;
- it depends on a legacy Lovable AI endpoint/key;
- it sends sensitive credit-report content to that provider without an evident consent/entitlement gate in this handler;
- regex extraction plus unvalidated model fields can write malformed financial data;
- it is funding/credit-specific but does not enforce a tenant Marketplace/playbook entitlement.

If revived, it should be integrated into the canonical report-ingestion pipeline, derive user/tenant scope server-side, enforce consent and module entitlement, validate parsed output with a strict schema, and be exposed only through a deliberately enabled funding/credit module.

## 5. `plaid-create-link-token`

### What the code is

This legacy authenticated-user endpoint creates a Plaid sandbox link token for `user.id`, with hard-coded `PLAID_ENV = 'sandbox'`, products `auth` and `transactions`, and response `{ link_token }`.

The newer `paige-plaid-link-token-create` is an admin-gated, contact-scoped endpoint controlled by `paige_config.plaid_activated` / `plaid_env`; its companion `paige-plaid-public-token-exchange` stores encrypted connection credentials. That family supplies the safer platform direction even though it is explicitly still scaffolding.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend callers | **None found.** No Plaid Link/usePlaidLink code or invocation of this slug was found in `src`. |
| Sibling Edge Functions | **None found.** |
| Database triggers | **None found.** |
| `pg_cron` / `pg_net` migrations | **None found.** |
| GitHub Actions | **None found.** |
| External webhook / OAuth providers | **None found.** Plaid webhooks target separate webhook functions. |
| n8n / Zapier / MCP | **None found.** |
| Tests / operational scripts | **None found.** |
| Response consumers | **None found.** The legacy `{ link_token }` response is not parsed anywhere. The superseding Paige endpoint returns `{ ok, link_token, expiration }` and uses `contact_id`, so migration would require an intentional caller contract. |

### Recommendation: **B — SUPERSEDED AND SHOULD DELETE**

Delete the legacy directory after checking live Edge logs and external automation inventories. Name `paige-plaid-link-token-create` plus `paige-plaid-public-token-exchange` as the superseding connection flow.

Do not deploy the old endpoint merely to make local/deployed inventories equal: it hard-codes sandbox, has no producer, and bypasses the newer activation/configuration boundary. This recommendation does not authorize deploying the Paige scaffolding; that suite should remain inactive until its own owner-approved implementation and entitlement gates are complete.

## 6. `sync-business-credit-bureaus`

### What the code is

The source explicitly calls itself a placeholder. It checks for bureau API keys but performs no real API request. If a Nav key exists, it appends `Nav` to `bureausSynced`; if a D&B key and D-U-N-S number exist, it appends `Dun & Bradstreet`; neither branch fetches or persists bureau data. The response can therefore claim a successful sync when no synchronization occurred.

The handler authenticates a user JWT and requires body `userId === user.id`. Two server-side producers are incompatible with that contract: `schedule-automated-tasks` calls it without an Authorization header, while the historical `pg_cron` migration passes a service-role bearer rather than an end-user identity.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend callers | **One dormant exact-slug caller:** `BuildProgramOutline.tsx` posts `{ userId }`, but that component is not rendered in the current route tree. `AutomatedTasksManager` calls `trigger_business_credit_sync`, an RPC that currently only writes an audit log and does not invoke this function. |
| Sibling Edge Functions | **One caller:** `schedule-automated-tasks/index.ts` calls `/functions/v1/sync-business-credit-bureaus` for `credit_monitoring` without authorization, then parses the JSON response. This cannot satisfy the callee's current authentication contract. |
| Database triggers | **None found.** The helper `trigger_business_credit_sync` is an RPC, not a trigger, and its migration explicitly says it only logs rather than calls the Edge Function. |
| `pg_cron` / `pg_net` migrations | **One direct producer:** migration `20251019222525_8bf8a701-5626-4952-873f-df5ae8a787f4.sql` schedules daily HTTP calls to an old hard-coded Supabase project URL with a service-role bearer and `{ userId, businessId }`. Live scheduling was not verified. |
| GitHub Actions | **None found.** |
| External webhook / OAuth providers | **None found.** Bureau providers are intended outbound dependencies, not endpoint producers. |
| n8n / Zapier / MCP | **None found.** |
| Tests / operational scripts | **None found.** |
| Response consumers | Dormant `BuildProgramOutline` expects `data.bureausSynced.join(', ')`. `schedule-automated-tasks` returns the full parsed response to its caller. The endpoint also returns `accountsAdded` and `message`; no named direct consumer of those fields was found. |

### Recommendation: **C — INCOMPLETE, BEHIND DEV FLAG**

Do not deploy this function. It is funding/credit-module-specific, but category D is not sufficient because no tenant-entitlement gate exists and the implementation does not actually sync. Before any production bureau capability is enabled:

1. Disable or supersede the stale cron producer and the unauthenticated sibling call; do not let either silently retry a nonexistent/broken endpoint.
2. Choose one server-derived subject model (scheduled claimed work versus authenticated self-service) rather than accepting user identity from arbitrary bodies.
3. Implement real provider adapters, consent, tenant/module entitlement, rate limits, audit records, idempotency, and normalized persistence.
4. Define an honest response contract based on persisted outcomes—not available API keys—and update both response consumers.
5. Reassess whether newer Nav/credit-report functions already provide the canonical capability before reviving this slug.

Its current undeployed state is safer than deployment. The presence of producers is evidence of incomplete wiring, not evidence that placeholder code should ship.

## Owner decision checklist

- [ ] Approve deletion candidate: `compliance-utils`.
- [ ] Approve deletion candidate: `plaid-create-link-token`.
- [ ] Confirm production Stripe prices, checkout return paths, and reconciliation; then approve deployment of `create-checkout`.
- [ ] Choose tenant-aware branding or explicitly platform-only branding; then approve deployment of `generate-invoice`.
- [ ] Keep `parse-business-credit-report` undeployed/flagged pending canonical ingestion decision.
- [ ] Keep `sync-business-credit-bureaus` undeployed/flagged and open a caller-cleanup/integration design task.
- [ ] Before either deletion PR, check live Supabase invocation logs plus external n8n, Zapier, MCP, Vercel, and operator-script inventories.

## Suggested follow-up sequence

1. Land Phase 2b explicit config without deploying the two incomplete functions merely because they receive config entries; configuration classification and deployment disposition are separate decisions.
2. Restore the two active UI contracts (`create-checkout`, `generate-invoice`) after their narrow preflight fixes/decisions.
3. Remove the two deletion candidates in a dedicated owner-approved PR after live/external producer verification.
4. File a separate cleanup for the stale bureau cron/sibling producer and a decision on the canonical business-credit ingestion/sync architecture.
