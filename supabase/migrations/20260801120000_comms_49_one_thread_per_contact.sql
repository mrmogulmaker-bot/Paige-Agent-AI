-- §49 — ONE thread per contact per tenant. Kills the channel-prefixed + per-address fragmentation
-- ("{channel}:{tenant}:{counterparty}") that splits a single person into email/voice/sms threads.
--
-- THE FIX (two parts, both in this migration):
--   (A) DERIVATION: contact-bearing rows key on the CONTACT, not the channel+address:
--         thread_key = 'contact:' || tenant_id || ':' || contact_id
--       contact_id IS NULL rows keep the OLD '{channel}:{tenant}:{counterparty}' form (fallback only).
--       Same contact's messages across every channel now compute the SAME key -> the EXISTING
--       tg_message_upsert_thread ON CONFLICT (tenant_id, thread_key) collapses them to one thread.
--   (B) CONSOLIDATION BACKFILL: merge already-fragmented threads per (tenant_id, contact_id) into a
--       single survivor, re-point every message that lived in any merged thread (never delete a
--       message, §13), delete the redundant (reconstructable) thread aggregate rows.
--
-- INVARIANTS (hard): (a) §9 NO cross-tenant merge — grouped strictly by (tenant_id, contact_id), and
-- the message re-point is additionally predicated on m.tenant_id = g.tenant_id; (b) §13 NO message
-- loss and NO orphaning — messages are only re-pointed (UPDATE thread_key), and the re-point is by
-- THREAD MEMBERSHIP (every message that lived in any merged thread moves, incl. NULL-contact rows that
-- co-resided under a merged key) so messages.thread_key == threads.thread_key equality is preserved for
-- every reader; (c) chronological order across channels preserved (ordering is by messages.sent_at,
-- which we never touch); (d) idempotent + preview-safe (CREATE OR REPLACE, TEMP tables ON COMMIT DROP,
-- HAVING/IS-DISTINCT guards make re-runs no-ops); (e) contact_id IS NULL *threads* left UNTOUCHED (they
-- never join a group, so their keys are never in member_keys → their NULL-contact messages are untouched).
--
-- WHY MEMBERSHIP, NOT message.contact_id (the adversarial-verifier fix): one old thread_key can hold a
-- MIX of message.contact_id values (handle-inbound-email writes contact_id per-message, NULL when no
-- creator resolves, while the thread trigger coalesces the thread to the first non-null contact). A
-- contact_id-predicated re-point would relabel the thread but strand the NULL/mismatched message rows on
-- a key that no longer names any thread — a silent, FK-invisible orphan (a message the reader can no
-- longer see). Re-pointing by the group's constituent thread_keys moves EVERY message that was already
-- displayed in a merged thread, exactly preserving today's grouping with zero orphans.
--
-- CONSTRAINT-SAFETY: threads carries UNIQUE (tenant_id, thread_key). We delete non-survivors BEFORE
-- relabeling the survivor's key, so at relabel time exactly one row exists per group and the new key
-- (unique per contact_id) can never trip a transient dup-key. Statement order is stated inline.
--
-- Neither the messages tenant trigger (BEFORE INSERT) nor the thread-projection trigger (AFTER INSERT)
-- fires on our UPDATE of messages.thread_key — threads are managed explicitly here.

