-- 20260719130000_studio_session_scratchpad.sql
-- Studio #343 (U3) — session working memory. Additive, idempotent, fully reversible.
--
-- WHY THIS EXISTS: a Vibe Studio project session needs a small, durable scratch space —
-- Paige's working memory for the one session (§21: everything streams inside the ONE session).
-- This adds a single jsonb column on public.studio_sessions, defaulting to an empty object so
-- every existing row is backfilled to '{}' with no NULLs. NO new table, NO RLS change, NO change
-- to any existing RPC or read path; the column inherits studio_sessions' existing tenant-scoped
-- RLS. Reverse with: ALTER TABLE public.studio_sessions DROP COLUMN studio_session_scratchpad;
ALTER TABLE public.studio_sessions
  ADD COLUMN IF NOT EXISTS studio_session_scratchpad jsonb NOT NULL DEFAULT '{}'::jsonb;
