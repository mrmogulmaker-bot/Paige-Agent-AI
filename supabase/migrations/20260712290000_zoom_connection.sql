-- Per-HOST Zoom connection, mirrored on staff_calendar_settings exactly like the
-- google_* columns. A host connects THEIR OWN Zoom account (§9 tenant/host-scoped);
-- when a client books, Paige mints the meeting on that host's Zoom and drops the
-- join link into the confirmation. Tokens are stored ENCRYPTED at rest (§13) via
-- _shared/calendarCrypto.ts — never plaintext. All columns nullable / default-off so
-- existing rows and unconnected hosts are unaffected, and a Zoom failure never blocks
-- a booking (best-effort mint falls back to the 'link to follow' label).

ALTER TABLE public.staff_calendar_settings
  ADD COLUMN IF NOT EXISTS zoom_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zoom_user_id text,
  ADD COLUMN IF NOT EXISTS zoom_email text,
  ADD COLUMN IF NOT EXISTS zoom_refresh_token_encrypted text,
  ADD COLUMN IF NOT EXISTS zoom_access_token_encrypted text,
  ADD COLUMN IF NOT EXISTS zoom_token_expires_at timestamptz;

COMMENT ON COLUMN public.staff_calendar_settings.zoom_connected IS
  'True when this host has connected their own Zoom account (User-managed OAuth).';
COMMENT ON COLUMN public.staff_calendar_settings.zoom_user_id IS
  'Zoom user id (from GET /v2/users/me) for the connected host account.';
COMMENT ON COLUMN public.staff_calendar_settings.zoom_email IS
  'Email of the connected Zoom account, shown in the Connectors panel.';
COMMENT ON COLUMN public.staff_calendar_settings.zoom_refresh_token_encrypted IS
  'AES-GCM ciphertext (calendarCrypto.encryptSecret) of the Zoom refresh token. Rotates on refresh.';
COMMENT ON COLUMN public.staff_calendar_settings.zoom_access_token_encrypted IS
  'AES-GCM ciphertext (calendarCrypto.encryptSecret) of the current Zoom access token (~1h).';
COMMENT ON COLUMN public.staff_calendar_settings.zoom_token_expires_at IS
  'When the stored Zoom access token expires; getFreshZoomToken refreshes past this.';

-- Ciphertext token columns must never reach the client (mirror the google_* revoke).
REVOKE SELECT (zoom_refresh_token_encrypted, zoom_access_token_encrypted)
  ON public.staff_calendar_settings FROM anon, authenticated;

-- LANE B — per-booking Zoom meeting handle. When a 'zoom' calendar's assigned
-- host has a live connection, public-booking mints the meeting on their account
-- and stamps the real join link + Zoom meeting id onto the booking; booking-manage
-- reads zoom_meeting_id to move it (reschedule) or delete it (cancel). Both
-- nullable/default-null so a Zoom-less booking (and every existing row) is
-- unaffected. meeting_url is the resolved join link; location_value is also set to
-- it for surfaces that read that field.
ALTER TABLE public.internal_bookings
  ADD COLUMN IF NOT EXISTS meeting_url text,
  ADD COLUMN IF NOT EXISTS zoom_meeting_id text;

COMMENT ON COLUMN public.internal_bookings.meeting_url IS
  'Resolved video meeting join URL (e.g. the host-account Zoom link minted at booking).';
COMMENT ON COLUMN public.internal_bookings.zoom_meeting_id IS
  'Zoom meeting id for the meeting minted on the host account, so it can be moved on reschedule / deleted on cancel.';
