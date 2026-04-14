-- Add original_amount to credit_accounts
ALTER TABLE public.credit_accounts
ADD COLUMN IF NOT EXISTS original_amount numeric NULL;

-- Add original_amount to credit_negative_items
ALTER TABLE public.credit_negative_items
ADD COLUMN IF NOT EXISTS original_amount numeric NULL;

COMMENT ON COLUMN public.credit_accounts.original_amount IS 'Original loan amount or high credit for installment/auto/mortgage accounts — used for comparable credit projections';
COMMENT ON COLUMN public.credit_negative_items.original_amount IS 'Original amount owed before charge-off or collection';