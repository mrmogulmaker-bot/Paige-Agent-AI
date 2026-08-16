// @ts-nocheck
import React from "react";
import { Ic, Meter, SlideOut } from "./_shared";

export const TIER={auto:['var(--ok)','Auto','🟢'],confirm:['var(--warn)','Confirm','🟡'],off:['var(--ink-3)','Off','🔴']};
export const ENG={workflow:['Workflow','var(--violet)'],skill:['Skill','#2E7D8F'],bus:['Action bus','var(--gold)'],agent:['Sub-agent','#8A5A9E'],stage:['Stage event','#3F7A4B']};
export const AU={
kpi:[{k:'Active automations',v:'9',s:'Of eleven built · three of them from the calendar',tone:'ok'},
 {k:'Runs this week',v:'218',s:'Across five execution engines',tone:'ok'},
 {k:'Success rate',v:'94%',s:'Up from 88% last week',tone:'ok'},
 {k:'Needs attention',v:'3',s:'One broken · one noisy · one never fired',tone:'bad'}],
rules:[
 {n:'Dunning · Two-fail retry with escalation',dept:'Finance',c:'#2E7D8F',tier:'confirm',status:'Live',eng:'bus',
  trig:'When a client\'s card fails twice, then wait 24 hours',
  act:'Send the retry sequence, and flag Jordan if a third failure lands',
  last:'2 hrs ago',ok:true,runs:14,rate:'93%',by:'Paige-drafted',mod:'Aug 2',
  needs:['Card processor webhook','Retry sequence (3 messages)'],feeds:['Finance queue','Owner Ops escalation'],
  note:'Her read: thirteen of fourteen runs cleared on the second message. This one is ready to promote to auto.'},
 {n:'Onboarding · New client welcome kit',dept:'Client Success',c:'var(--violet)',tier:'auto',status:'Live',eng:'skill',
  trig:'When a signed agreement lands in the vault',
  act:'Send the five-email kickoff sequence and open the onboarding checklist',
  last:'yesterday',ok:true,runs:9,rate:'100%',by:'You',mod:'Jul 18',
  needs:['Vault signature event','Kickoff sequence'],feeds:['Client Success queue'],
  note:'Nine clean runs since July. Nothing has needed your hand.'},
 {n:'Monday brief · Weekly owner digest',dept:'Owner Ops',c:'var(--gold)',tier:'auto',status:'Live',eng:'skill',
  trig:'Every Monday at 6:30am',
  act:'Assemble pipeline, cash and queue into one brief and put it on your desk',
  last:'3 days ago',ok:true,runs:11,rate:'100%',by:'You',mod:'Jun 9',
  needs:['Analytics rollup','Pipeline snapshot'],feeds:['Command Center'],
  note:'You open it within nine minutes on average. Cheapest automation you run.'},
 {n:'Competitor watch · Daily price scan',dept:'Marketing',c:'#8A5A9E',tier:'auto',status:'Live',eng:'agent',
  trig:'Every morning at 7am, for five tracked competitors',
  act:'Scan public pricing and flag any change over 5%',
  last:'6 hrs ago',ok:true,runs:63,rate:'97%',by:'Paige-drafted',mod:'Aug 11',
  needs:['Competitor list (5)','Research sub-agent'],feeds:['Marketing queue','Growth signals'],
  note:'Sixty-three runs this week — it is firing per competitor instead of per scan. One edit collapses it to five.'},
 {n:'Scheduling · Thursday conflict resolver',dept:'Operations',c:'#3F7A4B',tier:'auto',status:'Live',eng:'bus',
  trig:'When two calls overlap inside a protected block',
  act:'Move the lower-value call and notify both sides in your voice',
  last:'4 hrs ago',ok:true,runs:22,rate:'95%',by:'Paige-drafted',mod:'Aug 6',
  needs:['Calendar write scope','Protected blocks'],feeds:['Operations queue'],
  note:'Twenty-two moves this week, one bounce. The bounce was a client who replied before she sent.'},
 {n:'Retainer renewal · 45-day nudge',dept:'Owner Ops',c:'var(--gold)',tier:'confirm',status:'Live',eng:'stage',
  trig:'When a retainer is 45 days from its end date',
  act:'Draft the renewal note and hold it for your read',
  last:'31 days ago',ok:false,runs:2,rate:'100%',by:'You',mod:'Mar 22',
  needs:['Deal stage: Renewal window (retired)'],feeds:['Owner Ops queue'],
  note:'This has not fired in 31 days because the stage it listens for was retired in April. Point it at the contract end date instead.'},
 {n:'Sync repair · Token expiry watch',dept:'Systems',c:'var(--bad)',tier:'auto',status:'Broken',eng:'workflow',
  trig:'When any integration token is 72 hours from expiry',
  act:'Refresh silently, and open a Systems item if the refresh fails',
  last:'2 days ago',ok:false,runs:7,rate:'71%',by:'Paige-drafted',mod:'Aug 13',
  needs:['Webhook endpoint (missing)','Credential vault write'],feeds:['Systems queue','Integrations health'],
  note:'The condition points at a webhook that was removed with the old HubSpot app. One edit and it runs again.'},
 {n:'Proposal follow-up · Three-touch chase',dept:'Owner Ops',c:'var(--gold)',tier:'off',status:'Draft',eng:'bus',
  trig:'When a proposal has been open 3 days with no reply',
  act:'Send touch one, then two more at 4-day gaps unless they reply',
  last:'Never',ok:null,runs:0,rate:'—',by:'Paige-drafted',mod:'Aug 14',
  needs:['Proposal open event','Follow-up copy — awaiting your read'],feeds:['—'],
  note:'Drafted Thursday and never turned on. The copy is the only thing left to approve.'},
 {n:'Webinar · Registration ladder',dept:'Calendar',c:'#2E7D8F',tier:'auto',status:'Live',eng:'stage',
  trig:'When someone registers for a webinar',
  act:'Confirm the seat, add the invite, and walk them down the five-touch reminder ladder',
  last:'20 min ago',ok:true,runs:64,rate:'100%',by:'Paige-drafted',mod:'Aug 14',
  needs:['Registration event (Calendar)','Reminder ladder (5 messages)'],feeds:['Growth signals','Client Success queue'],
  note:'Sixty-four clean runs in nine days. This is the rule that carried June to a 57% show rate on a bigger room.'},
 {n:'Webinar · Replay to no-shows',dept:'Calendar',c:'#2E7D8F',tier:'auto',status:'Live',eng:'stage',
  trig:'When a webinar ends',
  act:'Send the replay to whoever did not attend, and the notes to whoever did',
  last:'Jun 18',ok:true,runs:2,rate:'100%',by:'Paige-drafted',mod:'Jun 12',
  needs:['Webinar ended event (Calendar)','Recording in the vault'],feeds:['Marketing queue'],
  note:'Fairgrove watched the June replay and booked a consult off it. Sending it to attendees too is how a replay stops feeling personal.'},
 {n:'Booking · Filing guard',dept:'Calendar',c:'#2E7D8F',tier:'confirm',status:'Live',eng:'bus',
  trig:'When a booking lands the day before a hard filing',
  act:'Offer two other slots inside the same week and put the collision on your desk',
  last:'2 days ago',ok:true,runs:4,rate:'100%',by:'Paige-drafted',mod:'Aug 12',
  needs:['Booking made event (Calendar)','Trust Compass obligation dates'],feeds:['Operations queue','Calendar'],
  note:'Aug 18 is the one it missed, because the guard was switched on two days after that booking landed.'}],
runs:[
 {n:'Webinar · Registration ladder',ev:'Registered · Delia Marsh, Marsh & Co.',eng:'stage',dept:'Calendar',tier:'auto',st:'Auto-fired',t:'20 min ago',dur:'1.8s',
  out:'Seat confirmed, invite sent, reminder ladder scheduled from one week out down to ten minutes.'},
 {n:'Booking · Filing guard',ev:'Consult requested the day before a filing',eng:'bus',dept:'Calendar',tier:'confirm',st:'Awaiting approval',t:'2 days ago',dur:'—',
  out:'Two alternative slots drafted inside the same week. Held for your read because moving a client is your call.'},
 {n:'Competitor watch · Daily price scan',ev:'Morning scan · Linley Coaching',eng:'agent',dept:'Marketing',tier:'auto',st:'Success',t:'6 hrs ago',dur:'14.2s',
  out:'Mid-tier moved $900 → $750. Flagged to Marketing queue and Growth signals.'},
 {n:'Dunning · Two-fail retry with escalation',ev:'Second card failure · Ridgeline Co.',eng:'bus',dept:'Finance',tier:'confirm',st:'Awaiting approval',t:'2 hrs ago',dur:'—',
  out:'Retry message drafted and held. Confirm tier means it waits for your read before sending.'},
 {n:'Scheduling · Thursday conflict resolver',ev:'Overlap in protected block',eng:'bus',dept:'Operations',tier:'auto',st:'Auto-fired',t:'4 hrs ago',dur:'3.1s',
  out:'Moved the Bellweather check-in to Friday 10am. Both sides notified in your voice.'},
 {n:'Sync repair · Token expiry watch',ev:'HubSpot token 68h from expiry',eng:'workflow',dept:'Systems',tier:'auto',st:'Failed',t:'8 hrs ago',dur:'0.4s',
  out:'Condition referenced webhook wh_hs_legacy, which no longer resolves.',err:'trigger_source_missing: wh_hs_legacy'},
 {n:'Competitor watch · Daily price scan',ev:'Morning scan · Vance Group',eng:'agent',dept:'Marketing',tier:'auto',st:'Success',t:'yesterday',dur:'11.8s',
  out:'No change. Fourth run of the same scan today — this is the loop worth fixing.'},
 {n:'Onboarding · New client welcome kit',ev:'Agreement signed · Cairn Advisory',eng:'skill',dept:'Client Success',tier:'auto',st:'Auto-fired',t:'yesterday',dur:'6.9s',
  out:'Five-email sequence queued over fourteen days. Checklist opened with four items on you.'},
 {n:'Dunning · Two-fail retry with escalation',ev:'Second card failure · Mercer Studio',eng:'bus',dept:'Finance',tier:'confirm',st:'Approved',t:'yesterday',dur:'2.2s',
  out:'You approved at 4:41pm. Card cleared on the retry ninety minutes later.'},
 {n:'Monday brief · Weekly owner digest',ev:'Scheduled · Monday 6:30am',eng:'skill',dept:'Owner Ops',tier:'auto',st:'Success',t:'3 days ago',dur:'28.4s',
  out:'Brief assembled from eleven sources. You opened it at 6:38am.'},
 {n:'Scheduling · Thursday conflict resolver',ev:'Overlap in protected block',eng:'bus',dept:'Operations',tier:'auto',st:'Failed',t:'3 days ago',dur:'1.9s',
  out:'Client replied to the original invite mid-move, so the reschedule was abandoned.',err:'stale_state: invite answered during run'},
 {n:'Sync repair · Token expiry watch',ev:'Stripe token 71h from expiry',eng:'workflow',dept:'Systems',tier:'auto',st:'Success',t:'4 days ago',dur:'1.2s',
  out:'Refreshed silently. Last clean run before the webhook was removed.'}],
health:[
 {t:'Sync repair is broken on a retired webhook',b:'It points at wh_hs_legacy, removed with the old HubSpot app. Seven runs, five failures. One edit fixes it.',
  act:'Repoint the trigger',tone:'bad'},
 {t:'Competitor watch is firing per competitor, not per scan',b:'Sixty-three runs this week where five would do. No harm done, but it is noise in your run history and your morning queue.',
  act:'Collapse to one scan',tone:'warn'},
 {t:'Retainer renewal has not fired in 31 days',b:'The deal stage it listens for was retired in April. Contract end date is the trigger you actually want.',
  act:'Swap the trigger',tone:'warn'},
 {t:'Dunning keeps clearing on confirm',b:'Thirteen of fourteen runs approved with no edits. Thirty days of that is her bar for promoting a rule to auto.',
  act:'Promote to auto',tone:'ok'}],
pend:'Three of seven substrates are not built yet — trigger registry, automation registry, unified run history. Fixture data below runs through the real interface.'};

