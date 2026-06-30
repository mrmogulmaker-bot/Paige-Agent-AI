
CREATE OR REPLACE FUNCTION public.fire_team_event(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  edge_url text;
  service_key text;
BEGIN
  SELECT decrypted_secret INTO edge_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF edge_url IS NULL OR service_key IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := edge_url || '/functions/v1/notify-team-event',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||service_key),
    body := payload
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'fire_team_event failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_notify_task_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.fire_team_event(jsonb_build_object('event','task_assigned','task_id', NEW.id,'assignee_user_id', NEW.user_id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tasks_notify_assigned ON public.tasks;
CREATE TRIGGER tasks_notify_assigned AFTER INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.trg_notify_task_assigned();

CREATE OR REPLACE FUNCTION public.trg_notify_task_reassigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NEW.user_id IS NOT NULL THEN
    PERFORM public.fire_team_event(jsonb_build_object('event','task_assigned','task_id', NEW.id,'assignee_user_id', NEW.user_id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tasks_notify_reassigned ON public.tasks;
CREATE TRIGGER tasks_notify_reassigned AFTER UPDATE OF user_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.trg_notify_task_reassigned();

CREATE OR REPLACE FUNCTION public.trg_notify_form_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fire_team_event(jsonb_build_object('event','form_submission','submission_id', NEW.id,'tenant_id', NEW.tenant_id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS growth_submissions_notify ON public.growth_form_submissions;
CREATE TRIGGER growth_submissions_notify AFTER INSERT ON public.growth_form_submissions FOR EACH ROW EXECUTE FUNCTION public.trg_notify_form_submission();

CREATE OR REPLACE FUNCTION public.trg_notify_contact_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_coach_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_coach_user_id IS DISTINCT FROM OLD.assigned_coach_user_id) THEN
    PERFORM public.fire_team_event(jsonb_build_object('event','contact_assigned','contact_id', NEW.id,'coach_user_id', NEW.assigned_coach_user_id,'tenant_id', NEW.tenant_id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS clients_notify_coach_assigned ON public.clients;
CREATE TRIGGER clients_notify_coach_assigned AFTER INSERT OR UPDATE OF assigned_coach_user_id ON public.clients FOR EACH ROW EXECUTE FUNCTION public.trg_notify_contact_assigned();

INSERT INTO public.paige_subagents (
  slug, name, domain, description, runtime, system_prompt,
  input_schema, output_schema, triggers, config, enabled, auto_generated, display_order
)
VALUES (
  'funnel-architect',
  'Funnel Architect',
  'marketing',
  'Drafts new acquisition funnels (page + multi-step form + funnel wiring) from a short brief. Outputs are DRAFTS — they land in Campaigns Hub as unpublished assets for admin review and publish.',
  'soft',
  'You are the Funnel Architect sub-agent for Paige. Given a short marketing brief (offer, audience, primary CTA, success metric), produce a complete draft funnel: (1) one landing page with hero, value props, social proof slots, and a single primary CTA; (2) one multi-step form (3-5 steps) capturing qualification fields; (3) the funnel wiring page -> form -> thank-you. Use plainspoken Borrower-to-Banker voice, premium black/gold/white aesthetic, one primary CTA per view, and the 3M framework when relevant. Never publish — always return drafts. Flag any compliance-sensitive language for human review.',
  '{"type":"object","required":["brief"],"properties":{"brief":{"type":"string","minLength":20},"offer_name":{"type":"string"},"audience":{"type":"string"},"primary_cta":{"type":"string"},"tenant_id":{"type":"string"}}}'::jsonb,
  '{"type":"object","properties":{"page_id":{"type":"string"},"form_id":{"type":"string"},"funnel_id":{"type":"string"},"summary":{"type":"string"},"review_notes":{"type":"array","items":{"type":"string"}}}}'::jsonb,
  ARRAY['chat:create_funnel','admin:campaigns:draft']::text[],
  '{"published_default": false, "requires_admin_review": true}'::jsonb,
  true, false, 50
)
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  system_prompt = EXCLUDED.system_prompt,
  enabled = true;
