// @ts-nocheck
import React from "react";
import { Ic, Avatar, Foldout, SubTabs, DATA } from "./_shared";
import { CompassTile } from "./compass";
import { VaultTile } from "./vault";
import { SystemsHealthMap } from "./healthmap";
import { SystemsCheck } from "./systems";
import { useCommandCenter } from "./data/useCommandCenter";

// Time-of-day greeting (real clock — never a hardcoded "morning").
const greetPhrase=()=>{const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening'};
// Small honest marker for surfaces with no real backend yet (§13) — demo visual, truthfully labeled.
const PreviewPill=()=>(<span className="pill pill-n" title="Sample layout — not yet wired to your live data">Preview</span>);

const Spark=({d,up})=>{const w=88,h=26,mx=Math.max(...d),mn=Math.min(...d);const pts=d.map((v,i)=>[i*(w/(d.length-1)),h-((v-mn)/(mx-mn||1))*(h-4)-2]);
const path=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');const c=up?'var(--ok)':'var(--bad)';
return <svg width={w} height={h} style={{overflow:'visible'}}><path d={path} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round"/><circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2.4" fill={c}/></svg>};

const Metric=({m})=>(<div className="card" style={{padding:'16px 18px'}}>
<div className="row" style={{justifyContent:'space-between',alignItems:'flex-start'}}><div className="eyebrow">{m.k}</div>{m.spark&&<Spark d={m.spark} up={m.up}/>}</div>
<div className="row" style={{marginTop:6,gap:8,alignItems:'baseline'}}><div style={{fontSize:26,fontWeight:600,letterSpacing:'-.03em'}}>{m.v}</div>
{m.d&&<div style={{fontSize:12,fontWeight:600,color:m.up?'var(--ok)':'var(--bad)'}}>{m.d}</div>}</div></div>);

const MetricSkeleton=()=>(<div className="card" style={{padding:'16px 18px'}}>
<div style={{height:9,width:'52%',background:'var(--surface-sunk)',borderRadius:4}}/>
<div style={{height:22,width:'64%',background:'var(--surface-sunk)',borderRadius:5,marginTop:12}}/></div>);

const Onboard=()=>{const[open,setOpen]=React.useState(false);const[items,setItems]=React.useState(DATA.checklist);
const done=items.filter(i=>i.done).length;
return <div className="card" style={{overflow:'hidden'}}>
<button onClick={()=>setOpen(!open)} style={{display:'flex',width:'100%',alignItems:'center',gap:14,padding:'14px 18px',textAlign:'left'}}>
<div className="tile" style={{background:'var(--gold-tint)',color:'var(--gold)'}}><Ic.bolt size={17}/></div>
<div className="grow"><div className="row" style={{gap:8}}><div style={{fontWeight:600,fontSize:13.5}}>Put Paige to work</div><PreviewPill/></div><div className="sub">{done} of {items.length} connections complete — each one sharpens what she can do.</div></div>
<div className="row" style={{gap:4}}>{items.map((i,x)=><div key={x} style={{width:20,height:4,borderRadius:2,background:i.done?'var(--gold)':'var(--surface-sunk)'}}/>)}</div>
<div style={{transform:open?'rotate(90deg)':'',transition:'.2s',color:'var(--ink-3)',display:'flex'}}><Ic.chev size={16}/></div></button>
{open&&<div className="fade-in" style={{borderTop:'1px solid var(--line-soft)'}}>{items.map((i,x)=>
<div key={x} className="row" style={{padding:'12px 18px',borderBottom:x<items.length-1?'1px solid var(--line-soft)':'0',gap:12}}>
<div className="tile" style={{width:22,height:22,borderRadius:7,background:i.done?'var(--ok-tint)':'var(--surface-sunk)',color:i.done?'var(--ok)':'var(--ink-3)'}}>{i.done?<Ic.check size={13}/>:<div className="mono" style={{fontSize:10.5,fontWeight:600}}>{x+1}</div>}</div>
<div className="grow"><div style={{fontWeight:i.done?400:600,fontSize:13,color:i.done?'var(--ink-3)':'var(--ink)',textDecoration:i.done?'line-through':''}}>{i.t}</div>{!i.done&&<div className="sub">{i.d}</div>}</div>
{!i.done&&<button className="btn btn-s" onClick={()=>setItems(items.map((y,j)=>j===x?{...y,done:true}:y))}>{i.cta}</button>}</div>)}</div>}</div>};

const Autonomy=()=>{const[depts,setDepts]=React.useState(DATA.depts);const labels=['Ask first','Draft & wait','Act with notice','Act freely'];
return <div className="card"><div className="hd"><div><h3>Autonomy dial</h3><div className="sub">How far Paige goes before you weigh in</div></div><Ic.shield size={17} style={{color:'var(--ink-3)'}}/></div>
<div style={{padding:'6px 20px 16px'}}>{depts.map((d,i)=><div key={i} style={{padding:'11px 0',borderBottom:i<depts.length-1?'1px solid var(--line-soft)':'0'}}>
<div className="row" style={{justifyContent:'space-between',marginBottom:8}}><span style={{fontSize:13,fontWeight:500}}>{d.name}</span><span style={{fontSize:11.5,color:d.level>2?'var(--gold)':'var(--ink-3)',fontWeight:600}}>{labels[d.level-1]}</span></div>
<div className="row" style={{gap:4}}>{[1,2,3,4].map(l=><button key={l} onClick={()=>setDepts(depts.map((y,j)=>j===i?{...y,level:l}:y))} title={labels[l-1]}
style={{height:6,flex:1,borderRadius:3,background:l<=d.level?(d.level>2?'var(--gold)':'var(--violet)'):'var(--surface-sunk)',transition:'.15s'}}/>)}</div></div>)}</div></div>};

const Systems=()=>{const s=DATA.systems;const bad=s.filter(x=>x.state!=='ok').length;
return <div className="card"><div className="hd"><div><h3>Systems Check</h3><div className="sub">Continuous — last full scan 14 minutes ago</div></div>
<span className={'pill '+(bad?'pill-warn':'pill-ok')}><span className="dot"/>{bad?bad+' need you':'All clear'}</span></div>
<div style={{padding:'4px 0'}}>{s.map((x,i)=><div key={i} className="row" style={{padding:'10px 20px',gap:11}}>
<span style={{color:x.state==='ok'?'var(--ok)':x.state==='warn'?'var(--warn)':'var(--bad)',display:'flex'}}>{x.state==='ok'?<Ic.check size={15}/>:<Ic.pulse size={15}/>}</span>
<div className="grow"><div style={{fontSize:13,fontWeight:500}}>{x.name}</div><div className="sub trunc">{x.detail}</div></div>
<div className="mono" style={{fontSize:11.5,color:'var(--ink-3)',flex:'none'}}>{x.metric}</div></div>)}</div>
<div style={{padding:'12px 20px',borderTop:'1px solid var(--line-soft)'}}><button className="btn btn-s" style={{width:'100%',justifyContent:'center'}}>Open Systems Check <Ic.arrow size={14}/></button></div></div>};

const Vault=()=>(<div className="card"><div className="hd"><div><h3>Business Vault</h3><div className="sub">Obligations Paige is holding for you</div></div><Ic.vault size={17} style={{color:'var(--ink-3)'}}/></div>
<div>{DATA.vault.map((v,i)=><div key={i} className="row" style={{padding:'11px 20px',borderTop:i?'1px solid var(--line-soft)':'0',gap:12}}>
<div className="mono" style={{width:44,flex:'none',fontSize:12.5,fontWeight:600,color:v.state==='bad'?'var(--bad)':v.state==='warn'?'var(--warn)':'var(--ink-3)'}}>{v.days}d</div>
<div className="grow"><div style={{fontSize:13,fontWeight:500}} className="trunc">{v.name}</div><div className="sub trunc">{v.org} · {v.amount}</div></div>
<span className="pill pill-n">{v.action}</span></div>)}</div></div>);

const Team=()=>(<div className="card"><div className="hd"><div><h3>Activity</h3><div className="sub">You and Paige, same timeline</div></div><PreviewPill/></div>
<div style={{padding:'4px 0'}}>{DATA.team.map((t,i)=><div key={i} className="row" style={{padding:'11px 20px',gap:12,alignItems:'flex-start'}}>
{t.who==='Paige'?<div className="tile" style={{width:28,height:28,borderRadius:'50%',background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.spark size={15}/></div>:<Avatar name={t.who}/>}
<div className="grow" style={{fontSize:13,color:'var(--ink-2)',lineHeight:1.45}}><span style={{fontWeight:600,color:'var(--ink)'}}>{t.who}</span> {t.act}
<div className="sub" style={{marginTop:1}}>{t.role} · {t.t}</div></div></div>)}</div></div>);

const ApprovalCard=({a,onAct})=>{const[open,setOpen]=React.useState(false);const[busy,setBusy]=React.useState(false);
return <div style={{borderTop:'1px solid var(--line-soft)',padding:'14px 20px',background:open?'var(--surface-2)':'transparent',transition:'.2s'}}>
<div className="row" style={{alignItems:'flex-start',gap:13}}>
<div className="tile" style={{background:'var(--violet-tint)',color:'var(--violet)',borderRadius:11}}><Ic.spark size={16}/></div>
<div className="grow"><div className="row" style={{gap:8,flexWrap:'wrap'}}><span style={{fontWeight:600,fontSize:14}}>{a.title}</span>
<span className="pill pill-n">{a.dept}</span>{a.type&&<span className="pill pill-v">{a.type}</span>}</div>
{a.why&&<div style={{fontSize:12.8,color:'var(--ink-2)',marginTop:4}}>{a.why}</div>}
{open&&<div className="fade-in" style={{marginTop:11,padding:'12px 14px',background:'var(--surface)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',fontSize:13,color:'var(--ink-2)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{a.preview||'Paige has no draft body for this one yet.'}</div>}
<div className="row" style={{marginTop:11,gap:8,flexWrap:'wrap'}}>
<button className="btn btn-s btn-p" disabled={busy} onClick={()=>{setBusy(true);onAct(a.id,'ok').finally(()=>setBusy(false))}}><Ic.check size={13}/>{busy?'Working…':'Approve'}</button>
<button className="btn btn-s" onClick={()=>setOpen(!open)}>{open?'Hide draft':'Read draft'}</button>
<button className="btn btn-s" disabled={busy} onClick={()=>{setBusy(true);onAct(a.id,'no').finally(()=>setBusy(false))}}><Ic.x size={13}/>Dismiss</button>
<div className="row" style={{gap:9,marginLeft:'auto',fontSize:11.5,color:'var(--ink-3)'}}>
<span className="row" style={{gap:4}}><Ic.clock size={12}/>{a.aging}</span></div></div></div></div></div>};

const CommandCenter=({openPaige,go})=>{
const cc=useCommandCenter();
const[tab,setTab]=React.useState('today');const[toast,setToast]=React.useState(null);
const[fold,setFold]=React.useState(null);
// Optimistic hide: a resolved id disappears immediately, then the seam refresh
// (execute-approval / RLS UPDATE) confirms. On error the id is restored + a toast.
const[resolved,setResolved]=React.useState(()=>new Set());
const flash=(msg)=>{setToast(msg);setTimeout(()=>setToast(null),3200)};
const act=async(id,k)=>{
 const it=cc.approvals.find(x=>x.id===id);
 setResolved(s=>new Set(s).add(id));
 const res=k==='ok'?await cc.approve(id):await cc.decline(id);
 if(!res.ok){setResolved(s=>{const n=new Set(s);n.delete(id);return n});flash(res.error||'That didn\'t go through. Try again.');return}
 flash(k==='ok'?(it?'Approved — Paige is handling "'+it.title+'"':'Approved.'):'Dismissed. Paige won\'t raise it again.');
};
const live=cc.approvals.filter(a=>!resolved.has(a.id));
const shown=live.filter(a=>tab==='all'||(tab==='today'?a.urgency==='today':a.urgency==='week'));
const firstMetric=cc.metrics[0];
return <div className="fade-in pg" style={{maxWidth:1440,margin:'0 auto',width:'100%'}}>
<div className="pg-hd row" style={{alignItems:'center',gap:16,flexWrap:'wrap'}}>
<div className="grow" style={{minWidth:220}}>
<div className="row" style={{gap:10,alignItems:'baseline',flexWrap:'wrap'}}>
<span className="eyebrow" style={{fontSize:10}}>{cc.greeting.dateLabel}</span>
<h1 style={{fontSize:20,letterSpacing:'-.03em'}}>{greetPhrase()}, {cc.greeting.name}.</h1></div>
<p style={{color:'var(--ink-2)',fontSize:12.8,marginTop:3}}>{cc.greeting.summary}</p></div>
<div className="row" style={{gap:9}}>
<button className="btn btn-s" onClick={openPaige}><Ic.spark size={14}/>Ask Paige</button></div></div>

<div className="pg-fill cc-fill">
{(cc.loading||cc.metrics.length>0)&&<div className="g4" style={{gridColumn:'1 / -1'}}>
{cc.loading?[0,1,2,3].map(i=><MetricSkeleton key={i}/>):cc.metrics.map((m,i)=><Metric key={i} m={m}/>)}</div>}

<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
<div className="hd" style={{flex:'none',paddingBottom:14}}><div><h3>Waiting on you</h3><div className="sub">Paige drafted it. You decide.</div></div>
<div className="seg">{[['today','Today'],['week','This week'],['all','All']].map(([k,l])=><button key={k} aria-pressed={tab===k} onClick={()=>setTab(k)}>{l}</button>)}</div></div>
<div className="pane" style={{flex:1}}>
{cc.loading?[0,1,2].map(i=><div key={i} className="row" style={{padding:'16px 20px',borderTop:i?'1px solid var(--line-soft)':'0',gap:13}}>
<span className="tile" style={{background:'var(--surface-sunk)',flex:'none'}}/><span className="grow" style={{display:'grid',gap:7}}>
<span style={{height:11,width:(52+i*8)+'%',background:'var(--surface-sunk)',borderRadius:4}}/><span style={{height:8,width:'34%',background:'var(--surface-sunk)',borderRadius:4}}/></span></div>)
:shown.length?shown.map(a=><ApprovalCard key={a.id} a={a} onAct={act}/>):
<div style={{padding:'46px 20px',textAlign:'center',borderTop:'1px solid var(--line-soft)'}}>
<div className="tile" style={{margin:'0 auto 12px',width:40,height:40,borderRadius:14,background:'var(--ok-tint)',color:'var(--ok)'}}><Ic.check size={20}/></div>
<div style={{fontWeight:600}}>{live.length?'Nothing in this window':'Nothing waiting on you'}</div>
<div className="sub">{live.length?'Switch to All to see the rest.':'Paige will raise the next thing when it earns your attention.'}</div></div>}</div>
<div className="cc-foot row" style={{flex:'none',gap:9,padding:'12px 18px',borderTop:'1px solid var(--line-soft)',flexWrap:'wrap'}}>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('setup')}><Ic.bolt size={14}/>Put Paige to work</button>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('activity')}><Ic.pulse size={14}/>Activity</button></div></div>

<div className="cc-rail"><CompassTile go={go} departments={cc.departments} preview/><VaultTile preview/></div>

<div className="cc-railbtn row tabstrip" style={{gap:8}}>
{firstMetric&&<button className="btn btn-s" onClick={()=>setFold('metrics')}><Ic.chart size={13}/>{firstMetric.v} {firstMetric.k}</button>}
<button className="btn btn-s" onClick={()=>setFold('setup')}><Ic.bolt size={13}/>Setup</button>
<button className="btn btn-s" onClick={()=>setFold('activity')}><Ic.pulse size={13}/>Activity</button>
<button className="btn btn-s" onClick={()=>setFold('compass')}><Ic.shield size={13}/>Compass</button>
<button className="btn btn-s" onClick={()=>setFold('vault')}><Ic.vault size={13}/>Vault</button></div>

<Foldout open={fold==='metrics'} onClose={()=>setFold(null)} title="This period" sub="Revenue, clients, retainers, and pipeline — live from your book" wide>
{cc.metrics.length?<div className="g4" style={{padding:16}}>{cc.metrics.map((m,i)=><Metric key={i} m={m}/>)}</div>
:<div style={{padding:'40px 20px',textAlign:'center'}}><div className="sub">No metrics yet — they appear as your book fills in.</div></div>}</Foldout>

<Foldout open={fold==='setup'} onClose={()=>setFold(null)} title="Put Paige to work" sub="Each connection sharpens what she can do."><div style={{padding:16}}><Onboard/></div></Foldout>
<Foldout open={fold==='activity'} onClose={()=>setFold(null)} title="Activity" sub="You and Paige, same timeline" wide><div style={{padding:16}}><Team/></div></Foldout>
<Foldout open={fold==='compass'} onClose={()=>setFold(null)} title="Trust Compass" sub="How far Paige goes on her own"><div style={{padding:16}}><CompassTile go={go} departments={cc.departments} preview/></div></Foldout>
<Foldout open={fold==='vault'} onClose={()=>setFold(null)} title="Business Vault" sub="Obligations Paige is holding for you"><div style={{padding:16}}><VaultTile preview/></div></Foldout>
</div>

{toast&&<div className="fade-in" style={{position:'fixed',bottom:26,left:'50%',transform:'translateX(-50%)',background:'var(--rail)',color:'var(--ink-inv)',padding:'11px 18px',borderRadius:12,fontSize:13,boxShadow:'var(--sh-3)',zIndex:60,maxWidth:'min(560px,90vw)'}}>{toast}</div>}
</div>};
const CommandHub=({openPaige})=>{const[tab,setTab]=React.useState('home');
const tabs=[['home','Command Center',()=><Ic.grid size={15}/>],['sys','Systems Check',()=><Ic.pulse size={15}/>]];
return <div style={{display:'flex',flexDirection:'column',height:'100%',minWidth:0,alignItems:'stretch'}}>
<SubTabs tabs={tabs} cur={tab} set={setTab}/>
<div style={{flex:1,minHeight:0,overflow:'auto'}}>
{tab==='home'?<CommandCenter openPaige={openPaige} go={()=>setTab('sys')}/>
:<SysTab/>}</div></div>};

const SysTab=()=>{const[fold,setFold]=React.useState(null);
return <div className="fade-in pg" style={{width:'100%',maxWidth:1440,margin:'0 auto'}}>
<div className="pg-hd row" style={{alignItems:'center',gap:14,flexWrap:'wrap'}}>
<div className="grow" style={{minWidth:220}}>
<div className="row" style={{gap:10,alignItems:'baseline',flexWrap:'wrap'}}>
<span className="eyebrow" style={{fontSize:10}}>Command Center</span>
<h1 style={{fontSize:20,letterSpacing:'-.03em'}}>Systems Check</h1>
<span className="pill pill-bad"><span className="dot"/>2 urgent</span><PreviewPill/></div>
<p style={{color:'var(--ink-2)',fontSize:12.8,marginTop:3}}>Sixteen of thirty checks running continuously. Every finding arrives with the fix drafted.</p></div>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<button className="btn btn-s" onClick={()=>setFold('checks')}><Ic.grid size={14}/>All checks & score</button>
<button className="btn btn-s btn-p"><Ic.pulse size={14}/>Run scan now</button></div></div>
<SystemsHealthMap embed/>
<Foldout open={fold==='checks'} onClose={()=>setFold(null)} title="All checks" sub="Score, categories, transmissions, and every check Paige runs" wide>
<div style={{padding:14}}><SystemsCheck/></div></Foldout></div>};
export {CommandHub,CommandCenter,Metric,Spark};
