-- 1. Fix coach funding_secured policy to scope to assigned clients only
DROP POLICY IF EXISTS "Coaches can manage funding_secured" ON public.funding_secured;

CREATE POLICY "Coaches can view assigned client funding_secured"
  ON public.funding_secured FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND client_user_id IN (
      SELECT client_user_id FROM public.coach_clients
      WHERE coach_user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Coaches can insert funding_secured for assigned clients"
  ON public.funding_secured FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'coach'::app_role)
    AND client_user_id IN (
      SELECT client_user_id FROM public.coach_clients
      WHERE coach_user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Coaches can update funding_secured for assigned clients"
  ON public.funding_secured FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND client_user_id IN (
      SELECT client_user_id FROM public.coach_clients
      WHERE coach_user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'coach'::app_role)
    AND client_user_id IN (
      SELECT client_user_id FROM public.coach_clients
      WHERE coach_user_id = auth.uid() AND status = 'active'
    )
  );

-- 2. Fix course_certificates public exposure - replace with verification-code-only lookup
DROP POLICY IF EXISTS "Anyone can verify certificates" ON public.course_certificates;

-- Create a secure function for certificate verification by code
CREATE OR REPLACE FUNCTION public.verify_certificate_by_code(_verification_code text)
RETURNS TABLE(
  course_id uuid,
  issued_at timestamptz,
  verification_code text,
  certificate_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cc.course_id, cc.issued_at, cc.verification_code, cc.certificate_url
  FROM public.course_certificates cc
  WHERE cc.verification_code = _verification_code
  LIMIT 1;
$$;

-- 3. Fix mutable search_path on email queue functions
CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

-- 4. Fix overly permissive INSERT policies
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (current_setting('role') = 'service_role');

DROP POLICY IF EXISTS "System can insert conversions" ON public.referral_conversions;
CREATE POLICY "System can insert conversions"
  ON public.referral_conversions FOR INSERT
  WITH CHECK (current_setting('role') = 'service_role');

DROP POLICY IF EXISTS "Service role can insert command logs" ON public.voice_command_logs;
CREATE POLICY "Service role can insert command logs"
  ON public.voice_command_logs FOR INSERT
  WITH CHECK (current_setting('role') = 'service_role');