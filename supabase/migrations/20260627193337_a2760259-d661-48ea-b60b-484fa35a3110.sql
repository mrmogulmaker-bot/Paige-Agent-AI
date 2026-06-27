ALTER TABLE public.paige_workflow_registry
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.paige_n8n_connections(id) ON DELETE SET NULL,
  ALTER COLUMN n8n_webhook_url DROP NOT NULL;