# Vibe Studio Upgrade U3 — Session Memory (SPEC, not yet built)

> Status: **design spec only** (§13 — no code shipped). Grounded against the live persistence
> substrate. Part of #343 (Creative Engine upgrades). Build behind `STUDIO_SESSION_MEMORY_ENABLED`,
> feature-branch + live-verify before any live-chat ship.

# SPEC — U3: Studio session memory (persist + semantically recall a project's conversation)

## 0. What already exists (do NOT rebuild — §18)

Grep/read confirms the persistence + linear-recall substrate is already live; U3 is a **thin additive layer**, not a new memory system.

- **Conversation persistence across turns/reloads is DONE.** A Studio project session binds a Paige chat thread via `paige_chat_threads.studio_session_id` (migration `20260718050000_studio_session_chat_thread.sql`), created idempotently by RPC `paige_studio_thread_ensure(p_session_id)`. Every turn is written to `paige_chat_turns (thread_id, role∈user/assistant/system, content, seq bigserial, …)` by RPC `paige_chat_turn_append`. `StudioChat.tsx` hydrates turns on mount (`paige_chat_turns` filtered `role in (user,assistant)`, ordered by `seq`). **Reload recall of the raw transcript already works.**
- **A lossy LINEAR rolling summary already exists.** `paige_chat_threads.summary` + `summary_through_seq` watermark; `maybeRefreshSummary()` in `paige-ai-chat/index.ts` (~L3559, `KEEP=12, EVERY=8`) folds old turns into flowing prose; it is injected as a `CONVERSATION MEMORY` system block (~L3546–3552). Studio threads inherit this automatically (same engine).
- **The embedding space** is `voyage-3 @ 1024` via `voyageEmbedOne(text,{inputType})` in `_shared/voyage.ts` (`VOYAGE_MODEL`, `VOYAGE_DIMS`). One canonical space; tag columns pin it (§17).
- **The precedent pattern** is `paige_prompt_memory` (migration `20260718110000`): tenant-scoped vector table, `tenant_id NOT NULL` + RLS, ivfflat cosine `lists=100`, `embedding_model`/`embedding_dim` tag cols + `CHECK(embedding_dim=1024)`, **service-role INSERT / authenticated SELECT-own-tenant**, honest capture. Note: `paige_prompt_memory` is a *different* thing (whole-tenant record of successful **forges**), so U3 is a **sibling table**, not a reuse of that one.
- **A match-RPC shape to mirror** exists (`match_tenant_knowledge`, migration `20260630181352`): `SECURITY DEFINER SQL`, `1 - (embedding <=> q)::float AS similarity`, `ORDER BY embedding <=> q LIMIT`, granted `authenticated, service_role`.

## 1. The gap U3 closes

The linear summary **dilutes early specifics** ("brand color is deep teal", "CTA must read 'Claim your seat'", "the client is a B2B agency") once they scroll past the verbatim tail, and the design agent **cannot pinpoint the relevant prior exchange** for the current brief (e.g. turn 30: "make it match the palette we picked"). U3 adds a **per-session semantic memory of the conversation**, retrieved by similarity to the incoming brief at turn start, injected **alongside** (never replacing) the rolling summary + verbatim tail. Two complementary layers: summary = narrative continuity; vector memory = pinpoint recall that survives compaction.

## 2. New table — `public.paige_studio_session_memory`

Mirror `paige_prompt_memory` structure and guards.

| column | type | notes |
|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | |
| `tenant_id` | `uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE` | **§9** |
| `studio_session_id` | `uuid NOT NULL REFERENCES public.studio_sessions(id) ON DELETE CASCADE` | scopes recall to ONE project |
| `thread_id` | `uuid NOT NULL REFERENCES public.paige_chat_threads(id) ON DELETE CASCADE` | the session's chat thread |
| `seq` | `bigint NOT NULL` | the assistant turn's `paige_chat_turns.seq` this exchange ends at — the idempotency/watermark anchor |
| `content` | `text NOT NULL` | the compact human-readable exchange that gets embedded AND re-injected (see §3) |
| `embedding` | `extensions.vector(1024) NOT NULL` | voyage-3; NOT NULL enforces honest capture |
| `embedding_model` | `text NOT NULL DEFAULT 'voyage-3'` | **§17** tag |
| `embedding_dim` | `integer NOT NULL DEFAULT 1024` | **§17** tag |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | e.g. `{artifact_kind, artifact_id, artifact_title, tool_names[]}` produced that turn — never a secret |
| `created_by` | `uuid` | actor stamp; NULL for the service seam |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

Constraints/indexes:
- `CHECK (embedding_dim = 1024)` (off-space guard).
- `UNIQUE (thread_id, seq)` — makes capture idempotent (a retried turn never double-writes).
- `INDEX (studio_session_id, seq DESC)` for windowing/pruning.
- `ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100)` — matches siblings; opclass schema-qualified `extensions` so it builds regardless of migration `search_path`.