export const TierDot=({tier,size=7})=>{const[c]=TIER[tier];
return <span style={{width:size,height:size,borderRadius:'50%',background:c,flex:'none',boxShadow:'0 0 0 3px '+c+'22'}}/>};

export const EngBadge=({eng})=>{const[l,c]=ENG[eng];
return <span className="pill" style={{fontSize:10.2,background:c+'18',color:c}}>{l}</span>};

export const StPill=({st}) =>{const m={Success:'pill-ok','Auto-fired':'pill-v',Approved:'pill-ok',Failed:'pill-bad','Awaiting approval':'pill-warn'};
return <span className={'pill '+m[st]} style={{fontSize:10.4,transition:'background .3s,color .3s'}}>{st}</span>};

export const PendBanner=({text})=>(<div className="row" style={{gap:8,padding:'0 12px',height:30,border:'1px solid var(--gold-line)',
background:'var(--gold-tint)',borderRadius:'var(--r-s)',minWidth:0}}>
<span style={{color:'var(--gold)',display:'flex',flex:'none'}}><Ic.bolt size={13}/></span>
<span className="trunc" style={{fontSize:11.6,color:'var(--ink-2)'}}><span style={{fontWeight:600,color:'var(--ink)'}}>Pending schema. </span>{text}</span></div>);

