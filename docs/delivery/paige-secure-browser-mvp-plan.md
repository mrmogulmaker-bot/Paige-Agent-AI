# Paige Secure Browser — owner-complete MVP plan

**Date:** 2026-09-07 · **Status:** APPROVED DIRECTION + phased plan — **not a live capability, nothing
installed.** · **Owner rulings encoded:** 2026-09-07 (custody model + product correction).
**Grounding:** `docs/audits/paige-secure-browser-audit-2026-09-06.md` (Phase-0 audit, file:line
evidence). **Extends** the owner-locked five-slice plan `outputs/paige-at-cowork/08-sandboxed-research-external-execution.md`
(§18 — never forks it). The exact builder spec is `docs/handoff/paige-secure-browser-build-handoff.md`.

> **§00.** This is backend/security/product architecture — CC's lane. The **visual design** of every
> surface named here is **Claude Design's**, routed through `paige-ui-design` + `flow-prototype`. CC
> specifies flow behavior, states, security, and the backend contract; CD draws the pixels.
>
> **§4/§69.** Nothing installs, no account is created, no credential/crawl/login happens, until the
> provider review completes and the owner authorizes it. This document plans; it does not build.

---

## 1. What Paige Secure Browser IS (owner correction, 2026-09-07)

**A Paige-OWNED native capability — not a browser-provider integration, not a vendor dashboard, not an
embedded third-party product, and not a copied "Twin" experience.** Opened from the dedicated Paige
workspace and visibly integrated into the chat. The customer feature is named **"Paige Secure Browser"**
(or "Secure Browser") — never "Twin", "Browserbase", or any provider wording.

**Paige owns**, end to end: the in-chat UI + policy layer, the browser control plane, tenant isolation,
the **Vault "Connected Accounts"** area, the authority model, connection records, audit history, action
receipts, Vault protections, and the eventual reusable browser skills.

**The layered architecture (the load-bearing rule):**

```
Paige Secure Browser UI + policy layer   ← Paige-owned (customer-facing; no provider anything)
        ↓  (a provider-neutral INTERNAL Secure Browser contract)
Paige-owned browser control plane        ← Paige-owned (tenant scope, authority, receipts, Vault)
        ↓  (a swappable worker adapter)
Isolated browser worker                  ← Chromium/Playwright OR a provider (Browserbase bootstrap)
        ↓
Approved website
```

**Browserbase is only the leading PROPOSED, REPLACEABLE bootstrap runtime for the isolated browser
WORKER.** It sits *behind* the provider-neutral internal contract. Its API, MCP, branding, styling,
icons, interaction patterns, and data model **must never leak** into customer-facing UI or core domain
contracts. Paige can progressively operate her own Chromium/Playwright worker fleet behind the same
contract. **The test:** *"If we swapped the worker from Browserbase to our own Chromium fleet tomorrow,
does any customer-facing surface or core domain type change?"* If yes, the abstraction leaked — fix it.

---

## 2. The custody & security model (owner-ruled 2026-09-07)

**Owner-direct login + provider-held persistent session; Paige never holds the raw credential.**

- From Paige chat, the owner asks Paige to open Secure Browser **for an approved business purpose**.
- Paige opens a **native Paige browser workspace/session** showing purpose · target · scope · current
  authority · activity status.
- The owner can **take control, navigate, enter credentials directly, complete MFA, approve or stop an
  action, and see what Paige is doing.**
- **Connected Accounts** live under **Vault** as a protected area: **owner-managed, tenant-isolated,
  revocable, auditable, and never casually readable by Paige.** With explicit owner consent, the worker
  runtime may persist the browser session so Paige can later reopen the authorized account **under the
  owner's policy** — but Paige stores **only** an **opaque connection/session reference** + allowed
  host/action scope + authority status + freshness + revocation state + receipts.
- **Never in chat or ordinary model context:** raw passwords, MFA codes, cookies, session tokens, or
  page HTML. Paige returns only **safe, useful results** + a **truthful receipt** + **Rail evidence**
  for a real completed action (§13/§32 — a fire is not a delivery).
- **Browser downloads / captured files enter Vault quarantine/inspection**, never the ordinary document
  library.
- **Fail closed** whenever a connection, authority policy, target domain, action type, freshness, or
  receipt requirement is missing.

**Why this is the strongest posture (§59):** because the owner types the credential directly into the
worker and Paige holds only an opaque reference, *the raw secret never transits Paige at all* — you
cannot leak what you never held. This is stronger than the existing connection-token vault
(`tenant_mcp_connections`), which stores encrypted tokens Paige can decrypt server-side.

---

## 3. What already exists to build on (§18 — extend, never reinvent)

