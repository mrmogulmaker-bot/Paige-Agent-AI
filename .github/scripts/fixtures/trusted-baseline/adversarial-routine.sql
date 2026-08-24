CREATE FUNCTION public.fixture_total()
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT count(*) FROM public.example_accounts;
$$;
