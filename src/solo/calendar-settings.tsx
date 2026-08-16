// @ts-nocheck
import React from "react";
import { Ic } from "./_shared";
import { Sw, CfgRow, CfgCard, ConnCard } from "./calendar-cfg";
import { TeamAssignPanel } from "./calendar-team";
import { WebinarDefaults, BridgePanel } from "./calendar-webinar";
import { TIER, TierDot } from "./automations";

export const SET={
cals:[{n:'Client work',c:'var(--violet)',t:'Primary',vis:'Full detail',write:true,items:28},
 {n:'Compliance & filings',c:'var(--bad)',t:'From Trust Compass',vis:'Full detail',write:false,items:5},
 {n:'Automation runs',c:'var(--gold)',t:'From Automations',vis:'Busy only',write:false,items:6},
 {n:'Personal',c:'#3F7A4B',t:'Private',vis:'Busy only',write:false,items:4}],
durs:['15 min','30 min','45 min','60 min','90 min'],
rem:[{id:1,off:24,u:'hr',w:'before',ch:'Email',who:'Client',on:true,t:'Reminder with the intake answers attached'},
 {id:2,off:1,u:'hr',w:'before',ch:'Email',who:'Client',on:true,t:'Short reminder with the join link'},
 {id:3,off:15,u:'min',w:'before',ch:'SMS',who:'Client',on:true,t:'Last nudge — the one that stops no-shows'},
 {id:4,off:5,u:'min',w:'before',ch:'Chat',who:'You',on:true,t:'Your prep line: who they are, what they asked, what is open'},
 {id:5,off:15,u:'min',w:'after',ch:'Email',who:'Client',on:true,t:'No-show check — sends the reschedule link on its own'},
 {id:6,off:30,u:'min',w:'after',ch:'Chat',who:'You',on:true,t:'What you agreed and who owes what, drafted from the call'},
 {id:7,off:3,u:'day',w:'after',ch:'Email',who:'Client',on:false,t:'Review request'}],
notif:[['New booking','Chat',true],['Cancellation','Chat and email',true],['Reschedule','Chat',true],
 ['No-show detected','Chat',true],['Payment collected','Email',false],['Daily agenda at 6:30am','Chat',true]]};

export const SetSect=({t,d,children})=>(<div style={{marginBottom:18}}>
<h3 style={{fontSize:14}}>{t}</h3>
{d&&<div className="sub" style={{fontSize:12,marginTop:3,lineHeight:1.5}}>{d}</div>}
{children}</div>);

