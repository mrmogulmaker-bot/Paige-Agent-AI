
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS dispute_round integer DEFAULT NULL;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS round_submitted_at timestamptz DEFAULT NULL;

ALTER TABLE public.dispute_letters ADD COLUMN IF NOT EXISTS dispute_round integer DEFAULT NULL;
ALTER TABLE public.dispute_letters ADD COLUMN IF NOT EXISTS bureau text DEFAULT NULL;
ALTER TABLE public.dispute_letters ADD COLUMN IF NOT EXISTS dispute_ids text[] DEFAULT NULL;
