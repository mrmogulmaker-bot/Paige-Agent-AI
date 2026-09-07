# Paige Secure Browser / Twin — Phase-0 Audit & Provider-Decision Packet

**Date:** 2026-09-06 · **Branch:** `claude/paige-secure-browser-audit-zu4u9a` (off `main`, HEAD `56d86f0`)
· **Route:** §69 Flow-by-Flow **audit (existing product)** → current-state matrix → provider decision.
**Status: PHASE-0 TRUTHFUL INVENTORY + PROVIDER EVALUATION. No product code, no install, no
account, no crawl, no third-party login was performed.** The provider decision is an **owner
decision owed** (a §4/§69 material boundary: accepting a provider, a licence, and a new dependency).

> **Jurisdiction (§00).** This is a backend/security/tenant-isolation audit — CC's lane. Every
> *"is it built / does it work / is it tenant-safe / does it fail closed"* judgement here is a
> measurement, not a design opinion. Where this packet reaches the in-chat browser **surface**, its
> visual design is **Claude Design's** (§00) — routed through `paige-ui-design` + `flow-prototype`
> at build time. CC specifies the security architecture and the flow contract; CD draws the pixels.

> **Honesty discipline (§13/§32).** *Listed ≠ connected ≠ deployed ≠ live.* Every row below carries an
> honest label. Anything requiring Fly-runtime reach, prod-secret presence, or an authenticated drive
> that this headless session cannot perform is **PROOF OWED**, never asserted LIVE.

Grounded by a five-specialist read-only crew (codebase sweep · credential-vault/security · deployed
state + registries · external provider evaluation · this integrator), each claim file:line-citable.

---

## 1. Executive summary — the honest headline

**Paige is NOT a blank slate here, and it is also NOT close to a "secure connected-account browser."**
The platform has shipped a **read-only public-web research substrate** and the **generic security
primitives** a secure browser would need (encrypted connection-token vault, OAuth connect/disconnect,
append-only audit rails, SSRF guards, the §10/§68 autonomy substrate). It has **none** of the
credentialed-browser pieces: no owner-assisted sign-in, no MFA handoff, no browser session/cookie
vault, no in-chat live browser window, no connected-account-via-browser flow, and **no Twin,
Browserbase, or any managed browser provider actually wired** (Browserbase is an inert, undeployed
stub; neither Twin product is wired — strategy research only, §6.1).

**On the named candidate — "Twin" is TWO different products, and they must not be conflated
(owner-required correction, dated sources):** **twin.so** is operated by **TWIN LABS SAS** (Paris;
French reg. 978364222; twin.so/terms upd. 2025-05-09) and its **own** materials advertise a **REST API
but no MCP** (docs.twin.so/welcome) and **no shipped credential vault** (only a *"coming soon" Password
Manager* on its web-agent doc → **UNCONFIRMED**); data is **EU**-hosted and SOC 2 is **UNCONFIRMED**.
The **"credential vault + MCP"** material the owner referenced belongs to a **separate product,
twin-browser.com ("Twin Browser, the browser layer for AI agents")**, which advertises an
**encrypted-at-runtime credential vault** and a **31-tool MCP server** as *live* (twin-browser.com/security
+ /mcp, accessed 2026-09-07) — **but its legal operator is not disclosed anywhere** (no entity, /about
404s) and its **domain was registered only 2026-06-24 with a redacted WHOIS registrant** (who.is), a
serious due-diligence red flag for a product that would hold tenant credentials, and it is **not**
attributable to Twin Labs SAS (distinct entities, distinct contact domains, no cross-links either way).
**Neither product is wired into Paige.** Full disambiguation with citations: §6.1.

**The one decision owed to the owner (a round-table, §00/§4/§69):** *which credential/browser-execution
model* to adopt for the credentialed modes. The three shipped-provider models in the market are not
interchangeable, and the choice sets the whole security architecture:

| Model | Who holds the credential | Best-evidence provider |
|---|---|---|
| **Owner-direct-login + session persistence** (owner types the password in the provider browser; the platform stores an **opaque session/context reference**, never the password) | **Provider** (session cookie only); the raw password **never transits Paige** | **Browserbase** (Live View + Contexts) — SOC 2 Type II, US-resident, MCP-native; **"Twin"** = two distinct products, both with open questions (§6.1) |
| **Provider-held raw-credential vault + opaque reference** | **Provider vault** (raw secret, injected at run) | **Anchor OmniConnect** / **Steel** (self-host removes the third party) |
| **Paige-owned canonical vault** (the July-2026 landscape doc's §9 posture) | **Paige's own Supabase Vault** | self-hosted (`paige-browser` extended) |

**CC's recommendation, framed as evidence (not a decision):** pilot **two tracks, not one blind
install** — **Browserbase** as the controllable, compliant, US-resident, MCP-native foundation for
Modes 1–2 (build the handoff + persistence on it, keeping credential custody under Paige, best §9/§34
fit), with **Anchor OmniConnect or Steel** evaluated specifically for the Mode-3 literal vault. Treat
**"Twin"** with care — it is **two distinct products** (§6.1): twin.so lacks MCP and a shipped vault,
and twin-browser.com claims both but **conceals its legal operator**, so neither is a credential-holding
candidate until it discloses and passes review. Rationale and
evidence in §6. **This is a decision the owner makes at the round-table (owner · CC · Claude Design ·
Cowork · Codex), not a CC pick.**

## 1A. Owner ruling — Phase-0 exit decision (2026-09-07)

The owner reviewed this packet and ruled the round-table direction. The §1 "decision owed" is now
answered at the **design** level; **provider selection remains gated** on the review below.

- **Custody model — CHOSEN: owner-direct login + provider-held PERSISTENT browser session** (model (i),
  extended to persistence). The owner enters credentials and completes MFA **directly in the provider's
  live browser**; **Paige never receives or stores the raw password**. With **explicit owner consent**,
  the selected provider may **persist the browser session context** so Paige can later reopen the
  authorized account **under the owner's policy**. Paige stores **only**: an **opaque provider/context
  reference**, **allowed host + action scope**, **authority status**, **freshness**, **revocation
  state**, and **receipts** — never credentials, cookies, session tokens, or page content.
- **Leading Phase-1 candidate — Browserbase, as `PROPOSED` (not selected, not live).** Its official
  documentation supports live owner login (Live View), persistent authenticated contexts (Contexts —
  the context id is the opaque reference), and an official MCP server. It stays **`PROPOSED`** until the
  provider-contract, privacy, data-residency, security, price, and integration review (§6.4) completes
  and the owner authorizes it.
- **Twin disambiguation (the required correction, §6.1).** The "vault + MCP" material is
  **twin-browser.com ("Twin Browser")**, a product **distinct** from **twin.so (TWIN LABS SAS, Paris)**.
  twin-browser.com's **legal operator is undisclosed** and its **domain is ~10 weeks old** (2026-06-24,
  redacted WHOIS) — a due-diligence red flag for a credential-holding provider; **not** attributed to
  Twin Labs SAS.