| Seam | What it is | Reuse for Secure Browser |
|---|---|---|
| `services/paige-browser` (Fly Playwright, DB-free, SSRF-guarded) | read-only public browse + self-verify | The FIRST self-hosted Chromium worker adapter (research/read path) |
| `browse_public_url` skill + `deep_research`/`web_search` + `paige_browser_usage` | LIVE/PARTIAL research + audit rail | Mode-1 research; the receipt rail pattern (extend, tenant-scoped) |
| `tenant_mcp_connections` (encrypted, `FORCE RLS`, service-role decrypt, per-(tenant,provider)) | connection-token vault + OAuth connect/disconnect flow | The PATTERN for the Vault Connected Accounts record — but storing an **opaque reference**, not a raw secret |
| Vault tables (`business_vault_*`, incl. `business_vault_quarantine_uploads`, inspection seam) | tenant Vault store + quarantine | Home for **Connected Accounts** + **download quarantine/inspection** |
| `_shared/capability-record.ts` + `record_capability_run` (6 outcomes) | the one home for a safe attributable Rail outcome | Every Secure Browser action's receipt |
| §10 Standing Delegated Authority Contract + §68 decay + §16 lanes + `_shared/action-risk.ts` | the autonomy substrate | Phase-3 governed browser actions ride this — NOT a new autonomy system |
| `paige-mcp` governed adapter (`decideMcpToolCall`/`governMcpToolCall`, server-resolved tenant, audits, can refuse) | the governed-execution door | The governance pattern a Secure Browser action-dispatch reuses |

**Known security prerequisites (from the audit §4.3, must be fixed before any worker write path ships):**
1. `browser_use_sessions` has **no `tenant_id`** and is written by the live `browse_public_url` path
   (`skill-interpreter.ts:198-229`) — a **current** §9 attribution gap. Add `tenant_id` + a
   server-resolved tenant on every writer.
2. The `browser-use` edge fn trusts caller-supplied identity + service-role with **no JWT-derived
   tenant/admin gate** (`browser-use/index.ts:17-31`) — must be replaced by a server-resolved
   tenant/admin gate before any credentialed path.

---

## 4. The phased MVP (extends the audit's Phase 0–4 / the S-R1…S-R5 slices)

Every phase declares: the **owner outcome** (what a human can DO), what's **built**, the **worker
adapter**, the **security gates**, and the **proof** (§32/§68). Fail-closed is the default.

### Phase 0 — Direction + provider review (this doc + the audit; the current gate)
- **Owner outcome:** a truthful record and a clear build path; a provider decision pending review.
- **Owner-decision-gated:** the Browserbase (bootstrap worker) provider review — contract, privacy,
  data-residency (US), security (SOC 2 Type II report), price, integration fit. **Nothing installs
  until it clears and the owner authorizes.**

### Phase 1 — Owner-assisted, ephemeral in-chat session (no saved login)
- **Owner outcome:** from chat, "open Secure Browser for <purpose>"; a native Paige session opens; the
  owner takes control, signs in directly + completes MFA, and Paige reads/observes within the approved
  scope. **Paige never receives the raw password.** Session is **ephemeral** — discarded on close;
  only an audit receipt persists.
- **Built:** the in-chat Secure Browser surface (CD visuals) + the provider-neutral internal contract
  (open/live-view/take-control/observe/close) + the control plane (tenant scope, purpose/scope record,
  receipt) + the FIRST worker adapter. **Worker adapter:** the reviewed provider (Browserbase Live View)
  for the credentialed live session; `services/paige-browser` remains the read-only research adapter.
- **Security gates:** read/observe lane only (no Paige-driven writes); creds/cookies/tokens/MFA/HTML
  never in LLM context; owner-only live view; fail closed on missing scope/authority/receipt.
- **Proof (§32):** headless smoke of the contract + the control plane; **authenticated §32.c owner
  live-drive** that the flow completes and a receipt persists (owed to a browser-capable session).

### Phase 2 — Connected Accounts under Vault (explicit consent, persistent session)
- **Owner outcome:** after explicit consent, Paige can **reopen an authorized account under policy**;
  the owner **manages and revokes** connections in a Vault "Connected Accounts" area.
- **Built:** the **Vault Connected Accounts** record (opaque reference + allowed host/action scope +
  authority status + freshness + revocation state; `FORCE RLS`, service-role writes, tenant-isolated,
  never casually readable by Paige) + owner-visible connection management + MFA handoff on (re)auth +
  the provider-neutral persistence contract (the worker persists the session; Paige stores the opaque
  reference only).
- **Security gates:** fail closed on stale/expired/revoked connection; per-connection revoke +
  emergency-stop; Connected Accounts are Vault-protected, never in the ordinary document library, never
  in model context.
- **Proof:** §9 tenant-isolation proof (a tenant can only see/manage its own connections; cross-tenant
  FORBIDDEN); revocation proof; §32.c owner live-drive.

