import React from 'react';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ThemeProvider,useTheme} from 'next-themes';
import {TenantCommandCenterShell} from '@/components/tenant-shell/TenantCommandCenterShell';
import {AgentPresenceProvider} from '@/components/ui/paige/AgentPresenceContext';
import {SoloPaigeWorkspace} from '@/solo/SoloPaigeWorkspace';
import {GrowthHub} from '@/solo/growth2';
import {useTenantContext} from './tenant';
const query=new QueryClient({defaultOptions:{queries:{retry:false}}});
function Content(){const{resolvedTheme}=useTheme();const{activeTenantId}=useTenantContext();return <TenantCommandCenterShell accountName={'Local context '+activeTenantId} accountType="solo" userRole="admin" onSignOut={()=>{}} brandHomeHref="/solo/local/command-center" soloPaigeWorkspace={<SoloPaigeWorkspace key={activeTenantId}/>}><div className="paige-solo" data-theme={resolvedTheme} style={{height:'100%',minHeight:0}}><div style={{display:'flex',height:'100%',overflow:'hidden'}}><main data-solo-screen-host style={{flex:1,overflow:'hidden',minHeight:0,minWidth:0}}><GrowthHub/></main></div></div></TenantCommandCenterShell>}
export function CanonicalShell(){return <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}><QueryClientProvider client={query}><BrowserRouter><AgentPresenceProvider launcherEnabled={false} hasChatBody><Routes><Route path="/solo/:account/*" element={<Content/>}/></Routes></AgentPresenceProvider></BrowserRouter></QueryClientProvider></ThemeProvider>}
