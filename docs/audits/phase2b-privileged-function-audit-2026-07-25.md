# Phase 2b: Privileged Edge Function Posture Audit

**Date:** 2026-07-25
**Scope:** Ten previously configured `verify_jwt = false` Edge Functions flagged during the Phase 1 configuration inventory
**Status:** Read-only recommendations; no function, caller, configuration, or deployment was changed

## Executive summary

| Function | Recommended Phase 2b posture | Priority finding |
|---|---|---|
| `preview-transactional-email` | **SERVICE-ROLE-ONLY — change to `verify_jwt = true`** | Custom `LOVABLE_API_KEY` gate has no repository producer and unnecessarily exposes every rendered template to anyone holding a broad provider key. |
| `apollo-enrich-person` | **AUTHENTICATED — change to `verify_jwt = true` after producer migration** | Admin UI path is valid, but the database trigger sends an anon token and is incompatible with the function's actual guard. |
| `doctrine-201-language-sweep` | **SERVICE-ROLE-ONLY — change to `verify_jwt = true` and add an exact in-function internal check** | Anonymous callers can choose `base_url`, trigger outbound fetches, and cause service-role audit writes. |
| `embed-client-financials` | **SERVICE-ROLE-ONLY — change to `verify_jwt = true`** | It uses service-role data access; its bearer test is substring-based and should be exact. The feature is funding/financial-module infrastructure. |
| `fetch-url-content` | **AUTHENTICATED — change to `verify_jwt = true`** | It already accepts either a user JWT or service-role JWT; the gateway can enforce that same union. SSRF defenses need a separate DNS/redirect review. |
| `paige-mcp` | **PUBLIC/CUSTOM-AUTH — keep `verify_jwt = false`** | OAuth discovery, registration, token exchange, OAuth bearer tokens, and platform keys are not Supabase JWTs. Keep only with its current application-level gates and complete a dedicated security audit. |
| `paige-voice-chat` | **PUBLIC/CUSTOM-AUTH — keep `verify_jwt = false` while inert** | It returns 503 before all legacy code. If revived, WebSocket query-token authentication requires application-level validation and a separate redesign review. |
| `paige-web-search` | **AUTHENTICATED — change to `verify_jwt = true`** | It already accepts valid user or service JWTs. Gateway enforcement adds a redundant boundary without breaking named callers. |
| `platform-independence-sweep` | **SERVICE-ROLE-ONLY — change to `verify_jwt = true` and add an exact in-function internal check** | It has no request authentication and lets any caller spend GitHub API capacity and create privileged admin notifications. |
| `rebuild-client-financial-brief` | **SERVICE-ROLE-ONLY — change to `verify_jwt = true`** | It performs platform-wide financial reads/writes and uses the same substring bearer test. It is funding/financial-module infrastructure. |

These recommendations revise eight existing public gateway postures: six should become JWT-verified, two require internal JWT verification plus function-level authorization, and two (`paige-mcp`, inert `paige-voice-chat`) legitimately require `verify_jwt = false` because their protocols cannot rely exclusively on Supabase user JWTs.

## Method and limits

The audit applies CLAUDE.md §37 to request producers and response consumers across all eight caller classes: frontend, sibling Edge Functions, database triggers, `pg_cron`/`pg_net`, GitHub Actions, external webhook/OAuth providers, n8n/Zapier/MCP, and tests/operational scripts. It also inspects function-level authentication, service-role use, tenant derivation, response use, and vertical-specific behavior.

This checkout remains behind the owner-reported merged Hotfix/doctrine/Money Spine commits and has no Git remote. Findings therefore describe the mounted repository snapshot. Before changing any caller or deleting a custom-auth path, rerun exact-slug and response-contract searches against synchronized `main`, then check Supabase invocation logs and external automation inventories. This report does not assert live schedules, secrets, or invocation volume.

## 1. `preview-transactional-email`

### Behavior and posture

The function renders every registered transactional-email template with preview data and returns subjects plus complete HTML. It is configured `verify_jwt = false` and compares the bearer token with `LOVABLE_API_KEY`. No tenant data is queried and no database client is created, but template HTML may expose unreleased copy, URLs, or preview content. Reusing a broad provider credential as endpoint authorization also expands the blast radius of that secret.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend | None found. |
| Sibling Edge Functions | None found. |
| Database triggers | None found. |
| `pg_cron` / `pg_net` | None found. |
| GitHub Actions | None found. |
| External webhook / OAuth | The comment says a “Go API” calls it, but no implementation or external contract is present in this repository. |
| n8n / Zapier / MCP | None found. |
| Tests / operational scripts | None found. |
| Response consumers | None found; the unverified external Go caller may consume `{ templates: [...] }`. |