### Phase 3 — Governed delegated browser actions (§10 + §68)
- **Owner outcome:** within an owner/authorized-rep **standing policy**, Paige can perform defined
  browser actions on approved portals — returning safe results + a truthful receipt + Rail evidence.
- **Built:** a Secure Browser action as a `high`/`external_effect` capability declaring all seven §10
  dimensions (grantor + authorized rep; the exact actions as a process; boundaries incl. per-domain/
  action policy + caps + window + stop conditions; the §16 lane; truth & evidence incl. idempotency +
  Rail receipt; controls incl. pause/revoke/emergency-stop; fail-closed). `confirm`-floored until RE-2
  lifts it under a valid standing policy; **prohibited** actions never delegable.
- **Security gates:** rides §68 decay (attestation + passing isolation checks); §38 money boundary (a
  browser action that moves money uses the tenant's OWN connected rails; Paige never merchant of
  record); M1 metering for any spend-capable act; verified readback + immutable receipts.
- **Proof:** the §10/RE-2 runtime proof (resolver `SET ROLE` proof + decision-space sweep); §37
  producer inventory; §68 canary + RLS-coverage green; §32.c owner live-drive.

### Phase 4 — Bounded public crawling + reusable browser skills
- **Owner outcome:** Paige runs bounded public research/crawls on approved domains and offers reusable
  browser skills.
- **Built:** hardening the existing research path (close **G5** page-write fence; reconcile the two
  SSRF guards + DNS-rebinding #138; confirm Firecrawl on prod; put `browse_public_url` in the main
  chat loop, §36) + reusable skills authored per the §14/§62 skill model.
- **Security gates:** respect authorization, provider terms, robots directives where applicable, rate
  limits, target-domain allowlists; seed-vs-tenant-authored ToS discipline (LinkedIn/Meta = tenant-
  authored only, never a platform-default seed).

> **A Chrome extension "local browser takeover" is a later optional path (§35 OS surface), NOT a
> substitute** for the tenant-safe managed foundation above.

---

## 5. The provider-neutral internal Secure Browser contract (the seam)

The one internal interface the control plane calls; the worker adapter implements it. **No provider
type, field, id shape, or vocabulary appears above this line.** (Concrete shape in the build handoff §B.)

- `openSession({ tenant, purpose, targetHost, scope, authority }) → { sessionRef, liveViewToken }`
- `handControl(sessionRef) / returnControl(sessionRef)` — owner takeover for sign-in/MFA
- `observe(sessionRef, readIntent) → { safeResult }` — read/observe only; returns nothing sensitive
- `executeGovernedAction(sessionRef, actionSpec, policyGrant) → { receipt }` — Phase 3, §10-gated
- `persistConnection(sessionRef, consent) → { opaqueConnectionRef }` — Phase 2, Vault-stored
- `closeSession(sessionRef) / revokeConnection(opaqueConnectionRef) / emergencyStop(...)`
- `captureDownload(sessionRef) → { vaultQuarantineRef }` — downloads → Vault quarantine

The adapter maps these to a worker (Browserbase bootstrap first; a Paige Chromium/Playwright fleet
later). The control plane owns tenant scope, the Vault Connected Accounts record, receipts, and the
§10/§68 governance — **never the adapter.**

---

## 6. What is owed / open decisions

- **Owner:** the Browserbase (bootstrap worker) provider review (§4 Phase 0); and the vendor
  confirmations from the audit §6.4 before any install.
- **Prerequisite security fixes** (audit §4.3): `browser_use_sessions` `tenant_id` + server-resolved
  tenant; the `browser-use` JWT-derived tenant/admin gate. These land before any worker write path.
- **Backend design owed** (specified in the build handoff): the Vault Connected Accounts schema + RLS;
  the internal contract's concrete types; the control-plane service; the receipt/Rail wiring; the §10
  action declaration for Phase 3.
- **CD owed:** the in-chat Secure Browser surface + connection-management visuals (`paige-ui-design` +
  `flow-prototype`).

## 7. Cross-references

`docs/audits/paige-secure-browser-audit-2026-09-06.md` (Phase-0 audit + owner ruling) ·
`docs/handoff/paige-secure-browser-build-handoff.md` (the exact builder spec) ·
`outputs/paige-at-cowork/08-sandboxed-research-external-execution.md` (the five-slice plan this extends) ·
`docs/doctrine/autonomy-architecture.md` §10/§68 (Phase-3 governance) ·
`docs/integration-registry/integration-capability-registry.json` (`browserbase` = PROPOSED worker runtime) ·
§00 (jurisdiction) · §9/§59 (tenant isolation + secret handling) · §38 (money boundary) · §32/§70
(build ≠ runtime proof; owner-usability).
