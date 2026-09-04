// @vitest-environment node
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect,vi} from 'vitest';
type Result={failure_code:string|null;workflow_count:number|null};
type Row=Record<string,unknown>;
function load(path:string,ports:Record<string,unknown>,deno?:unknown):Record<string,unknown>{
 const exports={};const output=ts.transpileModule(readFileSync(path,'utf8'),{reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 if(output.diagnostics?.length)throw Error('Source did not transpile');
 new Function('require','exports','Deno',output.outputText)((name:string)=>{if(!(name in ports))throw Error(`Unmocked ${name}`);return ports[name];},exports,deno);return exports;
}
class GuardError extends Error{constructor(readonly reason:string){super(reason)}}
const validator=load('supabase/functions/_shared/n8n-api-validation.ts',{'./ssrfGuard.ts':{safeFetch:()=>{throw Error('network forbidden')},SsrfError:GuardError}}) as unknown as {
 normalizeApiAddress(value:unknown):string|null;
 validateN8nApi(url:string,key:string,ports:{fetch:(...args:unknown[])=>Promise<Row>;now?:()=>number;budgetMs?:number}):Promise<Result>;
};
const page=(data:unknown[],nextCursor?:unknown)=>({status:200,body:JSON.stringify({data,nextCursor}),truncated:false});
const key='fixture-api-secret';
const validate=(fetch:(...args:unknown[])=>Promise<Row>,extra:Row={})=>validator.validateN8nApi('https://n8n.example',key,{fetch,...extra});
describe('n8n API count-only validator',()=>{
 it('accepts zero only from a complete valid response',async()=>{expect(await validate(vi.fn().mockResolvedValue(page([])))).toEqual({failure_code:null,workflow_count:0})});
 it('counts every page without retaining workflow content',async()=>{const fetch=vi.fn().mockResolvedValueOnce(page([{id:'1',name:'private',nodes:['customer']}],'cursor1')).mockResolvedValueOnce(page([{id:'2'}],null));expect(await validate(fetch)).toEqual({failure_code:null,workflow_count:2});expect(fetch.mock.calls[1][0]).toBe('https://n8n.example/api/v1/workflows?limit=200&cursor=cursor1');expect(fetch.mock.calls[0][1]).toEqual({method:'GET',headers:{'X-N8N-API-KEY':key,Accept:'application/json'}})});
 it.each([[401,'authentication_rejected'],[403,'request_refused'],[404,'endpoint_not_found'],[500,'provider_unavailable']])('maps observed status %i safely',async(status,code)=>{expect(await validate(vi.fn().mockResolvedValue({status,body:key,truncated:false}))).toEqual({failure_code:code,workflow_count:null})});
 it('does not keep a partial count when a later page fails',async()=>{const fetch=vi.fn().mockResolvedValueOnce(page([{id:'1'}],'next')).mockResolvedValueOnce({status:403,body:'private',truncated:false});expect((await validate(fetch)).workflow_count).toBeNull()});
 it.each([{status:200,body:'not json',truncated:false},{status:200,body:'{}',truncated:false}])('refuses malformed successful bodies',async response=>{expect((await validate(vi.fn().mockResolvedValue(response))).failure_code).toBe('response_invalid')});
 it('refuses truncated and duplicate/cycling pages',async()=>{expect((await validate(vi.fn().mockResolvedValue({...page([]),truncated:true}))).failure_code).toBe('inventory_incomplete');const fetch=vi.fn().mockResolvedValue(page([{id:'1'}],'same'));expect((await validate(fetch)).failure_code).toBe('inventory_incomplete');expect(fetch).toHaveBeenCalledTimes(2)});
 it('caps endless pagination at 50 pages',async()=>{let n=0;const fetch=vi.fn(async()=>page([{id:String(++n)}],`cursor${n}`));expect((await validate(fetch)).failure_code).toBe('inventory_incomplete');expect(fetch).toHaveBeenCalledTimes(50)});
 it('stops hung requests at the global deadline',async()=>{vi.useFakeTimers();const fetch=vi.fn(()=>new Promise<Row>(()=>undefined));const pending=validate(fetch,{budgetMs:10});await vi.advanceTimersByTimeAsync(10);expect(await pending).toEqual({failure_code:'inventory_incomplete',workflow_count:null});vi.useRealTimers()});
 it.each([btoa(key), '%66ixture-api-secret',btoa(key).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')])('never follows a cursor that echoes the credential: %s',async cursor=>{const fetch=vi.fn().mockResolvedValue(page([{id:'1'}],cursor));expect((await validate(fetch)).failure_code).toBe('response_invalid');expect(fetch).toHaveBeenCalledTimes(1)});
 it('rejects credential-bearing legacy URLs before network',async()=>{const fetch=vi.fn();expect((await validator.validateN8nApi('https://n8n.example/'+key,key,{fetch})).failure_code).toBe('address_rejected');expect((await validator.validateN8nApi('https://n8n.example/%66ixture-api-secret',key,{fetch})).failure_code).toBe('address_rejected');expect(fetch).not.toHaveBeenCalled()});
 it.each(['http://n8n.example','https://user:pass@n8n.example','https://n8n.example?token=abc','https://n8n.example#secret'])('refuses unsafe address %s',url=>expect(validator.normalizeApiAddress(url)).toBeNull());
 it('maps redirect/private destination guard to safe address rejection',async()=>{expect((await validate(vi.fn().mockRejectedValue(new GuardError('url_redirect_refused')))).failure_code).toBe('address_rejected')});
});
function handlerHarness(options:{canWrite?:boolean;result?:Result;rpc?:(name:string,args:Row)=>unknown;finalHealth?:string;sessionLost?:boolean}={}){
 const calls:{name:string;args:Row}[]=[];let reads=0,authReads=0;
 const connection=(final=false)=>({tenant_id:'tenant-a',can_write:options.canWrite??true,configured:options.finalHealth==='not_configured'&&final?false:true,label:'Instance',base_url:'https://n8n.example',health:final?(options.finalHealth??(options.result?.failure_code?'needs_attention':'connected')):'saved_unverified',failure_code:options.result?.failure_code??null,workflow_count:0,checked_at:final&&options.finalHealth!=='not_configured'?'stamp':null,last_success_at:null});
 const rpc=async(name:string,args:Row={})=>{
  calls.push({name,args});const over=options.rpc?.(name,args);if(over!==undefined)return over;
  if(name==='get_tenant_n8n_api_readiness')return {data:connection(++reads>1)};
  if(name==='save_tenant_n8n_api_connection')return {data:{saved:true,credential_revision:'revision'}};
  if(name==='begin_tenant_n8n_api_validation')return {data:{validation_id:'attempt',credential_revision:'revision',base_url:'https://n8n.example',api_key:key}};
  if(name==='finish_tenant_n8n_api_validation')return {data:{stale:false,checked_at:'stamp'}};
  return {data:null,error:null};
 };
 const api={rpc,auth:{getUser:async()=>({data:{user:options.sessionLost&&++authReads>1?null:{id:'actor'}}})}};
 const validate=vi.fn(async()=>options.result??{failure_code:null,workflow_count:0});let handler!:(req:Request)=>Promise<Response>;
 load('supabase/functions/tenant-n8n-api-connect/index.ts',{'https://esm.sh/@supabase/supabase-js@2.57.4':{createClient:()=>api},'../_shared/n8n-api-validation.ts':{normalizeApiAddress:validator.normalizeApiAddress,validateN8nApi:validate}},{env:{get:(name:string)=>({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'}[name])},serve:(value:typeof handler)=>{handler=value}});
 const post=(body:Row)=>handler(new Request('https://fixture.supabase.co/functions/v1/tenant-n8n-api-connect',{method:'POST',headers:{origin:'https://paigeagent.ai',authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify(body)}));
 return {post,handler,calls,validate};
}
describe('n8n API executed handler',()=>{
 it('refuses a non-admin before secret lookup/network',async()=>{const h=handlerHarness({canWrite:false});expect((await h.post({action:'validate',expected_tenant_id:'tenant-a'})).status).toBe(403);expect(h.validate).not.toHaveBeenCalled();expect(h.calls).toHaveLength(1)});
 it('refuses workspace mismatch before any writes',async()=>{const h=handlerHarness();expect((await h.post({action:'save',expected_tenant_id:'other',base_url:'https://n8n.example',api_key:key})).status).toBe(409);expect(h.calls).toHaveLength(1)});
 it('save failure never validates or exposes key',async()=>{const h=handlerHarness({rpc:name=>name==='save_tenant_n8n_api_connection'?{error:{message:'database-private'}}:undefined});const response=await h.post({action:'save',expected_tenant_id:'tenant-a',base_url:'https://n8n.example',api_key:key});expect(await response.json()).toEqual({error:'save_failed'});expect(h.validate).not.toHaveBeenCalled()});
 it('returns durable saved:true when provider refuses validation',async()=>{const h=handlerHarness({result:{failure_code:'authentication_rejected',workflow_count:null}});const response=await h.post({action:'save',expected_tenant_id:'tenant-a',base_url:'https://n8n.example',api_key:key});const body=await response.json();expect(body.saved).toBe(true);expect(body.outcome).toBe('needs_attention');expect(JSON.stringify(body)).not.toContain(key);expect(h.calls.find(c=>c.name==='begin_tenant_n8n_api_validation')?.args._expected_revision).toBe('revision')});
 it('retry validation never writes/resends browser credentials',async()=>{const h=handlerHarness();expect((await (await h.post({action:'validate',expected_tenant_id:'tenant-a'})).json()).outcome).toBe('connected');expect(h.calls.some(c=>c.name==='save_tenant_n8n_api_connection')).toBe(false)});
 it('does not report old connected result after concurrent disconnect',async()=>{const h=handlerHarness({finalHealth:'not_configured'});const body=await (await h.post({action:'validate',expected_tenant_id:'tenant-a'})).json();expect(body.outcome).toBe('stale');expect(body.connection.configured).toBe(false)});
 it('does not persist evidence after session loss',async()=>{const h=handlerHarness({sessionLost:true});expect((await h.post({action:'validate',expected_tenant_id:'tenant-a'})).status).toBe(401);expect(h.calls.some(c=>c.name==='finish_tenant_n8n_api_validation')).toBe(false)});
 it('uses strict atomic disconnect seam with expected tenant',async()=>{const h=handlerHarness({finalHealth:'not_configured'});expect((await (await h.post({action:'disconnect',expected_tenant_id:'tenant-a'})).json()).outcome).toBe('disconnected');expect(h.calls.find(c=>c.name==='disconnect_tenant_n8n_api_connection')?.args).toEqual({_expected_tenant_id:'tenant-a'});expect(h.validate).not.toHaveBeenCalled()});
 it('rejects oversized streamed bodies before save',async()=>{const h=handlerHarness();const response=await h.post({action:'save',expected_tenant_id:'tenant-a',api_key:'x'.repeat(20000)});expect(response.status).toBe(400);expect(h.calls).toHaveLength(0)});
 it('allows only configured exact CORS origins',async()=>{const h=handlerHarness();const allowed=await h.handler(new Request('https://fixture.supabase.co',{method:'OPTIONS',headers:{origin:'https://app.paigeagent.ai'}}));expect(allowed.status).toBe(204);expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.paigeagent.ai');expect((await h.handler(new Request('https://fixture.supabase.co',{method:'OPTIONS',headers:{origin:'https://evil.example'}}))).status).toBe(403)});
});
