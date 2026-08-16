// @ts-nocheck
import React from "react";
import { Ic, SlideOut } from "./_shared";
import { CLAY, CPRIM, CAL, CBK } from "./calendar-data";
import { OnCall } from "./calendar-team";

export const cWk=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const cDay=d=>CAL.ev.filter(e=>e.d===d).sort((a,b)=>a.m-b.m);
export const cConf=d=>{const l=cDay(d);return l.some(e=>e.k==='dead')&&l.some(e=>e.k==='meet'&&(e.dur==='60 min'||e.dur==='90 min'))};
export const LayerDot=({k,size=6})=>(<span style={{display:'block',width:size,height:size,borderRadius:2,background:CLAY[k][1],flex:'none'}}/>);

export const EvChip=({e,onOpen,onDrag}) =>{const[,c]=CLAY[e.k];
return <button draggable={e.k==='dead'} onDragStart={ev=>{ev.dataTransfer.setData('text/plain',e.id);onDrag&&onDrag(e)}}
onClick={ev=>{ev.stopPropagation();onOpen(e)}} className="row"
style={{gap:5,width:'100%',padding:'2px 5px',borderRadius:5,textAlign:'left',minWidth:0,flex:'none',
background:e.k==='dead'?'var(--bad-tint)':'var(--surface-2)',border:'1px solid '+(e.k==='dead'?'var(--bad)':'var(--line-soft)'),
cursor:e.k==='dead'?'grab':'pointer'}} title={e.t+' · '+e.n}>
<LayerDot k={e.k}/><span className="trunc" style={{fontSize:10.6,fontWeight:e.k==='dead'?600:500,color:e.k==='dead'?'var(--bad)':'var(--ink-2)'}}>
{e.k==='dead'?e.n:e.t.replace(':00','')+' '+e.n}</span></button>};

export const MonthGrid=({layers,onDay,onEv,onMove})=>{
const cells=[];for(let i=CAL.first;i>0;i--)cells.push({o:true,n:CAL.prev-i+1});
for(let d=1;d<=CAL.days;d++)cells.push({d,n:d});
while(cells.length%7)cells.push({o:true,n:cells.length-CAL.first-CAL.days+1});
const[over,setOver]=React.useState(null);const[drag,setDrag]=React.useState(null);
return <><div className="cal-dow">{cWk.map(w=><div key={w} style={{padding:'7px 8px',fontSize:10,fontWeight:600,letterSpacing:'.12em',
textTransform:'uppercase',color:'var(--ink-3)',textAlign:'left'}}>{w}</div>)}</div>
<div className="cal-grid">{cells.map((c,i)=>{
if(c.o)return <div key={i} className="cal-cell" style={{background:'var(--surface-2)',opacity:.5}}>
<span className="mono" style={{fontSize:11,color:'var(--ink-3)'}}>{c.n}</span></div>;
const all=cDay(c.d).filter(e=>layers[e.k]);
const prim=all.filter(e=>CPRIM.includes(e.k));const rest=all.length-prim.length;
const isT=c.d===CAL.today,cf=cConf(c.d)&&layers.dead&&layers.meet;
return <div key={i} className="cal-cell" onClick={()=>onDay(c.d)}
onDragOver={e=>{e.preventDefault();setOver(c.d)}} onDragLeave={()=>setOver(o=>o===c.d?null:o)}
onDrop={e=>{e.preventDefault();setOver(null);if(drag&&drag.d!==c.d)onMove({e:drag,to:c.d})}}
style={{background:over===c.d?'var(--violet-tint)':isT?'var(--gold-tint)':'transparent',
boxShadow:over===c.d?'inset 0 0 0 1.5px var(--violet)':'none',cursor:'pointer'}}>
<div className="row" style={{gap:6,flex:'none'}}>
<span className="mono" style={{fontSize:11.4,fontWeight:isT?700:500,width:20,height:18,display:'grid',placeItems:'center',
borderRadius:'50%',background:isT?'var(--gold)':'transparent',color:isT?'#fff':'var(--ink-2)'}}>{c.n}</span>
{cf&&<span className="row" style={{gap:3,marginLeft:'auto',padding:'0 4px',height:15,borderRadius:4,background:'var(--warn-tint)',color:'var(--warn)',flex:'none'}}
title="A hard filing sits under a long call"><Ic.bolt size={9}/><span style={{fontSize:9.4,fontWeight:700}}>Conflict</span></span>}</div>
{prim.slice(0,2).map(e=><EvChip key={e.id} e={e} onOpen={onEv} onDrag={setDrag}/>)}
{(rest>0||prim.length>2)&&<span className="row" style={{gap:5,marginTop:1,flex:'none',padding:'0 4px'}}>
{[...new Set(all.filter(e=>!CPRIM.includes(e.k)).map(e=>e.k))].map(k=><LayerDot key={k} k={k} size={5}/>)}
<span style={{fontSize:10,color:'var(--ink-3)',fontWeight:600}}>+{rest+Math.max(0,prim.length-2)} more</span></span>}</div>})}</div></>};

