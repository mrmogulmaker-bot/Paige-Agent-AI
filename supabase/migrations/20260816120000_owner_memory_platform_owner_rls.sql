-- §52 Phase 1 — owner runtime-context substrate: relax paige_owner_memory for the
-- TENANT-LESS platform operator (the God / Super-Admin account) + seed its identity.
--
-- (CLAUDE.md §9/§51 platform-vs-tenant seam · §10 config-as-data · §36 intuitiveness ·
--  §13/§32 honest, provable · §2 coaching-generic, zero finance default)
--
-- ── §30 DIAGNOSE (why this migration, and why it is a real non-leak) ─────────────────────────
-- The God account (admin@paigeagent.ai, user ba352c23-2faf-4698-b2b4-38d9eff3f435) is the ONLY
-- super_admin, and it is TENANT-LESS: active_tenant_id IS NULL, no tenant_members row. So
-- current_user_tenant_id() returns NULL for it, and paige_owner_memory's original own_read policy
--   (tenant_id = current_user_tenant_id() AND user_id = auth.uid())
-- can NEVER match for the operator — NULL = NULL is NULL (never true), and the table also forbade a
-- NULL tenant_id (NOT NULL + FK). Phase 1 makes the operator able to keep + read its OWN tenant-less
-- memory. Two changes, both minimal and additive:
--   1. tenant_id becomes NULLABLE so an operator (tenant-less) memory row can exist.
--   2. NEW policy BRANCHES for the platform owner: (is_platform_owner() AND user_id = auth.uid()).
--
-- NON-LEAK PROOF (§9 — stated explicitly, per the handoff): the EXISTING tenant-scoped policies are
-- left byte-for-byte intact. A normal tenant still only sees rows where
--   tenant_id = current_user_tenant_id() AND user_id = auth.uid().
-- A NULL-tenant operator row can NEVER satisfy that predicate for a tenant, because SQL three-valued
-- logic makes `NULL = <any non-null tenant id>` evaluate to NULL, which RLS treats as NOT visible.
-- So relaxing tenant_id to NULLABLE does not widen any tenant's visibility by a single row. The new
-- owner branch is the ONLY path that reads NULL-tenant rows, and it is gated on is_platform_owner()
-- (SECURITY DEFINER → user_roles role='super_admin'), so ONLY the God account can read them. The
-- pre-existing service_role policy (headless writes) is unchanged.
--
-- ── §37 PRODUCER INVENTORY (every reader/writer of paige_owner_memory; why this is safe for each) ─
--   • DB migration 20260810120000 (creator) — defines the table + own_* + service policies + the
--     match_paige_owner_memory RPC. Unaffected: we DROP/CREATE only the own_* policies idempotently
--     and ALTER one column; the RPC and service policy are untouched.
--   • RPC match_paige_owner_memory — filters `m.tenant_id = _tenant_id AND m.user_id = _user_id`.
--     HONEST NOTE (§13, corrected after §39 adversarial read): because that filter uses `=`,
--     the operator's NULL-tenant rows are NOT retrievable through this RPC under ANY argument
--     (`NULL = NULL` is NULL, never true). That is SAFE for this PR — the §52 owner-context READ
--     path does NOT use this RPC; it does a DIRECT service-role SELECT by user_id (see
--     _shared/owner-context.ts). Making tenant_id nullable changes NOTHING about this RPC's
--     behavior for existing tenant rows (it already filtered by equality). LATENT FOLLOW-UP: if a
--     future slice (4b semantic recall) ever routes the God account's owner-memory through this
--     RPC, it must switch the tenant filter to `m.tenant_id IS NOT DISTINCT FROM _tenant_id` or it
--     will silently return zero rows for the operator (the "correct-but-invisible" trap). Logged.
--   • Edge fn paige-ai-chat — the ONLY runtime consumer. Its cross-chat WRITE path is still DEFERRED
--     (comment-only, slice 4b); the NEW §52 owner-context READ path (this PR's _shared/owner-context.ts)
--     reads via the SERVICE-ROLE client (RLS-free) filtered by user_id — nullable tenant_id + new
--     policies do not affect a service-role read. No frontend/src caller exists (grep: 0 hits in src/).
--   • No pg_cron / pg_net job, no DB trigger, no GitHub Action, no external webhook, no n8n/Zapier/MCP
--     tool references this table (grep across the repo: only docs, the two migrations, and paige-ai-chat).
--   Conclusion: nullable tenant_id + owner policy branches break NO legitimate producer (§37).

begin;

-- ── 1. Relax tenant_id → NULLABLE (the operator is tenant-less). FK stays (NULL passes FK). ──────
ALTER TABLE public.paige_owner_memory
  ALTER COLUMN tenant_id DROP NOT NULL;

COMMENT ON COLUMN public.paige_owner_memory.tenant_id IS
  'Owning tenant. NULLABLE (§52): a tenant-scoped row pins (tenant_id,user_id); a platform-operator '
  '(God/Super-Admin) row is TENANT-LESS (NULL) and is read only via the is_platform_owner() policy '
  'branch. A NULL-tenant row is never visible to a tenant (NULL = <tenant id> is never true, §9 non-leak).';

-- ── 2. Add platform-owner BRANCHES to the own_* policies (tenant-scoped predicate kept intact). ──
-- Each policy is a single boolean OR: the EXISTING tenant-scoped predicate (unchanged) OR the NEW
-- owner predicate (is_platform_owner() AND user_id = auth.uid()). Idempotent (DROP IF EXISTS → CREATE).

DROP POLICY IF EXISTS paige_owner_memory_own_read ON public.paige_owner_memory;
CREATE POLICY paige_owner_memory_own_read ON public.paige_owner_memory
  FOR SELECT TO authenticated
  USING (
    (tenant_id = public.current_user_tenant_id() AND user_id = auth.uid())
    OR (public.is_platform_owner() AND user_id = auth.uid())
  );

-- The owner WRITE branches additionally pin `tenant_id IS NULL` (§39 finding #5): an operator
-- (God) memory row is tenant-less by invariant, so the owner can only ever WRITE a NULL-tenant
-- row — never stamp one with an arbitrary tenant's id. (Reads stay permissive on the owner's own
-- rows; the constraint is on what can be written.)
DROP POLICY IF EXISTS paige_owner_memory_own_insert ON public.paige_owner_memory;
CREATE POLICY paige_owner_memory_own_insert ON public.paige_owner_memory
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id = public.current_user_tenant_id() AND user_id = auth.uid())
    OR (public.is_platform_owner() AND user_id = auth.uid() AND tenant_id IS NULL)
  );

