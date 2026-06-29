
ALTER TABLE public.tenant_prices
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS installments_total integer,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.tenant_prices DROP CONSTRAINT IF EXISTS tenant_prices_kind_check;
ALTER TABLE public.tenant_prices
  ADD CONSTRAINT tenant_prices_kind_check
  CHECK (kind IN ('one_time','deposit','recurring','installment'));
