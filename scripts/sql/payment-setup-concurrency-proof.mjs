// Disposable PostgreSQL fixture proof. Never accepts a remote host or production URL.
// Usage: node scripts/sql/payment-setup-concurrency-proof.mjs <psql executable> <port> <user>
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const run = promisify(execFile);
const [psql, port, user] = process.argv.slice(2);
if (!psql || !/^\d+$/.test(port ?? '') || !/^[a-z_]+$/.test(user ?? '')) throw new Error('Explicit local fixture psql, port and user required');
const query = async (sql) => (await run(psql,['-h','127.0.0.1','-p',port,'-U',user,'-d','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',sql])).stdout.trim();
const tenant = randomUUID(); const actor = randomUUID(); const suffix = randomUUID();
const attempt = 'attempt-'+suffix;
try {
 await query(`INSERT INTO public.tenants(id,slug,name,account_type) VALUES('${tenant}','concurrency-${suffix}','Disposable concurrency proof','standalone'); INSERT INTO public.paige_audit_log(tenant_id,actor_user_id,action,payload) VALUES('${tenant}','${actor}','platform_billing_connect_requested',jsonb_build_object('setup_attempt','${attempt}'));`);
 const call = `SET ROLE service_role; SELECT public.complete_platform_payment_setup('${tenant}','${actor}','${attempt}','legacy','cus_${suffix}','pm_${suffix}','cs_${suffix}','evt_${suffix}',false,'2026-09-03 20:00Z');`;
 const results = await Promise.all(Array.from({length:8},()=>query(call)));
 assert.equal(results.filter(x=>x.endsWith('completed')).length,1);
 assert.equal(results.filter(x=>x.endsWith('duplicate')).length,7);
 assert.equal(await query(`SELECT count(*) FROM public.platform_billing_accounts WHERE tenant_id='${tenant}';`),'1');
 assert.equal(await query(`SELECT count(*) FROM public.platform_payment_setup_completions WHERE tenant_id='${tenant}';`),'1');
 console.log('PASS: 8 concurrent actual PostgreSQL sessions; one completion, seven duplicates, one mapping, one receipt.');
} finally {
 await query(`DELETE FROM public.platform_payment_setup_completions WHERE tenant_id='${tenant}'; DELETE FROM public.platform_billing_accounts WHERE tenant_id='${tenant}'; DELETE FROM public.paige_audit_log WHERE tenant_id='${tenant}'; DELETE FROM public.tenants WHERE id='${tenant}';`);
}
