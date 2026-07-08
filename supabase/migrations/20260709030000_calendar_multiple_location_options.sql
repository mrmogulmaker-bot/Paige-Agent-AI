-- Let a calendar offer MULTIPLE meeting methods; the invitee picks one at booking.
-- Source of truth becomes location_options = [{type, value?}, ...]. When it holds
-- one entry the meeting is fixed; more than one → the invitee chooses.
-- location_type/location_value stay for back-compat (and store the CHOSEN method
-- on each booking row).
ALTER TABLE public.calendars ADD COLUMN IF NOT EXISTS location_options jsonb;

UPDATE public.calendars SET location_options =
  CASE
    WHEN location_type = 'ask_invitee'
      THEN '[{"type":"google_meet"},{"type":"zoom"},{"type":"phone"}]'::jsonb
    ELSE jsonb_build_array(
      jsonb_build_object('type', coalesce(location_type, 'google_meet'))
      || CASE WHEN location_value IS NOT NULL AND location_value <> ''
              THEN jsonb_build_object('value', location_value) ELSE '{}'::jsonb END
    )
  END
WHERE location_options IS NULL;
