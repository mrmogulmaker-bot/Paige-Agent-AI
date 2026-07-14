-- Recovered from the live migration ledger (supabase_migrations.schema_migrations.statements)
-- and committed for durability: this migration is APPLIED on prod but existed in no git file,
-- so a rebuild-from-git would silently drop it (drift audit 2026-07-14, prod-ahead-of-git).
-- SQL is verbatim from the ledger unless a marked adjustment note says otherwise.

-- White-label customization for a host's public booking page. Base brand
-- (name/logo/color) comes from the tenant; these let each host tailor copy + accent.
ALTER TABLE public.staff_calendar_settings
  ADD COLUMN IF NOT EXISTS booking_page_title text,
  ADD COLUMN IF NOT EXISTS booking_page_description text,
  ADD COLUMN IF NOT EXISTS booking_page_accent text;
