alter table migration_proof_fixture.candidate_applied
  add column proof_value text not null default 'ordered';
