# Paige Secure Browser — dedicated-builder STARTING PACKET

**Date:** 2026-09-07 · **For:** the dedicated Paige Secure Browser builder session. · **This is the
kickoff brief.** The full spec is `docs/handoff/paige-secure-browser-build-handoff.md`; this packet says
what to build FIRST, what is GATED, and the hard rules.

## 0. Read these first (in order)
1. `docs/handoff/paige-secure-browser-build-handoff.md` — the exact spec (UI flow first, then backend).
2. `docs/delivery/paige-secure-browser-mvp-plan.md` — the Paige-owned architecture + phases.
3. `docs/audits/paige-secure-browser-provider-review-browserbase-2026-09-07.md` — the worker-provider
   review + the seven vendor gates + the Browserbase primitive map.
4. `docs/audits/paige-secure-browser-audit-2026-09-06.md` — the Phase-0 current-state audit + the
   security prerequisites (§4.3).
5. `docs/doctrine/autonomy-architecture.md` (§10/§68) for Phase-3 governance.

## 1. The one rule about order (owner-ruled)
**Build the owner-complete in-chat Paige UI FIRST, then the Paige-owned control plane and worker
integration behind it.** Part A of the build handoff is the contract you build to; Part B exists to make
Part A real. §69: run this through `flow-by-flow` + `flow-prototype`. §00: the VISUAL design is Claude
Design's — route the in-chat surface through `paige-ui-design` + `flow-prototype`; you build the flow
behavior/states/security/backend, not the pixels.

## 2. Provider decision: CONDITIONAL GO (Browserbase = bootstrap WORKER only)
Browserbase is the PROPOSED, **replaceable** bootstrap runtime for the isolated browser **worker**, behind
the **provider-neutral internal Secure Browser contract**. Its Contexts model fits ("no raw credentials
submitted to Browserbase"; owner logs in via Live View; Paige stores only the Context ID). **Never** let
its API/MCP/branding/data-model appear in customer UI or core domain contracts.

**Worker-adapter targets (drive the REST API/SDK, NOT the thin MCP server):** openSession=`POST /v1/sessions`
(pass a **US `region`** + Zero-Data-Retention flag every time) · liveView=`sessions.debug(id)` · context=
`POST /v1/contexts` + `persist:true` · close=`REQUEST_RELEASE` · revoke=Delete-Context API · downloads=
Downloads API. Serialize to one session per Context. (Details: the provider-review §8 table.)

## 3. What you MAY build now (no credentials, worker flagged off)
1. **Security prerequisites (audit §4.3) — do these first, own PR:** add `tenant_id` + a server-resolved
   tenant to every `browser_use_sessions` writer; replace `browser-use`'s caller-supplied identity +
   service-role with a JWT-derived tenant/admin gate; close the research-path G5 page-write fence +
   reconcile the SSRF guards.
2. **The provider-neutral internal Secure Browser contract** (build handoff §B1) + the **Paige-owned
   control plane** (§B2: server-resolved tenant, purpose/scope record, the TWO receipt layers — Rail
   summary via `record_capability_run` PLUS the durable detailed action receipt).
3. **The read-only Phase-1 flow** (build handoff Part A **A1–A4 + A6 + A7 + A8-ephemeral + A10** only —
   NOT A5/A8-connect) behind the reviewed worker adapter, **flagged OFF**.
4. The in-chat Paige Secure Browser surface (CD visuals via flow-prototype) for that read-only flow.

## 4. What is GATED — do NOT wire until the owner clears ALL seven vendor confirmations
(from the provider review — none are CC/builder actions; the owner obtains them):
**SOC 2 Type II report + BAA + DPA + subprocessor list (read under NDA); a spend cap or Paige-side spend
bounding; Live-View debug-URL security; Context authorization/no-replay; US region pin; Zero-Data-
Retention mechanics; deletion SLA + endpoints.** Until cleared: **no account use, no credential, no live/
credentialed session, no real Context persisted, no tenant connected.** The `BROWSERBASE_API_KEY` secret's
value is **never** revealed, logged, rotated, or tested.

## 5. Phase order after the gates clear
Phase 1 credentialed live session → Phase 2 Vault Connected Accounts (§B3) → Phase 3 governed actions
(§B4, §10/§68 — with the durable detailed receipt + idempotency) → Phase 4 crawl hardening + skills. Each
its own PR with the §70.1 owner-usability gate + §32/§68 proof.

## 6. Hard "do NOT" (owner-ruled)
No provider wording/branding/icons/interaction patterns in customer UI (feature = "Paige Secure Browser").
No provider API/MCP/id-shape/data-model above the worker adapter. No raw passwords/MFA/cookies/session
tokens/page HTML in chat, logs, or model context. On a Paige-operated worker, enforce ephemeral credential
input + log/recording suppression. No persistence without explicit owner consent; store only an opaque
reference under Vault. Downloads → Vault quarantine. Phase 3 rides §10/§68 — do not build a new autonomy
system.

## 7. Definition of done for the first deliverable
The read-only Phase-1 flow is owner-usable (§70.1 gate) end to end behind the flag, on the real platform:
owner opens Secure Browser from chat → takes control → (in a gated test) the read path returns safe
results + a receipt → ephemeral close; failure/abandon honest; **no secret ever in chat/logs/model
context**; the provider-neutral contract proven swappable (no Browserbase type above the adapter).
