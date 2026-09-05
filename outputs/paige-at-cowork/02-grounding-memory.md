# Grounding Report 02 — Persistent Memory substrate (F02)

**Program:** PAIGE-at-Cowork-Level · **Phase:** 1 (Grounding) · **Flow:** F02 (owner resumes 6h+ later, same
tenant, no context restated) · **Date:** 2026-09-05 · **Base:** `b0af098`, branch `claude/paige-cowork-handoff-rpf6dw`
**Method:** Explore scout (repo, file:line) + CC live-prod verification (ref `xygzykjyynhzqytbqnzu`, Supabase MCP).
Repo citations = scout-grounded; prod facts = **CC-verified** and labelled.

---

## Headline (§13 — the finding that reframes F02)

**The handoff's model — "resume by reading tenant memory from the L8 fabric (`paige_owner_memory`)" — is
not how cross-session resume actually works today.** Two DIFFERENT substrates exist; they must not be
conflated:

- **`paige_owner_memory`** (the "L8 fabric", migration `20260810120000`) — table exists, RLS is already
  tenant-capable, but it has **NO tenant runtime read or write path**. Its only wired reader is the
  operator/God §52 briefing, which **NO-OPs for every tenant persona**. **CC-verified on prod: 7 rows
  total, all NULL-tenant (the seeded God rows), ZERO tenant rows.**
- **`paige_operating_memory()` RPC + `paige_chat_threads.summary`** (migrations `20261035000000`,
  `20260711201150`, + compaction in `paige-ai-chat`) — this is what ACTUALLY makes a returning tenant
  owner resume without restating context, and it is **already tenant-scoped and already wired into the
  Solo-owner chat prompt today.**

So F02's functional outcome may be **largely delivered already** via the operating-memory path, and
`paige_owner_memory` is a **separate, largely-unwired durable-facts/semantic capability**. The owner must
rule which one F02 means (see Owner Questions).

---

## EXISTS

### A. `paige_owner_memory` — L8 fabric (migration `20260810120000_paige_owner_memory_l8_fabric.sql`)
Columns (`:35-58`): `id`, `tenant_id` (nullable — relaxed by `20260816120000:53-54`), `user_id NOT NULL`,
`memory_type`, `content`, `source_thread_id`, `is_active`, `embedding vector(1024)`, `embedding_model
DEFAULT 'voyage-3'`, `embedding_dim DEFAULT 1024`, `metadata`, `created_by`, timestamps. CHECK: embedding
NULL OR (voyage-3 @ 1024). Semantic RPC `match_paige_owner_memory(...)` SECURITY DEFINER, IDOR-guarded,
`=` tenant filter (`:113-155`).
- RLS (base `:79-102` + operator OR-branch `20260816120000:66-95`).
  **CC-verified on prod — the three `own_*` policies each read:**
  `((tenant_id = current_user_tenant_id()) AND (user_id = auth.uid())) OR (is_platform_owner() AND (user_id = auth.uid())[ AND tenant_id IS NULL])`
  plus a `service_role` FOR-ALL policy. So a tenant admin/owner CAN read/write their own `(tenant_id,
  user_id)` rows under RLS — the RLS is **not** operator-only.
- **CC-verified on prod:** `tenant_id` IS nullable; `om_total=7`, `om_with_tenant=0`, `om_god_null_tenant=7`.

### B. `owner-context.ts` — the §52 composer (operator-only by construction)
Reads `paige_owner_memory` via the **service-role (RLS-free) client** filtered **only by `user_id`** (no
tenant predicate, `:273`); the whole payload is God-framed (`:303-304`) and pulls operator-only tables
(`tenant_revenue_classification`, `platform_subscriptions`, `paige_systems_check_run`, `:111-241`). Returns
`null` on no rows (fail-closed, never fabricates). Caller MUST have verified the user is a platform
operator (the RLS-free read is otherwise unscoped).

### C. paige-ai-chat wiring — the §52 block is tenant-NO-OP
`index.ts:4226-4255` fires `loadOwnerContextBlock` ONLY when `personaCtx.tenant_id == null` AND
`is_platform_operator()` (`:4240-4243`); comment `:4233`: "NO-OP for every tenant persona (Phase 1
scope)." The cross-chat semantic read from `paige_owner_memory` (`match_paige_owner_memory`) and any
**write** into it are **DEFERRED to slice 4b** (comment-only/unwired, `:486-498`, `:1618-1631`).

