-- §32 behavioural proof for the confirm-binding migration (20261021000000).
--
-- WHY THIS FILE EXISTS AS A FILE. An earlier revision of this work ran an equivalent proof ad hoc
-- and quoted "9/9" in the PR description with nothing committed. The peer-gate correctly called
-- that unreproducible. The repo's own standard is a committed, runnable check
-- (scripts/comms-purchase-safety-smoke.mjs, scripts/live-drive/), so here is one.
--
-- WHY SQL AND NOT A TYPESCRIPT TEST. No JS-side gate reads SQL. tsc, 1630 vitest tests, the
-- production build and all seven CI lint gates passed against a version of this migration whose
-- INSERT listed five columns and supplied four values — a 42601 on every confirm-gated tool call.
-- Only running the SQL caught it. See docs/brain/lessons-learned.md, "Every gate we run is blind
-- to SQL".
--
-- HOW TO RUN
--   Pre-merge (migration not yet applied):  concatenate the migration and this file, and execute
--                                           the result as one statement batch.
--   Post-merge (migration live):            execute this file alone.
--
-- The block ends in `raise exception`, so the transaction aborts BY CONSTRUCTION rather than by
-- trusting a trailing ROLLBACK — nothing here can half-apply. The results come back in the error
-- message. Afterwards, confirm nothing persisted:
--   select to_regclass('public.paige_tool_confirmations');   -- expect the table only if merged
--
-- It binds to whatever auth.users rows exist; it creates no users and writes nothing durable.

begin;