export const WeekGrid=({layers,onEv})=>{const days=[16,17,18,19,20,21,22];const h0=7,h1=18;
const rows=[];for(let h=h0;h<=h1;h++)rows.push(h);
const lbl=h=>(h%12||12)+(h<12?'am':'pm');
return <div className="pane" style={{flex:1}}>
<div className="cal-wk-hd"><div/>{days.map(d=><div key={d} style={{padding:'7px 8px',textAlign:'center'}}>
<div style={{fontSize:9.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)'}}>{cWk[(d-16)%7]}</div>
<div className="mono" style={{fontSize:13,fontWeight:d===CAL.today?700:500,color:d===CAL.today?'var(--gold)':'var(--ink)'}}>{d>31?d-31:d}</div></div>)}</div>
<div className="cal-wk-all"><div className="row" style={{padding:'0 6px',justifyContent:'flex-end'}}>
<span style={{fontSize:9,color:'var(--ink-3)',letterSpacing:'.08em',textTransform:'uppercase'}}>All day</span></div>
{days.map(d=><div key={d} style={{padding:'4px 4px',display:'grid',gap:3,alignContent:'start',borderLeft:'1px solid var(--line-soft)',minWidth:0}}>
{cDay(d).filter(e=>e.m<0&&layers[e.k]).map(e=><EvChip key={e.id} e={e} onOpen={onEv}/>)}</div>)}</div>
<div className="cal-wk-body">
<div style={{display:'grid',gridAutoRows:44}}>{rows.map(h=><div key={h} style={{position:'relative',borderTop:'1px solid var(--line-soft)'}}>
<span className="mono" style={{position:'absolute',top:-7,right:8,fontSize:10,color:'var(--ink-3)',background:'var(--surface)',padding:'0 2px'}}>{lbl(h)}</span></div>)}</div>
{days.map(d=><div key={d} style={{position:'relative',borderLeft:'1px solid var(--line-soft)',background:d===CAL.today?'var(--gold-tint)':'transparent'}}>
{rows.map(h=><div key={h} style={{height:44,borderTop:'1px solid var(--line-soft)'}}/>)}
{cDay(d).filter(e=>e.m>=0&&layers[e.k]).map(e=>{const top=(e.m-h0*60)/60*44;const mins=e.dur?parseInt(e.dur):e.k==='avail'?180:30;
const[,c]=CLAY[e.k];
return <button key={e.id} onClick={()=>onEv(e)} style={{position:'absolute',left:3,right:3,top:Math.max(0,top),height:Math.max(26,mins/60*44-3),
background:e.k==='avail'?'repeating-linear-gradient(45deg,'+c+'14,'+c+'14 6px,transparent 6px,transparent 12px)':c+'16',
border:'1px solid '+c+(e.k==='avail'?'55':'44'),borderLeft:'3px solid '+c,borderRadius:6,padding:'3px 5px',textAlign:'left',overflow:'hidden'}}>
<div className="trunc" style={{fontSize:10.4,fontWeight:600,color:c,lineHeight:1.35}}>{e.n}</div>
<div className="trunc mono" style={{fontSize:9.6,color:'var(--ink-3)',lineHeight:1.35}}>{e.t}</div></button>})}</div>)}</div></div>};

export const AgendaList=({layers,onEv})=>{const days=[...new Set(CAL.ev.filter(e=>e.d>=CAL.today&&layers[e.k]).map(e=>e.d))].sort((a,b)=>a-b);
return <div className="pane" style={{flex:1}}>{days.map(d=>{const l=cDay(d).filter(e=>layers[e.k]);
return <div key={d} style={{borderTop:'1px solid var(--line-soft)'}}>
<div className="row" style={{gap:9,padding:'8px 16px',background:'var(--surface-2)',position:'sticky',top:0,zIndex:2}}>
<span className="mono" style={{fontSize:12,fontWeight:700}}>{cWk[(CAL.first+d-1)%7]} {CAL.mAbbr} {d}</span>
{d===CAL.today&&<span className="pill" style={{background:'var(--gold-tint)',color:'var(--gold)',fontSize:10}}>Today</span>}
{cConf(d)&&<span className="pill pill-warn" style={{fontSize:10}}>Conflict</span>}
<span className="sub" style={{marginLeft:'auto',fontSize:11.4}}>{l.length} {l.length===1?'item':'items'}</span></div>
{l.map(e=><button key={e.id} onClick={()=>onEv(e)} className="row" style={{width:'100%',gap:12,padding:'10px 16px',textAlign:'left',
borderTop:'1px solid var(--line-soft)',transition:'.15s'}} onMouseEnter={ev=>ev.currentTarget.style.background='var(--surface-2)'}
onMouseLeave={ev=>ev.currentTarget.style.background='transparent'}>
<span className="mono" style={{fontSize:11.6,color:'var(--ink-3)',width:66,flex:'none'}}>{e.t}</span>
<LayerDot k={e.k} size={7}/>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{display:'block',fontSize:12.8,fontWeight:600}}>{e.n}</span>
<span className="trunc sub" style={{display:'block',fontSize:11.4}}>{e.sub}</span></span>
<span className="pill pill-n cc-hide" style={{fontSize:10}}>{e.src}</span></button>)}</div>})}</div>};