### D. The memory that DOES power tenant resume today (the real F02 machinery)
- `paige_operating_memory()` (migration `20261035000000`): SECURITY INVOKER, scope from `auth.uid()` +
  `current_user_tenant_id()`, **no tenant argument**; returns `commitments`/`processes`/`in_flight`/
  `recent`/**`continuity`** (folded `summary` of the tenant's OTHER recent threads so a new chat doesn't
  open blank; tenant-scoped `:142`, excludes current thread `:145`, cross-client-safe `:146`). Wired into
  the tenant chat prompt at `paige-ai-chat/index.ts:1444-1499`, injected `:4114`.
- `paige_chat_threads` (persistence `20260711201150`, tenant-isolation RESTRICTIVE policy
  `20260713024606:24-32`): carries `tenant_id`, `summary`, `summary_through_seq`, `message_count`,
  `last_message_at`. Token-aware compaction that writes `summary` = `foldThreadSummary` in
  `paige-ai-chat/index.ts:4299-4385`.

### E. `prompt-forge.ts` (§26) — NOT in scope for F02
Composes only generation-DNA (`paige_prompt_template`, `paige_prompt_memory`) — artifact-generation
memory, unrelated to conversational resume. No owner-memory composition to wire here. The chat prompt is
assembled in `paige-ai-chat/index.ts` (`buildNeutralCorePrompt`, `:4105`).

---

## BLOCKED-ON / DEPENDENCIES
- **No runtime writer into `paige_owner_memory`** (deferred 4b) — so any tenant read is empty until a
  writer exists. **CC-confirmed by the 0 tenant rows on prod.**
- **F02 tenant memory must land aligned with PR #591** (Active-tenant Knowledge isolation, OPEN/draft
  `claude/kb-active-tenant-retrieval` @ `2636d43`). #591 makes Paige fail-closed rather than read
  knowledge under a stale/ambiguous/revoked tenant. A tenant-scoped owner-memory read is exactly the kind
  of egress #591 governs — building F02's tenant path before/without #591's authority revalidation would
  reintroduce the race #591 exists to close. Sequence F02 with, not ahead of, #591.
- **`match_paige_owner_memory` NULL-tenant trap** (`20260816120000:38-41`): its `=` filter returns zero
  for NULL-tenant operator rows — irrelevant to tenant rows, but do not write a shared read helper that
  assumes NULL-tenant support.

---

## NEEDS-BUILDING (concrete delta)

**Interpretation A — F02 = "resume works" (likely already true; lowest cost):** verify on prod that a
Solo owner's returning session renders `operatingMemoryBlock.continuity`. Machinery is fully wired and
tenant-scoped. Only real gap: `continuity` needs the PRIOR thread to have been folded
(`summary IS NOT NULL`, `20261035000000:143`) — a short prior session never compacted contributes
nothing. If F02 must survive short prior sessions, add a session-end summary write below the compaction
threshold. **Likely no schema delta — Phase-4 proof, not a build.**

**Interpretation B — F02 = "tenant durable-facts in `paige_owner_memory`" (the handoff's words; real build):**
1. **Schema/RLS:** effectively zero-to-tiny — RLS already supports tenant rows; `tenant_id` already
   nullable; the `(tenant_id, user_id, is_active, created_at DESC)` index already serves the tenant pull.
2. **Composer:** build a SEPARATE tenant composer (or parameterize `loadOwnerContextBlock` with a
   `tenantId` + mode) that reads filtered by BOTH `user_id` AND `tenant_id` (the tenant predicate absent
   at `owner-context.ts:273`), drops the God/platform-state/doctrine blocks, keyed on
   `current_user_tenant_id()` from the verified JWT — never the request body (§9/§588).
3. **Writer (the actual missing capability):** implement the deferred 4b write — on a genuine durable
   fact/session summary, insert an embedded row with EXPLICIT `tenant_id`+`user_id`, `voyage-3`@1024 via
   `voyageEmbedOne` only (§17/§26). Existence/count short-circuit before any paid embed (`:496-497`).
4. **paige-ai-chat:** add a tenant branch alongside the §52 operator block (`:4240-4255`), gated so it
   never fires the operator path; fold hits into a memory block like `operatingMemoryBlock` (`:4114`).
5. **prompt-forge:** no change.

---

## OWNER / OPEN QUESTIONS
1. **Which substrate is F02?** Interpretation A (make/prove resume — largely done via
   `paige_operating_memory`) vs Interpretation B (stand up tenant durable-facts in `paige_owner_memory`
   + the 4b writer). **Ruling needed** — it changes F02 from a proof task to a real build.
2. **Solo tier 4b depth:** recent-rows recall vs full Voyage semantic recall vs agency roll-up (tier-gated
   per `paige-ai-chat/index.ts:491-494`). Owner ruling.
3. **PR #424 provenance:** handoff cites #424 for the L8 fabric; repo shows the substrate in
   `20260810120000` + operator relaxation `20260816120000`. Confirm the mapping if it matters for audit.

---

## PROD VERIFICATION LEDGER (CC-run, §13)
- `paige_owner_memory.tenant_id` nullable = **YES** · three `own_*` policies carry `is_platform_owner()`
  OR-branch = **YES** · rows: total **7**, tenant **0**, God-null **7**. (Supabase MCP, 2026-09-05.)
- OWED: authenticated live-drive that a returning Solo owner sees `continuity` (§32.c — no browser/live
  creds this session).