### Recommendation

Classify **SERVICE-ROLE-ONLY** and set `verify_jwt = true`, subject to confirming the claimed external Go producer. Replace the Lovable provider-key comparison with an exact service-role or dedicated narrowly scoped preview secret check. If the Go service cannot present a Supabase JWT, retain `false` only as an explicit custom-auth exception with a dedicated rotatable secret, IP/rate controls, and documented owner approval—not `LOVABLE_API_KEY`.

## 2. `apollo-enrich-person`

### Behavior and posture

The function calls Apollo with a supplied email, writes provider payloads to `paige_enrichment_log` using the service role, and returns the enriched person. Non-service callers pass through `requireAdmin`. That makes the manual admin path tenant/role authenticated, although `contact_id` should still be validated against the admin's authorized tenant before the service-role insert.

The automatic database producer is broken in the checked snapshot: `trg_clients_apollo_enrich` posts a hard-coded anon JWT plus `x-internal-trigger`, while the handler does not trust that header and recognizes only the exact service-role bearer as internal. A public anon token therefore reaches `requireAdmin` and should be rejected.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend | `ApolloIntegrationConfig.tsx` invokes it and consumes `ok`, `person`, or `error` for a manual admin test. |
| Sibling Edge Functions | None found. |
| Database triggers | `trg_clients_apollo_enrich` is the automatic producer on client inserts. |
| `pg_cron` / `pg_net` | The trigger uses `pg_net`; it is not scheduled cron work. |
| GitHub Actions | None found. |
| External webhook / OAuth | Apollo is an outbound provider, not an inbound producer. |
| n8n / Zapier / MCP | None found. |
| Tests / operational scripts | No executable test found; bootstrap schema duplicates the producer definition. |
| Response consumers | The UI consumes the manual response. The asynchronous trigger does not consume it. |

### Recommendation

Classify **AUTHENTICATED** and set `verify_jwt = true` only in the same change that migrates the trigger to a valid service-role/internal credential. Preserve `requireAdmin` for user calls and exact service-role authorization for trigger calls. Remove the hard-coded project URL and anon key, derive endpoint/credential from protected configuration, and validate `contact_id` against the email/tenant row before logging. This is generic CRM enrichment, not a §2 vertical leak.

## 3. `doctrine-201-language-sweep`

### Behavior and posture

This scheduled governance function fetches five public paths beneath caller-provided `base_url`, measures language, and inserts findings through a service-role client. It currently performs no request authentication. An anonymous caller can therefore trigger outbound fetches, choose a different HTTPS/HTTP base, consume resources, and generate privileged audit findings.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend | None found. |
| Sibling Edge Functions | None found. |
| Database triggers | None found. |
| `pg_cron` / `pg_net` | `doctrine_201_weekly_sweep` posts a service-role bearer and Paige's canonical base URL. |
| GitHub Actions | None found. |
| External webhook / OAuth | None. Public websites are outbound scan targets. |
| n8n / Zapier / MCP | None found. |
| Tests / operational scripts | Doctrine documentation names the weekly job; no executable response consumer found. |
| Response consumers | None found; the cron ignores `{ findings_count, findings, ... }`. |

### Recommendation

Classify **SERVICE-ROLE-ONLY**, set `verify_jwt = true`, require an exact service-role bearer or dedicated cron secret in-function, restrict methods, and remove caller control of `base_url` (or enforce an allowlist). This is platform doctrine infrastructure and is vertical-neutral.

## 4. `embed-client-financials`

### Behavior and posture

Database triggers invoke this function after changes to five financial tables. It reads the claimed source row with a service-role client, composes a financial RAG document, and upserts it into `rag_documents`. The current check uses `auth.includes(serviceKey)` rather than parsing and exactly comparing the bearer. It also accepts `contact_id` separately from `source_row_id`; for non-transaction tables the handler does not prove that the claimed contact owns the fetched row before assigning RAG metadata/client scope.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend | None found. |
| Sibling Edge Functions | No caller; `rebuild-client-financial-brief` references its schema/content approach only. |
| Database triggers | `notify_embed_client_financials` backs triggers on business-credit, owner-credit, bank-connection, cash-flow, and related financial rows. |
| `pg_cron` / `pg_net` | Trigger code posts with the `_internal_secrets.service_role_key`; no cron directly invokes this function. |
| GitHub Actions | None found. |
| External webhook / OAuth | None. Voyage-compatible embeddings are outbound. |
| n8n / Zapier / MCP | None found. |
| Tests / operational scripts | Bootstrap schema mirrors the triggers; no executable response assertion found. |
| Response consumers | Trigger calls ignore `{ inserted|updated, embedded }`. |