do $proof$
declare
  _u uuid; _u2 uuid; _tok uuid; _tok2 uuid; _r jsonb;
  _out text := ''; _pass int := 0; _fail int := 0;
  _later timestamptz := now() + interval '1 minute';
  _retained int;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select id into _u  from auth.users order by created_at asc  limit 1;
  select id into _u2 from auth.users order by created_at desc limit 1;
  if _u is null then raise exception 'PROOF ABORT: no auth.users row to bind to'; end if;

  -- 1 ─ the server can mint
  _tok := public.paige_tool_confirmation_open(null,_u,'comms_buy_number','IDENT_A','Buy +1555');
  if _tok is not null then _pass:=_pass+1; _out:=_out||E'\nPASS  open mints a server-side proposal';
  else _fail:=_fail+1; _out:=_out||E'\nFAIL  open mints a server-side proposal'; end if;

  -- 2 ─ THE DEFECT: a model cannot propose and self-approve inside one turn
  _r := public.paige_tool_confirmation_claim(null,_u,'comms_buy_number','IDENT_A', now());
  if (_r->>'ok')='false' and (_r->>'reason')='same_turn' then _pass:=_pass+1; _out:=_out||E'\nPASS  SAME-TURN self-approval refused -> '||_r::text;
  else _fail:=_fail+1; _out:=_out||E'\nFAIL  SAME-TURN self-approval refused -> '||_r::text; end if;

  -- 3 ─ an approval is for one identity
  _r := public.paige_tool_confirmation_claim(null,_u,'comms_buy_number','IDENT_B', _later);
  if (_r->>'ok')='false' then _pass:=_pass+1; _out:=_out||E'\nPASS  a DIFFERENT identity refused -> '||_r::text;
  else _fail:=_fail+1; _out:=_out||E'\nFAIL  a DIFFERENT identity refused -> '||_r::text; end if;

  -- 4 ─ …and for one tool
  _r := public.paige_tool_confirmation_claim(null,_u,'n8n_delete_workflow','IDENT_A', _later);
  if (_r->>'ok')='false' then _pass:=_pass+1; _out:=_out||E'\nPASS  a DIFFERENT tool refused -> '||_r::text;
  else _fail:=_fail+1; _out:=_out||E'\nFAIL  a DIFFERENT tool refused -> '||_r::text; end if;

  -- 5 ─ …and for one requester (§9)
  if _u2 is not null and _u2 <> _u then
    _r := public.paige_tool_confirmation_claim(null,_u2,'comms_buy_number','IDENT_A', _later);
    if (_r->>'ok')='false' then _pass:=_pass+1; _out:=_out||E'\nPASS  another USER cannot spend it -> '||_r::text;
    else _fail:=_fail+1; _out:=_out||E'\nFAIL  another USER cannot spend it -> '||_r::text; end if;
  else _out:=_out||E'\nSKIP  another-user check (only one auth user)'; end if;

  -- 6 ─ MULTI-SPEND: a second proposal SUPERSEDES the first, so two rows still buy ONE execution.
  --     Without this, a model emitting the same call several times in one round accumulated rows
  --     and could spend them all on a single intervening human turn.
  _tok2 := public.paige_tool_confirmation_open(null,_u,'comms_buy_number','IDENT_A','Buy again');
  if exists (select 1 from public.paige_tool_confirmations where token=_tok and superseded_at is not null)
  then _pass:=_pass+1; _out:=_out||E'\nPASS  a newer proposal SUPERSEDES the earlier one';
  else _fail:=_fail+1; _out:=_out||E'\nFAIL  a newer proposal SUPERSEDES the earlier one'; end if;

  -- 7 ─ the superseded row is not claimable, and the newer one is claimed exactly once
  _r := public.paige_tool_confirmation_claim(null,_u,'comms_buy_number','IDENT_A', _later);
  if (_r->>'ok')='true' and (_r->>'token')::uuid = _tok2
  then _pass:=_pass+1; _out:=_out||E'\nPASS  LATER-turn claim succeeds, and spends the NEWEST proposal';
  else _fail:=_fail+1; _out:=_out||E'\nFAIL  LATER-turn claim succeeds, and spends the NEWEST proposal -> '||_r::text; end if;

  -- 8 ─ …and a second claim finds nothing, including the superseded row
  _r := public.paige_tool_confirmation_claim(null,_u,'comms_buy_number','IDENT_A', _later);
  if (_r->>'ok')='false' then _pass:=_pass+1; _out:=_out||E'\nPASS  ONE approval buys exactly ONE execution -> '||_r::text;
  else _fail:=_fail+1; _out:=_out||E'\nFAIL  ONE approval buys exactly ONE execution -> '||_r::text; end if;

  -- 9 ─ history is RETAINED, not destroyed by the next proposal (audit trail)
  perform public.paige_tool_confirmation_open(null,_u,'comms_buy_number','IDENT_A','a third');
  select count(*) into _retained from public.paige_tool_confirmations
   where requested_by=_u and tool_key='comms_buy_number' and (used_at is not null or superseded_at is not null);
  if _retained >= 2 then _pass:=_pass+1; _out:=_out||E'\nPASS  spent/superseded proposals are RETAINED ('||_retained||' rows)';
  else _fail:=_fail+1; _out:=_out||E'\nFAIL  spent/superseded proposals are RETAINED ('||_retained||' rows)'; end if;

  -- 10/11 ─ §59: the grant is not the guard; the body refuses a non-service_role caller
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  begin
    _tok := public.paige_tool_confirmation_open(null,_u,'crm_delete_contact','IDENT_C',null);
    _fail:=_fail+1; _out:=_out||E'\nFAIL  non-service_role blocked from open (IT SUCCEEDED)';
  exception when insufficient_privilege then _pass:=_pass+1; _out:=_out||E'\nPASS  non-service_role BLOCKED from open';
  end;
  begin
    _r := public.paige_tool_confirmation_claim(null,_u,'comms_buy_number','IDENT_A', _later);
    _fail:=_fail+1; _out:=_out||E'\nFAIL  non-service_role blocked from claim (IT SUCCEEDED)';
  exception when insufficient_privilege then _pass:=_pass+1; _out:=_out||E'\nPASS  non-service_role BLOCKED from claim';
  end;

  raise exception E'PROOF RESULT  pass=%  fail=%\n%\n(transaction intentionally aborted - nothing persisted)', _pass, _fail, _out;
end
$proof$;
