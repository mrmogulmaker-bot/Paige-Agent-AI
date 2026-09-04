// Local PostgreSQL concurrency proof. No provider/network endpoint other than localhost DB.
import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const db=process.argv[2];
assert.match(db,/^orchestration_proof_[0-9]+$/);
const bin='C:/Program Files/PostgreSQL/16/bin/psql.exe';
const args=['-X','-h','127.0.0.1','-p','57432','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-Atq'];
const prefix=`set request.jwt.claims='{"role":"service_role"}'; `;
const query=sql=>{const p=spawnSync(bin,[...args,'-c',prefix+sql],{encoding:'utf8',windowsHide:true});assert.equal(p.status,0,p.stderr);return p.stdout.trim()};
const asyncQuery=sql=>new Promise(resolve=>{const p=spawn(bin,[...args,'-c',prefix+sql],{windowsHide:true});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('exit',status=>resolve({status,out,err}))});
const base={tenant_id:'00000000-0000-4000-8000-000000000001',actor_id:'00000000-0000-4000-8000-000000000011'};
const act=JSON.parse(query(`select solo_orchestration_service('activate','${JSON.stringify({...base,workflow_id:'wf1',version_id:'v1',execution_mode:'manual',approval_ref:'local-proof',max_runs:3})}')`));
const delegate=`select solo_orchestration_service('delegate','${JSON.stringify({...base,...act,idempotency_key:'concurrent-event'})}')`;
const results=await Promise.all([asyncQuery(delegate),asyncQuery(delegate)]);
for(const result of results)assert.equal(result.status,0,result.err);
assert.equal(JSON.parse(results[0].out).run_id,JSON.parse(results[1].out).run_id);
assert.equal(query('select count(*) from paige_workflow_runs'),'1');
assert.equal(query('select count(*) from paige_actions'),'1');
const claims=await Promise.all([asyncQuery(`select solo_orchestration_service('claim','{"limit":1}')`),asyncQuery(`select solo_orchestration_service('claim','{"limit":1}')`)]);
for(const result of claims)assert.equal(result.status,0,result.err);
const runs=claims.flatMap(result=>JSON.parse(result.out).runs);assert.equal(runs.length,1);
const run=runs[0];
const lease=JSON.parse(query(`select n8n_job_service('${run.run_id}','${run.claim_token}','acquire')`));
const lock=spawn(bin,args,{windowsHide:true});let lockOut='';lock.stdout.on('data',d=>lockOut+=d);
const wait=async fn=>{const end=Date.now()+10000;while(!fn()){if(Date.now()>end)throw new Error('sync timeout');await new Promise(r=>setTimeout(r,30))}};
try {
 lock.stdin.write(`begin; select id from tenant_mcp_connections for update; select 'LOCKED';\n`);
 await wait(()=>lockOut.includes('LOCKED'));
 const checking=asyncQuery(`set application_name='orch_lock_check'; select n8n_job_service('${run.run_id}','${run.claim_token}','check','${JSON.stringify(lease)}')`);
 await wait(()=>query(`select count(*) from pg_stat_activity where application_name='orch_lock_check' and wait_event_type='Lock'`)==='1');
 lock.stdin.end(`update tenant_mcp_connections set n8n_generation=gen_random_uuid(); commit;\n`);
 const checked=await checking;assert.notEqual(checked.status,0);assert.match(checked.err,/N8N_GENERATION_CHANGED/);
 console.log('PASS: concurrent duplicate delegation yields one action/run; concurrent claims yield one lease owner; generation change during lock wait rejects stale dispatch check');
} finally {lock.kill()}
query(`select n8n_job_service('${run.run_id}','${run.claim_token}','release','${JSON.stringify(lease)}')`);
// Revocation while the pre-dispatch guard waits must be observed after the lock.
const act2=JSON.parse(query(`select solo_orchestration_service('activate','${JSON.stringify({...base,workflow_id:'wf1',version_id:'v1',execution_mode:'manual',approval_ref:'local-proof-2',max_runs:1})}')`));
query(`select solo_orchestration_service('delegate','${JSON.stringify({...base,...act2,idempotency_key:'revoke-race'})}')`);
const run2=JSON.parse(query(`select solo_orchestration_service('claim','{"limit":1}')`)).runs[0];
const lease2=JSON.parse(query(`select n8n_job_service('${run2.run_id}','${run2.claim_token}','acquire')`));
const revoker=spawn(bin,args,{windowsHide:true});let revokeOut='';revoker.stdout.on('data',d=>revokeOut+=d);
try {
 revoker.stdin.write(`begin; update paige_workflow_registry set is_active=false where id='${act2.registry_id}'; select 'REVOKE_LOCKED';\n`);
 await wait(()=>revokeOut.includes('REVOKE_LOCKED'));
 const checking=asyncQuery(`set application_name='orch_revoke_check'; select n8n_job_service('${run2.run_id}','${run2.claim_token}','dispatch_intent','${JSON.stringify({...lease2,verified_workflow_id:'wf1',verified_version_id:'v1'})}')`);
 await wait(()=>query(`select count(*) from pg_stat_activity where application_name='orch_revoke_check' and wait_event_type='Lock'`)==='1');
 revoker.stdin.end('commit;\n');
 const checked=await checking;assert.notEqual(checked.status,0);assert.match(checked.err,/ORCHESTRATION_AUTHORITY_REVOKED/);
 assert.equal(query(`select job_dispatch_state from paige_workflow_runs where id='${run2.run_id}'`),'ready');
 console.log('PASS: process revocation during registry lock wait refuses dispatch intent');
} finally {revoker.kill()}
