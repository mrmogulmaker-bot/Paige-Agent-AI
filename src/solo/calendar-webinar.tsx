// @ts-nocheck
import React from "react";
import { Ic, Avatar, Meter, SlideOut } from "./_shared";
import { Sw, CfgRow, CfgCard } from "./calendar-cfg";
import { DraftCard } from "./automations-build";
import { SetSect } from "./calendar-settings";

export const WB={
sessions:[
 {n:'Trust structures for founders',st:'Scheduled',when:'Thu Aug 27 · 1:00pm',dur:'60 min',plat:'Zoom Webinar',cap:100,reg:64,wait:8,price:'Free',
  slug:'antonio/trust-webinar',replay:'14 days',approve:false,rules:5,
  d:'The sixty-minute version of the deep-dive, for a room instead of one person. Structure, control, and who owns what.',
  note:'Sixty-four registered in nine days with no ad spend. Eight on the waitlist because you capped it at a hundred and Zoom charges past that.'},
 {n:'Compliance clinic · quarterly',st:'Draft',when:'Not scheduled',dur:'45 min',plat:"Paige's own room",cap:40,reg:0,wait:0,price:'$49',
  slug:'antonio/clinic',replay:'30 days',approve:true,rules:0,
  d:'Bring one filing question. Forty seats, paid, approval required so it stays clients and serious prospects.',
  note:'Drafted and never scheduled. Paid and approval-gated means it needs a date and a chain before it can open.'},
 {n:'Trust structures for founders · June cohort',st:'Ended',when:'Thu Jun 18 · 1:00pm',dur:'60 min',plat:'Zoom Webinar',cap:100,reg:82,wait:0,price:'Free',
  slug:'antonio/trust-webinar-june',replay:'Expired',approve:false,rules:5,att:47,
  d:'The first run of this session.',
  note:'Eighty-two registered, forty-seven showed, three became clients. Cairn Advisory closed eleven weeks later at $6,200.'}],
regs:[
 {who:'Delia Marsh',co:'Marsh & Co.',st:'Registered',src:'Pricing page',q:'Two LLCs, no trust yet.'},
 {who:'Owen Castellan',co:'Castellan Group',st:'Registered',src:'Referral · Ridgeline',q:'Holding company for three rentals.'},
 {who:'Priya Raman',co:'Harlow & Reed',st:'Registered',src:'Client portal',q:'Beneficial ownership rules.'},
 {who:'Nils Boquet',co:'Boquet Ventures',st:'Waitlisted',src:'Email signature',q:'Partner buyout protection.'},
 {who:'Ana Sordello',co:'Sordello Design',st:'Waitlisted',src:'Pricing page',q:'Not sure yet.'},
 {who:'Tomas Reyes',co:'Reyes Holdings',st:'Pending approval',src:'Cold link',q:'Asked about the paid clinic instead.'}],
past:[
 {who:'Cairn Advisory',st:'Attended',out:'Became a client · $6,200'},
 {who:'Atlas Reps',st:'Attended',out:'In pipeline · discovery'},
 {who:'Hale Studio',st:'Attended',out:'Nurture sequence, no reply yet'},
 {who:'Fairgrove Coaching',st:'No-show',out:'Watched the replay, then booked a consult'},
 {who:'Verity Partners',st:'No-show',out:'Replay unopened'}],
cohorts:[
 {n:'June cohort',reg:82,att:47,cl:3,cac:'$1,180',rev:'$19,200 LTV',pay:'3.1 months',
  note:'Your third-best acquisition channel by payback, behind referrals and teardown content. Slower than both, and the only one that scales without you writing anything new.'},
 {n:'March cohort',reg:54,att:31,cl:1,cac:'$2,040',rev:'$6,400 LTV',pay:'6.8 months',
  note:'Half the room, a third of the result. The difference was the reminder ladder — March had one reminder, June had five.'}],
live:{inroom:38,cap:100,hands:3,mins:'42 of 60',
 qs:[['Owen Castellan','Does a revocable trust protect against a partner buyout?','Answered'],
  ['Delia Marsh','Can I move existing LLCs under a trust without refiling?','Answered'],
  ['Priya Raman','What triggers the beneficial ownership update?','Raised, unanswered']]},
seed:[
 {who:'you',t:'I am running the trust webinar on the 27th. Hundred seats, free, and I want the whole thing automated — reminders, replay for no-shows, and the good leads on my desk.'},
 {who:'paige',t:'Understood. Five rules covers it: confirm on register, four reminders down to ten minutes out, the live-now push, the replay to no-shows only, and a lead score after so you see the twelve worth calling instead of sixty-four names.',
  opts:['That is right, file them','Add a paid upsell after','Skip the lead scoring']},
 {who:'you',t:'That is right, file them.'},
 {who:'paige',t:'Filed into Automations under a new Calendar department. Every one is auto except the lead handoff — that one holds for your read, because the first thing you will want to change is who counts as worth calling.',
  chain:true}],
chain:[
 {n:'Webinar · Registration confirm',tier:'auto',trig:'When someone registers for the trust webinar',act:'Confirm the seat, add the calendar invite, and put them on the reminder ladder',
  why:'Nothing here needs your judgement. Sixty-four have already run through it.'},
 {n:'Webinar · Reminder ladder',tier:'auto',trig:'One week, one day, one hour and ten minutes before it starts',act:'Send the four reminders, each shorter than the last',
  why:'March had one reminder and a 57% show rate. June had five and hit 57% on a bigger room. The ladder is the whole difference.'},
 {n:'Webinar · Live now',tier:'auto',trig:'The moment you open the room',act:'Push the join link to everyone confirmed, and to the waitlist if seats freed up',
  why:'Waitlist promotion at the door is where eight extra people come from.'},
 {n:'Webinar · Replay to no-shows',tier:'auto',trig:'When the session ends',act:'Send the replay to whoever did not attend, and nothing to whoever did',
  why:'Fairgrove watched the June replay and then booked a consult. Sending it to attendees too is how a replay stops feeling personal.'},
 {n:'Webinar · Lead handoff',tier:'confirm',trig:'Twenty-four hours after the session',act:'Score every attendee on watch time and questions asked, and put the top twelve on your desk',
  why:'Confirm, not auto, because who counts as worth calling is a judgement you will want to correct twice before I have it right.'}]};

