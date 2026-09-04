import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const url = new URL(process.env.RECEIPT_TEST_DB_URL ?? 'postgresql://postgres@127.0.0.1:55439/resend_receipt_contract');
assert.equal(url.hostname, '127.0.0.1', 'Disposable loopback database required');
assert.ok(url.pathname === '/resend_receipt_contract' || (process.env.CI === 'true' && url.port === '54322' && url.pathname === '/postgres'), 'Disposable test database required');
const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-d', url.toString()];
const run = sql => execFileSync('psql', args, { input: sql, encoding: 'utf8', windowsHide: true });
const suffix = randomUUID(); const receipt = 'msg_concurrent_' + suffix; const message = 'concurrent_' + suffix;
run(`INSERT INTO public.email_send_log(message_id,template_name,recipient_email,status,metadata)
 VALUES ('${message}','platform_invite','concurrent@tests.invalid','sent','{"via":"send-platform-invite"}');`);
const invoke = hold => new Promise((resolve, reject) => {
  const child = spawn('psql', args, { windowsHide: true }); let output = '';
  child.stdout.on('data', data => { output += data; });
  // Never echo database error text; this runner needs only the failure category.
  child.stderr.resume();
  child.on('error', () => reject(new Error('concurrency process unavailable')));
  child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error('concurrency query failed')));
  child.stdin.end(`BEGIN; SET LOCAL ROLE service_role;
 SELECT public.ingest_resend_receipt('${receipt}','${message}','delivered',NULL);
 ${hold ? 'SELECT pg_sleep(1);' : ''} COMMIT;`);
});
const outcomes = await Promise.all(Array.from({ length: 16 }, (_, i) => invoke(i === 0)));
assert.equal(outcomes.filter(v => v === 'processed').length, 1);
assert.equal(outcomes.filter(v => v === 'duplicate').length, 15);
assert.equal(run(`SELECT count(*) FROM public.email_send_log WHERE metadata->>'svix_id'='${receipt}';`).trim(), '1');
assert.equal(run(`SELECT count(*) FROM public.resend_receipt_processing WHERE receipt_id='${receipt}';`).trim(), '1');
console.log('PASS: 16 concurrent service callers, one journal identity, one durable outcome.');
