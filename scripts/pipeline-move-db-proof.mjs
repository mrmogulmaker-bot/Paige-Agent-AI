import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const bin='C:/Program Files/PostgreSQL/16/bin';
const migration='supabase/migrations/20260904052832_solo_pipeline_governed_move_executor.sql';
const sql=readFileSync(join(root,migration),'utf8');
const outputRoot=join(root,'outputs/pipeline-move-db-proof');mkdirSync(outputRoot,{recursive:true});
const out=mkdtempSync(join(outputRoot,'run-')),cluster=join(out,'cluster');
const transcript=[],results=[];let port,started=false,stopped=false,error=null;
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q=v=>`'${String(v).replaceAll("'","''")}'`;
async function command(exe,args,input='',allowFailure=false){return new Promise((done,reject)=>{
const ctl=exe.endsWith('pg_ctl.exe');const child=spawn(exe,args,{cwd:root,windowsHide:true,stdio:ctl?'ignore':['pipe','pipe','pipe'],env:Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')&&key!=='DATABASE_URL'))});
let stdout='',stderr='';child.stdout?.on('data',x=>stdout+=x);child.stderr?.on('data',x=>stderr+=x);child.on('error',reject);
const timer=setTimeout(()=>{child.kill();reject(Error('Local command timed out'));},45000);
child.on('close',code=>{clearTimeout(timer);transcript.push({exe,args,input,code,stdout,stderr});if(code&&!allowFailure)reject(Error(stderr||`Command failed ${code}`));else done({code,stdout,stderr});});child.stdin?.end(input);});}
const psql=(s,fail=false)=>command(join(bin,'psql.exe'),['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-X','-q','-A','-t','--no-password','--set','ON_ERROR_STOP=1'],`\\set VERBOSITY verbose\n${s}`,fail);
const json=async s=>JSON.parse((await psql(s)).stdout.trim());
const cmd=(extra={})=>({type:'move-deal',pipelineId:id(10),dealId:id(30),targetStageId:id(21),expectedVersion:1,expectedTargetVersion:1,...extra});
const call=(c=cmd(),channel='operator_card',tenant=id(1),user=id(2),key='move')=>`select public.execute_pipeline_deal_move_as_paige(${q(tenant)},${q(user)},${q(JSON.stringify(c))}::jsonb,${q(key)},${channel===null?'null':q(channel)});`;
const service=s=>`set role service_role;set request.jwt.claim.role='service_role';${s}`;
const snap=()=>json("select jsonb_build_object('deals',(select jsonb_agg(to_jsonb(d)) from deals d),'activities',(select count(*) from deal_activities),'audit',(select count(*) from audit_logs),'rail',(select count(*) from fixture_rail),'commands',(select count(*) from pipeline_command_results));");
async function seed(){await psql(`truncate deals,pipeline_stages,pipeline_command_results,deal_activities,audit_logs,fixture_rail,fixture_members,fixture_extra_admins,profiles,pipelines cascade;
insert into fixture_members values('${id(2)}','${id(1)}',true),('${id(3)}','${id(1)}',false),('${id(4)}','${id(5)}',true);
truncate fixture_autonomy;insert into fixture_autonomy values('auto');
insert into profiles values('${id(2)}','${id(1)}'),('${id(3)}','${id(1)}'),('${id(4)}','${id(5)}');
insert into pipelines values('${id(10)}','${id(1)}'),('${id(11)}','${id(1)}');
insert into pipeline_stages(id,pipeline_id,tenant_id,label,move_policy) values('${id(20)}','${id(10)}','${id(1)}','Start','direct'),('${id(21)}','${id(10)}','${id(1)}','Won by custom name','direct'),('${id(22)}','${id(11)}','${id(1)}','Other pipeline','direct');
insert into deals(id,pipeline_id,tenant_id,stage_id,contact_client_id) values('${id(30)}','${id(10)}','${id(1)}','${id(20)}','${id(40)}');`);}
async function test(name,fn){try{await seed();await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){results.push({name,status:'FAIL',error:e.message});throw e;}}
async function denied(s,state='42501'){const before=await snap();const r=await psql(s,true);assert.notEqual(r.code,0);assert.ok(r.stderr.includes(state),r.stderr);assert.deepEqual(await snap(),before);}
try{
 const server=createServer();await new Promise((a,b)=>{server.on('error',b);server.listen(0,'127.0.0.1',a)});port=server.address().port;await new Promise(a=>server.close(a));
 await command(join(bin,'initdb.exe'),['-D',cluster,'-U','postgres','--auth=trust','--no-locale','--encoding=UTF8']);
 started=true;await command(join(bin,'pg_ctl.exe'),['-D',cluster,'-l',join(out,'postgres.log'),'-w','-t','30','-o',`-h 127.0.0.1 -p ${port} -c max_connections=20`,'start']);
 await psql(readFileSync(join(root,'scripts/pipeline-move-db-proof/fixture.sql'),'utf8'));await psql(sql);await psql(sql);
 await test('direct move preserves status and records durable outcome',async()=>{const r=await json(service(call(cmd(),'standing_autonomy_setting')));assert.equal(r.ok,true);const s=await snap();assert.equal(s.deals[0].stage_id,id(21));assert.equal(s.deals[0].status,'open');assert.equal(s.deals[0].actual_close_date,null);assert.equal(s.deals[0].pipeline_id,id(10));assert.equal(s.deals[0].version,2);for(const k of ['activities','audit','rail','commands'])assert.equal(s[k],1);});
 await test('approval target operator card succeeds',async()=>{await psql(`update pipeline_stages set move_policy='approval' where id='${id(21)}'`);assert.equal((await json(service(call()))).ok,true);});
 for(const channel of ['model_asserted','standing_autonomy_setting'])await test(`approval target refuses ${channel}`,async()=>{await psql(`update pipeline_stages set move_policy='approval' where id='${id(21)}'`);await denied(service(call(cmd(),channel)));});
 await test('wrong tenant refuses',()=>denied(service(call(cmd(),'operator_card',id(5)))));
 await test('insufficient role refuses',()=>denied(service(call(cmd(),'operator_card',id(1),id(3)))));
 await test('authenticated cannot spoof service RPC even with forged role claim',()=>denied(`set role authenticated;set request.jwt.claim.role='service_role';${call()}`));
 for(const channel of [null,'','approved'])await test(`missing or unknown channel ${channel}`,()=>denied(service(call(cmd(),channel))));
 for(const field of ['expectedVersion','expectedTargetVersion']){
 await test(`missing ${field}`,()=>{const c=cmd();delete c[field];return denied(service(call(c)),'22023')});
 await test(`stale ${field}`,()=>denied(service(call(cmd({[field]:2}))),'40001'));
 }
 await test('same pipeline required',()=>denied(service(call(cmd({targetStageId:id(22)})))));
 await test('wrong pipeline identity refused',()=>denied(service(call(cmd({pipelineId:id(11)})))));
 for(const setting of ['audit','rail'])await test(`atomic rollback when ${setting} fails`,()=>denied(service(`set fixture.fail_${setting}='yes';${call()}`),'P0001'));
 await test('identical replay returns committed result without duplicate effects',async()=>{await psql(service(call()));const before=await snap();const r=await json(service(call()));assert.equal(r.replayed,true);assert.deepEqual(await snap(),before);});
 await test('conflicting replay refused',async()=>{await psql(service(call()));await denied(service(call(cmd({reason:'changed'}))),'22023');});
 for(const [label,needle] of [['tenant',"public.current_user_tenant_id() is distinct from _tenant_id"],['role',"not coalesce(public.is_tenant_admin(_tenant_id),false)"]])await test(`negative control ${label} removal defeats denial oracle`,async()=>{
 assert.ok(sql.includes(needle));
 if(label==='tenant')await psql(`insert into fixture_extra_admins values('${id(4)}','${id(1)}');update profiles set active_tenant_id='${id(1)}' where user_id='${id(4)}';`);
 // Keep the object in the requested tenant so only the removed identity guard carries denial.
 const statement=label==='tenant'?service(call(cmd(),'operator_card',id(1),id(4))):service(call(cmd(),'operator_card',id(1),id(3)));
 await denied(statement);
 await psql(sql.replace(needle,'false'));
 try{await assert.rejects(()=>denied(statement));}finally{await psql(sql);}
 });
 for(const [name,setup] of [
 ['null explicit active workspace refuses despite resolver fallback',`update profiles set active_tenant_id=null where user_id='${id(2)}'`],
 ['wrong explicit active workspace refuses despite resolver fallback',`update profiles set active_tenant_id='${id(5)}' where user_id='${id(2)}'`],
 ['wrong pipeline row tenant refuses',`update pipelines set tenant_id='${id(5)}' where id='${id(10)}'`],
 ]){
 try{await test(name,async()=>{await psql(setup);await denied(service(call()));});}
 catch(e){error??=e.message;process.exitCode=1;console.error('EXPECTED RED: '+name+': '+e.message);}
 }
 for(const mode of ['off','unknown',null,'confirm']){
 try{await test(`current autonomy ${mode} refuses stale standing approval`,async()=>{
 await psql(`update fixture_autonomy set mode=${mode===null?'null':q(mode)};`);await denied(service(call(cmd(),'standing_autonomy_setting')));
 });}catch(e){error??=e.message;process.exitCode=1;console.error('EXPECTED RED autonomy '+mode+': '+e.message);}
 }
}catch(e){error=e.message;process.exitCode=1;console.error(error);}finally{
 let fingerprint=null;try{if(started){const s=await psql("select coalesce(string_agg(table_name||':'||column_name||':'||data_type,E'\\n' order by table_name,ordinal_position),'') from information_schema.columns where table_schema='public';");fingerprint=createHash('sha256').update(s.stdout).digest('hex');}}catch(e){error??=e.message;process.exitCode=1;}
 if(started){const r=await command(join(bin,'pg_ctl.exe'),['-D',cluster,'-m','fast','-w','-t','30','stop'],'',true);stopped=r.code===0;if(!stopped)process.exitCode=1;}
 const proof={generatedAt:new Date().toISOString(),status:!process.exitCode&&results.length>0?'PASS':'FAIL',migration,migrationSha256:createHash('sha256').update(sql).digest('hex'),schemaFingerprint:fingerprint,scope:'Isolated PostgreSQL16 actual migration, synthetic dependencies and authorization helpers. Real auth resolver, Rail schema, full-history replay, Chat approval provenance and production UNVERIFIED.',results,error,clusterStopped:stopped,runDirectory:out};
 writeFileSync(join(out,'commands.json'),JSON.stringify(transcript,null,2));writeFileSync(join(out,'proof.json'),JSON.stringify(proof,null,2));writeFileSync(join(outputRoot,'latest-proof.json'),JSON.stringify(proof,null,2));console.log('Evidence: '+out+'; stopped: '+stopped);
}
