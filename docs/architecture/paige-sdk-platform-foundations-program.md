# Paige SDK / Platform Foundations Program — owner-review package

**Status: READ-ONLY GROUNDING + ARCHITECTURE PLAN. Nothing was built, refactored, migrated, published,
installed, merged, or deployed to produce it.** This document formalizes a *program* — a taxonomy, a
proposed contract, a phased plan, and the owner decisions required — so future builders reuse the safe
Paige pattern instead of re-inventing approval, authority, tenant, receipt, or execution systems. It
creates no new Brain, Spine, Harness, Rail, Integration Registry, or source of truth (§18). It builds on
the **existing** Spine / Harness / Orchestration seams; it does not replace or duplicate them.

**Grounded against `origin/main` `1d1eabd` (2026-09-13)** by a Flow-by-Flow read-only crew of seven
grounding specialists plus one adversarial verifier, each citing `file:line`. Where a governing doc
disagreed with the shipped code, the code won and the discrepancy is logged as a §13 correction (§0.5).

**Authority note (§00):** this is backend/platform architecture — Claude Code's jurisdiction (RPC/edge
seams, tenant scope, RLS, the callable seam, CI gates, migrations, proof). It asserts nothing about how
any surface looks; every client/partner-facing *visual* remains Claude Design's.

---

## 0. How to read this

The assignment asked for one thing above all: **distinguish three categories cleanly, and ground what
genuinely exists** rather than assume a recurring pattern is already a packaged SDK.

- **Category 1 — Vendor SDKs/libraries we CONSUME, never rebuild** (§2).
- **Category 2 — Paige-owned internal kits we should FORMALIZE** (§3, §4). These already exist as
  *seams* on `main`; the program packages and standardizes them. They are not greenfield.
- **Category 3 — Future EXTERNAL developer products** (§6, §7, §8). These are genuinely mostly
  missing today; the plan builds them on Category 2.

The single most important finding, stated once here and evidenced throughout: **the safe Paige pattern
is already real code, not a wish.** `_shared/paige-spine/governedExecution.ts` is a pure, door-blind
decision function adopted by ~16 modules, and the platform already runs ~50 structural CI guards that
freeze its invariants. The program's job is **adoption + packaging + external exposure**, not invention.

### 0.5 §13 corrections surfaced by this grounding (code/GitHub beat the docs)

1. **`docs/doctrine/governed-execution-seam.md` says "FOUNDATION SHIPPED, NOTHING ADOPTS IT YET."**
   **Stale.** `decideGovernedExecution` is now imported/adopted by 16 modules —
   `paige-mcp/governed-adapter.ts`, `paige-capability-gateway/gateway.ts`,
   `paige-orchestration/{engine,decide,adapters,native-adapter,approve-executor}.ts`,
   `paige-write-back`, `paige-native-event-dispatch`, `nav-pull-profile`, `business-verifier`,
   `contact-authz`, `social-provider`, `paige-skill`. **Chat is the notable non-adopter** (keeps its
   proven inline sequence in `paige-ai-chat/index.ts`).
2. **`docs/delivery/harness-completion-map.md` says PR #1157 "owns Layers A/B — do not touch."**
   **Stale.** PR #1157 is **CLOSED, not merged** (`merged:false`, closed 2026-09-12; landed only
   increment-1 `chat-governed-adapter.ts`, which is not on `main`). The seam + gateway + adapters landed
   piecemeal via other PRs; the *unified kernel every caller uses* is therefore **not yet achieved**, and
   #1157 is **not an active collision**.
3. **`paige-spine-tool-migration-map.md` (2026-09-02): "1 registered Spine capability."** Now **37
   capability keys across 11 domains** in `registry.ts` (the registry grew).
4. **Same map: "105 inline Chat tools."** The `chat-tool-registry` baseline is now **94** (campaign-brief
   and other tools landed); the current inline count is ~87–94, not 105.
5. **`integration-registry` "Marketplace Brain decision" grounding input** — no artifact exists under
   that phrase; the registry itself records it unresolved (§BRAIN.2). Noted so the program does not cite
   a source that does not exist.

---

## 0.6 Owner rulings — LOCKED (2026-09-13)

The owner reviewed this package and **approved the framing**: *package and adopt the existing governed
seams; do NOT rebuild a second authority, approval, tenant, receipt, or execution model.* The ten first
decisions (§9) are now **LOCKED** as follows; where the ruling refines a recommendation, the ruling wins.

| # | Ruling (LOCKED 2026-09-13) |
|---|---|
| **D-1** | **Approved.** Package and adopt existing governed seams; forks nothing (§18/§30). |
| **D-2** | `crm.contact.create` is the **first reference adopter** — but **implementation waits until CRM PR #1234 is merged AND a fresh-main collision pass is complete.** Not before. |
| **D-3** | **Defer MCP mutations and their approval channel to P6**; keep the MCP door **read-effective** until then. |
| **D-4** | **Rate limiting is a mandatory pre-exposure gate** — no external API/SDK ships without it. |
| **D-5** | **Approved** an externally scoped sandbox / test-tenant posture; **never shared or production customer data.** |
| **D-6** | **Approved** a least-privilege Solo test tenant + `LIVE_DRIVE_*` CI secrets — **no production credentials or client PII** (`docs/delivery/solo-test-tenant-spec.md`). |
| **D-7** | **Approved** HMAC-signed, tenant-scoped outbound webhooks **before** relying on webhooks externally. |
| **D-8** | Chat's inline-governance migration is **not first** — prove adoption **at the edges** first. |
| **D-9** | **Partner/Marketplace SDK waits** until the internal kit AND the API have **real reference adoption.** |
| **D-10** | Program names **confirmed, each prefixed "Paige"**: **Paige Capability Kit · Paige Agent Runtime Kit · Paige Test & Evidence Kit · Paige Platform API Contract · Paige Event & Webhook Contract · Paige Design & Client Contract.** |

