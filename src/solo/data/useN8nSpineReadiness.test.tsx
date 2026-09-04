// @vitest-environment jsdom
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const h=vi.hoisted(()=>({tenant:"tenant-a",user:"owner-a",loading:false,rpc:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:h.rpc}}));
vi.mock("@/hooks/useTenantContext",()=>({useTenantContext:()=>({activeTenantId:h.tenant,activeUserId:h.user,loading:h.loading})}));
import {useN8nSpineReadiness} from "./useN8nSpineReadiness";
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const row=(tenant=h.tenant)=>({tenant_id:tenant,api:{state:"api_connected_zero",workflow_count:0,last_successful_check:null,action_needed:"none"},mcp:{state:"mcp_not_configured",oauth_readiness:"authorization_needed",approved_workflow_count:0,approved_tool_count:0,last_successful_check:null,action_needed:"connect_oauth"}});
let root:Root,value:ReturnType<typeof useN8nSpineReadiness>;const renders:Array<ReturnType<typeof useN8nSpineReadiness>>=[];
function Probe(){value=useN8nSpineReadiness();renders.push(value);return null;}
async function mount(){root=createRoot(document.createElement("div"));await act(async()=>root.render(<Probe/>));}
beforeEach(()=>{h.tenant="tenant-a";h.user="owner-a";h.loading=false;renders.length=0;h.rpc.mockImplementation(()=>Promise.resolve({data:row(),error:null}));});
afterEach(()=>{act(()=>root?.unmount());vi.clearAllMocks();});
describe("Mind n8n current source",()=>{
 it("reads only the safe RPC and keeps zero distinct from unconfigured MCP",async()=>{await mount();expect(h.rpc).toHaveBeenCalledExactlyOnceWith("get_n8n_spine_readiness");expect(value.data?.api.workflowCount).toBe(0);expect(value.data?.mcp.state).toBe("mcp_not_configured");});
 it.each(["tenant","user","loading"] as const)("suppresses prior evidence immediately on %s boundary",async boundary=>{await mount();const index=renders.length;h.rpc.mockReturnValue(new Promise(()=>{}));if(boundary==="tenant")h.tenant="tenant-b";else if(boundary==="user")h.user="owner-b";else h.loading=true;await act(async()=>root.render(<Probe/>));expect(renders.slice(index).every(r=>r.data===null)).toBe(true);});
 it("ignores a late response from a different workspace",async()=>{let finish!:(r:unknown)=>void;h.rpc.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));await mount();h.tenant="tenant-b";await act(async()=>root.render(<Probe/>));finish({data:row("tenant-a"),error:null});await act(async()=>{await Promise.resolve();});expect(value.data?.api.workflowCount).toBe(0);expect(value.error).toBe(false);});
 it("refuses server workspace mismatch",async()=>{h.rpc.mockResolvedValue({data:row("other"),error:null});await mount();expect(value.data).toBeNull();expect(value.error).toBe(true);});
 it("failed refresh clears prior evidence and retry recovers",async()=>{await mount();h.rpc.mockResolvedValueOnce({data:null,error:{message:"secret-provider-body"}});await act(async()=>value.refresh());expect(value.data).toBeNull();expect(value.error).toBe(true);expect(JSON.stringify(value)).not.toContain("secret");await act(async()=>value.refresh());expect(value.data?.api.workflowCount).toBe(0);expect(value.error).toBe(false);});
 it("older concurrent reads cannot overwrite latest refresh",async()=>{await mount();let finish!:(r:unknown)=>void;h.rpc.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));let first!:Promise<void>;act(()=>{first=value.refresh();});await act(async()=>value.refresh());finish({data:null,error:{message:"old"}});await act(async()=>first);expect(value.error).toBe(false);expect(value.data).not.toBeNull();});
});
