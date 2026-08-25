// @ts-nocheck
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTheme } from "next-themes";
import { performSignOut } from "@/lib/auth/signOut";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { useTenantContext } from "@/hooks/useTenantContext";
import { branchBySlug, branchByKey, branchPath, defaultBranchSlug } from "@/lib/routing/tierBranches";
import "./solo-tokens.css";
import { Ic, Logo, Avatar, Wrap, PageHead } from "./_shared";
import { CommandHub } from "./CommandCenter";
import { PaigeHub } from "./paigehub";
import { TrustCompass } from "./compass";
import { AutomationsHub } from "./automations-build";
import { ClientsHub } from "./conversations";
import { GrowthHub } from "./growth2";
import { CalendarHub } from "./calendar-book";
import { Analytics2 } from "./analytics2";
import { Marketplace } from "./marketplace";
import { VaultView } from "./vault";
import { Integrations } from "./integrations";
import { TeamHub } from "./team";
import { Setup } from "./setup";
import { VibeStudio } from "./vibe";
import { TenantCommandCenterShell } from "@/components/tenant-shell/TenantCommandCenterShell";
import { AgentPresenceProvider, useAgentPresence } from "@/components/ui/paige";
import { VoiceDeviceProvider } from "@/lib/voice/VoiceDeviceProvider";
import { DialPadSurface } from "@/components/admin/voice/DialPadSurface";
import { IncomingCallOverlay } from "@/components/admin/voice/IncomingCallOverlay";
import { LiveTranscriptPanel } from "@/components/admin/voice/LiveTranscriptPanel";

const NAV=[['home','Command Center',()=><Ic.grid/>],['paige','Paige',()=><Ic.spark/>],['compass','Trust Compass',()=><Ic.shield/>],['auto','Automations',()=><Ic.bolt/>],['clients','Clients',()=><Ic.users/>],['cal','Calendar',()=><Ic.cal/>],['growth','Growth',()=><Ic.trend/>],['analytics','Analytics',()=><Ic.chart/>]];
const NAV2=[['market','Marketplace',()=><Ic.store/>],['vault','Business Vault',()=><Ic.vault/>],['integrations','Integrations',()=><Ic.bolt/>],['team','Team',()=><Ic.users/>],['setup','Setup',()=><Ic.gear/>]];

const Rail=({route,go,collapsed,setCollapsed,homeCount})=>{const w=collapsed?70:238;
const Item=([k,label,Icn])=>{const on=route===k;
return <button key={k} onClick={()=>go(k)} title={label} className="row" style={{width:'100%',gap:12,padding:collapsed?'10px':'9px 12px',borderRadius:11,marginBottom:2,
justifyContent:collapsed?'center':'flex-start',background:on?'var(--rail-2)':'transparent',color:on?'#fff':'var(--rail-text)',position:'relative',transition:'.15s'}}
onMouseEnter={e=>{if(!on)e.currentTarget.style.background='rgba(255,255,255,.05)'}} onMouseLeave={e=>{if(!on)e.currentTarget.style.background='transparent'}}>
{on&&<span style={{position:'absolute',left:collapsed?6:0,top:'50%',transform:'translateY(-50%)',width:3,height:18,borderRadius:3,background:'var(--gold-bright)'}}/>}
<span style={{display:'flex',color:on?'var(--gold-bright)':'inherit'}}>{Icn()}</span>
{!collapsed&&<span className="grow trunc" style={{fontSize:13.4,fontWeight:on?600:450,textAlign:'left'}}>{label}</span>}
{!collapsed&&k==='home'&&homeCount>0&&<span className="pill" style={{background:'var(--gold-bright)',color:'#2A1C00',height:19,padding:'0 7px'}}>{homeCount}</span>}</button>};
return <nav style={{width:w,flex:'none',background:'var(--rail)',display:'flex',flexDirection:'column',padding:collapsed?'16px 12px':'16px 14px',transition:'width .22s',overflowX:'hidden',overflowY:'auto'}}>
<div className="row" style={{gap:10,padding:collapsed?'0 0 18px':'2px 4px 18px',justifyContent:collapsed?'center':'flex-start'}}>
<Logo size={collapsed?24:26}/>{!collapsed&&<div className="grow" style={{minWidth:0}}>
<div style={{color:'#fff',fontWeight:600,fontSize:14.5,letterSpacing:'-.02em'}}>Paige Agent AI</div>
<div style={{color:'var(--rail-text)',fontSize:10.5,letterSpacing:'.1em',textTransform:'uppercase',marginTop:1}}>Solo workspace</div></div>}</div>
{NAV.map(Item)}
<div style={{height:1,background:'var(--rail-line)',margin:'14px 4px'}}/>
{!collapsed&&<div style={{color:'var(--rail-text)',fontSize:10,letterSpacing:'.14em',textTransform:'uppercase',padding:'0 12px 8px',opacity:.7}}>Platform</div>}
{NAV2.map(Item)}
<div style={{marginTop:'auto',paddingTop:14,flex:'none'}}>
{!collapsed&&<div style={{border:'1px solid var(--rail-line)',borderRadius:14,padding:'12px 13px',marginBottom:10}}>
{/* §13 — the "147 hours saved this month" line that sat under this chip was fixture
copy with no backend seam, so it is stripped rather than replaced. "Solo plan" is
tier-accurate on this shell and stays. */}
<div className="row" style={{gap:7,color:'var(--gold-bright)',fontSize:12,fontWeight:600}}><Ic.bolt size={13}/>Solo plan</div></div>}
<button onClick={()=>setCollapsed(!collapsed)} className="row" style={{width:'100%',justifyContent:'center',padding:9,borderRadius:10,color:'var(--rail-text)'}}>
<span style={{display:'flex',transform:collapsed?'':'rotate(180deg)',transition:'.2s'}}><Ic.chev size={15}/></span></button></div></nav>};