export const CalendarSettings=()=>{
const[s,setS]=React.useState('cals');
const[cals,setCals]=React.useState(SET.cals);const[nw,setNw]=React.useState(false);const[nm,setNm]=React.useState('');
const[nc,setNc]=React.useState('#2E7D8F');
const[durs,setDurs]=React.useState(SET.durs);
const[rem,setRem]=React.useState(SET.rem);const[ed,setEd]=React.useState(null);
const[week,setWeek]=React.useState('Sun');const[inc,setInc]=React.useState('15 min');
const secs=[['cals','Calendars',()=><Ic.cal size={13}/>],['hours','Hours & durations',()=><Ic.clock size={13}/>],
 ['rem','Reminders & follow-ups',()=><Ic.bell size={13}/>],['pages','Booking pages',()=><Ic.send size={13}/>],
 ['team','Team & assignment',()=><Ic.users size={13}/>],['wb','Webinar defaults',()=><Ic.users size={13}/>],
 ['bridge','Automations bridge',()=><Ic.bolt size={13}/>],['pol','Policies',()=><Ic.shield size={13}/>],
 ['notif','Notifications',()=><Ic.mail size={13}/>],['auto','Autonomy',()=><Ic.spark size={13}/>]];
const upd=(id,k,v)=>setRem(r=>r.map(x=>x.id===id?{...x,[k]:v}:x));
const off=r=>r.off+' '+r.u+' '+r.w;
return <div className="cal-set">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none',padding:'12px 14px'}}><div><h3 style={{fontSize:13.6}}>Calendar settings</h3>
<div className="sub" style={{fontSize:11.4}}>Applies to every link</div></div></div>
<div className="pane" style={{flex:1,padding:'8px 8px',display:'grid',gap:2,alignContent:'start'}}>
{secs.map(([k,l,Icn])=>{const on=s===k;
return <button key={k} onClick={()=>setS(k)} className="row" style={{gap:9,padding:'8px 10px',borderRadius:9,textAlign:'left',
background:on?'var(--violet-tint)':'transparent',color:on?'var(--violet)':'var(--ink-2)',transition:'.15s'}}
onMouseEnter={e=>{if(!on)e.currentTarget.style.background='var(--surface-2)'}} onMouseLeave={e=>{if(!on)e.currentTarget.style.background='transparent'}}>
<span style={{display:'flex',flex:'none'}}>{Icn()}</span>
<span className="trunc" style={{fontSize:12.4,fontWeight:on?600:500}}>{l}</span></button>})}</div>
<div style={{flex:'none',padding:'11px 13px',borderTop:'1px solid var(--line)',background:'var(--surface-2)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={11}/>Note</div>
<div style={{fontSize:11.4,color:'var(--ink-2)',lineHeight:1.5,marginTop:6}}>Anything set here is a default. A single link can override it in its own drawer.</div></div></div>
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div style={{minWidth:0}}><h3>{secs.find(x=>x[0]===s)[1]}</h3>
<div className="sub trunc">{{cals:'The calendars this workspace keeps, and what she may write to',
hours:'How long you meet for, and how tightly the day packs',rem:'What goes out before and after every booking',
pages:'How the public page looks and reads',team:'Who on your team can host a call, join one, or book on your behalf',
wb:'Defaults for a one-to-many session, and the reminder ladder that carries a room',
bridge:'What the calendar publishes to Automations, and what automations may do back',
pol:'What a client may change, and what it costs them',
notif:'What reaches you, and where',auto:'What she may decide without asking'}[s]}</div></div>
<button className="btn btn-s btn-g"><Ic.check size={12}/>Save</button></div>
<div key={s} className="pane fade-in" style={{flex:1,padding:'15px 17px'}}>

{s==='cals'&&<>
<SetSect t="Your calendars" d="Four calendars, one of them writable. Everything on the grid comes from these.">
<div style={{marginTop:10,display:'grid',gap:8}}>
{cals.map((c,i)=><div key={c.n} style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="row" style={{gap:10}}>
<span style={{width:10,height:10,borderRadius:3,background:c.c,flex:'none',display:'block'}}/>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{display:'block',fontSize:12.8,fontWeight:600}}>{c.n}</span>
<span className="trunc" style={{display:'block',fontSize:11,color:'var(--ink-3)'}}>{c.t} · {c.items} items this month</span></span>
{c.write&&<span className="pill pill-v" style={{fontSize:10}}>She writes here</span>}
<Sw on c={c.c}/></div>
<div className="row" style={{gap:6,marginTop:9,flexWrap:'wrap'}}>
{['Full detail','Busy only','Hidden'].map(v=><button key={v} className="pill" style={{height:22,cursor:'pointer',fontSize:10.4,
background:c.vis===v?'var(--ink)':'var(--surface-sunk)',color:c.vis===v?'var(--ink-inv)':'var(--ink-3)'}}
onClick={()=>setCals(l=>l.map(x=>x.n===c.n?{...x,vis:v}:x))}>{v}</button>)}
<button className="pill" style={{height:22,cursor:'pointer',fontSize:10.4,marginLeft:'auto',
background:c.write?'var(--violet-tint)':'var(--surface-sunk)',color:c.write?'var(--violet)':'var(--ink-3)'}}
onClick={()=>setCals(l=>l.map(x=>({...x,write:x.n===c.n})))}>Write target</button></div></div>)}
{nw?<div className="card fade-in" style={{padding:'13px 14px',borderColor:'var(--violet-line)'}}>
<div className="eyebrow" style={{fontSize:9.4,color:'var(--violet)'}}>New calendar</div>
<div className="row" style={{gap:8,marginTop:9}}>
<span className="row grow" style={{gap:8,height:32,padding:'0 11px',border:'1px solid var(--line)',borderRadius:9,background:'var(--surface-2)',minWidth:0}}>
<input value={nm} onChange={e=>setNm(e.target.value)} placeholder="Name it — Marketing, Travel, Court dates"
style={{border:0,background:'none',outline:'none',fontSize:12.6,width:'100%',color:'var(--ink)'}}/></span></div>
<div className="row" style={{gap:6,marginTop:9}}>
{['#2E7D8F','#8A5A9E','var(--gold)','#3F7A4B','var(--violet)','var(--bad)'].map(c=>
<button key={c} onClick={()=>setNc(c)} style={{width:22,height:22,borderRadius:7,background:c,flex:'none',
boxShadow:nc===c?'0 0 0 2px var(--surface),0 0 0 4px '+c:'none'}}/>)}</div>
<div className="row" style={{gap:7,marginTop:12}}>
<button className="btn btn-s btn-p" onClick={()=>{if(nm.trim()){setCals(l=>[...l,{n:nm,c:nc,t:'Yours',vis:'Full detail',write:false,items:0}]);setNm('');setNw(false)}}}>
<Ic.check size={11}/>Create it</button>
<button className="btn btn-s" onClick={()=>setNw(false)}>Cancel</button></div></div>
:<button className="btn btn-s" onClick={()=>setNw(true)} style={{justifyContent:'center'}}><Ic.plus size={12}/>New calendar</button>}</div></SetSect>
<SetSect t="Connected calendars" d="Two are read for conflicts, one is written to. A slot is only offered when every connected calendar is clear.">
<div style={{marginTop:10}}><ConnCard/></div>
<button className="btn btn-s" style={{marginTop:9}}><Ic.plus size={12}/>Connect another</button></SetSect>
<CfgCard t="Conflict checking" d="What counts as busy when she looks for a slot.">
<CfgRow k="Tentative events" v="Count as busy" sw on/>
<CfgRow k="All-day events" v="Do not block the day" sw on={false}/>
<CfgRow k="Events you declined" v="Ignored" sw on/>
<CfgRow k="Personal calendar" v="Blocks time, never shows detail" sw on/></CfgCard></>}

{s==='hours'&&<>
<SetSect t="Durations you offer" d="Every booking link picks from this set. Add one and it appears everywhere.">
<div className="row" style={{gap:6,marginTop:10,flexWrap:'wrap'}}>
{durs.map(d=><span key={d} className="row" style={{gap:6,height:28,padding:'0 6px 0 11px',borderRadius:99,
border:'1px solid var(--violet-line)',background:'var(--violet-tint)',color:'var(--violet)',fontSize:12,fontWeight:600,flex:'none'}}>{d}
<button onClick={()=>setDurs(l=>l.filter(x=>x!==d))} style={{display:'flex',color:'var(--violet)',opacity:.6}}><Ic.x size={11}/></button></span>)}
{['20 min','120 min'].filter(d=>!durs.includes(d)).map(d=><button key={d} onClick={()=>setDurs(l=>[...l,d])}
className="row" style={{gap:5,height:28,padding:'0 11px',borderRadius:99,border:'1px dashed var(--line)',color:'var(--ink-3)',fontSize:12,flex:'none'}}>
<Ic.plus size={11}/>{d}</button>)}</div></SetSect>
<SetSect t="How the day packs">
<div style={{marginTop:10,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
<div style={{padding:'11px 13px'}}>
<div className="row" style={{gap:10}}><span className="eyebrow" style={{fontSize:9.4,width:136,flex:'none'}}>Start increments</span>
<div className="seg">{['15 min','30 min','60 min'].map(v=><button key={v} aria-pressed={inc===v} onClick={()=>setInc(v)}>{v}</button>)}</div></div>
<div style={{fontSize:11.4,color:'var(--ink-3)',lineHeight:1.45,marginTop:6,paddingLeft:146}}>Slots land on this grid. Fifteen fills a day tighter; thirty reads calmer on the page.</div></div>
<CfgRow k="Buffer before" v="None"/><CfgRow k="Buffer after" v="15 min · 30 after a deep-dive"/>
<CfgRow k="Minimum notice" v="4 hours for consults, 3 days for deep-dives"/>
<CfgRow k="Rolling window" v="60 days out" note="How far ahead anyone can reach. Short windows protect a calendar you cannot see three weeks into."/>
<CfgRow k="Daily cap" v="6 bookings, 4 hours of calls" sw on note="She stops offering slots once either number is hit, whatever the links say."/>
<CfgRow k="Back-to-back" v="Allowed only inside the same event type" sw on/></div></SetSect>
<SetSect t="Time and format">
<div style={{marginTop:10,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
<CfgRow k="Your timezone" v="America/New_York · Eastern"/>
<CfgRow k="Show client's timezone" v="Detected from their browser" sw on/>
<div style={{padding:'11px 13px',borderTop:'1px solid var(--line-soft)'}}>
<div className="row" style={{gap:10}}><span className="eyebrow" style={{fontSize:9.4,width:136,flex:'none'}}>Week starts</span>
<div className="seg">{['Sun','Mon'].map(v=><button key={v} aria-pressed={week===v} onClick={()=>setWeek(v)}>{v}</button>)}</div></div></div>
<CfgRow k="Time format" v="12 hour"/></div></SetSect></>}

{s==='rem'&&<>
<SetSect t="Before and after every booking" d="Seven touches on the timeline. Set the offset, who hears it and how — she writes the words in your voice.">
<div style={{marginTop:11,position:'relative',paddingLeft:20}}>
<span style={{position:'absolute',left:6,top:8,bottom:34,width:1,background:'var(--line)'}}/>
{rem.sort((a,b)=>(a.w==='before'?-1:1)-(b.w==='before'?-1:1)).map(r=>{const open=ed===r.id;
const c=r.w==='before'?'var(--violet)':'var(--gold)';
return <div key={r.id} style={{position:'relative',paddingBottom:9}}>
<span style={{position:'absolute',left:-18,top:14,width:9,height:9,borderRadius:'50%',background:r.on?c:'var(--line)',border:'2px solid var(--surface)'}}/>
<div style={{border:'1px solid '+(open?c:'var(--line)'),borderRadius:'var(--r-m)',overflow:'hidden',opacity:r.on?1:.55,transition:'.15s'}}>
<div className="row" style={{gap:10,padding:'10px 12px'}}>
<button onClick={()=>setEd(open?null:r.id)} className="row grow" style={{gap:10,minWidth:0,textAlign:'left'}}>
<span className="mono" style={{fontSize:11.4,fontWeight:600,color:c,width:98,flex:'none',whiteSpace:'nowrap'}}>{off(r)}</span>
<span className="grow trunc" style={{fontSize:12.2,color:'var(--ink-2)'}}>{r.t}</span></button>
<span className="pill pill-n cc-hide" style={{fontSize:10}}>{r.ch} · {r.who}</span>
<button onClick={()=>upd(r.id,'on',!r.on)} style={{display:'flex',flex:'none'}}><Sw on={r.on} c={c}/></button></div>
{open&&<div className="fade-in" style={{padding:'12px',borderTop:'1px solid var(--line-soft)',background:'var(--surface-2)',display:'grid',gap:10}}>
<div className="row" style={{gap:8,flexWrap:'wrap'}}>
<span className="eyebrow" style={{fontSize:9.4,width:52,flex:'none'}}>When</span>
<input type="number" value={r.off} onChange={e=>upd(r.id,'off',Math.max(0,+e.target.value||0))}
style={{width:56,height:28,border:'1px solid var(--line)',borderRadius:8,background:'var(--surface)',color:'var(--ink)',
fontFamily:'var(--mono)',fontSize:12.4,padding:'0 8px',outline:'none'}}/>
<div className="seg">{['min','hr','day'].map(u=><button key={u} aria-pressed={r.u===u} onClick={()=>upd(r.id,'u',u)}>{u}</button>)}</div>
<div className="seg">{['before','after'].map(w=><button key={w} aria-pressed={r.w===w} onClick={()=>upd(r.id,'w',w)}>{w}</button>)}</div></div>
<div className="row" style={{gap:8,flexWrap:'wrap'}}>
<span className="eyebrow" style={{fontSize:9.4,width:52,flex:'none'}}>How</span>
{['Email','SMS','Chat','Call'].map(ch=><button key={ch} onClick={()=>upd(r.id,'ch',ch)} className="pill" style={{height:24,cursor:'pointer',fontSize:11,
background:r.ch===ch?'var(--ink)':'var(--surface-sunk)',color:r.ch===ch?'var(--ink-inv)':'var(--ink-3)'}}>{ch}</button>)}</div>
<div className="row" style={{gap:8,flexWrap:'wrap'}}>
<span className="eyebrow" style={{fontSize:9.4,width:52,flex:'none'}}>Who</span>
{['Client','You','Both'].map(w=><button key={w} onClick={()=>upd(r.id,'who',w)} className="pill" style={{height:24,cursor:'pointer',fontSize:11,
background:r.who===w?'var(--ink)':'var(--surface-sunk)',color:r.who===w?'var(--ink-inv)':'var(--ink-3)'}}>{w}</button>)}</div>
<div className="row" style={{gap:8,flexWrap:'wrap',paddingTop:2}}>
<button className="btn btn-s"><Ic.spark size={11}/>Let her write the copy</button>
<button className="btn btn-s" onClick={()=>setEd(null)}>Done</button>
<button className="btn btn-s" onClick={()=>{setRem(l=>l.filter(x=>x.id!==r.id));setEd(null)}} style={{color:'var(--bad)',marginLeft:'auto'}}>
<Ic.x size={11}/>Remove</button></div></div>}</div></div>})}
<div style={{position:'relative'}}>
<span style={{position:'absolute',left:-18,top:12,width:9,height:9,borderRadius:'50%',border:'1.5px dashed var(--line)'}}/>
<button className="btn btn-s" onClick={()=>{const id=Date.now();setRem(l=>[...l,{id,off:30,u:'min',w:'after',ch:'Chat',who:'You',on:true,t:'New follow-up'}]);setEd(id)}}>
<Ic.plus size={12}/>Add a follow-up</button></div></div></SetSect>
<CfgCard t="Rules around them" d="So a short call does not get four messages.">
<CfgRow k="Skip reminders under" v="A 15-minute call gets one, not three" sw on/>
<CfgRow k="Quiet hours" v="Nothing sends 9pm to 7am client time" sw on/>
<CfgRow k="SMS consent" v="Asked once at booking, remembered after" sw on/>
<CfgRow k="Stop on reply" v="If they answer, she stops the sequence and tells you" sw on/></CfgCard></>}

{s==='pages'&&<>
<SetSect t="How every page looks" d="One set of branding across all six links.">
<div style={{marginTop:10,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
<CfgRow k="Logo" v="Paige mark · gold"/><CfgRow k="Accent" v="Violet · from your brand"/>
<CfgRow k="Banner image" v="None — worth adding one"/>
<CfgRow k="Domain" v="book.paige.ai" note="A custom domain needs one DNS record. She will write it for you."/>
<CfgRow k="Paige badge" v="Shown at the foot of the page" sw on/>
<CfgRow k="Your photo" v="Shown beside the event name" sw on/></div>
<button className="btn btn-s" style={{marginTop:9}}><Ic.search size={12}/>Preview a page</button></SetSect>
<CfgCard t="What the page collects" d="Defaults for a new link. Each one can ask more.">
<CfgRow k="Name and email" v="Always" sw on/><CfgRow k="Phone" v="Required for phone calls only" sw on/>
<CfgRow k="Company" v="Optional" sw on/><CfgRow k="Add guests" v="Up to 3" sw on/>
<CfgRow k="Notes field" v="One line, and she reads it" sw on/></CfgCard>
<CfgCard t="After they book">
<CfgRow k="Calendar invite" v="Sent with the join link" sw on/>
<CfgRow k="Redirect" v="Back to your site, with the booking id"/>
<CfgRow k="Webhook" v="Fires into your action bus" sw on/></CfgCard></>}

{s==='team'&&<TeamAssignPanel/>}
{s==='wb'&&<WebinarDefaults/>}
{s==='bridge'&&<BridgePanel/>}
{s==='pol'&&<>
<SetSect t="What a client may change" d="Defaults across every link. A paid link can be stricter.">
<div style={{marginTop:10,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
<CfgRow k="Reschedule until" v="4 hours before" sw on/>
<CfgRow k="Reschedules allowed" v="Twice, then it comes to you"/>
<CfgRow k="Cancel until" v="Any time — fee applies inside 24 hours" sw on/>
<CfgRow k="Reason required" v="One line, and she reads it" sw on/>
<CfgRow k="Late-cancel fee" v="$100 on paid links only"/>
<CfgRow k="No-show" v="Reschedule link 15 minutes in, then a note to you" sw on/></div></SetSect>
<CfgCard t="Your side" d="What she may do to a booking without asking.">
<CfgRow k="Move a call for a filing" v="Offer two alternatives, never move silently" sw on/>
<CfgRow k="Fill a cancelled slot" v="Reopen it to the link that lost it" sw on/>
<CfgRow k="Protect the deep-work block" v="Never offered, even when empty" sw on/></CfgCard></>}

{s==='notif'&&<>
<SetSect t="What reaches you" d="Six events. Chat is her default because it is where you answer.">
<div style={{marginTop:10,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{SET.notif.map(([n,ch,on],i)=><div key={n} className="row" style={{gap:10,padding:'11px 13px',borderTop:i?'1px solid var(--line-soft)':'0',opacity:on?1:.55}}>
<span className="grow trunc" style={{fontSize:12.4,fontWeight:500}}>{n}</span>
<span className="pill pill-n" style={{fontSize:10}}>{ch}</span><Sw on={on} c="var(--violet)"/></div>)}</div></SetSect>
<CfgCard t="How she batches them" d="So a busy morning is one message, not nine.">
<CfgRow k="Bundle bookings" v="One digest an hour, unless it is urgent" sw on/>
<CfgRow k="Urgent means" v="A cancellation inside 24 hours, or a conflict with a filing"/>
<CfgRow k="Daily agenda" v="6:30am, with the Monday brief on Mondays" sw on/></CfgCard></>}

{s==='auto'&&<>
<SetSect t="What she may decide alone" d="Same three tiers as everywhere else. A link can be quieter than this, never louder.">
<div style={{marginTop:11,display:'grid',gap:9}}>
{[['Accept a clean request','auto','Nothing in the way, inside your hours, under your caps.'],
 ['Accept a request that collides','off','A filing, a protected block or a cap. This always comes to you.'],
 ['Reschedule at the client\'s request','auto','They asked, the new slot is clean, she moves it and tells you.'],
 ['Move your call for a filing','confirm','She proposes, you approve, then the client hears about it.'],
 ['Charge a late-cancel fee','confirm','Money leaving a client account in your name waits for your read.'],
 ['Write the follow-up note','auto','Drafted from the call and sent in your voice.']].map(([n,t,d])=>
<div key={n} style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="row" style={{gap:10,flexWrap:'wrap'}}>
<span className="grow" style={{minWidth:0,fontSize:12.6,fontWeight:600}}>{n}</span>
<div className="row" style={{gap:5,flex:'none'}}>{['off','confirm','auto'].map(k=><button key={k} className="row" style={{gap:5,height:24,padding:'0 8px',borderRadius:99,
border:'1px solid '+(k===t?TIER[k][0]:'var(--line)'),background:k===t?TIER[k][0]+'14':'transparent',
color:k===t?TIER[k][0]:'var(--ink-3)',fontSize:10.8,fontWeight:600}}><TierDot tier={k} size={6}/>{TIER[k][1]}</button>)}</div></div>
<div style={{fontSize:11.6,color:'var(--ink-3)',lineHeight:1.5,marginTop:7}}>{d}</div></div>)}</div></SetSect>
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige's read</div>
<div style={{fontSize:12.3,color:'var(--ink-2)',lineHeight:1.55,marginTop:7}}>Clamped by Operations autonomy in Trust Compass, same as an automation. Twenty-seven of thirty bookings last month were clean enough that nothing needed you — the three that did were the ones sitting under filings.</div></div></>}
</div></div></div>};
