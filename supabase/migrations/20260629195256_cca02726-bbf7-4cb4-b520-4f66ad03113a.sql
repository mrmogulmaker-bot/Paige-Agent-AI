
-- Track LangGraph bridge thread id + retry attempts on workflow runs
ALTER TABLE public.paige_workflow_runs
  ADD COLUMN IF NOT EXISTS langgraph_thread_id text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dispatched_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_paige_workflow_runs_status_dispatch
  ON public.paige_workflow_runs (status, last_dispatched_at);

-- Allow new provider value via existing text column (no enum constraint to change).
COMMENT ON COLUMN public.paige_workflow_runs.langgraph_thread_id IS
  'LangGraph thread id returned by MMA OS langgraph-bridge or direct langgraph /runs response.';
