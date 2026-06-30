-- Doctrine §116 enforcement: scan EXISTING sub-agent prompts weekly for
-- hardcoded real-person names and business-name patterns. Mirrors the
-- §124 v2 sweep pattern: drift caught → disabled → admin notified.

CREATE OR REPLACE FUNCTION public.enforce_subagent_doctrine_116()
RETURNS TABLE(out_slug text, out_action text, out_match text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  business_re text := '\m[A-Z][A-Za-z0-9&''-]+(\s+[A-Z][A-Za-z0-9&''-]+)*\s+(LLC|Inc|Corp|Corporation|Capital|Group|Holdings|Partners|Ventures|Bank|Financial)\M';
  -- Conservative first+last regex; allowlist filters common safe phrases.
  name_re text := '\m[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\M';
  safe_allowlist text[] := ARRAY[
    'Mogul Maker','Maker Academy','Mogul Academy',
    'Paige Agent','Lovable Cloud','Lovable AI',
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
$$;

REVOKE ALL ON FUNCTION public.enforce_subagent_doctrine_116() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_subagent_doctrine_116() TO service_role;

-- Run once now for immediate drift check
SELECT * FROM public.enforce_subagent_doctrine_116();

-- Schedule weekly alongside the §124 sweep (Sundays 9am UTC)
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'doctrine_116_weekly_sweep';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'doctrine_116_weekly_sweep',
  '0 9 * * 0',
  $cron$ SELECT public.enforce_subagent_doctrine_116(); $cron$
);