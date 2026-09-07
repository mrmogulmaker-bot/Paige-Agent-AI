# Browserbase worker-provider review + go/no-go — Paige Secure Browser Phase-0

**Date:** 2026-09-07 · **Type:** read-only desk review of PUBLIC official materials (all pages accessed
2026-09-07). **No account, login, credential, API call, session, or crawl. The `BROWSERBASE_API_KEY`
secret's value was never revealed, requested, logged, rotated, or tested** — its presence as an Edge
secret is treated as **infrastructure readiness only**, not authorization to wire.
**Grounds:** `docs/audits/paige-secure-browser-audit-2026-09-06.md`, `docs/delivery/paige-secure-browser-mvp-plan.md`,
`docs/handoff/paige-secure-browser-build-handoff.md`. **Reviews:** Browserbase as the PROPOSED,
replaceable bootstrap runtime for the isolated browser **WORKER** only (§00 — never the customer-facing
capability; no provider branding/API/MCP/data-model in customer UI or core contracts).

**Confidence:** **KNOWN** = read directly on an official Browserbase page. **UNCONFIRMED** = third-party/
snippet/JS-gated page/inference — **verify with vendor before wiring.**

---

## Go / No-Go recommendation (CC evidence → owner decision)

**CONDITIONAL GO** to adopt Browserbase as the bootstrap browser-**worker** runtime behind the
provider-neutral internal Secure Browser contract — and to **build the Paige-owned Secure Browser now**
(the in-chat UI, the control plane, the provider-neutral contract, and the **read-only** Phase-1 worker
path, flagged off). The technical fit is strong and **every internal contract op maps to a documented
Browserbase primitive** (§8 table). Its **Contexts** model matches our intended custody exactly:
*"No raw credentials are submitted to Browserbase"* — the owner logs in live (Live View) and only the
encrypted session (AES-256-CBC per-context envelope) is retained; Paige stores just the Context ID.

**The GO is CONDITIONAL — credentialed wiring MUST NOT begin until these owner-side gates clear** (none
are things CC can do; all require the vendor or an owner build decision):

1. **Obtain + READ, under NDA, the request-gated documents** the public pages only *assert*: the **SOC 2
   Type II report** (confirm audit period + scope), the **HIPAA BAA** (confirm it's offered on our plan
   tier, not Scale-only), the **DPA** (no-training clause, deletion/erasure obligations), and the actual
   **subprocessor list** (confirm US processing). These are not public; the review could not read them.
2. **Confirm spend bounding.** Browserbase states verbatim *"No caps. No cut-offs"* — there is **no hard
   dollar cap or auto-shutoff**; spend is bounded only by concurrency + session-duration + creation-rate.
   Either get a committed ceiling from the vendor, **or** Paige builds its own per-tenant session-minute
   budget + concurrency cap + usage-API polling (recommended regardless — §M1).
3. **Confirm the Live View debug-URL security** — is `debuggerFullscreenUrl`/`debuggerUrl` signed,
   short-TTL/single-use, bound to the key/session, and dead on session end? A long-lived bearer URL to an
   authenticated tenant session is a serious exposure.
4. **Confirm Context authorization / no multi-tenant replay** — is a Context ID strictly scoped to its
   owning project/API key so a leaked ID cannot be replayed by another key? This is the crux of using
   Contexts as per-tenant session stores.
5. **Confirm US region pinning** — region is **per-session, not project-locked** (default `us-west-2`).
   Confirm whether an enterprise project can be hard-pinned US-only; otherwise Paige must pass a US
   `region` on every session create (fail-closed if absent).
6. **Confirm Zero-Data-Retention mechanics** — it is a **per-session create flag**, not an account
   default. Confirm the exact parameter and that it suppresses recordings, screenshots, AND network/
   console logs; Paige must set it on every session.
7. **Confirm deletion SLA + endpoints** — the Delete-Context and Downloads-delete paths and a written
   deletion SLA for contexts/recordings/downloads (GDPR erasure + tenant offboarding).

**No-Go trigger:** if the SOC 2 Type II scope, the DPA/BAA, or the Context-authorization/Live-View-URL
security come back materially weaker than the public claims, re-open the provider decision (Anchor
OmniConnect / Steel / self-hosted Chromium behind the same contract remain the alternatives — the point
of the provider-neutral contract).

**What this GO authorizes now:** building the Paige-owned pieces (UI, control plane, provider-neutral
contract, read-only Phase-1 worker path, the audit §4.3 security prerequisites) with the worker path
**flagged off**. **What it does NOT authorize:** creating/holding credentials, running a live/credentialed
session, persisting a real Context, or connecting a tenant — those wait on the seven gates.

---

## Dimension findings (dated citations; KNOWN / UNCONFIRMED)

