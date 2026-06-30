-- Fix client_goals duplicate coach update policy
DROP POLICY IF EXISTS "Admins and coaches can update goals" ON public.client_goals;

-- Lock down paige_mcp_oauth_codes: enable RLS and add explicit service-role-only policy
ALTER TABLE public.paige_mcp_oauth_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON public.paige_mcp_oauth_codes;
CREATE POLICY "Service role only"
  ON public.paige_mcp_oauth_codes
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Pin search_path on enqueue_email (was mutable)
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;