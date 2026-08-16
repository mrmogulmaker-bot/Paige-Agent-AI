// @ts-nocheck
import React from "react";
import "./solo-tokens.css";
import { Ic, Logo, Avatar, Wrap, PageHead } from "./_shared";
import { CommandHub } from "./CommandCenter";
import { PaigeHub } from "./paigehub";
import { PaigePanel } from "./agent";
import { TrustCompass } from "./compass";
import { AutomationsHub } from "./automations-build";
import { ClientsHub } from "./conversations";
import { GrowthHub } from "./growth2";
import { Analytics2 } from "./analytics2";
import { Marketplace } from "./marketplace";
import { VaultView } from "./vault";
import { Integrations } from "./integrations";
import { TeamHub } from "./team";
import { Setup } from "./setup";
import { VibeStudio } from "./vibe";

const NAV=[['home','Command Center',()=><Ic.grid/>],['paige','Paige',()=><Ic.spark/>],['compass','Trust Compass',()=><Ic.shield/>],['auto','Automations',()=><Ic.bolt/>],['clients','Clients',()=><Ic.users/>],['growth','Growth',()=><Ic.trend/>],['analytics','Analytics',()=><Ic.chart/>]];
const NAV2=[['market','Marketplace',()=><Ic.store/>],['vault','Business Vault',()=><Ic.vault/>],['integrations','Integrations',()=><Ic.bolt/>],['team','Team',()=><Ic.users/>],['setup','Setup',()=><Ic.gear/>]];

const Rail=({route,go,collapsed,setCollapsed})=>{const w=collapsed?70:238;
const Item=([k,label,Icn])=>{const on=route===k;
return <button key={k} onClick={()=>go(k)} title={label} className="row" style={{width:'100%',gap:12,padding:collapsed?'10px':'9px 12px',borderRadius:11,marginBottom:2,
justifyContent:collapsed?'center':'flex-start',background:on?'var(--rail-2)':'transparent',color:on?'#fff':'var(--rail-text)',position:'relative',transition:'.15s'}}
onMouseEnter={e=>{if(!on)e.currentTarget.style.background='rgba(255,255,255,.05)'}} onMouseLeave={e=>{if(!on)e.currentTarget.style.background='transparent'}}>
{on&&<span style={{position:'absolute',left:collapsed?6:0,top:'50%',transform:'translateY(-50%)',width:3,height:18,borderRadius:3,background:'var(--gold-bright)'}}/>}
<span style={{display:'flex',color:on?'var(--gold-bright)':'inherit'}}>{Icn()}</span>
{!collapsed&&<span className="grow trunc" style={{fontSize:13.4,fontWeight:on?600:450,textAlign:'left'}}>{label}</span>}
{!collapsed&&k==='home'&&<span className="pill" style={{background:'var(--gold-bright)',color:'#2A1C00',height:19,padding:'0 7px'}}>6</span>}</button>};
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
<div className="row" style={{gap:7,color:'var(--gold-bright)',fontSize:12,fontWeight:600}}><Ic.bolt size={13}/>Solo plan</div>
<div style={{color:'var(--rail-text)',fontSize:11.8,marginTop:5,lineHeight:1.45}}>147 hours saved this month. One seat, six departments running.</div></div>}
<button onClick={()=>setCollapsed(!collapsed)} className="row" style={{width:'100%',justifyContent:'center',padding:9,borderRadius:10,color:'var(--rail-text)'}}>
<span style={{display:'flex',transform:collapsed?'':'rotate(180deg)',transition:'.2s'}}><Ic.chev size={15}/></span></button></div></nav>};