const TopBar=({theme,setTheme,openPaige,route,go})=>{const title=[...NAV,...NAV2].find(n=>n[0]===route)?.[1]||'';
const[menu,setMenu]=React.useState(false);
const[foc,setFoc]=React.useState(false);
const mref=React.useRef(null);
React.useEffect(()=>{if(!menu)return;
const onDoc=e=>{if(mref.current&&!mref.current.contains(e.target))setMenu(false)};
const onEsc=e=>{if(e.key==='Escape')setMenu(false)};
window.addEventListener('mousedown',onDoc);window.addEventListener('keydown',onEsc);
return()=>{window.removeEventListener('mousedown',onDoc);window.removeEventListener('keydown',onEsc)}},[menu]);
return <header className="row" style={{height:56,flex:'none',padding:'0 22px',borderBottom:'1px solid var(--line)',background:'var(--surface)',gap:14,zIndex:20}}>
<div className="row" style={{gap:9,fontSize:13,color:'var(--ink-3)',flex:'none',whiteSpace:'nowrap'}}>
<span className="row" style={{gap:7,fontWeight:500,color:'var(--ink)',whiteSpace:'nowrap'}}>Jordan Avery</span>
<Ic.chev size={13}/><span style={{whiteSpace:'nowrap'}}>{title}</span></div>
<div className="row grow hide-1100" style={{justifyContent:'center',minWidth:0}}>
<div className="row" style={{gap:8,height:32,flex:'0 1 400px',minWidth:0,padding:'0 12px',border:'1px solid var(--line)',borderRadius:10,background:'var(--surface-2)',color:'var(--ink-3)'}}>
<Ic.search size={14}/><span className="trunc" style={{fontSize:12.8}}>Search clients, threads, obligations</span>
<span className="mono" style={{marginLeft:'auto',fontSize:11,padding:'1px 5px',border:'1px solid var(--line)',borderRadius:5}}>⌘K</span></div></div>
<div className="row" style={{gap:6,flex:'none',marginLeft:'auto'}}>
<span className="pill pill-n hide-1280" style={{height:26,flex:'none'}}>Provided by Northwind Partners</span>
<button className="btn btn-s" style={{width:30,padding:0,justifyContent:'center'}} onClick={openPaige} title="Ask Paige"><Ic.spark size={15}/></button>
<button className="btn btn-s" style={{width:30,padding:0,justifyContent:'center',position:'relative'}}><Ic.bell size={15}/>
<span style={{position:'absolute',top:5,right:6,width:6,height:6,borderRadius:'50%',background:'var(--bad)'}}/></button>
<button className="btn btn-s" style={{width:30,padding:0,justifyContent:'center'}} onClick={()=>setTheme(theme==='dark'?'light':'dark')} title="Theme">{theme==='dark'?<Ic.sun size={15}/>:<Ic.moon size={15}/>}</button>
<div ref={mref} style={{position:'relative',flex:'none'}}>
<button onClick={()=>setMenu(v=>!v)} title="Account" aria-haspopup="menu" aria-expanded={menu}
onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)}
style={{padding:0,border:'none',background:'transparent',cursor:'pointer',borderRadius:'50%',display:'flex',outline:'none',boxShadow:(menu||foc)?'0 0 0 2px var(--violet)':'none'}}>
<Avatar name="Jordan Avery" size={28} tone="var(--violet)"/></button>
{menu&&<div role="menu" className="fade-in" style={{position:'fixed',top:58,right:16,zIndex:200,width:220,background:'var(--surface)',border:'1px solid var(--line)',borderRadius:12,boxShadow:'var(--sh-3)',padding:6,overflow:'hidden'}}>
<div style={{padding:'8px 10px 6px'}}>
<div style={{fontSize:13,fontWeight:600,color:'var(--ink)'}}>Jordan Avery</div>
<div style={{fontSize:11.5,color:'var(--ink-3)'}}>Solo workspace</div></div>
<div style={{height:1,background:'var(--line-soft)',margin:'2px 0 4px'}}/>
<button role="menuitem" onClick={()=>{setMenu(false);go('setup')}} className="row"
style={{width:'100%',gap:10,padding:'9px 10px',borderRadius:8,fontSize:13,color:'var(--ink)',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}
onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}
onFocus={e=>e.currentTarget.style.background='var(--surface-2)'} onBlur={e=>e.currentTarget.style.background='transparent'}>
<Ic.gear size={15}/><span className="grow">Setup &amp; account</span></button>
<button role="menuitem" onClick={()=>{setMenu(false);performSignOut({redirectTo:'/'})}} className="row"
style={{width:'100%',gap:10,padding:'9px 10px',borderRadius:8,fontSize:13,color:'var(--bad)',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}
onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}
onFocus={e=>e.currentTarget.style.background='var(--surface-2)'} onBlur={e=>e.currentTarget.style.background='transparent'}>
<Ic.arrow size={15}/><span className="grow">Sign out</span></button></div>}
</div></div></header>};

