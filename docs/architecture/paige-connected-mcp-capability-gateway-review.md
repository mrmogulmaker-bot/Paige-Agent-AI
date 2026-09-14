# Paige Connected MCP Capability Gateway — read-only grounding + architecture review

**Status: READ-ONLY GROUNDING + ARCHITECTURE PLAN. Nothing was built, refactored, migrated, configured,
connected, called, published, merged, or deployed to produce it.** No provider was configured or
contacted during this phase. This document ends at the review package (per the assignment). The first
build action is gated on **CRM PR #1234 merging**, a **fresh-`main` collision pass**, and the owner's
explicit go — none of which is satisfied today (#1234 is open/draft).

**Scope.** This is the internal capability that lets Paige, as an **MCP _client_**, discover, understand,
and (under her own rules) act on tools from an authenticated MCP connection. It is **NOT** Paige's outward
`paige-mcp` server / public developer API (that is a separate, inbound surface — §8 below draws the line).

**Authority note (§00).** This is backend/platform architecture — Claude Code's jurisdiction (RPC/edge
seams, tenant scope, RLS, the callable seam, receipts, CI gates, migrations, proof). Where it names UX
states (§9) it describes **behavior** (what the system reports and does), never visual design; every
client-facing *visual* remains Claude Design's.

**How this was grounded.** A read-only crew of three grounding specialists (n8n path · generic MCP client ·
Chat/Spine truth boundary) plus the integrator's own reads, each citing `file:line`, against the working
tree. The failing n8n **conversation transcript was not observed** — the failure is mapped to the code
paths that make it possible, not quoted (§13).

---

## 0. The owner requirements this package must satisfy (verbatim intent)

1. **Many simultaneous MCP connections per tenant**, including **multiple named connections to the same
   provider / account class** (two GHL sub-accounts, three Meta ad accounts, two n8n instances).
2. **No singletons** — no singleton MCP connection, no singleton OAuth state, no global tool catalog, **no
   provider-specific n8n-only model.** "We can have *one for* n8n" (n8n is a valid connection) but the
   **model must be general** — connect to *any* compatible MCP; n8n and the others are just instances.
3. A **tenant-scoped MCP Connection Registry** where **each connection independently holds**: provider/
   server identity, human-readable label, Vault-backed auth reference, discovery state, discovered
   tools/schemas, granted scopes, health/last-check, user/tenant visibility, owner policy, receipts, error
   state.
4. The **runtime catalog is namespaced by connection**, so providers and accounts cannot collide.
5. **Provider permissions = the maximum possible authority; Paige's policy / Spine / Harness / approval
   rules still govern** whether she reads, prepares, or executes.
6. **Target experience:** connect many compatible MCPs once → Paige performs a **safe read-only intake** per
   connection → she can then reason and act across them **under the owner's rules.**
7. **Reference connection shapes:** n8n, GoHighLevel, Meta — **without configuring or calling any provider
   in this read-only phase.**
8. Fix the reported failure: Paige claimed connection/workflow facts **before a live tool receipt**,
   implied discovery **needed known workflow IDs**, and only later reported a large inventory. And: **"Paige
   is very limited in what she can see based on the way that we have it coded."**

**The one-sentence verdict.** Paige already owns a genuinely well-built, security-conscious *generic MCP
client core* — but it is wrapped in a **singleton, two-provider, n8n-special-cased model** and gated behind
a **cached-readiness truth boundary** that both *limits what Paige can honestly see* and *let her overclaim*.
The work is a **re-model to a connection-keyed, provider-as-data registry** plus a **live-receipt truth
rule** — not a rebuild of the client.

---

## 0.5 §13 corrections surfaced by this grounding (code/GitHub beat the docs/assumptions)

1. **"n8n is an MCP connection like Zapier" — half true.** n8n has **two independent stores and two lanes**:
   an **MCP-OAuth lane** (`tenant_mcp_connections WHERE provider='n8n'` → `tenant-n8n-oauth`/`n8n-oauth.ts`/
   the 12 tools in `n8n-management.ts`) **and** an older **API-key REST lane**
   (`tenant_n8n_connections` → `paige-n8n`/`n8n-run.ts`). The generic client (`mcp-client.ts`) is used by the
   OAuth lane and by Zapier; the REST lane bypasses it entirely. Any "generic gateway" claim must not
   conflate them.
2. **"The failure means discovery is broken / needs IDs" — false.** Both n8n discovery paths enumerate
   **all** workflows with **no ID** (`search_workflows {limit:200}`, `n8n-management.ts:16` `required:[]`;
   `GET /workflows?limit=200`, `n8n-api-validation.ts:37`). The failure is a **prompt/truth-boundary** gap,
   not a discovery-capability gap.
