
ALTER TABLE public.paige_workflow_registry DROP CONSTRAINT IF EXISTS paige_workflow_registry_category_check;
ALTER TABLE public.paige_workflow_registry ADD CONSTRAINT paige_workflow_registry_category_check
  CHECK (category = ANY (ARRAY['campaign','campaigns','customer_support','admin','analytics','editorial','funding','observability']));

DO $$ BEGIN
  CREATE TYPE public.workflow_provider AS ENUM ('n8n','langgraph','direct_edge_function','cron_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.paige_workflow_registry
  ADD COLUMN IF NOT EXISTS provider public.workflow_provider NOT NULL DEFAULT 'n8n',
  ADD COLUMN IF NOT EXISTS langgraph_graph_id text,
  ADD COLUMN IF NOT EXISTS direct_function_name text,
  ADD COLUMN IF NOT EXISTS needs_n8n_link boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;

ALTER TABLE public.paige_config
  ADD COLUMN IF NOT EXISTS telegram_command_surface_enabled boolean NOT NULL DEFAULT true;

INSERT INTO public.paige_workflow_registry
  (key, label, description, category, provider, requires_approval, needs_n8n_link, is_active, sort_order, parameters_schema)
VALUES
  ('cs_draft_reply', 'Draft Customer Reply', 'AI drafts a reply to an inbound support email or SMS for human approval.', 'customer_support', 'n8n', true, true, true, 10, '{"type":"object","properties":{"conversation_id":{"type":"string"},"tone":{"type":"string","enum":["warm","direct","formal"]}}}'::jsonb),
  ('cs_triage_inbound', 'Triage New Inbound', 'Classify intent + urgency on inbound message and route.', 'customer_support', 'n8n', false, true, true, 20, '{"type":"object","properties":{"message_id":{"type":"string"}},"required":["message_id"]}'::jsonb),
  ('cs_followup_unanswered', 'Follow Up on Unanswered', 'Send a gentle follow-up to threads idle >48h.', 'customer_support', 'n8n', true, true, true, 30, '{"type":"object","properties":{"hours_idle":{"type":"integer","default":48}}}'::jsonb),
  ('cs_escalate_to_owner', 'Escalate to Antonio', 'Push escalation note + thread link to admin Telegram.', 'customer_support', 'n8n', false, true, true, 40, '{"type":"object","properties":{"conversation_id":{"type":"string"},"reason":{"type":"string"}},"required":["conversation_id"]}'::jsonb),

  ('campaign_send_blast', 'Send Email Blast', 'Render template + send to a segment via Resend.', 'campaigns', 'n8n', true, true, true, 10, '{"type":"object","properties":{"segment_id":{"type":"string"},"template_key":{"type":"string"}},"required":["segment_id","template_key"]}'::jsonb),
  ('campaign_sms_reminder', 'SMS Reminder Burst', 'Send SMS to a segment via Twilio/GHL fallback.', 'campaigns', 'n8n', true, true, true, 20, '{"type":"object","properties":{"segment_id":{"type":"string"},"body":{"type":"string","maxLength":320}},"required":["segment_id","body"]}'::jsonb),
  ('campaign_nurture_kickoff', 'Kick Off Nurture Sequence', 'Enroll a contact in a multi-touch nurture.', 'campaigns', 'n8n', false, true, true, 30, '{"type":"object","properties":{"contact_id":{"type":"string"},"sequence_key":{"type":"string"}},"required":["contact_id","sequence_key"]}'::jsonb),
  ('campaign_winback_lapsed', 'Win Back Lapsed Members', 'Target members inactive >30d with reactivation offer.', 'campaigns', 'n8n', true, true, true, 40, '{"type":"object","properties":{"days_inactive":{"type":"integer","default":30}}}'::jsonb),

  ('editorial_draft_post', 'Draft Social Post', 'Generate a draft social post for approval.', 'editorial', 'n8n', true, true, true, 10, '{"type":"object","properties":{"topic":{"type":"string"},"platform":{"type":"string","enum":["instagram","facebook","linkedin","twitter"]}},"required":["topic","platform"]}'::jsonb),
  ('editorial_repurpose_long_form', 'Repurpose Long-Form Content', 'Break a blog/podcast into multi-platform pieces.', 'editorial', 'n8n', true, true, true, 20, '{"type":"object","properties":{"source_url":{"type":"string"}},"required":["source_url"]}'::jsonb),
  ('editorial_weekly_newsletter', 'Compose Weekly Newsletter', 'Pull this week''s milestones + draft newsletter.', 'editorial', 'n8n', true, true, true, 30, '{}'::jsonb),

  ('admin_sync_skool_tiers', 'Sync Skool Tiers', 'Reconcile Skool membership tiers with Paige contacts.', 'admin', 'n8n', false, true, true, 10, '{}'::jsonb),
  ('admin_reconcile_stripe', 'Reconcile Stripe Subscriptions', 'Pull active subs + repair tier drift.', 'admin', 'n8n', false, true, true, 20, '{}'::jsonb),
  ('admin_export_contacts_csv', 'Export Contacts CSV', 'Generate signed CSV of contacts.', 'admin', 'n8n', false, true, true, 30, '{"type":"object","properties":{"segment_id":{"type":"string"}}}'::jsonb),
  ('admin_backfill_enrichment', 'Backfill Apollo Enrichment', 'Run Apollo enrichment on contacts missing it.', 'admin', 'n8n', false, true, true, 40, '{"type":"object","properties":{"limit":{"type":"integer","default":50}}}'::jsonb),
  ('admin_purge_test_data', 'Purge Test Data', 'Delete contacts tagged "test". Requires approval.', 'admin', 'n8n', true, true, true, 50, '{}'::jsonb),

  ('funding_score_refresh', 'Refresh Funding Readiness Scores', 'Recalculate funding-readiness for all active members.', 'funding', 'n8n', false, true, true, 10, '{}'::jsonb),
  ('funding_match_run', 'Run Funding Match', 'Match a member to current lender products.', 'funding', 'n8n', false, true, true, 20, '{"type":"object","properties":{"user_id":{"type":"string"}},"required":["user_id"]}'::jsonb),

  ('obs_brain_health_check', 'Brain Health Check', 'LangGraph cron — knowledge-base coherence + retrieval quality.', 'observability', 'cron_only', false, false, true, 10, '{}'::jsonb),
  ('obs_workflow_run_digest', 'Daily Workflow Run Digest', 'Summarize yesterday''s runs + failures to Telegram.', 'observability', 'n8n', false, true, true, 20, '{}'::jsonb),
  ('obs_error_spike_alert', 'Sentry Error Spike Alert', 'Watch Sentry for spikes and alert admin.', 'observability', 'n8n', false, true, true, 30, '{}'::jsonb),

  ('direct_send_message', 'Send Message (Email/SMS)', 'Direct call to send-message edge function. Used by Paige to dispatch.', 'admin', 'direct_edge_function', false, false, true, 60, '{"type":"object","properties":{"to":{"type":"string"},"channel":{"type":"string","enum":["email","sms"]},"body":{"type":"string"}},"required":["to","channel","body"]}'::jsonb),
  ('direct_trigger_credit_pull', 'Trigger Credit Pull', 'Direct call to credit verification function.', 'admin', 'direct_edge_function', true, false, true, 70, '{"type":"object","properties":{"user_id":{"type":"string"}},"required":["user_id"]}'::jsonb)
ON CONFLICT (key) DO NOTHING;

UPDATE public.paige_workflow_registry SET direct_function_name='send-message' WHERE key='direct_send_message' AND direct_function_name IS NULL;
UPDATE public.paige_workflow_registry SET direct_function_name='credit-verification-initiate' WHERE key='direct_trigger_credit_pull' AND direct_function_name IS NULL;
UPDATE public.paige_workflow_registry SET langgraph_graph_id='brain_health_monitor' WHERE key='obs_brain_health_check' AND langgraph_graph_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pwr_category_sort ON public.paige_workflow_registry(category, sort_order, label);
