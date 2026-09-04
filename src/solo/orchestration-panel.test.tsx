import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({tenant:'a',rpc:vi.fn()}));
vi.mock('@/hooks/useTenantContext',()=>({useTenantContext:()=>({activeTenantId:state.tenant,accountContextLoading:false})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:state.rpc}}));
import { OrchestrationPanel } from './orchestration-panel';
let root:Root|undefined;let container:HTMLDivElement;
async function renderPanel(){if(!root){container=document.createElement('div');document.body.append(container);root=createRoot(container);}await act(async()=>{root!.render(<OrchestrationPanel/>);});}
afterEach(async()=>{if(root)await act(async()=>root!.unmount());root=undefined;container?.remove();state.rpc.mockReset();state.tenant='a';});
describe('workspace orchestration overview',()=>{
  it('refuses a server response from a different active workspace',async()=>{
    state.rpc.mockResolvedValue({data:{tenant_id:'b',processes:[{name:'Foreign business'}],runs:[]},error:null});
    await renderPanel();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();expect(container.textContent).not.toContain('Foreign business');
  });
  it('drops a delayed previous-workspace response on a switch',async()=>{
    let complete:(value:unknown)=>void=()=>{};
    state.rpc.mockReturnValueOnce(new Promise(resolve=>{complete=resolve;})).mockResolvedValue({data:{tenant_id:'b',processes:[],runs:[]},error:null});
    await renderPanel();state.tenant='b';await renderPanel();
    expect(container.textContent).toContain('No delegated jobs recorded.');
    await act(async()=>complete({data:{tenant_id:'a',processes:[{registry_id:'x',name:'Old workspace',enabled:true,max_runs:1}],runs:[]},error:null}));
    expect(container.textContent).not.toContain('Old workspace');
  });
  it('renders unknown dispatch and cancellation honestly without internal IDs',async()=>{
    state.rpc.mockResolvedValue({data:{tenant_id:'a',processes:[],runs:[{run_id:'private-id',registry_id:'private-registry',status:'running',dispatch_state:'unknown',cancel_requested:true,created_at:'2026-09-04T00:00:00Z'}]},error:null});
    await renderPanel();expect(container.textContent).toContain('Outcome needs reconciliation');expect(container.textContent).not.toContain('private-id');
  });
});
