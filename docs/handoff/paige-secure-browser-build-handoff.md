# Paige Secure Browser — build handoff for a dedicated builder

**Date:** 2026-09-07 · **For:** a dedicated Paige Secure Browser builder (session/agent). · **Read
first:** `docs/delivery/paige-secure-browser-mvp-plan.md` and
`docs/audits/paige-secure-browser-audit-2026-09-06.md`.

**How to use this handoff (owner-ordered):** it **leads with the owner-complete in-chat UI flow
(Part A)** and **then** specifies the required backend (Part B) — never the reverse. Build to Part A;
Part B exists to make Part A real.

> **§69.** You execute this through the installed `flow-by-flow` skill and its references; a new/changed
> UI flow also uses `flow-prototype` (Gate 1). Return the pre-edit packet before your first edit.
> **§00.** The **visual design** of every surface here is **Claude Design's** — route the in-chat
> surface through `paige-ui-design` + `flow-prototype`. This handoff specifies **flow behavior, states,
> security, and the backend contract**, NOT visuals. Where it says "Paige shows X," that is a
> behavioral/state requirement; how it looks is CD's.
> **§70 / §70.1 / §70.2.** The deliverable is the OWNER completing the flow on the real platform — not
> a wired handler. Prove the owner can DO each step (Part A's checklist), against the real durable
> contract, distinguishing authenticated-runtime proof from build/fixture proof.
> **§4/§69.** No provider account, install, external login, credential, crawl, or browser action is
> authorized until the owner clears the provider review. Build the flow + contracts; keep every worker
> path inert/flagged-off until then.

---

## PART A — THE OWNER-COMPLETE IN-CHAT UI FLOW (build to this)

**Entry point (§36):** the owner is in the **one dedicated Paige conversation** (Solo `paige.workspace`).
There is **no separate "Secure Browser" tab or manager** — it is a chat capability that opens a native
Paige workspace/session, visibly integrated into the chat (§20/§21).

For each step: **[Owner does]** · **[Paige behavior + state]** (CD owns the visuals) · **[Boundary]**
(what may/may not cross) · **[Fail closed]**.

### A1. Ask
- **[Owner does]** In chat: *"Open Secure Browser and log into <portal> to <purpose>."*
- **[Paige behavior + state]** Paige classifies the request, confirms the **purpose**, the **target
  host**, and the **scope** (what she will read/do), and asks for one-tap confirmation to open. Names it
  **"Paige Secure Browser"** — never a provider name.
- **[Boundary]** No worker session opens yet; no credential requested in chat.
- **[Fail closed]** If purpose/target/scope is ambiguous, Paige asks one tight question rather than
  guessing (§15).

### A2. Open the native Paige session
- **[Owner does]** Confirms.
- **[Paige behavior + state]** A **native Paige Secure Browser workspace** opens in the chat surface
  showing: **purpose · target · current scope · current authority (none yet) · activity status
  (opening…)**. An owner-only **live view** of the worker renders inside the Paige surface.
- **[Boundary]** The control plane opens a worker session bound to `{tenant, purpose, targetHost,
  scope}` (Part B). The live-view handle is shown to the **owner only**; the worker's provider identity
  is **not** surfaced.
- **[Fail closed]** No session/authority/live-view → Paige shows an honest "couldn't open" state with a
  reason; never a blank (§32).

### A3. Take control + sign in (owner-direct; Paige never sees the password)
- **[Owner does]** Takes control, navigates to the login, **types the password and completes MFA
  directly in the live worker**.
- **[Paige behavior + state]** Paige **pauses at the login boundary** and hands control to the owner;
  status = "waiting for you to sign in." Paige does **not** read, echo, autofill, or narrate the
  credential or MFA code.
- **[Boundary]** **Raw password, MFA code, cookies, and session tokens NEVER enter chat, logs, or model
  context.** Paige holds none of them.
- **[Fail closed]** If Paige cannot detect a safe hand-back, she stays paused and asks the owner to
  confirm sign-in completion — never proceeds on assumption.

### A4. Observe / do the approved read work
- **[Owner does]** Hands control back (or approves Paige to proceed within scope).
- **[Paige behavior + state]** Paige performs only **read/observe** within the approved scope and
  streams **safe, useful results** to chat (e.g., "here are the three invoices and their totals"). She
  names what she is doing and her current authority.
- **[Boundary]** Page HTML/screenshots stay in the worker; only **safe extracted results** reach chat
  (fenced as untrusted data, never instructions). No Paige-driven writes in Phase 1.
- **[Fail closed]** A read outside scope is refused with a reason.

### A5. A consequential action (Phase 3) — approve or stop
- **[Owner does]** Asks Paige to perform an action (submit, download, pay via the tenant's own connected
  rail, etc.), or Paige proposes it (draft-first, §36).
- **[Paige behavior + state]** Paige shows exactly what she will do (the action, target, and any
  amount), the **authority** it falls under, and a **one-click approve** / **stop**. Under a valid
  standing policy the eligible action may run within policy; otherwise it is `confirm`-floored.
- **[Boundary]** The action runs through the governed path (Part B §10); a money action uses the
  **tenant's OWN connected rail** — Paige is never merchant of record (§38).
- **[Fail closed]** Missing/expired/over-cap/out-of-scope policy, or an unconfirmed provider result →
  clamp to `confirm` / refuse; **emergency-stop halts future acts** (cannot recall one already
  submitted — say so honestly).

### A6. Results + truthful receipt + Rail evidence
- **[Paige behavior + state]** Paige returns the **safe result** to chat and a **truthful receipt** —
  what actually happened, verified readback — and files **Rail evidence** for a real completed action.
  Never "Paige handled it" without a receipt (§13/§32).
- **[Boundary]** The receipt carries no secrets, no raw payload, no page HTML.

### A7. Downloads / captured files → Vault quarantine
- **[Paige behavior + state]** Any file the session downloads/captures lands in **Vault
  quarantine/inspection** with a clear status — **not** the ordinary document library. Its content is
  treated as untrusted data, never instructions.

### A8. Close (ephemeral) OR connect the account (persistent, explicit consent)
- **Phase 1 (default):** **[Owner does]** closes. **[Paige]** ends the session **ephemerally** —
  nothing persisted beyond the receipt.
- **Phase 2 (opt-in):** **[Owner does]** chooses "Keep this account connected." **[Paige]** persists the
  session in the worker and stores **only an opaque connection reference** + allowed host/action scope +
  authority + freshness + revocation state under **Vault → Connected Accounts**.
- **[Boundary]** Connected Accounts are **owner-managed, tenant-isolated, revocable, auditable, and
  never casually readable by Paige.**

### A9. Manage / revoke (Vault → Connected Accounts)
- **[Owner does]** Opens Vault → Connected Accounts; sees each connection's purpose, allowed scope,
  authority, freshness, last activity; can **revoke/disconnect** or **tighten scope** at any time.
- **[Paige behavior + state]** On revoke, the worker session is dropped and the opaque reference is
  cleared; future reopen fails closed.

### A10. Failure / abandonment / account switch (must all be real)
- Provider/worker error, owner abandons mid-sign-in, session times out, or the owner switches accounts:
  Paige shows an honest state + a recovery path; nothing partial is reported as done.

### The §70.1 owner-usability gate (the builder must pass ALL, on the real platform)
- [ ] From an empty first-use state, the owner opens Secure Browser from chat for a stated purpose.
- [ ] The owner takes control, signs in + completes MFA directly; **Paige never receives the password**
      (prove no secret reaches chat/logs/model context).
- [ ] Paige returns a safe result + a truthful receipt + a Rail row for a real completed action.
- [ ] The owner connects an account (Phase 2), sees it under Vault → Connected Accounts, and **revokes**
      it; reopen after revoke fails closed.
- [ ] A download lands in Vault quarantine, not the document library.
- [ ] Permission/failure/abandon/account-switch paths are exercised and honest.
- [ ] Evidence separated by class: automated test · build/static · structural/harness render ·
      **authenticated runtime on the real platform** · `UNVERIFIED` with its reason. A harness drive
      against a mock is NOT authenticated-runtime proof.

---

## PART B — THE REQUIRED BACKEND (make Part A real)

### B1. The provider-neutral internal Secure Browser contract (§18 one home)
One internal interface the control plane calls; a worker adapter implements it. **No provider type,
field, id shape, MCP tool name, or vocabulary may appear at or above this interface** — the domain is
provider-neutral so the worker is swappable (Browserbase bootstrap → Paige Chromium/Playwright fleet).

- `openSession({ tenantId, purpose, targetHost, scope, authority }) → { sessionRef, liveViewToken }`
- `handControl(sessionRef)` / `returnControl(sessionRef)` — owner takeover for sign-in/MFA
- `observe(sessionRef, readIntent) → { safeResult }` — read-only; returns no secrets/HTML
- `executeGovernedAction(sessionRef, actionSpec, policyGrant) → { receipt }` — Phase 3
- `persistConnection(sessionRef, consent) → { opaqueConnectionRef }` — Phase 2
- `reopenConnection(opaqueConnectionRef, purpose, scope) → { sessionRef, liveViewToken }`
- `captureDownload(sessionRef) → { vaultQuarantineRef }`
- `closeSession(sessionRef)` / `revokeConnection(opaqueConnectionRef)` / `emergencyStop(scope)`

**Worker adapter:** a single module per worker implementing the interface. The Browserbase adapter maps
Live View → `liveViewToken`, Contexts → `opaqueConnectionRef`, etc. — entirely inside the adapter.
`services/paige-browser` (self-hosted Playwright) is the first Chromium adapter for the read/research
path. **Tripwire test:** grep the domain + UI for any provider name/type; a hit above the adapter line
is a leak (add a CI guard mirroring `lint:integration-registry`).

### B2. The Paige-owned control plane (tenant scope, authority, receipts, Vault)
- Resolves `tenantId` **server-side** from the verified JWT (never a request body — §9/§59/§588), like
  `governMcpToolCall` (`paige-mcp/index.ts:5388-5433`). Fails closed to `tenant_unresolved`.
- Owns the session/purpose/scope record, the Vault Connected Accounts record, the receipts, and the
  §10/§68 governance. The adapter owns none of these.
- Reuses `_shared/capability-record.ts` `record_capability_run` (6 outcomes) for every receipt; reuses
  the `paige_browser_usage`-class audit rail (tenant-scoped, append-only, service-role INSERT).

### B3. Vault "Connected Accounts" record (Phase 2) — schema + RLS
- New Vault-scoped table (e.g. `vault_connected_accounts`): `tenant_id NOT NULL`, `purpose`,
  `target_host`, `allowed_scope jsonb` (hosts + action types), `authority_status`, `freshness_at`,
  `revocation_state`, `opaque_connection_ref` (an **opaque reference only — NEVER a raw credential,
  cookie, or session token**), `created_by`, timestamps.
- `FORCE ROW LEVEL SECURITY`; tenant-owner/admin manage; **service-role writes**; **never casually
  readable by Paige** (no broad SELECT that returns the ref into model context); `REVOKE` from
  anon/authenticated on the ref path. Model the caller-scope gates on `tenant_mcp_connections`
  (`20261005000000`) — but store an opaque reference, not encrypted secrets.
- Downloads → the existing Vault quarantine seam (`business_vault_quarantine_uploads` + inspection);
  content is untrusted data, never instructions.

### B4. Governance (Phase 3) — ride §10 + §68, do NOT build a new system
- A Secure Browser action is a `high`/`external_effect` capability (`_shared/action-risk.ts`) declaring
  all **seven §10 dimensions**: grantor + authorized rep (§53); the exact acts as a process; boundaries
  (per-domain/action policy + dollar + velocity caps + window/expiry + recipients + approval threshold +
  stop conditions); the §16 lane; truth & evidence (**idempotency key / exactly-once**, Rail receipt);
  controls (pause/revoke/tighten/raise/**emergency-stop**); fail-closed behavior.
- `confirm`-floored until **RE-2** lifts it under a valid standing policy; a money act uses the tenant's
  OWN connected rail (§38 — Paige never merchant of record); **M1** metering for spend-capable acts.
- Rides **§68** decay: the cross-tenant canary + RLS-coverage checks must pass; a lapsed attestation
  degrades to Draft, never silently.

### B5. Security prerequisites (fix BEFORE any worker write path — audit §4.3)
1. `browser_use_sessions`: add `tenant_id` + a **server-resolved tenant** on every writer (the live
   `browse_public_url` path writes it today with none — `skill-interpreter.ts:198-229`).
2. `browser-use` edge fn: replace caller-supplied identity + bare service-role with a **JWT-derived
   tenant/admin gate** (`browser-use/index.ts:17-31`).
3. Close the research-path **G5** page-write fence + reconcile the two SSRF guards (#138) before the
   worker runs any credentialed session.

### B6. Fail-closed codes + honesty
Every gate returns a specific reason (mirror the governed-execution typed codes): missing scope,
missing/expired/revoked connection, out-of-policy, over-cap, unresolved tenant, unconfirmed provider
result. **Emergency-stop halts future acts only** — it cannot recall one already submitted to a worker;
report that honestly. Never fabricate completion (§13/§32).

---

## Build order (each independently shippable + proven; §32/§68)
1. **Prerequisite security fixes** (B5) — their own PR, proven with §9 tenant-isolation tests.
2. **The internal contract + control plane + read-only worker adapter** (B1/B2) — Phase-1 read path;
   headless smoke + the §70.1 gate (owner live-drive owed to a browser-capable session).
3. **Phase-1 owner-assisted live session** (Part A A1–A8 ephemeral) behind the reviewed worker adapter,
   **flagged off until the owner clears the provider review**.
4. **Phase-2 Vault Connected Accounts** (B3) — §9 isolation + revocation proofs.
5. **Phase-3 governed actions** (B4) — §10 declaration + RE-2 + §37 inventory + §68 green + §32.c drive.
6. **Phase-4 crawl hardening + skills.**

## Do NOT (owner-ruled)
- Do **not** use "Twin", "Browserbase", or any provider wording, styling, icons, or interaction
  patterns in customer-facing UI. Customer feature = **"Paige Secure Browser"**.
- Do **not** let a provider API/MCP/id-shape/data-model appear in customer UI or core domain contracts —
  it lives only inside the worker adapter.
- Do **not** put raw passwords, MFA codes, cookies, session tokens, or page HTML in chat, logs, or model
  context.
- Do **not** persist a connection without explicit owner consent; do **not** store a raw credential —
  only an opaque reference under Vault.
- Do **not** install a provider, create an account, add credentials, crawl, or perform a browser action
  until the owner clears the provider review and authorizes it.
- Do **not** build a new autonomy system — Phase 3 rides §10/§68.

## Cross-references
`docs/delivery/paige-secure-browser-mvp-plan.md` · `docs/audits/paige-secure-browser-audit-2026-09-06.md`
· `docs/doctrine/autonomy-architecture.md` (§10/§68) · `outputs/paige-at-cowork/08-sandboxed-research-external-execution.md`
· `docs/integration-registry/integration-capability-registry.json` (`browserbase` = PROPOSED worker
runtime) · §00 · §9/§59 · §38 · §32/§70.
