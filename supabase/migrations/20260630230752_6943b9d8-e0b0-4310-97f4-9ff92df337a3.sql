CREATE OR REPLACE FUNCTION public.tenant_sender_identity(_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'tenant_id',     t.id,
    'tenant_name',   t.name,
    'tenant_slug',   t.slug,
    'from_name',     COALESCE(
                       NULLIF(t.brand ->> 'from_name', ''),
                       NULLIF(d.from_name, ''),
                       t.name,
                       'Paige Agent AI'
                     ),
    'support_email', t.brand ->> 'support_email',
    'from_address',  COALESCE(
                       NULLIF(t.brand ->> 'from_address', ''),
                       CASE
                         WHEN d.domain IS NOT NULL
                           THEN COALESCE(NULLIF(d.from_email_local, ''), 'noreply') || '@' || d.domain
                         ELSE 'noreply@mail.mogulmakeracademy.com'
                       END
                     ),
    'reply_to',      COALESCE(t.brand ->> 'support_email', 'support@paigeagent.ai')
  )
  FROM public.tenants t
  LEFT JOIN LATERAL (
    SELECT domain, from_email_local, from_name
    FROM public.tenant_email_domains
    WHERE tenant_id = t.id
      AND COALESCE(status, '') = 'verified'
    ORDER BY is_default DESC, updated_at DESC NULLS LAST
    LIMIT 1
  ) d ON true
  WHERE t.id = _tenant_id;
$function$;