### Recommendation

Classify **SERVICE-ROLE-ONLY**, set `verify_jwt = true`, parse the bearer and compare it exactly, require POST, validate the row-to-contact relationship server-side, and avoid trusting body `contact_id`. Treat deployment/activation as **PLAYBOOK-SPECIFIC** under #446: it is legitimate financial/funding-module infrastructure, but dormant tenants should not cause it to run merely because its config becomes explicit.

## 5. `fetch-url-content`

### Behavior and posture

This URL-reading utility accepts either an exact service-role bearer or a verified end-user JWT, fetches HTTPS content, strips HTML, and returns up to 5,000 characters. Its custom authentication already uses credentials that the Supabase gateway can verify, so `verify_jwt = false` is unnecessary.

The SSRF guard blocks literal private/local hostnames and requires HTTPS, but it does not visibly resolve DNS before the request, pin the resolved public address, or revalidate every redirect target. That is a separate high-priority hardening item because authenticated users can supply arbitrary URLs.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend | No exact direct invocation found. |
| Sibling Edge Functions | `paige-ai-chat` and `paige-deep-research` call it with service-role authorization. |
| Database triggers | None found. |
| `pg_cron` / `pg_net` | None found. |
| GitHub Actions | None found. |
| External webhook / OAuth | None; arbitrary sites are outbound targets. |
| n8n / Zapier / MCP | No direct call found. |
| Tests / operational scripts | None found. |
| Response consumers | Named sibling callers consume `success`, `content`, URL/summary metadata, and errors for research/chat workflows. |

### Recommendation

Classify **AUTHENTICATED** and set `verify_jwt = true`; retain in-function user validation and the exact service-role branch as defense in depth. Add method/body-size/timeout/response-size controls and DNS-plus-redirect SSRF validation in a separate focused PR. This is generic research infrastructure, not a §2 leak.

## 6. `paige-mcp`

### Behavior and posture

`paige-mcp` is a large external protocol surface supporting OAuth discovery, dynamic client registration, authorization/token/revocation routes, platform keys, OAuth bearer tokens, tool discovery, and tool execution. It uses the service role extensively after resolving an actor, then applies tier/scope and tenant rails. Supabase gateway JWT verification cannot cover its non-Supabase OAuth tokens, platform keys, or unauthenticated discovery/registration routes.

The surface is too broad for configuration review alone. Existing repository documentation already identifies tenant-isolation proofs and previously found cross-tenant/vertical concerns. Its tool catalog, token lifecycle, DCR policy, actor derivation, tenant scoping, destructive approval semantics, rate/cost limits, audit completeness, and response data minimization require the separately queued security audit.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend | `McpSessionsPanel` exposes the endpoint; `McpAuthorize` participates through the consent endpoint. |
| Sibling Edge Functions | `paige-mcp-smoke` calls it with a platform key; other functions and shared modules reference its actor/tool contracts. |
| Database triggers | None found as direct HTTP producers. |
| `pg_cron` / `pg_net` | None found as direct endpoint producers. |
| GitHub Actions | None found. |
| External webhook / OAuth | MCP hosts/clients and OAuth clients are primary external producers. Discovery, DCR, authorize, token, and revoke paths are intentional. |
| n8n / Zapier / MCP | MCP clients are the principal caller class; tools can dispatch workflows/integrations downstream. |
| Tests / operational scripts | `paige-mcp-smoke` is the named smoke utility; security proof docs describe additional manual deployed-source/runtime checks. |
| Response consumers | MCP clients consume OAuth metadata/tokens, `tools/list`, and JSON-RPC tool results; changing any response requires protocol compatibility review. |

### Recommendation

