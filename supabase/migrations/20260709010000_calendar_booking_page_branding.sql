-- Owner-controllable public booking-page presentation (GHL-style widget):
--   theme            — 'light' | 'dark' page
--   subtitle         — the small category line above the title ("One on One Coaching")
--   show_company_name — whether to render the brand/company name next to the logo
-- logo_url, accent, title, description already exist on calendars.
ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'light',
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS show_company_name boolean NOT NULL DEFAULT true;

ALTER TABLE public.calendars DROP CONSTRAINT IF EXISTS calendars_theme_chk;
ALTER TABLE public.calendars ADD CONSTRAINT calendars_theme_chk CHECK (theme IN ('light','dark'));
