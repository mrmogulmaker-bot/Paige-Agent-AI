// Run only against the disposable database created by bootstrap.sql.
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const psql = process.env.PSQL ?? 'C:/Program Files/PostgreSQL/16/bin/psql.exe';
const args = ['-X','-h','127.0.0.1','-p','57432','-U','postgres','-d','a2p_proof','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At'];
const query = sql => {
 const r=spawnSync(psql,[...args,'-c',sql],{encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0,r.stderr); return r.stdout.trim();
};
const waitUntil = async predicate => {
 const end=Date.now()+10000;
 while(!predicate()){if(Date.now()>end)throw new Error('Test synchronization timed out');await new Promise(r=>setTimeout(r,50));}
};
const lock=spawn(psql,args,{windowsHide:true}); let lockOut='';let lockErr='';
lock.stdout.on('data',d=>lockOut+=d);lock.stderr.on('data',d=>lockErr+=d);
let save;
try {
 lock.stdin.write("begin; select pg_advisory_xact_lock(hashtextextended('a2p_registration:00000000-0000-4000-8000-000000000001',0)); select 'LOCK_READY';\n");
 await waitUntil(()=>lockOut.includes('LOCK_READY'));
 save=spawn(psql,args,{windowsHide:true});let saveErr='';let saveCode=null;
 save.stderr.on('data',d=>saveErr+=d);save.on('exit',code=>saveCode=code);
 save.stdin.end("set application_name='a2p_switch_race'; set role authenticated; set request.jwt.claims='{\"sub\":\"00000000-0000-4000-8000-000000000011\",\"role\":\"authenticated\"}'; select public.tenant_a2p_registration_save_draft('mixed','MUST NOT SAVE','[\"sample\"]',null,'00000000-0000-4000-8000-000000000001');\n");
 await waitUntil(()=>query("select count(*) from pg_stat_activity where application_name='a2p_switch_race' and wait_event='advisory'")==='1');
 query("update public.test_members set tenant_id='00000000-0000-4000-8000-000000000002' where user_id='00000000-0000-4000-8000-000000000011'");
 lock.stdin.end('commit;\n');
 await waitUntil(()=>saveCode!==null);
 assert.notEqual(saveCode,0,'blocked request must reject after workspace switch');
 assert.match(saveErr,/WORKSPACE_CHANGED/);
 assert.equal(query("select count(*) from public.tenant_a2p_registrations where tenant_id='00000000-0000-4000-8000-000000000002'"),'0');
 assert.equal(query("select campaign_description from public.tenant_a2p_registrations where tenant_id='00000000-0000-4000-8000-000000000001'"),'A draft');
 assert.equal(query('select count(*) from public.paige_audit_log'),'1');
 console.log('PASS: switched workspace during advisory-lock wait rejects without a contact, registration or audit side effect');
} finally {
 lock.kill();save?.kill();
 query("update public.test_members set tenant_id='00000000-0000-4000-8000-000000000001' where user_id='00000000-0000-4000-8000-000000000011'");
}
