-- Split staff/user profile names into first/middle-initial/last, kept in sync
-- with full_name bidirectionally so every existing reader keeps working (§10 data
-- segregation). Contacts (clients) are already first/last; this is the profiles side.
-- Applied to prod via the Supabase MCP; committed here for repo parity.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS middle_initial text;

UPDATE public.profiles
   SET first_name = NULLIF(split_part(btrim(full_name), ' ', 1), ''),
       last_name  = NULLIF(btrim(substr(btrim(full_name), length(split_part(btrim(full_name), ' ', 1)) + 1)), '')
 WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
   AND first_name IS NULL AND last_name IS NULL;

CREATE OR REPLACE FUNCTION public.sync_profile_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _mi text := NULL;
BEGIN
  IF NEW.middle_initial IS NOT NULL AND btrim(NEW.middle_initial) <> '' THEN
    _mi := upper(left(btrim(NEW.middle_initial), 1));
    NEW.middle_initial := _mi;
  ELSE
    NEW.middle_initial := NULL;
  END IF;

  IF (NEW.first_name IS NOT NULL AND btrim(NEW.first_name) <> '')
     OR (NEW.last_name IS NOT NULL AND btrim(NEW.last_name) <> '') THEN
    NEW.full_name := btrim(regexp_replace(
      concat_ws(' ',
        NULLIF(btrim(coalesce(NEW.first_name, '')), ''),
        CASE WHEN _mi IS NOT NULL THEN _mi || '.' END,
        NULLIF(btrim(coalesce(NEW.last_name, '')), '')
      ), '\s+', ' ', 'g'));
  ELSIF NEW.full_name IS NOT NULL AND btrim(NEW.full_name) <> '' THEN
    NEW.first_name := NULLIF(split_part(btrim(NEW.full_name), ' ', 1), '');
    NEW.last_name  := NULLIF(btrim(substr(btrim(NEW.full_name), length(split_part(btrim(NEW.full_name), ' ', 1)) + 1)), '');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_profile_name ON public.profiles;
CREATE TRIGGER trg_sync_profile_name
  BEFORE INSERT OR UPDATE OF first_name, last_name, middle_initial, full_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_name();
