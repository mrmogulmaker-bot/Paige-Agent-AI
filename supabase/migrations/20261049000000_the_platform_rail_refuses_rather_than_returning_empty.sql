-- The platform Rail refuses rather than returning an empty result.
--
-- WHAT IS AND IS NOT WRONG HERE. `get_platform_rail` gates correctly on `is_platform_owner()`,
-- and no unauthorized caller has ever received a row from it. This is NOT a disclosure defect and
-- must not be recorded as one. The defect is the SHAPE of the refusal:
--
--     IF NOT public.is_platform_owner() THEN RETURN; END IF;
--
-- A denied caller receives a successful, empty result set, which is indistinguishable from "the
-- platform Rail holds no events". That is the same empty-feed lie the #746 line of work exists to
-- delete, and this is the last Rail reader still carrying it: `get_client_rail` and
-- `get_client_rail_for_chat` were corrected by 20261044000000, and `get_solo_rail_activity` was
-- born raising in 20261042000000.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT CHANGE:
--   * the authority level. §53 freezes `is_platform_owner()` as super_admin-only, and this reader
--     stays on it. It is NOT widened to `is_platform_operator()`.
--   * the projection. The same eleven columns, still no raw `payload`, no `actor_user_id`, no
--     `ref_table`/`ref_id`. `tenant_id` and `contact_id` remain, and remain correct: a
--     cross-tenant operator view is this reader's entire purpose and it is gated to exactly that
--     caller.
--   * the caller-supplied bound, which stays clamped to [1, 500].
--   * the EXECUTE grants.
--
-- §37 PRODUCER INVENTORY. Walked against `src/`, `supabase/` and `scripts/` at 03d771f9f:
-- `get_platform_rail` has ZERO product callers. The only occurrences are the generated row in
-- `src/integrations/supabase/types.ts` and a comment in `railResolverContract.test.ts`. No
-- frontend, sibling edge function, trigger, cron job, GitHub Action, external webhook, MCP tool
-- or script invokes it. So no legitimate caller can regress from empty-to-raise, because there is
-- no caller at all. A future consumer inherits the correct contract instead of this defect --
-- which is the reason to fix it before Slice B wires consumers, not after.

create or replace function public.get_platform_rail(
  p_limit     integer default 100,
  p_tenant_id uuid    default null
)
returns table (
  id uuid, tenant_id uuid, contact_id uuid, event_kind text, surface text, actor_type text,
  audience text, visibility text, title text, summary text, occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  -- THE CORRECTION. A caller who is not a platform owner is told so, explicitly and fail-closed.
  -- One error for every denial -- no session, wrong tier, or a tenant that does not exist -- so a
  -- caller cannot learn anything by comparing responses.
  if not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'RAIL_FORBIDDEN';
  end if;

  return query
    select e.id, e.tenant_id, e.contact_id, e.event_kind, e.surface, e.actor_type,
           e.audience, e.visibility, e.title, e.summary, e.occurred_at
      from public.paige_client_events e
     where (p_tenant_id is null or e.tenant_id = p_tenant_id)
     order by e.occurred_at desc
     limit v_limit;
end
$function$;

-- Unchanged from the prior definition, restated so the grant is visible beside the body.
revoke all     on function public.get_platform_rail(integer, uuid) from public, anon;
grant  execute on function public.get_platform_rail(integer, uuid) to authenticated;

comment on function public.get_platform_rail(integer, uuid) is
  'Platform-owner Rail reader. Refuses with 42501 RAIL_FORBIDDEN rather than returning an empty '
  'set, so a denial is never mistaken for an empty platform. Authority is is_platform_owner() '
  '(super_admin only, per doctrine 53) and is deliberately not widened to is_platform_operator().';
