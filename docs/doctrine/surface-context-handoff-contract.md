# The Surface Context Handoff Contract — one server-safe way to open Paige with context

**Read before touching how any surface opens the dedicated Paige workspace, the `paige:open` event,
`paigeClientScope`, or the `clientContext` the chat request carries.**

**Status: CONTRACT PUBLISHED (Paige OS Integration Program, Phase 1). Not yet adopted by call sites.**
Read that second sentence as part of the status. This document defines the one reusable pattern and
names the exact gaps it closes; the runtime adoption (extending the scope bridge, consuming the
intent, retiring the raw prose payload) and the two regression guards are **sequenced as the next
bounded slice** — they touch owned surfaces and a heavily-contested set of files, so they are built
with coordination, not folded in here (the task: "do not overwrite active work").

Companion to `governed-execution-seam.md` (how an *action* is governed once requested) and
`one-approval-gate.md` (how a *yes* is proved). This document owns the step BEFORE those: how a
surface hands Paige a **safe, structured context** so she opens already knowing what the owner is
looking at — never a blind chat window, never a raw page payload.

## The real current state (grounded 2026-09-06, `origin/main` a013be41 plus the route-retirement hotfix)

The only surface → chat handoff that exists today:

```
window CustomEvent 'paige:open'  →  readPaigeOpenScope (src/solo/paigeClientScope.ts:83)
  →  module-level PaigeClientScope store  →  PaigeAIChat clientId  →  paige-ai-chat (server re-authorizes)
```