- **Still binding:** **no browser provider is wired into Paige today**, and **nothing installs** — no
  account, credential, crawl, or third-party login — until the Browserbase review completes and the
  owner authorizes it.

The registry entry (`browserbase` → `PROPOSED`) and the owner-complete secure-browser MVP plan follow
this record, per the owner's sequence.

---

## 2. Current-state matrix (the assignment's exact questions)

Legend: **LIVE** (proven usable) · **PARTIAL** (real subset, gap named) · **UNAVAILABLE** (substrate
absent / not wired) · **PROOF OWED** (in code, authenticated-runtime/prod-liveness proof absent).

### 2.1 Capability questions

| Capability asked | Verdict | Evidence (file:line / how verified) |
|---|---|---|
| **Public web research / crawling** | **LIVE / PARTIAL** | `deep_research` chat tool → `paige-deep-research` (real PLAN→SEARCH→READ→GAP→synthesize + anti-fabrication citation gate) and `web_search` → `paige-web-search` (Firecrawl v2) are wired + reachable in chat (`paige-ai-chat/index.ts:5166-5195`, dispatch `:8462-8504`). `fetch-url-content` is SSRF-guarded plain fetch (not a browser). **PARTIAL because:** crawl provider is config-gated on `FIRECRAWL_API_KEY` (prod presence PROOF OWED); the Playwright `browse_public_url` path is flag-gated + has a page-write gap (below). |
| **In-chat embedded / live browser window** | **UNAVAILABLE** | No VNC/noVNC/live-view/session-viewer embedded in the chat/workspace (whole-repo `iframe\|vnc\|LiveView\|webview\|ws://` sweep). iframe hits are the GrowthBlocks page-builder preview (`src/components/admin/studio/LivePreview.tsx:398`) + Cal.com embeds. The only session-viewer artifact is a Browserbase `replay_url` **string** returned by an unwired stub. |
| **Twin wired** (twin.so **or** Twin Browser / twin-browser.com) | **UNAVAILABLE (both)** | Zero code/config/registry presence for either. Every `twin` string in `src/`, `supabase/`, `services/`, `scripts/` is the English word. "Twin" appears only in `docs/strategy/twin-capabilities-landscape-2026-07-26.md`; the two are distinct vendors (§6.1). |
| **Browserbase wired** | **UNAVAILABLE** | `supabase/functions/browser-use/index.ts` is an inert stub ("inert until `BROWSERBASE_API_KEY`+`BROWSERBASE_PROJECT_ID` set"; "edge functions can't import Playwright"). **Not in the 220 deployed functions** (repo dir with no deployed counterpart). Registry: `browserbase` = `UNAVAILABLE`/prohibited. |
| **Playwright / Chrome** | **PARTIAL (as product substrate) / DEV-only (root)** | Product: `services/paige-browser` (self-hosted warm Chromium Playwright, Fly) — `/self-verify` LIVE-green; `/browse-public-url` PARTIAL. `services/visual-renderer` (Playwright screenshot, §33). Root `package.json:190` `playwright` is a **devDependency** driving `scripts/live-drive/*` (§32 CI harness) — **not product**. |
| **MCP browser provider** | **UNAVAILABLE** | No MCP browser server wired. (twin.so has no MCP; twin-browser.com claims MCP but conceals its operator, §6.1; Browserbase/Steel/Browserless offer official MCP if adopted.) |
| **Tenant-safe credential / session vault** | **LIVE (API/OAuth tokens) / UNAVAILABLE (browser session/cookie)** | `tenant_mcp_connections` + siblings: tenant-scoped, `FORCE RLS`, `bytea` ciphertext, decryption `service_role`-only via `get_tenant_mcp_secret` (`20261005000000:466`). It is a **connection-token vault, not a browser session/cookie vault** — no place to persist a logged-in third-party browser session. |
| **Connected-account flow** | **LIVE (MCP/OAuth only)** | `tenant-mcp-connect/index.ts` — OAuth 2.1 + DCR + PKCE, connect/verify/discover/approve/disconnect, tenant from JWT, admin-gated, provider-side revoke on disconnect. Scoped to **Zapier/n8n**, not arbitrary web logins. |
| **Encrypted storage** | **LIVE (with key-custody caveat)** | pgcrypto `platform_encrypt/decrypt` (`20260702022450:18-51`), key in `public._internal_secrets` **inside the same DB**. `supabase_vault`, `pgcrypto`, `pgsodium`, `pgjwt` all installed. **Caveat:** symmetric-key-in-DB, not KMS/HSM envelope — "encrypted against app-layer read," not HSM-grade key isolation. |
| **MFA handoff** | **UNAVAILABLE** | Only Paige's **own-account** TOTP (`AccountSecurityPanel.tsx`, "does NOT enforce AAL2"). No substrate to pause an agent so a human clears a downstream site's 2FA. |
| **Live-view / session recording** | **UNAVAILABLE (inert plumbing)** | `browser_use_sessions` has `screenshots[]` + `session_replay_url` columns but the writer is inert **and the table has no `tenant_id`** (legacy, §9 gap if revived). `scripts/live-drive` is dev tooling. |
| **Audit trail** | **LIVE (append-only-by-grant, not WORM)** | `paige_browser_usage` (`20260913140000`) — tenant-scoped, `FORCE RLS`, `service_role` INSERT only, append-only by grant-revoke, **with a live writer** (`skill-interpreter.ts:360`). Plus `paige_client_events`, `paige_audit_log`. **Not** cryptographic immutability (no hash-chain/WORM). |
| **Revocation** | **PARTIAL** | Per-connection disconnect + provider-side revoke (`clear_tenant_mcp_connection`; `tenant-mcp-connect:129`); wildcard browse global off-switch. **No** global emergency-stop spanning connections + in-flight actions. |
| **Deployment evidence** | **PROOF OWED** | CI machinery real (`deploy-fly-services.yml`, `edge-live`/`db-live` tags, `deploy-migrations.yml` persistence verify). But git tags not fetched in this checkout; `paige-browser` Fly liveness + `PAIGE_BROWSER_WILDCARD_ENABLED`/`FIRECRAWL_API_KEY`/`PAIGE_BROWSER_SECRET` prod-secret presence are **PROOF OWED** (no Fly/edge-secret reach headless). |
| **Browser API keys / env / registry / chat tools / flags / UI / docs** | **Mixed — see below** | Env NAMES present (`PAIGE_BROWSER_URL/SECRET`, `PAIGE_BROWSER_WILDCARD_ENABLED`, `BROWSERBASE_*`, `FIRECRAWL_API_KEY`); registry has `paige-browser-research` (PARTIAL) + `browserbase` (UNAVAILABLE), **no Twin**; chat tools `web_search`/`deep_research` LIVE, `web_fetch` **stub**; browse via `browse_public_url`/`verify_deployed_surface` **skills** (not inline chat tools); action-kind `tech.browse_public`; UI = admin Skills Hub only (**no "Secure Browser"/"Twin" entry point**); docs = strategy + the owner-locked plan. |

