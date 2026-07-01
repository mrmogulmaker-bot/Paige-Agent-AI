-- Collapse post-agreement onboarding stages into 'completed' so any client who
-- has already signed the agreement lands directly in the workspace. The intake
-- and document collection now happens inside the portal under Paige's guidance.
UPDATE public.clients
SET
  onboarding_stage = 'completed',
  onboarding_completed_at = COALESCE(onboarding_completed_at, agreement_signed_at, now()),
  updated_at = now()
WHERE agreement_signed_at IS NOT NULL
  AND onboarding_stage IN ('accepting_payment', 'completing_intake', 'uploading_docs');
