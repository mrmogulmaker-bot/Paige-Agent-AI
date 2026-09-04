import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const bin=process.env.PG_PROOF_BIN||'C:/Program Files/PostgreSQL/16/bin';
const migration='supabase/migrations/20261201000400_canonical_proposal_integrity.sql';
const history=['supabase/migrations/20261023000000_confirmations_bind_the_approval_to_the_call.sql','supabase/migrations/20261026000000_a_token_cannot_be_redeemed_by_the_turn_that_minted_it.sql'];
assert.ok(history.every(p=>p<migration),'forward migration must follow table/nonce creation');
const outputRoot=join(root,'outputs/confirmation-integrity-db-proof');mkdirSync(outputRoot,{recursive:true});
const out=mkdtempSync(join(outputRoot,'run-')),cluster=join(out,'cluster');
const transcript=[];let port,started=false,stopped=false,error=null;
async function command(exe,args,input='',allowFailure=false){return new Promise((done,reject)=>{
 const ctl=exe.endsWith('pg_ctl.exe');const child=spawn(exe,args,{cwd:root,windowsHide:true,stdio:ctl?'ignore':['pipe','pipe','pipe'],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')&&k!=='DATABASE_URL'))});
 let stdout='',stderr='';child.stdout?.on('data',x=>stdout+=x);child.stderr?.on('data',x=>stderr+=x);child.on('error',reject);
 const timer=setTimeout(()=>{child.kill();reject(Error('Local command timed out'));},45000);
 child.on('close',code=>{clearTimeout(timer);transcript.push({exe,args,input,code,stdout,stderr});if(code&&!allowFailure)reject(Error(stderr||`Command failed ${code}`));else done({code,stdout,stderr});});child.stdin?.end(input);
});}
const psql=(s)=>command(join(bin,'psql.exe'),['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-X','-q','-A','-t','--no-password','--set','ON_ERROR_STOP=1'],`\\set VERBOSITY verbose\n${s}`);
try{
 const server=createServer();await new Promise((a,b)=>{server.on('error',b);server.listen(0,'127.0.0.1',a)});port=server.address().port;await new Promise(a=>server.close(a));
 await command(join(bin,'initdb.exe'),['-D',cluster,'-U','postgres','--auth=trust','--no-locale','--encoding=UTF8']);
 started=true;await command(join(bin,'pg_ctl.exe'),['-D',cluster,'-l',join(out,'postgres.log'),'-w','-t','30','-o',`-h 127.0.0.1 -p ${port} -c max_connections=20`,'start']);
 // Only unrelated dependencies are minimal fixtures. Target grants, columns,
 // constraints, indexes and RLS are loaded verbatim from historical migrations.
 await psql(`create role authenticated nologin;create role anon nologin;create role service_role nologin bypassrls;create schema auth;grant usage on schema auth,public to authenticated,anon,service_role;
 create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid $$;
 create table public.tenants(id uuid primary key);`);
 for(const p of history)await psql(readFileSync(join(root,p),'utf8'));
 const r=await psql(`\\set migration_file '${join(root,migration).replaceAll('\\','/')}'\n${readFileSync(join(root,'supabase/tests/paige_pending_confirmations_integrity.sql'),'utf8')}`);
 const checks=(r.stderr.match(/PASS:/g)||[]).length;assert.ok(checks>=25,'SQL assertions executed');
 console.log(r.stderr);console.log(`PASS ${checks} real PostgreSQL checks; exact historical grants/RLS`);
 // Two independent connections race for the same trusted row; only one CAS wins.
 await psql(`insert into public.paige_pending_confirmations(user_id,tool_name,fingerprint,args,summary,issued_in_request,server_issued_at) values('20000000-0000-4000-8000-000000000001','fixture','eeeeeeeeeeeeeeee','{}','race',gen_random_uuid(),now())`);
 const claim=`set role service_role;with c as(update public.paige_pending_confirmations set consumed_at=now() where fingerprint='eeeeeeeeeeeeeeee' and server_issued_at is not null and consumed_at is null returning id)select count(*) from c;`;
 const raced=await Promise.all([psql(claim),psql(claim)]);assert.deepEqual(raced.map(x=>Number(x.stdout.trim())).sort(),[0,1]);console.log('PASS concurrent single-use CAS');
 writeFileSync(join(out,'result.json'),JSON.stringify({status:'PASS',checks:checks+1,migration,sha256:createHash('sha256').update(readFileSync(join(root,migration))).digest('hex'),history,scope:'isolated exact target-schema PostgreSQL; not full application or authenticated browser'},null,2));
}catch(e){error=e.message;process.exitCode=1;console.error(error);}
finally{
 if(started)try{await command(join(bin,'pg_ctl.exe'),['-D',cluster,'-m','immediate','-w','stop']);stopped=true;}catch(e){error??=e.message;process.exitCode=1;}
 writeFileSync(join(out,'transcript.json'),JSON.stringify({error,started,stopped,transcript},null,2));console.log(out);
}