**Standing constraint (owner, 2026-09-13):** this package advances through its docs-only review/merge, but
**P1 implementation does not begin yet.** The first build action (the D-2 reference adopter) is gated on
#1234 merging and a fresh-main collision pass, and on the owner's go for P1.

**Effect on the phased plan (§5):** P1's start moves behind the #1234 merge + collision pass (D-2); the
sequence and all other phases are unchanged. The recommendations in §9 below are retained as the rationale
of record; this section is the authoritative ruling.

---

## 1. Executive brief (plain English)

**What we have.** Paige already has the hard part of a platform SDK: a *governed way to do things
safely*. When Paige acts, the action crosses one shared decision — who is the caller, which tenant, what
role, what is this capability, how risky is it, what is the autonomy lane, is there a valid approval —
and only then runs, records a receipt, and writes an owner-visible Rail entry. That decision lives in one
pure function (`governedExecution.ts`) that is deliberately **"door-blind"**: a request cannot earn more
permission by arriving through chat vs. MCP vs. an automation. Around it sits a real action classifier, a
single server-held approval store, an autonomy-lane system, a provider-neutral model router, a capability
registry (in code), a two-lane Rail/receipt system, and ~50 CI guards that keep all of it honest.

**What is not yet true.** That safe pattern is **not uniformly adopted**, and it is **not exposed to
anyone outside our own code**. Concretely: (a) the flagship chat runtime still runs its own inline copy of
the governance sequence and is pinned to one model provider; (b) the MCP "door" is live but **refuses every
consequential action** (68 mutations structurally blocked — a connection authorizes reading, never
acting); (c) there is **no public developer API, no published SDK, no sandbox, no rate limiting on the
API/MCP surface (it exists only on a few public consumer endpoints), and no signed webhooks**; (d) the autonomous *event → action* engine exists but only one event producer and one
executor are wired, so the platform cannot yet reliably act on its own when something happens; (e) secrets
are read 991 different ad-hoc ways vs. 27 through the intended one-home resolver.

**What the program proposes.** Treat the existing seams as the **foundation to formalize**, in three
layers:
1. **Paige Capability Kit** — a thin, documented contract (`define → authorize → execute → receipt`) that
   wraps the seams we already ship, so every new capability is governed the same way and *cannot* fork its
   own authority/approval/receipt. This is packaging, not new runtime.
2. **Paige Agent Runtime, Test/Evidence, Platform API, Event/Webhook, and Design/Client contracts** —
   the other internal kits, each mapped to a real seam that exists today.
3. **External developer products** — a Partner/Marketplace SDK, public API client SDKs, a hardened Paige
   MCP server + builder guidance, and thin web/iOS/Android/wearable clients — every one of which keeps
   **all business logic and all authority server-side** and never touches the database or raw Vault
   secrets directly.

**Why now.** We are about to open several major lanes (governed CRM, Mind, Secure Browser, text-chat
Skills, Marketplace). Without a formalized Capability Kit, each lane risks re-implementing the gate — which
is exactly the failure the door-blind seam and the CI ratchets were built to prevent. One packaged kit,
adopted first by one reference domain, makes the safe pattern the path of least resistance.

**What this program is NOT.** It is not a rewrite, not a second registry, not a new approval model, and
not authorization to expose anything externally yet. The first deliverable is this review; the first build
(when approved) is packaging the kit and migrating **one** reference caller — not a big-bang refactor.

---

## 2. Category 1 — Vendor SDKs / libraries: consume, do not rebuild

**Source of truth:** `docs/integration-registry/integration-capability-registry.json` (+ README), the
one authoritative provider catalogue, governed by `lint:integration-registry`. **Cardinal rule (R1):**
listing a provider there never means it is connected, available, or autonomous.

**Grounded reality of *how* we consume vendors today:** every provider is called by **direct `fetch`**
against its REST API (`_shared/twilio.ts`, `gmail.ts`, `openai.ts`, `groq.ts`, `gemini-image.ts`,
`elevenlabs.ts`, `meshy.ts`, `ideogram.ts`, etc.). **We do not currently bundle any vendor's official
SDK.** For Deno edge functions this is a deliberate, defensible choice (smaller cold start, no transitive
supply-chain surface); the program does not propose adopting heavy vendor SDKs server-side.