3. **"The governed-execution seam governs Chat" — not for Chat.** `decideGovernedExecution`
   (`governedExecution.ts:464`) is real and adopted by ~16 edge modules, but **Chat runs its own inline
   governance sequence** in `paige-ai-chat/index.ts` and is the notable non-adopter (per the SDK/Foundations
   program §0.5, which corrects the seam doc's stale "nothing adopts it yet" header).
4. **"There's a Connection Registry" — there is a singleton table, not a registry.**
   `tenant_mcp_connections` is **PK `(tenant_id, provider)`** with `provider CHECK IN ('zapier','n8n')` —
   at most one row per provider per tenant, and only two providers expressible. This is the central gap.
5. **`record_capability_run` SQL was not read this pass** (Agent A) — its receipt semantics are described
   from the call site + comments (`n8n-management.ts:145`). Confirm the RPC's columns in
   `20261212000000` / `20261220000000` / `20270107000000` before relying on exact receipt shape.

---

## 1. Executive brief (plain English)

**What we have (the good news).** `_shared/mcp-client.ts` is a correct, hardened, **provider-agnostic** MCP
2025-06-18 client: proper `initialize → notifications/initialized → … → DELETE` session lifecycle;
Streamable-HTTP with dual JSON/SSE response reading; cursor-paginated `tools/list` (bounded 20 pages / 2000
tools); `tools/call`; **verify-and-invoke in the same session** (closes the deploy-mid-call race); tool
**input schemas never leave the module** (only a `schemaHash`); provider **descriptions never reach the
model**; approvals **pinned** to a `schema+authority` hash that fail-closes on drift; and a full OAuth 2.1
public client (DCR + PKCE-S256, RFC 9728/8414/7591/7009). `mcp-oauth.ts`, `mcp-outcome.ts`, and the SSRF
guard are equally careful. **This core is reusable as-is for any compatible MCP.**

**What is wrong (the three real problems).**

- **P-A — Singleton & n8n-special-cased model.** The registry is one row per `(tenant, provider)` over a
  hardcoded two-value provider enum; n8n additionally has its own second store and its own execution lane.
  A tenant cannot hold two GHL locations, three Meta accounts, or two n8n servers, and GHL/Meta cannot be
  represented at all. This is the direct blocker to the owner's non-negotiable requirement.
- **P-B — "Paige is very limited in what she can see."** By design, the model never receives tool schemas
  or provider descriptions (a correct prompt-injection defense), and — critically — the connection facts
  Chat *does* see come from a **cached readiness block**, not a live look. So Paige is simultaneously
  *blinded to structured capability* (can't reason well about what a connection can do) and *fed stale
  facts as if verified* (can overclaim). Both halves must be fixed together.
- **P-C — The truth boundary let Chat overclaim.** The injected block is labeled `VERIFIED WORKSPACE
  SOURCE`, states "connected" + counts as fact, and the "use live discovery" caution is subordinate prose.
  No structural rule requires a live receipt before a connection/count/tool-availability claim.

**What this program proposes (design only, nothing built).** A **generic, tenant-scoped MCP Connection
Registry** keyed by a first-class `connection_id`, with **provider modeled as data** (a descriptor row),
**per-connection** auth/scopes/discovery/health/receipts/error, and a **runtime tool catalog namespaced by
connection**. On top of it, a **Connected-MCP Gateway contract** that reuses the existing governed pattern
(the SDK/Foundations "Capability Kit": `define → authorize(decideGovernedExecution) → execute → receipt`),
a **safe capability-understanding layer** so Paige can reason about connections without untrusted text
reaching the model, and a **live-receipt truth rule** that ends the overclaim. n8n's REST lane and Zapier
become *instances* under this one model; nothing forks a second authority, approval, or receipt system.

---

## 2. The non-negotiable architecture invariants (this program is bound by these)

| # | Invariant | Consequence for the design |
|---|---|---|
| **I-1** | A tenant may hold **N connections**, N unbounded (policy-capped, not schema-capped). | Connection identity is a **`connection_id uuid`**, never `(tenant, provider)`. |
| **I-2** | **Multiple connections to the same provider/account class** are first-class (2 GHL, 3 Meta, 2 n8n). | Identity is the **immutable `connection_id`**; `(tenant_id, provider_key, label)` is a uniqueness/addressing convenience only. `label` is a **mutable human name** — never the identity, the join key, or what an approval/receipt binds to. |
| **I-3** | **No provider enum in the schema.** Provider is **data** (a descriptor), so a new MCP is a row, not a migration. | Drop `CHECK (provider IN ('zapier','n8n'))`; introduce a `mcp_providers` descriptor table + per-connection capability facts. |
| **I-4** | **No singleton OAuth/auth state.** Tokens, scopes, refresh leases live **per connection**. | OAuth state keyed by `connection_id`, not `(tenant, provider)`. |
| **I-5** | **The runtime tool catalog is namespaced by connection.** | A tool is addressed as `⟨connection_id⟩::⟨tool_name⟩`; two connections offering the same tool name never collide. |
| **I-6** | **Provider scope = the ceiling; Paige policy = the governor.** | A connection's granted scopes are the *maximum*; `decideGovernedExecution` + autonomy lane + one-approval-gate decide the *effective* action (read/prepare/execute) within it. |
| **I-7** | **A connection fact is never asserted to a human/model without a live receipt or an explicit freshness label.** | The chat truth-boundary rule (§8). Cached readiness may be shown only as `observed_at`-stamped, never as "verified now." |
| **I-8** | **Read-only intake first.** A newly connected MCP is safe-probed (discovery only) before any consequential action. | Intake = `initialize` + `tools/list` + fingerprint + health, **no `tools/call` of any mutating tool** (§6.9). |

These are testable and belong in CI ratchets (§10), the way `lint:views` / `lint:definer-fns` /
`lint:action-risk` already freeze other invariants.

## 2.1 Owner non-negotiables — first-class requirements (LOCKED)

These eight are **binding requirements of the design, not preferences.** Each names where it is satisfied.

1. **Cached connector info is never "verified" and never a live fact.** Any stored connector state must
   self-identify as a **snapshot** carrying `checked_at`, an explicit **freshness/staleness** classification,
   and an explicit **`not_live_verified`** state. It may never be labeled "verified"/"connected" as a
   present-tense fact. → §8 rule 1, §9 (state machine), §4.2 (`checked_at`/`health`). *Change:* relabel and
   generalize the readiness block (`n8nChatEvidence.ts:17`).
2. **Live-discovery-first for any current-state question.** For a connected provider's inventory,
   permissions, tools, workflow/tool **count**, health, or availability, Chat MUST call the applicable **live
   discovery tool first** — or state the **exact reason** it cannot (that reason maps to a §9 state). → §8
   rules 2/5/6, §6.1.
3. **No count/scope/permission/connection-state/tool-availability assertion without a current tool receipt —
   STRUCTURAL, not prompt wording.** Enforced by a **runtime rule + regression tests**, never by prompt text
   alone. → §8 (enforcement is now mandatory-structural), §10 T1–T5.
4. **Prompt-injection protection preserved.** Paige receives a **server-generated safe capability summary**
   (grammar-constrained tool names, closed-vocabulary effects, counts, operator-approved labels) — **never
   raw MCP schemas or tool descriptions** in her prompt. → §5.4, §3.4.
5. **Identity is an immutable `connection_id`** — never a singleton provider row and never a mutable label.
   The join key everywhere is `connection_id`; `label` is a **mutable human name** for display/addressing
   only (rename ≠ re-identify; approvals/receipts bind to the id). → §I-1/§I-2, §4.2.
6. **Non-destructive migration for BOTH existing n8n paths.** A migration/compatibility plan that
   **preserves existing connections, workflow records, approvals, and history** across the n8n MCP-OAuth lane
   *and* the n8n API-key REST lane (and Zapier). Additive → backfill → cutover → retire; **no "replace
   everything."** → §12.1.
7. **GHL cross-tenant contact-ID collision is a SEPARATE tenant-isolation issue** with its own scope + owner
   (§9/§51), **not** buried in the gateway work. → §11 carve-out.
8. **Integrations becomes a general multi-connection workspace.** The connection *model* the surface exposes
   is "**Add MCP connection**," named connections, per-connection tool discovery, health, policies, and
   receipts — **not hardcoded provider cards.** (The behavioral model is CC's to specify; the visual is
   Claude Design's, §00.) → §5.1 verbs, §9 states, §3.3.

---

## 3. Current-state grounding — the ACTUAL path, end to end

### 3.1 There are two directions and (for n8n) two lanes — the map

```
OUTBOUND  (Paige is the MCP CLIENT — this program)          INBOUND (separate; NOT this program)
─────────────────────────────────────────────────          ────────────────────────────────────
 generic core:  _shared/mcp-client.ts                        paige-mcp/index.ts  (119 tools)
                _shared/mcp-oauth.ts                          _shared/paige-mcp/governed-adapter.ts
                _shared/mcp-outcome.ts                        _shared/paige-mcp/capability-policy.ts
 registry:      public.tenant_mcp_connections                → refuses ALL 68 mutations today
 callers:       call-zapier-action  (run + discovery)          (a connection authorizes the DOOR,
                tenant-mcp-connect   (connect/probe/approve)     never consequential action)

 n8n MCP-OAuth lane (uses the generic core):
    tenant-n8n-oauth · _shared/n8n-oauth.ts · _shared/n8n-management.ts (12 tools in Chat)
    store: tenant_mcp_connections WHERE provider='n8n'
 n8n API-key REST lane (does NOT use the generic core):
    paige-n8n · _shared/n8n-run.ts · _shared/n8n-api-validation.ts
    store: tenant_n8n_connections   (+ tenant_n8n_discoveries snapshots, sync_tenant_workflows registry)
```

### 3.2 The generic client core (verified — this is the asset to keep)

- **Transport:** Streamable-HTTP only, protocol `2025-06-18` pinned (`mcp-client.ts:49`). One `POST` per
  request; `Accept: application/json, text/event-stream`; dual framing via `parseEnvelope` (`:319`); no
  stdio, no SSE *session* (stdio removed `20261005…:22`; SSE narrowed to HTTP `20261014…`). All egress
  through `safeFetch`/`assertPublicHttpUrl` (https-only, no embedded creds, public addresses, no redirects,
  bounded 15 s / 1 MiB).
- **Session lifecycle:** `withMcpSession` (`:218`) does `initialize` → reads `Mcp-Session-Id` header →
  `notifications/initialized` → body → `DELETE` in `finally` (405 = normal stateless server). Leak-safe on
  mid-handshake failure.
- **Discovery:** `collectToolPages` (`:427`) follows `nextCursor` in one session, bounded 20 pages / 2000
  tools, stops on echoed cursor. Two shapes: `mcpListTools` (name + description only) and
  `mcpListToolFingerprints` (`McpToolFingerprint`: `name, description, schemaHash, authorityHash, pin, app,
  actionType, effects`, `:356`). **Input schema never leaves the module** (`:374`); **description is
  human-only, never to a model** (`:352`).
- **Approval integrity:** approval is pinned to `pin = hash(schemaHash + authorityHash)`; drift (schema OR
  authority OR server URL) fails closed. `withApprovedCapabilitySession` (`:298`) lists + calls **in one
  session** to close the mid-deploy substitution race.
- **Governed run:** `callApprovedCapability` (`mcp-outcome.ts:188`) — four ordered checks (approved? pin
  recorded? still offered? pin unchanged?) before `tools/call`. Result validated to `{content[],isError?}`;
  anything else is a shape failure, never a success.
- **Model boundary:** `projectOutcomeForModel` (`mcp-outcome.ts:389`) and `describeShape` (`:155`) emit
  **counts/type-names/char-totals only** — no provider text; a standing `untrusted:true`; opaque
  `evidence_ref`. Capability names are grammar-constrained identifiers (`^[A-Za-z0-9_.:-]{1,64}$`) enforced
  at storage (`20261015…`), so prose/injection can't be stored as a capability name.
- **OAuth:** `mcp-oauth.ts` — discovery (RFC 9728/8414, issuer + same-origin checks), DCR (RFC 7591, public
  client), PKCE-S256 only, single-use `state`, rotation-safe refresh, `revoke`. Token writers service-role
  only; verifier encrypted with 10-min single-use state (`20261007…`).

**This core already satisfies most of I-5..I-8's *mechanics*.** What it lacks is a *connection-keyed
identity* to hang them on.

### 3.3 The singleton / n8n-special-casing (the P-A finding — verified)

- `tenant_mcp_connections` created **PK `tenant_id`** (one row per tenant, `20260804130000…:30`), re-keyed to
  **PK `(tenant_id, provider)`** with **`provider CHECK IN ('zapier','n8n')`** and `ON CONFLICT (tenant_id,
  provider) DO UPDATE` (`20261005…:41,46,345`). **A reconnect overwrites; a second connection to the same
  provider is impossible; only two providers are expressible.**
- **Approvals, capability pins, OAuth tokens, status, `tools_cache`, `last_error`** all live on that one
  singleton row (`20261005…`, `20261006…`, `20261008…`). So *everything* per-connection is actually
  per-`(tenant, provider)`.
- **Provider is hardcoded in the type too:** `McpProvider = "n8n" | "zapier"` (`mcp-outcome.ts:32`), plus
  provider-branded CHECKs (transport, auth-kind) and `_mcp_check_provider` (`20261005…:234`).
- **n8n has a *second* store and lane:** `tenant_n8n_connections` (PK `tenant_id` — also singleton),
  `paige-n8n`, `n8n-run.ts`. The only generic outbound *runner* is `call-zapier-action`; provenance is
  Zapier-shaped (`record_capability_run` hardcodes `_capability_key:"zapier_run_action"`,
  `mcp-outcome.ts:855`).
- **The front-end mirrors the hardcoding:** the Solo Integrations surface is a **provider-catalog of fixed
  cards** (`src/solo/integrations.tsx` — Zapier `:55`, Meta/GA4 referenced `:124`) with per-provider
  Connect/Manage and a "custom system" note that says "issue a scoped API key, point a webhook" (`:161`).
  There is **no general "add an MCP connection" flow.** (Reported as *behavior*; visual design is CD's, §00.)

### 3.4 "Paige is very limited in what she can see" (the P-B finding — verified)

Two distinct causes, both real:

1. **Structured capability is withheld from the model *by design*.** Tool schemas never leave `mcp-client.ts`;
   descriptions are human-approval-only; the model sees only counts/shape (`mcp-outcome.ts:155,389`). This is
   a *correct* prompt-injection defense — but it means Paige currently has **no safe, structured way to
   reason about what a connection can do**. The fix is not to leak raw provider text to the model; it is a
   **capability-understanding layer** (§5.4) that gives Paige *sanitized, operator-vetted* semantics.
2. **The connection facts Chat *does* see are cached, not live.** `renderN8nReadinessForChat`
   (`n8nChatEvidence.ts:17`) is built from a stored RPC `get_n8n_spine_readiness` — historical DB state — and
   injected at `paige-ai-chat/index.ts:4638`. `tools_cache` is a "display hint," not a live inventory
   (`20260804130000…:38`). So Paige's *sense* of a connection is a snapshot she is told is "verified."

### 3.5 The false-claim failure — root cause (the P-C finding — verified; transcript not observed)

The chat message array injects the n8n readiness block at `paige-ai-chat/index.ts:4638` and a second
capability-status "workflows connected" claim at `:4643`, both from the **same cached evidence**
(`:4566-4583`). The block's header is `=== N8N CONNECTION READINESS — VERIFIED WORKSPACE SOURCE ===`
(`n8nChatEvidence.ts:17`); it states connection + counts as fact (`:25,28`); the "approvals ≠ inventory /
use live MCP discovery / never speculate no workflows exist" caution is *subordinate prose in the same
block* (`:31`). The live, ID-free discovery tool exists (`n8n_list_workflows`, `required:[]`,
`n8n-management.ts:16`; executed via `withApprovedCapabilitySession`) but **no prompt text names it as the
discovery entry point**, and the operating-core honesty rules (`index.ts:5085-5097`) never forbid asserting
cached readiness as a live connection fact. **Net:** the model was handed stale facts labeled verified and
no ID-free-discovery affordance, so it (a) stated connection/count before a receipt and (b) implied
discovery needed IDs, then reported the real inventory only after finally calling live discovery.

**Fix sites named (for the plan, not built here):** `n8nChatEvidence.ts:17-34`;
`paige-ai-chat/index.ts:4566-4569,4638,4643`; `n8nReadiness.ts:20-44`; `index.ts:4345,5085-5097`; anchored
to `provider-result-contract.md` R1/R2/R3/R7 + §4.2.

### 3.6 Gaps inventory (consolidated)

| Gap | Evidence | Severity vs requirement |
|---|---|---|
| Singleton per `(tenant, provider)`; no `connection_id` | `20261005…:46`; `20260804130000…:30` | **Blocker (I-1/I-2)** |
| Provider is a 2-value CHECK + a TS union; GHL/Meta unrepresentable | `20261005…:41`; `mcp-outcome.ts:32` | **Blocker (I-3)** |
| OAuth state, approvals, pins, health, error all singleton-scoped | `20261006/07/08…` | **Blocker (I-4)** |
| Tool catalog namespaced by `(tenant, provider)`, not connection | approvals live on the provider row | **Blocker (I-5)** |
| n8n has a second store + its own lane (special-casing) | `tenant_n8n_connections`, `paige-n8n`, `n8n-run.ts` | **High (I-3)** |
| Only `call-zapier-action` is a generic runner; provenance Zapier-shaped | `mcp-outcome.ts:855` | High |
| Cached readiness presented to the model as "verified" | `n8nChatEvidence.ts:17` | **High (I-7/P-C)** |
| No safe capability-understanding layer for the model | schemas/descriptions withheld by design | **High (P-B)** |
| API-key n8n `status='connected'` written at save, no probe | `20260711210000…:97` | High (false green) |
| Only Streamable-HTTP; SSE/stdio removed | `20261014…`, `20261005…:22` | Medium (limits some MCPs) |
| Authority fingerprint depends on provider `_meta` | `mcp-client.ts:458` | Medium |
| No retention jobs for evidence / oauth_state | `20261006…:66`, `20261007…:88` | Low |
| Multiple workflow state stores for n8n | `tenant_n8n_discoveries`, `sync_tenant_workflows` | Low (reconcile) |

---

## 4. The generic, tenant-scoped MCP Connection Registry (data model — design only)

**Principle:** provider becomes **data**; connection becomes **identity**; every per-connection fact hangs
off `connection_id`. This *extends* the existing table's careful security posture (encrypted secrets,
owner-only RLS, service-role decrypt, honest status) — it does not fork a new store (§18/§30). Migration is
additive-then-cutover (§208 shape discipline), never a destructive drop.

### 4.1 `mcp_providers` — the provider descriptor (replaces the enum, satisfies I-3)

A row per known provider shape. **Data, not code.** Illustrative columns:

```
provider_key        text PK            -- 'n8n' | 'zapier' | 'gohighlevel' | 'meta' | 'generic-http' | …
display_name        text
auth_kind           text[]             -- allowed: 'oauth' | 'bearer' | 'header' | 'url'  (per provider)
transport           text[]             -- 'http' (today); 'sse'/'stdio' only if/when the client supports them
oauth_discovery     jsonb              -- issuer/endpoints hints; NULL = pure DCR discovery
resource_url_shape  text               -- optional validator hint (e.g. n8n '/mcp-server/http')
default_scopes      text[]             -- the connection's *ceiling* scopes (max authority)
account_class       text               -- 'single' | 'multi' (multi ⇒ many named connections expected)
notes               text
```

- **No CHECK enumerates providers.** Adding GoHighLevel is inserting a row; the client already speaks generic
  MCP. Provider-specific quirks (n8n's owner-bound OAuth, Zapier's DCR-against-mcp.zapier.com, a
  URL-in-path Zapier per-user server) are **descriptor fields + a small declarative adapter**, never a
  forked table or lane.
- The n8n **API-key REST lane** is modeled as `provider_key='n8n'` with `auth_kind` including a REST mode —
  or, cleaner, folded so that n8n's MCP endpoint is the one path (see §12 D-3). Either way it stops being a
  parallel special case.

### 4.2 `mcp_connections` — the connection (replaces the singleton, satisfies I-1/I-2/I-4)

```
connection_id       uuid PRIMARY KEY DEFAULT gen_random_uuid()
tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
provider_key        text NOT NULL REFERENCES mcp_providers(provider_key)
label               text NOT NULL                       -- MUTABLE human name ("GHL — Northeast"); rename ≠ re-identify
UNIQUE (tenant_id, provider_key, label)                 -- addressing convenience only; identity is always connection_id
server_url_ct       bytea                               -- encrypted (platform_encrypt), never row-read
auth_kind           text NOT NULL                       -- constrained to the provider's allowed set
auth_ref            -- Vault-backed reference: auth_token_ct / refresh_token_ct / oauth_* — PER CONNECTION
granted_scopes      text[]                              -- the ceiling for THIS connection (I-6)
status              text  -- 'unconfigured'|'pending_verification'|'connected'|'error'  (probe writes 'connected')
health              text  -- 'unknown'|'checking'|'healthy'|'needs_attention'
last_checked_at     timestamptz                         -- observed_at, per provider-result-contract R3
last_error_code     text                                -- closed enum; provider error text NEVER stored raw
visibility          text  -- 'tenant' | 'owner_only' | future per-member scoping
owner_policy        jsonb -- per-connection autonomy ceiling / allow-list (see §7)
created_by/updated_by, timestamps
```

- **Discovery + approvals move to child tables keyed by `connection_id`** (§4.3), so the connection row stays
  lean and the tool catalog is naturally per-connection (I-5).
- **RLS/secret posture unchanged:** owner/admin-only ALL policy, **no member SELECT of ciphertext**, all
  access via `SECURITY DEFINER` RPCs, decrypt is service-role only. Every RPC keys on `connection_id` and
  re-resolves tenant server-side (never from the body) — the existing `_mcp_resolve_tenant` pattern,
  extended.

### 4.3 Per-connection discovery, tools, approvals, receipts, evidence (satisfies I-5, I-7)

```
mcp_connection_tools        (connection_id, tool_name, schema_hash, authority_hash, pin,
                             app, action_type, effects[], discovered_at)   -- the namespaced catalog
mcp_connection_approvals    (connection_id, tool_name, pin, approved_by, approved_at)  -- pins per connection
mcp_connection_receipts     -- reuse record_capability_run / Rail, keyed with connection_id + tool_name
mcp_connection_evidence     -- reuse tenant_mcp_call_evidence shape, keyed by connection_id (30-day, no raw readback)
```

- **Namespacing (I-5):** a runtime capability is addressed `⟨connection_id⟩::⟨tool_name⟩`. Two GHL locations
  each offering `create_contact` are distinct capabilities with distinct pins and distinct receipts. No
  collision is possible because the connection is part of the key.
- **Pins already exist** (`schemaHash`/`authorityHash`/`pin`) — they simply move from the provider row to
  `mcp_connection_tools`/`_approvals`. "Approvals follow the endpoint" (`20261012…`) generalizes to
  "approvals follow the *connection*": disconnect or server-URL change on a connection clears only *that*
  connection's approvals.

### 4.4 Reference connection shapes (no provider configured or called)

| Provider | Today | Natural multiplicity | Descriptor shape under §4.1 |
|---|---|---|---|
| **n8n** | MCP-OAuth lane (`provider='n8n'`) **+** parallel API-key REST lane; both singleton. | Two instances (self-hosted + Cloud), or two accounts. | `auth_kind:['bearer','header']` (and/or oauth), `transport:['http']`(+sse if client gains it), `resource_url_shape:'/mcp-server/http'`, owner-bound OAuth as a descriptor flag, `account_class:'multi'`. |
| **GoHighLevel** | **Not an MCP connection.** Exists only as a contact **import** contract (`import-source-contract-ghl-n8n.md`); its global `clients_ghl_contact_id_uniq` index already **collides across tenants** for two sub-accounts reusing a contact id. | **The archetype:** an agency connects **many sub-account/location** connections. | `account_class:'multi'`, per-location OAuth/API key as separate connections; each location a distinct `connection_id`+`label`. **The cross-tenant collision is exactly what per-connection identity prevents.** |
| **Meta** | **Not an MCP connection.** Registry-listed *future* provider (`id:"meta"`, scopes "per-tenant, future"). (Reachable in *this session's* agent tooling, but that is the agent's tooling, not Paige's tenant registry.) | Multiple ad accounts / Pages / IG accounts per tenant. | `account_class:'multi'`, OAuth with per-connection scopes; each ad account/page a distinct connection. |

All three are **instances of the same model** — none needs a bespoke table, lane, or CHECK. That is the
"general connection" the owner asked for.

---

## 5. The generic Connected-MCP Gateway contract (design only — reuses existing seams)

The gateway is **not a new authority/approval/receipt system** (§18). It reuses the SDK/Foundations
**Capability Kit** pattern (`define → authorize(decideGovernedExecution) → execute → receipt`) and the
existing MCP client. It adds a **connection-aware capability source** and a **capability-understanding
layer**.

### 5.1 Connection lifecycle verbs (all generic; no provider special-casing)

```
connect(provider_key, label, auth_input)   → create connection row (status unconfigured→pending_verification)
intake(connection_id)                       → SAFE READ-ONLY probe: initialize + tools/list + fingerprint + health
                                              (writes status=connected ONLY on a live probe; NO mutating tools/call)
list_capabilities(connection_id)            → the namespaced, sanitized catalog for reasoning (§5.4)
approve(connection_id, tool_name, pin)       → tenant-admin pins a capability (per connection)
prepare(connection_id, tool_name, args)      → build a governed proposal (no external call)
execute(connection_id, tool_name, args)      → governed run through decideGovernedExecution → tools/call → receipt
health_check(connection_id)                  → re-probe; updates health + observed_at
disconnect(connection_id)                    → revoke tokens + clear that connection's approvals/pins only
```

### 5.2 One generic runner (retire the Zapier-shaped hardcoding)

Replace the single `call-zapier-action` runner + Zapier-literal provenance with **one connection-parameterized
runner** that takes `connection_id` and resolves provider behavior from the descriptor. n8n's REST lane and
Zapier both route through it; `record_capability_run`'s capability key becomes the namespaced
`⟨connection_id⟩::⟨tool_name⟩`, not a literal `"zapier_run_action"`.

### 5.3 `defineCapability` binding (the Capability Kit, per SDK/Foundations D-1/D-10)

A connected MCP tool is expressed as a `defineCapability({...})` entry whose `executor` calls the gateway's
`execute(connection_id, tool_name, args)`. Risk stays delegated to `action-risk.ts`; approval stays the one
`paige_pending_confirmations` gate; outcome stays `recordCapabilityRun` → Rail. **The kit is what makes it
impossible for the MCP lane to fork its own gate.**

### 5.4 The capability-understanding layer (fixes P-B without leaking untrusted text)

Paige needs to *reason* about what a connection can do, but raw provider descriptions/schemas must never
reach the model (injection). Resolve the tension with a **sanitized, structured capability summary** the
model *is* allowed to see:

- **Allowed to the model:** the grammar-constrained `tool_name`, the closed-vocabulary `effects[]`
  (`read|create|update|send|delete`), `app`/`action_type` (bounded), a **count** of tools per connection,
  and **operator-approved** capability labels/notes. All of this is data Paige can plan over.
- **Never to the model:** raw provider `description`, raw input schemas, raw results (only shape/counts) —
  unchanged from today.
- **Human-facing (approval screen):** the bounded description *is* shown to the operator deciding what to
  approve (already the design). Paige can *ask the operator* to approve/label a capability rather than
  reading provider prose herself.

This gives Paige a real, safe map of "what can I do across these connections?" — the thing she is missing
today — while keeping the injection defense intact.

---

## 6. Behavior specification (discovery · read · prepare · execute · external-effect · errors · retries · receipts · intake)

### 6.1 Discovery
Live `tools/list` over the connection's session, cursor-paginated and bounded; fingerprint each tool
(schema+authority+pin); persist to `mcp_connection_tools` with `discovered_at`. **Discovery requires no tool
IDs** and enumerates all tools. Discovery is **read-only** and is the *only* source of a live inventory
claim (I-7).

### 6.2 Read
A tool whose `effects` are `['read']` (or `readOnlyHint`) may run under the tenant's read lane. Reads still
produce an **outcome + receipt** (see 6.7) — today n8n reads are deliberately *not* recorded
(`n8n-management.ts:126`); the gateway should record at least a lightweight "read observed" receipt so
Paige's *seeing* is itself auditable (supports I-7).

### 6.3 Prepare
Build a governed proposal: resolve `connection_id` + `tool_name` + args, classify via `action-risk.ts`,
compute the confirmation fingerprint, and stage a `paige_pending_confirmations` row with the **stored** args.
**No external call happens in prepare.** This is the "draft-first" step (§36) for MCP actions.

### 6.4 Execute
`decideGovernedExecution` runs its fail-closed sequence (identity, server-resolved tenant, capability
identity, availability, classification/effect, autonomy floor, approval-by-shape). On `execute`, the gateway
opens **one session**, re-lists + re-verifies the pin (drift → refuse), then `tools/call` the stored args,
then records the receipt. The pin re-check and the call are the same session (no substitution window).

### 6.5 External-effect actions
A tool with `effects` containing `send|create|update|delete` is `high` risk → autonomy clamps `auto→confirm`
→ requires a live confirmation from `paige_pending_confirmations` (the ONE gate). MCP **mutations remain
deferred** per SDK/Foundations **D-3** (MCP door read-effective until P6) — the gateway must treat an
external-effect capability as **prepare-only / needs-approval** until the owner opens the mutation channel.
Real-money-capable providers (n8n, Zapier, Meta, GHL can all trigger downstream spend) additionally bind
**M1 real-money spend control**, which is **unbuilt** — so those are `UNAVAILABLE` for autonomous execution
until M1 lands (§17/integration registry).

### 6.6 Errors
Closed error vocabulary per layer (already exists): connection errors (`not_connected`, `provider_unavailable`,
`token_expired`, `provider_scope_refused`), gateway refusals (`not_approved`, `no_recorded_contract`,
`no_longer_offered`, `contract_changed`), decision refusals (the 13 fail-closed codes). **Provider error
text is never forwarded to the model** — it is re-worded from a fixed map and retained (bounded) only in
service-role evidence.

### 6.7 Retries
**Never auto-retry an uncertain external write** (already the rule: `n8n-management.ts` "provider writes are
never automatically retried after uncertain results"; the orchestration adapter reconciles on readback
rather than re-firing). A dispatched-but-unanswered write is `outcome_unknown` / `capability_outcome_unknown`
— surfaced honestly, reconciled by re-reading provider state, never re-sent blindly.

### 6.8 Receipts
Every consequential run writes `record_capability_run` → workspace Rail (and per-client Rail when a contact
is in scope), keyed by the **namespaced** capability and `connection_id`; redacted, idempotent on a stable
run id. Evidence (bounded, scrubbed, encrypted, 30-day, **no raw readback to a JWT caller**) supports
support/debug without exposing provider bytes.

### 6.9 Proactive first-day operational intake (the target experience)
On connect, the gateway runs a **safe read-only intake** per connection: `initialize` → `tools/list` →
fingerprint → health probe → persist the namespaced catalog → surface to the operator "here is what this
connection can do; approve the ones you want me to use." **No mutating `tools/call` runs during intake.**
Paige then reasons across *all* connected catalogs (via §5.4) and proposes actions under the owner's rules.
This is the concrete "connect many once → safe intake → reason and act" flow.

---

## 7. Provider-permission vs Paige-policy model (satisfies I-6)

Two independent layers; the effective action is the **intersection**, and Paige's side can only ever *narrow*.

- **Layer 1 — Provider permission = the ceiling.** What the connection *technically* can do: the
  `granted_scopes` on that connection (e.g. n8n `workflow:read`+`workflow:write`; a Meta connection's
  granted Graph scopes). This is the **maximum possible authority** and it is a fact about the provider grant,
  stored per connection. *A grant is not action approval* — the n8n code already says this
  (`n8n-oauth.ts:1-4`).
- **Layer 2 — Paige policy = the governor.** Whether Paige may **read / prepare / execute** a given
  capability *right now*: `decideGovernedExecution` (identity, tenant, capability, classification, autonomy
  lane via §67/§68 Trust Compass + decay, one-approval-gate), plus the per-connection `owner_policy`
  (an allow-list / autonomy ceiling the owner sets for *that* connection), plus platform gates (MCP
  mutations deferred D-3; M1 for money).
- **The rule:** `effective_action = min(provider_ceiling, action_risk_class, autonomy_lane, owner_policy,
  platform_gate)`. A connection can never grant Paige more than her policy allows, and her policy can never
  reach past what the provider granted. Door-blindness (R7) means reaching a capability from Chat vs. an
  automation vs. a skill never changes the answer.

---

## 8. Chat truth-boundary rules — the exact prohibitions (fixes P-C / I-7)

**The rule, stated normatively.** *Chat may not state a connection, permission, workflow-count, or
tool-availability fact unless one of the following is true this turn:* (a) it was produced by a **live tool
result** this turn (a `tools/list` receipt for inventory/availability; a `tools/call` receipt for an
action outcome), **or** (b) it is explicitly presented as **cached / last-observed**, stamped with
`observed_at`, and worded as "as of ⟨time⟩," never "connected"/"verified"/a bare count. Absence of a live
result is **UNKNOWN**, never "not connected" and never "no workflows."

**Concrete prohibitions (map to `provider-result-contract` R1/R2/R3/R7):**

1. **No "connected" from cached readiness.** The injected block must stop calling itself
   `VERIFIED WORKSPACE SOURCE` and stop stating "connected"/counts as fact. It becomes
   `LAST-OBSERVED CONNECTION STATE (as of ⟨observed_at⟩ — NOT a live check this turn)` with an explicit
   instruction: *to state connection status or inventory, call the discovery tool first.* (Fix site:
   `n8nChatEvidence.ts:17-34`; generalize to a `renderConnectionReadinessForChat` across all providers.)
2. **No inventory/count claim without a `tools/list` receipt this turn.** "You have N workflows/tools" is a
   live-receipt-only statement. A cached count may only be spoken as "as of ⟨time⟩ I last saw N."
3. **No "not connected"/"nothing there" from an empty or failed read.** Empty ≠ absent; failed read ≠
   disconnected (already soft-stated `n8nChatEvidence.ts:21`; make it structural).
4. **Approvals ≠ inventory.** "Approved tools/workflows" is a consent count, never the provider's total.
   (Already soft-stated `:31`; make it structural.)
5. **Name the ID-free discovery entry point.** The operating core must tell the model that
   `list_capabilities`/`n8n_list_workflows` needs **no ID** and is *the* way to learn inventory — killing the
   "discovery needs known IDs" implication (fix site: `index.ts:5085-5097` / `buildNeutralCorePrompt`).
6. **Availability is per-connection and live.** "Can you do X on GHL?" must resolve against a live probe of
   *that* `connection_id`, not a global or cached sense.

**Enforcement posture — structural is MANDATORY; prompt wording alone is insufficient (owner non-negotiable
#3).** Prompt wording is necessary but is exactly what failed here, so the durable enforcement is structural
and cannot be skipped. All three ship together; none substitutes for another:
- **(a) A projection that refuses** to emit a bare count / "connected" / availability unless it carries
  either a **same-turn tool receipt** or a `checked_at` freshness stamp **plus** an explicit
  `not_live_verified` flag. The readiness renderer cannot emit "verified"/"connected" as a bare present-tense
  fact.
- **(b) A CI ratchet** (sibling of `lint:views` / `lint:definer-fns`) that fails the build if the readiness
  renderer or capability-status block emits "verified"/"connected"/a bare count as a present-tense assertion.
- **(c) The T1–T5 regression tests** (§10) pin the contract and must stay green.

---

## 9. Minimal UX states (behavioral state machine — visual rendering is Claude Design's, §00)

Six states every connection surfaces; each is a **fact the backend can prove**, with a defined transition
and what Paige may say/do in it. (What they *look like* is CD's.)

| State | Backend meaning (proven) | Paige may say/do | Transition |
|---|---|---|---|
| **Checking** | A live probe is in flight (`health='checking'` / `status='pending_verification'`). | "Checking ⟨label⟩ now…" — no capability/inventory claim. | → Available / Provider unavailable / Permission denied on probe result. |
| **Available** | Live `tools/list` this session succeeded; catalog fingerprinted; `status='connected'`, `health='healthy'`, fresh `observed_at`. | State inventory/capabilities (live receipt); propose approved actions. | → Needs approval (for an unapproved external-effect tool); → Provider unavailable on later failure. |
| **Permission denied** | Provider returned an auth/scope refusal (`provider_scope_refused` / `token_expired` / `invalid_grant`). | "⟨label⟩ refused the scope / needs reconnect" — never "not connected." | → Checking after reconnect/refresh. |
| **Needs approval** | Capability is external-effect and unpinned/unapproved, or MCP-mutation channel deferred (D-3), or M1 required. | Prepare a proposal; ask the owner to approve; do **not** execute. | → Available-to-execute once approved (and channel/M1 open). |
| **Provider unavailable** | Live probe failed for a non-auth reason (network/5xx/timeout/SSRF-refused). | "Couldn't reach ⟨label⟩ just now (⟨reason⟩)"; last-observed only with `observed_at`. | → Checking on retry. |
| **Unsupported** | The connection needs a transport/auth the client doesn't implement (e.g. stdio/SSE-session), or the provider isn't in `mcp_providers`. | "That connection type isn't supported yet." | Terminal until the client/descriptor gains support. |

**Note:** "Available" is the **only** state in which Paige may state inventory/capability as fact, and only
from the live receipt that produced it — this is §8 rendered as a state machine.

---

## 10. Test cases covering the n8n failure conversation

Written to **preserve** the intended contract (mirrors the #1255 hard constraint: fix behavior, never weaken
a test). These are behavioral specs for the plan, not yet-authored tests.

**Truth-boundary (the exact failure):**
- **T1 — No connection claim before a live receipt.** Given cached readiness says "connected, 203 workflows"
  and **no** `tools/list` ran this turn, the assembled model context must NOT contain a bare "connected"/
  count as fact; it must carry an `observed_at`-stamped "last-observed" label. *(guards the injected block.)*
- **T2 — Inventory only from a live `tools/list`.** A turn that states a workflow/tool count must have a
  `tools/list` receipt in the same turn; otherwise the count is phrased "as of ⟨time⟩."
- **T3 — Discovery needs no ID.** `list_capabilities`/`n8n_list_workflows` invoked with **no** id returns the
  full enumeration; the prompt names it as the discovery entry (assert the operating core mentions the
  ID-free discovery tool).
- **T4 — Approvals ≠ inventory.** "0 approved" must never render as "0 workflows"/"nothing connected."
- **T5 — Empty/failed read ≠ absent/disconnected.** An errored/empty discovery yields "unknown," not "not
  connected"/"no workflows."

**Multiplicity / generality (I-1..I-5):**
- **T6 — Two connections, same provider.** A tenant creates `GHL — A` and `GHL — B`; both persist with
  distinct `connection_id`; neither overwrites the other. *(Fails on today's `ON CONFLICT (tenant,provider)`.)*
- **T7 — Namespaced catalog, no collision.** Both GHL connections expose `create_contact`; the two are
  distinct capabilities with distinct pins and distinct receipts.
- **T8 — New provider is a row, not a migration.** Inserting a `gohighlevel`/`meta` descriptor + a
  connection works with no schema change and no code branch.
- **T9 — Per-connection OAuth isolation.** Reconnecting `Meta — Brand A` does not touch `Meta — Brand B`'s
  tokens/approvals.

**Governance (I-6, unchanged invariants):**
- **T10 — Ceiling vs governor.** A connection granted `write` scope still cannot execute an external-effect
  tool without the one approval gate; door (chat/automation/skill) doesn't change the decision.
- **T11 — Intake is read-only.** `intake(connection_id)` performs `initialize`+`tools/list` only; assert **no
  mutating `tools/call`** is issued.
- **T12 — Mutation deferral (D-3) + M1.** An external-effect MCP capability resolves to needs-approval /
  UNAVAILABLE (money) until the owner opens the channel and M1 exists.

**Regression guards to reuse:** the existing session-race, pin-drift, scope-refusal, SSRF, and
egress-to-model smoke suites (`scripts/mcp-*-smoke.mjs`, `scripts/n8n-egress-smoke.mjs`,
`scripts/paige-n8n-ssrf-smoke.mjs`, `mcp-governed-door.test.ts`) all still apply and must stay green.

---

## 11. Collision map

| Stream | State (verified) | Collision with this program | Posture |
|---|---|---|---|
| **CRM #1234** (`feat(crm): complete governed Paige operational access`) | **OPEN / draft, NOT merged** (`html_url` PR 1234; base `main@6dc26157`). Reuses the **existing Capability Gateway, action-risk/autonomy, single-use confirmation, capability receipt, Rail** seams; adds 32 CRM Chat actions. | **Prerequisite + shared seams.** The MCP gateway reuses the *same* Capability Kit / `decideGovernedExecution` / approval / receipt seams #1234 exercises. Building on those before #1234 lands risks editing the exact files it touches. | **BLOCKED until #1234 merges + fresh-`main` collision pass** (matches SDK/Foundations **D-2**). No gateway build starts before then. |
| **Chat/Knowledge regression #1255** (`ci/verify` red on `main` — a scope-switched document turn makes an unexpected provider call) | **OPEN.** Deterministic `test:knowledge-scope` 15.9 failure + one §9 governance assertion; owner ruling: fix **source behavior** in `paige-ai-chat`, never weaken the test. | **Same file, adjacent concern.** Both the fix and this program touch `paige-ai-chat/index.ts` governance/turn logic. #1255 is *provider-call-before-re-check*; our §8 is *fact-claim-before-receipt* — sibling truth/governance defects. | **Sequence #1255 first / coordinate.** Do not touch the Chat turn seam until #1255 is green; our §8 changes ride the same file and must not mask or reopen it. |
| **Approved Paige SDK/Foundations program** (`docs/architecture/paige-sdk-platform-foundations-program.md`, LOCKED 2026-09-13) | Establishes the door-blind `governedExecution` seam, the Capability Kit (`define→authorize→execute→receipt`), decisions **D-1..D-10**. **D-3: defer MCP mutations + approval channel to P6, keep the MCP door read-effective.** D-2 gates first adoption on #1234. | **Parent program — this is a caller of it.** The Connected-MCP Gateway is a **Category-2/3 consumer** of the Capability Kit; it must not fork a second gate. **This program is the *outbound client*; the SDK doc's §8 MCP readiness is the *inbound server* — do not conflate.** | **Subordinate to it.** Adopt the kit; honor D-3 (external-effect MCP = prepare/needs-approval until P6); honor R7 (n8n/Zapier/GHL/Meta are governed workers, never a bypass). |

> **Carve-out (owner non-negotiable #7) — filed SEPARATELY, NOT part of gateway scope.** The GoHighLevel
> cross-tenant contact-ID collision — `clients_ghl_contact_id_uniq UNIQUE (ghl_contact_id)` is **global, not
> tenant-scoped** (`import-source-contract-ghl-n8n.md`), so two tenants importing from two GHL sub-accounts
> that reuse a contact id collide across the tenant boundary — is a **tenant-isolation defect (§9/§51) in the
> contacts/import domain**, independent of the MCP gateway. Track it as its **own issue with its own scope +
> owner** (recommended owner: the Clients/People + platform-security lane; fix: re-key the index to
> `(tenant_id, ghl_contact_id)` under §208 shape discipline + §37 producer inventory). It is recorded here
> only so the gateway does not silently inherit or mask it. **Do not fix it inside the gateway PRs.**

**Fresh-`main` note (§13):** the SDK/Foundations doc was grounded at `origin/main 1d1eabd`; this review is
against the working tree with #1234 open at head `5849f5a2`. A **fresh-`main` collision pass is mandatory
before any build** (per D-2) — this document does not assert current-`main` beyond what it cites, and the
build gate is **not** met today.

---

## 12. Phased implementation plan (proposed — nothing authorized to build)

Every phase is a §4-doctrine MVP slice (built to §13/§32/§70, proven, canonical records updated in the same
PR, live before the next), run by a crew with an adversarial verifier (§39) + compliance officer (§5).
**Gated behind #1234 merge + fresh-`main` collision pass + owner go (D-2).**

| Phase | Deliverable | Depends on / collision |
|---|---|---|
| **G0 (this doc)** | Review package + decisions. | docs-only; safe. |
| **G1** | **Registry re-model (design→migration, additive).** `mcp_providers` descriptor + `mcp_connections(connection_id)` + per-connection tools/approvals/oauth/receipts child tables; backfill the two existing rows; keep old RPCs working during cutover (§208). No behavior change yet. | #1234 seams; run after it merges. |
| **G2** | **Generic runner + namespaced catalog.** One connection-parameterized runner replacing the Zapier-literal path; capability key = `⟨connection_id⟩::⟨tool_name⟩`; `defineCapability` binding (Capability Kit). | SDK/Foundations Capability Kit (P1). |
| **G3** | **Safe read-only intake + capability-understanding layer.** `intake(connection_id)`; sanitized capability summary the model may see; per-connection health. | G1/G2. |
| **G4** | **Truth-boundary fix (§8).** Generalize `renderConnectionReadinessForChat` with `observed_at` labeling; name the ID-free discovery tool in the operating core; structural projection + CI ratchet. | **#1255 must be green first** (same file). |
| **G5** | **Reference providers as data.** Add GoHighLevel + Meta descriptors; fold n8n's REST lane under the model (retire the special case); prove multiplicity (T6–T9) on scoped test tenants (D-5/D-6), **no production provider called**. | Provider OAuth apps (owner-side); M1 for money. |
| **G6** | **External-effect enablement (only if owner opens D-3).** Approval channel for MCP mutations; M1 real-money control for spend-capable providers. | **D-3 owner decision + M1 (unbuilt).** |

### 12.1 Migration & compatibility plan — non-destructive, both n8n paths preserved (owner non-negotiable #6)

**Principle:** additive schema → dual-read + backfill → cutover → retire — **never a destructive replace**
(§58 anti-regression, §208 shape discipline, §198 deprecation-requires-cutover). Existing connections,
workflow records, approvals, pins, and history are preserved for **both** n8n lanes and Zapier.

| Existing store | Rows to preserve | Migration step |
|---|---|---|
| `tenant_mcp_connections` (Zapier + n8n-OAuth rows) | connection, tokens, `approved_capabilities`, `capability_pins`, status | Backfill one `mcp_connections` row per existing `(tenant, provider)`, minting a deterministic `connection_id`; copy tokens/approvals/pins into per-connection children keyed by that id; old table stays readable during cutover. |
| `tenant_n8n_connections` (n8n API-key REST) | connection, `api_health`, `workflow_count`, history | Represent as an `mcp_connections` row (n8n descriptor, REST auth mode); preserve `api_health`/counts as that connection's `health` + `checked_at`. The REST lane is **folded under the model, not deleted.** |
| `tenant_n8n_discoveries` + `sync_tenant_workflows` registry | discovery snapshots, approved workflow ids/pins, per-workflow marks | Map into `mcp_connection_tools`/`_approvals` under the minted `connection_id`; **approvals and pins carry over 1:1 so nothing is silently revoked.** |

**Rules:** (1) every existing connection maps to exactly one new `connection_id`, deterministically — nothing
lost or duplicated; (2) approvals/pins migrate 1:1 — **no tenant has to re-approve** (§58); (3) the old RPCs
keep working until every caller is cut over (§37 producer inventory across the 8 caller classes); (4) old
tables are **deprecated with a cutover, never dropped in the same step** (§198); (5) a post-migration proof
(§32.a) shows row-count parity and that approvals + history survived on prod before the old path is retired.

### The first owner decision required

> **G1-D — Approve the registry re-model shape: a first-class `connection_id` with `mcp_providers` as a data
> descriptor and `(tenant_id, provider_key, label)` multiplicity — replacing the `(tenant, provider)`
> singleton and the two-value provider enum — as the single foundation all connections (n8n, Zapier, GHL,
> Meta, future) sit on.**
> *Recommended: yes.* It is the minimum change that satisfies I-1..I-5 and it is additive/cutover, not a
> rebuild of the (good) client core. Everything else (generic runner, intake, truth-boundary, reference
> providers) builds on it. Nothing is built until #1234 merges, a fresh-`main` collision pass is complete,
> and you give the go.

Secondary decisions to confirm when G1-D is approved: **honor D-3** (defer MCP external-effect execution
until the approval channel exists — recommended yes); **n8n REST-lane disposition** (fold under the model in
G5 vs. keep as a descriptor-flagged mode — recommended fold); **transport scope** (Streamable-HTTP only for
MVP; SSE/stdio only if a target MCP requires it — recommended HTTP-only first).

---

## 13. Cross-references (canonical homes — cited, not restated, §18)

- `docs/architecture/paige-sdk-platform-foundations-program.md` — parent program; Capability Kit; D-1..D-10.
- `docs/doctrine/governed-execution-seam.md` — door-blind decision (adoption note stale; Chat is the inline non-adopter).
- `docs/doctrine/one-approval-gate.md` — the single approval gate.
- `docs/doctrine/autonomy-architecture.md` — §67/§68 lanes, Trust Compass, decay (the "governor").
- `docs/doctrine/paige-modality-neutrality.md` — door ≠ authority (R7).
- `docs/product/provider-result-contract.md` — R1/R2/R3/R7 + §4.2 (the truth-boundary source for §8).
- `docs/integration-registry/` — n8n, zapier-mcp, meta, paige-mcp-door entries; M1 dependency; R7.
- `docs/delivery/import-source-contract-ghl-n8n.md` — GHL as import source + the cross-tenant collision.
- Code: `_shared/mcp-client.ts`, `_shared/mcp-oauth.ts`, `_shared/mcp-outcome.ts`,
  `_shared/n8n-*.ts`, `_shared/paige-spine/domains/n8n*.ts`, `paige-ai-chat/index.ts`,
  `call-zapier-action/`, `tenant-mcp-connect/`, `tenant-n8n-oauth/`, `paige-n8n/`;
  migrations `20260804130000`, `20261005000000`, `20261006-20261017`, `20261202000000`, `20261224000000`,
  and the n8n set (`20260711*`, `2026120100000*`, `20261200000400`).
- CLAUDE.md §00 · §9 · §10 · §13 · §18 · §30 · §32 · §34 · §37 · §38 · §51 · §59 · §67 · §68 · §70.

---

*Read-only grounding + architecture review. Grounded against the working tree by a three-specialist
read-only crew + integrator, each citing `file:line`. The failing n8n conversation transcript was not
observed; the failure is mapped to code paths, not quoted. Nothing was built, configured, connected, called,
migrated, merged, or deployed. Evidence classes: static source + migration reads + GitHub PR/issue state;
no authenticated-runtime or production evidence — none was in scope for a planning package. Stop point: this
package. No build begins until CRM #1234 is merged, a fresh-`main` collision pass is complete, and the owner
authorizes it.*
