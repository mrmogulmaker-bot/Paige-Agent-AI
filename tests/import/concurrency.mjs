// Disposable bootstrap database ONLY; no remote URL or provider credentials.
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const psql='C:/Program Files/PostgreSQL/16/bin/psql.exe';
const args=['-X','-h','127.0.0.1','-p','57432','-U','postgres','-d',process.env.IMPORT_PROOF_DB??'import_proof_v2','-v','ON_ERROR_STOP=1','-At'];
const t='00000000-0000-4000-8000-000000000001', a='00000000-0000-4000-8000-000000000011';
const query=sql=>{const r=spawnSync(psql,[...args,'-c',sql],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const wait=async test=>{const until=Date.now()+10000;while(!test()){if(Date.now()>until)throw Error('synchronization timeout');await new Promise(r=>setTimeout(r,40));}};
const service="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
const source=JSON.stringify({system:'csv',accountKey:'race-test',snapshotKey:`race-${Date.now()}`,observedAt:'2026-09-04T12:00:00Z'});
const preview=JSON.stringify({mapping:{},rows:[{fields:{external_id:'race-1',email:'race@example.com'},consent:{email:'unknown',sms:'unknown'}}]});
const lock=spawn(psql,args,{windowsHide:true});let output='';lock.stdout.on('data',d=>output+=d);let runner;
try{
 lock.stdin.write(`begin;update public.profiles set active_tenant_id='00000000-0000-4000-8000-000000000002' where user_id='${a}';select 'LOCK_READY';\n`);
 await wait(()=>output.includes('LOCK_READY'));
 runner=spawn(psql,args,{windowsHide:true});let err='',code=null;
 runner.stderr.on('data',d=>err+=d);runner.on('exit',v=>code=v);
 runner.stdin.end(`set application_name='import_switch_race';${service}select public.stage_contact_import('${t}','${a}','${source}','${preview}');\n`);
 await wait(()=>query("select count(*) from pg_stat_activity where application_name='import_switch_race' and wait_event_type='Lock'")==='1');
 lock.stdin.end('commit;\n');await wait(()=>code!==null);
 assert.notEqual(code,0);assert.match(err,/IMPORT_WORKSPACE_CHANGED/);
 assert.equal(query("select count(*) from public.contact_import_runs where source_account_key='race-test'"),'0');
 console.log('PASS active-workspace switch during profile-lock wait rejects staging with zero writes');
}finally{lock.kill();runner?.kill();query(`update public.profiles set active_tenant_id='${t}' where user_id='${a}'`);}
const run=query(`${service}select public.stage_contact_import('${t}','${a}','${source}','${preview}')`).split('\n').at(-1);
const batch=query(`${service}select public.select_contact_import_batch('${t}','${a}','${run}','[{"row_number":1,"disposition":"create","patch":{"email":"race@example.com"}}]','preview')`).split('\n').at(-1);
const call=()=>new Promise((resolve,reject)=>{const p=spawn(psql,args,{windowsHide:true});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('exit',code=>code===0?resolve(out):reject(Error(err)));p.stdin.end(`${service}select public.commit_contact_import_batch('${t}','${a}','${batch}','execute');\n`);});
const receipts=await Promise.all([call(),call()]);assert.equal(receipts[0],receipts[1]);
assert.equal(query("select count(*) from public.clients where email='race@example.com'"),'1');
assert.equal(query(`select count(*) from public.audit_logs where entity_id='${batch}' and action='import_batch_completed'`),'1');
console.log('PASS simultaneous commit retries return one durable receipt, one contact and one batch audit');
