
CREATE OR REPLACE FUNCTION public.tenant_sender_identity(_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'tenant_id',     t.id,
    'tenant_name',   t.name,
    'tenant_slug',   t.slug,
    'from_name',     COALESCE(t.brand ->> 'from_name', t.name, 'Paige'),
    'support_email', t.brand ->> 'support_email',
    'from_address',  'notify@paigeagent.ai',
    'reply_to',      COALESCE(t.brand ->> 'support_email', 'support@paigeagent.ai')
  )
  FROM public.tenants t WHERE t.id = _tenant_id;
$$;

ALTER TABLE public.paige_skills
  ADD COLUMN IF NOT EXISTS external_send boolean
  GENERATED ALWAYS AS (risk_level = 'external_send') STORED;

UPDATE public.paige_subagents
   SET slug = 'problem-reverse-engineer'
 WHERE slug = 'problem_reverse_engineer';

CREATE OR REPLACE FUNCTION public.scan_soft_subagents_for_tool_refs()
RETURNS TABLE (out_slug text, out_pattern text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r record;
  patterns text[] := ARRAY[
    '\m(call|invoke|use|run|execute|query|fetch|delegate(\s+to)?)\s+(the\s+)?(list_|run_|get_|verify_|search_|create_|update_|delete_|advance_|bulk_|broadcast_|send_|propose_|tool_)[a-z_]+',
    '\m(list_|run_|get_|verify_|search_|create_|update_|delete_|advance_|bulk_|broadcast_|send_|propose_|tool_)[a-z_]+\s*\(',
    '\m(MCP|tool[_\s]?invoke|tool[_\s]?search|tool[_\s]?registry)\M',
    '\mcall\s+(any|the|its?)\s+tools?\M'
  ];
  p text; m text;
BEGIN
  FOR r IN
    SELECT s.slug AS sub_slug, s.system_prompt
      FROM public.paige_subagents s
     WHERE s.runtime = 'soft' AND s.enabled = true
  LOOP
    FOREACH p IN ARRAY patterns LOOP
      m := substring(r.system_prompt FROM p);
      IF m IS NOT NULL THEN
        UPDATE public.paige_subagents AS sa
           SET enabled = false,
               auto_disabled_reason = format('soft_runtime_tool_call_detected (pattern matched: %s)', left(m, 120))
         WHERE sa.slug = r.sub_slug;

        INSERT INTO public.paige_admin_notifications (severity, title, body, scope)
        VALUES (
          'warning',
          format('Sub-agent %s auto-disabled', r.sub_slug),
          format('Soft sub-agent %s was auto-disabled by the §124 v2 tool-reference scan. Matched fragment: %s', r.sub_slug, left(m, 200)),
          'admin'
        );

        out_slug := r.sub_slug; out_pattern := m;
        RETURN NEXT;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.scan_soft_subagents_for_tool_refs() TO service_role;

SELECT * FROM public.scan_soft_subagents_for_tool_refs();

DO $$ BEGIN
  PERFORM cron.unschedule('scan-soft-subagents-tool-refs');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('scan-soft-subagents-tool-refs', '0 9 * * 1',
  $cron$ SELECT public.scan_soft_subagents_for_tool_refs(); $cron$);

CREATE OR REPLACE FUNCTION public.revoke_platform_access(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'Admin privileges required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.app_settings_owner o
    JOIN auth.users u ON u.email = o.owner_email WHERE u.id = _user_id
  ) THEN
    RAISE EXCEPTION 'Cannot revoke platform owner';
  END IF;
  DELETE FROM public.user_roles
   WHERE user_id = _user_id
     AND role::text IN ('admin','coach','sales_rep','broker','broker_team_member','cs_rep','finance','viewer','moderator','owner');
  DELETE FROM public.tenant_members WHERE user_id = _user_id;
  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (auth.uid(), 'user', 'revoke_platform_access', _user_id,
          jsonb_build_object('revoked_by', auth.uid()));
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_platform_access(uuid) TO authenticated;
