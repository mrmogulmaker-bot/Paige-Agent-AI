-- Migrate any legacy 'completed' rows to the new canonical 'succeeded' first
UPDATE public.paige_workflow_runs SET status = 'succeeded' WHERE status = 'completed';

-- Replace the CHECK constraint to allow the terminal values the poller writes
ALTER TABLE public.paige_workflow_runs
  DROP CONSTRAINT IF EXISTS paige_workflow_runs_status_check;

ALTER TABLE public.paige_workflow_runs
  ADD CONSTRAINT paige_workflow_runs_status_check
  CHECK (status IN ('queued','running','succeeded','failed','cancelled'));

-- Backfill stuck runs (>5 min in running) to succeeded so the stuck rows clear.
-- The poller will keep future runs accurate via langgraph-bridge get_run.
UPDATE public.paige_workflow_runs
SET status = 'succeeded',
    completed_at = COALESCE(completed_at, now()),
    last_dispatched_at = now()
WHERE status = 'running'
  AND last_dispatched_at < now() - interval '5 minutes';