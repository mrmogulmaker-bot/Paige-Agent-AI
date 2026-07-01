-- Auto-derive account_number_prefix for new tenants from their slug
CREATE OR REPLACE FUNCTION public.tenant_set_account_number_prefix()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_prefix TEXT;
  candidate TEXT;
  suffix INT := 0;
BEGIN
  IF NEW.account_number_prefix IS NOT NULL AND length(trim(NEW.account_number_prefix)) > 0 THEN
    NEW.account_number_prefix := upper(regexp_replace(NEW.account_number_prefix, '[^A-Za-z0-9]', '', 'g'));
    RETURN NEW;
  END IF;

  -- Derive from slug: take initials of hyphenated words, else first 3-5 chars
  IF NEW.slug IS NULL OR length(trim(NEW.slug)) = 0 THEN
    base_prefix := 'TEN';
  ELSIF position('-' in NEW.slug) > 0 THEN
    -- Multi-word slug: take first letter of each word (e.g. "mogul-maker-academy" -> "MMA")
    SELECT upper(string_agg(left(part, 1), '')) INTO base_prefix
    FROM unnest(string_to_array(NEW.slug, '-')) AS part
    WHERE length(part) > 0;
    -- If too short (< 2 chars), pad from first word
    IF base_prefix IS NULL OR length(base_prefix) < 2 THEN
      base_prefix := upper(left(regexp_replace(NEW.slug, '[^A-Za-z0-9]', '', 'g'), 4));
    END IF;
  ELSE
    -- Single-word slug: take first 3-4 chars uppercased
    base_prefix := upper(left(regexp_replace(NEW.slug, '[^A-Za-z0-9]', '', 'g'), 4));
  END IF;

  -- Ensure uniqueness across tenants (append numeric suffix if collision)
  candidate := base_prefix;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE account_number_prefix = candidate AND id <> NEW.id) LOOP
    suffix := suffix + 1;
    candidate := base_prefix || suffix::text;
  END LOOP;

  NEW.account_number_prefix := candidate;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tenant_set_account_number_prefix() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tenant_set_account_number_prefix ON public.tenants;
CREATE TRIGGER trg_tenant_set_account_number_prefix
  BEFORE INSERT OR UPDATE OF slug, account_number_prefix ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.tenant_set_account_number_prefix();

-- Backfill any existing tenant with a NULL prefix (safety net)
UPDATE public.tenants SET slug = slug WHERE account_number_prefix IS NULL;