| Provider / library | Registry status | Verdict | Rationale |
|---|---|---|---|
| **Supabase** (Postgres, Auth/GoTrue, Storage, Edge, pgvector, Vault, RLS) | excluded delivery infra | **CONSUME** | The substrate. Authority (RLS, `current_user_tenant_id()`), secrets (Vault), and persistence all rest on it. Never rebuild. |
| **Vercel** (frontend hosting/build) · **Fly** (`paige-browser`, `visual-renderer`) | excluded delivery infra | **CONSUME** | Deploy targets; already cloud-native (§64) via CI. |
| **Model providers** (Anthropic, OpenAI, Groq, Featherless, Gemini) | excluded delivery infra | **CONSUME** behind our router | §34: the LLM API is the *only* external dependency of Paige's intelligence; everything routes through `_shared/model-router.ts` so no provider owns Paige. Do not rebuild models; do not bypass the router (chat currently does — §3 gap). |
| **Voyage** (voyage-3 @1024 embeddings) | excluded delivery infra | **CONSUME** (single embedding space) | One structurally-enforced embedding space (CHECK-tagged). Never add a second embedder (§26). |
| **Stripe** | PARTIAL | **CONSUME** | Payments/regulation commodity (§34/§38). Paige is merchant of record only for its own rails; tenant→client money uses the tenant's processor. Never rebuild payments. |
| **Twilio · Resend · Gmail** | PARTIAL | **CONSUME** via `channel-adapters.ts` | Last-mile telecom/email delivery (§34). We already wrap them behind one thin outbound channel-adapter registry — the right pattern; extend it, don't fork per-provider clients. |
| **Google Calendar / Workspace · Microsoft 365** | PARTIAL / DEFERRED | **CONSUME** (thin) | Calendar is **connect-only today** (OAuth token stored; zero `calendar/v3` read/write — Paige governs *internal* bookings only). A real gap, but the fix is consuming the vendor API behind an adapter, never rebuilding calendaring. |
| **OAuth 2.1 / PKCE / DCR** | (used by MCP door) | **CONSUME** standard, keep our impl | The MCP door already implements OAuth 2.1 + Dynamic Client Registration + PKCE-S256 correctly. Reuse this exact implementation for any external API; do not hand-roll a second auth. |
| **Cryptography** (Web Crypto AES-GCM; pgcrypto `platform_encrypt/decrypt`) | infra | **CONSUME** primitives; consolidate usage | Never write our own crypto. Do consolidate the *three* backends now in use (§5 vault finding). |
| **MCP transport libraries** | infra | **CONSUME** | Standard MCP server/client transport; we implement the governed policy on top, not the transport. |
| **Apple (iOS/watchOS) · Android/Wear OS** | n/a (no client today) | **CONSUME** platform SDKs, thin | Category 3 (§7): native client SDKs are vendor SDKs to consume for presentation/transport only. All logic stays server-side. |
| **Notification transports** (APNs, FCM, Web Push) | n/a | **CONSUME** | For future push; never a place to embed business logic. |
| **n8n · Zapier** | PARTIAL | **CONSUME** as governed execution workers | Already wrapped as workers *under* Paige's authority (R7 door-blindness). Keep them workers; never let them become a bypass. |
| **Browserbase** | PROPOSED | **CONSUME behind a neutral contract** (conditional) | Owner-ruled the replaceable bootstrap browser-worker runtime behind a provider-neutral internal contract; 7 vendor gates before wiring. Do not couple to it. |
| **HubSpot · Vapi** | UNAVAILABLE | **AVOID** (for now) | Native CRM is the default (do not adopt HubSpot as core); Vapi is a provider-hosted agent that would own reasoning/actions — architecturally incompatible with the one-Harness rule. Consume only as an opt-in tenant integration later, never as substrate. |

**The one rule for Category 1 (R7 / §34):** every vendor runs **under** Paige's authority (door-blindness)
and behind an adapter contract, never as a bypass and never owning reasoning, authority, memory, or
records. Provider names/IDs/scopes only in artifacts — never secret values (R3).

---

## 3. Category 2 — Paige-owned internal kits to formalize (current-state inventory)

These already exist as seams. The verdict column is about **packaging as a reusable kit**, not about
whether the underlying capability exists.

### 3.1 Inventory: exists / partial / missing (as a *packaged* unit)