export const AutomationCard=({a,onOpen})=>{const[c,lbl]=TIER[a.tier];
const stTone=a.status==='Broken'?'pill-bad':a.status==='Draft'?'pill-n':a.status==='Paused'?'pill-n':'pill-ok';
return <button onClick={()=>onOpen(a)} className="row" style={{width:'100%',gap:13,padding:'12px 16px',textAlign:'left',alignItems:'flex-start',
borderTop:'1px solid var(--line-soft)',transition:'.15s'}}
onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
<span style={{width:3,alignSelf:'stretch',borderRadius:2,background:a.status==='Broken'?'var(--bad)':a.status==='Draft'?'var(--line)':c,flex:'none'}}/>
<span className="grow" style={{minWidth:0}}>
<span className="row" style={{gap:8,flexWrap:'wrap'}}>
<span className="trunc" style={{fontSize:13.2,fontWeight:600,letterSpacing:'-.01em'}}>{a.n}</span>
<span className="pill" style={{fontSize:10.2,background:a.c+'18',color:a.c}}>{a.dept}</span>
<span className="row" style={{gap:5,fontSize:10.8,fontWeight:600,color:c,flex:'none'}}><TierDot tier={a.tier}/>{lbl}</span>
<span className={'pill '+stTone} style={{fontSize:10.2}}>{a.status}</span></span>
<span className="an-note" style={{display:'block',fontSize:12,color:'var(--ink-2)',lineHeight:1.5,marginTop:5}}>
<span className="mono" style={{fontSize:10.6,color:'var(--ink-3)',marginRight:6}}>WHEN</span>{a.trig}
<span className="mono" style={{fontSize:10.6,color:'var(--ink-3)',margin:'0 6px 0 8px'}}>THEN</span>{a.act}</span></span>
<span style={{flex:'none',textAlign:'right',minWidth:96}}>
<span className="row" style={{gap:6,justifyContent:'flex-end'}}>
<span style={{width:6,height:6,borderRadius:'50%',flex:'none',background:a.ok===null?'var(--ink-3)':a.ok?'var(--ok)':'var(--bad)'}}/>
<span className="mono" style={{fontSize:11.2,color:'var(--ink-2)'}}>{a.last}</span></span>
<span className="mono sub" style={{fontSize:10.6,display:'block',marginTop:3}}>{a.runs} runs · {a.rate}</span></span>
<span style={{flex:'none',color:'var(--ink-3)',display:'flex',marginTop:3}}><Ic.dots size={15}/></span></button>};

