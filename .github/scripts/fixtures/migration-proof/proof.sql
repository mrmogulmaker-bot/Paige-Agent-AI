do $$
begin
  if to_regclass('migration_proof_fixture.candidate_applied') is null then
    raise exception 'fixture candidate schema state is absent';
  end if;

  insert into migration_proof_fixture.candidate_applied (proof_key)
  values ('behavioral-proof')
  on conflict (proof_key) do nothing;

  if not exists (
    select 1
    from migration_proof_fixture.candidate_applied
    where proof_key = 'behavioral-proof'
      and proof_value = 'ordered'
  ) then
    raise exception 'fixture candidate behavior is unavailable';
  end if;
end
$$;
