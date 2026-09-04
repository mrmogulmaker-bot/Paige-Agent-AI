import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function captureMigrationState({ json, migration, sql, appliedMigrations, out, outputRoot, priorError }) {
  const state = {
    generatedAt: new Date().toISOString(),
    evidenceClass: 'isolated synthetic PostgreSQL dependency schema; not production ledger or full-history replay',
    trackedMigrations: [{ path: migration, sha256: createHash('sha256').update(sql).digest('hex') }],
    appliedMigrations,
    appliedSource: 'successful execution of actual migration via psql in this disposable cluster, not supabase_migrations ledger',
    schemaFingerprint: null,
    recoveryFindings: priorError ? [priorError] : [],
    status: 'UNVERIFIED',
  };
  try {
    const catalogue = await json(`select jsonb_build_object(
      'columns',(select coalesce(jsonb_agg(to_jsonb(x) order by x.table_name,x.ordinal_position),'[]') from
        (select table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
         from information_schema.columns where table_schema='public') x),
      'constraints',(select coalesce(jsonb_agg(to_jsonb(x) order by x.relation,x.name),'[]') from
        (select c.conrelid::regclass::text relation,c.conname name,pg_get_constraintdef(c.oid,true) definition
         from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public') x),
      'functions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.identity),'[]') from
        (select p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition,p.proacl::text privileges
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f') x)
    );`);
    const serialized = JSON.stringify(catalogue);
    state.schemaFingerprint = { algorithm: 'sha256', value: createHash('sha256').update(serialized).digest('hex'), scope: 'runtime public columns, constraints and function definitions/privileges' };
    writeFileSync(join(out,'schema-catalogue.json'),JSON.stringify(catalogue,null,2));
    if (!appliedMigrations.length) state.recoveryFindings.push('No successful tracked migration application was recorded.');
    state.status = state.recoveryFindings.length ? 'FAIL' : 'PASS';
  } catch (error) {
    state.recoveryFindings.push(`Runtime schema capture failed: ${error.message}`);
    state.status = 'UNVERIFIED';
  }
  writeFileSync(join(out,'migration-state.json'),JSON.stringify(state,null,2));
  writeFileSync(join(outputRoot,'migration-state.json'),JSON.stringify({ ...state, runDirectory: out },null,2));
  return state;
}
