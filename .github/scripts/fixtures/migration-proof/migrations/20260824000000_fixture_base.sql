create schema if not exists migration_proof_fixture;

create table migration_proof_fixture.candidate_applied (
  proof_key text primary key,
  applied_at timestamptz not null default now()
);