Classify **PUBLIC/CUSTOM-AUTH** and keep `verify_jwt = false`, with a mandatory rationale comment: gateway JWT cannot represent MCP OAuth/platform-key actors; public protocol routes are required; application code resolves the bearer actor and enforces tier, scope, tenant, and tool policy. Do not interpret this as security approval. Complete the dedicated `paige-mcp` threat model and live negative tenant tests before expanding tools. Funding-specific tools/workflows must remain entitlement-gated under #446 rather than globally usable through the generic MCP surface.

## 7. `paige-voice-chat`

### Behavior and posture

The function currently returns HTTP 503 before executing any legacy WebSocket/OpenAI code, so it neither authenticates nor reads tenant data in its deployed source path. The unreachable implementation accepts a Supabase bearer through a WebSocket query parameter because browsers cannot set upgrade headers, validates it with `auth.getUser`, and then loads extensive user credit/business context. It also contains removed-provider code and should not be revived by merely deleting the early return.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend | No exact current caller found. |
| Sibling Edge Functions | `paige-voice-summary` documents a former on-close producer relationship, but the current early return prevents it. |
| Database triggers | None found. |
| `pg_cron` / `pg_net` | None found. |
| GitHub Actions | None found. |
| External webhook / OAuth | A future browser WebSocket client would be the producer. |
| n8n / Zapier / MCP | None found. |
| Tests / operational scripts | Historical DONE/security documents mention deployment and gating; no live contract test found. |
| Response consumers | Any old caller can only receive the current 503 JSON. Legacy WebSocket message consumers were not found in the route tree. |

### Recommendation

Keep `verify_jwt = false` only as a documented **PUBLIC/CUSTOM-AUTH, INERT** exception because the future WebSocket design may require query-token validation. Alternatively, remove the dormant function until Phase 5. Before revival, delete unreachable OpenAI code, use short-lived single-purpose connection tokens rather than general session JWTs in URLs, prove tenant scoping, minimize sensitive context, and inventory the complete WebSocket message contract. This is generic voice infrastructure; credit/funding context must be module-entitled rather than loaded universally.

## 8. `paige-web-search`

### Behavior and posture

This search utility accepts either the exact service-role bearer or a validated end-user JWT, calls Firecrawl, and returns normalized results. All named callers already supply one of those JWT forms. It does not query tenant tables, but it can consume a paid provider quota and therefore needs gateway enforcement, rate limits, and cost controls.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend | `PaigeAIChat`, `FloatingChatbot`, and app `PaigeChat` invoke it and consume normalized results/configuration state. |
| Sibling Edge Functions | `paige-ai-chat` and `paige-deep-research` call it server-to-server. |
| Database triggers | None found. |
| `pg_cron` / `pg_net` | None found. |
| GitHub Actions | None found. |
| External webhook / OAuth | None; Firecrawl is outbound. |
| n8n / Zapier / MCP | No direct producer found. |
| Tests / operational scripts | None found. |
| Response consumers | Callers consume `configured`, `query`, `results`, `note`, and provider-error behavior; `paige-deep-research` explicitly honors `configured:false`. |

### Recommendation

Classify **AUTHENTICATED** and set `verify_jwt = true`, retaining the in-function service/user validation. Add per-user/tenant quotas and timeouts separately. This is generic Paige research capability, not a §2 vertical leak.

## 9. `platform-independence-sweep`

### Behavior and posture

This weekly governance function downloads repository source through GitHub APIs, scans it for tenant-leak signatures, and inserts service-role admin notifications. It performs no request authentication. Any anonymous caller can trigger GitHub API work and notification writes. Its allowlist also excludes all migrations and docs, so its returned counts must not be treated as a complete repository-wide independence proof.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend | None found. |
| Sibling Edge Functions | None found. |
| Database triggers | None found. |
| `pg_cron` / `pg_net` | `doctrine_200_weekly_sweep` posts a service-role bearer. |
| GitHub Actions | No invocation found; GitHub is the outbound source provider. |
| External webhook / OAuth | None. |
| n8n / Zapier / MCP | None found. |
| Tests / operational scripts | Doctrine documentation names the weekly job; no executable consumer found. |
| Response consumers | None found; cron ignores `{ scanned_files, violations, high_severity }`. |

### Recommendation

Classify **SERVICE-ROLE-ONLY**, set `verify_jwt = true`, require an exact service-role bearer or cron secret in-function, and restrict POST. Add idempotency/deduplication for notifications and make incomplete scan scope explicit in response/observability. This function exists specifically to enforce §2 vertical neutrality; it is not itself a vertical leak.

## 10. `rebuild-client-financial-brief`

### Behavior and posture

