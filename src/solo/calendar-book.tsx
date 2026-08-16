// @ts-nocheck
import React from "react";
import { Ic, Avatar, Meter, SlideOut, SubTabs } from "./_shared";
import { CAL, CBK } from "./calendar-data";
import { cWk, CalendarSchedule } from "./calendar";
import { CalendarRouting, LinkDrawer } from "./calendar-cfg";
import { CalendarSettings } from "./calendar-settings";
import { WB, WbRow, WbDrawer } from "./calendar-webinar";
import { PendBanner, HealthSignalCard } from "./automations";

export const PublicPage=({t,onClose})=>{if(!t)return null;
const[sel,setSel]=React.useState(null);const[time,setTime]=React.useState(null);const[done,setDone]=React.useState(false);
const cells=[];for(let i=CAL.first;i>0;i--)cells.push({o:true,n:CAL.prev-i+1});
for(let d=1;d<=CAL.days;d++)cells.push({d,n:d});
const slots=sel?(CBK.slots[sel]||[]):[];
return <><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(23,19,49,.5)',backdropFilter:'blur(4px)',zIndex:90}}/>
<div className="fade-in" style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(1000px,95vw)',height:'min(624px,92vh)',zIndex:91,
display:'flex',flexDirection:'column',borderRadius:'var(--r-l)',overflow:'hidden',boxShadow:'var(--sh-3)',background:'var(--surface)',border:'1px solid var(--line)'}}>
<div className="row" style={{gap:10,padding:'9px 14px',background:'var(--surface-sunk)',borderBottom:'1px solid var(--line)',flex:'none'}}>
<span className="row" style={{gap:5,flex:'none'}}>{['#E5645C','#E9B94A','#5CB570'].map(c=><span key={c} style={{width:9,height:9,borderRadius:'50%',background:c}}/>)}</span>
<span className="row grow" style={{gap:7,height:24,padding:'0 10px',borderRadius:7,background:'var(--surface)',border:'1px solid var(--line)',minWidth:0}}>
<span style={{color:'var(--ok)',display:'flex',flex:'none'}}><Ic.shield size={11}/></span>
<span className="mono trunc" style={{fontSize:10.8,color:'var(--ink-3)'}}>book.paige.ai/{t.slug}</span></span>
<span className="pill pill-v" style={{fontSize:10,flex:'none'}}>What your client sees</span>
<button className="btn btn-s" onClick={onClose} style={{width:26,height:26,padding:0,justifyContent:'center',borderRadius:'50%',flex:'none'}}><Ic.x size={13}/></button></div>
<div className="pub-body">
<div style={{padding:'26px 24px',borderRight:'1px solid var(--line)',display:'flex',flexDirection:'column',minWidth:0,overflow:'auto'}}>
<Avatar name="Jordan Avery" size={44} tone="var(--violet)"/>
<div style={{fontSize:12.6,color:'var(--ink-3)',marginTop:14,fontWeight:500}}>Jordan Avery</div>
<div style={{fontSize:20,fontWeight:600,letterSpacing:'-.03em',marginTop:2,lineHeight:1.25}}>{t.n}</div>
<div style={{display:'grid',gap:9,marginTop:16}}>
{[[<Ic.clock size={14}/>,t.dur],[<Ic.pulse size={14}/>,t.loc],[<Ic.bolt size={14}/>,t.price]].map(([ic,v],i)=>
<div key={i} className="row" style={{gap:9,fontSize:12.8,color:'var(--ink-2)',fontWeight:500}}>
<span style={{color:'var(--ink-3)',display:'flex',flex:'none'}}>{ic}</span>{v}</div>)}
{time&&<div className="row fade-in" style={{gap:9,fontSize:12.8,color:'var(--violet)',fontWeight:600}}>
<span style={{display:'flex',flex:'none'}}><Ic.check size={14}/></span>{time} · {cWk[(CAL.first+sel-1)%7]}, {CAL.month} {sel}</div>}</div>
<div style={{fontSize:12.6,color:'var(--ink-2)',lineHeight:1.6,marginTop:18,paddingTop:16,borderTop:'1px solid var(--line-soft)'}}>{t.d}</div>
<div style={{marginTop:'auto',paddingTop:18,fontSize:10.8,color:'var(--ink-3)'}}>Scheduling by Paige Agent AI</div></div>
{done?<div className="fade-in" style={{padding:'40px 34px',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'flex-start',gap:12,minWidth:0,overflow:'auto'}}>
<span className="tile" style={{width:44,height:44,borderRadius:15,background:'var(--ok-tint)',color:'var(--ok)'}}><Ic.check size={22}/></span>
<div style={{fontSize:19,fontWeight:600,letterSpacing:'-.03em'}}>You are booked</div>
<div style={{fontSize:13,color:'var(--ink-2)',lineHeight:1.6,maxWidth:400}}>{t.cf.replace('{time}',time+' on '+cWk[(CAL.first+sel-1)%7]+', '+CAL.month+' '+sel)}</div>
<div style={{padding:'12px 14px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)',maxWidth:400,marginTop:4}}>
<div className="eyebrow" style={{fontSize:9.4}}>Before we talk</div>
<div style={{display:'grid',gap:6,marginTop:7}}>{t.q.map(q=><div key={q} className="row" style={{gap:7,fontSize:12.2,color:'var(--ink-2)'}}>
<span style={{width:4,height:4,borderRadius:'50%',background:'var(--violet)',flex:'none'}}/>{q}</div>)}</div></div>
<button className="btn btn-s" onClick={()=>{setDone(false);setTime(null);setSel(null)}} style={{marginTop:6}}>Start over</button></div>
:<div style={{display:'flex',minWidth:0,overflow:'hidden'}}>
<div style={{flex:'1 1 auto',padding:'22px 22px 16px',minWidth:0,overflow:'auto'}}>
<div className="row" style={{gap:8,marginBottom:14}}>
<h3 style={{fontSize:14.5,whiteSpace:'nowrap'}}>Select a day</h3>
<div className="row" style={{gap:4,marginLeft:'auto',flex:'none'}}>
<button className="btn btn-s" style={{width:26,padding:0,justifyContent:'center'}}><span style={{display:'flex',transform:'rotate(180deg)'}}><Ic.chev size={13}/></span></button>
<span className="mono" style={{fontSize:12,fontWeight:600,padding:'0 4px'}}>{CAL.label}</span>
<button className="btn btn-s" style={{width:26,padding:0,justifyContent:'center'}}><Ic.chev size={13}/></button></div></div>
<div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>
{cWk.map(w=><div key={w} style={{textAlign:'center',fontSize:9.6,fontWeight:600,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--ink-3)',paddingBottom:4}}>{w[0]}</div>)}
{cells.map((c,i)=>{const has=c.d&&CBK.slots[c.d];const on=sel===c.d;
return <button key={i} disabled={!has} onClick={()=>{setSel(c.d);setTime(null)}}
style={{aspectRatio:'1',borderRadius:'50%',display:'grid',placeItems:'center',fontFamily:'var(--mono)',fontSize:12.4,fontWeight:has?600:400,
background:on?'var(--violet)':has?'var(--violet-tint)':'transparent',color:on?'#fff':has?'var(--violet)':'var(--ink-3)',
opacity:has?1:.35,cursor:has?'pointer':'default',transition:'.15s',border:on?'0':'1px solid transparent'}}>{c.n}</button>})}</div>
<div className="row" style={{gap:8,marginTop:16,fontSize:11.6,color:'var(--ink-3)'}}>
<Ic.clock size={13}/>Eastern Time — US &amp; Canada
<span className="row" style={{gap:5,marginLeft:'auto',flex:'none'}}><span style={{width:9,height:9,borderRadius:'50%',background:'var(--violet-tint)'}}/>Open</span></div></div>
{sel&&<div className="fade-in pub-slots">
<div style={{fontSize:12.6,fontWeight:600,marginBottom:11}}>{cWk[(CAL.first+sel-1)%7]}, {CAL.month} {sel}</div>
<div style={{display:'grid',gap:7}}>{slots.map(s=>time===s
?<div key={s} className="row fade-in" style={{gap:7}}>
<button onClick={()=>setTime(null)} className="btn btn-s" style={{flex:1,justifyContent:'center',height:36,fontSize:12.4,background:'var(--ink)',color:'var(--ink-inv)',borderColor:'var(--ink)'}}>{s}</button>
<button onClick={()=>setDone(true)} className="btn btn-s btn-p" style={{flex:1,justifyContent:'center',height:36,fontSize:12.4,background:'var(--violet)',borderColor:'var(--violet)',color:'#fff'}}>Confirm</button></div>
:<button key={s} onClick={()=>setTime(s)} className="btn btn-s" style={{justifyContent:'center',height:36,fontSize:12.4,fontWeight:600,
borderColor:'var(--violet-line)',color:'var(--violet)'}}>{s}</button>)}
{!slots.length&&<div className="sub" style={{fontSize:12}}>Nothing open that day.</div>}</div></div>}</div>}</div></div></>};

export const TypeRow=({t,onOpen,onPreview})=>(<div className="row" style={{gap:12,padding:'12px 16px',borderTop:'1px solid var(--line-soft)',alignItems:'flex-start',
transition:'.15s'}} onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
<span style={{width:3,alignSelf:'stretch',borderRadius:2,background:t.active?'var(--violet)':'var(--line)',flex:'none'}}/>
<button onClick={()=>onOpen(t)} className="grow" style={{minWidth:0,textAlign:'left'}}>
<span className="row" style={{gap:8,flexWrap:'wrap'}}>
<span className="trunc" style={{fontSize:13.2,fontWeight:600,letterSpacing:'-.01em'}}>{t.n}</span>
<span className="pill pill-v" style={{fontSize:10.2}}>{t.dur}</span>
<span className={'pill '+(t.active?'pill-ok':'pill-n')} style={{fontSize:10.2}}>{t.active?'Live':'Off'}</span>
{t.price!=='Free'&&t.price!=='Included'&&<span className="pill" style={{fontSize:10.2,background:'var(--gold-tint)',color:'var(--gold)'}}>{t.price}</span>}</span>
<span className="an-note" style={{display:'block',fontSize:12,color:'var(--ink-2)',lineHeight:1.5,marginTop:4}}>{t.d}</span>
<span className="row" style={{gap:9,marginTop:6,flexWrap:'wrap'}}>
<span className="mono" style={{fontSize:10.6,color:'var(--ink-3)'}}>book.paige.ai/{t.slug}</span>
<span style={{fontSize:10.8,color:'var(--ink-3)'}}>{t.sched} · buffer {t.buf} · {t.notice} notice</span></span></button>
<span style={{flex:'none',textAlign:'right',minWidth:76}}>
<span className="mono" style={{fontSize:16,fontWeight:600,display:'block',letterSpacing:'-.02em'}}>{t.bk30}</span>
<span className="mono sub" style={{fontSize:10.2}}>last 30 days</span></span>
<button className="btn btn-s" onClick={()=>onPreview(t)} style={{flex:'none',height:26,fontSize:11.4}}><Ic.search size={11}/>Preview</button></div>);

export const CalendarLinks=({onPreview})=>{const[t,setT]=React.useState(null);const[w,setW]=React.useState(null);const[mode,setMode]=React.useState('one');
const many=mode==='many';
return <><div className="an-brief">
<PendBanner text={CBK.pend}/>
<div className="card row" style={{padding:0,overflow:'hidden'}}>
{(many?[['Sessions','3','One scheduled, one drafted, one ended'],['Registered','64','Eight more on the waitlist'],
['June show rate','57%','47 of 82, and three became clients'],['Rules running','5','Filed into Automations under Calendar']]
:[['Live links','5','One of six is switched off'],['Booked last 30 days','30','Fourteen of them free consults'],
['Show rate','93%','One no-show, eleven rebooked'],['Paid holds','2','Deep-dives, card authorised at booking']]).map(([k,v,s],i)=>
<div key={k} className="row grow" style={{gap:10,padding:'9px 14px',minWidth:0,borderLeft:i?'1px solid var(--line-soft)':'0'}}>
<span className="mono" style={{fontSize:21,fontWeight:600,letterSpacing:'-.03em',flex:'none'}}>{v}</span>
<span className="grow" style={{minWidth:0}}><span className="eyebrow trunc" style={{fontSize:9.4,display:'block'}}>{k}</span>
<span className="sub trunc" style={{fontSize:10.9,display:'block'}}>{s}</span></span></div>)}</div>
<div className="an-2">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none',flexWrap:'wrap',rowGap:9}}><div style={{minWidth:0}}><h3>{many?'Sessions for a room':'What people can book'}</h3>
<div className="sub trunc">{many?'One slot, many registrants — cap, waitlist and a chain of rules':'Six event types · each one points at an availability schedule'}</div></div>
<div className="row" style={{gap:8,flex:'none'}}>
<div className="seg">{[['one','One to one'],['many','One to many']].map(([k,l])=>
<button key={k} aria-pressed={mode===k} onClick={()=>setMode(k)}>{l}</button>)}</div>
<button className="btn btn-s btn-g"><Ic.plus size={12}/>{many?'New session':'New link'}</button></div></div>
<div key={mode} className="pane fade-in" style={{flex:1}}>{many
?WB.sessions.map(x=><WbRow key={x.n} w={x} onOpen={setW} onPreview={onPreview}/>)
:CBK.types.map(x=><TypeRow key={x.n} t={x} onOpen={setT} onPreview={onPreview}/>)}</div></div>
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>{many?'What a room is worth':'Booking signals'}</h3><div className="sub">{many?'Two cohorts, and the difference between them':'What she would fix first'}</div></div></div>
<div key={mode} className="pane fade-in" style={{flex:1,padding:'11px 13px',display:'grid',gap:9,alignContent:'start'}}>
{many?<>{WB.cohorts.map(c=><div key={c.n} style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="row" style={{gap:8,flexWrap:'wrap'}}><span className="grow" style={{minWidth:0,fontSize:12.7,fontWeight:600}}>{c.n}</span>
<span className="pill pill-ok" style={{fontSize:10}}>{c.cl} {c.cl===1?'client':'clients'}</span></div>
<div className="row" style={{gap:9,marginTop:9}}><span className="grow"><Meter pct={c.att/c.reg*100} tone="#2E7D8F" h={4}/></span>
<span className="mono" style={{fontSize:10.6,color:'var(--ink-3)',flex:'none'}}>{c.att}/{c.reg}</span></div>
<div style={{fontSize:11.6,color:'var(--ink-2)',lineHeight:1.5,marginTop:8}}>{c.note}</div>
<div className="row" style={{gap:8,marginTop:8,flexWrap:'wrap'}}>
<span className="pill pill-n" style={{fontSize:10}}>{c.cac} per client</span><span className="pill pill-n" style={{fontSize:10}}>{c.pay} payback</span></div></div>)}
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige's read</div>
<div style={{fontSize:12.3,color:'var(--ink-2)',lineHeight:1.55,marginTop:7}}>Eight people are on the waitlist for the twenty-seventh because Zoom caps you at a hundred. Her room has no cap, and the last session did not need Zoom for anything.</div></div></>
:CBK.health.map((g,i)=><HealthSignalCard key={i} g={g}/>)}</div></div></div></div>
<LinkDrawer t={t} onClose={()=>setT(null)} onPreview={onPreview}/>
<WbDrawer w={w} onClose={()=>setW(null)} onPreview={onPreview}/></>};

export const CalendarAvail=()=>{const[s,setS]=React.useState(CBK.sched[0]);
return <div className="an-2">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div style={{minWidth:0}}><h3>{s.n}</h3>
<div className="sub trunc">{s.tz} · attached to {s.used} {s.used===1?'link':'links'}</div></div>
<button className="btn btn-s btn-g"><Ic.check size={12}/>Save</button></div>
<div className="pane" style={{flex:1,padding:'14px 16px'}}>
<div style={{fontSize:12.5,color:'var(--ink-2)',lineHeight:1.55,marginBottom:14}}>{s.note}</div>
<div className="eyebrow" style={{fontSize:9.6}}>Weekly hours</div>
<div style={{marginTop:8,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{s.h.map(([d,h],i)=>{const off=h==='Unavailable';
return <div key={d} className="row" style={{gap:12,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0',background:off?'var(--surface-2)':'transparent'}}>
<span style={{width:34,flex:'none',fontSize:12,fontWeight:600,color:off?'var(--ink-3)':'var(--ink)'}}>{d}</span>
<span style={{width:34,height:18,borderRadius:99,flex:'none',background:off?'var(--surface-sunk)':'var(--ok)',position:'relative',border:'1px solid '+(off?'var(--line)':'var(--ok)')}}>
<span style={{position:'absolute',top:2,left:off?2:17,width:12,height:12,borderRadius:'50%',background:'#fff',transition:'.2s',boxShadow:'var(--sh-1)'}}/></span>
<span className="mono grow trunc" style={{fontSize:12,color:off?'var(--ink-3)':'var(--ink-2)'}}>{h}</span>
{!off&&<span className="row" style={{gap:6,flex:'none',color:'var(--ink-3)'}}><Ic.plus size={13}/></span>}</div>})}</div>
<div className="eyebrow" style={{marginTop:18,fontSize:9.6}}>Date overrides</div>
<div style={{marginTop:8,display:'grid',gap:7}}>
{s.ov.map(([d,w])=><div key={d} className="row" style={{gap:10,padding:'10px 12px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<span className="mono" style={{fontSize:12,fontWeight:600,width:52,flex:'none'}}>{d}</span>
<span className="grow trunc" style={{fontSize:12.2,color:'var(--ink-2)'}}>{w}</span>
<span style={{color:'var(--ink-3)',display:'flex',flex:'none'}}><Ic.x size={13}/></span></div>)}
{!s.ov.length&&<div className="sub" style={{fontSize:12}}>No overrides on this schedule.</div>}
<button className="btn btn-s" style={{alignSelf:'start'}}><Ic.plus size={12}/>Add a date override</button></div>
<div className="two" style={{gap:12,marginTop:18}}>
{[['Timezone',s.tz],['Attached links',s.used+' of 6']].map(([k,v])=><div key={k} style={{padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{fontSize:9.4}}>{k}</div><div className="mono" style={{fontSize:12.6,fontWeight:600,marginTop:4}}>{v}</div></div>)}</div></div></div>
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Schedules</h3><div className="sub">Reusable — links point at these</div></div></div>
<div className="pane" style={{flex:1,padding:'11px 13px',display:'grid',gap:9,alignContent:'start'}}>
{CBK.sched.map(x=><button key={x.n} onClick={()=>setS(x)} className="row" style={{gap:11,padding:'12px 13px',textAlign:'left',alignItems:'flex-start',
border:'1px solid '+(s.n===x.n?'var(--violet)':'var(--line)'),borderRadius:'var(--r-m)',
background:s.n===x.n?'var(--violet-tint)':'transparent',transition:'.15s'}}>
<span className="grow" style={{minWidth:0}}>
<span className="row" style={{gap:7,flexWrap:'wrap'}}><span className="trunc" style={{fontSize:12.7,fontWeight:600}}>{x.n}</span>
{x.def&&<span className="pill pill-n" style={{fontSize:10}}>Default</span>}</span>
<span className="trunc sub" style={{display:'block',fontSize:11.4,marginTop:2}}>{x.h.filter(h=>h[1]!=='Unavailable').length} days open · {x.used} {x.used===1?'link':'links'}</span></span>
<span style={{color:'var(--ink-3)',display:'flex',marginTop:2,flex:'none'}}><Ic.chev size={14}/></span></button>)}
<button className="btn btn-s" style={{justifyContent:'center'}}><Ic.plus size={12}/>New schedule</button>

<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige's read</div>
<div style={{fontSize:12.3,color:'var(--ink-2)',lineHeight:1.55,marginTop:7}}>Client hours carries four of your six links, so a change there moves almost everything. If you want one link looser than the rest, give it its own schedule rather than widening this one.</div></div></div></div></div>};

export const CalendarRequests=()=>{const[r,setR]=React.useState(null);
const tone=st=>st==='Needs a decision'?'pill-warn':st==='Rescheduled'?'pill-v':'pill-n';
return <><div className="an-2">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div style={{minWidth:0}}><h3>Requests and changes</h3>
<div className="sub trunc">Two need a decision · newest first</div></div>
<span className="pill pill-warn"><span className="dot" style={{background:'var(--warn)'}}/>2 waiting</span></div>
<div className="pane" style={{flex:1}}>{CBK.req.map(x=><button key={x.who} onClick={()=>setR(x)} className="row" style={{width:'100%',gap:12,padding:'12px 16px',
textAlign:'left',alignItems:'flex-start',borderTop:'1px solid var(--line-soft)',transition:'.15s'}}
onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
<Avatar name={x.who} size={30}/>
<span className="grow" style={{minWidth:0}}>
<span className="row" style={{gap:8,flexWrap:'wrap'}}><span className="trunc" style={{fontSize:13,fontWeight:600}}>{x.who}</span>
<span className="pill pill-n" style={{fontSize:10.2}}>{x.co}</span>
<span className={'pill '+tone(x.st)} style={{fontSize:10.2}}>{x.st}</span></span>
<span className="trunc" style={{display:'block',fontSize:12,color:'var(--ink-2)',marginTop:3}}>{x.type} · {x.want}</span>
<span className="an-note" style={{display:'block',fontSize:11.6,color:'var(--ink-3)',lineHeight:1.45,marginTop:3}}>{x.why}</span></span>
{x.st==='Needs a decision'&&<span className="row" style={{gap:6,flex:'none'}}>
<span className="btn btn-s btn-g" style={{height:26,fontSize:11.4}}><Ic.check size={11}/>Accept</span>
<span className="btn btn-s" style={{height:26,fontSize:11.4,color:'var(--ink-3)'}}>Decline</span></span>}</button>)}</div></div>
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Where the bookings come from</h3><div className="sub">Last 30 days</div></div></div>
<div className="pane" style={{flex:1,padding:'12px 14px',display:'grid',gap:11,alignContent:'start'}}>
<div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{CBK.types.filter(t=>t.bk30).map((t,i)=><div key={t.n} className="row" style={{gap:10,padding:'10px 12px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow trunc" style={{fontSize:12.2}}>{t.n}</span>
<span className="grow" style={{minWidth:40,maxWidth:72}}><Meter pct={t.bk30/14*100} tone="var(--violet)" h={4}/></span>
<span className="mono" style={{fontSize:11,color:'var(--ink-3)',flex:'none'}}>{t.bk30}</span></div>)}</div>
<div className="two" style={{gap:10}}>
{[['Accepted','27'],['Declined','1'],['Rescheduled','3'],['Cancelled','2']].map(([k,v])=>
<div key={k} style={{padding:'10px 12px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{fontSize:9.4}}>{k}</div><div className="mono" style={{fontSize:15,fontWeight:600,marginTop:3}}>{v}</div></div>)}</div>
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige's read</div>
<div style={{fontSize:12.3,color:'var(--ink-2)',lineHeight:1.55,marginTop:7}}>Both requests waiting are worth taking. Marsh wants a deep-dive window that is already held for Ridgeline at 9:30 — I can offer her Thursday at eleven without touching anything you have booked.</div></div></div></div></div>
<SlideOut open={!!r} onClose={()=>setR(null)} title={r?r.who:''} sub={r?r.co+' · '+r.type:''} icon={<Ic.mail size={15}/>}
foot={r&&r.st==='Needs a decision'?<><button className="btn btn-s btn-p"><Ic.check size={12}/>Accept the time</button>
<button className="btn btn-s"><Ic.spark size={12}/>Offer another slot</button>
<button className="btn btn-s" style={{color:'var(--ink-3)'}}>Decline</button></>
:<button className="btn btn-s btn-p"><Ic.mail size={12}/>Message them</button>}>
{r&&<><div className="row" style={{gap:9,flexWrap:'wrap'}}><span className={'pill '+tone(r.st)}>{r.st}</span>
<span className="pill pill-v">{r.type}</span><span className="pill pill-n">{r.paid}</span></div>
<div style={{padding:'12px 14px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',marginTop:14}}>
<div className="eyebrow" style={{fontSize:9.4}}>Time requested</div>
<div style={{fontSize:14.5,fontWeight:600,marginTop:4,letterSpacing:'-.02em'}}>{r.want}</div></div>
<div style={{padding:'12px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',marginTop:12,
fontSize:12.5,color:'var(--ink-2)',lineHeight:1.55}}><span style={{color:'var(--ink)',fontWeight:600}}>Paige's read: </span>{r.why}</div>
<div className="eyebrow" style={{marginTop:18}}>What they told her at booking</div>
<div style={{marginTop:8,display:'grid',gap:8}}>{r.ans.map(([q,a])=><div key={q} style={{padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div style={{fontSize:11.4,color:'var(--ink-3)',fontWeight:500}}>{q}</div>
<div style={{fontSize:12.6,color:'var(--ink)',marginTop:4,lineHeight:1.5}}>{a}</div></div>)}</div></>}</SlideOut></>};

export const CalendarHub=()=>{const[tab,setTab]=React.useState('sch');const[pv,setPv]=React.useState(null);
const tabs=[['sch','Schedule',()=><Ic.cal size={14}/>],['links','Booking links',()=><Ic.send size={14}/>],
['route','Routing',()=><Ic.filter size={14}/>],['avail','Availability',()=><Ic.clock size={14}/>],['req','Requests',()=><Ic.mail size={14}/>],['set','Settings',()=><Ic.gear size={14}/>]];
const subs={sch:'Meetings, filings, automation runs and follow-ups on one grid — the deadline and the call in the same place.',
links:'Six links for one person and three sessions for a room. Hosts, timing, money, follow-up and sharing live inside each one.',
route:'A question in front of the calendar, so a cold lead and a paying client do not land in the same slot.',
avail:'Named schedules your links reuse. Change one and everything attached to it moves.',
req:'Requests, reschedules and cancellations that want a decision from you.',
set:'Where the calendars themselves get built \u2014 durations, reminder cadence, policies and what she may decide alone.'};
const body={sch:<CalendarSchedule/>,links:<CalendarLinks onPreview={setPv}/>,route:<CalendarRouting/>,avail:<CalendarAvail/>,req:<CalendarRequests/>,set:<CalendarSettings/>}[tab];
return <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0,minWidth:0,alignItems:'stretch'}}>
<SubTabs tabs={tabs} cur={tab} set={setTab} right={<>
<span className="pill pill-n cc-hide"><span className="dot" style={{background:'var(--warn)'}}/>2 conflicts</span>
<button className="btn btn-s" onClick={()=>setTab('req')}><Ic.mail size={13}/>2 requests</button>
<button className="btn btn-s btn-g" onClick={()=>setPv(CBK.types[0])}><Ic.search size={13}/>Preview your page</button></>}/>
<div className="fade-in pg" style={{width:'100%',maxWidth:1440,margin:'0 auto'}}>
<div className="row" style={{flex:'none',gap:12,padding:'7px 30px',borderBottom:'1px solid var(--line-soft)',background:'var(--surface)'}}>
<span className="trunc" style={{fontSize:12.3,color:'var(--ink-2)'}}>{subs[tab]}</span></div>
<div className="pg-body" style={{padding:'12px 30px 18px'}}><div key={tab} className="fade-in an-fill">{body}</div></div></div>
{pv&&<PublicPage t={pv} onClose={()=>setPv(null)}/>}</div>};
