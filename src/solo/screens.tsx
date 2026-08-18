// @ts-nocheck
import React from "react";
import { Ic, Avatar, Wrap, PageHead, DATA } from "./_shared";
import { Metric } from "./CommandCenter";

const riskTone=r=>r==='At risk'?'pill-bad':r==='Watch'?'pill-warn':'pill-ok';
const Bar=({v,c})=>(<div style={{height:5,borderRadius:3,background:'var(--surface-sunk)',width:64,flex:'none'}}><div style={{width:v+'%',height:'100%',borderRadius:3,background:c}}/></div>);

export const ClientDetail=({c,onBack,openPaige})=>(<Wrap max={1180}>
<button className="btn btn-s" onClick={onBack} style={{marginBottom:18}}><span style={{transform:'rotate(180deg)',display:'flex'}}><Ic.arrow size={13}/></span>All clients</button>
<div className="row" style={{gap:16,alignItems:'flex-start',flexWrap:'wrap'}}>
<Avatar name={c.name} size={52}/>
<div className="grow"><h1 style={{fontSize:26,letterSpacing:'-.03em'}}>{c.name}</h1>
<div className="row" style={{gap:8,marginTop:7,flexWrap:'wrap'}}><span className={'pill '+riskTone(c.risk)}><span className="dot"/>{c.risk}</span>
<span className="pill pill-n">{c.tier}</span><span className="pill pill-n">{c.stage}</span><span className="sub">Last touch {c.last}</span></div></div>
<div className="row" style={{gap:8}}><button className="btn"><Ic.mail size={15}/>Message</button><button className="btn btn-p" onClick={openPaige}><Ic.spark size={15}/>Ask Paige about {c.name.split(' ')[0]}</button></div></div>

<div className="g4" style={{margin:'24px 0 16px'}}>
{[['Monthly value','$'+c.mrr.toLocaleString()],['Health',c.health+'/100'],['Open items',c.open],['Tenure','14 months']].map(([k,v],i)=>
<div key={i} className="card" style={{padding:'14px 16px'}}><div className="eyebrow">{k}</div><div style={{fontSize:22,fontWeight:600,marginTop:4,letterSpacing:'-.02em'}}>{v}</div></div>)}</div>

<div className="two-w">
<div className="card"><div className="hd"><div><h3>Paige's read on this account</h3><div className="sub">Refreshed 20 minutes ago</div></div><span className="pill pill-v">Draft ready</span></div>
<div style={{padding:'16px 20px',fontSize:13.5,color:'var(--ink-2)',lineHeight:1.65}}>
{c.risk==='At risk'?'Two calls skipped and no reply in 19 days. Portal logins stopped the same week the scope change shipped. My read: the change landed without enough explanation, and they are quietly deciding whether the engagement still fits.':'Engagement is steady and usage is climbing. The renewal window opens in three weeks — worth going in with evidence rather than a reminder.'}
<div style={{marginTop:14,padding:'13px 15px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{marginBottom:6}}>Recommended next move</div>
{c.risk==='At risk'?'Low-pressure reset note offering a 15-minute call or an async update.':'Renewal note leading with the quarter\'s numbers, same rate, two extra strategy sessions.'}
<div className="row" style={{gap:8,marginTop:12}}><button className="btn btn-s btn-p"><Ic.check size={13}/>Approve & send</button><button className="btn btn-s">Edit draft</button></div></div></div></div>
<div className="card"><div className="hd"><h3>Recent thread</h3></div>
<div style={{padding:'6px 0'}}>{[['Scope change shipped','Jul 18'],['Kickoff on new deliverable','Jul 24'],['Reschedule request','Jul 29'],['Paige flagged risk score 74','Aug 11'],['Reset note drafted','Aug 13']].map(([t,d],i)=>
<div key={i} className="row" style={{padding:'10px 20px',gap:12}}><span className="dot" style={{color:i>2?'var(--gold)':'var(--ink-3)'}}/><span className="grow" style={{fontSize:13}}>{t}</span><span className="mono sub">{d}</span></div>)}</div></div></div></Wrap>);

export const Clients=({openPaige})=>{const[sel,setSel]=React.useState(null);const[f,setF]=React.useState('All');const[q,setQ]=React.useState('');
if(sel)return <ClientDetail c={sel} onBack={()=>setSel(null)} openPaige={openPaige}/>;
const rows=DATA.clients.filter(c=>(f==='All'||c.risk===f)&&c.name.toLowerCase().includes(q.toLowerCase()));
const mrr=DATA.clients.reduce((s,c)=>s+c.mrr,0);
return <Wrap><PageHead eyebrow="Clients" title="Everyone you serve" sub={DATA.clients.length+' accounts, all yours · $'+mrr.toLocaleString()+' monthly · Paige is watching 3 for drift.'}
right={<div className="row" style={{gap:10}}><button className="btn"><Ic.doc size={15}/>Export CSV</button><button className="btn btn-p"><Ic.plus size={15}/>Add client</button></div>}/>
<div className="row" style={{gap:10,marginBottom:14,flexWrap:'wrap'}}>
<div className="row card" style={{padding:'0 12px',height:34,gap:8,borderRadius:9,boxShadow:'none',color:'var(--ink-3)'}}><Ic.search size={15}/>
<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search clients" style={{border:0,background:'none',outline:'none',color:'var(--ink)',width:180,fontFamily:'inherit',fontSize:13}}/></div>
<div className="seg">{['All','Healthy','Watch','At risk'].map(x=><button key={x} aria-pressed={f===x} onClick={()=>setF(x)}>{x}</button>)}</div></div>
<div className="card" style={{overflow:'hidden'}}>
<div className="tbl tbl-cap"><div style={{minWidth:1080}}>
<div className="row" style={{padding:'11px 20px',background:'var(--surface-2)',borderBottom:'1px solid var(--line)',fontSize:11,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)',fontWeight:600}}>
<span style={{flex:'1 1 230px',minWidth:200}}>Client</span><span style={{flex:'0 0 120px'}}>Stage</span><span style={{flex:'0 0 100px'}}>Tier</span>
<span style={{flex:'0 0 110px',textAlign:'right'}}>Monthly</span><span style={{flex:'0 0 130px',paddingLeft:20}}>Health</span><span style={{flex:'0 0 110px'}}>Status</span><span style={{flex:'0 0 90px',textAlign:'right'}}>Last touch</span></div>
{rows.map((c,i)=><button key={i} onClick={()=>setSel(c)} className="row" style={{width:'100%',textAlign:'left',padding:'13px 20px',borderBottom:i<rows.length-1?'1px solid var(--line-soft)':'0'}}
onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
<span className="row" style={{flex:'1 1 230px',minWidth:200,gap:11}}><Avatar name={c.name} size={30}/><span><span style={{fontWeight:600,fontSize:13.5,display:'block'}}>{c.name}</span><span className="sub">{c.open} open items</span></span></span>
<span style={{flex:'0 0 120px',fontSize:13,color:'var(--ink-2)'}}>{c.stage}</span>
<span style={{flex:'0 0 100px'}}><span className="pill pill-n">{c.tier}</span></span>
<span className="mono" style={{flex:'0 0 110px',textAlign:'right',fontSize:13.5,fontWeight:500}}>${c.mrr.toLocaleString()}</span>
<span className="row" style={{flex:'0 0 130px',paddingLeft:20,gap:9}}><Bar v={c.health} c={c.health>75?'var(--ok)':c.health>50?'var(--warn)':'var(--bad)'}/><span className="mono sub">{c.health}</span></span>
<span style={{flex:'0 0 110px'}}><span className={'pill '+riskTone(c.risk)}><span className="dot"/>{c.risk}</span></span>
<span className="sub" style={{flex:'0 0 90px',textAlign:'right'}}>{c.last}</span></button>)}</div></div></div></Wrap>};

// §13 TRUTH WAVE (owner ruling 2026-08-18) — DELETED from here: the `Growth` and
// `Analytics` screen exports.
//
// Both were DEAD CODE superseded by the live `growth2.tsx` (GrowthHub) and
// `analytics2.tsx` (Analytics2) that `SoloApp` actually mounts; the only import of
// this module anywhere is `conversations.tsx`, which takes `Clients` alone. Verified
// before deleting rather than assumed.
//
// They mattered because `Analytics` was the sole consumer of `DATA.metrics` — the
// fabricated "$23,230 MRR / 112% NRR / 147 hours saved / 89% approval rate" strip with
// invented sparklines. That fixture is deleted alongside them in `_shared.tsx`.
//
// `Clients` (and its `ClientDetail`) stay: they ARE mounted. Their fixture data is a
// separate, tracked slice of the same wave.
