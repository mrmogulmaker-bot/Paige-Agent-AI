-- `is_primary` may only ever sit on an ACTIVE number — enforced, not assumed.
--
-- WHAT WENT WRONG, AND WHERE IT CAME FROM
--
-- `20260901010000` shipped a one-time backfill that chose a primary for any workspace that had
-- an active number and no active primary. Its `not exists` guard was written as
--
--     and not exists (select 1 … where p.tenant_id = n.tenant_id and p.is_primary
--                                   and p.status = 'active')
--
-- and the `p.status = 'active'` half was added during review, on the reasoning that a workspace
-- whose only primary is released has not really decided anything and should still be backfilled.
-- That reasoning was right and the change was wrong, because `uq_tenant_phone_numbers_primary` is
--
--     UNIQUE (tenant_id) WHERE is_primary          -- no status predicate
--
-- so in exactly the state the new guard was written to catch — a released row holding
-- `is_primary`, an active row without it — the guard selects the active row and the UPDATE then
-- collides with the released row still occupying the tenant's single primary slot. The whole
-- migration aborts with 23505 instead of repairing anything.
--
-- Proven on production inside a rollback transaction before writing this file: with that state
-- manufactured, the shipped backfill returns
--   ABORTED 23505 — duplicate key value violates unique constraint "uq_tenant_phone_numbers_primary"
--
-- The review that added the guard proved it "discriminates" by running the SELECT — with the
-- guard it picks 1 row, without it picks 0 — and never ran the UPDATE. A predicate proof is not
-- a write proof, and the difference is the entire defect.
--
-- WHY A CORRECTION AND NOT AN EDIT
--
-- `20260901010000` is applied on production and cannot be rewritten. On a genuinely fresh replay
-- it is also harmless: nothing writes `is_primary` before it runs, so the colliding state cannot
-- exist yet. The exposure is a database that acquires an inactive primary and then runs it — so
-- the durable fix is to make that state unreachable rather than to keep writing guards against it.
--
-- ONE HONEST CORRECTION TO THE SHIPPED COMMENT (§13). That migration's comment claimed a workspace
-- in this state has "its caller ID pointing at a dead number". It does not. Both readers filter
-- status:
--     voice-twiml/index.ts   .eq("status","active").order("is_primary",desc).limit(1)
--     send-message/index.ts  .eq("status","active").order("is_primary",desc)…
-- so a released row holding the flag is never dialled from. The real damage is narrower and is
-- what this file fixes: it occupies the unique slot, so the backfill cannot choose a live number.
-- `tenant_phone_number_set_primary` was already safe — it clears every primary for the tenant
-- regardless of status before setting the new one.

-- ── 1. Make the state unreachable ───────────────────────────────────────────────────────
-- A trigger rather than a CHECK, deliberately. A CHECK would REFUSE the write that moves a
-- primary number to `released` or `suspended`, which turns retiring a number into an error the
-- caller has to know to pre-empt. The number genuinely is being retired; the flag simply stops
-- meaning anything at that moment. So the flag is cleared with the transition instead of the
-- transition being blocked — self-healing, and it never breaks a writer that does the right
-- thing in the wrong order.
create or replace function public.tenant_phone_number_clear_primary_when_inactive()
returns trigger
language plpgsql
as $$
begin
  if new.is_primary and new.status is distinct from 'active' then
    new.is_primary := false;
  end if;
  return new;
end;
$$;

comment on function public.tenant_phone_number_clear_primary_when_inactive() is
  'Keeps the invariant that is_primary implies status = ''active''. A number moving off active loses the flag rather than the write being refused, so retiring a number never errors and never leaves the tenant''s single primary slot occupied by a number that cannot carry a call.';

drop trigger if exists trg_tenant_phone_number_primary_active on public.tenant_phone_numbers;
create trigger trg_tenant_phone_number_primary_active
  before insert or update of is_primary, status on public.tenant_phone_numbers
  for each row
  execute function public.tenant_phone_number_clear_primary_when_inactive();

-- ── 2. Repair anything already in that state, then finish the backfill it blocked ───────
-- Order matters and is the whole point: clear first, choose second. Doing it the other way round
-- is the 23505 above.
update public.tenant_phone_numbers
   set is_primary = false, updated_at = now()
 where is_primary and status is distinct from 'active';

-- Now the original intent, unblocked. Same deterministic ordering as `20260901010000` so a
-- workspace that already has a primary is never moved and a replay picks the same row.
update public.tenant_phone_numbers t
   set is_primary = true, updated_at = now()
 where t.id in (
   select distinct on (n.tenant_id) n.id
     from public.tenant_phone_numbers n
    where n.status = 'active'
      and not exists (
        select 1 from public.tenant_phone_numbers p
         where p.tenant_id = n.tenant_id and p.is_primary and p.status = 'active'
      )
    order by n.tenant_id, n.purchased_at asc nulls last, n.created_at asc, n.id asc
 );
