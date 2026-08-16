// @ts-nocheck
import React from "react";
import { Ic, Avatar } from "./_shared";

const CH={email:['Email','var(--violet)'],sms:['SMS','#2E7D8F'],wa:['WhatsApp','var(--ok)'],ig:['Instagram','#B4529E']};
export const IB={
threads:[
 {id:1,n:'Tashia Anderson',role:'Co-Founder · Mogul Maker Academy',ch:'email',t:'2d',unread:0,pin:true,pres:'Active 12m ago',online:true,state:'Hot Lead',tenure:'Client for 14 days',email:'tashiaanderson@me.com',phone:'404 343 5583',
  smart:['Answer both questions','Send phase-one checklist','Book the STACK call'],
  msgs:[{d:'Monday'},
   {me:true,body:"Welcome to Mogul Maker Academy — and to BUILD-to-FUND.\n\nThree phases: BUILD gets your foundation fundable, STACK gets your business credit reporting, FUND puts you in front of the right lenders. Your first task is in the portal and takes about ten minutes.",t:'9:04am',st:'read',ch:'email',subj:'Welcome to Mogul Maker Academy, Tashia'},
   {body:'This is exactly what I needed to see laid out.',t:'2:11pm',ch:'email'},
   {body:'Two questions before we start phase one — does the BUILD phase need my EIN letter, and can my bookkeeper sit in on the STACK call?',t:'2:12pm',ch:'email'},
   {d:'Today'},
   {paige:true,body:'Both answers are easy: the EIN letter is needed at BUILD step three, not now, and the bookkeeper is welcome on the STACK call. Draft is written in your voice with the phase-one checklist attached.',t:'8:52am'}]},
 {id:2,n:'Dana Harper',role:'Partner · Harper & Vale',ch:'email',t:'3h',unread:2,pres:'Active 3h ago',online:false,state:'Renewal',tenure:'Client for 14 months',email:'dana@harpervale.co',phone:'415 882 3310',
  smart:['Send the renewal note','Offer two call windows','Attach the quarter numbers'],
  msgs:[{d:'Today'},{body:'Are we still on for the Q4 planning session next week?',t:'6:40am',ch:'email'},
   {body:'Also — leadership asked what the renewal looks like. Can you send numbers?',t:'6:41am',ch:'email'},
   {paige:true,body:'Renewal note drafted at 94% confidence: same rate, two extra strategy sessions, opening with the 34% lift in briefs shipped.',t:'7:02am'}]},
 {id:3,n:'Ridgeline Co.',role:'Marcus Vaughn · Ops',ch:'sms',t:'1d',unread:1,pres:'Active 1d ago',online:false,state:'Watch',tenure:'Client for 7 months',email:'ops@ridgeline.co',phone:'503 771 0042',
  smart:['Move it to Tuesday','Ask what is blocking DNS','Confirm and reschedule'],
  msgs:[{d:'Yesterday'},{body:'Can we push Thursday to next week? DNS is still stuck on our side.',t:'4:18pm',ch:'sms'},
   {me:true,body:'No problem. I will send two windows.',t:'4:31pm',st:'read',ch:'sms'},
   {d:'Today'},{body:'Appreciate it. Any chance you can look at the redirect list too?',t:'9:12am',ch:'sms'}]},
 {id:4,n:'Lavelle Napier',role:'CEO · Napier Holdings LLC',ch:'wa',t:'14d',unread:0,pres:'Active 14d ago',online:false,state:'Nurture',tenure:'Client for 9 months',email:'lavelle@napierholdings.com',phone:'678 220 9114',
  smart:['Check in without pressure','Share the teardown','Ask about Q4 plans'],
  msgs:[{d:'Jul 30'},{me:true,body:'Just wanted to check in — how did the lender conversation land?',t:'11:02am',st:'read',ch:'wa'},
   {body:'Went well. Circling back after the holiday.',t:'11:40am',ch:'wa'}]},
 {id:5,n:'Selby Group',role:'Founder · Selby Group',ch:'ig',t:'19d',unread:0,pres:'Active 19d ago',online:false,state:'At risk',tenure:'Client for 5 months',email:'hello@selbygroup.com',phone:'312 604 7788',
  smart:['Send the reset note','Offer a 15-minute call','Ask what changed'],
  msgs:[{d:'Jul 25'},{body:'Sounds good.',t:'3:20pm',ch:'ig'},
   {d:'Today'},{paige:true,body:'Nineteen days quiet, two skipped calls, portal logins stopped the week the scope changed. Low-pressure reset drafted with two exits — a 15-minute call or an async update.',t:'7:48am'}]}]};

