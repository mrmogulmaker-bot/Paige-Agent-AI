
-- ============================================================
-- 1. Paige Skills Registry
-- ============================================================
CREATE TABLE public.paige_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  trigger_phrases text[] NOT NULL DEFAULT ARRAY[]::text[],
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_tools text[] NOT NULL DEFAULT ARRAY[]::text[],
  risk_level text NOT NULL DEFAULT 'read_only'
    CHECK (risk_level IN ('read_only','draft','mutating','external_send')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','draft','disabled')),
  created_by text NOT NULL DEFAULT 'system'
    CHECK (created_by IN ('system','paige','admin')),
  created_by_user_id uuid,
  version integer NOT NULL DEFAULT 1,
  run_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  require_admin_confirm_first_n integer NOT NULL DEFAULT 0,
  cost_estimate_cents integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.paige_skills TO authenticated;
GRANT ALL ON public.paige_skills TO service_role;
ALTER TABLE public.paige_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage skills"
ON public.paige_skills FOR ALL TO authenticated
USING (public.is_platform_owner() OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.is_platform_owner() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Coaches view active skills"
ON public.paige_skills FOR SELECT TO authenticated
USING (status = 'active' AND public.has_role(auth.uid(),'coach'));

CREATE TRIGGER paige_skills_updated
BEFORE UPDATE ON public.paige_skills
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. Paige Skill Runs
-- ============================================================
CREATE TABLE public.paige_skill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid NOT NULL REFERENCES public.paige_skills(id) ON DELETE CASCADE,
  skill_slug text NOT NULL,
  contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  invoker_user_id uuid,
  invoker_kind text NOT NULL DEFAULT 'admin'
    CHECK (invoker_kind IN ('admin','coach','paige','system','mcp')),
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancelled','awaiting_confirm')),
  duration_ms integer,
  error text,
  cost_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX paige_skill_runs_skill_idx ON public.paige_skill_runs(skill_id, created_at DESC);
CREATE INDEX paige_skill_runs_contact_idx ON public.paige_skill_runs(contact_id, created_at DESC);

GRANT SELECT, INSERT ON public.paige_skill_runs TO authenticated;
GRANT ALL ON public.paige_skill_runs TO service_role;
ALTER TABLE public.paige_skill_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all skill runs"
ON public.paige_skill_runs FOR SELECT TO authenticated
USING (public.is_platform_owner() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Coaches view runs for their contacts"
ON public.paige_skill_runs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'coach')
  AND (
    contact_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = contact_id AND c.assigned_coach_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Staff insert skill runs"
ON public.paige_skill_runs FOR INSERT TO authenticated
WITH CHECK (
  public.is_platform_owner()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'coach')
);

-- ============================================================
-- 3. Paige Skill Proposals (self-drafted by Paige)
-- ============================================================
CREATE TABLE public.paige_skill_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_slug text NOT NULL,
  proposed_name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  trigger_phrases text[] NOT NULL DEFAULT ARRAY[]::text[],
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_tools text[] NOT NULL DEFAULT ARRAY[]::text[],
  risk_level text NOT NULL DEFAULT 'read_only'
    CHECK (risk_level IN ('read_only','draft','mutating','external_send')),
  rationale text,
  source_pattern jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','auto_approved','approved','rejected','superseded')),
  published_skill_id uuid REFERENCES public.paige_skills(id) ON DELETE SET NULL,
  reviewer_user_id uuid,
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

GRANT SELECT ON public.paige_skill_proposals TO authenticated;
GRANT ALL ON public.paige_skill_proposals TO service_role;
ALTER TABLE public.paige_skill_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage skill proposals"
ON public.paige_skill_proposals FOR ALL TO authenticated
USING (public.is_platform_owner() OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.is_platform_owner() OR public.has_role(auth.uid(),'admin'));

-- ============================================================
-- 4. Business Verifications
-- ============================================================
CREATE TABLE public.business_verification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  triggered_by text NOT NULL DEFAULT 'system'
    CHECK (triggered_by IN ('system','admin','coach','paige','skill')),
  triggered_by_user_id uuid,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','partial','failed')),
  composite_score integer,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  mismatches jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX business_verification_runs_biz_idx
  ON public.business_verification_runs(business_id, created_at DESC);

GRANT SELECT, INSERT ON public.business_verification_runs TO authenticated;
GRANT ALL ON public.business_verification_runs TO service_role;
ALTER TABLE public.business_verification_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all verification runs"
ON public.business_verification_runs FOR SELECT TO authenticated
USING (public.is_platform_owner() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Coaches view verifications for their clients"
ON public.business_verification_runs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'coach')
  AND contact_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = contact_id AND c.assigned_coach_user_id = auth.uid()
  )
);

CREATE POLICY "Owners view verifications for own businesses"
ON public.business_verification_runs FOR SELECT TO authenticated
USING (
  business_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_user_id = auth.uid()
  )
);

CREATE TABLE public.business_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.business_verification_runs(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_kind text NOT NULL DEFAULT 'public'
    CHECK (source_kind IN ('public','paid','government','browser')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','match','mismatch','not_found','error','unavailable')),
  confidence numeric(5,2),
  matched_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  mismatched_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX business_verifications_run_idx ON public.business_verifications(run_id);
CREATE INDEX business_verifications_biz_idx ON public.business_verifications(business_id);

GRANT SELECT ON public.business_verifications TO authenticated;
GRANT ALL ON public.business_verifications TO service_role;
ALTER TABLE public.business_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View verifications via run access"
ON public.business_verifications FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.business_verification_runs r
    WHERE r.id = run_id
      AND (
        public.is_platform_owner()
        OR public.has_role(auth.uid(),'admin')
        OR (
          public.has_role(auth.uid(),'coach')
          AND r.contact_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = r.contact_id AND c.assigned_coach_user_id = auth.uid()
          )
        )
        OR (
          r.business_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.businesses b
            WHERE b.id = r.business_id AND b.owner_user_id = auth.uid()
          )
        )
      )
  )
);

