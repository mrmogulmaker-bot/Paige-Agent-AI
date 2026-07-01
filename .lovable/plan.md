# Calendar + Inbox Overhaul

## Ship Order

### Phase 1 — Dissolve Inbox (this turn, quick)
- Remove **Inbox** hub from `AdminLayout.tsx` global nav
- Move **Support** route to live under `Settings → Support` (keep `/admin/support` mounted for back-compat)
- Add a **"My Conversations"** widget to the admin dashboard (unread + last-touched, jumps to per-contact Comms tab)
- Per-contact Conversations tab already exists — verify realtime subscription

### Phase 2 — Personal Calendar (main build)

#### 2A. Rename + reroute
- `Bookings → Calendar` everywhere (labels, icon, sidebar)
- New primary route `/admin/calendar`; `/admin/bookings` becomes alias

#### 2B. Database
Two new tables (both tenant + user scoped, RLS):

**`staff_calendar_settings`** (one row per staff user_id)
- `google_calendar_connected` (bool), `google_refresh_token_encrypted`, `google_calendar_id`, `google_sync_token`
- `apple_caldav_url`, `apple_caldav_username`, `apple_app_password_encrypted` (Apple has no OAuth — uses CalDAV + app-specific password from appleid.apple.com)
- `booking_page_slug` (unique), `default_meeting_duration_min`, `availability_json` (weekly windows), `buffer_before_min`, `buffer_after_min`, `timezone`, `is_bookable` (bool)

**`internal_bookings`** (native bookings)
- `tenant_id`, `host_user_id`, `contact_id` (nullable), `guest_email`, `guest_name`
- `start_at`, `end_at`, `title`, `notes`, `status` (scheduled/cancelled/completed)
- `meeting_link`, `source` ('internal' | 'calendly' | 'google' | 'apple'), `external_event_id`
- RLS: host + tenant admins can manage; guest can view via signed link

#### 2C. Per-user Google Calendar OAuth
Google Calendar connector is workspace-scoped (all bookings on one calendar). For **each staff member's own calendar** we need per-user OAuth:
- New Edge Function `google-calendar-oauth-start` → returns Google authorization URL with `state = user_id + tenant_id`, scope `calendar.events`
- New Edge Function `google-calendar-oauth-callback` → exchanges code, encrypts + stores refresh token in `staff_calendar_settings`
- New Edge Function `google-calendar-sync` → uses refresh token to pull events (incremental via `syncToken`) into `internal_bookings` as `source='google'`
- Requires `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` secrets — Google Cloud Console credentials (I'll request via `add_secret` when Phase 2 starts). User provides these once; then every staff member connects their own account.

#### 2D. Apple Calendar (CalDAV)
- Staff enters iCloud email + app-specific password (generated at appleid.apple.com)
- Edge Function `apple-caldav-sync` uses CalDAV protocol (`caldav.icloud.com`) via `tsdav` npm package to read + write events
- Same `internal_bookings` table, `source='apple'`

#### 2E. UI
**`/admin/calendar` page** — 3 tabs:
1. **My Calendar** — week/month view (`react-big-calendar` or custom), shows internal + Google + Apple events overlaid, click-to-create
2. **Team Calendar** — org view with filter chips per staff member (RBAC-respecting)
3. **My Booking Page** — public URL `paigeagent.ai/book/{slug}`, availability editor, connect Google/Apple buttons

**Per-contact "Schedule" tab** (new tab in ContactDetail)
- One-click "Book with [assigned coach]" → creates internal booking + syncs to coach's connected calendars

**Public booking page** `/book/{staff-slug}`
- Timezone-aware slot picker respecting `availability_json` + buffers, cross-checked against connected calendars for real free/busy
- Writes to `internal_bookings`, sends confirmation via `send-transactional-email` with tenant branding, pushes event to connected Google/Apple

#### 2F. MCP tools (added to `paige-mcp`)
- `list_my_calendar_events(from, to)` — read connected calendars
- `create_calendar_event(title, start, end, attendee_email?, contact_id?)` — writes to internal_bookings + pushes to connected Google/Apple
- `cancel_calendar_event(event_id)` — cancels + syncs
- `get_staff_availability(user_id, date_range)` — returns free slots
- All scoped under `calendar.read` / `calendar.write`; auto-granted to Tenant Admins, Coaches, Sales Reps

## Technical Details

**Encryption:** Google refresh tokens + Apple app passwords encrypted with `pgsodium` using existing project encryption pattern (same as `_internal_secrets` table).

**Realtime:** `internal_bookings` gets Realtime enabled; staff dashboard shows live booking notifications.

**Sync cadence:** Google incremental sync via `syncToken` (webhook where possible, otherwise 5-min pg_cron). Apple CalDAV polled every 10 min via pg_cron.

**Secrets needed (Phase 2 start):**
- `GOOGLE_OAUTH_CLIENT_ID` — from Google Cloud Console → Credentials → OAuth 2.0 Client ID (Web application)
- `GOOGLE_OAUTH_CLIENT_SECRET` — same location
- Redirect URI to configure in Google Console: `https://paigeagent.ai/auth/google-calendar/callback`

## Confirmation

Ready to ship Phase 1 immediately (Inbox dissolution — small, safe). Phase 2 has ~15 files + 2 migrations + 4 edge functions + Google Console setup.

Confirm and I'll ship Phase 1 this turn, then request the Google OAuth secrets to kick off Phase 2.