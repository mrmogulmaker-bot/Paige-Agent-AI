-- Wave 4 · Slice 4a.3 — Paige chat compaction + persistence + durable tasking
-- (CLAUDE.md §7 memory is the moat · §8 Owner-Ops action bus · §9/§51 tenant isolation ·
--  §18 extend one home never fork · §12 organize/link what you create · §46 ambient compaction signal)
--
-- CONTEXT (§18 recon, resolved OUT LOUD in the PR):
--   Persistence + rolling-summary compaction for the owner "Your Paige" chat ALREADY SHIP
--   (migration 20260711300000 + paige-ai-chat: paige_chat_turn_append persists every turn;
--   maybeRefreshSummary folds older turns into paige_chat_threads.summary and advances
--   summary_through_seq; usePaigeThreads lists + reloads full transcript, (tenant_id,user_id)-scoped,
--   surviving across sessions). This slice does NOT rebuild any of that (§18). It adds only the two
--   genuinely-missing pieces this slice owns:
--
--   1. DURABLE TASKING LINK-BACK (§8/§12) — a task Paige creates from a chat had NO way to point
--      back at the conversation it came from. EXTEND the existing `public.tasks` table (do NOT fork
--      a tasks table, §18) with a soft link to the source thread. Soft link (no hard FK) MIRRORS the
--      sibling precedent set one slice earlier — paige_owner_memory.source_thread_id is a documented
--      "soft link to paige_chat_threads.id (no hard FK)" — so the two Owner-Ops link-backs stay
--      consistent (§12) and `tasks` (a hot write path) takes on no cross-table lock/cascade dependency
--      on the reap-eligible threads table. A dangling id is harmless: the UI simply can't resolve a
--      deep-link to a reaped thread; knowing a uuid is NOT reading the thread (that read still goes
--      through paige_chat_threads RLS independently — §9, no leak).
--
--   2. COMPACTION AMBIENT SIGNAL (§46) — compaction currently fires silently in the background. The
--      doctrine adversarial question asks: "does the tenant KNOW Paige is compacting?" Add a truthful,
--      queryable timestamp the owner sidebar can render a small ambient "tidied earlier context" note
--      from. Nothing renders a modal wall; this is just an honest signal source (§13). RLS on
--      paige_chat_threads already governs who can read it — no policy change needed.
--
--   RLS: NO new policies. Both new columns live on already-RLS-protected tables whose existing
--   policies (tasks: own user_id + tenant_isolation; paige_chat_threads: caller_user_id/tenant) cover
--   them by construction. A nullable, default-NULL, ADDITIVE column changes no producer contract
--   (§37) — every existing INSERT omits it and gets NULL.
--
-- Idempotent; ADDITIVE only.

-- ── 1. Durable tasking: link a chat-created task back to its source conversation (§8/§12) ──────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source_thread_id uuid;  -- soft link → paige_chat_threads.id (no hard FK;
                                                   -- mirrors paige_owner_memory.source_thread_id, §12)

COMMENT ON COLUMN public.tasks.source_thread_id IS
  'Soft link to the paige_chat_threads.id this task was created from (Paige-in-chat, §8/§12). No hard FK '
  '(mirrors paige_owner_memory.source_thread_id); a reaped thread just leaves a dangling, harmless id. '
  'Reading the linked thread still goes through paige_chat_threads RLS independently (§9 — no leak).';

-- Partial index: only the rows that actually carry a link (chat-created tasks), for the
-- "show this conversation's tasks" / "jump from task to its chat" navigation (§10 callable seam).
CREATE INDEX IF NOT EXISTS idx_tasks_source_thread
  ON public.tasks (source_thread_id)
  WHERE source_thread_id IS NOT NULL;

-- ── 2. Compaction ambient signal (§46) — a truthful "last compacted" timestamp for the UI ─────────
ALTER TABLE public.paige_chat_threads
  ADD COLUMN IF NOT EXISTS last_compacted_at timestamptz;

COMMENT ON COLUMN public.paige_chat_threads.last_compacted_at IS
  'When maybeRefreshSummary last folded older turns into summary (§46 ambient signal source). NULL '
  'until the thread first compacts. Governed by the thread''s existing RLS — no separate policy.';