-- =============================================================================
-- PART A — create_and_attach_conversation: key the thread by CONTACT, not channel+address.
-- Only the smart-route block (formerly L110-119) changes; §9 tenant-derivation is untouched.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_and_attach_conversation(
  p_first_name text DEFAULT NULL,
  p_last_name  text DEFAULT NULL,
  p_email      text DEFAULT NULL,
  p_phone      text DEFAULT NULL,
  p_channel    text DEFAULT 'email',
  p_tenant_id  uuid DEFAULT NULL   -- honored ONLY for service-role (auth.uid() IS NULL); ignored for JWT (§9)
)
RETURNS TABLE (contact_id uuid, thread_id uuid, thread_key text, was_existing boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller  uuid := auth.uid();
  _tenant  uuid := CASE WHEN _caller IS NULL THEN COALESCE(p_tenant_id, public.current_user_tenant_id())
                        ELSE public.current_user_tenant_id() END;
  _email   text := lower(NULLIF(btrim(p_email), ''));
  _phone_digits text := NULLIF(regexp_replace(COALESCE(p_phone, ''), '[^0-9+]', '', 'g'), '');
  _channel text := lower(COALESCE(NULLIF(btrim(p_channel), ''), 'email'));
  _cid     uuid;
  _tid     uuid;
  _tkey    text;
  _thread_existed boolean := false;
  _creator uuid;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_any_role(_caller, ARRAY['admin','super_admin','coach']) THEN
    RAISE EXCEPTION 'CONVO_FORBIDDEN: admin or coach required' USING ERRCODE = '42501';
  END IF;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'CONVO_NO_TENANT: a tenant context is required' USING ERRCODE = '22023';
  END IF;
  IF _email IS NULL AND _phone_digits IS NULL AND NULLIF(btrim(p_first_name), '') IS NULL THEN
    RAISE EXCEPTION 'CONVO_NO_IDENTITY: an email, phone, or name is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(_tenant::text || ':' || COALESCE(_email, _phone_digits, ''))
  );

  IF _email IS NOT NULL THEN
    SELECT id INTO _cid FROM public.clients
     WHERE tenant_id = _tenant AND lower(btrim(email)) = _email
     ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF _cid IS NULL AND _phone_digits IS NOT NULL THEN
    SELECT id INTO _cid FROM public.clients
     WHERE tenant_id = _tenant
       AND regexp_replace(COALESCE(phone, ''), '[^0-9+]', '', 'g') = _phone_digits
     ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF _cid IS NULL THEN
    _creator := _caller;
    IF _creator IS NULL THEN
      SELECT owner_user_id INTO _creator FROM public.tenants WHERE id = _tenant;
    END IF;
    INSERT INTO public.clients (
      first_name, last_name, email, phone,
      lifecycle_stage, source, status, created_by, tenant_id
    )
    SELECT
      COALESCE(NULLIF(btrim(p_first_name), ''), NULLIF(split_part(COALESCE(_email, ''), '@', 1), ''), 'New'),
      COALESCE(NULLIF(btrim(p_last_name), ''), 'Contact'),
      NULLIF(btrim(p_email), ''), NULLIF(btrim(p_phone), ''),
      'new_lead', 'conversations', 'active', _creator, _tenant
    WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _creator)
    RETURNING id INTO _cid;

    IF _cid IS NULL THEN
      RAISE EXCEPTION 'CONVO_NO_CREATOR: could not resolve a valid creator (auth.users) for this tenant'
        USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
    VALUES (_creator, 'client', 'create_and_attach_conversation', _cid,
            jsonb_build_object('tenant_id', _tenant, 'channel', _channel, 'via', 'conversations_compose'));
  END IF;

  -- §49 SMART-ROUTE — key on the CONTACT, not channel+counterparty. _cid is guaranteed non-null here
  -- (resolved or created-and-raised above), so a single per-contact thread serves EVERY channel. The
  -- channel argument no longer fragments; a later inbound reply on any channel coalesces into this row.
  _tkey := 'contact:' || _tenant::text || ':' || _cid::text;
  SELECT t.id INTO _tid FROM public.threads t
   WHERE t.tenant_id = _tenant AND t.thread_key = _tkey LIMIT 1;
  _thread_existed := _tid IS NOT NULL;   -- honest: only true when a real thread already exists (§13)

  contact_id   := _cid;
  thread_id    := _tid;        -- NULL when no thread exists yet; the first Send coalesces one
  thread_key   := _tkey;
  was_existing := _thread_existed;
  RETURN NEXT;
END;
$$;

