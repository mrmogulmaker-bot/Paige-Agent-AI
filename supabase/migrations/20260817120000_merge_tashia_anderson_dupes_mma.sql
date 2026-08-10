-- Merge the two Paige-created "Tashia Anderson" duplicates back into the original contact — tenant MMA
-- only (Mogul Maker Academy, d8a0a880-1bed-43af-9b5d-e23c4db93106). §30-verified cleanup (prod-queried,
-- do not re-litigate). Root cause: crm_create_contact → create_contact RPC does a BLIND insert with no
-- dedup, so two paige-source rows (email NULL) were minted minutes apart alongside the real manual row.
--
--   ORIGINAL (keep)  53970758-486e-400b-92c5-abe76f24da65  email tashiaanderson@me.com, source=manual,
--                                                          lifecycle new_lead, 2026-07-30
--   DUPE #1 (remove) 4a06dc2a-f923-4288-bceb-abb48988ce6b  email NULL, source=paige, qualified, 20:24
--   DUPE #2 (remove) febd2580-6129-4932-b770-2ffc535271d3  email NULL, source=paige, hot_lead,  20:25
--
-- §30/§39 FK audit: 70 tables carry a FK to public.clients (mix of SET NULL / CASCADE). The dupes are
-- minutes old so most child tables are empty for them — EXCEPT one offer approval row drafted for Tashia.
-- A naive 3-statement DELETE would orphan any child row (or the FK's SET NULL would silently detach it),
-- so this migration is DYNAMIC: it enumerates EVERY FK column referencing public.clients(id) from the
-- catalog and reparents dupe→original across all of them BEFORE deleting the dupe rows. No hand-listing.
--
-- §39 non-FK scan (§13, prod-queried 2026-08-10 — pasted clean): the two dupe uuids were searched in the
-- denormalized/jsonb locations the FK loop cannot reach — paige_pending_approvals.draft_content,
-- paige_actions.payload, and paige_messages_audit(full-row jsonb) — and returned ZERO hits. So the FK-only
-- reparent below is complete for this incident. (This migration remaps FK references only; a future session
-- adding a new denormalized client-id store must re-run the non-FK scan.)
--
-- Collision-safe: a child table with a UNIQUE/EXCLUDE that the original already satisfies (e.g.
-- UNIQUE(contact_id, x)) would make a bulk reparent throw. On that throw we fall back to a row-by-row
-- reparent and, on a per-row conflict, DELETE the dupe's child row rather than fail the whole merge.
--
-- Promotion preserved (owner-requested in the #27/#28 handoff): dupe #2 reached hot_lead, so the survivor
-- is promoted new_lead → hot_lead. (§39 flagged this as a judgment call — the dupes were Paige mis-inserts
-- so their advancement could be spurious — but the owner explicitly asked to keep the promotion, so we do;
-- owner authority wins the tie. The discarded dupe stages are noted here, not silently lost.)
--
-- §9/§51 tenant isolation: the merge is HARD-GUARDED to tenant MMA — if any of the three rows is not
-- MMA-scoped, it RAISEs and aborts (never merges across tenants).
--
-- Idempotent: keyed on `WHERE id IN (dupes)`; a re-run after the dupes are gone is a NOTICE + no-op, so
-- the survivor's later, legitimately-edited lifecycle_stage is never clobbered.
--
-- DESTRUCTIVE prod migration — applies via .github/workflows/deploy-migrations.yml on owner merge (§32).

begin;

DO $$
DECLARE
  v_tenant   uuid := 'd8a0a880-1bed-43af-9b5d-e23c4db93106';  -- Mogul Maker Academy
  v_original uuid := '53970758-486e-400b-92c5-abe76f24da65';  -- keep
  v_dupe1    uuid := '4a06dc2a-f923-4288-bceb-abb48988ce6b';  -- remove
  v_dupe2    uuid := 'febd2580-6129-4932-b770-2ffc535271d3';  -- remove
  r          record;
  v_ctid     tid;
BEGIN
  -- No-op if the dupes are already gone (idempotent re-run).
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id IN (v_dupe1, v_dupe2)) THEN
    RAISE NOTICE 'Tashia Anderson dupes already merged/absent — no-op.';
    RETURN;
  END IF;

  -- §9 tenant-isolation gate: refuse to touch anything unless ALL three rows are tenant MMA.
  IF EXISTS (
    SELECT 1 FROM public.clients
     WHERE id IN (v_original, v_dupe1, v_dupe2)
       AND tenant_id IS DISTINCT FROM v_tenant
  ) THEN
    RAISE EXCEPTION 'Refusing Tashia merge: original/dupe row(s) not scoped to tenant %', v_tenant;
  END IF;
  -- The survivor must actually exist under MMA.
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = v_original AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Refusing Tashia merge: original % not found under tenant %', v_original, v_tenant;
  END IF;

  -- Reparent every child row across ALL FK columns referencing public.clients(id).
  FOR r IN
    SELECT ns.nspname AS sch, cl.relname AS tbl, att.attname AS col
      FROM pg_constraint c
      JOIN pg_class      cl    ON cl.oid   = c.conrelid
      JOIN pg_namespace  ns    ON ns.oid   = cl.relnamespace
      JOIN pg_class      ref   ON ref.oid  = c.confrelid
      JOIN pg_namespace  refns ON refns.oid = ref.relnamespace
      CROSS JOIN LATERAL unnest(c.conkey, c.confkey) AS k(conkey, confkey)
      JOIN pg_attribute  att    ON att.attrelid    = c.conrelid  AND att.attnum    = k.conkey
      JOIN pg_attribute  refatt ON refatt.attrelid = c.confrelid AND refatt.attnum = k.confkey
     WHERE c.contype = 'f'
       AND refns.nspname = 'public'
       AND ref.relname   = 'clients'
       AND refatt.attname = 'id'   -- only FKs pointing at the PK we're merging on
  LOOP
    BEGIN
      -- Fast path: bulk reparent dupe→original for this FK column.
      EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE %I IN ($2, $3)',
                     r.sch, r.tbl, r.col, r.col)
        USING v_original, v_dupe1, v_dupe2;
    EXCEPTION WHEN unique_violation OR exclusion_violation THEN
      -- Collision: original already owns a row that conflicts on a unique/exclude key.
      -- Reparent row-by-row; on a per-row conflict drop the dupe's child row instead of failing.
      FOR v_ctid IN
        EXECUTE format('SELECT ctid FROM %I.%I WHERE %I IN ($1, $2)', r.sch, r.tbl, r.col)
          USING v_dupe1, v_dupe2
      LOOP
        BEGIN
          EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE ctid = $2', r.sch, r.tbl, r.col)
            USING v_original, v_ctid;
        EXCEPTION WHEN unique_violation OR exclusion_violation THEN
          EXECUTE format('DELETE FROM %I.%I WHERE ctid = $1', r.sch, r.tbl)
            USING v_ctid;
        END;
      END LOOP;
    END;
  END LOOP;

  -- Preserve the most-advanced lifecycle the dupes reached (dupe #2 = hot_lead).
  UPDATE public.clients
     SET lifecycle_stage = 'hot_lead'
   WHERE id = v_original
     AND tenant_id = v_tenant;

  -- Bug 2 existing-artifact backfill (§13): the offer-email approval drafted FOR Tashia
  -- (f279b9c3-…) was filed with contact_id = NULL — it was never linked to any client, so the
  -- dupe-id reparent loop above cannot catch it. Link it to the surviving Tashia so the
  -- timeline ties the email back to her record. Guarded: MMA-scoped + only if still NULL.
  UPDATE public.paige_pending_approvals
     SET contact_id = v_original
   WHERE id = 'f279b9c3-a6ae-4d22-898f-2a8ac7f32fa9'
     AND tenant_id = v_tenant
     AND contact_id IS NULL;

  -- Now that no child row references them, remove the two dupes.
  DELETE FROM public.clients
   WHERE id IN (v_dupe1, v_dupe2)
     AND tenant_id = v_tenant;

  RAISE NOTICE 'Tashia Anderson dupes merged into % and deleted.', v_original;
END $$;

commit;
