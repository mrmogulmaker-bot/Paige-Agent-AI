
-- 1) paige_subagents: drop broad authenticated read
DROP POLICY IF EXISTS "Authenticated read enabled subagents" ON public.paige_subagents;

-- 2) paige_skills: drop coach-wide read
DROP POLICY IF EXISTS "Coaches view active skills" ON public.paige_skills;

-- 3) paige_subagent_proposals: scope coach read to own proposals
DROP POLICY IF EXISTS "coaches read proposals" ON public.paige_subagent_proposals;
CREATE POLICY "coaches read own proposals"
  ON public.paige_subagent_proposals
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (public.has_role(auth.uid(), 'coach'::public.app_role) AND proposed_by = auth.uid())
  );

-- 4) paige_workflow_registry: hide sensitive columns from non-admins via column privileges
REVOKE SELECT (n8n_webhook_url, direct_function_name) ON public.paige_workflow_registry FROM anon, authenticated;
GRANT  SELECT (n8n_webhook_url, direct_function_name) ON public.paige_workflow_registry TO service_role;
