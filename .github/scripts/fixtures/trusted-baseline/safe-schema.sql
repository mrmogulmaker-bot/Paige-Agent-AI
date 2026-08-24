-- Synthetic schema only. This comment must not survive sanitization.
CREATE SCHEMA public;

CREATE TABLE public.example_accounts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.example_accounts ENABLE ROW LEVEL SECURITY;
CREATE INDEX example_accounts_tenant_idx ON public.example_accounts (tenant_id);
