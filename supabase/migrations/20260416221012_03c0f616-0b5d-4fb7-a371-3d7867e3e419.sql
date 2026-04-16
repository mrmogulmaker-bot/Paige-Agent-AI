CREATE OR REPLACE FUNCTION public.get_profile_with_pii_log(_user_id UUID)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() != _user_id AND NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'coach') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.pii_access_log (
    accessed_user_id,
    accessor_user_id,
    table_name,
    field_names,
    access_type,
    accessed_at
  ) VALUES (
    _user_id,
    auth.uid(),
    'profiles',
    ARRAY['ssn_encrypted', 'date_of_birth', 'ssn_last_4'],
    'read',
    NOW()
  );

  RETURN QUERY SELECT * FROM public.profiles WHERE user_id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_with_pii_log(UUID) TO authenticated;