| Proposed kit | Real seam(s) on main | As a packaged/reusable kit |
|---|---|---|
| **Paige Capability Kit** | `governedExecution.ts` (decision) + `action-risk.ts` (classifier) + `registry.ts`/`contracts.ts` (`SpineCapability`) + `paige_pending_confirmations` (approval) + `resolve_tool_autonomy`/`clampLaneByRisk` (lane) + `capability-record.ts` (`recordCapabilityRun`, Rail) | **PARTIAL** — every piece exists and is CI-guarded, but there is **no single `defineCapability()`/wrapper** a builder imports; adoption is per-caller. The seam is adopted by 16 modules; chat is the exception. **This is the program's flagship deliverable (§4).** |
| **Paige Agent Runtime Kit** | `paige-orchestration/engine.ts` (event→act engine) + `paige_subagents` registry + `paige_action_kinds`/`paige_actions` (action bus) + `delegate_to_subagent`/`forge_subagent` + `paige_act_executions` ledger | **PARTIAL** — a real §67 engine exists, but only the **native** adapter dispatches, for essentially one `action_kind`; `delegate_to_subagent` runs **as service role outside the gate** (ungoverned downstream). Kit job = compose + make delegation governed + wire more executors. |
| **Paige Test & Evidence Kit** | `scripts/live-drive/live-drive.mjs` + `proof-lane.mjs` (`VERIFIED`/`PROOF_OWED` vocab) + `BUILD_VERIFICATION.json` + ~50 CI lint guards + `deploy-migrations`/`premerge-migration-proof` pipelines | **PARTIAL** — the structural-guard suite is genuinely strong and reusable; the *authenticated* proof lane is blocked on one owner action (a Solo test tenant + `LIVE_DRIVE_*` secrets), and ~40 bespoke drives are unmigrated onto the harness. |
| **Paige Platform API Contract** | `paige-mcp/index.ts` (119 tools, OAuth 2.1) + `governedExecution.ts` + `capability-record.ts` outcomes | **MISSING as a public contract** — the MCP door is the closest thing, but it is read-effectively (refuses 68 mutations) and there is no versioned REST/`/v1` surface, no published schema, no rate limiting. |
| **Paige Event/Webhook Contract** | `paige_native_events` outbox + `paige-native-event-dispatch` + `fire-outbound-webhooks` | **PARTIAL/legacy** — internal native-event bus is production-solid to *delivery* (one live producer: `contact.created`); outbound webhooks work but are **unsigned (no HMAC) and not tenant-scoped**. No public event schema. |
| **Paige Design/Client Contract** | `surface-context-handoff-contract.md` + `connections-rail-contract.md` + binding-ledger + `capability_status` resolver | **PARTIAL** — the server-resolved safe-context handoff and the honest capability-status manifest exist; there is no packaged client contract a thin client (mobile/web) consumes. (Visual layer is Claude Design's, §00.) |

### 3.2 The safe pattern, step by step (what a kit must standardize) — all grounded

1. **Caller identity** — verified JWT → `auth.getUser()` (never a request-body actor). `adminAuth.ts`,
   chat-inline, and MCP-bearer each do this differently today (re-implemented, not one module).
2. **Server-derived tenant** — `current_user_tenant_id()` DB RPC (raises on a mismatched passed id). MCP
   re-implements this in TS as `actorTenantId`. Provenance is an *adapter assertion* the seam trusts.
3. **Actor tier/role** — `getActorTier` (fails closed to `client`).
4. **Capability identity + risk** — `action-risk.ts` `classifyAction` (frozen Map, fail-closed; **134
   classified action keys**: 72 `high` / 59 `ordinary` / 3 `owner_only`). CI `lint:action-risk`.
   (The older "62" in the tool-migration map counted only *chat-declared* classified actions at a
   2026-09-02 SHA; the full `RISK` array is 134 today.)
5. **Autonomy lane** — `resolve_tool_autonomy`/`resolve_automation_autonomy` then `clampLaneByRisk`
   (`auto`-on-`high` → `confirm`; `off` always survives). §67/§68 Trust Compass + decay; RE-2
   standing-grant substrate exists but is **dark** (no consumer).
6. **Approval proof** — one server-held store `paige_pending_confirmations`, executes **stored** args,
   `confirm-fingerprint.ts`, created-before-turn (kills same-turn model self-approval). `one-approval-gate.md`
   + `one-approval-gate-lint.mjs`.
7. **The decision** — `decideGovernedExecution` composes 4–6 into one door-blind verdict:
   `execute | propose | refuse` + 13 fail-closed codes. Guarded by `lint:governed-execution`.
8. **Execute** — the domain adapter/RPC/edge runs the stored args (per-domain by design; no central
   executor).
9. **Model calls** — through `model-router.ts` `callModel`/`routedChatCompletion` (budget, allow-list,
   §17 sensitive-never-open, §2 finance gate). **Chat bypasses this** (pinned to Anthropic).
10. **Outcome + evidence** — `recordCapabilityRun` → `record_capability_run` RPC →
    `_record_workspace_rail_event` (workspace Rail) and/or `record_rail_event` (per-client Rail); pure
    `artifact-receipt.ts` for the in-turn "did it land" check.

### 3.3 The honest gaps a kit must close (not hide)

- **No single wrapper.** Steps 1–10 are a *convention* enforced by lints, not a `defineCapability()` a
  builder imports. New callers can still assemble the steps wrong (or skip the router / the Rail).
- **Chat is the non-adopter.** The flagship runtime runs an inline governance copy and is model-pinned.
- **MCP refuses all mutations.** The most-public surface cannot act (by design, until an approval channel
  exists — owner decision D-3).
- **Delegation is ungoverned downstream** (`delegate_to_subagent` as service role).
- **Rail is workspace-or-client, not universal** — ~40 actions still write only `paige_audit_log`
  (which no Solo surface reads); "owner can see the outcome" fails for many acts (the migration map's
  Leg 7).
- **Secrets are read 991 ad-hoc ways** vs 27 through `env-key.ts`.

---

## 4. Proposed Paige Capability Kit contract (design only — no runtime implementation)

**Intent:** a thin, documented contract that *composes the seams that already exist* so a builder cannot
express an ungoverned capability. It adds **no** new authority, registry, approval model, or executor
(§18/§30). It is a packaging of §3.2. **This section is a contract sketch for owner review, not code.**

```
// SHAPE ONLY — illustrates the contract; not an implementation, not to be built until approved.

defineCapability({
  key: "crm.contact.create",              // matches action-risk + Spine registry key (one identity)
  domain: "crm",
  humanSurface: "Clients",                 // for the honest capability_status manifest
  risk: "ordinary" | "high" | "owner_only",// delegated to action-risk.ts; never re-declared here
  effect: "read" | "mutate" | "external_effect",
  approvalAuthority: "chat-canonical",     // the ONE gate; no second channel
  idempotencyKey: (args) => string,        // stable run id → one receipt on retry
  outcomeChannel: "workspace_rail" | "client_rail",  // MUST name a channel that records (or refuse)
  executor: async (ctx, args) => DomainResult,        // per-domain; ctx is pre-resolved + pre-authorized
})

// The kit runtime (existing seams, composed — NOT new code):
authorize(caller, capability) -> decideGovernedExecution(...)   // door-blind; execute|propose|refuse
execute(decision)             -> capability.executor(ctx, decision.args)  // only on `execute`
receipt(result)               -> recordCapabilityRun(...)       // Rail + redacted receipt, idempotent
```

**Invariants the kit enforces (each already has a CI guard — the kit makes them un-skippable):**

| Invariant | Enforced today by |
|---|---|
| Door-blind decision (no authority branch on the entry surface) | `lint:governed-execution` (R1) |
| One approval channel; no model-supplied boolean can approve a mutation | `one-approval-gate-lint.mjs`, `lint:mcp-destructive-confirm` |
| Capability identity = the exact action-risk key | `lint:action-risk`, `paige-spine-registry-lint.mjs` |
| A `mutate` capability names an outcome channel that records | registry validator (`railVisibility`) |
| No new inline Chat tool without a registry mapping | `lint:chat-tool-registry` (baseline 94) |
| Rail grants correct; no anon/broad DEFINER data-returner | `lint:rail-grants`, `lint:definer-fns`, `lint:views` |
| Provider integration change updates the registry in the same PR | `lint:integration-registry` |

**Non-goals of the kit (explicit, so it cannot scope-creep):** it is not a new tenant resolver (it *calls*
`current_user_tenant_id()`), not a new approval store, not a new executor, not a model router, not a Rail.
It is the **front door** that guarantees those are used, exposed as one import so a builder does not
reassemble them by hand.

**First reference adopter (recommended):** **`crm.contact.create`** — it already emits a per-client Rail
(so Leg 7 works), is `ordinary` risk, has a clean `create_contact_v2` RPC, and is the head of the
tool-migration map's Wave 1. Migrating exactly one caller onto `defineCapability()` proves the contract
without touching chat's inline sequence.

---

## 5. Phased build plan (sequencing · ownership · active-PR collisions · first reference adopters)

**Principle (§30):** build on the existing seams; never fork a second authority model. Every phase after
the kit is a *caller* of it. Each phase is a §4-doctrine MVP slice: built to the §13/§32/§70 bar, proven,
its canonical records (registry / binding ledger / integration registry / master doc) updated in the
**same** PR, and live before the next begins. **Nothing here is authorized to build yet** — this is the
proposed order for after owner review.

| Phase | Deliverable | Category | Owner (CC unless noted) | First reference adopter | Active-PR collisions & posture |
|---|---|---|---|---|---|
| **P0 (this doc)** | The program + taxonomy + contract + decisions | — | CC | — | docs-only; safe. |
| **P1** | **Capability Kit contract v1** (`defineCapability` wrapper over existing seams) + adopt **one** reference capability (`crm.contact.create`) | Cat 2 | CC | `crm.contact.create` | **#1234** (governed CRM) edits the exact seams — **coordinate/most likely supersede or land first**; **#591** (Knowledge isolation) edits `paige-ai-chat`. Do not touch chat's inline sequence. |
| **P2** | **Secret-access consolidation** — route the 991 raw `Deno.env.get` through `env-key.ts`; document the 3 crypto backends and pick the canonical per-tenant credential vault shape | Cat 2 (Vault) | CC | `channel-adapters.ts` senders | None high; touches many files — do in reviewed batches, behavior-preserving (§37). |
| **P3** | **Test & Evidence Kit** — migrate bespoke drives onto `live-drive`/`proof-lane`; **unblock the authenticated proof lane** (owner action D-6) | Cat 2 | CC | the P1 reference capability's live-drive | **#574** (premerge-migration-proof fail-closed) — do not edit that workflow. |
| **P4** | **Agent Runtime Kit** — make `delegate_to_subagent` governed (re-check the kit when a specialist acts); wire ≥1 more executor into `orchestration/engine.ts` | Cat 2 | CC | one action bus `action_kind` | **#921** (Agent Registry design), **#917** (Solo orchestration) — reconcile the registry shape first. |
| **P5** | **Event/Webhook Contract** — sign outbound webhooks (HMAC) + tenant-scope them; publish an internal event schema; add ≥1 more native-event producer | Cat 2/3 | CC | `contact.created` → signed webhook | **#572** (metering) coordinates on spend seams; **#776/#644** (Rail resolvers) — do not edit `capability-record.ts` without coordinating. |
| **P6** | **Platform API Contract v1 (internal)** — a versioned capability envelope (auth, tenant scope, capability scopes, idempotency, outcomes, receipts) over the governed door; add an **approval channel to MCP** so mutations become possible under the gate | Cat 2→3 | CC | the P1 capability exposed as one governed API verb | **#1044** (text-chat Skills) touches the capability/skills surface; **#1250** (approvals guard) touches the approval seam — land or reconcile first. |
| **P7** | **Partner/Marketplace SDK** (§6) — capability-scoped, DB-and-Vault-free; build on the Marketplace runtime that already exists | Cat 3 | CC + Marketplace team | a read-only Marketplace capability | **#670** (Marketplace read foundation), **#1251** (Mind capability map). |
| **P8** | **Public API client SDKs + Paige MCP server (external) + builder guidance** (§8) | Cat 3 | CC | the P6 API | rate-limiting + sandbox are prerequisites (D-4/D-5). |
| **P9** | **Thin web/iOS/Android/wearable client SDKs** (§7) | Cat 3 | CC + Claude Design (visual, §00) | the P6 API + P5 events | requires push transports (Category 1). |

**Ownership note (§1/§14):** every phase runs with a crew — a build specialist, an adversarial verifier
(the §39 peer-gate on the real diff), and a §5 compliance officer — never solo. The kit itself is the
mechanism that lets each domain team build without re-deciding authority.

---

## 6. Marketplace / Partner SDK plan — never exposes direct DB access or raw Vault secrets

**Build on what exists (verified):** a working Marketplace runtime — `marketplace_vendors/items/
item_versions/installs/install_ledger` (tier-aware RLS, a live §2 finance-default guard trigger), plus
`marketplace-install` (Voyage-embeds kb_packs → `install_marketplace_item()` RPC flips skills + writes the
ledger; tenant never trusted from the body) and `marketplace-checkout-session` (Stripe, §38 posture).
Skills-as-marketplace-units already exist (agency-resell per §61). The MCP door's OAuth 2.1 + DCR + PKCE
is the auth foundation to reuse.

**The hard boundary (grounded in §5 vault findings), a partner SDK is FORBIDDEN from:**
- **Direct database access.** No table reads/writes, no RLS assumptions — partners call *capabilities*,
  never SQL. (Marketplace items are **global capability metadata only**, R4; `marketplace_installs` is the
  only per-tenant state and is out of a partner's reach.)
- **Raw Vault secrets or decrypted provider tokens.** Partners get **status + last4 only**, never
  ciphertext, never a decrypt path. Decrypt getters are service-role-only.
- **Self-declared tenant scope.** Tenant/actor/role are always server-resolved from the caller's grant;
  a partner-supplied tenant is an assertion to reject.
- **Any non-Voyage embedder or raw transcript into memory/Rail** (§26; memory eligibility rules).
- **A second authority/approval/receipt system** (§18) — partner capabilities are `defineCapability()`
  entries governed by the same gate; sends/spend/publish go through the one approval path.

**Partner capability model:** a partner registers a capability (metadata + a versioned contract), the
tenant *installs* it (a per-tenant authorization fact), and at runtime the partner capability executes
**through the governed door under Paige's authority** (R7 door-blindness) with a canonical receipt + Rail.
Real-money effects require **M1 real-money spend control** (currently unbuilt — 8 providers depend on it),
never LLM-token metering (R8/R10). Paige is never merchant of record for a tenant→client charge (§38).

---

## 7. Mobile / wearable strategy — thin clients, business logic server-side

**Governing rule (grounded in `paige-modality-neutrality.md`, OWNER-LOCKED):** *the active door is
provenance, not permission.* A phone, watch, browser companion, or card is **one more door** to the one
tenant-aware Paige workspace and the one Spine. A modality may change how intent is received or a result
is presented; it may not create another brain, a direct mutation path, a duplicate authority system, an
ungoverned memory store, or a modality-specific shortcut.

**Therefore the client SDKs are thin by contract:**
- **All authority, tenant resolution, capability decisions, approvals, receipts, and memory stay
  server-side.** The client captures intent (text/voice/tap) and renders a truthful result. It holds no
  business logic and no long-lived secret — only an **opaque, short-lived transport grant** (the exact
  pattern the voice profile already uses: the browser receives a profile name/revision + a short-lived
  grant; provider names/credentials never reach the client).
- **Every consequential action on mobile/wearable crosses the same gate** as chat — the same
  action-risk class, the same one approval gate, the same canonical readback + receipt + Rail. A casual
  spoken "yes" is not approval proof.
- **Voice I/O is transport only** (ElevenLabs is a presentation-only STT/TTS candidate, PROOF_OWED and
  fail-closed until its scope/retention/cost gates pass). No provider-hosted agent may own reasoning or
  actions (Vapi is UNAVAILABLE for exactly this reason).
- **Fail-closed on context switch** — workspace switch, session end, revoke, expiry clear or fail closed
  with the same scope-epoch behavior as chat; no stale context/audio/authority crosses into the next scope.
- **Client SDK = consume the vendor platform SDK** (Apple/Android/Wear OS, push transports) for
  presentation and transport only. The Paige client SDK is a typed wrapper over the **Platform API
  Contract (P6)** and the **Event Contract (P5)** — nothing more.

**Acceptance (from modality-neutrality, applies to every new surface):** reuse the one workspace + Spine
identity; server re-resolves actor/tenant/workspace/role/context; same capability identity + risk + one
approval gate + canonical tool; prove the persisted outcome then receipt + Rail; present the *same* honest
capability state as chat (never upgrade `UNAVAILABLE`/`PARTIAL`/`PROOF_OWED`); keep raw text/audio out of
durable memory eligibility; fail closed on switch/revoke/expiry.

---

## 8. API / MCP readiness checklist (per-item honest verdict)

The MCP door is today's closest thing to a public capability API: `paige-mcp/index.ts`, **119 tools**,
OAuth 2.1 + Dynamic Client Registration + PKCE-S256 (`paige_mcp_oauth_*`), 14 enforced scopes, a governed
door that classifies **68 mutate / 51 read** by verified handler-read and **structurally refuses all 68
mutations** (a connection authorizes the door, not consequential action). It is the substrate to build on;
the gaps below are what a genuine external developer API/SDK still needs.

| Requirement | State | Evidence / gap |
|---|---|---|
| **Authentication** | **EXISTS** (reuse) | OAuth 2.1 + DCR + PKCE-S256 in the MCP door; do not hand-roll a second. |
| **Tenant scope** | **EXISTS** | Server-resolved (`current_user_tenant_id()`); body-supplied tenant rejected; door-blind. |
| **Capability scopes** | **PARTIAL** | 14 MCP scopes + per-tool effect classification exist; not yet a published, versioned scope catalogue for external devs. |
| **Idempotency** | **PARTIAL** | Internal idempotency via `stableRunId` on receipts; **no external idempotency-key header contract**. |
| **Outcomes** | **EXISTS** | Six honest `CapabilityOutcome` states (`LIVE/PARTIAL/PROOF_OWED/UNAVAILABLE/...`) + the honest `capability_status` manifest. |
| **Receipts** | **EXISTS (internal)** | `recordCapabilityRun` → Rail + redacted durable receipt; not yet exposed as an external, fetchable receipt resource. |
| **Versioning** | **MISSING** | No `/v1`, no published schema/OpenAPI, no deprecation policy. |
| **Sandbox** | **MISSING** | No sandbox/test tenant for external developers; the *internal* proof lane is itself blocked on a test tenant (D-6). |
| **Rate limits** | **MISSING (for the API/MCP surface)** | **No rate limiting on the MCP door or any general API surface.** It exists today *only* on a few public consumer endpoints (`public-booking`, `paige-public-chat`, `booking-manage`) via `_shared/rateLimit.ts` → `check_public_rate_limit`. A general limiter is a hard prerequisite before any external exposure. |
| **Webhooks** | **PARTIAL/legacy** | `fire-outbound-webhooks` works but is **unsigned (no HMAC)** and **not tenant-scoped**; native-event bus has one live producer. Needs signing + tenant scope + a published event schema (P5). |
| **Support / observability** | **PARTIAL** | `paige_llm_trace` + audit + Rail exist internally; no external status page, error taxonomy doc, or developer support contract. |
| **Mutations over the API** | **BLOCKED (by design)** | MCP refuses all 68 mutations until an approval channel exists (D-3). Read-first external API is safe today; write requires the approval-channel decision. |

**Readiness verdict:** the platform is **read-ready** for a carefully-scoped external API (auth, tenant
scope, outcomes, receipts all exist), but **not write-ready** (approval channel) and **not
exposure-ready** (no versioning, no API-surface rate limiting, no sandbox, unsigned webhooks). The plan builds these
in P5/P6/P8 before any public exposure.

---

## 9. First specific owner decisions required (before any implementation)

> **These decisions were RULED by the owner on 2026-09-13 — see "0.6 Owner rulings — LOCKED" above for
> the authoritative outcomes.** The text below is retained as the tradeoff and rationale of record.

These are the decisions that unblock P1 and shape everything after. Each names the tradeoff and a
recommended default (§15), but the owner chooses.

- **D-1 — Approve the Capability Kit direction and the *packaging-not-rebuild* framing.** Confirm the kit
  wraps existing seams and forks nothing (§18/§30). *Recommended: yes.*
- **D-2 — First reference adopter.** Confirm `crm.contact.create` as the single first migration (proves
  the contract; already Rail-visible). *Recommended: yes.* Alternative: a read-only capability first if
  you prefer zero mutation risk on the first migration.
- **D-3 — MCP write / approval channel.** Decide whether the MCP door should ever carry consequential
  mutations, and if so approve building an approval channel into it (its own §37 producer inventory).
  *Recommended: defer writes; keep MCP read-effective until P6, then add the approval channel deliberately.*
- **D-4 — Rate limiting as a hard gate before any external exposure.** *Recommended: yes — no external
  API/SDK ships without it.*
- **D-5 — External sandbox posture.** Decide whether external developers get a sandbox/test tenant, and
  who provisions it. *Recommended: yes, required for a public SDK; scoped test tenants only.*
- **D-6 — The one owner action for the authenticated proof lane.** Provision a least-privilege Solo test
  tenant + set `LIVE_DRIVE_EMAIL`/`LIVE_DRIVE_PASSWORD` CI secrets (spec:
  `docs/delivery/solo-test-tenant-spec.md`). This unblocks §32.c authenticated proof for the kit *and* the
  wider platform. *Recommended: yes — it is the single highest-leverage unblock and costs no code.*
- **D-7 — Outbound webhook signing + tenant scope.** Approve making `fire-outbound-webhooks` HMAC-signed
  and tenant-scoped before it is relied on (it is a real security gap today). *Recommended: yes.*
- **D-8 — Chat runtime adoption scope.** Decide whether/when the flagship chat runtime migrates from its
  inline governance copy onto the kit and onto the model router (it is pinned to Anthropic today).
  *Recommended: NOT in the first phases — chat's inline sequence is proven and its migration is a large,
  separate slice; adopt the kit at the edges first.*
- **D-9 — Marketplace/partner SDK timing.** Confirm the partner SDK waits until the internal kit + API
  contract are adopted by ≥1 domain (so partners inherit a proven gate, not a moving target).
  *Recommended: yes — P7, after P1/P6.*
- **D-10 — Naming/identity of the program artifacts.** Confirm names ("Paige Capability Kit", "Paige
  Platform API", etc.) or rename now, before builders reference them (§12/§65). *Recommended: confirm as
  written or provide preferred names.*

**Stop point (per the assignment).** This package ends here. No implementation begins until the owner
reviews and approves the SDK architecture and the decisions above.

---

## 10. Toolkit taxonomy + dependency diagram

**The dependency law:** Category 3 depends on Category 2 depends on Category 1. Nothing external is exposed
until the internal kit it depends on is real and adopted by ≥1 reference caller.

```
                       ┌─────────────────────────────────────────────────────────────┐
   CATEGORY 3          │  External developer products (FUTURE — mostly MISSING today)  │
   (build last)        │                                                               │
                       │  Partner/Marketplace SDK   Public API client SDKs             │
                       │  Paige MCP server (ext) + builder guidance                    │
                       │  Web · iOS · Android · Wear OS thin client SDKs               │
                       └───────────▲───────────────────────────▲──────────────────────┘
                                   │ depends on                 │ depends on
                       ┌───────────┴───────────────────────────┴──────────────────────┐
   CATEGORY 2          │  Paige-owned internal kits (FORMALIZE — exist as seams today)  │
   (formalize first)   │                                                               │
                       │  ┌────────────────────────── Paige Capability Kit ──────────┐ │
                       │  │ define → authorize(governedExecution) → execute → receipt │ │  ← flagship
                       │  └───▲────────▲────────▲────────▲────────▲────────▲──────────┘ │
                       │      │        │        │        │        │        │            │
                       │  action-risk  registry  approval  autonomy  rail/    model     │
                       │  (classify)  (identity) (1 gate)  lanes     receipt  router    │
                       │                                                               │
                       │  Agent Runtime Kit   Test/Evidence Kit   Platform API Contract │
                       │  Event/Webhook Contract   Design/Client Contract              │
                       └───────────────────────────▲───────────────────────────────────┘
                                                    │ runs on
                       ┌────────────────────────────┴──────────────────────────────────┐
   CATEGORY 1          │  Vendor SDKs / libraries (CONSUME — never rebuild)             │
   (consume)           │  Supabase · model providers (behind router) · Voyage · Stripe │
                       │  Twilio/Resend/Gmail (behind channel-adapters) · OAuth/PKCE    │
                       │  crypto primitives · MCP transport · Apple/Android/Wear OS     │
                       │  push transports · n8n/Zapier (as governed workers)           │
                       └───────────────────────────────────────────────────────────────┘
```

**Reading the diagram:** the Capability Kit is the hinge. Everything below it is bought and wrapped;
everything above it is exposed only through it. This is the concrete form of the owner-approved rule that
*every capability plugs into the same shared governed path, and a domain may not fork its own Harness,
authority, registry, jobs, receipts, provider registry, memory, or orchestrator.*

---

## 11. Cross-references (canonical homes — this program cites, never restates, §18)

- `docs/doctrine/governed-execution-seam.md` — the door-blind decision contract (adoption note is stale; see §0.5)
- `docs/doctrine/one-approval-gate.md` — how a yes is proved
- `docs/doctrine/autonomy-architecture.md` — §67/§68 lanes, Trust Compass, decay
- `docs/doctrine/paige-modality-neutrality.md` — door ≠ authority (mobile/wearable law)
- `docs/doctrine/paige-capability-portfolio.md` — the owner-vision portfolio + routing
- `docs/delivery/harness-completion-map.md` — Layers A–G state (the #1157 note is stale; see §0.5)
- `docs/architecture/paige-spine-foundation.md` + `paige-spine-tool-migration-map.md` — the Spine contract + the 8-wave adoption plan + 10-condition LIVE standard
- `docs/integration-registry/` — the vendor catalogue (Category 1 source of truth)
- `docs/binding-ledger/` — per-surface proven state
- `docs/brain/paige-receipt-rail-contract.md` — the evidence model
- `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §4/§5 — SHIPPED / GAPPED truth
- CLAUDE.md §00 (jurisdiction) · §9/§13/§18/§30/§32/§34/§37/§38/§59/§67/§68/§70

---

*Read-only grounding + architecture plan. Grounded against `origin/main` `1d1eabd` (2026-09-13) by a
Flow-by-Flow crew of seven grounding specialists + one adversarial verifier. Nothing was built, migrated,
published, merged, or deployed. Evidence classes: static source reads + `git` + GitHub PR state
(automated); no rendered, authenticated-runtime, or production evidence — none was in scope for a planning
package.*
