-- ============ ASSERTION MATRIX (aborts on first FAIL via ON_ERROR_STOP) ============
\set ON_ERROR_STOP on

create or replace function pg_temp.expect_code(_sql text, _code text) returns void language plpgsql as $$
declare _ok boolean := false;
begin
  begin execute _sql; _ok := true;
  exception when others then
    if sqlstate = _code then raise notice 'PASS expect % : %', _code, left(_sql,72); return;
    else raise exception 'FAIL got % (%) want % :: %', sqlstate, sqlerrm, _code, left(_sql,72); end if;
  end;
  if _ok then raise exception 'FAIL expected % but call succeeded: %', _code, left(_sql,72); end if;
end $$;

create or replace function pg_temp.expect_ok(_sql text) returns void language plpgsql as $$
begin execute _sql; raise notice 'PASS ok     : %', left(_sql,72);
exception when others then raise exception 'FAIL unexpected % (%) : %', sqlstate, sqlerrm, left(_sql,72); end $$;

create or replace function pg_temp.assert(_cond boolean, _label text) returns void language plpgsql as $$
begin if _cond then raise notice 'PASS assert : %', _label; else raise exception 'FAIL assert : %', _label; end if; end $$;

set app.platform_admin = 'false';

-- T1 — member (coach) self-creates a DRAFT; creator becomes host; draft-by-default.
set app.uid = '33333333-3333-3333-3333-333333333333';
select pg_temp.expect_ok($$select public.create_calendar_preset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p-one','{"type":"personal","title":"Intro","availability_json":[{"day":1,"start":"09:00","end":"17:00"}]}'::jsonb)$$);
select pg_temp.assert((select enabled = false and published_at is null from public.calendars where slug='p-one'), 'T1 draft-by-default: enabled=false, published_at NULL');
select pg_temp.assert((select exists(select 1 from public.calendar_hosts h join public.calendars c on c.id=h.calendar_id where c.slug='p-one' and h.user_id='33333333-3333-3333-3333-333333333333')), 'T1 creator registered as host');
select pg_temp.assert((select exists(select 1 from public.audit_logs where action='create_calendar_preset')), 'T1 audit row written');

-- T2 — a member of A may NOT create for tenant B (42501).
select pg_temp.expect_code($$select public.create_calendar_preset('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','p-b','{}'::jsonb)$$, '42501');

-- T3 — admin of A creates further drafts.
set app.uid = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_ok($$select public.create_calendar_preset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p-two','{"availability_json":[{"day":1,"start":"09:00","end":"17:00"}]}'::jsonb)$$);

-- T4 — duplicate slug is a clean 23505.
select pg_temp.expect_code($$select public.create_calendar_preset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p-one','{}'::jsonb)$$, '23505');

-- T5 — publish REFUSED with no open window; the preset stays a draft.
select pg_temp.expect_ok($$select public.create_calendar_preset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p-nowin','{"type":"personal"}'::jsonb)$$);
select pg_temp.expect_code($$select public.publish_calendar_preset((select id from public.calendars where slug='p-nowin'))$$, '22023');
select pg_temp.assert((select enabled=false from public.calendars where slug='p-nowin'), 'T5 refused publish left it a draft');

-- T6 — round_robin with ONE host is refused (honesty floor: needs >=2).
select pg_temp.expect_ok($$select public.create_calendar_preset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p-rr','{"type":"round_robin","availability_json":[{"day":1,"start":"09:00","end":"17:00"}]}'::jsonb)$$);
select pg_temp.expect_code($$select public.publish_calendar_preset((select id from public.calendars where slug='p-rr'))$$, '22023');
-- add a second host -> now it publishes.
insert into public.calendar_hosts(calendar_id,user_id,priority) select id,'66666666-6666-6666-6666-666666666666',1 from public.calendars where slug='p-rr';
select pg_temp.expect_ok($$select public.publish_calendar_preset((select id from public.calendars where slug='p-rr'))$$);
select pg_temp.assert((select enabled=true and published_at is not null from public.calendars where slug='p-rr'), 'T6 round_robin publishes only with >=2 hosts');

-- T7 — personal preset with window + default method + creator host publishes LIVE.
select pg_temp.expect_ok($$select public.publish_calendar_preset((select id from public.calendars where slug='p-one'))$$);
select pg_temp.assert((select enabled=true and published_at is not null from public.calendars where slug='p-one'), 'T7 personal publishes live (enabled=true, published_at set)');

-- T8 — republish is idempotent and preserves the original published_at.
do $$
declare _before timestamptz; _after timestamptz;
begin
  select published_at into _before from public.calendars where slug='p-one';
  perform public.publish_calendar_preset((select id from public.calendars where slug='p-one'));
  select published_at into _after from public.calendars where slug='p-one';
  if _before is distinct from _after then raise exception 'FAIL assert : T8 republish changed published_at % -> %', _before, _after; end if;
  raise notice 'PASS assert : T8 republish keeps original published_at';
end $$;

-- T9 — pause a live preset: enabled=false but published_at RETAINED (Paused, not Draft).
select pg_temp.expect_ok($$select public.pause_calendar_preset((select id from public.calendars where slug='p-one'))$$);
select pg_temp.assert((select enabled=false and published_at is not null from public.calendars where slug='p-one'), 'T9 pause keeps published_at -> Paused distinguishable from Draft');

-- T10 — update applies config; can NEVER flip enabled/published_at/slug (not in allowlist).
select pg_temp.expect_ok($$select public.update_calendar_preset((select id from public.calendars where slug='p-two'), '{"title":"Renamed","enabled":true,"published_at":"2020-01-01T00:00:00Z"}'::jsonb)$$);
select pg_temp.assert((select title='Renamed' and enabled=false and published_at is null and slug='p-two' from public.calendars where slug='p-two'), 'T10 update changes config only; enabled/published_at/slug immune');

-- T11 — owner of B cannot manage A''s preset (42501 on every lifecycle verb).
set app.uid = '55555555-5555-5555-5555-555555555555';
select pg_temp.expect_code($$select public.update_calendar_preset((select id from public.calendars where slug='p-two'), '{"title":"x"}'::jsonb)$$, '42501');
select pg_temp.expect_code($$select public.publish_calendar_preset((select id from public.calendars where slug='p-two'))$$, '42501');
select pg_temp.expect_code($$select public.pause_calendar_preset((select id from public.calendars where slug='p-two'))$$, '42501');

-- T12 — a platform admin manages across tenants.
set app.platform_admin = 'true';
select pg_temp.expect_ok($$select public.update_calendar_preset((select id from public.calendars where slug='p-two'), '{"title":"By operator"}'::jsonb)$$);
select pg_temp.assert((select title='By operator' from public.calendars where slug='p-two'), 'T12 platform admin manages cross-tenant');
set app.platform_admin = 'false';

-- T13 — service role (auth.uid() NULL): trusted only for the tenant it names.
set app.uid = '';
select pg_temp.expect_ok($$select public.create_calendar_preset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p-svc','{"availability_json":[{"day":1,"start":"09:00","end":"17:00"}]}'::jsonb, '33333333-3333-3333-3333-333333333333')$$);
select pg_temp.assert((select exists(select 1 from public.calendar_hosts h join public.calendars c on c.id=h.calendar_id where c.slug='p-svc' and h.user_id='33333333-3333-3333-3333-333333333333')), 'T13 service-role create registers the passed creator as host');
select pg_temp.expect_ok($$select public.publish_calendar_preset((select id from public.calendars where slug='p-svc'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$);
select pg_temp.expect_code($$select public.publish_calendar_preset((select id from public.calendars where slug='p-two'), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$, '42501');
select pg_temp.expect_code($$select public.publish_calendar_preset((select id from public.calendars where slug='p-two'), NULL)$$, '42501');

-- T14 — a plain member who is neither creator nor admin cannot manage (42501).
set app.uid = '44444444-4444-4444-4444-444444444444';
select pg_temp.expect_code($$select public.update_calendar_preset((select id from public.calendars where slug='p-one'), '{"title":"x"}'::jsonb)$$, '42501');

-- T15 — a missing preset is a clean P0002, not a silent no-op.
set app.uid = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_code($$select public.publish_calendar_preset('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$, 'P0002');

-- T16 — the migration's OWN backfill set published_at on the pre-existing enabled
-- row (seeded before the migration ran), to created_at (not now()).
select pg_temp.assert(
  (select published_at is not null from public.calendars where slug='p-preexisting')
  and (select published_at = created_at from public.calendars where slug='p-preexisting'),
  'T16 migration backfill: a pre-existing enabled preset reads as published (=created_at), never Draft');

-- T17 — get_calendar_presets: tenant-scoped read + correct derived lifecycle.
set app.uid = '22222222-2222-2222-2222-222222222222';
select pg_temp.assert(
  (select count(*) from public.get_calendar_presets('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) >= 5,
  'T17 admin reads the tenant''s presets');
select pg_temp.assert(
  (select lifecycle from public.get_calendar_presets('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') where slug='p-one') = 'paused',
  'T17 p-one derives as Paused (enabled=false, published_at set)');
select pg_temp.assert(
  (select lifecycle from public.get_calendar_presets('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') where slug='p-rr') = 'live',
  'T17 p-rr derives as Live');
select pg_temp.assert(
  (select lifecycle from public.get_calendar_presets('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') where slug='p-nowin') = 'draft',
  'T17 p-nowin derives as Draft (never published)');
-- cross-tenant read refused
set app.uid = '55555555-5555-5555-5555-555555555555';
select pg_temp.expect_code($$select * from public.get_calendar_presets('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$, '42501');
-- service-role read is trusted for the named tenant and scoped to it
set app.uid = '';
select pg_temp.assert(
  (select count(*) from public.get_calendar_presets('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')) = 0
  and (select count(*) from public.get_calendar_presets('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) >= 5,
  'T17 service-role read is scoped to the named tenant only');

-- T18 — the public /book/:slug resolver gates on exactly `enabled = true`
-- (public-booking/index.ts:427). This mirrors that predicate to prove neither a
-- Draft (p-nowin, never published) nor a Paused (p-one) preset is admitted — the
-- end-to-end "not publicly bookable" guarantee, at the DB layer the resolver reads.
select pg_temp.assert(
  (select count(*) from public.calendars where slug='p-nowin' and enabled = true) = 0
  and (select count(*) from public.calendars where slug='p-one' and enabled = true) = 0,
  'T18 resolver gate (enabled=true) admits neither a Draft (p-nowin) nor a Paused (p-one) preset');

-- ============================================================================
-- MAJOR-fix assertions (§39 adversarial finding): update_calendar_preset must not
-- be able to leave a LIVE preset unbookable. publish and the update auto-pause gate
-- now share ONE bar (_calendar_preset_block_reason), so the two write paths cannot
-- drift. These prove the shared bar and the auto-pause behaviour end to end.
-- ============================================================================
set app.uid = '22222222-2222-2222-2222-222222222222';

-- T19 — editing a LIVE preset below the publish bar AUTO-PAUSES it (§13/§32/§70):
-- a Live public page that an edit makes unbookable is taken off the air rather than
-- left showing a visitor nothing to book. enabled=false, published_at RETAINED.
select pg_temp.expect_ok($$select public.create_calendar_preset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p-live-edit','{"type":"personal","title":"Edit me","availability_json":[{"day":1,"start":"09:00","end":"17:00"}]}'::jsonb)$$);
select pg_temp.expect_ok($$select public.publish_calendar_preset((select id from public.calendars where slug='p-live-edit'))$$);
select pg_temp.assert((select enabled=true from public.calendars where slug='p-live-edit'), 'T19 preset is Live before the breaking edit');
do $$
declare _r jsonb;
begin
  select public.update_calendar_preset((select id from public.calendars where slug='p-live-edit'), '{"availability_json":[]}'::jsonb) into _r;
  if not coalesce((_r->>'auto_paused')::boolean, false) then raise exception 'FAIL assert : T19 breaking edit did not report auto_paused (got %)', _r; end if;
  if coalesce(_r->>'reason','') not like 'PRESET_NO_HOURS%' then raise exception 'FAIL assert : T19 auto_pause reason wrong: %', _r->>'reason'; end if;
  raise notice 'PASS assert : T19 breaking edit returns auto_paused=true with the blocking reason';
end $$;
select pg_temp.assert((select enabled=false and published_at is not null from public.calendars where slug='p-live-edit'), 'T19 auto-paused: enabled=false, published_at RETAINED (reads as Paused, not Draft)');

-- T20 — a NON-breaking edit to a Live preset leaves it Live (auto_paused=false).
select pg_temp.expect_ok($$select public.create_calendar_preset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p-live-ok','{"type":"personal","title":"Keep me live","availability_json":[{"day":1,"start":"09:00","end":"17:00"}]}'::jsonb)$$);
select pg_temp.expect_ok($$select public.publish_calendar_preset((select id from public.calendars where slug='p-live-ok'))$$);
do $$
declare _r jsonb;
begin
  select public.update_calendar_preset((select id from public.calendars where slug='p-live-ok'), '{"title":"Renamed but still bookable"}'::jsonb) into _r;
  if coalesce((_r->>'auto_paused')::boolean, false) then raise exception 'FAIL assert : T20 valid edit wrongly auto-paused: %', _r->>'reason'; end if;
  raise notice 'PASS assert : T20 valid edit to a Live preset keeps it Live (auto_paused=false)';
end $$;
select pg_temp.assert((select enabled=true and title='Renamed but still bookable' from public.calendars where slug='p-live-ok'), 'T20 Live preset stays Live after a valid, still-bookable edit');

-- T21 — editing a DRAFT never triggers auto-pause (only a Live preset can be paused).
do $$
declare _r jsonb;
begin
  select public.update_calendar_preset((select id from public.calendars where slug='p-nowin'), '{"title":"still a draft"}'::jsonb) into _r;
  if coalesce((_r->>'auto_paused')::boolean, false) then raise exception 'FAIL assert : T21 a Draft update reported auto_paused'; end if;
  raise notice 'PASS assert : T21 editing a Draft does not auto-pause';
end $$;
select pg_temp.assert((select enabled=false and published_at is null from public.calendars where slug='p-nowin'), 'T21 Draft stays a Draft after an edit');

-- T22 — a malformed group_id is refused with a tagged 22023, never a raw 22P02;
-- an empty group_id is allowed (it clears the group), not refused.
select pg_temp.expect_code($$select public.update_calendar_preset((select id from public.calendars where slug='p-two'), '{"group_id":"not-a-uuid"}'::jsonb)$$, '22023');
select pg_temp.expect_ok($$select public.update_calendar_preset((select id from public.calendars where slug='p-two'), '{"group_id":""}'::jsonb)$$);

-- T23 — publish routes through the ONE bar, which is STRICTER than the old inline
-- check: a bare `ask_invitee` (no concrete option to offer) is NOT a usable method,
-- so publish refuses it (§13 — do not present a page that asks a guest to pick from
-- nothing). This is a deliberate tightening the old publish path would have allowed.
select pg_temp.expect_ok($$select public.create_calendar_preset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p-ask','{"type":"personal","location_type":"ask_invitee","location_options":[],"availability_json":[{"day":1,"start":"09:00","end":"17:00"}]}'::jsonb)$$);
select pg_temp.expect_code($$select public.publish_calendar_preset((select id from public.calendars where slug='p-ask'))$$, '22023');
-- adding one concrete option makes it publishable.
select pg_temp.expect_ok($$select public.update_calendar_preset((select id from public.calendars where slug='p-ask'), '{"location_options":[{"type":"phone","value":null}]}'::jsonb)$$);
select pg_temp.expect_ok($$select public.publish_calendar_preset((select id from public.calendars where slug='p-ask'))$$);

-- T24 — the publish bar validates window SHAPE (HH:MM), not just presence: a
-- malformed time ("9:00") is not a bookable window and publish refuses it.
select pg_temp.expect_ok($$select public.create_calendar_preset('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','p-badtime','{"type":"personal","availability_json":[{"day":1,"start":"9:00","end":"17:00"}]}'::jsonb)$$);
select pg_temp.expect_code($$select public.publish_calendar_preset((select id from public.calendars where slug='p-badtime'))$$, '22023');

select '==== ALL PRESET-LIFECYCLE ASSERTIONS PASSED ====' as result;
