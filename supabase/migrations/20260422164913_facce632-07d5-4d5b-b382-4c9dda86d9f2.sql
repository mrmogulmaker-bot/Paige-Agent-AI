-- Seed Antonio Cook's accounts and platform owner with unlimited business slots
INSERT INTO public.user_business_limits (user_id, max_businesses, additional_businesses_count)
VALUES
  ('cb876b66-b1ff-4ff2-99df-2cd4b339f9fc', 999, 0),
  ('24a852e9-04d4-482f-a10a-145b3d4c0c07', 999, 0),
  ('8665ce31-e43c-4d33-a532-ed7af7d6ecbb', 999, 0),
  ('fb1a09e3-bab2-487e-95bf-40e15b29729a', 999, 0)
ON CONFLICT (user_id) DO UPDATE
  SET max_businesses = GREATEST(public.user_business_limits.max_businesses, EXCLUDED.max_businesses),
      updated_at = now();

-- Admin RPC to set a user's business limit (used by Set Business Limit modal in Client Management)
CREATE OR REPLACE FUNCTION public.admin_set_user_business_limit(
  _target_user_id uuid,
  _max_businesses integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_row public.user_business_limits%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  IF _max_businesses IS NULL OR _max_businesses < 1 THEN
    RAISE EXCEPTION 'max_businesses must be >= 1';
  END IF;

  INSERT INTO public.user_business_limits (user_id, max_businesses)
  VALUES (_target_user_id, _max_businesses)
  ON CONFLICT (user_id) DO UPDATE
    SET max_businesses = EXCLUDED.max_businesses,
        updated_at = now()
  RETURNING * INTO _new_row;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (
    auth.uid(),
    'user_business_limits',
    'admin_set_max_businesses',
    _target_user_id,
    jsonb_build_object('max_businesses', _max_businesses, 'target_user_id', _target_user_id::text)
  );

  RETURN json_build_object(
    'success', true,
    'user_id', _new_row.user_id,
    'max_businesses', _new_row.max_businesses,
    'additional_businesses_count', _new_row.additional_businesses_count
  );
END;
$$;