-- ============================================================
-- 5. Browser Use Sessions
-- ============================================================
CREATE TABLE public.browser_use_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoker_user_id uuid,
  invoker_kind text NOT NULL DEFAULT 'admin'
    CHECK (invoker_kind IN ('admin','coach','paige','skill','system')),
  related_contact_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  related_business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  goal text NOT NULL,
  start_url text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  screenshots text[] NOT NULL DEFAULT ARRAY[]::text[],
  session_replay_url text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  cost_cents integer NOT NULL DEFAULT 0,
  duration_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX browser_use_sessions_created_idx ON public.browser_use_sessions(created_at DESC);

GRANT SELECT ON public.browser_use_sessions TO authenticated;
GRANT ALL ON public.browser_use_sessions TO service_role;
ALTER TABLE public.browser_use_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view browser sessions"
ON public.browser_use_sessions FOR SELECT TO authenticated
USING (public.is_platform_owner() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Coaches view browser sessions for own clients"
ON public.browser_use_sessions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'coach')
  AND related_contact_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = related_contact_id AND c.assigned_coach_user_id = auth.uid()
  )
);

-- ============================================================
-- 6. Auto-trigger business verification on insert
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_business_auto_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _service_key text;
  _project_url text := 'https://bfmyebsjyuoecmjskqhs.supabase.co';
BEGIN
  SELECT value INTO _service_key FROM public._internal_secrets WHERE key = 'service_role_key' LIMIT 1;
  IF _service_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := _project_url || '/functions/v1/business-verifier',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'business_id', NEW.id,
      'triggered_by', 'system'
    )::text
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_business_auto_verify failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_business_auto_verify() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER businesses_auto_verify
AFTER INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.trg_business_auto_verify();

-- ============================================================
-- 7. Seed v1 skills
-- ============================================================
INSERT INTO public.paige_skills (slug, name, description, category, trigger_phrases, risk_level, allowed_tools, require_admin_confirm_first_n, steps)
VALUES
  ('draft_and_email_document',
   'Draft & Email Document to Client',
   'Generate a custom document (proposal, summary, action plan, recap) via Lovable AI, render as PDF, and email to a contact through Resend. Logs to communication history.',
   'documents',
   ARRAY['draft a document','send a document','email a proposal','send the client a summary'],
   'external_send',
   ARRAY['anthropic','resend','pdf_render','communication_log'],
   3,
   '[
     {"id":"gather","tool":"context","desc":"Pull contact + recent activity"},
     {"id":"draft","tool":"anthropic","desc":"Draft document body from prompt + context"},
     {"id":"render","tool":"pdf_render","desc":"Render branded PDF"},
     {"id":"send","tool":"resend","desc":"Email PDF to contact"},
     {"id":"log","tool":"communication_log","desc":"Log send to history"}
   ]'::jsonb),
  ('verify_business_sos',
   'Verify Business via Secretary of State',
   'Runs the business verification agent across all configured sources (SoS, OpenCorporates, SEC, SAM.gov, BBB, USPTO, Google Business) and surfaces any mismatches against client-provided info.',
   'verification',
   ARRAY['verify this business','check secretary of state','look up the business','run verification'],
   'read_only',
   ARRAY['business_verifier'],
   0,
   '[
     {"id":"resolve","tool":"context","desc":"Resolve business by id or name"},
     {"id":"verify","tool":"business_verifier","desc":"Run all available source adapters"},
     {"id":"score","tool":"context","desc":"Compute composite confidence score"},
     {"id":"flag","tool":"approvals","desc":"Create approval task for major mismatches"}
   ]'::jsonb),
  ('build_game_plan',
   'Build Step-by-Step Game Plan',
   'Pulls client context, KB articles, and recent web research, then produces a personalized step-by-step roadmap. Saves to client memory and offers to email the client.',
   'strategy',
   ARRAY['build a game plan','step-by-step plan','create a roadmap','what should they do next'],
   'draft',
   ARRAY['anthropic','rag','firecrawl','client_memory'],
   0,
   '[
     {"id":"context","tool":"context","desc":"Pull client profile + readiness lens + memory"},
     {"id":"research","tool":"rag","desc":"Retrieve KB sections relevant to client stage"},
     {"id":"web","tool":"firecrawl","desc":"Optional fresh web research on niche/lender"},
     {"id":"synthesize","tool":"anthropic","desc":"Compose stage-aware action roadmap"},
     {"id":"save","tool":"client_memory","desc":"Save as game_plan record"}
   ]'::jsonb),
  ('research_to_concept_brief',
   'Research → Concept Brief',
   'Firecrawl a topic, lender, or industry, then synthesize a structured concept brief (problem / approach / risks / next steps).',
   'research',
   ARRAY['research this','concept brief','give me a brief on','run research'],
   'read_only',
   ARRAY['firecrawl','anthropic'],
   0,
   '[
     {"id":"scrape","tool":"firecrawl","desc":"Search + scrape top sources"},
     {"id":"synthesize","tool":"anthropic","desc":"Produce structured brief"}
   ]'::jsonb);
