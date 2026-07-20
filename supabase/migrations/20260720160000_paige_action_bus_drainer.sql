-- §34/§8 — the two-way action-bus DRAINER: the service-only lifecycle RPCs the autonomous worker uses.
--
-- Today paige_actions rows are filed with status='filed' but NOTHING drains them — §8's core promise
-- (Client team detects need → files action → Owner team drafts → routes to approval) only fires while a
-- human is actively chatting (PLATFORM_ASSESSMENT D2, the single highest-leverage gap). The new
-- paige-action-worker edge fn (on a */2 cron) closes it. This migration gives that worker the two
-- atomic, service-only lifecycle RPCs it needs — mirroring the proven growth_claim_submission /
-- growth_fail_submission pattern (§18 extend the pattern, don't invent one) — plus a drain index.
--
-- §9 — both RPCs are SECURITY DEFINER, service-role ONLY (RAISE if auth.uid() is non-null), and take
-- tenant/scope from the ROW, never a caller argument. The worker never sees another tenant's data except
-- as the rows it claims, and every write is stamped from the claimed row's own tenant_id.
-- §13 — claim is ATOMIC (FOR UPDATE OF a SKIP LOCKED) so two concurrent workers never double-draft the
-- same action; a crashed run's rows self-heal (a 'drafting' row with no draft after 10 min returns to
-- 'filed' for re-pickup); a hard invoke failure is marked 'blocked' with the error (fail_action) so the
-- row surfaces in the queue instead of dying silently. No auto-send is introduced — the worker only
-- advances to 'drafted', and advance_action then routes send-kinds to paige_pending_approvals.
--
-- Idempotent; ADDITIVE only.

-- ── Drain index — locate 'filed' actions cheaply for the cross-tenant sweep ───────────────────────
-- idx_pa_queue leads with (tenant_id, to_department), so a cross-tenant WHERE status='filed' sweep can't
-- use it. This partial index makes the drainer's scan touch only filed rows; the small priority sort
-- runs over that set.
CREATE INDEX IF NOT EXISTS idx_pa_drain ON public.paige_actions (filed_at) WHERE status = 'filed';

-- ── claim_filed_actions — atomically claim a batch of draft-eligible filed actions ────────────────
-- Returns { ok, claimed: [ {id, tenant_id, action_kind, contact_id, conversation_id, title, summary,
-- payload, draft_subagent_slug} ] }. Only claims actions whose KIND is enabled AND has a
-- draft_subagent_slug (the ones that actually need an AI draft); record_only / surface_to_client kinds
-- with no draft agent are left for advance_action's own auto/human paths and are NOT swept here.
-- §16 tier-honoring: a row whose resolved autonomy_lane is 'off' (human-only / AI-briefed) is SKIPPED —
-- Paige does not draft work a tenant designated human-only. The lane is read from the ROW
-- (paige_file_action stamps it per-tenant via paige_resolve_autonomy), so a tenant's override wins.
-- Highest priority first, oldest first.
CREATE OR REPLACE FUNCTION public.claim_filed_actions(p_limit int DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _n int := GREATEST(LEAST(COALESCE(p_limit, 25), 100), 1);
  _claimed jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'CLAIM_FORBIDDEN: service role only' USING ERRCODE = '42501';
  END IF;

  -- Self-heal: a row stuck 'drafting' with no draft after 10 min is a crashed prior run — reopen it.
  UPDATE public.paige_actions
     SET status = 'filed'
   WHERE status = 'drafting'
     AND draft_content IS NULL
     AND assigned_at IS NOT NULL
     AND assigned_at < now() - interval '10 minutes';

  WITH picked AS (
    SELECT a.id
    FROM public.paige_actions a
    JOIN public.paige_action_kinds k ON k.slug = a.action_kind
    WHERE a.status = 'filed'
      AND k.enabled
      AND k.draft_subagent_slug IS NOT NULL
      AND a.autonomy_lane IS DISTINCT FROM 'off'   -- §16: never draft a human-only action
    ORDER BY
      CASE a.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      a.filed_at ASC
    LIMIT _n
    FOR UPDATE OF a SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.paige_actions a
       SET status = 'drafting',
           assigned_at = now(),
           assigned_subagent_slug = COALESCE(a.assigned_subagent_slug, k.draft_subagent_slug)
      FROM public.paige_action_kinds k
     WHERE a.id IN (SELECT id FROM picked)
       AND k.slug = a.action_kind
    RETURNING a.id, a.tenant_id, a.action_kind, a.contact_id, a.conversation_id,
              a.title, a.summary, a.payload, k.draft_subagent_slug
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'tenant_id', tenant_id, 'action_kind', action_kind,
           'contact_id', contact_id, 'conversation_id', conversation_id,
           'title', title, 'summary', summary, 'payload', payload,
           'draft_subagent_slug', draft_subagent_slug
         )), '[]'::jsonb)
  INTO _claimed
  FROM claimed;

  RETURN jsonb_build_object('ok', true, 'claimed', _claimed);
END $$;

-- ── fail_action — terminal error state so a stuck draft surfaces in the queue, never dies silent ──
-- Only fails a row still in 'drafting' — the state the worker's own claim put it in. If the row already
-- advanced past drafting (e.g. advance_action committed but its response was lost, so the worker's outer
-- catch calls fail_action), this is a no-op instead of clobbering a legitimately drafted/pending_approval
-- row and orphaning its approval (§13 honest state).
CREATE OR REPLACE FUNCTION public.fail_action(p_action_id uuid, p_error text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _row public.paige_actions%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL_FORBIDDEN: service role only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.paige_actions
     SET status = 'blocked',
         error  = left(COALESCE(p_error, 'draft failed'), 1000)
   WHERE id = p_action_id
     AND status = 'drafting'
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'updated', false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'updated', true, 'action_id', _row.id, 'status', _row.status);
END $$;

REVOKE ALL ON FUNCTION public.claim_filed_actions(int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_action(uuid, text)   FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_filed_actions(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_action(uuid, text)   TO service_role;