const Stub=({title,sub})=>(<Wrap max={900}><PageHead eyebrow="Coming into view" title={title} sub={sub}/>
<div className="card" style={{padding:'54px 30px',textAlign:'center'}}>
<div className="tile" style={{margin:'0 auto 14px',width:44,height:44,borderRadius:15,background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.spark size={22}/></div>
<div style={{fontWeight:600,fontSize:15}}>Not part of this pass</div>
<div className="sub" style={{maxWidth:380,margin:'6px auto 0'}}>Command Center, Paige, Clients, Growth, and Analytics are designed. Say the word and this one is next.</div></div></Wrap>);

const SoloAppContent=()=>{
// §65 R3d-i — every tab is its own deep-linkable route (/solo/{account}/{branch}).
// The screen `route` is DERIVED from the URL slug via the TIER_BRANCHES registry,
// and `go(k)` NAVIGATES rather than mutating local state (mirrors AgencyApp.tsx's
// R0-slice-2/R3c-i conversion, §18 same shell-conversion pattern, tier-parameterized).
// DUAL-MODE (§58): when mounted INLINE without a :account param (Admin.tsx's Solo
// gate, before account_number resolves), it falls back to local state so that path
// stays byte-unchanged. Solo has no act-as/children concept (unlike AgencyApp), so
// there is no sub-prefix parsing here — this is the simpler leg.
const urlParams = useParams();
const navigate = useNavigate();
const { expandRail } = useAgentPresence();
const { resolvedTheme } = useTheme();
const urlAccount = urlParams.account || null;
const urlDriven = !!urlAccount;
const urlBranchSlug = urlDriven ? ((urlParams["*"] || "").split("/")[0] || defaultBranchSlug("solo")) : null;
const[stateRoute,setStateRoute]=React.useState('home');
const route = urlDriven ? (branchBySlug("solo", urlBranchSlug)?.key ?? "home") : stateRoute;
// Real approvals count for the rail's Command Center badge (§13 — hidden when 0).
// Own instance (unique realtime topic via the hook's useId); scope:'all' matches
// the Command Center's own read so the badge and the queue agree.
const{items:railApprovals}=usePendingApprovals({scope:'all'});
// Setup renders the shell's OWN designed Setup (setup.tsx) IN-SHELL — never the
// old /admin/setup view (owner directive 2026-08-16). Every nav item drives the shell.
const go = (k) => {
  if (urlDriven) {
    const slug = branchByKey("solo", k)?.slug ?? defaultBranchSlug("solo");
    navigate(branchPath("solo", urlAccount, slug));
  } else {
    setStateRoute(k);
  }
};
// §39 (mirrors task #171/#526) — the /solo/{n} address is NOT authority (§9); RLS
// gates every read. Keep the URL honest: redirect a number that isn't the caller's
// own account to their own, and canonicalize a bare /solo/{n} -> its default branch.
// Acts ONLY once the caller's own account_number is known, so a mid-load null never
// bounces.
const { activeTenant } = useTenantContext();
const urlSplat = urlParams["*"] || "";
React.useEffect(() => {
  if (!urlDriven) return;
  const own = activeTenant?.account_number;
  if (own == null) return;
  if (String(own) !== String(urlAccount)) {
    navigate(branchPath("solo", String(own), defaultBranchSlug("solo")), { replace: true });
    return;
  }
  if (!urlSplat) {
    navigate(branchPath("solo", urlAccount, defaultBranchSlug("solo")), { replace: true });
  }
}, [urlDriven, urlAccount, urlSplat, activeTenant?.account_number, navigate]);
const[studio,setStudio]=React.useState(false);
React.useEffect(()=>{const h=()=>setStudio(true);window.addEventListener('paige-studio',h);return()=>window.removeEventListener('paige-studio',h)},[]);
const theme=resolvedTheme==='light'?'light':'dark';
// Owner directive (2026-08-18) — the slide-in panel pops out from THIS launcher ONLY
// (the TopBar spark / ⌘K). EVERY rail item, "Paige" included, navigates to its own URL
// and nothing more; the rail is navigation, never a panel trigger.
const openPaige=()=>expandRail();
const full=route==='paige'||route==='auto'||route==='cal'||route==='setup'||route==='team'||route==='home';
const screens={home:<CommandHub openPaige={openPaige}/>,paige:<PaigeHub/>,compass:<TrustCompass/>,auto:<AutomationsHub/>,clients:<ClientsHub openPaige={openPaige}/>,cal:<CalendarHub/>,growth:<GrowthHub/>,analytics:<Analytics2/>,market:<Marketplace/>,vault:<VaultView/>,integrations:<Integrations/>,team:<TeamHub/>,setup:<Setup/>};
return <TenantCommandCenterShell
accountName={activeTenant?.name||'Your business'}
accountType={activeTenant?.account_type}
userRole="admin"
onSignOut={()=>void performSignOut({redirectTo:'/'})}>
<div className="paige-solo" data-theme={theme} style={{height:'100%',minHeight:0}}>
<div style={{display:'flex',height:'100%',overflow:'hidden'}}>
<main key={route} style={{flex:1,overflow:full?'hidden':'auto',minHeight:0,minWidth:0}}>{screens[route]}</main>
{studio&&<VibeStudio onBack={()=>setStudio(false)}/>}</div></div>
</TenantCommandCenterShell>};

const SoloApp=()=> (
<AgentPresenceProvider launcherEnabled={false} hasChatBody>
<VoiceDeviceProvider>
<DialPadSurface/><IncomingCallOverlay/><LiveTranscriptPanel/><SoloAppContent/>
</VoiceDeviceProvider>
</AgentPresenceProvider>
);
export default SoloApp;
