import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// This runner never consumes PGHOST, DATABASE_URL, existing services or credentials.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = process.env.PIPELINE_PROOF_PG_BIN || 'C:/Program Files/PostgreSQL/16/bin';
const migration = 'supabase/migrations/20260904005101_solo_pipeline_empty_delete.sql';
const read = name => readFileSync(join(root, name), 'utf8');
const sql = read(migration);
if (!sql.trim()) throw new Error('Deletion migration is not ready');
const outputRoot = join(root, 'outputs/pipeline-delete-db-proof');
mkdirSync(outputRoot, { recursive: true });
const out = mkdtempSync(join(outputRoot, 'run-'));
const cluster = join(out, 'cluster');
if (!resolve(cluster).startsWith(resolve(outputRoot) + sep)) throw new Error('Unsafe cluster path');
const results = [], transcript = [];
let port, started = false, stopped = false;
const id = (kind, n) => `${kind}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tid = n => id('2', n), uid = n => id('1', n), pid = n => id('3', n), sid = n => id('4', n);
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function extract(path, name) {
  const source = read(path);
  const start = source.search(new RegExp(`create or replace function public\\.${name}\\(`, 'i'));
  if (start < 0) throw new Error(`Missing function ${name}`);
  const rest = source.slice(start), delimiter = rest.match(/\bas\s+(\$[a-z0-9_]*\$)/i);
  if (!delimiter) throw new Error(`Missing delimiter ${name}`);
  const end = rest.indexOf(`${delimiter[1]};`, delimiter.index + delimiter[0].length);
  if (end < 0) throw new Error(`Unterminated function ${name}`);
  return rest.slice(0, end + delimiter[1].length + 1);
}
async function command(executable, args, input = '', allowFailure = false) {
  return new Promise((done, reject) => {
    const controller = executable.endsWith('pg_ctl.exe');
    const child = spawn(executable, args, { cwd: root, windowsHide: true, stdio: controller ? 'ignore' : ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout?.on('data', data => stdout += data);
    child.stderr?.on('data', data => stderr += data);
    child.on('error', reject);
    const timer = setTimeout(() => { child.kill(); reject(new Error('Local proof command timed out')); }, 45000);
    child.on('close', code => {
      clearTimeout(timer);
      transcript.push({ executable, args, exitCode: code, stdout, stderr });
      if (code !== 0 && !allowFailure) reject(new Error(`${executable}: ${stderr}`));
      else done({ code, stdout, stderr });
    });
    child.stdin?.end(input);
  });
}
const psql = (statement, failure = false) => command(join(bin, 'psql.exe'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-A', '-t', '--no-password', '--set', 'ON_ERROR_STOP=1'], `\\set VERBOSITY verbose\n${statement}`, failure);
const asUser = (n, statement) => `set role authenticated; set request.jwt.claim.sub=${quote(uid(n))}; ${statement}`;
const json = async statement => JSON.parse((await psql(statement)).stdout.trim());
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function test(name, run) {
  try { await run(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message }); throw error; }
}
async function denied(statement, state = '42501') {
  const result = await psql(statement, true);
  assert(result.code !== 0 && result.stderr.includes(state), `Expected denial ${state}; got ${result.stdout} ${result.stderr}`);
}
const call = (n, key = `delete-${n}`, tenant = 1, ref = `PPL-TEST${n}`, version = 1, count = 2) => `select public.delete_empty_pipeline('${tid(tenant)}','${pid(n)}',${quote(ref)},${version},${quote(key)},${count});`;
const snapshot = () => json("select jsonb_build_object('pipelines',(select jsonb_agg(to_jsonb(p) order by id) from public.pipelines p),'stages',(select jsonb_agg(to_jsonb(s) order by id) from public.pipeline_stages s),'catalog',(select jsonb_agg(to_jsonb(c) order by id) from public.fixture_catalog c),'audit',(select count(*) from public.audit_logs),'commands',(select count(*) from public.pipeline_command_results));");
const helpers = [
  ['supabase/migrations/20260714144656_tier_rail_phaseB_agency_standing.sql', 'current_user_tenant_id'],
  ['supabase/migrations/20260803190000_slice_a_multi_owner_is_owner.sql', 'is_tenant_owner'],
];
try {
  const listener = createServer();
  await new Promise((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
  port = listener.address().port;
  await new Promise(done => listener.close(done));
  await command(join(bin, 'initdb.exe'), ['-D', cluster, '-U', 'postgres', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  started = true;
  await command(join(bin, 'pg_ctl.exe'), ['-D', cluster, '-l', join(out, 'postgres.log'), '-w', '-t', '30', '-o', `-h 127.0.0.1 -p ${port} -c max_connections=20`, 'start']);
  await psql(read('scripts/pipeline-delete-db-proof/fixture.sql'));
  await psql(helpers.map(([path, name]) => extract(path, name)).join('\n'));
  await test('actual migration applies twice on isolated PostgreSQL', async () => { await psql(sql); await psql(sql); });
  const { executeCases } = await import('./pipeline-delete-db-proof/cases.mjs');
  await executeCases({ root, sql, read, psql, asUser, json, assert, test, denied, call, snapshot, quote, tid, uid, pid, sid });
  const { concurrencyCases } = await import('./pipeline-delete-db-proof/concurrency.mjs');
  await concurrencyCases({ psql, asUser, json, assert, test, call, tid, pid, sid, uid });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (started) {
    const result = await command(join(bin, 'pg_ctl.exe'), ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop'], '', true);
    stopped = result.code === 0;
    if (!stopped) process.exitCode = 1;
  }
  writeFileSync(join(out, 'commands.json'), JSON.stringify(transcript, null, 2));
  writeFileSync(join(out, 'proof.json'), JSON.stringify({ generatedAt: new Date().toISOString(), evidenceClass: 'isolated PostgreSQL runtime, synthetic dependency schema; not authenticated production or full-history replay', migration, migrationSha256: createHash('sha256').update(sql).digest('hex'), helpers: helpers.map(([path, name]) => ({ path, name, sha256: createHash('sha256').update(extract(path, name)).digest('hex') })), results, clusterStopped: stopped }, null, 2));
  console.log(`Evidence: ${out}; cluster stopped: ${stopped}`);
}