export const BRIDGE={
trig:[['Booking made','Any link','3 rules listening'],['Booking cancelled','Any link','2 rules'],
 ['No-show detected','Calls and webinars','2 rules'],['Registrant registered','Webinars','1 rule'],
 ['Webinar ended','Webinars','1 rule'],['Attended / did not attend','Webinars','2 rules'],
 ['24 hours before any event','Everything on the grid','1 rule'],['Deadline moved','Trust Compass','1 rule'],
 ['Slot went unfilled','Any link','No listeners yet'],['Capacity hit','Webinars and caps','No listeners yet']],
acts:[['Hold a slot','Reserves time without telling anyone yet'],['Offer two alternatives','In your voice, both inside the same week'],
 ['Open a seat','Promotes the top of the waitlist'],['Move a call','Only with your confirm, never silently'],
 ['Send the replay','To a filtered list, not the whole room'],['Start a nurture sequence','Hands the contact to Growth'],
 ['Open a follow-up item','Lands in the queue with the call notes attached']],
adopted:[{n:'Scheduling · Thursday conflict resolver',d:'Twenty-two moves this week, one bounce. Built in Automations before the calendar existed — the calendar now shows it as a listener instead of rebuilding it.',st:'Adopted'},
 {n:'Onboarding · New client welcome kit',d:'Opens the onboarding checklist, which puts three milestones on the grid.',st:'Adopted'},
 {n:'Retainer renewal · 45-day nudge',d:'Has not fired since April. The calendar could trigger it off the contract end date instead of the retired deal stage.',st:'Offered'}]};