export const HealthSignalCard=({g})=>{const c=g.tone==='bad'?'var(--bad)':g.tone==='warn'?'var(--warn)':'var(--ok)';
return <div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="row" style={{gap:8,alignItems:'flex-start'}}>
<span style={{width:6,height:6,borderRadius:'50%',background:c,flex:'none',marginTop:5,boxShadow:'0 0 0 3px '+c+'22'}}/>
<span style={{fontSize:12.7,fontWeight:600,lineHeight:1.4}}>{g.t}</span></div>
<div style={{fontSize:12,color:'var(--ink-2)',lineHeight:1.5,marginTop:6}}>{g.b}</div>
<button className="btn btn-s btn-g" style={{height:26,fontSize:11.5,marginTop:9}}><Ic.check size={11}/>{g.act}</button></div>};

export const TenantAutomationsLibrary=({onOpen,onBuild})=>{
const[f,setF]=React.useState('all');const[q,setQ]=React.useState('');
const chips=[['all','All'],['auto','🟢 Auto'],['confirm','🟡 Confirm'],['off','🔴 Off'],['live','Live'],['broken','Broken'],['draft','Draft'],
...[...new Set(AU.rules.map(r=>r.dept))].map(d=>[d,d])];
const rows=AU.rules.filter(r=>{
const m=f==='all'||r.tier===f||r.status.toLowerCase()===f||r.dept===f;
return m&&(!q||(r.n+r.trig+r.act).toLowerCase().includes(q.toLowerCase()))});
return <div className="an-brief">
<PendBanner text={AU.pend}/>
<div className="card row" style={{padding:0,overflow:'hidden'}}>{AU.kpi.map((m,i)=><div key={m.k} className="row grow" style={{gap:10,padding:'9px 14px',minWidth:0,
borderLeft:i?'1px solid var(--line-soft)':'0'}}>
<span className="mono" style={{fontSize:21,fontWeight:600,letterSpacing:'-.03em',flex:'none',color:m.tone==='bad'?'var(--bad)':'var(--ink)'}}>{m.v}</span>
<span className="grow" style={{minWidth:0}}><span className="eyebrow trunc" style={{fontSize:9.4,display:'block'}}>{m.k}</span>
<span className="sub trunc" style={{fontSize:10.9,display:'block'}}>{m.s}</span></span></div>)}</div>
<div className="an-2">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none',flexWrap:'wrap',rowGap:9}}><div style={{minWidth:0}}><h3>Every rule she is running</h3>
<div className="sub trunc">{AU.rules.length} built · {AU.rules.filter(r=>r.status==='Live').length} live</div></div>
<div className="row" style={{gap:8,flex:'none'}}>
<span className="row" style={{gap:7,height:28,padding:'0 10px',border:'1px solid var(--line)',borderRadius:8,background:'var(--surface-2)',color:'var(--ink-3)'}}>
<Ic.search size={13}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search rules"
style={{border:0,background:'none',outline:'none',fontSize:12.2,width:118,color:'var(--ink)'}}/></span>
<button className="btn btn-s btn-g" onClick={onBuild}><Ic.plus size={12}/>Build new</button></div></div>
<div className="row tabstrip" style={{gap:6,padding:'9px 14px',borderBottom:'1px solid var(--line-soft)',flex:'none'}}>
{chips.map(([k,l])=><button key={k} onClick={()=>setF(k)} className="pill"
style={{height:24,cursor:'pointer',background:f===k?'var(--ink)':'var(--surface-sunk)',color:f===k?'var(--ink-inv)':'var(--ink-3)',fontSize:11}}>{l}</button>)}</div>
<div key={f+q} className="pane fade-in" style={{flex:1}}>
{rows.map(a=><AutomationCard key={a.n} a={a} onOpen={onOpen}/>)}
{!rows.length&&<div className="sub" style={{padding:'22px 16px',fontSize:12.4}}>Nothing matches that filter.</div>}</div></div>
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Health signals</h3><div className="sub">What she would fix first</div></div></div>
<div className="pane" style={{flex:1,padding:'11px 13px',display:'grid',gap:9,alignContent:'start'}}>
{AU.health.map((g,i)=><HealthSignalCard key={i} g={g}/>)}
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige's read</div>
<div style={{fontSize:12.3,color:'var(--ink-2)',lineHeight:1.55,marginTop:7}}>Two of your automations have not done real work in 30 days — one is waiting on a trigger you retired, the other has a broken condition I can fix in one edit. Everything else is clean enough that Dunning is ready to run without you.</div></div></div></div></div></div>};

