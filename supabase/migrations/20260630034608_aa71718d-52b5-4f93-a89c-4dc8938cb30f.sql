-- Extend the auto-stub to fall back to clients.created_by when linked_user_id
-- is null or orphaned (CRM-only contacts that were imported without auth).

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
  _owner_user_id uuid;
BEGIN
  _trimmed_name := NULLIF(btrim(COALESCE(NEW.entity_name, '')), '');
  IF _trimmed_name IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.primary_business_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Prefer linked_user_id if it points to a real auth user, else fall back to created_by.
  IF NEW.linked_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.linked_user_id) THEN
    _owner_user_id := NEW.linked_user_id;
  ELSIF NEW.created_by IS NOT NULL
        AND EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.created_by) THEN
    _owner_user_id := NEW.created_by;
  ELSE
    RETURN NEW;
  END IF;

  -- Reuse an existing business owned by the same owner if one exists (only when
  -- the owner is the contact's linked_user — never auto-attach to a coach/creator's
  -- other portfolio companies).
  IF _owner_user_id = NEW.linked_user_id THEN
    SELECT id INTO _existing_business_id
      FROM public.businesses
     WHERE owner_user_id = _owner_user_id
     ORDER BY COALESCE(is_primary, false) DESC, created_at ASC
     LIMIT 1;

    IF _existing_business_id IS NOT NULL THEN
      UPDATE public.clients
         SET primary_business_id = _existing_business_id, updated_at = now()
       WHERE id = NEW.id AND primary_business_id IS NULL;
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.businesses (
    owner_user_id, legal_name, entity_type, is_primary, is_active,
    organizational_level, display_order
  ) VALUES (
    _owner_user_id, _trimmed_name, NEW.entity_type::entity_type,
    true, true, 0, 0
  )
  RETURNING id INTO _new_business_id;

  UPDATE public.clients
     SET primary_business_id = _new_business_id, updated_at = now()
   WHERE id = NEW.id AND primary_business_id IS NULL;

  BEGIN
    INSERT INTO public.paige_audit_log (actor_user_id, action, target_type, target_id, metadata)
    VALUES (NULL, 'auto_stub_business_from_contact', 'business', _new_business_id,
            jsonb_build_object(
              'contact_id', NEW.id,
              'owner_user_id', _owner_user_id,
              'owner_source', CASE WHEN _owner_user_id = NEW.linked_user_id THEN 'linked_user_id' ELSE 'created_by_fallback' END,
              'legal_name', _trimmed_name,
              'trigger_op', TG_OP
            ));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'auto_stub_business_from_contact failed for contact %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Clear Bradley's orphan linked_user_id so the system knows he's CRM-only,
-- then trigger fires via the UPDATE to create his business stub.
DO $$
BEGIN
  UPDATE public.clients
     SET linked_user_id = NULL,
         updated_at = now()
   WHERE id = '7e0cff62-3f9f-4160-bc23-1420a50b6ae6'
     AND linked_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = clients.linked_user_id);
END $$;

-- Re-run backfill for anyone still unlinked (including newly-cleared orphans).
DO $$
DECLARE
  _row record;
  _new_id uuid;
  _existing_id uuid;
  _owner uuid;
  _created int := 0;
  _linked int := 0;
  _skipped int := 0;
BEGIN
  FOR _row IN
    SELECT c.id, c.entity_name, c.entity_type, c.linked_user_id, c.created_by
      FROM public.clients c
     WHERE c.primary_business_id IS NULL
       AND NULLIF(btrim(COALESCE(c.entity_name, '')), '') IS NOT NULL
  LOOP
    _owner := NULL;
    IF _row.linked_user_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _row.linked_user_id) THEN
      _owner := _row.linked_user_id;
    ELSIF _row.created_by IS NOT NULL
          AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _row.created_by) THEN
      _owner := _row.created_by;
    END IF;

    IF _owner IS NULL THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    _existing_id := NULL;
    IF _owner = _row.linked_user_id THEN
      SELECT id INTO _existing_id FROM public.businesses
       WHERE owner_user_id = _owner
       ORDER BY COALESCE(is_primary, false) DESC, created_at ASC LIMIT 1;
    END IF;

    IF _existing_id IS NOT NULL THEN
      UPDATE public.clients SET primary_business_id = _existing_id, updated_at = now()
       WHERE id = _row.id;
      _linked := _linked + 1;
    ELSE
      INSERT INTO public.businesses (
        owner_user_id, legal_name, entity_type, is_primary, is_active,
        organizational_level, display_order
      ) VALUES (
        _owner, btrim(_row.entity_name), _row.entity_type::entity_type,
        true, true, 0, 0
      )
      RETURNING id INTO _new_id;

      UPDATE public.clients SET primary_business_id = _new_id, updated_at = now()
       WHERE id = _row.id;
      _created := _created + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'auto_stub re-backfill: created=% linked=% skipped=%', _created, _linked, _skipped;
END $$;
