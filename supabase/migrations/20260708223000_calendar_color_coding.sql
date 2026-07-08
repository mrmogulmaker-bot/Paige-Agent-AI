-- ---------------------------------------------------------------------------
-- Calendar color-coding.
-- ---------------------------------------------------------------------------
-- Owner directive: "color coding everything." A calendar carries a color so the
-- agenda/grid can color-code each calendar (and, by inheritance, its events).
-- The color seeds from the tenant brand palette in the UI but is stored per
-- calendar so a campaign calendar can stand out. Hex string, validated in-app.

ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN public.calendars.color IS
  'Hex color (e.g. #EBB94C) for color-coding this calendar in the agenda/grid. Null = inherit tenant accent.';