export const RunEvent=({r,onOpen})=>(<button onClick={()=>onOpen(r)} className="row" style={{width:'100%',gap:12,padding:'11px 16px',textAlign:'left',alignItems:'flex-start',
borderTop:'1px solid var(--line-soft)',transition:'.15s'}}
onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
<span style={{marginTop:3,flex:'none'}}><TierDot tier={r.tier}/></span>
<span className="grow" style={{minWidth:0}}>
<span className="row" style={{gap:8,flexWrap:'wrap'}}>
<span className="trunc" style={{fontSize:12.8,fontWeight:600}}>{r.n}</span><StPill st={r.st}/></span>
<span className="trunc" style={{display:'block',fontSize:11.9,color:'var(--ink-2)',marginTop:3}}>{r.ev}</span></span>
<span className="row cc-hide" style={{gap:7,flex:'none'}}><EngBadge eng={r.eng}/><span className="pill pill-n" style={{fontSize:10.2}}>{r.dept}</span></span>
<span style={{flex:'none',textAlign:'right',width:88}}>
<span className="mono" style={{fontSize:11.2,color:'var(--ink-2)',display:'block'}}>{r.t}</span>
<span className="mono sub" style={{fontSize:10.6}}>{r.dur}</span></span></button>);

export const TenantAutomationsRuns=({onOpen})=>{const[f,setF]=React.useState('all');const[win,setWin]=React.useState('7d');
const chips=[['all','All'],['Success','Successful'],['Failed','Failed'],['Approved','Approved'],['Auto-fired','Auto-fired'],
...Object.keys(ENG).map(k=>[k,ENG[k][0]])];
const rows=AU.runs.filter(r=>f==='all'||r.st===f||r.eng===f);
return <div className="an-2">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div style={{minWidth:0}}><h3>Every firing, every engine</h3>
<div className="sub trunc">148 runs in the window · newest first</div></div>
<div className="seg">{[['24h','24h'],['7d','7d'],['30d','30d']].map(([k,l])=>
<button key={k} aria-pressed={win===k} onClick={()=>setWin(k)}>{l}</button>)}</div></div>
<div className="row tabstrip" style={{gap:6,padding:'9px 14px',borderBottom:'1px solid var(--line-soft)',flex:'none'}}>
{chips.map(([k,l])=><button key={k} onClick={()=>setF(k)} className="pill"
style={{height:24,cursor:'pointer',background:f===k?'var(--ink)':'var(--surface-sunk)',color:f===k?'var(--ink-inv)':'var(--ink-3)',fontSize:11}}>{l}</button>)}</div>
<div key={f} className="pane fade-in" style={{flex:1}}>
{rows.map((r,i)=><RunEvent key={i} r={r} onOpen={onOpen}/>)}
{!rows.length&&<div className="sub" style={{padding:'22px 16px',fontSize:12.4}}>No runs match that filter.</div>}</div></div>
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Run health</h3><div className="sub">This week against last</div></div></div>
<div className="pane" style={{flex:1,padding:'12px 14px',display:'grid',gap:11,alignContent:'start'}}>
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{fontSize:9.6}}>Success rate</div>
<div className="row" style={{gap:8,margin:'5px 0 8px'}}>
<span style={{fontSize:24,fontWeight:600,letterSpacing:'-.03em'}}>94%</span>
<span className="pill pill-ok" style={{fontSize:10.4}}>+6 pts</span></div>
<Meter pct={94} tone="var(--ok)" h={6}/>
<div className="sub" style={{fontSize:11.5,marginTop:8,lineHeight:1.5}}>139 of 148 runs cleared. Eight of the nine failures came from one rule.</div></div>
<div><div className="eyebrow" style={{marginBottom:8}}>Top failing rules</div>
<div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{[['Sync repair · Token expiry',5,7],['Scheduling · Thursday resolver',1,22],['Competitor watch · Price scan',2,63]].map(([n,f2,tot],i)=>
<div key={n} className="row" style={{gap:10,padding:'10px 12px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow trunc" style={{fontSize:12.2}}>{n}</span>
<span className="grow" style={{minWidth:40,maxWidth:70}}><Meter pct={f2/tot*100} tone="var(--bad)" h={4}/></span>
<span className="mono" style={{fontSize:11,color:'var(--bad)',flex:'none'}}>{f2}/{tot}</span></div>)}</div></div>
<div className="two" style={{gap:10}}>
{[['Actions executed','1,204'],['Awaiting approval','1'],['Auto-fired','118'],['Approved by you','29']].map(([k,v])=>
<div key={k} style={{padding:'10px 12px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{fontSize:9.4}}>{k}</div><div className="mono" style={{fontSize:15,fontWeight:600,marginTop:3}}>{v}</div></div>)}</div>
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige's read</div>
<div style={{fontSize:12.3,color:'var(--ink-2)',lineHeight:1.55,marginTop:7}}>The week reads worse than it is. Sync repair failing five times and the price scan firing sixty-three are the same fix pattern — a trigger pointing at something that moved. Everything you approved by hand cleared on the first attempt.</div></div></div></div></div>};

export const RuleDrawer=({a,onClose})=>{if(!a)return null;const[c,lbl]=TIER[a.tier];
const hist=AU.runs.filter(r=>r.n===a.n);
return <SlideOut open={!!a} onClose={onClose} title={a.n} sub={a.dept+' · '+lbl+' · '+a.status} icon={<Ic.bolt size={15}/>} wide
foot={<><button className="btn btn-s btn-p"><Ic.spark size={12}/>{a.status==='Broken'?'Fix with Paige':a.status==='Draft'?'Turn it on':'Edit with Paige'}</button>
<button className="btn btn-s">{a.status==='Live'?'Pause':'Duplicate'}</button></>}>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<span className="row" style={{gap:6,fontSize:11.4,fontWeight:600,color:c}}><TierDot tier={a.tier} size={8}/>{lbl}</span>
<EngBadge eng={a.eng}/><span className="pill pill-n">{a.by}</span><span className="pill pill-n">Modified {a.mod}</span></div>
<div style={{marginTop:14,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{[['When',a.trig],['Then',a.act]].map(([k,v],i)=><div key={k} style={{padding:'12px 14px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<div className="eyebrow" style={{fontSize:9.4}}>{k}</div>
<div style={{fontSize:12.9,color:'var(--ink-2)',lineHeight:1.55,marginTop:4}}>{v}</div></div>)}</div>
<div style={{padding:'12px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',marginTop:12,
fontSize:12.5,color:'var(--ink-2)',lineHeight:1.55}}><span style={{color:'var(--ink)',fontWeight:600}}>Paige's read: </span>{a.note}</div>
<div className="eyebrow" style={{marginTop:18}}>Autonomy</div>
<div className="row" style={{gap:6,marginTop:8}}>{['off','confirm','auto'].map(t=><button key={t} className="btn btn-s"
style={{height:28,fontSize:11.8,borderColor:t===a.tier?TIER[t][0]:'var(--line)',background:t===a.tier?TIER[t][0]+'14':'var(--surface)',color:t===a.tier?TIER[t][0]:'var(--ink-2)'}}>
<TierDot tier={t}/>{TIER[t][1]}</button>)}</div>
<div className="sub" style={{marginTop:7,fontSize:11.6,lineHeight:1.5}}>Clamped by {a.dept} autonomy in Trust Compass. A rule can be quieter than its department, never louder.</div>
<div className="eyebrow" style={{marginTop:18}}>Run history for this rule</div>
<div style={{marginTop:8,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{hist.map((r,i)=><div key={i} className="row" style={{gap:10,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<StPill st={r.st}/><span className="grow trunc" style={{fontSize:12.2,color:'var(--ink-2)'}}>{r.ev}</span>
<span className="mono sub" style={{fontSize:11,flex:'none'}}>{r.t}</span></div>)}
{!hist.length&&<div className="sub" style={{padding:'12px 13px',fontSize:12}}>No runs yet. {a.runs?a.runs+' historical runs are outside this window.':'This rule has never fired.'}</div>}</div>
<div className="eyebrow" style={{marginTop:18}}>Dependencies</div>
<div className="two" style={{gap:12,marginTop:8}}>
{[['Depends on',a.needs],['Feeds into',a.feeds]].map(([k,list])=><div key={k} style={{padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{fontSize:9.4}}>{k}</div>
<div style={{display:'grid',gap:5,marginTop:6}}>{list.map(x=><span key={x} className="row" style={{gap:6,fontSize:11.9,color:x.includes('missing')||x.includes('retired')?'var(--bad)':'var(--ink-2)'}}>
<span style={{width:4,height:4,borderRadius:'50%',background:'currentColor',flex:'none'}}/>{x}</span>)}</div></div>)}</div>
<div className="sub" style={{marginTop:16,fontSize:11.8,lineHeight:1.55}}>Runs in your brand and your voice. Anything this rule sends is written the way you write.</div></SlideOut>};

export const RunDrawer=({r,onClose})=>{if(!r)return null;
return <SlideOut open={!!r} onClose={onClose} title={r.n} sub={r.ev} icon={<Ic.pulse size={15}/>}
foot={<><button className="btn btn-s btn-p"><Ic.arrow size={12}/>{r.st==='Failed'?'Fix and rerun':'Rerun'}</button>
<button className="btn btn-s">Open the rule</button></>}>
<div className="row" style={{gap:9,flexWrap:'wrap'}}><StPill st={r.st}/><EngBadge eng={r.eng}/>
<span className="pill pill-n">{r.dept}</span><span className="row" style={{gap:5,fontSize:11.2,fontWeight:600,color:TIER[r.tier][0]}}><TierDot tier={r.tier}/>{TIER[r.tier][1]}</span></div>
<div className="two" style={{gap:12,marginTop:14}}>
{[['Fired',r.t],['Duration',r.dur]].map(([k,v])=><div key={k} style={{padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{fontSize:9.4}}>{k}</div><div className="mono" style={{fontSize:14,fontWeight:600,marginTop:3}}>{v}</div></div>)}</div>
<div className="eyebrow" style={{marginTop:18}}>What happened</div>
<div style={{fontSize:12.9,color:'var(--ink-2)',lineHeight:1.6,marginTop:6}}>{r.out}</div>
{r.err&&<><div className="eyebrow" style={{marginTop:18}}>Error</div>
<div className="mono" style={{marginTop:6,padding:'10px 12px',border:'1px solid var(--bad)',background:'var(--bad-tint)',borderRadius:'var(--r-m)',
fontSize:11.6,color:'var(--bad)',lineHeight:1.5,wordBreak:'break-word'}}>{r.err}</div></>}
<div className="eyebrow" style={{marginTop:18}}>Trace</div>
<div style={{marginTop:8,position:'relative',paddingLeft:24}}>
<span style={{position:'absolute',left:8,top:5,bottom:5,width:1,background:'var(--line)'}}/>
{[['Trigger matched',r.ev],['Conditions evaluated','Tenant scope, business hours, autonomy clamp'],
['Action dispatched',ENG[r.eng][0]+' path'],[r.st==='Failed'?'Failed':'Completed',r.out]].map(([t,d],i,arr)=>
<div key={t} style={{position:'relative',paddingBottom:i===arr.length-1?0:13}}>
<span style={{position:'absolute',left:-20,top:3,width:11,height:11,borderRadius:'50%',border:'2px solid var(--surface)',
background:i===arr.length-1&&r.st==='Failed'?'var(--bad)':'var(--violet)'}}/>
<div style={{fontSize:12.5,fontWeight:600}}>{t}</div>
<div style={{fontSize:11.9,color:'var(--ink-2)',lineHeight:1.5,marginTop:2}}>{d}</div></div>)}</div></SlideOut>};