export const MoveConfirm=({mv,onClose})=>{if(!mv)return null;const{e,to}=mv;
return <><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(23,19,49,.4)',backdropFilter:'blur(3px)',zIndex:90}}/>
<div className="card fade-in" style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(460px,94vw)',zIndex:91,
boxShadow:'var(--sh-3)',padding:0,overflow:'hidden'}}>
<div className="row" style={{gap:10,padding:'13px 16px',background:'var(--warn-tint)',borderBottom:'1px solid var(--gold-line)'}}>
<span className="tile" style={{width:28,height:28,borderRadius:9,background:'var(--surface)',color:'var(--warn)'}}><Ic.shield size={14}/></span>
<span className="eyebrow" style={{fontSize:9.6,color:'var(--warn)'}}>This is a Trust Compass obligation</span></div>
<div style={{padding:'16px 18px'}}>
<div style={{fontSize:14.5,fontWeight:600,letterSpacing:'-.02em'}}>Move {e.n}?</div>
<div className="row" style={{gap:10,marginTop:12,padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<span className="mono" style={{fontSize:12.4,color:'var(--ink-3)'}}>{CAL.mAbbr} {e.d}</span>
<span style={{color:'var(--ink-3)',display:'flex'}}><Ic.arrow size={14}/></span>
<span className="mono" style={{fontSize:12.4,fontWeight:600}}>{CAL.mAbbr} {to}</span>
<span className="pill pill-n" style={{marginLeft:'auto',fontSize:10}}>{e.src}</span></div>
<div style={{fontSize:12.6,color:'var(--ink-2)',lineHeight:1.55,marginTop:12}}>
Changing it here changes the obligation date in Trust Compass, reschedules the reminders behind it, and tells the client the date moved.
{e.sub.includes('hard date')&&<span style={{color:'var(--bad)',fontWeight:600}}> This one is filed as a hard date — moving it means filing late.</span>}</div>
<div className="row" style={{gap:8,marginTop:16,flexWrap:'wrap'}}>
<button className="btn btn-s btn-p" onClick={onClose}><Ic.check size={12}/>Move it and update the obligation</button>
<button className="btn btn-s" onClick={onClose}>Cancel</button></div></div></div></>};

export const DayDrawer=({d,onClose,onEv})=>{if(!d)return null;const l=cDay(d);
return <SlideOut open={!!d} onClose={onClose} title={cWk[(CAL.first+d-1)%7]+', '+CAL.month+' '+d} sub={l.length+' items · '+CAL.year}
icon={<Ic.clock size={15}/>} foot={<><button className="btn btn-s btn-p"><Ic.plus size={12}/>Block this day</button>
<button className="btn btn-s"><Ic.spark size={12}/>Ask Paige to rearrange it</button></>}>
{cConf(d)&&<div className="row" style={{gap:9,padding:'11px 13px',background:'var(--warn-tint)',border:'1px solid var(--gold-line)',
borderRadius:'var(--r-m)',marginBottom:14,alignItems:'flex-start'}}>
<span style={{color:'var(--warn)',display:'flex',marginTop:1,flex:'none'}}><Ic.bolt size={14}/></span>
<span style={{fontSize:12.4,color:'var(--ink-2)',lineHeight:1.5}}><span style={{fontWeight:600,color:'var(--ink)'}}>A hard filing sits under a long call. </span>
The filing has no give in it. The call does — she can offer the client two other slots inside the same week.</span></div>}
<div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{l.map((e,i)=><button key={e.id} onClick={()=>{onClose();onEv(e)}} className="row" style={{width:'100%',gap:11,padding:'12px 14px',textAlign:'left',
alignItems:'flex-start',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{marginTop:4,flex:'none',display:'flex'}}><LayerDot k={e.k} size={8}/></span>
<span className="grow" style={{minWidth:0,display:'block'}}>
<span className="row" style={{gap:8,flexWrap:'wrap'}}><span className="trunc" style={{fontSize:12.9,fontWeight:600,lineHeight:1.4}}>{e.n}</span>
{e.k==='dead'&&<span className="pill pill-bad" style={{fontSize:10}}>Hard date</span>}</span>
<span className="trunc sub" style={{display:'block',fontSize:11.6,marginTop:2}}>{e.sub}</span></span>
<span className="mono" style={{fontSize:11.4,color:'var(--ink-3)',flex:'none'}}>{e.t}</span></button>)}
{!l.length&&<div className="sub" style={{padding:'16px 14px',fontSize:12.4}}>Nothing on this day. Your links can fill it.</div>}</div>
<div className="eyebrow" style={{marginTop:18}}>What is open</div>
<div className="row" style={{gap:6,marginTop:8,flexWrap:'wrap'}}>{(CBK.slots[d]||['No open slots']).map(s=>
<span key={s} className="pill pill-n" style={{fontSize:11}}>{s}</span>)}</div>
<div className="sub" style={{marginTop:8,fontSize:11.6,lineHeight:1.5}}>Slots come from the availability schedule behind each link, minus what is already booked and minus your buffers.</div></SlideOut>};

export const EvDrawer=({e,onClose})=>{if(!e)return null;const[lbl,c]=CLAY[e.k];
return <SlideOut open={!!e} onClose={onClose} title={e.n} sub={cWk[(CAL.first+e.d-1)%7]+' '+CAL.mAbbr+' '+e.d+' · '+e.t}
icon={e.k==='dead'?<Ic.shield size={15}/>:e.k==='run'?<Ic.bolt size={15}/>:<Ic.clock size={15}/>}
foot={e.k==='dead'?<><button className="btn btn-s btn-p"><Ic.arrow size={12}/>Move it — with a confirm</button>
<button className="btn btn-s">Open in Trust Compass</button></>
:e.k==='meet'?<><button className="btn btn-s btn-p"><Ic.mail size={12}/>Message the attendee</button>
<button className="btn btn-s">Reschedule</button><button className="btn btn-s" style={{color:'var(--ink-3)'}}>Cancel</button></>
:<><button className="btn btn-s btn-p"><Ic.spark size={12}/>Ask Paige about it</button>
<button className="btn btn-s">{e.k==='run'?'Open the rule':'Open the account'}</button></>}>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<span className="row" style={{gap:6,fontSize:11.4,fontWeight:600,color:c}}><LayerDot k={e.k} size={8}/>{lbl}</span>
<span className="pill pill-n">{e.src}</span>{e.dur&&<span className="pill pill-n">{e.dur}</span>}
{e.k==='dead'&&e.sub.includes('hard date')&&<span className="pill pill-bad">Hard date</span>}</div>
<div className="two" style={{gap:12,marginTop:14}}>
{[['When',e.t],['Detail',e.sub]].map(([k,v])=><div key={k} style={{padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{fontSize:9.4}}>{k}</div><div style={{fontSize:12.6,fontWeight:500,marginTop:4,lineHeight:1.45}}>{v}</div></div>)}</div>
<div style={{padding:'12px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',marginTop:12,
fontSize:12.5,color:'var(--ink-2)',lineHeight:1.55}}><span style={{color:'var(--ink)',fontWeight:600}}>Paige's read: </span>{e.note}</div>
{e.k==='dead'&&<><div className="eyebrow" style={{marginTop:18}}>Moving this date</div>
<div style={{fontSize:12.5,color:'var(--ink-2)',lineHeight:1.55,marginTop:6}}>You can drag it on the grid. Nothing changes until you confirm, because the date lives in Trust Compass and the client hears about it.</div></>}
{e.k==='meet'&&<><div className="eyebrow" style={{marginTop:18}}>How it was booked</div>
<div style={{marginTop:8,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{[['Link',e.src],['Buffer','Applied after the call'],['Reminders','24 hours and 1 hour before']].map(([k,v],i)=>
<div key={k} className="row" style={{gap:10,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="eyebrow" style={{fontSize:9.4,width:82,flex:'none'}}>{k}</span>
<span className="trunc" style={{fontSize:12.2,color:'var(--ink-2)'}}>{v}</span></div>)}</div>
<OnCall e={e}/></>}</SlideOut>};

export const CalRail=({layers,setLayers})=>(<div className="card cal-rail" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none',padding:'11px 14px'}}><div style={{minWidth:0}}><h3 style={{fontSize:13.6}}>Layers</h3>
<div className="sub trunc" style={{fontSize:11.4}}>Two on the grid, rest behind a chip</div></div></div>
<div className="pane" style={{flex:1,padding:'10px 12px',display:'grid',gap:10,alignContent:'start'}}>
<div style={{display:'flex',flexWrap:'wrap',gap:5}}>{Object.keys(CLAY).map(k=>{const[l,c,d]=CLAY[k];const on=layers[k];
return <button key={k} onClick={()=>setLayers(s=>({...s,[k]:!s[k]}))} title={d} className="row"
style={{gap:5,height:24,padding:'0 8px',borderRadius:99,flex:'none',border:'1px solid '+(on?c:'var(--line)'),
background:on?c+'14':'transparent',color:on?c:'var(--ink-3)',transition:'.15s'}}>
<span style={{width:6,height:6,borderRadius:2,background:on?c:'var(--line)',flex:'none',display:'block'}}/>
<span style={{fontSize:11,fontWeight:600}}>{l.replace(' deadlines','').replace(' blocks','').replace(' runs','').replace(' milestones','').replace('Paige ','')}</span>
<span className="mono" style={{fontSize:9.8,opacity:.75}}>{CAL.ev.filter(e=>e.k===k).length}</span></button>})}</div>
<div style={{height:1,background:'var(--line-soft)'}}/>
<div><div className="eyebrow" style={{fontSize:9.6,marginBottom:7}}>Next up</div>
<div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{CAL.next.map(([d,t,n,k],i)=><div key={i} className="row" style={{gap:8,padding:'8px 10px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<LayerDot k={k} size={6}/><span className="grow trunc" style={{fontSize:11.4}}>{n}</span>
<span className="mono" style={{fontSize:10.2,color:'var(--ink-3)',flex:'none'}}>{t}</span></div>)}</div></div>
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige's read</div>
<div style={{fontSize:12.3,color:'var(--ink-2)',lineHeight:1.55,marginTop:7}}>{CAL.read}</div></div></div></div>);

export const CalendarSchedule=()=>{const[view,setView]=React.useState('month');
const[layers,setLayers]=React.useState({meet:true,dead:true,run:true,mile:true,avail:true,fu:true});
const[day,setDay]=React.useState(null);const[ev,setEv]=React.useState(null);const[mv,setMv]=React.useState(null);
return <div className="cal-fill">
<div className="card row" style={{padding:0,overflow:'hidden'}}>{CAL.strip.map(([k,v,s],i)=>
<div key={k} className="row grow" style={{gap:10,padding:'9px 14px',minWidth:0,borderLeft:i?'1px solid var(--line-soft)':'0'}}>
<span className="mono" style={{fontSize:21,fontWeight:600,letterSpacing:'-.03em',flex:'none',color:k==='Conflicts'?'var(--warn)':'var(--ink)'}}>{v}</span>
<span className="grow" style={{minWidth:0}}><span className="eyebrow trunc" style={{fontSize:9.4,display:'block'}}>{k}</span>
<span className="sub trunc" style={{fontSize:10.9,display:'block'}}>{s}</span></span></div>)}</div>
<div className="cal-2">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none',flexWrap:'wrap',rowGap:9,padding:'11px 16px'}}>
<div className="row" style={{gap:8,minWidth:0}}>
<button className="btn btn-s" style={{width:28,padding:0,justifyContent:'center'}}><span style={{display:'flex',transform:'rotate(180deg)'}}><Ic.chev size={14}/></span></button>
<button className="btn btn-s" style={{width:28,padding:0,justifyContent:'center'}}><Ic.chev size={14}/></button>
<h3 style={{fontSize:15,whiteSpace:'nowrap'}}>{CAL.label}</h3>
<button className="btn btn-s" style={{height:26,fontSize:11.5}}>Today</button></div>
<div className="row" style={{gap:8,flex:'none'}}>
<span className="pill pill-warn cc-hide" style={{fontSize:10.4}}><Ic.bolt size={10}/>2 conflicts</span>
<div className="seg">{[['month','Month'],['week','Week'],['agenda','Agenda']].map(([k,l])=>
<button key={k} aria-pressed={view===k} onClick={()=>setView(k)}>{l}</button>)}</div></div></div>
{view==='month'?<div key="m" className="fade-in cal-month">
<MonthGrid layers={layers} onDay={setDay} onEv={setEv} onMove={setMv}/></div>
:view==='week'?<div key="w" className="fade-in" style={{flex:1,display:'flex',flexDirection:'column',minHeight:0}}><WeekGrid layers={layers} onEv={setEv}/></div>
:<div key="a" className="fade-in" style={{flex:1,display:'flex',flexDirection:'column',minHeight:0}}><AgendaList layers={layers} onEv={setEv}/></div>}
<div className="row" style={{flex:'none',gap:12,padding:'6px 16px',borderTop:'1px solid var(--line-soft)',background:'var(--surface-2)'}}>
<span className="sub trunc" style={{fontSize:10.6}}>Drag a deadline to move it — you confirm before anything changes</span></div></div>
<CalRail layers={layers} setLayers={setLayers}/></div>
<DayDrawer d={day} onClose={()=>setDay(null)} onEv={setEv}/>
<EvDrawer e={ev} onClose={()=>setEv(null)}/>
<MoveConfirm mv={mv} onClose={()=>setMv(null)}/></div>};
