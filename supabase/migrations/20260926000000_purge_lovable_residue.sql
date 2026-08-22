-- =============================================================================
-- Purge live Lovable residue from prod (owner-ruled 2026-08-22)
-- =============================================================================
-- Owner: "I don't want any lovable code inside of my platform, like none of it."
--
-- WHAT THE SURVEY ACTUALLY FOUND (§13 — the ruling assumed Lovable-generated code
-- throughout; the evidence says otherwise, and the real residue is worse in one
-- specific place and harmless in the rest):
--
--   * 824 migrations, 3 mention Lovable — all seeded CONTENT, not scaffolded code.
--   * 19 src/ hits, 17 are COMMENTS using Lovable as a design comparator.
--   * The provider itself was already removed (task #109, all-direct providers).
--
-- The exception, and the reason this migration exists: TWO LIVE FUNCTIONS created
-- OUT-OF-BAND on prod (in no migration — the repo documents this at
-- 20260701001755:6) POST to a FOREIGN Supabase project:
--
--     https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/process-email-queue
--
-- That is not our project ref (ours is xygzykjyynhzqytbqnzu). They also send a
-- 'Lovable-Context: cron' header, and an Authorization bearer read from
-- vault.decrypted_secrets. Had anything invoked them, prod would have sent a
-- service-role key to a third-party project.
--
-- HONEST SEVERITY (§13): they are DORMANT, not actively leaking. Verified on prod:
--   - 9 cron jobs exist; NONE schedules email_queue_dispatch, and all 9 target our
--     own host.
--   - No trigger calls either function.
--   - No app or edge-function caller (only an auto-generated types.ts entry).
--   - The live email path is comms-scheduled-drain (every minute), which supersedes
--     them entirely.
-- So this is a disarmed landmine, not an incident. Dropping is correct: they are
-- orphaned, superseded, and point somewhere that is not ours.
-- =============================================================================

-- ── 1. Drop the two orphaned foreign-target email functions ──────────────────
-- Full prior definitions are preserved in the PR body for recoverability. They are
-- NOT preserved here as commented-out SQL: a commented function is not a backup,
-- and leaving the foreign URL in the repo would defeat the purpose of the purge.
DROP FUNCTION IF EXISTS public.email_queue_dispatch();
DROP FUNCTION IF EXISTS public.email_queue_wake();

-- ── 2. Drop the dead Lovable entries from the §116 PII allowlist ─────────────
-- This allowlist stops known-safe phrases being flagged as leaked business/person
-- names in sub-agent prompts. 'Lovable Cloud'/'Lovable AI' are no longer vendors,
-- so the entries are dead weight — and removing them is actively useful: if either
-- string reappears in a prompt after this purge, the sweep will now flag it.
-- Body is otherwise byte-identical to the live definition.
CREATE OR REPLACE FUNCTION public.enforce_subagent_doctrine_116()
 RETURNS TABLE(out_slug text, out_action text, out_match text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  business_re text := '\m[A-Z][A-Za-z0-9&''-]+(\s+[A-Z][A-Za-z0-9&''-]+)*\s+(LLC|Inc|Corp|Corporation|Capital|Group|Holdings|Partners|Ventures|Bank|Financial)\M';
  -- Conservative first+last regex; allowlist filters common safe phrases.
  name_re text := '\m[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\M';
  safe_allowlist text[] := ARRAY[
    'Mogul Maker','Maker Academy','Mogul Academy',
    'Paige Agent',
    'First Last','John Doe','Jane Doe',
    'United States','New York','Los Angeles'
  ];
  candidate text;
  matched text;
  already_notified boolean;
BEGIN
  FOR rec IN
    SELECT s.slug AS s_slug, s.name AS s_name, s.enabled AS s_enabled, s.system_prompt AS s_prompt
    FROM public.paige_subagents s
    WHERE s.system_prompt IS NOT NULL
  LOOP
    matched := NULL;

    -- Business suffix patterns first (high signal)
    candidate := substring(rec.s_prompt FROM business_re);
    IF candidate IS NOT NULL THEN
      matched := 'business_name:' || candidate;
    ELSE
      -- First+Last scan, filtering allowlist
      FOR candidate IN
        SELECT m[1] FROM regexp_matches(rec.s_prompt, name_re, 'g') AS m
      LOOP
        IF NOT (candidate = ANY(safe_allowlist)) THEN
          matched := 'person_name:' || candidate;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF matched IS NULL THEN CONTINUE; END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.paige_admin_notifications
      WHERE source_workflow_key = 'doctrine_116_sweep'
        AND body LIKE '%slug=' || rec.s_slug || '%'
        AND created_at > now() - interval '7 days'
    ) INTO already_notified;

    UPDATE public.paige_subagents AS t
       SET enabled = false,
           auto_disabled_reason = 'doctrine_116: ' || matched || ' (swept ' || now()::text || ')'
     WHERE t.slug = rec.s_slug;

    IF NOT already_notified THEN
      INSERT INTO public.paige_admin_notifications (severity, title, body, source_workflow_key, assigned_role, scope)
      VALUES (
        CASE WHEN rec.s_enabled THEN 'urgent' ELSE 'info' END,
        'Doctrine §116 sweep: ' || rec.s_name || ' disabled',
        'Sub-agent slug=' || rec.s_slug || ' system_prompt contained a named individual or business — ' || matched ||
        '. Use archetype phrasing only ("a client", "the contact", "their business").',
        'doctrine_116_sweep',
        'admin',
        'admin'
      );
    END IF;

    out_slug := rec.s_slug;
    out_action := CASE WHEN rec.s_enabled THEN 're_disabled' ELSE 'audit_stamped' END;
    out_match := matched;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- ── 3. Tenant-visible skill description named the wrong provider ─────────────
-- status='active', so this string is live in the skills catalogue. It claimed
-- documents are generated "via Lovable AI" — factually wrong since task #109 moved
-- to direct providers. allowed_tools on this same row already lists 'anthropic'.
UPDATE public.paige_skills
   SET description = 'Generate a custom document (proposal, summary, action plan, recap), '
                     'render as PDF, and email to a contact through Resend. Logs to communication history.',
       updated_at  = now()
 WHERE slug = 'draft_and_email_document'
   AND description ILIKE '%lovable%';

-- ── 4. The live DPA named a subprocessor that no longer processes anything ───
-- legal_documents slug='dpa' v1, is_current=true, listed "Lovable AI Gateway" as an
-- AI-inference subprocessor. That is a factual error in a binding legal document.
--
-- SAFE TO CORRECT IN PLACE: verified on prod that legal_acceptances holds ZERO rows
-- for slug='dpa' (33 acceptances exist, all for terms/privacy/esign/ai-disclaimer/
-- saas-standalone). Nobody has agreed to this text, so amending it rewrites no
-- executed agreement. Had there been even one acceptance, this would have required
-- a new version row instead — do NOT copy this in-place edit to a document that
-- has been accepted.
--
-- Replacement names the real §34 inference providers rather than a generic phrase,
-- so the subprocessor list is actually accurate going forward.
UPDATE public.legal_documents
   SET body_md    = replace(
                      body_md,
                      'AI inference (Lovable AI Gateway and the underlying foundation-model vendors)',
                      'AI inference (Anthropic, OpenAI, Google, Groq and Featherless, routed per-task by the platform model router)'
                    ),
       updated_at = now()
 WHERE slug = 'dpa'
   AND body_md ILIKE '%lovable%';