### 2.2 The three intended modes — where each stands today

| Intended mode | Today | Gap to close |
|---|---|---|
| **Mode 1 — public research + bounded crawling (approved public domains)** | **LIVE / PARTIAL** | Reachability (`browse_public_url` runs via `run_skill`/Skills Hub, **not** the main chat loop — §36 gap); the **G5 page-initiated-write** gap; SSRF reconcile (#138 DNS-rebinding); `FIRECRAWL_API_KEY` prod confirm; §32.c live-drive. |
| **Mode 2 — owner-assisted sign-in, MFA handoff, Paige never sees the password** | **UNAVAILABLE** | Needs a provider (or extended self-host) that offers a login handoff + live view; the `paige-browser` host explicitly has **"NO tenant authentication. That is Slice 4"** and rejects login/submit/click/download. |
| **Mode 3 — owner-authorized connected accounts, provider vault, opaque reference** | **UNAVAILABLE / greenfield** | Needs a provider-held session/credential vault + an opaque-reference store on our side (allowed domains/actions, freshness, authority). Tensions with the July §9 "Paige-owned canonical vault" posture — the owner chooses (§6.4). |

---

## 3. What already exists — the seams to EXTEND (§18: never reinvent)

This audit's most important honest finding: **the research half is largely built; the credentialed
half is genuinely greenfield.** Treating "Paige Secure Browser" as one net-new feature would re-invent
shipped, proven code. The seams to build on:

- **`services/paige-browser`** — self-hosted warm-Chromium Playwright (Fly), DB-free, SSRF-guarded,
  shared-secret gated. `/self-verify` (LIVE-green) + `/browse-public-url` (PARTIAL, flag-gated).
- **`paige-deep-research` / `paige-web-search` / `fetch-url-content`** — the LIVE research engines,
  reachable in the one Paige conversation, with an anti-fabrication citation gate.
- **`browse_public_url` skill** (`20260914000000`, §32.a-persisted) + `run_skill` (paige-mcp) + Skills
  Hub — the governed research capability; audit rail `paige_browser_usage` (LIVE writer).
- **`tenant_mcp_connections` vault + `tenant-mcp-connect` OAuth flow** — the tenant-safe, encrypted,
  service-role-gated, revocable connection substrate to extend for an **opaque connection reference**.
- **pgcrypto `platform_encrypt/decrypt` + `supabase_vault`/`pgsodium`** — the encryption substrate.
- **Append-only audit rails** — `paige_browser_usage`, `paige_client_events`, `paige_audit_log`;
  `_shared/capability-record.ts` `record_capability_run` (6 outcomes) — the one home for a Rail receipt.
- **The autonomy substrate (§10/§16/§68)** — `paige_action_kinds` action bus (auto-send unrepresentable
  by DB CHECK), `paige_automations` + `resolve_automation_autonomy` (RE-1 shipped), the §68 decay law
  (cross-tenant canary + RLS coverage), and the **Standing Delegated Authority Contract** (§10, seven
  dimensions). **Any Paige-DRIVEN browser action (Modes 2/3 acting, Phase 3) rides this — not a new
  autonomy system.**

**The two prerequisite gaps already recorded in doctrine** (so a credentialed-browser action can be
*governed*): `decideGovernedExecution` is a pure module **unwired**; `paige-mcp` enforces tier+scope but
**no risk/approval gate**; `delegate_to_subagent` runs the orchestrator as service-role and the
specialist acts **outside** the gate; **RE-2** (lift the consequential-act `confirm` floor under a valid
standing policy) is **NOT built**; **M1** (carry `paige_llm_trace` → `platform_metered_events`) is **NOT
built**. These are the same gaps the owner-locked plan `08-sandboxed-research-external-execution.md`
already names.

---

## 4. Affected-flow / collision packet

### 4.1 Collisions & relationships with existing work (the thing this MUST NOT fork)

| # | Existing artifact | Relationship | Action |
|---|---|---|---|
| C1 | **`outputs/paige-at-cowork/08-sandboxed-research-external-execution.md`** (owner-locked five-slice plan S-R1…S-R5, 2026-09-05) | **PRIMARY.** This audit's roadmap **extends** it, does not fork it. Mode 1 / Phase 4 ≈ **S-R1**. Phase 3 governed acting ≈ **S-R2 + S-R4**. **The net-new:** S-R4 assumed **Paige drives the login** (high-risk, sandboxed). Modes 2/3 introduce a **safer** model — **the owner signs in, Paige never sees the password** — which S-R4 never contemplated. | Roadmap (§7) maps Phase 0–4 onto S-R1…S-R5; the owner-direct-login model is added as the S-R4 predecessor, not a competitor. |
| C2 | **`docs/strategy/twin-capabilities-landscape-2026-07-26.md`** (Direction A) | Recommended **Browserbase infra + Paige-owned Supabase Vault as canonical**, and to "hard-block any pattern that lets a third-party auth service store tenant credentials our own vault could hold." | **Tensions** with the assignment's Phase-2 provider-vault. Resolved as an **owner choice** (§6.4): with owner-direct-login the credential **never transits Paige**, so "provider holds the session, we hold an opaque reference" is a *different and arguably stronger §59 posture*, not a flat violation. Owner rules at the round-table. |
| C3 | **Integration Capability Registry** (`docs/integration-registry/*`) | Existing entries: `paige-browser-research` (**PARTIAL**), `browserbase` (**UNAVAILABLE**). **Twin absent.** | The registry **delivery rule** binds the *decision* PR (not this audit). §9 stages the exact deltas; nothing is added to the JSON until a provider is selected (R1/R2 — a `PROPOSED` entry needs an approved direction). |
| C4 | **Autonomy architecture §10 (Standing Delegated Authority Contract) + §68 decay law** | Phase 3 governed delegation **must** declare all seven §10 dimensions and ride §68. **RE-2** (floor lift) + **M1** (metering) are prerequisites and **not built**. | Phase 3 in §7 is written as a §10 consumer; the credentialed-browser action is a `high`/`external_effect` capability, `confirm`-floored until RE-2. |
| C5 | **`decideGovernedExecution` unwired · `paige-mcp` no risk gate · `delegate_to_subagent` downstream ungoverned** | Prerequisites for *any* Paige-DRIVEN browser mutation. | Named as Phase-3 dependencies; not re-solved here (they are S-R2's work). |
| C6 | **`provider-result-contract.md`** (8-word Systems Check vocab) | A browser provider reports connection/health via this shape; **"not started" = `NOT CONNECTED`, never `PENDING PROVIDER`**; a saved credential/fired call is `PROOF OWED`, never `LIVE`. | The connection-management surface (§8) publishes this contract, not a bespoke status. |
| C7 | **Surface Binding Ledger** (`settings.connections` = UNAVAILABLE; `settings.integrations` = PARTIAL) | A new Secure-Browser / connected-account surface needs a ledger row with `state` + `intended_capability` lanes; no browser surface exists today. | Roadmap notes the ledger row lands with the surface slice (`lint:binding-ledger` gate). |

### 4.2 Surfaces / flows the capability touches

- **The one Paige conversation** (Solo `paige.workspace`) — Mode 1 research already streams here; Modes
  2/3 add an owner-assisted **connect** moment (§20/§21: no new tab — a chat act + the project rail).
- **Settings → Connections / Integrations** — where a connected account is authorized, viewed, and
  **revoked** (extends the existing MCP connect/disconnect surface; CD owns the visual).
- **Command Center / Rail** — where the audit receipts (`get_solo_rail_activity`) surface owner-visibly.
- **Systems Check** — where connection health reports via the provider-result contract.
- **Trust Compass / Automations** — where a standing grant for a Paige-DRIVEN browser task is set (§10).

### 4.3 Parked findings surfaced during this audit (evidence attached; not fixed here)

Per the attention-register one-copy rule, these are recorded here with exact evidence; **new** ones
should become GitHub issues before any Phase-1 build (I have **not** auto-filed to avoid duplicates —
the owner/Codex may already track some).

1. **G5 — page-initiated writes not method-gated** (`services/paige-browser/server.js:328-334`): the
   `page.route("**/*")` interceptor gates host/SSRF only, not HTTP method, with page JS on, so a
   visited page's own script could POST to a public host. **Already tracked** (Codex P1, 2026-09-05).
   Blocks any "read-only by construction" claim on the research path until fixed.
2. **`browser_use_sessions` has no `tenant_id`** (`20260630013855`): legacy, role-based RLS. **Inert
   today**; a §9 tenant-isolation gap **if the Browserbase path is ever revived**. Keep inert or add
   `tenant_id` on revival. *(New — recommend an issue.)*
3. **`growth-process-submission/index.ts:592`** — in-code note of a `platform_decrypt` against a
   "not tenant-scoped" table; confirm the decrypted value is not returned cross-tenant. *(New —
   recommend an owed-verification issue; flagged by the security scout, not confirmed a leak.)*
4. **`paige_browser_usage.url_requested` stores the raw URL** — a URL carrying a secret in its path
   would persist. Low risk (never placed in LLM context), noted for the secret-in-URL threat model.
5. **SSRF reconcile (#138 DNS-rebinding) + two unequal SSRF guards** — `fetch-url-content` uses a
   weaker guard than the Fly host; the research READ step should route the strong DNS-resolving guard.
   **Already tracked** (S-R1 G1).

---

## 5. Deployed-state proof ledger (what is LIVE vs PROOF OWED)

| Fact | State | Basis |
|---|---|---|
| Twin (twin.so) or Twin Browser (twin-browser.com) in code/config/registry | **Absent (both)** | grep + registry read |
| Browserbase `browser-use` fn deployed | **No** (undeployed + inert) | `list_edge_functions` diff (220 live) + source |
| `paige-deep-research`/`web-search`/`paige-web-search`/`fetch-url-content`/`skill-runner` deployed | **Yes** | `list_edge_functions` |
| `paige_browser_usage` / `browser_use_sessions` tables | **Exist** (0 / 2 rows), RLS on | `list_tables` |
| Crypto substrate (`supabase_vault`/`pgcrypto`/`pgsodium`/`pgjwt`) | **Installed** | `list_extensions` |
| `paige-browser` Fly host live + `PAIGE_BROWSER_WILDCARD_ENABLED`/`FIRECRAWL_API_KEY`/secrets on prod | **PROOF OWED** | no Fly/edge-secret reach headless; code comment + config-registry only |
| Any authenticated tenant browse flow driven end-to-end (§32.c) | **PROOF OWED** | no auth-drive capability this session |

---

## 6. Provider evaluation & recommendation (evidence for the owner decision)

**Do not read this as a CC pick.** Choosing/accepting a provider is a §4/§69 material boundary
(licence, DPA, new dependency, spend) and a §00 round-table.

### 6.1 The required correction — "Twin" is TWO different products (dated sources; do not conflate)

The brief named "Twin." There are **two distinct products** under that brand, and the audit must keep
them apart (owner-required, 2026-09-07). **Neither is wired into Paige** (§2/§5 holds for both).

**A) twin.so — "Twin," operated by TWIN LABS SAS** (Paris; French reg. 978364222; twin.so/terms upd.
2025-05-09; founders Hugo Mercier / Joao Justi; €12M raised). From its **own** current materials:
- **MCP: ABSENT.** The advertised programmatic seam is a **REST API**; no MCP (docs.twin.so/welcome,
  accessed 2026-09-07). (The prior eval's "REST only, no MCP" for twin.so stands.)
- **Raw-credential vault: UNCONFIRMED.** It appears only as a **"coming soon" Password Manager** on the
  web-agent doc and is **not surfaced on its current pages**; the only "twin.so has Vaults" statement is
  a **third-party** Tallyfy page (2026-03-22), not a twin.so-owned source. Product detail sits behind
  the authenticated app, which was **not** accessed.
- **Login handoff / session persistence** (agent stops at login, owner enters password + 2FA, hands
  back) is described on docs.twin.so/web-agent. **Data residency: EU** (Hetzner/AWS/GCP EU;
  twin.so/subprocessors upd. 2026-06-15; subprocessors include Anthropic + OpenAI for LLM inference).
  **SOC 2: UNCONFIRMED** (not stated on its site; a compliance-vendor case study asserts it — verify
  the actual report + period under NDA).

**B) twin-browser.com — "Twin Browser, the browser layer for AI agents" — a SEPARATE product.** This is
where the **"credential vault + MCP"** material comes from:
- **Credential vault: advertised LIVE** — *"Store a credential once; reference it by name … it never
  reaches the model, the logs, the audit record … encrypted at rest, filled only at run time, redacted
  from every log"* (twin-browser.com/security + homepage, accessed 2026-09-07).
- **MCP: advertised LIVE** — a **31-tool MCP server over stdio** (`run_goal`, `run_skill` blind-replay,
  `connect_account`, `observe_page`, `crawl`, …; /mcp states nothing is "coming soon", accessed
  2026-09-07).
- **Owner login: a per-run approval + MFA-pause gate** (run stops at the gate for an approval/2FA), **not
  a hand-over of the owner's logged-in session**; **persistent cross-run sessions are NOT a marketed
  claim** (UNCONFIRMED).
- **⚠ DUE-DILIGENCE RED FLAG.** Its **legal operator is not disclosed anywhere** (no entity /
  registration / jurisdiction; /about returns 404; contacts only @twin-browser.com), and the **domain
  was registered only 2026-06-24 with a redacted WHOIS registrant** (who.is, accessed 2026-09-07) — a
  ~10-week-old, operator-concealed vendor that would hold tenant credentials. Isolation model, SOC 2,
  and residency are all **UNCONFIRMED**.

**Verdict — DISTINCT products; common ownership UNCONFIRMED (leaning independent).** Different disclosed
entities (one named, one concealed), different contact domains, **no cross-links in either direction**,
different category, different domain age; twin-browser.com's /compare names Browserbase/Steel/Anchor and
**never mentions twin.so**. Do **not** attribute twin-browser.com's vault/MCP to Twin Labs SAS, and flag
that whoever legally operates twin-browser.com is **currently unverifiable**. A vendor that conceals its
operator is not a candidate to hold tenant credentials until it discloses and passes the §6.4 review.
Sources: twin.so/terms · twin.so/subprocessors · docs.twin.so/welcome · twin-browser.com/security · /mcp
· /compare · /terms · /privacy · who.is (twin-browser.com WHOIS) — all accessed 2026-09-07.

### 6.2 Comparative (public official materials, confidence-marked)

- **Browserbase** — SOC 2 Type II + **HIPAA/BAA**, residency **US-East/US-West/EU/Asia**, 1 browser/VM
  destroyed per session + **zero-retention** option + BYO-LLM, **official MCP**, Stagehand/Playwright.
  **Contexts** = encrypted session persistence, **context ID = the opaque reference**; **Live View** =
  the direct-login/MFA handoff (you build it; Ramp uses this exact pattern). Session-hours pricing
  (SaaS-friendly). Gap vs. spec: persistence is session/cookie, **not** a raw-password vault.
- **Anchor OmniConnect** — a real **managed credential vault** ("your automation never touched a raw
  password or cookie"), native **MFA/TOTP**, `live_view_url`. SOC 2 Type 2 / ISO 27001 per third-party
  (verify). No first-party MCP. Closest to the **literal Mode-3 vault** wording.
- **Steel.dev** — **open-source** + managed; **Credentials API** (per-credential short-lived
  AES-256-GCM wrapped by an org KMS key); **self-hostable → no third party holds credentials** (best
  §9/§34 fit). Official MCP. SOC 2 / pricing **UNCONFIRMED**.
- **Browserless** — most mature, SOC 2 Type II, official MCP, but **no vault/handoff** (raw sessions).
- **Hyperbrowser** — AI-agent browser; no prominent SOC 2; no vault/handoff documented.

### 6.3 Decision matrix (✅ known-yes · ❌ known-no · ❓ unconfirmed)

| Requirement | twin.so | Browserbase | Anchor | Steel | Browserless |
|---|---|---|---|---|---|
| Owner direct login + MFA, platform never sees password | ✅ turnkey | ✅ Live View (build it) | ✅ (vault; takeover ❓) | ✅ (vault; takeover ❓) | ❌ |
| Provider vault + opaque reference | ❓ coming-soon (UNCONFIRMED) | ⚠️ Contexts (session, not raw-pw) | ✅ OmniConnect | ✅ Credentials API | ❌ |
| Tenant isolation | ⚠️ workspace-level | ✅ 1/VM destroyed | ❓ | ✅ (self-host) | ✅ (ent) |
| SOC 2 | ❓ unverified | ✅ Type II | ✅ (verify) | ❓ | ✅ Type II |
| Data residency incl. US | ⚠️ EU-default | ✅ US+EU+Asia | ❓ (BYOC ent) | ✅ (self-host) | ❓ |
| REST + MCP | REST ✅ / MCP ❌ | ✅ + MCP | REST ✅ / MCP ❌ | ✅ + MCP | ✅ + MCP |
| Crawling | ✅ | ✅ | ✅ | ✅ | ✅ |
| Live view / audit | ✅ / claimed | ✅ / configurable | ✅ | ✅ replays | ✅ |
| Multi-tenant-embed commercial fit | ❓ per-task/agent | ✅ session-hours | ❓ credits | ❓ | 30-sec units |
| Maturity | early | production | newer | OSS | most mature |

> **The `twin.so` column is Twin Labs SAS's product.** The **separate** `twin-browser.com` ("Twin
> Browser") advertises **vault ✅ + 31-tool MCP ✅ + per-run MFA-pause ✅ + crawling ✅** as live — but
> with **operator undisclosed, domain registered 2026-06-24, and SOC 2 / residency / isolation all
> UNCONFIRMED** (§6.1). Evaluate it only after it discloses its legal operator; do not merge it into the
> `twin.so` column.

### 6.4 Recommendation (evidence, not decision) + the credential-custody choice

**Owner ruling (2026-09-07, see §1A):** custody model (i) — owner-direct login + provider-held
**persistent** session, opaque reference only — is **chosen**, and **Browserbase** is adopted as the
**`PROPOSED`** Phase-1 candidate pending the verification list at the end of this section.

No single provider cleanly matches all three modes as literally specified, because Modes 2 and 3 are
**two different credential architectures** that today live in different products.

- **Modes 1–2 foundation:** **Browserbase** — the controllable, compliant (SOC 2 Type II + HIPAA),
  US-resident, MCP-native option; build the handoff (Live View) + persistence (Contexts, the context
  ID is the opaque reference) yourself, keeping credential custody under Paige (best §9/§34 fit).
- **Mode-3 literal vault:** **Anchor OmniConnect** or **Steel** (self-host removes the third party).
- **Twin — two distinct products (§6.1):** **twin.so** (Twin Labs SAS) has REST but **no MCP** and no
  shipped vault, so it does not meet the vault/MCP requirement; **twin-browser.com** advertises vault +
  MCP but **conceals its legal operator** and is a **~10-week-old** domain — **not a candidate to hold
  credentials** until it discloses its operator and passes review. **Neither is install-ready.**

**The owner's actual choice, stated plainly** (a round-table, not a CC decision):

1. **Credential custody model** — (i) owner-direct-login + provider session persistence (credential
   never transits Paige; we hold an opaque reference), (ii) provider-held raw-credential vault, or
   (iii) Paige-owned canonical Supabase Vault (the July §9 posture). **CC's engineering read:** (i) is
   the strongest fit for the assignment's hard requirement that *"browser credentials, cookies,
   session tokens … MFA codes are never included in LLM context by default"* and *"Paige must never
   receive, display, log, or persist the raw password"* — you cannot leak what you never held.
2. **Build vs. buy for the browser runtime** — extend the self-hosted `paige-browser` (owns the moat,
   §34; but building isolation/handoff/MFA/live-view/contexts is real work), or adopt a managed
   provider (faster, compliance inherited, but a new §34 dependency + data-flow to a third party). The
   July doc's hybrid (self-host for scheduled/recurring, managed for ad-hoc) remains a live option.

**Facts the owner must verify directly with any chosen vendor before install:** the actual SOC 2 Type
II report (scope + period); a signed DPA + subprocessor list + change-notification (note **twin.so**
routes page content to Anthropic + OpenAI per its subprocessors; **twin-browser.com's** operator and
subprocessors are undisclosed); written **US data-residency**; the credential-custody
architecture (key custody, log exclusion, opaque-reference format); and pricing at Paige's projected
multi-tenant volume.

---

## 7. MVP roadmap — Phase 0–4 (extends the owner-locked S-R1…S-R5, never forks it)

Every phase declares its capability contract (tenant isolation, authz, audit/outcome, provenance,
safe-failure, durable home) and rides the existing governance seams. **Fail-closed is the default**
whenever a connection, authority policy, target domain, action type, freshness, or receipt is missing.

- **Phase 0 — Truthful inventory + provider decision (THIS DOCUMENT).** Deliverable: this packet.
  **Exit = the owner's round-table provider/custody decision** (§6.4). No install until then.

- **Phase 1 — Owner-assisted, ephemeral in-chat browser session (one approved provider), NO saved
  login.** ≈ new predecessor to S-R4. The owner opens an **isolated, provider-controlled** browser
  from the one Paige conversation, **signs in directly, completes MFA**; Paige observes/reads within
  the session's approved scope and **never receives, displays, logs, or persists the raw password**.
  Session is **ephemeral** — discarded on close; nothing persisted beyond an audit receipt + (if the
  provider supports it) a live-view URL surfaced to the owner only. Rides: the provider's live-view +
  isolation; `paige_browser_usage`-class audit rail; §16 lanes (this is **read/observe**, not a
  Paige-driven write). **See §8 for the security/flow contract.**

- **Phase 2 — Explicit connected-account persistence via the approved provider vault.** ≈ Mode 3 /
  S-R3 substrate. After explicit owner consent, the **provider's** encrypted vault/session retains the
  connection; **Paige stores only an opaque connection reference** + allowed domains/actions +
  freshness + authority status (extends the `tenant_mcp_connections` pattern — a reference row, **no
  raw secret**, `FORCE RLS`, service-role writes, per-connection **revoke/disconnect**). Owner-visible
  connection management + **MFA handoff** on (re)auth. Reports health via the provider-result contract
  (§C6). Fail-closed: a stale/absent/expired connection blocks the action.

- **Phase 3 — Governed delegated browser tasks.** ≈ S-R2 + S-R4, as a **§10 Standing Delegated
  Authority Contract** consumer (all seven dimensions): per-domain/action policy; owner/authorized-rep
  authority (§53); dollar + **velocity caps**; window/expiry; approval threshold; **exactly-once
  idempotency**; **verified readback**; **immutable receipts** (Rail, dimension 5); **pause / revoke /
  emergency-stop**; **fail-closed**. A Paige-DRIVEN browser mutation is a `high`/`external_effect`
  action — **`confirm`-floored until RE-2** lifts it under a valid standing policy; **prohibited**
  actions (money outside a connected provider, cross-tenant, §38 breaches) never delegable. **Depends
  on:** RE-2, M1 metering, and the S-R2 gate-unification (`decideGovernedExecution` wired, MCP/sub-agent
  downstream governed). **Prefer a secure supported API over browser automation** wherever one exists;
  browser is the governed fallback for owner-authorized portals with no API.

- **Phase 4 — Bounded public crawling + reusable browser skills.** ≈ S-R1 hardening + skill authoring.
  Respect authorization, **provider terms, robots directives where applicable, rate limits, and
  target-domain allowlists**. Close **G5** (page-write fence), SSRF reconcile (#138), confirm Firecrawl
  on prod, put `browse_public_url` in the main chat loop (§36), §32.c live-drive. Seed vs.
  tenant-authored crawl skills with the ToS-flag discipline the July doc requires (LinkedIn/Meta =
  tenant-authored only, never a platform-default seed).

> **A Chrome extension "local browser takeover"** is a **later optional** path (§35 OS surface), **not
> a substitute** for the tenant-safe managed-browser foundation above.

---

## 8. Phase-1 security / flow prototype plan

**§00 boundary:** what follows is the **security architecture + flow contract** (CC's). The **visual
design** of the in-chat browser surface is **Claude Design's**, routed through `paige-ui-design` +
`flow-prototype` (Gate 1) at build time; pre-launch §4 governs the gates. CC does not draw or judge
the surface.

**Flow (owner-assisted, ephemeral, no saved login):**
1. Owner asks Paige (in the one conversation) to open a portal Paige has no API for.
2. Paige classifies + confirms scope (which domain, what she'll read), then **requests an isolated
   provider browser session** (server-side; shared-secret gated; tenant + task bound).
3. The provider returns a **live-view handle**; Paige surfaces it to the **owner only** and **stops at
   the login page** (provider-native handoff).
4. **Owner types the password + completes MFA directly in the provider browser.** The raw password,
   cookies, session tokens, MFA codes, page HTML, and screenshots **never enter LLM context, are never
   logged by Paige, and are never persisted by Paige** (hard requirement).
5. Owner hands control back; Paige performs only **read/observe** within the approved scope (no
   Paige-driven writes in Phase 1 — those are Phase 3, governed).
6. Session **ends ephemerally**; Paige writes an **audit receipt** (who/when/domain/scope/outcome — no
   secrets, no raw payload) to the `paige_browser_usage`-class rail; nothing else is retained.

**Security invariants (each a fail-closed gate):** tenant+task isolation (no cross-tenant session/
history/data); credentials/cookies/tokens/HTML/screenshots/MFA out of LLM context **by default**;
provider session ephemeral; owner-only live view; **fail closed** on missing scope/authority/
freshness/receipt; **read/observe lane only**; every action an attributable Rail receipt; **prompt-
injection boundary** — page content is untrusted **data, never instructions**.

**Prototype scope:** a `flow-prototype` of the connect → handoff → observe → close flow across all
states (first-use, login pause, MFA, success, cancel/abandon, provider-error, revoke), for owner
approval **before** any provider install — the prototype needs **no real provider account** (mock the
handoff), so it can be built read-only. The build itself waits on the §6.4 provider decision.

---

## 9. Integration Capability Registry — proposed deltas (land with the DECISION PR, not here)

Per the registry delivery rule (R1/R2: `PROPOSED` needs an approved direction; listed ≠ connected),
**nothing is added to the JSON in this audit PR.** When the owner selects a provider, the **same PR**
that wires it adds/updates:

1. **Update `paige-browser-research`** — cross-reference this audit; keep `PARTIAL`; add the Modes-1/4
   hardening (G5, SSRF reconcile, §32.c) to `next_slice`.
2. **Update `browserbase`** — if selected, promote from `UNAVAILABLE` toward `PROPOSED`/`PARTIAL` with
   the real capability, authority lane (`read`→`draft`, `confirm`-floored write), M1 dependency,
   canonical receipt (`paige_browser_usage` + provider run id), residency, and taxonomy
   `marketplace_mcp_automation`.
3. **Add a `twin` entry** (only if selected) — taxonomy `marketplace_mcp_automation`; honest status
   (`PROPOSED` at most until wired); record the §6.1 unknowns (vault "coming soon", no MCP, EU
   residency, vendor-asserted SOC 2) as `dependency`; the connected-account handoff as the capability;
   **M1 real-money dependency** (per-task/agent spend), security obligations (DPA, subprocessors incl.
   Anthropic/OpenAI), and Rail/Mind/Memory boundary (opaque reference only; page content is untrusted).

The **operational costs, usage drivers, security obligations, and M1 real-money dependency** of the
selected provider all attach to that single entry — **no duplicate registry** (§18).

---

## 10. Hard-requirements conformance (how the design satisfies each)

| Hard requirement | How the architecture meets it |
|---|---|
| Credentials/cookies/tokens/screenshots/HTML/docs/MFA codes never in LLM context by default | Owner-direct-login (credential never transits Paige); provider holds the session; Paige holds an opaque reference + reads only scoped, safe fields; page content is untrusted data (§8). |
| No cross-tenant session/credential/history/skill/crawl-data leak | Tenant+task isolation on the provider session; the reference store is `FORCE RLS` service-role-write; the `browser_use_sessions` no-`tenant_id` gap stays inert or is fixed on revival (§4.3). |
| Fail closed on missing connection/authority/domain/action/freshness/receipt | Every Phase-1/2/3 gate is fail-closed; §10 dimension 7 + the governed-execution typed fail-closed codes. |
| Separate read / draft / auto-under-standing-policy / confirm-escalation / prohibited | The §16 `autonomy_lane` enum + §10 grant; Phase-1 = read/observe; Phase-3 acts are `high`/`confirm`-floored until RE-2; §38/cross-tenant/money-outside-provider = prohibited. |
| API preferred; browser is the governed fallback | Explicit in Phase 3 — use a secure supported API when one exists; browser only for owner-authorized portals without an API. |
| Selected provider + costs/usage/security/M1 into the existing registry, no duplicate | §9 — one entry, all fields, `lint:integration-registry`. |
| Chrome extension is a later optional path, not the foundation | Stated in §7. |

---

## 11. What is owed, and by whom

- **OWNER (round-table, §6.4):** the credential-custody model + build-vs-buy provider decision. **This
  is the Phase-0 exit gate; nothing installs until it lands.** Plus the direct-vendor confirmations in
  §6.4 before any install.
- **CC (on the decision):** the registry deltas (§9), the Phase-1 security/flow contract (§8), and the
  §10-conformant Phase-3 design — as their own flow-by-flow build slices, each with a §37 producer
  inventory + §32 proof.
- **Claude Design:** the in-chat browser surface + connection-management visuals (`paige-ui-design` +
  `flow-prototype`).
- **PROOF OWED (a browser-capable session):** `paige-browser` Fly liveness, prod-secret presence
  (`FIRECRAWL_API_KEY`, `PAIGE_BROWSER_*`), and the §32.c authenticated drive of the existing research
  path — none reachable from this headless session.
- **New issues recommended:** §4.3 items 2 and 3 (the others are already tracked).

*This packet is a decision + inventory record (attention-register §1: a dated write-up whose findings
are individually issue-able). It records platform truth and a decision owed; it authorizes no schema,
UI, or provider install.*