RLS (copy `paige_prompt_memory` posture exactly):
- `ENABLE ROW LEVEL SECURITY`.
- Authenticated **SELECT** where `tenant_id = public.current_user_tenant_id()` (a memory is the tenant's private learning — no cross-tenant read, no platform-default read; §9).
- Service-role `FOR ALL`. **No authenticated INSERT/DELETE** — the honest-capture edge path owns creation (§13).
- Grants: `SELECT` to `authenticated`; `ALL` to `service_role`.

## 3. What gets embedded (capture)

One row **per completed assistant turn** on a Studio thread. Compose a compact exchange string:

```
Owner: {latest user brief, trimmed}
Design agent: {assistant final reply, trimmed}
[If an artifact was produced this turn] Built: {artifact_kind} "{artifact_title}"
```

- Cap `content` (~4000 chars; hard-slice) so retrieval cost stays bounded.
- Embed `content` with `voyageEmbedOne(content, { inputType: "document" })`.
- **Honest capture (§13):** write ONLY after a real assistant turn was persisted (non-empty `finalText`). Skip empty/near-empty exchanges (e.g. `content.trim().length < 24`). On embed failure or `embedding.length !== VOYAGE_DIMS`, **skip the row** — never store an off-space or fabricated vector (same guard as `captureToMemory`).
- Artifact refs for `metadata` come from the already-collected `studioLinked[]` in `paige-ai-chat` (the turn's linked visual artifact).

## 4. Retrieval at turn start (read)

In the studio branch of `paige-ai-chat/index.ts` (the `if (th?.studio_session_id)` block, ~L3500–3552), gated on `studioSessionId` **and** the `STUDIO_SESSION_MEMORY_ENABLED` flag:

1. Take the latest user brief (`latestUserText`, already computed ~L3484).
2. `qv = await voyageEmbedOne(latestUserText, { inputType: "query" })`.
3. Call new RPC `match_studio_session_memory(p_session_id, p_query_embedding, p_match_count, p_min_similarity, p_exclude_after_seq)`:
   - `SECURITY DEFINER`, mirrors `match_tenant_knowledge` but **verifies session membership** the way `paige_studio_thread_ensure` does (`is_platform_owner()` OR `tenant = current_user_tenant_id() AND is_tenant_member(tenant)`) so a caller can only ever match their own session's rows.
   - `WHERE studio_session_id = p_session_id AND seq <= p_exclude_after_seq` (exclude turns already in the verbatim tail — pass `current_max_seq - KEEP` so we never repeat what's in-window) `AND 1 - (embedding <=> q) >= p_min_similarity` (default `0.45–0.5`).
   - `ORDER BY embedding <=> q LIMIT p_match_count` (default **4**).
   - Returns `content, seq, similarity, metadata`.
   - Grant `EXECUTE` to `authenticated, service_role`; call it with the **caller-JWT** client (`supabaseClient`) so `auth.uid()` powers the membership check.
4. If rows return, splice a system block **right beside** the existing `th.summary` splice (~L3546), e.g.:
   > `RELEVANT EARLIER IN THIS PROJECT — the tenant said or decided these things in earlier turns of this same session; treat as recalled context you already know: {joined content, newest-first}`

   This **complements** the `CONVERSATION MEMORY` (summary) and the verbatim tail — order: persona → operating core → CONVERSATION MEMORY (summary) → RELEVANT EARLIER (semantic) → CANVAS STATE → operator/CRM context.

## 5. Compaction for long sessions

The vector table **is** the compaction-resistant layer — early specifics survive as retrievable rows even after they fall out of the verbatim tail and get diluted in the linear summary. So:
- Keep writing one row per turn; **retrieval is always bounded to top-K**, so injected context does not grow with session length (this is the compaction).
- The existing `maybeRefreshSummary` keeps running unchanged for narrative continuity.
- Optional hygiene (not required for v1): cap rows per session (keep newest ~200 by `seq`, delete older on write) and/or prune on session archive; `ON DELETE CASCADE` already reaps rows when the project/thread is deleted.

## 6. Exact wiring points

- **New migration** `supabase/migrations/<ts>_paige_studio_session_memory.sql` — table + constraints + ivfflat index + RLS/grants + `match_studio_session_memory` RPC. Additive, idempotent (`IF NOT EXISTS`), mirrors `20260718110000_paige_prompt_memory.sql` and `20260630181352`'s match fn.
- **`supabase/functions/paige-ai-chat/index.ts`**:
  - *Read/inject:* studio branch ~L3500–3552 (beside the summary splice).
  - *Write/capture:* inside `persistAssistantTurn` after the assistant `paige_chat_turn_append` succeeds (~L3614), gated on `studioSessionId`; run under `EdgeRuntime.waitUntil(...)` so it never blocks the streamed response; INSERT via the **service-role** client (mirror `captureToMemory`; the service client is already in this file — see live-verify). Re-read the assistant turn's `seq` (or the RPC returns it) to set `seq`.
  - Import `voyageEmbedOne, VOYAGE_MODEL, VOYAGE_DIMS` from `_shared/voyage.ts` if not already imported.
- **`_shared/voyage.ts`** — reused unchanged.
- Deploy is automatic on merge (edge CI follows `_shared` imports); no manual MCP deploy.

## 7. Doctrine posture
§9 tenant-scoped (`tenant_id NOT NULL` + RLS + RPC membership check). §17 voyage-only, tag cols + dim CHECK, no frontier/generation embedding path. §13 honest capture (real completed turns only; skip on embed/dim failure). §18 EXTENDS the thread/turn/summary engine and mirrors `paige_prompt_memory`; distinct table because the purpose (conversation recall) differs from forge-DNA memory. §7 the recall is per-project, tenant-native.