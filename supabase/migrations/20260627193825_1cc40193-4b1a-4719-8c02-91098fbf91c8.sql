
-- ============================================================
-- Phase 3 Connectors Foundation
-- ============================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.paige_envelope_type AS ENUM ('vip_app','coach_agreement','dfy_engagement','refund','term_sheet','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.paige_envelope_status AS ENUM ('sent','delivered','completed','declined','voided');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.paige_booking_event_type AS ENUM ('vip_intro','dfy_discovery','coffee_hour','workshop','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.paige_booking_status AS ENUM ('confirmed','canceled','rescheduled','no_show','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.paige_social_platform AS ENUM ('facebook','instagram');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.paige_social_post_status AS ENUM ('scheduled','posted','failed','deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.paige_enrichment_subject_type AS ENUM ('person','company');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- paige_signature_envelopes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.paige_signature_envelopes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  envelope_id text NOT NULL UNIQUE,
  contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  envelope_type public.paige_envelope_type NOT NULL DEFAULT 'other',
  template_id text,
  status public.paige_envelope_status NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  signed_at timestamptz,
  completed_pdf_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_signature_envelopes TO authenticated;
GRANT ALL ON public.paige_signature_envelopes TO service_role;

ALTER TABLE public.paige_signature_envelopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage signature envelopes"
  ON public.paige_signature_envelopes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access envelopes"
  ON public.paige_signature_envelopes FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_paige_signature_envelopes_updated_at
  BEFORE UPDATE ON public.paige_signature_envelopes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_envelopes_contact ON public.paige_signature_envelopes(contact_id);
CREATE INDEX IF NOT EXISTS idx_envelopes_status ON public.paige_signature_envelopes(status);

-- ============================================================
-- paige_bookings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.paige_bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cal_event_id text NOT NULL UNIQUE,
  contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  event_type public.paige_booking_event_type NOT NULL DEFAULT 'other',
  cal_event_type_id text,
  title text,
  scheduled_at timestamptz NOT NULL,
  duration_min integer,
  status public.paige_booking_status NOT NULL DEFAULT 'confirmed',
  attendee_email text,
  attendee_name text,
  attendee_responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_bookings TO authenticated;
GRANT ALL ON public.paige_bookings TO service_role;

ALTER TABLE public.paige_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bookings"
  ON public.paige_bookings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access bookings"
  ON public.paige_bookings FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_paige_bookings_updated_at
  BEFORE UPDATE ON public.paige_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_at ON public.paige_bookings(scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_contact ON public.paige_bookings(contact_id);

-- ============================================================
-- paige_social_posts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.paige_social_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform public.paige_social_platform NOT NULL,
  platform_post_id text,
  caption text,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at timestamptz,
  posted_at timestamptz,
  status public.paige_social_post_status NOT NULL DEFAULT 'scheduled',
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, platform_post_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paige_social_posts TO authenticated;
GRANT ALL ON public.paige_social_posts TO service_role;

ALTER TABLE public.paige_social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage social posts"
  ON public.paige_social_posts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access social"
  ON public.paige_social_posts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_paige_social_posts_updated_at
  BEFORE UPDATE ON public.paige_social_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled ON public.paige_social_posts(scheduled_at DESC);

-- ============================================================
-- paige_enrichment_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.paige_enrichment_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_type public.paige_enrichment_subject_type NOT NULL,
  subject_key text NOT NULL,
  contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'apollo',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  succeeded boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.paige_enrichment_log TO authenticated;
GRANT ALL ON public.paige_enrichment_log TO service_role;

ALTER TABLE public.paige_enrichment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read enrichment log"
  ON public.paige_enrichment_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access enrichment"
  ON public.paige_enrichment_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_enrichment_lookup
  ON public.paige_enrichment_log(subject_type, subject_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrichment_contact
  ON public.paige_enrichment_log(contact_id);

-- ============================================================
-- paige_config extension
-- ============================================================
ALTER TABLE public.paige_config
  ADD COLUMN IF NOT EXISTS posthog_project_url text,
  ADD COLUMN IF NOT EXISTS sentry_org_slug text,
  ADD COLUMN IF NOT EXISTS sentry_project_slug text,
  ADD COLUMN IF NOT EXISTS docusign_default_brand_id text,
  ADD COLUMN IF NOT EXISTS docusign_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cal_default_event_type_id text,
  ADD COLUMN IF NOT EXISTS cal_event_type_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS meta_default_page_id text,
  ADD COLUMN IF NOT EXISTS apollo_auto_enrich boolean NOT NULL DEFAULT true;

-- ============================================================
-- Apollo auto-enrich trigger on new contacts
-- Uses pg_net to async-POST to the apollo-enrich-person edge function.
-- Non-blocking; failures land in paige_enrichment_log via the function itself.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_clients_apollo_enrich()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_function_url text;
  v_anon_key text;
BEGIN
  -- Honor the global flag on paige_config
  SELECT apollo_auto_enrich INTO v_enabled FROM public.paige_config LIMIT 1;
  IF COALESCE(v_enabled, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NULL OR length(NEW.email) < 3 THEN
    RETURN NEW;
  END IF;

  v_function_url := 'https://bfmyebsjyuoecmjskqhs.supabase.co/functions/v1/apollo-enrich-person';
  v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmbXllYnNqeXVvZWNtanNrcWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5OTc1OTgsImV4cCI6MjA3NTU3MzU5OH0.5XSpnAoLvDiH63WFu6BL8xuwUKap4QzlBppavqhOwO0';

  PERFORM net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'x-internal-trigger', 'clients_auto_enrich'
    ),
    body := jsonb_build_object(
      'email', NEW.email,
      'contact_id', NEW.id,
      'source', 'auto_trigger'
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block contact creation on enrichment failures
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_apollo_enrich ON public.clients;
CREATE TRIGGER trg_clients_apollo_enrich
  AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.trg_clients_apollo_enrich();
