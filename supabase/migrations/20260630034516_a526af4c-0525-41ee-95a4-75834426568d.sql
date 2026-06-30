-- Add explicit pointer, trigger, and orphan-safe backfill.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS primary_business_id uuid
    REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_primary_business_id
  ON public.clients(primary_business_id);

CREATE OR REPLACE FUNCTION public.auto_stub_business_from_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_business_id uuid;
  _new_business_id uuid;
  _trimmed_name text;
  _user_exists boolean;
BEGIN
  _trimmed_name := NULLIF(btrim(COALESCE(NEW.entity_name, '')), '');
  IF _trimmed_name IS NULL OR NEW.linked_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.primary_business_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if linked_user_id is orphaned (no matching auth.users row).
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.linked_user_id) INTO _user_exists;
  IF NOT _user_exists THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _existing_business_id
    FROM public.businesses
   WHERE owner_user_id = NEW.linked_user_id
   ORDER BY COALESCE(is_primary, false) DESC, created_at ASC
   LIMIT 1;

  IF _existing_business_id IS NOT NULL THEN
    UPDATE public.clients
       SET primary_business_id = _existing_business_id, updated_at = now()
     WHERE id = NEW.id AND primary_business_id IS NULL;
    RETURN NEW;
  END IF;

  INSERT INTO public.businesses (
    owner_user_id, legal_name, entity_type, is_primary, is_active,
    organizational_level, display_order
  ) VALUES (
    NEW.linked_user_id, _trimmed_name, NEW.entity_type::entity_type,
    true, true, 0, 0
  )
  RETURNING id INTO _new_business_id;

  UPDATE public.clients
     SET primary_business_id = _new_business_id, updated_at = now()
   WHERE id = NEW.id AND primary_business_id IS NULL;

  BEGIN
    INSERT INTO public.paige_audit_log (actor_user_id, action, target_type, target_id, metadata)
    VALUES (NULL, 'auto_stub_business_from_contact', 'business', _new_business_id,
            jsonb_build_object('contact_id', NEW.id, 'linked_user_id', NEW.linked_user_id,
                               'legal_name', _trimmed_name, 'trigger_op', TG_OP));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'auto_stub_business_from_contact failed for contact %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_auto_stub_business ON public.clients;
CREATE TRIGGER trg_clients_auto_stub_business
AFTER INSERT OR UPDATE OF entity_name, linked_user_id, primary_business_id ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.auto_stub_business_from_contact();

-- Backfill with orphan handling.
DO $$
DECLARE
  _row record;
  _existing_id uuid;
  _new_id uuid;
  _created int := 0;
  _linked int := 0;
  _orphans int := 0;
BEGIN
  FOR _row IN
    SELECT c.id, c.entity_name, c.entity_type, c.linked_user_id,
           EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.linked_user_id) AS user_exists
      FROM public.clients c
     WHERE c.primary_business_id IS NULL
       AND c.linked_user_id IS NOT NULL
       AND NULLIF(btrim(COALESCE(c.entity_name, '')), '') IS NOT NULL
  LOOP
    IF NOT _row.user_exists THEN
      _orphans := _orphans + 1;
      CONTINUE;
    END IF;

    SELECT id INTO _existing_id
      FROM public.businesses
     WHERE owner_user_id = _row.linked_user_id
     ORDER BY COALESCE(is_primary, false) DESC, created_at ASC
     LIMIT 1;

    IF _existing_id IS NOT NULL THEN
      UPDATE public.clients SET primary_business_id = _existing_id, updated_at = now()
       WHERE id = _row.id;
      _linked := _linked + 1;
    ELSE
      INSERT INTO public.businesses (
        owner_user_id, legal_name, entity_type, is_primary, is_active,
        organizational_level, display_order
      ) VALUES (
        _row.linked_user_id, btrim(_row.entity_name), _row.entity_type::entity_type,
        true, true, 0, 0
      )
      RETURNING id INTO _new_id;

      UPDATE public.clients SET primary_business_id = _new_id, updated_at = now()
       WHERE id = _row.id;
      _created := _created + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'auto_stub backfill: created=% linked=% orphans_skipped=%', _created, _linked, _orphans;
END $$;
