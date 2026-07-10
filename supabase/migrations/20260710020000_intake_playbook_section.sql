-- The client onboarding now saves the tenant's Playbook intake answers under
-- section 'playbook_intake', but paige_client_intake_submissions' CHECK only
-- allowed the legacy funding sections — so the save (and thus onboarding) failed
-- for any tenant with intake questions. Add 'playbook_intake' to the allowed set.
ALTER TABLE public.paige_client_intake_submissions
  DROP CONSTRAINT IF EXISTS paige_client_intake_submissions_section_check;
ALTER TABLE public.paige_client_intake_submissions
  ADD CONSTRAINT paige_client_intake_submissions_section_check
  CHECK (section IN ('about_you', 'business', 'current_state', 'docs_checklist', 'playbook_intake'));