export const WbRow=({w,onOpen,onPreview})=>(<div className="row" style={{gap:12,padding:'12px 16px',borderTop:'1px solid var(--line-soft)',alignItems:'flex-start',transition:'.15s'}}
onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
<span style={{width:3,alignSelf:'stretch',borderRadius:2,flex:'none',background:w.st==='Scheduled'?'#2E7D8F':w.st==='Ended'?'var(--line)':'var(--gold-line)'}}/>
<button onClick={()=>onOpen(w)} className="grow" style={{minWidth:0,textAlign:'left'}}>
<span className="row" style={{gap:8,flexWrap:'wrap'}}>
<span className="trunc" style={{fontSize:13.2,fontWeight:600,letterSpacing:'-.01em'}}>{w.n}</span>
<span className="pill" style={{fontSize:10.2,background:'#2E7D8F18',color:'#2E7D8F'}}>{w.dur}</span>
<span className={'pill '+(w.st==='Scheduled'?'pill-ok':w.st==='Ended'?'pill-n':'pill-warn')} style={{fontSize:10.2}}>{w.st}</span>
{w.price!=='Free'&&<span className="pill" style={{fontSize:10.2,background:'var(--gold-tint)',color:'var(--gold)'}}>{w.price}</span>}
{!!w.rules&&<span className="pill pill-v" style={{fontSize:10.2}}><Ic.bolt size={10}/>{w.rules} rules</span>}</span>
<span className="an-note" style={{display:'block',fontSize:12,color:'var(--ink-2)',lineHeight:1.5,marginTop:4}}>{w.d}</span>
<span className="row" style={{gap:9,marginTop:6,flexWrap:'wrap'}}>
<span className="mono" style={{fontSize:10.6,color:'var(--ink-3)'}}>{w.when}</span>
<span style={{fontSize:10.8,color:'var(--ink-3)'}}>{w.plat} · {w.cap} seats · replay {w.replay}</span></span></button>
<span style={{flex:'none',textAlign:'right',minWidth:82}}>
<span className="mono" style={{fontSize:16,fontWeight:600,display:'block',letterSpacing:'-.02em'}}>{w.st==='Ended'?w.att+'/'+w.reg:w.reg}</span>
<span className="mono sub" style={{fontSize:10.2}}>{w.st==='Ended'?'showed up':w.wait?'reg · '+w.wait+' waiting':'registered'}</span></span>
<button className="btn btn-s" onClick={()=>onPreview({...w,dur:w.dur,loc:w.plat,q:['What are you hoping to sort out?'],cf:'You are registered for {time}. The join link is in your inbox and I will nudge you an hour before.'})}
style={{flex:'none',height:26,fontSize:11.4}}><Ic.search size={11}/>Preview</button></div>);