REVOKE ALL   ON FUNCTION public.create_and_attach_conversation(text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_and_attach_conversation(text, text, text, text, text, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_and_attach_conversation(text, text, text, text, text, uuid) IS
  '§49 one-thread-per-contact: resolve-or-create ONE contact per (tenant,email|phone) + smart-route to that contact''s SINGLE thread across all channels (thread_key = contact:tenant:contact_id). Tenant server-derived (§9); race-safe via pg_advisory_xact_lock.';

-- =============================================================================
-- PART A2 — tg_comms_file_outbound_draft: §37 producer. It normally INHERITS the (now per-contact)
-- key from the inbound reply payload; harden the NO-payload-key fallback to a per-contact key too
-- (was new.id::text, which would fragment a Paige draft away from the contact's thread). Body is
-- otherwise byte-identical to migration 20260726190000.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_comms_file_outbound_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  _draft   jsonb := coalesce(new.draft_content, '{}'::jsonb);
  _pl      jsonb := coalesce(new.payload, '{}'::jsonb);
  _conn    uuid  := nullif(_pl->>'connector_id','')::uuid;
  _channel text  := coalesce(_pl->>'channel_type', 'email');
  _ctenant uuid;
  _tkey    text;
begin
  if exists (select 1 from public.messages m
             where m.action_id = new.id and m.direction = 'outbound') then
    return new;
  end if;

  -- §49 per-contact fallback: prefer the payload's key (inbound handler already writes contact:...);
  -- else derive contact:tenant:contact when a contact is known; else last-resort action id.
  if nullif(_pl->>'thread_key','') is not null then
    _tkey := _pl->>'thread_key';
  elsif new.contact_id is not null then
    select c.tenant_id into _ctenant from public.clients c where c.id = new.contact_id;
    _tkey := 'contact:' || _ctenant::text || ':' || new.contact_id::text;
  else
    _tkey := new.id::text;
  end if;

  insert into public.messages (
    channel_type, direction, status,
    contact_id, connector_id, thread_key,
    in_reply_to_provider_id, sender, recipients, subject,
    body_text, body_html, meta, action_id
  ) values (
    _channel, 'outbound', 'draft',
    new.contact_id, _conn, _tkey,
    _pl->>'inbound_provider_message_id',
    case when _pl ? 'reply_from_address'
         then jsonb_build_object('address', _pl->>'reply_from_address') else null end,
    case when _pl ? 'reply_to_address'
         then jsonb_build_array(jsonb_build_object('address', _pl->>'reply_to_address')) else '[]'::jsonb end,
    coalesce(_draft->>'subject', _pl->>'subject'),
    coalesce(_draft->>'body', _draft->>'content', _draft->>'body_text'),
    _draft->>'body_html',
    jsonb_build_object('source','comms-draft-reply','draft', _draft),
    new.id
  );
  return new;
end;
$$;

-- =============================================================================
-- PART B — consolidation backfill: merge existing fragmented threads per (tenant_id, contact_id).
-- Runs inside the migration's transaction. All TEMP tables are ON COMMIT DROP.
-- =============================================================================

-- B1. Groups needing consolidation + survivor + aggregated surfacing state + the group's constituent
--     thread_keys (member_keys) used by B7 to re-point EVERY member message by thread membership.
--     A group qualifies when it has >1 thread OR its single thread still holds an OLD-style key
--     (bool_or thread_key <> new_key) — so a fully-migrated contact (1 row, key already new) is
--     excluded → the whole backfill is a no-op on re-run (idempotency).
--     ARCHIVE policy: archived only if EVERY constituent is archived (active always wins → surface).
--     SNOOZE  policy: if ANY constituent is currently active (snoozed_until NULL or <= now) the merged
--                     thread is NOT snoozed; else keep the EARLIEST future snooze (wakes soonest).
CREATE TEMP TABLE _c169_groups ON COMMIT DROP AS
SELECT
  t.tenant_id,
  t.contact_id,
  ('contact:' || t.tenant_id::text || ':' || t.contact_id::text) AS new_key,
  (array_agg(t.id ORDER BY
      (t.thread_key = ('contact:' || t.tenant_id::text || ':' || t.contact_id::text)) DESC, -- prefer already-migrated
      t.last_message_at DESC NULLS LAST,
      t.id
   ))[1]                                            AS survivor_id,
  array_agg(DISTINCT t.thread_key)                  AS member_keys,   -- §13 fix: re-point by membership
  max(t.last_message_at)                            AS agg_last_message_at,
  COALESCE(sum(t.unread_count), 0)                  AS agg_unread,
  CASE WHEN bool_and(t.archived_at IS NOT NULL)
       THEN max(t.archived_at) ELSE NULL END        AS agg_archived_at,
  CASE WHEN bool_or(t.snoozed_until IS NULL OR t.snoozed_until <= now())
       THEN NULL
       ELSE min(t.snoozed_until) END                AS agg_snoozed_until
FROM public.threads t
WHERE t.contact_id IS NOT NULL                       -- (e) null-contact threads never join a group
GROUP BY t.tenant_id, t.contact_id
HAVING count(*) > 1
    OR bool_or(t.thread_key <> ('contact:' || t.tenant_id::text || ':' || t.contact_id::text));

-- B2. Union of labels across the group's threads, de-duplicated by label id (jsonb [{id,name,color}]).
CREATE TEMP TABLE _c169_labels ON COMMIT DROP AS
SELECT g.tenant_id, g.contact_id,
  COALESCE((
    SELECT jsonb_agg(x.lbl)
    FROM (
      SELECT DISTINCT ON (lbl->>'id') lbl
      FROM public.threads t2
      CROSS JOIN LATERAL jsonb_array_elements(t2.labels) AS lbl
      WHERE t2.tenant_id = g.tenant_id AND t2.contact_id = g.contact_id
      ORDER BY lbl->>'id'
    ) x
  ), '[]'::jsonb) AS labels
FROM _c169_groups g;

-- B3. last_direction of the most-recent message across the group (drives inbox rendering).
CREATE TEMP TABLE _c169_dir ON COMMIT DROP AS
SELECT DISTINCT ON (t.tenant_id, t.contact_id)
       t.tenant_id, t.contact_id, t.last_direction
FROM public.threads t
JOIN _c169_groups g ON g.tenant_id = t.tenant_id AND g.contact_id = t.contact_id
ORDER BY t.tenant_id, t.contact_id, t.last_message_at DESC NULLS LAST, t.id;

-- B4. Fold the aggregated state INTO the survivor row (BEFORE deleting non-survivors, so the
--     aggregates captured in B1/B2/B3 are still valid). Key is NOT changed yet.
UPDATE public.threads s SET
  last_message_at = g.agg_last_message_at,
  unread_count    = g.agg_unread,
  archived_at     = g.agg_archived_at,
  snoozed_until   = g.agg_snoozed_until,
  labels          = l.labels,
  last_direction  = d.last_direction,
  updated_at      = now()
FROM _c169_groups g
JOIN _c169_labels l ON l.tenant_id = g.tenant_id AND l.contact_id = g.contact_id
JOIN _c169_dir    d ON d.tenant_id = g.tenant_id AND d.contact_id = g.contact_id
WHERE s.id = g.survivor_id;

-- B5. DELETE the redundant (non-survivor) thread rows. Reconstructable from messages (§13 — no message
--     is deleted). Done BEFORE the relabel so the survivor's new key can't collide with a sibling.
DELETE FROM public.threads t
USING _c169_groups g
WHERE t.tenant_id = g.tenant_id
  AND t.contact_id = g.contact_id
  AND t.id <> g.survivor_id;

-- B6. RELABEL the survivor to the per-contact key. Exactly one row per group remains, and new_key is
--     unique per contact_id → no dup-key. Guard makes an already-migrated survivor a no-op.
UPDATE public.threads s SET thread_key = g.new_key, updated_at = now()
FROM _c169_groups g
WHERE s.id = g.survivor_id
  AND s.thread_key IS DISTINCT FROM g.new_key;

-- B7. RE-POINT every message that lived in ANY of the group's merged threads to the per-contact key.
--     Membership (m.thread_key = ANY member_keys), NOT m.contact_id — so NULL-contact and cross-contact
--     rows that co-resided under a merged key move too, preserving messages.thread_key == threads.thread_key
--     equality with ZERO orphans (the §13 adversarial-verifier fix). §9-safe: also predicated on
--     m.tenant_id = g.tenant_id, and member_keys embed the tenant, so no cross-tenant/contact leak.
--     Chronology preserved (only thread_key changes, never sent_at). IS DISTINCT guard = idempotent.
UPDATE public.messages m SET thread_key = g.new_key
FROM _c169_groups g
WHERE m.tenant_id = g.tenant_id
  AND m.thread_key = ANY(g.member_keys)
  AND m.thread_key IS DISTINCT FROM g.new_key;

-- B8. FAIL-LOUD assertion (§32/§13): after the re-point, NO message that belongs to a consolidated
--     contact may be orphaned (its thread_key must name a surviving thread). If any is, abort the whole
--     migration rather than silently ship an invisible-message inbox. Scoped to the migrated tenants.
DO $$
DECLARE _orphans bigint;
BEGIN
  SELECT count(*) INTO _orphans
  FROM public.messages m
  WHERE m.thread_key LIKE 'contact:%'
    AND NOT EXISTS (
      SELECT 1 FROM public.threads t
      WHERE t.tenant_id = m.tenant_id AND t.thread_key = m.thread_key
    );
  IF _orphans > 0 THEN
    RAISE EXCEPTION '§49 CONSOLIDATION ABORT: % message(s) orphaned (thread_key names no surviving thread) — messages<->threads equality broken', _orphans;
  END IF;
END $$;
