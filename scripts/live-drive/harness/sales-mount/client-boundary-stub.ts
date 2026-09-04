// Deterministic local adapters only; no production authorization or persistence proof.
import React from "react";
import { getHarnessTenant } from "./useSoloSalesOps-stub";
const rows = new Map<string, Array<Record<string, unknown>>>();
let saveMode = "success";
let finish: (() => void) | null = null;
export function setClientSaveMode(mode: string) { saveMode = mode; }
export function finishClientSave() { finish?.(); finish = null; }
export function getCreatedClients(tenant: string) { return rows.get(tenant) || []; }
function useRefresh() {
  const [, update] = React.useState(0);
  React.useEffect(()=>{const changed=()=>update(n=>n+1); window.addEventListener("sales-harness-tenant",changed); window.addEventListener("sales-harness-clients",changed); return()=>{window.removeEventListener("sales-harness-tenant",changed);window.removeEventListener("sales-harness-clients",changed);};},[]);
}
export function useTenantContext() {
  useRefresh(); const id=getHarnessTenant();
  return { activeTenantId:id, activeTenant:{id,name:"Review workspace",account_type:"standalone",parent_tenant_id:null},accountContextLoading:false, refresh:async()=>{},isPlatformOwner:false,isPlatformStaff:false };
}
export function useUserRoles() { return {loading:false,roles:["admin"],isAdmin:true}; }
export function useTenantRelationshipsData() {
  useRefresh(); return { people:getCreatedClients(getHarnessTenant()),peopleLoading:false,peopleError:false,peopleAvailable:true,retryPeople:async()=>window.dispatchEvent(new Event("sales-harness-clients")),deepLinkLoading:false,portalConfig:null,portalLoading:false,portalError:false,retryPortal:async()=>{} };
}
export const supabase = { rpc:async()=>({data:[],error:null}) };
export async function upsertRelationshipContact({ tenantId, patch }: {tenantId:string;patch:Record<string,unknown>}) {
  if (tenantId!==getHarnessTenant()) throw new Error("Workspace changed. Reopen this form.");
  const mode=saveMode;
  const complete=()=>{
    if (mode.includes("failure")) throw new Error("Client could not be saved. Try again.");
    const id=`review-client-${(rows.get(tenantId)||[]).length+1}`;
    const row={ id,name:String(patch.first_name||patch.entity_name||"Review client"),recordType:"person",firstName:patch.first_name||"",lastName:"",company:null,email:null,phone:null,title:null,website:null,location:null,source:"manual",status:"active",tags:[],doNotContact:false,sharedContextConsent:false,linkedUserId:null,relationship:"client",owner:null,lastTouch:null,createdAt:"2026-09-03T00:00:00Z",updatedAt:"2026-09-03T00:00:00Z" };
    rows.set(tenantId,[...(rows.get(tenantId)||[]),row]); window.dispatchEvent(new Event("sales-harness-clients")); return id;
  };
  if (mode.startsWith("delayed")) return new Promise<string>((resolve,reject)=>{finish=()=>{try{resolve(complete());}catch(e){reject(e);}};});
  return complete();
}