export const WbDrawer=({w,onClose,onPreview})=>{const[s,setS]=React.useState('session');
const[msgs,setMsgs]=React.useState(WB.seed);const[think,setThink]=React.useState(false);const[txt,setTxt]=React.useState('');
React.useEffect(()=>{if(w){setS('session');setMsgs(WB.seed)}},[w&&w.n]);
if(!w)return null;const ended=w.st==='Ended';
const say=t=>{if(!t.trim())return;setTxt('');setMsgs(m=>[...m,{who:'you',t}]);setThink(true);
setTimeout(()=>{setThink(false);setMsgs(m=>[...m,{who:'paige',
t:t.includes('paid')?'I can add a paid upsell at the end — the clinic at $49, offered only to whoever stayed past forty minutes. That is a sixth rule and it holds for your read the first time.'
:t.includes('Skip')?'Dropped the scoring. You will get all sixty-four names in one list instead, which is more reading and less thinking on my side.'
:'Say it however it comes out and I will shape it into a rule. If it touches money or your calendar, I will hold it for your read.',
opts:['File it','Show me the rule first']}])},900)};
const secs=[['session','Session'],['reg',ended?'Attendance':'Registrants'],['chain','Automation'],['cohort','Cohorts'],['live','Live room']];
return <SlideOut open={!!w} onClose={onClose} title={w.n} sub={w.when+' · '+w.plat} icon={<Ic.users size={15}/>} wide
foot={<><button className="btn btn-s btn-p">{ended?<><Ic.arrow size={12}/>Run it again</>:<><Ic.check size={12}/>Save changes</>}</button>
<button className="btn btn-s" onClick={()=>{onClose();onPreview({...w,loc:w.plat,q:['What are you hoping to sort out?'],cf:'You are registered for {time}. The join link is in your inbox.'})}}><Ic.search size={12}/>Registration page</button>
<button className="btn btn-s">Copy link</button></>}>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<span className={'pill '+(w.st==='Scheduled'?'pill-ok':ended?'pill-n':'pill-warn')}>{w.st}</span>
<span className="pill" style={{background:'#2E7D8F18',color:'#2E7D8F'}}>One to many</span>
<span className="pill pill-n">{w.cap} seats</span>{w.price!=='Free'&&<span className="pill" style={{background:'var(--gold-tint)',color:'var(--gold)'}}>{w.price}</span>}
{w.approve&&<span className="pill pill-warn">Approval required</span>}</div>
<div className="row tabstrip" style={{gap:6,margin:'14px 0 4px'}}>{secs.map(([k,l])=>
<button key={k} onClick={()=>setS(k)} className="pill" style={{height:25,cursor:'pointer',fontSize:11.2,
background:s===k?'var(--ink)':'var(--surface-sunk)',color:s===k?'var(--ink-inv)':'var(--ink-3)'}}>{l}</button>)}</div>
<div key={s} className="fade-in">
{s==='session'&&<>
<div style={{padding:'12px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',marginTop:10,
fontSize:12.5,color:'var(--ink-2)',lineHeight:1.55}}><span style={{color:'var(--ink)',fontWeight:600}}>Paige's read: </span>{w.note}</div>
<CfgCard t="The session">
<CfgRow k="When" v={w.when}/><CfgRow k="Length" v={w.dur}/>
<CfgRow k="Platform" v={w.plat} note="Zoom Webinar, Google Meet or her own room. Zoom caps at a hundred on your plan, which is why eight are waiting."/>
<CfgRow k="Seats" v={w.cap+' · '+w.reg+' taken'+(w.wait?', '+w.wait+' waitlisted':'')}/>
<CfgRow k="Waitlist" v="Promotes automatically when a seat frees" sw on={!!w.wait||w.st==='Draft'} c="#2E7D8F"/>
<CfgRow k="Approval" v={w.approve?'Every registration waits for your read':'Open — anyone with the link'} sw on={w.approve} c="#2E7D8F"/></CfgCard>
<CfgCard t="Registration page">
<CfgRow k="Link" v={'book.paige.ai/'+w.slug}/>
<CfgRow k="Asks them" v="One line: what are you hoping to sort out"/>
<CfgRow k="Creates a lead" v="In your pipeline, sourced to this cohort" sw on c="#2E7D8F"/>
<CfgRow k="Payment" v={w.price==='Free'?'None':w.price+' at registration, refundable to 24 hours'} sw on={w.price!=='Free'} c="var(--gold)"/></CfgCard>
<CfgCard t="Replay">
<CfgRow k="Recording" v="Automatic, stored in the vault" sw on c="#2E7D8F"/>
<CfgRow k="Available for" v={w.replay}/>
<CfgRow k="Who gets it" v="No-shows only — attendees get the notes instead" sw on c="#2E7D8F"
note="Fairgrove watched the June replay and booked a consult off it. That only works when the replay is not sent to everybody."/></CfgCard></>}
{s==='reg'&&<>
<div className="two" style={{gap:12,marginTop:10}}>
{(ended?[['Registered',w.reg],['Showed up',w.att]]:[['Registered',w.reg],['Waitlisted',w.wait]]).map(([k,v])=>
<div key={k} style={{padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{fontSize:9.4}}>{k}</div><div className="mono" style={{fontSize:18,fontWeight:600,marginTop:3}}>{v}</div></div>)}</div>
{ended&&<><div className="row" style={{gap:10,marginTop:12}}>
<span className="grow"><Meter pct={w.att/w.reg*100} tone="#2E7D8F" h={6}/></span>
<span className="mono" style={{fontSize:11.4,color:'var(--ink-3)',flex:'none'}}>{Math.round(w.att/w.reg*100)}% showed</span></div></>}
<div className="eyebrow" style={{marginTop:18}}>{ended?'What became of the room':'Who is coming'}</div>
<div style={{marginTop:8,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{(ended?WB.past:WB.regs).map((r,i)=><div key={i} className="row" style={{gap:11,padding:'11px 13px',borderTop:i?'1px solid var(--line-soft)':'0',alignItems:'flex-start'}}>
<Avatar name={r.who} size={26}/>
<span className="grow" style={{minWidth:0,display:'block'}}>
<span className="row" style={{gap:7,flexWrap:'wrap'}}><span className="trunc" style={{fontSize:12.4,fontWeight:600}}>{r.who}</span>
{r.co&&<span className="pill pill-n" style={{fontSize:10}}>{r.co}</span>}</span>
<span className="trunc" style={{display:'block',fontSize:11.4,color:'var(--ink-3)',marginTop:2}}>{ended?r.out:r.src+' · '+r.q}</span></span>
<span className={'pill '+(r.st==='Attended'?'pill-ok':r.st==='No-show'?'pill-bad':r.st==='Waitlisted'?'pill-n':r.st==='Pending approval'?'pill-warn':'pill-v')}
style={{fontSize:10,flex:'none'}}>{r.st}</span></div>)}</div>
{!ended&&<div className="row" style={{gap:7,marginTop:11,flexWrap:'wrap'}}>
<button className="btn btn-s btn-g"><Ic.check size={11}/>Approve the pending one</button>
<button className="btn btn-s"><Ic.plus size={11}/>Raise the cap to 150</button>
<button className="btn btn-s"><Ic.mail size={11}/>Message the room</button></div>}</>}
{s==='chain'&&<>
<div style={{marginTop:10,display:'grid',gap:11}}>
{msgs.map((m,i)=>m.who==='you'
?<div key={i} className="row" style={{gap:10,alignItems:'flex-start',justifyContent:'flex-end'}}>
<div style={{maxWidth:'80%',padding:'10px 13px',borderRadius:'14px 14px 4px 14px',background:'var(--surface-sunk)',fontSize:12.6,lineHeight:1.55}}>{m.t}</div>
<Avatar name="Antonio Cook" size={24} tone="var(--gold)"/></div>
:<div key={i} className="row" style={{gap:10,alignItems:'flex-start'}}>
<span className="tile" style={{width:24,height:24,borderRadius:8,background:'var(--violet-tint)',color:'var(--violet)',marginTop:1}}><Ic.spark size={12}/></span>
<div style={{maxWidth:'86%',minWidth:0,display:'grid',gap:9}}>
<div style={{padding:'10px 13px',borderRadius:'14px 14px 14px 4px',background:'var(--violet-tint)',fontSize:12.6,lineHeight:1.55}}>{m.t}</div>
{m.opts&&<div className="row" style={{gap:7,flexWrap:'wrap'}}>{m.opts.map(o=>
<button key={o} className="btn btn-s" onClick={()=>say(o)} style={{height:26,fontSize:11.6}}>{o}</button>)}</div>}
{m.chain&&<div style={{display:'grid',gap:9}}>{WB.chain.map(d=><DraftCard key={d.n} d={{...d,dept:'Calendar',c:'#2E7D8F'}}/>)}
<div className="row" style={{gap:7,flexWrap:'wrap'}}>
<button className="btn btn-s btn-p"><Ic.check size={11}/>File all five into Automations</button>
<button className="btn btn-s"><Ic.bolt size={11}/>Open them in Automations</button></div></div>}</div></div>)}
{think&&<div className="row fade-in" style={{gap:10}}>
<span className="tile" style={{width:24,height:24,borderRadius:8,background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.spark size={12}/></span>
<span className="row" style={{gap:4,padding:'10px 12px',borderRadius:14,background:'var(--violet-tint)'}}>
{[0,1,2].map(i=><span key={i} style={{width:5,height:5,borderRadius:'50%',background:'var(--violet)',animation:'fi .7s ease-in-out '+(i*.15)+'s infinite alternate'}}/>)}</span></div>}</div>
<div className="row" style={{gap:8,marginTop:12}}>
<span className="row grow" style={{gap:8,height:34,padding:'0 12px',border:'1px solid var(--line)',borderRadius:10,background:'var(--surface-2)',minWidth:0}}>
<input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&say(txt)}
placeholder="Change the chain — say it however it comes out" style={{border:0,background:'none',outline:'none',fontSize:12.6,width:'100%',color:'var(--ink)'}}/></span>
<button className="btn btn-s btn-p" style={{height:34}} onClick={()=>say(txt)}><Ic.send size={12}/>Send</button></div>
<div className="sub" style={{marginTop:9,fontSize:11.6,lineHeight:1.5}}>These are real rules in Automations under a Calendar department, not a second system. Edit them there or here — same rule either way.</div></>}
{s==='cohort'&&<>
<div style={{marginTop:10,display:'grid',gap:10}}>
{WB.cohorts.map(c=><div key={c.n} style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
<div className="row" style={{gap:9,padding:'11px 13px',background:'var(--surface-2)',flexWrap:'wrap'}}>
<span className="grow" style={{minWidth:0,fontSize:12.8,fontWeight:600}}>{c.n}</span>
<span className="mono pill pill-n" style={{fontSize:10}}>{c.att} of {c.reg} showed</span>
<span className="pill pill-ok" style={{fontSize:10}}>{c.cl} {c.cl===1?'client':'clients'}</span></div>
<div className="row" style={{gap:0,flexWrap:'wrap'}}>
{[['Cost per client',c.cac],['Value won',c.rev],['Payback',c.pay]].map(([k,v],i)=>
<div key={k} className="grow" style={{padding:'10px 13px',minWidth:96,borderLeft:i?'1px solid var(--line-soft)':'0',borderTop:'1px solid var(--line-soft)'}}>
<div className="eyebrow" style={{fontSize:9.2}}>{k}</div><div className="mono" style={{fontSize:13.4,fontWeight:600,marginTop:3}}>{v}</div></div>)}</div>
<div style={{padding:'11px 13px',borderTop:'1px solid var(--line-soft)',fontSize:12,color:'var(--ink-2)',lineHeight:1.55}}>{c.note}</div></div>)}</div>
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)',marginTop:12}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige's read</div>
<div style={{fontSize:12.3,color:'var(--ink-2)',lineHeight:1.55,marginTop:7}}>The same session twice with one change — five reminders instead of one — held the show rate while the room grew by half and tripled the clients out of it. Your Growth tab already counts webinars as your third channel by payback; this is why.</div></div>
<button className="btn btn-s" style={{marginTop:11}}><Ic.trend size={12}/>Open it in Growth</button></>}
{s==='live'&&<>
{ended?<div className="sub" style={{marginTop:12,fontSize:12.4,lineHeight:1.55}}>This session has ended. Forty-seven people were in the room, three questions went unanswered, and the replay ran for fourteen days.</div>
:<><div style={{marginTop:10,padding:'13px 15px',border:'1px solid #2E7D8F',background:'#2E7D8F12',borderRadius:'var(--r-m)'}}>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<span className="row" style={{gap:6,color:'#2E7D8F',fontSize:11,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',flex:'none'}}>
<span style={{width:7,height:7,borderRadius:'50%',background:'#2E7D8F',display:'block',animation:'fi 1s ease-in-out infinite alternate'}}/>Live now</span>
<span className="mono" style={{fontSize:11.4,color:'var(--ink-2)',marginLeft:'auto',flex:'none'}}>{WB.live.mins}</span></div>
<div className="row" style={{gap:14,marginTop:11,flexWrap:'wrap'}}>
{[['In the room',WB.live.inroom],['Hands up',WB.live.hands],['Seats',WB.live.cap]].map(([k,v])=>
<div key={k} style={{flex:'1 1 88px'}}><div className="eyebrow" style={{fontSize:9.2}}>{k}</div>
<div className="mono" style={{fontSize:19,fontWeight:600,marginTop:2}}>{v}</div></div>)}</div>
<div style={{marginTop:10}}><Meter pct={WB.live.inroom/WB.live.cap*100} tone="#2E7D8F" h={5}/></div></div>
<div className="eyebrow" style={{marginTop:18}}>Questions</div>
<div style={{marginTop:8,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{WB.live.qs.map(([who,q,st],i)=><div key={i} style={{padding:'11px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<div className="row" style={{gap:9}}><span className="grow trunc" style={{fontSize:12,fontWeight:600}}>{who}</span>
<span className={'pill '+(st==='Answered'?'pill-ok':'pill-warn')} style={{fontSize:10,flex:'none'}}>{st}</span></div>
<div style={{fontSize:12,color:'var(--ink-2)',lineHeight:1.5,marginTop:4}}>{q}</div></div>)}</div>
<div className="row" style={{gap:7,marginTop:11,flexWrap:'wrap'}}>
<button className="btn btn-s btn-p"><Ic.arrow size={11}/>Open the room</button>
<button className="btn btn-s"><Ic.spark size={11}/>Have her answer the open one</button>
<button className="btn btn-s"><Ic.doc size={11}/>Notes so far</button></div>
<div className="sub" style={{marginTop:10,fontSize:11.6,lineHeight:1.5}}>She takes notes live, marks who asked what, and that is what the lead score reads twenty-four hours later.</div></>}</>}</div></SlideOut>};

export const WebinarDefaults=()=>(<>
<SetSect t="Webinar defaults" d="Applies to a new one-to-many session. Any of it can be overridden per session.">
<div style={{marginTop:10,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
<CfgRow k="Platform" v="You pick per session — Zoom Webinar, Meet, or her room"/>
<CfgRow k="Default seats" v="100 · your Zoom plan caps there"/>
<CfgRow k="Waitlist" v="Opens at capacity, promotes when a seat frees" sw on c="#2E7D8F"/>
<CfgRow k="Approval" v="Off for free sessions, on for paid" sw on c="#2E7D8F"/>
<CfgRow k="Registration creates a lead" v="Sourced to the cohort, lands in your pipeline" sw on c="#2E7D8F"/>
<CfgRow k="Recording" v="Automatic, stored in the vault" sw on c="#2E7D8F"/>
<CfgRow k="Replay window" v="14 days free, 30 days paid"/>
<CfgRow k="Replay goes to" v="No-shows only" sw on c="#2E7D8F" note="Attendees get the notes instead. A replay sent to the whole room stops reading as personal."/>
<CfgRow k="Cohort naming" v="Month plus session name — June cohort, August cohort"/></div></SetSect>
<SetSect t="Webinar reminder ladder" d="Different from a call. Five touches, and the ladder is what carried June's show rate.">
<div style={{marginTop:10,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{[['1 week before','Email','What you will cover, and one thing to bring'],['1 day before','Email','Join link and the running time'],
['1 hour before','Email','Short — link only'],['10 min before','SMS','We start in ten'],['At start','SMS and email','We are live, here is the door'],
['After it ends','Email','Replay to no-shows, notes to attendees']].map(([w,ch,d],i)=>
<div key={w} className="row" style={{gap:10,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="mono" style={{fontSize:11.2,fontWeight:600,color:'#2E7D8F',width:92,flex:'none',whiteSpace:'nowrap'}}>{w}</span>
<span className="grow trunc" style={{fontSize:12,color:'var(--ink-2)'}}>{d}</span>
<span className="pill pill-n" style={{fontSize:10,flex:'none'}}>{ch}</span><Sw on c="#2E7D8F"/></div>)}</div>
<div className="sub" style={{marginTop:8,fontSize:11.6,lineHeight:1.5}}>March ran one reminder and lost 43% of the room. June ran five on a bigger room and held the same show rate.</div></SetSect></>);

export const BridgePanel=()=>(<>
<SetSect t="What the calendar publishes" d="Ten events, available to Automations the same way any other trigger is. Two have nobody listening yet.">
<div style={{marginTop:10,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{BRIDGE.trig.map(([n,src,l],i)=>{const none=l.includes('No listeners');
return <div key={n} className="row" style={{gap:10,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{display:'block',fontSize:12.3,fontWeight:600}}>{n}</span>
<span className="trunc" style={{display:'block',fontSize:11,color:'var(--ink-3)'}}>{src}</span></span>
<span className={'pill '+(none?'pill-warn':'pill-v')} style={{fontSize:10,flex:'none'}}>{l}</span>
<Sw on={!none} c="var(--violet)"/></div>})}</div>
<button className="btn btn-s" style={{marginTop:9}}><Ic.bolt size={12}/>Open the Automations library</button></SetSect>
<SetSect t="What automations may do to the calendar" d="The other direction. Seven actions any rule can call.">
<div style={{marginTop:10,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{BRIDGE.acts.map(([n,d],i)=><div key={n} className="row" style={{gap:10,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{display:'block',fontSize:12.3,fontWeight:600}}>{n}</span>
<span className="trunc" style={{display:'block',fontSize:11,color:'var(--ink-3)'}}>{d}</span></span>
<Sw on c="var(--violet)"/></div>)}</div></SetSect>
<SetSect t="Rules that already existed" d="Automations came first. These are adopted, not rebuilt.">
<div style={{marginTop:10,display:'grid',gap:9}}>
{BRIDGE.adopted.map(a=><div key={a.n} style={{padding:'12px 13px',border:'1px solid '+(a.st==='Adopted'?'var(--line)':'var(--gold-line)'),
borderRadius:'var(--r-m)',background:a.st==='Adopted'?'transparent':'var(--gold-tint)'}}>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<span className="grow" style={{minWidth:0,fontSize:12.6,fontWeight:600}}>{a.n}</span>
<span className={'pill '+(a.st==='Adopted'?'pill-ok':'pill-warn')} style={{fontSize:10}}>{a.st}</span></div>
<div style={{fontSize:11.8,color:'var(--ink-2)',lineHeight:1.5,marginTop:6}}>{a.d}</div>
{a.st==='Offered'&&<button className="btn btn-s btn-g" style={{height:26,fontSize:11.4,marginTop:9}}><Ic.check size={11}/>Repoint it at the calendar</button>}</div>)}</div></SetSect>
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige's read</div>
<div style={{fontSize:12.3,color:'var(--ink-2)',lineHeight:1.55,marginTop:7}}>Nothing listens for a slot going unfilled, which is the one worth building — a gap in your week is the cheapest thing you own and the easiest to fill from the waitlist.</div></div></>);
