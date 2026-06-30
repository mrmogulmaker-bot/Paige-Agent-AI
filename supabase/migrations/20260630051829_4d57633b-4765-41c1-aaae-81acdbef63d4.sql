
CREATE OR REPLACE FUNCTION public.enforce_subagent_doctrine_124()
RETURNS TABLE(out_slug text, out_action text, out_pattern text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  patterns text[][] := ARRAY[
    ['claims_tool_invocation', '\m(you\s+(can\s+)?(call|invoke|use|run|execute|trigger|fire))\s+(list_subagents|list_skills|list_workflows|tool_invoke|tool_search|paige[_-]mcp|the\s+(mcp|registry|tools?|orchestrator))'],
    ['names_registry_tools',   '\m(list_subagents|list_skills|list_workflows|tool_invoke|tool_search)\M'],
    ['claims_edge_call',       '\m(call|invoke|hit|fetch)\s+(an?\s+)?(edge\s+function|supabase\s+function|rpc)\M'],
    ['claims_mcp_access',      '\m(use|access|via|through)\s+(the\s+)?mcp\M']
  ];
  i int;
  matched text;
  already_notified boolean;
BEGIN
  FOR rec IN
    SELECT s.slug AS s_slug, s.name AS s_name, s.enabled AS s_enabled, s.system_prompt AS s_prompt
    FROM public.paige_subagents s
    WHERE s.runtime = 'soft' AND s.system_prompt IS NOT NULL
  LOOP
    matched := NULL;
    FOR i IN 1 .. array_length(patterns, 1) LOOP
      IF rec.s_prompt ~* patterns[i][2] THEN
        matched := patterns[i][1];
        EXIT;
      END IF;
    END LOOP;

    IF matched IS NULL THEN CONTINUE; END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.paige_admin_notifications
      WHERE source_workflow_key = 'doctrine_124_sweep'
        AND body LIKE '%slug=' || rec.s_slug || '%'
        AND created_at > now() - interval '7 days'
    ) INTO already_notified;

    UPDATE public.paige_subagents AS t
       SET enabled = false,
           auto_disabled_reason = 'doctrine_124_v2: ' || matched || ' (swept ' || now()::text || ')'
     WHERE t.slug = rec.s_slug;

    IF NOT already_notified THEN
      INSERT INTO public.paige_admin_notifications (severity, title, body, source_workflow_key, assigned_role, scope)
      VALUES (
        CASE WHEN rec.s_enabled THEN 'urgent' ELSE 'info' END,
        'Doctrine §124 sweep: ' || rec.s_name || ' disabled',
        'Soft sub-agent slug=' || rec.s_slug || ' matched pattern=' || matched ||
        '. ' || CASE WHEN rec.s_enabled
                  THEN 'Was ENABLED — re-enable detected and reverted.'
                  ELSE 'Already disabled; reason stamped for audit trail.' END,
        'doctrine_124_sweep',
        'admin',
        'admin'
      );
    END IF;

    out_slug := rec.s_slug;
    out_action := CASE WHEN rec.s_enabled THEN 're_disabled' ELSE 'audit_stamped' END;
    out_pattern := matched;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_subagent_doctrine_124() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_subagent_doctrine_124() TO service_role;

SELECT * FROM public.enforce_subagent_doctrine_124();

DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'doctrine_124_weekly_sweep';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'doctrine_124_weekly_sweep',
  '0 9 * * 0',
  $cron$ SELECT public.enforce_subagent_doctrine_124(); $cron$
);
