ALTER TABLE public.business_public_presence
  ADD COLUMN listyourself_url text,
  ADD COLUMN listyourself_name_match boolean DEFAULT false,
  ADD COLUMN listyourself_address_match boolean DEFAULT false,
  ADD COLUMN listyourself_phone_match boolean DEFAULT false;