### 1. Plan & spend controls — **KNOWN (with a decision-critical gap)**
Multi-metered: monthly fee + browser-hours + proxy bandwidth + per-API-call families. (browserbase.com/pricing;
docs.browserbase.com/account/billing/plans)

| | Free $0 | Developer $20/mo | Startup $99/mo | Scale (custom) |
|---|---|---|---|---|
| Concurrent browsers | 3 | 25 | 100 | 250+ |
| Browser-hours incl. → overage | 1 | 100 → $0.12/hr | 500 → $0.10/hr | usage |
| Proxy bandwidth → overage | 0 | 1 GB → $12/GB | 5 GB → $10/GB | usage |
| Session duration cap | 15 min | 6 hr+ | 6 hr+ | 6 hr+ |
| Projects | 1 | 2 | 5 | 5+ |
| Data retention | 7 d | 7 d | 30+ d | 30+ d |

- Billed **by the minute, 1-min minimum/session** (KNOWN).
- **NO hard spend cap** — verbatim *"No caps. No cut-offs… Monitor your usage from your dashboard"*
  (KNOWN). No per-org/session budget, auto-shutoff, or alert feature documented. **Paige must self-bound
  spend.** A committed cap on Scale is UNCONFIRMED.

### 2. Prod vs dev project/key separation — **KNOWN at project level; RBAC UNCONFIRMED**
- Multiple **Projects** are the isolation unit; auth via `x-bb-api-key`, session bound to a `projectId`.
  Prod/dev separation via **two Projects + two keys** is achievable (KNOWN).
- **Key rotation policy, key scopes, org/member RBAC are NOT documented**; SSO appears Scale-only
  (UNCONFIRMED). Confirm rotation + isolation guarantees.

### 3. Persistent Contexts — **KNOWN, and matches intended custody**
- A Context stores the Chromium user-data dir (cookies, localStorage, IndexedDB, session storage,
  service workers, prefs), **excludes HTTP cache**. (docs/features/contexts)
- **Encrypted at rest per-context**: create returns `id` + `publicKey` + `cipherAlgorithm`
  (*"AES-256-CBC is currently the only supported algorithm"*) — real per-context envelope encryption
  (KNOWN).
- **Identifier = the Context ID** = exactly the opaque reference Paige stores (KNOWN).
- **Contexts live indefinitely** until deleted; reuse via `contextId` + `persist:true`/`false`; **avoid
  simultaneous sessions on one Context** (Paige must serialize per-tenant) (KNOWN).
- **"No raw credentials are submitted to Browserbase"** — user logs in live or programmatically during a
  `persist:true` session; only cookies/session tokens are retained (KNOWN — this is the custody model).
- **Per-context tenant-to-tenant access control is only implied** by unique IDs + encryption — **verify**
  a Context ID is project/key-scoped and not replayable (UNCONFIRMED, decision-critical).

### 4. Live View — **KNOWN capability; URL security UNCONFIRMED (decision-critical)**
- Interactive window; **iframe-embeddable** (read-only `pointer-events:none` and interactive variants);
  **human takeover explicitly supported** incl. **credential delegation + file uploads** — the owner does
  the live login + MFA, automation resumes (KNOWN). URL via `sessions.debug(id)` →
  `debuggerFullscreenUrl`/`debuggerUrl`.
- **The docs do NOT state who can access the debug URL, whether it is signed, or its expiry** (KNOWN-
  absence). **Confirm** signed/short-TTL/single-use/session-bound/revoked-on-end.

### 5. Region / residency — **KNOWN; US pin is per-session not project-locked**
- Regions: `us-west-2` (default), `us-east-1`, `eu-central-1`, `ap-southeast-1`. Set **per session** via
  `region` (docs/optimizations/latency/multi-region).
- **No documented project-level US-only lock** — US residency depends on Paige always passing a US
  `region` (default is US, which is safe, but nothing structurally prevents a non-US session). Confirm an
  enterprise hard-pin (UNCONFIRMED).

### 6. Security / compliance — **claims KNOWN; the documents themselves UNCONFIRMED (request-gated)**
- **SOC 2 Type II Certified** stated (docs/guides/security; a "SOC 2 Type II, officially" changelog).
  History: Oct-2024 blog = then SOC 2 Type I + HIPAA, planning Type II. **The Type II report is not
  public** — *"auditor attestations… provided on request"* via the Trust Center → **obtain under NDA**.