const Tick=({st})=>st==='sent'?<Ic.check size={12}/>:<span style={{display:'flex',marginRight:-5}}><Ic.check size={12}/><Ic.check size={12} style={{marginLeft:-6}}/></span>;

const ChDot=({ch,size=8})=>(<span style={{width:size,height:size,borderRadius:'50%',background:CH[ch][1],flex:'none'}}/>);

const Bubble2=({m,name})=>{const[hov,setHov]=React.useState(false);
if(m.d)return <div className="row" style={{gap:12,margin:'6px 0 2px'}}><span style={{flex:1,height:1,background:'var(--line)'}}/>
<span className="mono" style={{fontSize:10.5,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)'}}>{m.d}</span><span style={{flex:1,height:1,background:'var(--line)'}}/></div>;
const mine=m.me,paige=m.paige;
return <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{display:'flex',flexDirection:'column',alignItems:mine?'flex-end':'flex-start',gap:4}}>
<div className="row" style={{gap:8,alignItems:'flex-end',flexDirection:mine?'row-reverse':'row',maxWidth:'82%'}}>
{!mine&&(paige?<div className="tile" style={{width:26,height:26,borderRadius:'50%',background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.spark size={13}/></div>:<Avatar name={name} size={26}/>)}
<div style={{background:mine?'var(--ink)':paige?'var(--violet-tint)':'var(--surface)',color:mine?'var(--ink-inv)':'var(--ink-2)',
border:mine?'0':'1px solid '+(paige?'var(--violet-line)':'var(--line)'),padding:m.subj?'13px 16px':'10px 15px',
borderRadius:mine?'20px 20px 6px 20px':'20px 20px 20px 6px',fontSize:13.6,lineHeight:1.55,whiteSpace:'pre-wrap',boxShadow:mine?'none':'var(--sh-1)'}}>
{paige&&<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.5,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',marginBottom:7}}><Ic.spark size={11}/>Paige suggests</div>}
{m.subj&&<div style={{fontWeight:600,marginBottom:6,color:mine?'#fff':'var(--ink)'}}>{m.subj}</div>}{m.body}
{paige&&<div className="row" style={{gap:7,marginTop:11}}><button className="btn btn-s btn-p"><Ic.check size={12}/>Send it</button><button className="btn btn-s">Edit</button><button className="btn btn-s">Not now</button></div>}</div>
{hov&&!paige&&<div className="row" style={{gap:4,opacity:.85}}>{['send','doc','dots'].map(k=>
<button key={k} className="btn btn-s" style={{width:24,height:24,padding:0,justifyContent:'center',borderRadius:'50%'}}>{React.createElement(Ic[k],{size:11})}</button>)}</div>}</div>
<div className="row" style={{gap:6,fontSize:10.8,color:'var(--ink-3)',padding:mine?'0 4px 0 0':'0 0 0 36px'}}>
{m.ch&&<><ChDot ch={m.ch} size={6}/><span>{CH[m.ch][0]}</span><span>·</span></>}<span className="mono">{m.t}</span>
{mine&&m.st&&<span className="row" style={{gap:4,color:m.st==='read'?'var(--violet)':'var(--ink-3)',marginLeft:2}}><Tick st={m.st}/>{m.st==='read'?'Read':m.st==='delivered'?'Delivered':'Sent'}</span>}</div></div>};

const Typing=()=>(<div className="row" style={{gap:8,alignItems:'flex-end'}}>
<div className="tile" style={{width:26,height:26,borderRadius:'50%',background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.spark size={13}/></div>
<div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:'20px 20px 20px 6px',padding:'12px 16px'}} className="row">
{[0,1,2].map(i=><span key={i} style={{width:6,height:6,borderRadius:'50%',background:'var(--ink-3)',marginRight:i<2?5:0,animation:`bl2 1s ${i*.15}s infinite`}}/>)}</div>
<style>{'@keyframes bl2{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}'}</style></div>);

export const Inbox2=()=>{
const[data,setData]=React.useState(IB.threads);
const[sel,setSel]=React.useState(1);
const[filter,setFilter]=React.useState('All');
const[panel,setPanel]=React.useState(true);
const[draft,setDraft]=React.useState('');
const[typing,setTyping]=React.useState(false);
const scroll=React.useRef(null);
const t=data.find(x=>x.id===sel);
const[ch,setCh]=React.useState(t.ch);
React.useEffect(()=>{setCh(t.ch);setDraft('')},[sel]);
React.useEffect(()=>{const el=scroll.current;if(el)el.scrollTop=el.scrollHeight},[data,typing,sel]);
const filters=[['All',data.length],['Unread',data.filter(x=>x.unread).length],['Paige drafts',data.filter(x=>x.msgs.some(m=>m.paige)).length],['At risk',data.filter(x=>x.state==='At risk'||x.state==='Watch').length]];
const list=data.filter(x=>filter==='Unread'?x.unread:filter==='Paige drafts'?x.msgs.some(m=>m.paige):filter==='At risk'?['At risk','Watch'].includes(x.state):true);
const send=body=>{if(!body.trim())return;const now=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}).toLowerCase();
const msg={me:true,body:body.trim(),t:now,st:'sent',ch};
setData(d=>d.map(x=>x.id===sel?{...x,msgs:[...x.msgs,msg],unread:0,t:'now'}:x));setDraft('');
setTimeout(()=>setData(d=>d.map(x=>x.id!==sel?x:{...x,msgs:x.msgs.map(m=>m===msg?{...m,st:'delivered'}:m)})),800);
setTimeout(()=>setData(d=>d.map(x=>x.id!==sel?x:{...x,msgs:x.msgs.map(m=>m===msg||m.st==='delivered'&&m.body===msg.body?{...m,st:'read'}:m)})),2000);
setTimeout(()=>setTyping(true),2600);setTimeout(()=>{setTyping(false);
setData(d=>d.map(x=>x.id!==sel?x:{...x,msgs:[...x.msgs,{paige:true,body:'Logged and filed under '+x.n+'. I set a follow-up for three days out and will draft the nudge if they go quiet.',t:now}]}))},4200)};

return <div className="inbox" style={{height:'100%',minHeight:0}}>
<div className="card tlist" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden',borderRadius:'var(--r-xl)'}}>
<div style={{padding:'14px 14px 10px',display:'grid',gap:11}}>
<div className="row" style={{justifyContent:'space-between'}}><h3 style={{fontSize:17,letterSpacing:'-.03em'}}>Conversations</h3>
<button className="btn btn-s" style={{width:30,height:30,padding:0,justifyContent:'center',borderRadius:'50%',background:'var(--gold-bright)',borderColor:'var(--gold-bright)',color:'#2A1C00'}}><Ic.plus size={15}/></button></div>
<div className="row" style={{gap:8,height:36,padding:'0 13px',borderRadius:99,background:'var(--surface-sunk)',color:'var(--ink-3)'}}><Ic.search size={15}/><span style={{fontSize:13}}>Search everything</span></div>
<div className="row" style={{gap:6,overflowX:'auto',paddingBottom:2}}>{filters.map(([f,n])=>{const on=filter===f;
return <button key={f} onClick={()=>setFilter(f)} className="row" style={{gap:6,flex:'none',height:29,padding:'0 12px',borderRadius:99,fontSize:12.4,fontWeight:on?600:450,
background:on?'var(--ink)':'var(--surface-sunk)',color:on?'var(--ink-inv)':'var(--ink-2)'}}>{f}
{n>0&&<span className="mono" style={{fontSize:10.5,fontWeight:700,opacity:on?.85:.6}}>{n}</span>}</button>})}</div></div>
<div style={{overflow:'auto',flex:1,padding:'0 8px 10px'}}>
{list.map(x=>{const on=x.id===sel;const last=[...x.msgs].reverse().find(m=>!m.d);
return <button key={x.id} onClick={()=>{setSel(x.id);setData(d=>d.map(y=>y.id===x.id?{...y,unread:0}:y))}} className="row" style={{width:'100%',textAlign:'left',alignItems:'flex-start',gap:11,
padding:'11px 12px',borderRadius:16,marginBottom:3,background:on?'var(--surface-sunk)':'transparent',transition:'.15s'}}>
<span style={{position:'relative',flex:'none'}}><Avatar name={x.n} size={38}/>
<span style={{position:'absolute',right:-2,bottom:-2,width:14,height:14,borderRadius:'50%',background:'var(--surface)',display:'grid',placeItems:'center'}}>
<ChDot ch={x.ch} size={8}/></span>
{x.online&&<span style={{position:'absolute',left:-1,top:-1,width:10,height:10,borderRadius:'50%',background:'var(--ok)',border:'2px solid var(--surface)'}}/>}</span>
<span className="grow" style={{minWidth:0}}>
<span className="row" style={{justifyContent:'space-between',gap:8}}><span className="trunc" style={{fontWeight:600,fontSize:13.6}}>{x.n}</span>
<span className="row" style={{gap:6,flex:'none'}}>{x.pin&&<span style={{color:'var(--gold)',display:'flex'}}><Ic.bolt size={11}/></span>}<span className="sub" style={{fontSize:11.5}}>{x.t}</span></span></span>
<span className="sub trunc" style={{display:'block',fontSize:11.8}}>{x.role}</span>
<span className="row" style={{gap:7,marginTop:3}}>
<span className="trunc grow" style={{fontSize:12.5,color:x.unread?'var(--ink)':'var(--ink-3)',fontWeight:x.unread?600:400}}>
{last?.paige?'Paige: '+last.body.slice(0,42)+'…':last?.me?'You: '+last.body.slice(0,42)+'…':last?.body.slice(0,48)+'…'}</span>
{x.unread>0&&<span className="mono" style={{flex:'none',minWidth:19,height:19,borderRadius:99,background:'var(--gold-bright)',color:'#2A1C00',fontSize:11,fontWeight:700,display:'grid',placeItems:'center',padding:'0 5px'}}>{x.unread}</span>}</span></span></button>})}</div></div>

<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden',borderRadius:'var(--r-xl)'}}>
<div className="row" style={{padding:'12px 16px',borderBottom:'1px solid var(--line-soft)',gap:12,background:'var(--surface)'}}>
<span style={{position:'relative',flex:'none'}}><Avatar name={t.n} size={38}/>
{t.online&&<span style={{position:'absolute',right:-1,bottom:-1,width:11,height:11,borderRadius:'50%',background:'var(--ok)',border:'2px solid var(--surface)'}}/>}</span>
<div className="grow" style={{minWidth:120}}><div className="row" style={{gap:8}}><span style={{fontWeight:600,fontSize:14.5,minWidth:0}} className="trunc">{t.n}</span>
<span className={'pill hide-1180 '+(t.state==='At risk'?'pill-bad':t.state==='Watch'?'pill-warn':'pill-ok')}>{t.state}</span></div>
<div className="row trunc" style={{gap:6,marginTop:1,whiteSpace:'nowrap'}}><span className="sub" style={{color:t.online?'var(--ok)':'var(--ink-3)'}}>{t.online?'Active now':t.pres}</span>
<span className="sub trunc">· {t.tenure}</span></div></div>
<div className="row" style={{gap:6}}>{['pulse','clock','bell','dots'].map((k,i)=><button key={k} className={'btn btn-s'+(i<2?'':' hide-1180')} style={{width:32,height:32,padding:0,justifyContent:'center',borderRadius:'50%'}}>{React.createElement(Ic[k],{size:14})}</button>)}
<button className="btn btn-s" onClick={()=>setPanel(!panel)} style={{width:32,height:32,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.users size={14}/></button></div></div>

<div ref={scroll} style={{flex:1,overflow:'auto',padding:'18px 18px 10px',display:'flex',flexDirection:'column',gap:12,background:'var(--canvas)'}}>
{t.msgs.map((m,i)=><Bubble2 key={i} m={m} name={t.n}/>)}{typing&&<Typing/>}</div>

<div style={{padding:'10px 14px 14px',borderTop:'1px solid var(--line-soft)',background:'var(--surface)',display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:9}}>
<div className="row" style={{gap:7,overflowX:'auto',paddingBottom:1}}>
<span className="mono" style={{fontSize:10,letterSpacing:'.14em',color:'var(--ink-3)',flex:'none',paddingRight:2}}>QUICK</span>
{t.smart.map(s=><button key={s} onClick={()=>setDraft(s)} className="row" style={{flex:'none',height:28,padding:'0 12px',borderRadius:99,border:'1px solid var(--violet-line)',
background:'var(--violet-tint)',color:'var(--violet)',fontSize:12.3,fontWeight:500,gap:6}}><Ic.spark size={11}/>{s}</button>)}</div>
<div className="row" style={{gap:6,overflowX:'auto'}}>{Object.keys(CH).map(k=>{const on=ch===k;
return <button key={k} onClick={()=>setCh(k)} className="row" style={{gap:7,flex:'none',height:28,padding:'0 11px',borderRadius:99,fontSize:12.2,fontWeight:on?600:450,
background:on?'var(--surface-sunk)':'transparent',border:'1px solid '+(on?'var(--line)':'transparent'),color:on?'var(--ink)':'var(--ink-3)'}}><ChDot ch={k} size={7}/>{CH[k][0]}</button>})}
<span className="sub" style={{marginLeft:'auto',flex:'none',fontSize:11.5}}>{ch==='email'?'mogul-maker-academy@mail.paigeagent.ai':t.phone}</span></div>
{ch==='email'&&<input placeholder="Subject" style={{height:36,border:'1px solid var(--line)',borderRadius:12,padding:'0 13px',background:'var(--surface-2)',color:'var(--ink)',fontFamily:'inherit',fontSize:13.2,outline:'none'}}/>}
<div className="row" style={{gap:8,minWidth:0,alignItems:'flex-end',border:'1px solid var(--line)',borderRadius:22,padding:'7px 7px 7px 14px',background:'var(--surface-2)'}}>
<button className="row" style={{color:'var(--ink-3)',flex:'none',paddingBottom:6}}><Ic.plus size={17}/></button>
<textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(draft)}}}
placeholder={'Message '+t.n.split(' ')[0]+' on '+CH[ch][0]+'…'} rows={1}
style={{flex:1,minWidth:0,minHeight:26,maxHeight:110,resize:'none',border:0,outline:'none',background:'none',color:'var(--ink)',fontFamily:'inherit',fontSize:13.6,lineHeight:1.5,padding:'5px 0'}}/>
<button className="btn btn-s" title="Draft with Paige" style={{flex:'none',borderRadius:99,background:'var(--violet-tint)',borderColor:'var(--violet-line)',color:'var(--violet)'}}><Ic.spark size={13}/><span className="lbl-1180">Draft with Paige</span></button>
<button className="row hide-1180" style={{color:'var(--ink-3)',flex:'none',paddingBottom:6}}><Ic.pulse size={17}/></button>
<button onClick={()=>send(draft)} style={{flex:'none',width:36,height:36,borderRadius:'50%',display:'grid',placeItems:'center',
background:draft.trim()?'var(--gold-bright)':'var(--surface-sunk)',color:draft.trim()?'#2A1C00':'var(--ink-3)',transition:'.15s'}}><Ic.send size={16}/></button></div>
<div className="row" style={{gap:14,fontSize:11.3,color:'var(--ink-3)'}}><span>Enter to send · Shift+Enter for a new line</span>
<span className="row" style={{gap:5,marginLeft:'auto'}}><ChDot ch={ch} size={6}/>Sending as {CH[ch][0]}</span></div></div></div>

{panel&&<div className="card ctc" style={{overflow:'auto',minHeight:0,borderRadius:'var(--r-xl)'}}>
<div className="hd"><h3>Contact</h3><button className="btn btn-s" onClick={()=>setPanel(false)} style={{width:28,height:28,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.x size={13}/></button></div>
<div style={{padding:'18px',display:'grid',gap:16,justifyItems:'center',textAlign:'center'}}>
<span style={{position:'relative'}}><Avatar name={t.n} size={62}/>
{t.online&&<span style={{position:'absolute',right:2,bottom:2,width:14,height:14,borderRadius:'50%',background:'var(--ok)',border:'2.5px solid var(--surface)'}}/>}</span>
<div><div style={{fontWeight:600,fontSize:15.5,letterSpacing:'-.02em'}}>{t.n}</div><div className="sub">{t.role}</div></div>
<div className="row" style={{gap:8}}>{[['pulse','Call'],['mail','Email'],['doc','Files'],['bell','Mute']].map(([k,l])=>
<div key={k} style={{display:'grid',justifyItems:'center',gap:5}}>
<button className="btn btn-s" style={{width:38,height:38,padding:0,justifyContent:'center',borderRadius:'50%'}}>{React.createElement(Ic[k],{size:15})}</button>
<span className="sub" style={{fontSize:10.8}}>{l}</span></div>)}</div></div>
<div style={{padding:'0 18px 18px',display:'grid',gap:14}}>
<div style={{padding:'12px 13px',background:'var(--violet-tint)',border:'1px solid var(--violet-line)',borderRadius:'var(--r-m)',textAlign:'left'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.5,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase'}}><Ic.spark size={11}/>Paige on this thread</div>
<div style={{fontSize:12.7,color:'var(--ink-2)',marginTop:6,lineHeight:1.55}}>{t.id===1?'Two open questions in her last message. Sentiment warm. She replies fastest before 10am.':
t.id===2?'Renewal window opens in three weeks. Lead with numbers, not a reminder.':t.id===3?'Second reschedule in a month and hours are running over budget. Worth a scope conversation.':
t.id===5?'Nineteen days quiet. Portal logins stopped the week the scope changed.':'Warm but dormant. A short, useful touch beats a check-in.'}</div></div>
{[['Reach them',[['mail',t.email],['pulse',t.phone]]],['Channels',null]].map(([k,rows],i)=>
<div key={i}><div className="eyebrow" style={{textAlign:'left'}}>{k}</div>
{rows?<div style={{display:'grid',gap:8,marginTop:7}}>{rows.map(([ic,v],j)=>
<div key={j} className="row" style={{gap:9,fontSize:12.8}}>{React.createElement(Ic[ic],{size:14,style:{color:'var(--ink-3)'}})}<span className="trunc">{v}</span></div>)}</div>
:<div className="row" style={{gap:6,marginTop:7,flexWrap:'wrap'}}>{Object.keys(CH).map(c=><span key={c} className="pill pill-n"><ChDot ch={c} size={6}/>{CH[c][0]}</span>)}</div>}</div>)}
<div><div className="eyebrow" style={{textAlign:'left'}}>Tags</div><div className="row" style={{gap:7,marginTop:7,flexWrap:'wrap'}}>
<span className="pill pill-n">{t.state}</span><span className="pill pill-n">{t.tenure}</span>
<button className="pill pill-n" style={{cursor:'pointer',borderStyle:'dashed'}}><Ic.plus size={11}/>Add</button></div></div>
<div className="seg" style={{width:'100%'}}>{['Details','DND','Actions'].map((x,i)=><button key={x} aria-pressed={i===0} style={{flex:1}}>{x}</button>)}</div></div></div>}</div>};
