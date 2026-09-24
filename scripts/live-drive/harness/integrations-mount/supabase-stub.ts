/** Local transport fixtures only. Real Solo components and hooks remain under measurement. */
import { currentHarnessTenantId } from './tenant-context-stub';
const mode = () => new URLSearchParams(window.location.search).get('data') || 'empty';
const apiRows = new Map<string, Record<string, unknown>>();
const mcpRows = new Map<string, Record<string, unknown>>();
const none = () => ({ configured: false, status: 'unconfigured' });
const emptyApi = (tenant: string) => ({tenant_id:tenant,can_write:mode()!=='readonly',configured:false,label:null,base_url:null,health:'not_configured',failure_code:null,workflow_count:null,checked_at:null,last_success_at:null});
function apiRow() {
 const tenant=currentHarnessTenantId();
 if(!apiRows.has(tenant))apiRows.set(tenant,tenant.endsWith('-b')||mode()==='empty'?emptyApi(tenant):{...emptyApi(tenant),configured:true,label:'Harness instance',base_url:'https://harness.example.invalid',health:mode()==='connected'?'connected':mode()==='saved-only'||mode()==='pending'?'saved_unverified':'needs_attention',failure_code:mode()==='connected'||mode()==='saved-only'||mode()==='pending'?null:'authentication_rejected',workflow_count:mode()==='connected'?0:null,checked_at:mode()==='saved-only'?null:'2026-09-03T12:00:00Z',last_success_at:mode()==='connected'?'2026-09-03T12:00:00Z':null});
 return apiRows.get(tenant);
}
function mcpRow(){
 const tenant=currentHarnessTenantId();
 if(!mcpRows.has(tenant))mcpRows.set(tenant,tenant.endsWith('-b')||mode()==='empty'?none():{configured:true,enabled:true,status:mode()==='connected'||mode()==='readonly'?'connected':'error',auth_kind:'bearer',transport:'http',server_url_host:'harness.example.invalid',last_probed_at:'2026-09-03T12:00:00Z',tool_count:mode()==='connected'?2:null,approved_capabilities:mode()==='connected'?['fixture_read']:[],pinned_count:mode()==='connected'?1:0});
 return mcpRows.get(tenant);
}
/** Gateway tool rows, keyed to the same `?data=` vocabulary the rest of this stub uses. */
function gatewayRows(){
 const tenant=currentHarnessTenantId();
 if(tenant.endsWith('-b')||mode()==='empty')return [];
 const base={provider_key:'generic-remote',transport:'http',auth_kind:'bearer',configured:true,enabled:true,visibility:'tenant',granted_scopes:[] as string[]};
 return [
  {...base,connection_id:'harness-tool-1',label:'Scheduling tool',status:'connected',health:'healthy',server_url_host:'scheduling.example.invalid',last_checked_at:'2026-09-20T10:00:00Z',tool_count:6,approved_count:2},
  {...base,connection_id:'harness-tool-2',label:'Docs tool',status:'pending_verification',health:'unknown',server_url_host:'docs.example.invalid',last_checked_at:null,tool_count:0,approved_count:0},
  {...base,connection_id:'harness-tool-3',label:'Billing tool',status:'error',health:'needs_attention',server_url_host:'billing.example.invalid',last_checked_at:'2026-09-19T08:00:00Z',tool_count:0,approved_count:0},
 ];
}
const ok=(data:unknown=null)=>Promise.resolve({data,error:null});
const fail=(message:string)=>Promise.resolve({data:null,error:{message}});
const pending:Array<()=>void>=[];
window.addEventListener('n8n-harness-finish',()=>pending.splice(0).forEach(f=>f()));
const delayed=(run:()=>Record<string,unknown>)=>mode()==='pending'?new Promise(resolve=>pending.push(()=>resolve({data:run(),error:null}))):ok(run());
export const supabase={
 rpc:(name:string)=>{
  if(name==='get_n8n_connection_readiness')return mode()==='error'||mode()==='mcp-error'?fail('fixture-read-refused'):ok({tenant_id:currentHarnessTenantId(),can_manage:mode()!=='readonly',api:{},mcp:{state:mcpRow()?.configured?'oauth_needed':'not_configured',auth_kind:mcpRow()?.auth_kind??null,oauth_readiness:'ready',approved_workflow_count:0,approved_tool_count:0,server_url:'https://harness.example.invalid/mcp-server/http'}});
  if(name==='get_tenant_n8n_api_readiness')return mode()==='error'||mode()==='api-error'?fail('fixture-read-refused'):ok(apiRow());
  if(name==='get_tenant_mcp_connections')return mode()==='error'||mode()==='mcp-error'?fail('fixture-read-refused'):ok({n8n:mcpRow(),zapier:none()});
  // The registry-native MCP gateway read (G1b). Host + aggregates only, exactly as
  // `get_mcp_connections_v2` projects it — no secret is representable in this shape.
  if(name==='get_mcp_connections_v2')return mode()==='error'||mode()==='gateway-error'?fail('fixture-read-refused'):ok(gatewayRows());
  if(name==='is_current_user_tenant_admin')return ok(mode()!=='readonly');
  return ok();
 },
 functions:{invoke:(name:string,options:{body?:Record<string,unknown>})=>{
  const body=options?.body??{};const tenant=currentHarnessTenantId();
  if(body.expected_tenant_id!==tenant||mode()==='readonly'||mode()==='refused')return ok({error:'forbidden'});
  if(name==='tenant-mcp-connect'&&body.action==='disconnect'){mcpRows.set(tenant,none());return ok({ok:true});}
  // The registry-native gateway door (Slice ④). Only the two actions the catalogue sign-in flow
  // spends are served, and deliberately so: `create` acknowledges the credential-less shell row,
  // and `oauth_begin` REFUSES under ?data=signin-fail so the retry state — the one where the name
  // is locked because `set_mcp_connection_endpoint` carries no label — can be rendered at all.
  // Without a refusal the flow navigates to a provider and the state is unreachable in a harness.
  if(name==='mcp-gateway'){
   if(body.action==='create')return ok({connection_id:'harness-shell-1',status:'pending_verification'});
   if(body.action==='oauth_begin')return mode()==='signin-fail'
    ?ok({error:'discovery_failed'})
    :ok({authorize_url:'https://provider.example.invalid/authorize?harness=1'});
   return ok({error:'unavailable'});
  }
  if(name!=='tenant-n8n-api-connect')return ok({error:'unavailable'});
  if(body.action==='disconnect'){apiRows.set(tenant,emptyApi(tenant));return ok({ok:true,outcome:'disconnected',connection:apiRow()});}
  if(body.action!=='save'&&body.action!=='validate')return ok({error:'operation_failed'});
  let address=String(apiRow()?.base_url??'');
  if(body.action==='save'){
   let url:URL;try{url=new URL(String(body.base_url));}catch{return ok({error:'save_failed'});}
   if(url.protocol!=='https:'||url.username||url.password)return ok({error:'save_failed'});
   address=url.origin;
  }
  // The submitted fixture key is neither retained nor returned.
  return delayed(()=>{
   if(tenant!==currentHarnessTenantId())return {ok:true,outcome:'stale',connection:apiRow()};
   const failed=['save-refused','permission-refused','endpoint-error','provider-error'].includes(mode());
   const failure=mode()==='save-refused'?'authentication_rejected':mode()==='permission-refused'?'request_refused':mode()==='endpoint-error'?'endpoint_not_found':'provider_unavailable';
   const connection={...emptyApi(tenant),configured:true,label:'Harness instance',base_url:address,health:failed?'needs_attention':'connected',failure_code:failed?failure:null,workflow_count:failed?null:0,checked_at:'2026-09-03T23:59:00Z',last_success_at:failed?null:'2026-09-03T23:59:00Z'};
   apiRows.set(tenant,connection);return {ok:true,saved:body.action==='save',outcome:failed?'needs_attention':'connected',connection};
  });
 }}
};
export default {supabase};