const TopBar=({theme,setTheme,openPaige,route})=>{const title=[...NAV,...NAV2].find(n=>n[0]===route)?.[1]||'';
return <header className="row" style={{height:56,flex:'none',padding:'0 22px',borderBottom:'1px solid var(--line)',background:'var(--surface)',gap:14,zIndex:20}}>
<div className="row" style={{gap:9,fontSize:13,color:'var(--ink-3)',flex:'none',whiteSpace:'nowrap'}}>
<span className="row" style={{gap:7,fontWeight:500,color:'var(--ink)',whiteSpace:'nowrap'}}>Antonio Cook</span>
<Ic.chev size={13}/><span style={{whiteSpace:'nowrap'}}>{title}</span></div>
<div className="row grow hide-1100" style={{justifyContent:'center',minWidth:0}}>
<div className="row" style={{gap:8,height:32,flex:'0 1 400px',minWidth:0,padding:'0 12px',border:'1px solid var(--line)',borderRadius:10,background:'var(--surface-2)',color:'var(--ink-3)'}}>
<Ic.search size={14}/><span className="trunc" style={{fontSize:12.8}}>Search clients, threads, obligations</span>
<span className="mono" style={{marginLeft:'auto',fontSize:11,padding:'1px 5px',border:'1px solid var(--line)',borderRadius:5}}>⌘K</span></div></div>
<div className="row" style={{gap:6,flex:'none',marginLeft:'auto'}}>
<span className="pill pill-n hide-1280" style={{height:26,flex:'none'}}>Provided by Project Mogul Enterprise</span>
<button className="btn btn-s" style={{width:30,padding:0,justifyContent:'center'}} onClick={openPaige} title="Ask Paige"><Ic.spark size={15}/></button>
<button className="btn btn-s" style={{width:30,padding:0,justifyContent:'center',position:'relative'}}><Ic.bell size={15}/>
<span style={{position:'absolute',top:5,right:6,width:6,height:6,borderRadius:'50%',background:'var(--bad)'}}/></button>
<button className="btn btn-s" style={{width:30,padding:0,justifyContent:'center'}} onClick={()=>setTheme(theme==='dark'?'light':'dark')} title="Theme">{theme==='dark'?<Ic.sun size={15}/>:<Ic.moon size={15}/>}</button>
<Avatar name="Antonio Cook" size={28} tone="var(--violet)"/></div></header>};

const Stub=({title,sub})=>(<Wrap max={900}><PageHead eyebrow="Coming into view" title={title} sub={sub}/>
<div className="card" style={{padding:'54px 30px',textAlign:'center'}}>
<div className="tile" style={{margin:'0 auto 14px',width:44,height:44,borderRadius:15,background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.spark size={22}/></div>
<div style={{fontWeight:600,fontSize:15}}>Not part of this pass</div>
<div className="sub" style={{maxWidth:380,margin:'6px auto 0'}}>Command Center, Paige, Clients, Growth, and Analytics are designed. Say the word and this one is next.</div></div></Wrap>);

const SoloApp=()=>{
const[route,setRoute]=React.useState('home');
const[collapsed,setCollapsed]=React.useState(false);
const[panel,setPanel]=React.useState(false);
const[studio,setStudio]=React.useState(false);
React.useEffect(()=>{const h=()=>setStudio(true);window.addEventListener('paige-studio',h);return()=>window.removeEventListener('paige-studio',h)},[]);
const[theme,setTheme]=React.useState(()=>localStorage.getItem('paige-theme')||'light');
React.useEffect(()=>{localStorage.setItem('paige-theme',theme)},[theme]);
const openPaige=()=>setPanel(true);
const full=route==='paige'||route==='auto'||route==='setup'||route==='team'||route==='home';
const screens={home:<CommandHub openPaige={openPaige}/>,paige:<PaigeHub/>,compass:<TrustCompass/>,auto:<AutomationsHub/>,clients:<ClientsHub openPaige={openPaige}/>,growth:<GrowthHub/>,analytics:<Analytics2/>,market:<Marketplace/>,vault:<VaultView/>,integrations:<Integrations/>,team:<TeamHub/>,setup:<Setup/>};
return <div className="paige-solo" data-theme={theme} style={{height:'100vh'}}>
<div style={{display:'flex',height:'100vh',overflow:'hidden'}}>
<Rail route={route} go={setRoute} collapsed={collapsed} setCollapsed={setCollapsed}/>
<div style={{display:'flex',flexDirection:'column',flex:1,minWidth:0}}>
<TopBar theme={theme} setTheme={setTheme} openPaige={openPaige} route={route}/>
<main key={route} style={{flex:1,overflow:full?'hidden':'auto',minHeight:0}}>{screens[route]}</main></div>
<PaigePanel open={panel} onClose={()=>setPanel(false)}/>
{studio&&<VibeStudio onBack={()=>setStudio(false)}/>}</div></div>};
export default SoloApp;
