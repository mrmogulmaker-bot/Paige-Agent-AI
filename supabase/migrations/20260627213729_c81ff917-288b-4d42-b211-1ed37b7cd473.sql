
-- 1) Journey stages reference table
CREATE TABLE IF NOT EXISTS public.paige_journey_stages (
  id integer PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  display_order integer NOT NULL,
  color_hex text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.paige_journey_stages TO authenticated;
GRANT ALL ON public.paige_journey_stages TO service_role;

ALTER TABLE public.paige_journey_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone signed in can read journey stages" ON public.paige_journey_stages;
CREATE POLICY "Anyone signed in can read journey stages"
  ON public.paige_journey_stages FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.paige_journey_stages (id, slug, label, display_order, color_hex, description) VALUES
  (1, 'top_of_funnel',       'Top of Funnel',        1, '#94A3B8', 'Lead form fill, social referral, or content discovery.'),
  (2, 'free_community',      'Free Community',       2, '#0EA5E9', 'Joined the free Skool community.'),
  (3, 'paid_tier',           'Paid Tier',            3, '#22C55E', 'Upgraded to Standard ($8), Premium ($44), or VIP ($97).'),
  (4, 'dfy_program',         'DFY Program',          4, '#A855F7', 'Engaged in a Done For You program ($10K–$100K).'),
  (5, 'post_dfy_monitoring', 'Post-DFY Monitoring',  5, '#F59E0B', 'DFY complete; continued progress tracking.'),
  (6, 'ultimate_offer',      'Ultimate Offer',       6, '#EF4444', 'Scaled to high-tier partnership: investor capital, acquisitions, real estate, ABL, institutional offers. The coach acts as facilitator — never takes equity.')
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  color_hex = EXCLUDED.color_hex,
  description = EXCLUDED.description;

-- 2) Add journey columns to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS journey_stage_id integer REFERENCES public.paige_journey_stages(id),
  ADD COLUMN IF NOT EXISTS journey_stage_entered_at timestamptz;

UPDATE public.clients
   SET journey_stage_id = 1,
       journey_stage_entered_at = COALESCE(journey_stage_entered_at, created_at)
 WHERE journey_stage_id IS NULL;

-- 3) Transitions log
CREATE TABLE IF NOT EXISTS public.paige_journey_stage_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  from_stage_id integer REFERENCES public.paige_journey_stages(id),
  to_stage_id integer NOT NULL REFERENCES public.paige_journey_stages(id),
  transitioned_at timestamptz NOT NULL DEFAULT now(),
  transitioned_by uuid,
  source_event text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS paige_journey_transitions_contact_idx
  ON public.paige_journey_stage_transitions (contact_id, transitioned_at DESC);

GRANT SELECT ON public.paige_journey_stage_transitions TO authenticated;
GRANT ALL ON public.paige_journey_stage_transitions TO service_role;

ALTER TABLE public.paige_journey_stage_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and coaches can read transitions" ON public.paige_journey_stage_transitions;
CREATE POLICY "Admins and coaches can read transitions"
  ON public.paige_journey_stage_transitions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'coach'::public.app_role)
  );

-- 4) RPC: set_journey_stage (admin/coach only; service-role also allowed)
CREATE OR REPLACE FUNCTION public.set_journey_stage(
  _contact_id uuid,
  _stage_slug text,
  _source_event text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _to_id integer;
  _from_id integer;
  _is_staff boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    _is_staff := public.has_role(auth.uid(), 'admin'::public.app_role)
              OR public.has_role(auth.uid(), 'coach'::public.app_role);
  END IF;
  IF NOT _is_staff AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO _to_id FROM public.paige_journey_stages WHERE slug = _stage_slug;
  IF _to_id IS NULL THEN
    RAISE EXCEPTION 'Unknown journey stage: %', _stage_slug;
  END IF;

  SELECT journey_stage_id INTO _from_id FROM public.clients WHERE id = _contact_id;
  IF _from_id IS NOT DISTINCT FROM _to_id THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true, 'stage_id', _to_id);
  END IF;

  UPDATE public.clients
     SET journey_stage_id = _to_id,
         journey_stage_entered_at = now()
   WHERE id = _contact_id;

  INSERT INTO public.paige_journey_stage_transitions
    (contact_id, from_stage_id, to_stage_id, transitioned_by, source_event)
  VALUES
    (_contact_id, _from_id, _to_id, auth.uid(), COALESCE(_source_event, 'manual'));

  RETURN jsonb_build_object('ok', true, 'from_stage_id', _from_id, 'to_stage_id', _to_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_journey_stage(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_journey_stage(uuid, text, text) TO authenticated, service_role;

-- 5) Auto-advance to Paid Tier on tier_state upgrade
CREATE OR REPLACE FUNCTION public.auto_advance_journey_on_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _client_id uuid;
  _current_stage integer;
  _new_tier text;
BEGIN
  _new_tier := lower(COALESCE(NEW.tier, ''));
  IF _new_tier NOT IN ('standard','premium','vip') THEN
    RETURN NEW;
  END IF;

  SELECT id, journey_stage_id INTO _client_id, _current_stage
  FROM public.clients
  WHERE linked_user_id = NEW.user_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF _client_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(_current_stage, 0) < 3 THEN
    UPDATE public.clients
       SET journey_stage_id = 3,
           journey_stage_entered_at = now()
     WHERE id = _client_id;

    INSERT INTO public.paige_journey_stage_transitions
      (contact_id, from_stage_id, to_stage_id, source_event, metadata)
    VALUES
      (_client_id, _current_stage, 3, 'tier_upgrade',
       jsonb_build_object('tier', _new_tier));
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'auto_advance_journey_on_tier failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_advance_journey ON public.tier_state;
CREATE TRIGGER trg_auto_advance_journey
  AFTER INSERT OR UPDATE OF tier ON public.tier_state
  FOR EACH ROW EXECUTE FUNCTION public.auto_advance_journey_on_tier();