- **Sole chat surface.** `PaigeAIChat.tsx` is the one client that calls `paige-ai-chat`; wrapped by
  `SoloPaigeWorkspace` (Solo) and the shell-owned `PaigeWorkspace` wrapper (Agency), mounted via the
  `TenantCommandCenterShell` slot. No privileged URL or separate admin site mounts either workspace; platform-operator access remains role-gated in the canonical operator context. The floating chat was retired (#981) with a standing regression
  guard (`src/__tests__/no-floating-platform-chat.test.ts`), because it "carried own-row consumer PII
  into the tenant `paige-ai-chat` backend."
- **One listener** — `SoloApp.tsx:228`. It sets the client scope (if named) and `expandRail()`. Agency
  has `openAsk = expandRail` but **no `paige:open` listener**.
- **`PaigeClientScope = { tenantId, clientId, label }`** (`paigeClientScope.ts:22`) — explicitly **not
  authority**: every client-scoped read re-resolves the tenant server-side (`current_user_tenant_id()`)
  and independently authorizes the client id by tenant equality. `label` is display-only, never sent
  as identity.
- **Server-safe already.** `paige-ai-chat` resolves tenant + operator status entirely from the JWT
  (`index.ts:585-611,760-763`); the client sends **no tenant id and no role**. `clientId` is
  re-authorized server-side → `scopedClientId` (`:727-832`); `clientContext` is dropped on refusal
  (`:844`).

### The three gaps this contract closes

1. **Raw page payload.** The chat request carries a client-built `clientContext` **prose block (≤50k)**
   (`PaigeAIChat.tsx:827-851`). That is exactly the "raw page payload" the program forbids. The
   contract replaces it with a **server-resolved** safe context keyed to an intent.
2. **The intended question is silently dropped (#771).** All nine `paige:open` dispatch sites pass a
   `{ prompt }`, and **no listener consumes it** — "Ask Paige about X" opens the fold but never asks.
   Only one site (`growth2.tsx:274`) additionally carries a `clientId`, and that is the one thing that
   survives the handoff.
3. **No surface identity.** The chat has no idea *which* surface the owner opened Paige from, so it
   cannot orient ("you're on the Pipeline for client Acme; want the recorded stage history?").

## The contract

### C1 — the client sends an INTENT, never context or authority

A surface opens Paige by emitting an **allowlisted intent**, and nothing else:

```
SurfaceContextIntent = {
  surface: <allowlisted enum>,        // e.g. "campaigns.pipeline", "settings.setup" — a ledger id
  record?: { type: <enum>, ref: <public-safe reference> },  // e.g. { type: "client", ref: <clientId | account_number> }
  ask?: <intent key>                  // an enumerated question/action key, NOT free prose
}
```

**Forbidden in the intent, by contract and by guard:** tenant id, role, operator status, raw prose /
page HTML, hidden fields, secrets, a forged record snapshot, own-row consumer PII. The intent names
*what the owner is looking at and what they want*; it never carries the answer or the authority.

### C2 — the server resolves the safe context

Given an intent, the server resolves a **minimum-necessary summary** from canonical records, using the
authenticated actor + active workspace — **reusing the seams that already exist, forking none**:

- tenant + operator status from the JWT (`current_user_tenant_id()`, `is_platform_owner()`);
- the record re-authorized server-side (the `scopedClientId` path for `type: "client"`; the public-safe
  `account_number` addressing for Spine subjects);
- the safe context itself from the **registered Spine capabilities** and readiness reads already wired
  into `paige-ai-chat` (`business_context.readiness`, `team.authority`, `social.presence`,
  `pipeline.deal_stage_evidence`, `integrations.n8n_readiness`) — status, provenance, freshness, state,
  and the intended question/action; **never full document payloads or hidden data**.

The resolved summary carries: `surface`, `canonical record reference`, `safe provenance`, `freshness`,
`state`, `intended question/action`, and `applicable authority`. That is the whole shape.

### C3 — fail closed

The context expires/refreshes safely, and **every one of these fails closed** (renders nothing / a
truthful "I can't see that here", never a stale or cross-account answer): workspace switch, role
change, deleted record, stale source, denied actor. This mirrors the readiness blocks, which already
bind the RPC's returned `tenant_id` against the conversation's workspace and render `""` on mismatch.

### C4 — owner-visible, in plain language

The owner can see, in plain words, what Paige was asked about and what she can/cannot access. The Solo
workspace already renders an **"IN CONTEXT" focus banner** (`SoloPaigeWorkspace.tsx:344`) — the
contract **extends** that, it does not fork it. *How that banner and any truthful-status component
look is Claude Design's (§00); this contract owns only the data and behavior behind them.*

### C5 — a safe reset / clear path

There is a supported way to clear prior-surface / prior-record context so it cannot bleed into a new
conversation. Workspace switch already unmounts+remounts the subtree (`CommandCenter.tsx:104`); the
contract adds an explicit clear for the within-workspace case.

### C6 — reuse the approval + capability seams; build no second system

A handoff **requests governed work**; it never performs it and never approves it. When the intent
implies an action, it flows through the **existing** action-risk classifier + `paige_pending_confirmations`
approval gate and the governed execution seam — **not a second approval path** (the task: "Do not build
a second approval system. Reuse the existing governed approval gate and capability registry.").

### C7 — extend the one home (§18)

The scope bridge is `src/solo/paigeClientScope.ts`. The `SurfaceContextIntent` **extends** it — it is
not a new competing store. `PaigeClientScope` becomes the `record: { type: "client" }` case of the more
general intent; the module-level store, the `useSyncExternalStore` consumer, and the server-side
re-authorization all carry forward unchanged.

## The two regression guards (specs — next slice)

The program requires these; they are specified here and built as the adoption slice (conservative,
self-tested, run against `main` first to prove zero false-positives — the repo's `lint:*` idiom):

1. **No raw client data / secrets / arbitrary payload into Paige context.** A `paige:open` detail may
   carry only allowlisted intent keys (`surface`, `record`, `ask`, plus the legacy `clientId` /
   `clientLabel` / `prompt` during migration); a key outside the allowlist (e.g. `tenantId`, `role`,
   `token`, `secret`, raw `context`/`html`) fails. Companion to the existing floating-chat guard.
2. **No "Open Paige" handler bypasses the safe contract.** New `paige:open` dispatchers go through the
   shared helper; the current **nine** raw dispatch sites across **four** files
   (`src/solo/PipelineCommandDesk.tsx` ×2, `src/solo/campaign-desk.tsx` ×2, `src/solo/growth2.tsx` ×4,
   `src/pages/FundingMatches.tsx` ×1 — enumerate with `grep -rn 'new CustomEvent("paige:open"' src/` at
   build time rather than hardcoding a count) are the frozen migration baseline (a ratchet that may
   shrink, not grow).
3. **(program item)** No local authority control that does not invoke its governed backend contract —
   covered where it overlaps the Trust Compass reconciliation (`command-center.trust-compass`, Phase 4.3).

## Migration sequence (bounded slices)

1. **This document** — contract published. *(done)*
2. Extend `paigeClientScope.ts` → `SurfaceContextIntent` type + allowlist + a single `emitPaigeOpen`
   helper; add the listener path that resolves the server-side safe context and consumes `ask` (closes
   #771). Ship the two guards alongside.
3. Migrate the nine call sites (four files) to the helper; add surface identity to the resolved context.
4. Retire the raw `clientContext` prose payload in favour of the server-resolved summary.

Each slice updates the `paige.workspace` row in `docs/binding-ledger/surface-binding-ledger.json` on
merge (§BRAIN.3), and none claims `LIVE` without authenticated runtime proof (§13/§32).

> **A safe context handoff is the FLOOR, not the deliverable (owner ruling, 2026-09-06).** This contract
> makes Paige open *oriented*; it does not by itself make a surface complete. A surface's
> `completion_criterion` (see the ledger's `intended_capability`) is a **real governed action with a
> verified outcome and Rail evidence** — not a richer handoff. The next runtime slice, Business Game
> Plan + Missions, must demonstrate exactly that: Paige creating/revising/sequencing/advancing a real
> Business Mission (`business_mission.*`, already wired), owner-confirmed, verified, and Rail-recorded.

## Cross-references

`docs/binding-ledger/` (the ledger this serves) · `governed-execution-seam.md` · `one-approval-gate.md`
· §00 (CC owns the data/behavior contract; CD owns how the banner/status looks) · §7/§36 (Paige opens
already oriented) · §9/§51 (tenant isolation — the intent is never the authority) · §18 (extend the one
home) · #981 (why raw payloads are forbidden) · #771 (the dropped prompt).