- **HIPAA: BAAs available** (KNOWN; self-attestation + signable BAA — confirm it's on our tier).
- **Third-party penetration testing** stated (report request-gated).
- **Isolation (strong, verbatim):** *"Each browser runs in a dedicated VM"*; *"After each session, the
  virtual machine is killed and recreated from scratch"*; isolated subnet + strict firewalls; no shared
  GPU; continuous CVE patching; zero-trust (KNOWN) — this is the 1-browser-per-VM-destroyed-per-session
  posture we want.
- **BYO-LLM / prompt-templating to avoid LLM exposure** (KNOWN); an explicit "no training on your data"
  clause is UNCONFIRMED (verify in DPA).
- **ISO 27001 not mentioned** (UNCONFIRMED, likely not held). **DPA + subprocessor list** are Trust-
  Center-gated and were not readable — **obtain and read** (UNCONFIRMED).

### 7. Retention / deletion — **KNOWN defaults; deletion SLA UNCONFIRMED**
- Default retention **7 d (Free/Dev) / 30+ d (Startup/Scale)** for session artifacts (KNOWN).
- **Zero Data Retention** = *"Disable logging and session replay via the Create Session API"* — a
  **per-session flag**, not a default (KNOWN); confirm exact param + that it also suppresses screenshots/
  network logs. Paige must set it on every session.
- **Delete Context API** exists (KNOWN; exact path UNCONFIRMED, likely `DELETE /v1/contexts/{id}`);
  **Downloads API** supports delete (KNOWN). **No documented deletion SLA** (UNCONFIRMED).

### 8. API + MCP + contract-fit — **KNOWN; drive REST, not MCP**
- REST covers create/retrieve/update(end)/context-create/context-delete/debug(live-view)/downloads/usage.
  Session end = `POST /v1/sessions/{id}` `{"status":"REQUEST_RELEASE"}` (KNOWN). Drivers: Playwright/
  Puppeteer/CDP + Stagehand.
- **Official MCP** at `https://mcp.browserbase.com/mcp` exposes only `start/end/navigate/act/observe/
  extract` — **too thin for our lifecycle** (no context create/delete, no live-view as tools). **The
  worker adapter drives the REST API/SDK directly, not the MCP server.** (KNOWN)

**Contract-fit table (internal op → Browserbase primitive):**

| Internal op | Browserbase primitive | Confidence |
|---|---|---|
| openSession | `POST /v1/sessions` (`projectId`,`region`,`contextId`,`keepAlive`,proxy/stealth) | KNOWN |
| handControl + liveView | `sessions.debug(id)` → debugger URL; iframe; human takeover incl. login/MFA | KNOWN cap · URL auth/expiry UNCONFIRMED |
| observe (read) | read-only Live View embed / Stagehand observe+extract / CDP screenshot | KNOWN |
| persistConnection (context) | `POST /v1/contexts` + session `contextId`+`persist:true` (AES-256-CBC) | KNOWN |
| reopenConnection | session create with existing `contextId` | KNOWN |
| closeSession | `POST /v1/sessions/{id}` `{"status":"REQUEST_RELEASE"}` | KNOWN |
| revokeConnection (delete context) | Delete Context API | KNOWN exists · exact path UNCONFIRMED |
| captureDownload | Downloads API + CDP `Browser.setDownloadBehavior(downloadPath:"downloads")` | KNOWN |

**No internal op has NO-CLEAN-PRIMITIVE.** The two risk-bearing ops are handControl/liveView (URL
security) and revokeConnection (delete path/SLA) — both UNCONFIRMED, both on the gate list above.

---

## Provider-neutral contract assumptions this validates (or flags)
- **openSession/observe/persist/reopen/close/download** all have clean primitives → the contract holds
  with Browserbase as the first adapter. **The adapter maps Context→opaque ref, Live View→liveViewToken,
  entirely inside the adapter** (no leak above the line).
- **Two contract requirements the review makes explicit for the adapter:** (a) **always pass a US
  `region`** and **set Zero-Data-Retention** on every session create (fail-closed if unset); (b) **the
  control plane enforces the per-tenant spend budget + concurrency + single-session-per-context
  serialization** — Browserbase provides none of these, so they are Paige-owned control-plane
  responsibilities, not adapter details.

## What is owed / next
- **Owner:** clear the seven gates above (obtain the NDA docs + confirm the vendor unknowns). CC cannot —
  no account/contact/secret use.
- **Builder:** the starting packet (`docs/handoff/paige-secure-browser-builder-starting-packet.md`) — build
  the Paige-owned UI + control plane + provider-neutral contract + read-only Phase-1 path (flagged off)
  now; credentialed wiring gated on the seven confirmations.
- **`BROWSERBASE_API_KEY`** is present as an Edge secret (infra readiness only, NOT wired) — recorded by
  NAME in `config-registry.md` (§34, never a value).

**Sources (accessed 2026-09-07):** browserbase.com/pricing · docs.browserbase.com/{account/billing/plans,
account/enterprise/security, guides/security, features/contexts, features/session-live-view,
optimizations/latency/multi-region, reference/api/*, features/downloads, integrations/mcp/configuration} ·
browserbase.com/blog/…soc2-and-hipaa… (Type I + HIPAA, Oct 2024) · browserbase.com/changelog/soc-2-type-ii
(title only) · trust.browserbase.com (JS-gated — subprocessors/DPA/report NOT readable → UNCONFIRMED).
