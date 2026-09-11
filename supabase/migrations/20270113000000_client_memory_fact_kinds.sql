-- =============================================================================
-- ② Memory runway (#93/#117): the missing structured fact kinds.
--
-- The roadmap's memory contract names four durable fact kinds — preference |
-- commitment | open_loop | milestone. Live inventory: user_preference and
-- milestone_completed extract per-session; commitment and open_loop DO NOT EXIST
-- (this CHECK is the proof). "Paige re-asks what she was told" is at its worst
-- exactly here: a promise the client made two sessions ago is invisible.
--
-- Adds the two kinds to client_memory's memory_type CHECK (dropped by lookup,
-- not by assumed name, then re-created with the extended list — additive values
-- only; existing rows remain valid). The extractor extension rides the SAME
-- per-session pass (one combined JSON call — no added LLM cost), and
-- commitments/open-loops write with the same embedding + provenance shape
-- preferences already use.
-- =============================================================================

do $$
declare c text;
begin
  select conname into c
  from pg_constraint k
  join pg_class t on t.oid = k.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_attribute a on a.attrelid = t.oid and a.attname = 'memory_type'
  where n.nspname = 'public' and t.relname = 'client_memory'
    and k.contype = 'c' and k.conkey[1] = a.attnum;
  if c is not null then
    execute format('alter table public.client_memory drop constraint %I', c);
  end if;
end $$;

alter table public.client_memory
  add constraint client_memory_memory_type_check
  check (memory_type = any (array[
    'session_summary', 'milestone_completed', 'user_preference', 'coach_note',
    'report_upload', 'dispute_generated', 'funding_secured', 'lender_researched',
    'commitment', 'open_loop'
  ]));