This nightly function uses the service role to enumerate financial contacts or accepts a body-selected `contact_id`, reads business credit, owner credit, bank connections, and cash-flow snapshots, then upserts composite RAG documents. Its `auth.includes(serviceKey)` guard should be an exact bearer comparison. Because only a trusted internal caller should reach it, body-selected contact is acceptable only after that exact internal authorization; it must never gain an ordinary user path without server-derived tenant/contact scope.

### §37 producer and response-consumer inventory

| Producer class | Finding |
|---|---|
| Frontend | None found. |
| Sibling Edge Functions | None found. |
| Database triggers | None directly; source tables feed the nightly query. |
| `pg_cron` / `pg_net` | `rebuild-client-financial-brief-nightly` posts the protected service key and a trigger/time body. |
| GitHub Actions | None found. |
| External webhook / OAuth | None. Voyage-compatible embeddings are outbound. |
| n8n / Zapier / MCP | None found. |
| Tests / operational scripts | Bootstrap/schema artifacts mirror the cron; no response assertion found. |
| Response consumers | Cron ignores `{ processed, results }`; no other consumer found. |

### Recommendation

Classify **SERVICE-ROLE-ONLY**, set `verify_jwt = true`, parse and exactly compare the bearer, require POST, and retain server-side contact discovery for the cron path. Treat deployment/activation as **PLAYBOOK-SPECIFIC** under #446: the function is legitimate financial intelligence infrastructure, but explicit config must not activate the dormant funding pipeline or globally expose finance-derived RAG context.

## Consolidated §2 and §9 findings

### Immediate security remediation candidates

1. `doctrine-201-language-sweep`: unauthenticated service-role writes plus caller-controlled outbound base URL.
2. `platform-independence-sweep`: unauthenticated GitHub scanning plus privileged notification writes.
3. `embed-client-financials`: substring credential comparison and body contact/row association risk.
4. `rebuild-client-financial-brief`: substring credential comparison on platform-wide financial processing.
5. `fetch-url-content`: authenticated SSRF defense does not visibly cover DNS rebinding/resolution and redirect targets.

### Vertical-neutrality dispositions

- **Generic platform capabilities:** template preview, Apollo CRM enrichment, doctrine sweeps, URL fetch, MCP transport/control plane, voice transport, and web search.
- **Playbook-specific financial infrastructure:** `embed-client-financials` and `rebuild-client-financial-brief`. Under #446, explicit config is not authorization to schedule, deploy, or activate them globally.
- **Mixed generic surface requiring entitlement enforcement:** `paige-mcp` and revived `paige-voice-chat` must not surface funding/credit tools or context merely because the transport is generic.

## Phase 2b owner-review checklist

- [ ] Approve moving `doctrine-201-language-sweep` and `platform-independence-sweep` to service-role-only with in-function exact authorization.
- [ ] Approve moving `embed-client-financials` and `rebuild-client-financial-brief` to service-role-only while keeping the #446 pipeline dormant.
- [ ] Approve moving `fetch-url-content` and `paige-web-search` to gateway JWT verification.
- [ ] Decide whether `preview-transactional-email` migrates to service-role JWT or retains a dedicated custom-auth exception; do not keep using `LOVABLE_API_KEY` as the endpoint credential by default.
- [ ] Reconcile `apollo-enrich-person`'s broken anon-trigger producer before enabling gateway JWT verification.
- [ ] Retain `paige-mcp` as `verify_jwt = false` only with the documented protocol rationale and dedicated audit gate.
- [ ] Retain inert `paige-voice-chat` as a documented custom-auth exception or remove it until Phase 5; do not revive unreachable legacy code in place.
- [ ] File focused follow-ups for URL SSRF hardening, financial row/contact derivation, internal exact bearer checks, and MCP security testing.

## Recommended Phase 2b integration

This report should inform, not silently expand, the Phase 2b backfill:

1. Existing configured functions may change posture in the same PR only where producer compatibility is proven.
2. `paige-mcp` and `paige-voice-chat` remain explicit `false` exceptions with machine-readable classification comments.
3. Apollo's config change is coupled to its trigger migration; do not break the automatic producer.
4. Financial embedding/rebuild functions receive explicit service-role classification but remain dormant/playbook-gated under #446.
5. The two unauthenticated doctrine sweeps should be treated as security fixes, not mechanical config cleanup, and receive behavior tests proving anonymous 401 responses and authorized cron success.
