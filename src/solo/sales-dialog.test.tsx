import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {useSalesDraftExit} from './sales-dialog';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>;let host:HTMLDivElement;
function Harness(){const [draft,setDraft]=React.useState('');const guard=useSalesDraftExit(draft,false,()=>{});return <div><input value={draft} onChange={e=>setDraft(e.target.value)}/>{guard.confirmation}</div>;}
function open(){history.replaceState(null,'','/solo/alpha/growth/sales');host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<Harness/>));const input=host.querySelector('input')!;act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'dirty');input.dispatchEvent(new Event('input',{bubbles:true}));});}
afterEach(()=>{act(()=>root?.unmount());host?.remove();history.replaceState(null,'','/');vi.restoreAllMocks();});
it('fallback protects same-account Back with a visible choice',()=>{open();act(()=>{history.replaceState(null,'','/solo/alpha/growth/catalog');window.dispatchEvent(new PopStateEvent('popstate',{state:null}));});expect(location.pathname).toBe('/solo/alpha/growth/sales');expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();expect(document.activeElement?.textContent).toBe('Continue editing');});
it('fallback permits a different-account Back without retaining its draft',()=>{open();const listener=vi.fn();window.addEventListener('popstate',listener);act(()=>{history.replaceState(null,'','/solo/beta/growth/sales');window.dispatchEvent(new PopStateEvent('popstate',{state:null}));});expect(host.querySelector('[role="alertdialog"]')).toBeNull();expect(listener).toHaveBeenCalledTimes(1);window.removeEventListener('popstate',listener);});