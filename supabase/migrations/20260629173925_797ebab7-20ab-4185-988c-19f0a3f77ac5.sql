
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS offer_type text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS primary_offer text;
COMMENT ON COLUMN public.deals.offer_type IS 'Productized offer the contact is buying/considering (e.g. BTF, Premium, VIP, ACCEL, BUILD, FUND).';
COMMENT ON COLUMN public.clients.primary_offer IS 'Primary product/offer this contact is enrolled in or pursuing.';