DROP POLICY IF EXISTS paige_owner_memory_own_update ON public.paige_owner_memory;
CREATE POLICY paige_owner_memory_own_update ON public.paige_owner_memory
  FOR UPDATE TO authenticated
  USING (
    (tenant_id = public.current_user_tenant_id() AND user_id = auth.uid())
    OR (public.is_platform_owner() AND user_id = auth.uid())
  )
  WITH CHECK (
    (tenant_id = public.current_user_tenant_id() AND user_id = auth.uid())
    OR (public.is_platform_owner() AND user_id = auth.uid() AND tenant_id IS NULL)
  );

-- (The service-role policy paige_owner_memory_service and match_paige_owner_memory RPC are unchanged.)

-- ────────────────────────────────────────────────────────────────────────────────────────────────
-- SEED — the platform operator's tenant-less identity/preferences/priorities/permissions/context.
--
-- Target: user ba352c23-2faf-4698-b2b4-38d9eff3f435 (the ONLY super_admin, tenant-less).
-- tenant_id = NULL (platform owner), is_active = true, created_by = the same user, embedding = NULL
-- (nullable — a later backfill job embeds these into the ONE voyage-3@1024 space; we do NOT fabricate
-- a vector, §13/§26). Content is concise PROSE in §3 voice (warm-direct mogul-founder), coaching-
-- generic (§2 — zero credit/funding vertical; this is the platform God account, §9).
--
-- IDEMPOTENCY (§13): there is no natural unique key on this table, so each row is guarded by a
-- WHERE NOT EXISTS keyed on (user_id, memory_type, content) with a NULL-tenant match — re-running
-- the migration inserts nothing new and never duplicates. (A content edit intentionally seeds a NEW
-- row rather than mutating history; supersede the old one via is_active=false when that day comes.)
-- ────────────────────────────────────────────────────────────────────────────────────────────────
DO $seed$
DECLARE
  v_owner uuid := 'ba352c23-2faf-4698-b2b4-38d9eff3f435';
  v_rows  jsonb := jsonb_build_array(
    jsonb_build_object('t', 'identity',
      'c', 'You''re working with the founder and operator of Paige Agent AI — he owns the platform end to end and runs it as the God / Super-Admin account. He thinks like a mogul-founder: direct, decisive, allergic to fluff. Treat him as the CEO you report to, not a user you support.'),
    jsonb_build_object('t', 'preference',
      'c', 'He wants a real team on every substantive job — never solo work — with an adversarial verifier and a compliance pass before anything ships. Talk to him straight, no corporate hedging, no "AI-powered"/"streamline"/"seamless". Show him the sharper idea, don''t just execute the literal ask.'),
    jsonb_build_object('t', 'preference',
      'c', 'He reviews on the live site, not in preview — pre-launch, verified work ships straight to production. Don''t ask permission to merge something already built and verified; only pause for genuinely destructive or irreversible actions.'),
    jsonb_build_object('t', 'active_priority',
      'c', 'The current focus is making Paige a genuine AI COO: the intelligent two-way client portal, the Vibe Studio one-session creation surface, and the Owner-Ops / Client-Experience action bus — all tenant-authored per Playbook.'),
    jsonb_build_object('t', 'active_priority',
      'c', 'Right now you''re the platform''s own operator brain: help him run Paige Agent AI itself — fleet, tenants, roadmap, and the build — from this one chat, by voice or text, the same way a tenant runs their business from theirs.'),
    jsonb_build_object('t', 'permission_note',
      'c', 'As the operator''s Paige you can drive platform operations he authorizes through your callable seams — read platform state, draft and route work, orchestrate your team. Keep the platform-vs-tenant seam clean (never mix operator controls into tenant surfaces), and gate anything destructive or irreversible behind his explicit yes.'),
    jsonb_build_object('t', 'known_context',
      'c', 'Paige Agent AI is a client-based-service-business platform (coaches, consultants, agencies, advisors) — coaching-generic by default; funding/credit is only ever a tenant''s opt-in preset, never a platform default. The platform is pre-launch: no public customers yet, so the bar is world-class polish, not speed.')
  );
  v_row jsonb;
BEGIN
  -- Only seed if the operator user actually exists (keeps the migration safe on any
  -- environment where the God account isn't provisioned — no dangling rows, §13).
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner) THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_rows) LOOP
      INSERT INTO public.paige_owner_memory (tenant_id, user_id, memory_type, content, is_active, created_by)
      SELECT NULL, v_owner, (v_row->>'t'), (v_row->>'c'), true, v_owner
      WHERE NOT EXISTS (
        SELECT 1 FROM public.paige_owner_memory m
        WHERE m.user_id = v_owner
          AND m.tenant_id IS NULL
          AND m.memory_type = (v_row->>'t')
          AND m.content = (v_row->>'c')
      );
    END LOOP;
  END IF;
END
$seed$;

commit;
