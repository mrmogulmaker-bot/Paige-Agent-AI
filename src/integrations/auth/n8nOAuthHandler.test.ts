/* eslint-disable @typescript-eslint/no-explicit-any -- Runtime-transpiled Deno test ports deliberately model dynamic RPC responses. */
// @vitest-environment node
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect,vi} from 'vitest';
// Execute the real Deno handler with injectable network/DB ports, not a rewritten model.
function load(source:string,ports:Record<string,unknown>,deno?:unknown):any{
 const exports={};
 const js=ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports','Deno',js)((name:string)=>{if(!(name in ports))throw Error(`unmocked ${name}`);return ports[name];},exports,deno);
 return exports;
}
const server={issuer:'https://n8n.example',authorizationEndpoint:'https://n8n.example/authorize',tokenEndpoint:'https://n8n.example/token',registrationEndpoint:'https://n8n.example/register',revocationEndpoint:'https://n8n.example/revoke',scopesSupported:['workflow:read','workflow:write']};
const callback='https://fixture.supabase.co/functions/v1/tenant-n8n-oauth';
const payload={server,client:{clientId:'fixture-client',clientSecret:null},resource:'https://n8n.example/mcp-server/http',redirect_uri:callback,verifier:'fixture-verifier'};
const tokens={accessToken:'secret-access',refreshToken:'secret-refresh',expiresAt:'2099-01-01T00:00:00Z',scopes:['workflow:read','workflow:write']};
function harness(options:{owner?:boolean;rpc?:(op:string,input:any)=>any;expired?:boolean;workflows?:unknown[];tokens?:any}={}){
 const calls:{op:string,input:any}[]=[];
 const readiness={tenant_id:'tenant-a',can_manage:options.owner??true,api:{state:'api_connected_zero'},mcp:{state:'connected_no_approved_tools',auth_kind:'oauth'}};
 const oauth={createPkce:async()=>({verifier:'verifier',challenge:'challenge'}),createState:()=> 's'.repeat(43),registerClient:async()=>payload.client,buildAuthorizationUrl:()=>server.authorizationEndpoint,
  exchangeCode:vi.fn(async()=>options.tokens??tokens),refreshTokens:vi.fn(async()=>options.tokens??tokens),revokeToken:vi.fn(async()=>true),isExpired:()=>options.expired??false,
  discoverAuthorizationServer:async()=>server,discoverProtectedResource:async()=>({resource:payload.resource,authorizationServers:[server.issuer]})};
 class McpError extends Error{}
 const client={McpError,withApprovedCapabilitySession:async(_opts:any,body:any)=>body({tools:[{name:'search_workflows',schemaHash:'schema'}],call:async()=>({structuredContent:{data:options.workflows??[],count:options.workflows?.length??0}})})};
 const helper=load('supabase/functions/_shared/n8n-oauth.ts',{'./mcp-oauth.ts':oauth,'./mcp-client.ts':client,'./ssrfGuard.ts':{safeFetch:async()=>({status:200,truncated:false,body:JSON.stringify({issuer:server.issuer,authorization_response_iss_parameter_supported:true})})}});
 const admin={rpc:async(_name:string,args:any)=>{
  calls.push({op:args._operation,input:args._input});
  const override=options.rpc?.(args._operation,args._input);
  if(override?.error)return override;
  if(override!==undefined)return {data:override,error:null};
  if(args._operation==='consume')return {data:{attempt_id:'attempt',account_number:'100001',payload}};
  if(args._operation==='launch')return {data:{authorization_url:server.authorizationEndpoint}};
  if(args._operation==='acquire')return {data:{lease:'lease',generation:'generation',approved_ids:[],server_url:payload.resource,access_token:tokens.accessToken,refresh_token:tokens.refreshToken,expires_at:tokens.expiresAt,issuer:server.issuer,client_id:'client',client_secret:null}};
  return {data:{ok:true}};
 }};
 const user={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async()=>({data:readiness})};
 let handler:(req:Request)=>Promise<Response>=null!;
 load('supabase/functions/tenant-n8n-oauth/index.ts',{'https://esm.sh/@supabase/supabase-js@2.57.4':{createClient:(_url:string,key:string)=>key==='service'?admin:user},'../_shared/mcp-oauth.ts':oauth,'../_shared/mcp-client.ts':client,'../_shared/n8n-oauth.ts':helper},
  {env:{get:(name:string)=>({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'anon',PUBLIC_SITE_URL:'https://paigeagent.ai'}[name])},serve:(fn:any)=>handler=fn});
 const post=(body:unknown)=>handler(new Request(callback,{method:'POST',headers:{'content-type':'application/json',origin:'https://paigeagent.ai',authorization:'Bearer x.'+btoa(JSON.stringify({session_id:'20000000-0000-0000-0000-000000000001'}))+'.x'},body:JSON.stringify(body)}));
 const consent=(query='code=fixture-code')=>handler(new Request(`${callback}?state=${'s'.repeat(43)}&${query}`,{headers:{cookie:`__Host-paige-n8n-oauth=${'s'.repeat(43)}`}}));
 return {handler,post,consent,calls,oauth,helper};
}
describe('n8n owner OAuth executed handler',()=>{
 it.each(['https://paigeagent.ai','https://app.paigeagent.ai'])('allows preflight for %s',async origin=>{const h=harness();const res=await h.handler(new Request(callback,{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'authorization,content-type'}}));expect(res.status).toBe(204);expect(res.headers.get('access-control-allow-origin')).toBe(origin)});
 it('refuses hostile preflight',async()=>{const h=harness();const res=await h.handler(new Request(callback,{method:'OPTIONS',headers:{origin:'https://evil.example'}}));expect(res.status).toBe(403);expect(res.headers.get('access-control-allow-origin')).toBeNull()});
 it('refuses non-owner before any provider or service operation',async()=>{const h=harness({owner:false});expect((await h.post({action:'begin',expected_tenant_id:'tenant-a'})).status).toBe(403);expect(h.calls).toEqual([])});
 it('refuses cross-workspace expectation',async()=>{const h=harness();expect((await h.post({action:'begin',expected_tenant_id:'tenant-b'})).status).toBe(409);expect(h.calls).toEqual([])});
 it('begin refuses a verified JWT without a session identifier',async()=>{const h=harness();const res=await h.handler(new Request(callback,{method:'POST',headers:{'content-type':'application/json',origin:'https://paigeagent.ai',authorization:'Bearer x.'+btoa('{}')+'.x'},body:JSON.stringify({action:'begin',expected_tenant_id:'tenant-a',server_url:payload.resource})}));expect(res.status).toBe(401);expect(h.calls).toEqual([])});
 it('begin returns only form launch tickets, no OAuth secrets',async()=>{const h=harness();const res=await h.post({action:'begin',expected_tenant_id:'tenant-a',server_url:payload.resource});const body=await res.json();expect(Object.keys(body).sort()).toEqual(['launch_proof','launch_ticket','launch_url']);expect(h.calls[0].input.launch_proof_hash).toHaveLength(64);expect(JSON.stringify(body)).not.toContain('verifier')});
 it.each([undefined,'null','https://evil.example'])('rejects launch origin %s',async(origin)=>{const h=harness();const headers:Record<string,string>={'content-type':'application/x-www-form-urlencoded'};if(origin)headers.origin=origin;const res=await h.handler(new Request(callback,{method:'POST',headers,body:`launch_ticket=${'s'.repeat(43)}&launch_proof=${'s'.repeat(43)}`}));expect(res.status).toBe(403);expect(h.calls).toEqual([])});
 it('rejects transferable GET launch and duplicate form fields',async()=>{const h=harness();expect((await h.handler(new Request(`${callback}?launch=${'s'.repeat(43)}`))).headers.get('set-cookie')).toContain('Max-Age=0');const res=await h.handler(new Request(callback,{method:'POST',headers:{origin:'https://paigeagent.ai','content-type':'application/x-www-form-urlencoded'},body:'launch_ticket=a&launch_ticket=b&launch_proof=c'}));expect(res.status).toBe(403);expect(h.calls).toEqual([])});
 it('same-origin POST sets secure callback cookie only after atomic proof',async()=>{const h=harness();const res=await h.handler(new Request(callback,{method:'POST',headers:{origin:'https://app.paigeagent.ai','content-type':'application/x-www-form-urlencoded'},body:`launch_ticket=${'s'.repeat(43)}&launch_proof=${'p'.repeat(43)}`}));expect(res.status).toBe(303);expect(res.headers.get('set-cookie')).toContain('Secure; HttpOnly; SameSite=Lax');expect(h.calls[0].input.launch_proof_hash).toHaveLength(64)});
 it('rejects an alternate callback path before state consumption',async()=>{const h=harness();const res=await h.handler(new Request(callback+'/extra?state='+ 's'.repeat(43)+'&code=fixture',{headers:{cookie:'__Host-paige-n8n-oauth='+ 's'.repeat(43)}}));expect(res.headers.get('location')).toContain('n8n_oauth=failed');expect(h.calls).toEqual([]);expect(h.oauth.exchangeCode).not.toHaveBeenCalled()});
 it('denial never exchanges a code and returns a safe workspace status',async()=>{const h=harness();const res=await h.consent('error=access_denied&error_description=secret-provider-text');expect(res.headers.get('location')).toBe('https://paigeagent.ai/solo/100001/settings/integrations?n8n_oauth=refused');expect(h.oauth.exchangeCode).not.toHaveBeenCalled();expect(await res.text()).toBe('')});
 it('success returns no authorization code/token and stores scoped grant',async()=>{const h=harness();const res=await h.consent();expect(res.headers.get('location')).toContain('n8n_oauth=success');expect(h.calls.at(-1)?.op).toBe('finish');expect(res.headers.get('location')).not.toContain('fixture-code');expect(await res.text()).toBe('')});
 it.each(['cancelled','expired'])('revokes newly issued grant if finish becomes %s',async(kind)=>{const h=harness({rpc:op=>op==='finish'?kind==='expired'?{expired:true}:{error:{message:'N8N_STALE_OPERATION'}}:undefined});const res=await h.consent();expect(res.headers.get('location')).toContain(`n8n_oauth=${kind === "expired" ? "expired" : "failed"}`);expect(h.oauth.revokeToken).toHaveBeenCalledWith(expect.objectContaining({token:'secret-refresh'}))});
 it.each([['workflow:read'],['workflow:write'],['workflow:read','workflow:write','workflow:execute'],['workflow:read','workflow:read']])('refuses missing/overbroad scope set %j',async scopes=>{const h=harness({tokens:{...tokens,scopes}});expect((await h.consent()).headers.get('location')).toContain('n8n_oauth=failed');expect(h.oauth.revokeToken).toHaveBeenCalled()});
 it('accepts exact read and write scopes in either order',async()=>{const h=harness({tokens:{...tokens,scopes:['workflow:write','workflow:read']}});expect((await h.consent()).headers.get('location')).toContain('n8n_oauth=success')});
 it('refuses missing/overbroad token scopes and revokes upstream grant',async()=>{const h=harness({tokens:{...tokens,scopes:['workflow:read','workflow:execute']}});expect((await h.consent()).headers.get('location')).toContain('n8n_oauth=failed');expect(h.oauth.revokeToken).toHaveBeenCalled()});
 it('revokes rotating token when disconnect invalidates commit',async()=>{const h=harness({expired:true,tokens:{...tokens,refreshToken:'rotated-refresh'},rpc:op=>op==='rotate'?{error:{message:'N8N_STALE_OPERATION'}}:undefined});const res=await h.post({action:'verify',expected_tenant_id:'tenant-a'});expect(res.status).toBe(400);expect(h.oauth.revokeToken).toHaveBeenCalledWith(expect.objectContaining({token:'rotated-refresh'}));expect(h.calls.at(-1)?.op).toBe('release')});
 it.each(['id','name'])('rejects token echo in workflow %s',async field=>{const h=harness({workflows:[{id:'wf1',name:'Preview',availableInMCP:true,[field]:'secret-access'}]});const res=await h.post({action:'discover',expected_tenant_id:'tenant-a'});expect(res.status).toBe(400);expect(await res.text()).not.toContain('secret-access');expect(h.calls.some(c=>c.op==='snapshot')).toBe(false)});
 it('filters non-exposed workflows and strips internals',()=>{const h=harness();const parsed=h.helper.parseWorkflowPreviews({structuredContent:{count:2,data:[{id:'one',name:'One',availableInMCP:true,description:'customer-payload'},{id:'two',name:'Two',availableInMCP:false}]}});expect(parsed.workflows).toEqual([{id:'one',name:'One'}]);expect(JSON.stringify(parsed)).not.toContain('customer-payload')});
 it('rejects truncated inventory instead of reporting false zero',()=>{expect(()=>harness().helper.parseWorkflowPreviews({structuredContent:{count:201,data:[]}})).toThrow('workflow_inventory_incomplete')});
 it('rejects unknown workflow approval',()=>{expect(()=>harness().helper.validateApproval(['other'],[{id:'one',name:'One'}])).toThrow('approval_changed')});
});
