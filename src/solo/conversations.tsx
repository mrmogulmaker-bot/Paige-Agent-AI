// @ts-nocheck
import React from "react";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, Avatar, Logo, SubTabs, Wrap, PageHead } from "./_shared";
import { Inbox2 } from "./inbox2";
import { Clients } from "./screens";
import { Pipeline } from "./growth2";

export const CV={
threads:[
 {n:'Tashia Anderson',role:'Co-Founder · Fairgrove Group',t:'2 days',pre:'You: Tashia, Welcome to Meridian…',unread:false,ch:'email',state:'Hot Lead',owner:'Jordan Avery',email:'tashiaanderson@me.com',phone:'404 343 5583',tenure:'Client for 14 days'},
 {n:'Lavelle Napier',role:'CEO · Napier Holdings LLC',t:'14 days',pre:'You: Just wanted to check in',unread:false,ch:'email',state:'Nurture',owner:'Jordan Avery',email:'lavelle@napierholdings.com',phone:'678 220 9114',tenure:'Client for 9 months'},
 {n:'Dana Harper',role:'Partner · Harper & Vale',t:'3h',pre:'Paige drafted: renewal note, 94% confidence',unread:true,ch:'email',state:'Renewal',owner:'Jordan Avery',email:'dana@harpervale.co',phone:'415 882 3310',tenure:'Client for 14 months'},
 {n:'Ridgeline Co.',role:'Ops team · shared inbox',t:'1 day',pre:'Marcus: Can we push Thursday to next week?',unread:true,ch:'email',state:'Watch',owner:'Jordan Avery',email:'ops@ridgeline.co',phone:'503 771 0042',tenure:'Client for 7 months'},
 {n:'Selby Group',role:'Founder · Selby Group',t:'19 days',pre:'Paige drafted: low-pressure reset',unread:false,ch:'email',state:'At risk',owner:'Jordan Avery',email:'hello@selbygroup.com',phone:'312 604 7788',tenure:'Client for 5 months'}],
msgs:[
 {me:false,who:'Tashia Anderson',t:'2 days ago',subj:'Re: Welcome to Meridian Advisory',body:"This is exactly what I needed to see laid out. Two questions before we start phase one — does the Foundation phase need my brand assets, and can my operations lead sit in on the kickoff call?"},
 {me:true,who:'You',t:'2 days ago',subj:'Welcome to Meridian Advisory, Tashia',body:"Tashia,\n\nWelcome to Meridian Advisory — and to your engagement.\n\nYou're stepping into a done-for-you process built to take your business from where it stands today to one that runs like a staffed company. Three phases: Foundation gets your systems in order, Build turns them into a repeatable process, and Scale puts the plan into motion.\n\nYour first task is in the portal and takes about ten minutes."},
 {me:false,who:'Paige',t:'12 minutes ago',subj:'Draft ready for your approval',body:"Answering both questions: the brand assets are needed at Foundation step three, not now, and your operations lead is welcome on the kickoff call — I've drafted the reply and attached the onboarding checklist. Approve and I'll send it under your address.",paige:true}],
manual:[
 {t:'Call Ridgeline about the Thursday push',who:'You',due:'Today',state:'Open'},
 {t:'Send Harper & Vale the renewal PDF',who:'You',due:'Today',state:'Waiting on you'},
 {t:'Confirm Selby portal access reset',who:'You',due:'Tomorrow',state:'Open'},
 {t:'Collect W-9 from Okonkwo Group',who:'Unassigned',due:'Aug 18',state:'Open'}],
snippets:[
 {t:'Welcome — new client',use:41,body:"Welcome aboard. Here's exactly what happens in your first two weeks…"},
 {t:'Renewal, evidence-first',use:18,body:'Before we roll into the next quarter I wanted to show you the ground we covered…'},
 {t:'Soft reset after silence',use:12,body:"Checking in without any pressure — two ways to pick this back up…"},
 {t:'Failed payment, first touch',use:27,body:'Your card came back declined — most often an expiry, nothing to worry about…'},
 {t:'Reschedule with two options',use:33,body:'Happy to move it. Two windows that work on my side…'},
 {t:'Scope change confirmation',use:9,body:"Putting the change in writing so we're both working from the same page…"}],
links:[
 {t:'Book a discovery call',clicks:412,conv:'21%',dest:'cal.paigeagent.ai/discovery'},
 {t:'Phase one checklist',clicks:186,conv:'64%',dest:'portal/build/checklist'},
 {t:'Teardown lead magnet',clicks:1240,conv:'8%',dest:'paigeagent.ai/teardown'},
 {t:'Pay invoice',clicks:97,conv:'88%',dest:'billing/invoice'}],
delivery:[
 {c:'Northwind Partners',ms:'Kickoff & 30-day plan',prog:35,due:'Aug 16',owner:'Jordan Avery',state:'On track'},
 {c:'Harper & Vale',ms:'Q3 campaign build',prog:78,due:'Aug 22',owner:'Jordan Avery',state:'On track'},
 {c:'Ridgeline Co.',ms:'Site migration',prog:41,due:'Aug 15',owner:'Jordan Avery',state:'Slipping'},
 {c:'Bellweather Co.',ms:'Brand refresh, phase 2',prog:92,due:'Aug 14',owner:'Jordan Avery',state:'Ready for review'},
 {c:'Selby Group',ms:'Reporting handover',prog:15,due:'Aug 29',owner:'Jordan Avery',state:'Blocked'}],
portal:[
 {c:'Harper & Vale',seats:4,active:'2h ago',docs:12,tasks:'3 of 5',state:'Active'},
 {c:'Northwind Partners',seats:6,active:'4h ago',docs:5,tasks:'1 of 9',state:'Onboarding'},
 {c:'Bellweather Co.',seats:3,active:'1h ago',docs:18,tasks:'5 of 5',state:'Active'},
 {c:'Selby Group',seats:2,active:'19 days ago',docs:9,tasks:'0 of 4',state:'Dormant'},
 {c:'Mercer Studio',seats:1,active:'3 days ago',docs:4,tasks:'2 of 3',state:'Active'}]};

const Inbox=()=>{const[sel,setSel]=React.useState(0);const[filter,setFilter]=React.useState('Active');const[panel,setPanel]=React.useState(true);
const c=CV.threads[sel];const list=CV.threads.filter(t=>filter==='Unread'?t.unread:true);
return <div className="inbox" style={{height:'calc(100vh - 190px)',minHeight:520}}>
<div className="card tlist" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
<div style={{padding:14,display:'grid',gap:10,borderBottom:'1px solid var(--line-soft)'}}>
<button className="btn" style={{justifyContent:'center',background:'var(--gold-bright)',borderColor:'var(--gold-bright)',color:'#2A1C00',fontWeight:600}}><Ic.plus size={15}/>New conversation</button>
<div className="row" style={{gap:8,height:32,padding:'0 11px',border:'1px solid var(--line)',borderRadius:9,color:'var(--ink-3)',background:'var(--surface-2)'}}><Ic.search size={14}/><span style={{fontSize:12.7}}>Search messages</span></div>
<div className="seg" style={{width:'100%'}}>{['Active','Unread','More'].map(f=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)} style={{flex:1}}>{f}</button>)}</div>
<div className="row" style={{justifyContent:'space-between'}}><span className="sub">{list.length} conversations</span><button className="sub row" style={{gap:5}}>Most recent <Ic.chev size={12}/></button></div></div>
<div style={{overflow:'auto',flex:1}}>{list.map((t,i)=>{const on=CV.threads[sel]===t;
return <button key={i} onClick={()=>setSel(CV.threads.indexOf(t))} className="row" style={{width:'100%',textAlign:'left',alignItems:'flex-start',gap:11,padding:'13px 14px',
borderBottom:'1px solid var(--line-soft)',background:on?'var(--surface-sunk)':'transparent',position:'relative'}}>
{on&&<span style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:'var(--gold)'}}/>}
<Avatar name={t.n} size={30}/>
<span className="grow" style={{minWidth:0}}><span className="row" style={{justifyContent:'space-between',gap:8}}><span className="trunc" style={{fontWeight:600,fontSize:13.2}}>{t.n}</span><span className="sub" style={{flex:'none'}}>{t.t}</span></span>
<span className="sub trunc" style={{display:'block'}}>{t.role}</span>
<span className="trunc" style={{display:'block',fontSize:12.4,color:t.unread?'var(--ink)':'var(--ink-3)',fontWeight:t.unread?600:400,marginTop:2}}>{t.pre}</span></span>
{t.unread&&<span style={{width:7,height:7,borderRadius:'50%',background:'var(--gold)',marginTop:5,flex:'none'}}/>}</button>})}</div></div>

<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
<div className="row" style={{padding:'12px 16px',borderBottom:'1px solid var(--line-soft)',gap:12}}>
<div className="tile" style={{background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.mail size={16}/></div>
<div className="grow" style={{minWidth:0}}><div style={{fontWeight:600,fontSize:14}} className="trunc">{c.n}</div><div className="sub trunc">Email · {c.email}</div></div>
<div className="row" style={{gap:6}}>{['clock','doc','bell','dots'].map(k=><button key={k} className="btn btn-s" style={{width:30,padding:0,justifyContent:'center'}}>{React.createElement(Ic[k],{size:14})}</button>)}
<button className="btn btn-s" onClick={()=>setPanel(!panel)} style={{width:30,padding:0,justifyContent:'center'}}><Ic.users size={14}/></button></div></div>
<div style={{flex:1,overflow:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:12,background:'var(--canvas)'}}>
{CV.msgs.map((m,i)=><div key={i} style={{alignSelf:m.me?'flex-end':'flex-start',maxWidth:'86%'}}>
<div className="row" style={{gap:8,marginBottom:5,justifyContent:m.me?'flex-end':'flex-start'}}>
{m.paige&&<span className="pill pill-v"><Ic.spark size={11}/>Paige draft</span>}
<span className="sub">{m.who} · {m.t}</span></div>
<div style={{background:m.me?'var(--ink)':'var(--surface)',color:m.me?'var(--ink-inv)':'var(--ink-2)',border:m.me?'0':'1px solid '+(m.paige?'var(--violet-line)':'var(--line)'),
padding:'13px 16px',borderRadius:m.me?'16px 16px 5px 16px':'5px 16px 16px 16px',fontSize:13.3,lineHeight:1.6,whiteSpace:'pre-wrap'}}>
<div style={{fontWeight:600,marginBottom:6,color:m.me?'#fff':'var(--ink)'}}>{m.subj}</div>{m.body}
{m.paige&&<div className="row" style={{gap:7,marginTop:12}}><button className="btn btn-s btn-p"><Ic.check size={12}/>Approve & send</button><button className="btn btn-s">Edit</button></div>}</div></div>)}</div>
<div style={{padding:'12px 16px 14px',borderTop:'1px solid var(--line-soft)',display:'grid',gap:9}}>
<div className="row" style={{gap:9,padding:'8px 12px',border:'1px solid var(--line)',borderRadius:10,background:'var(--surface-2)'}}>
<Ic.mail size={14} style={{color:'var(--ink-3)'}}/><span style={{fontSize:12.7,fontWeight:500}}>Paige email</span><span className="sub trunc">meridian-advisory@mail.paigeagent.ai</span><Ic.chev size={13} style={{marginLeft:'auto',color:'var(--ink-3)'}}/></div>
<input placeholder="Subject" style={{height:36,border:'1px solid var(--line)',borderRadius:10,padding:'0 12px',background:'var(--surface)',color:'var(--ink)',fontFamily:'inherit',fontSize:13.2,outline:'none'}}/>
<div className="row" style={{alignItems:'stretch',gap:9}}>
<textarea placeholder={'Reply to '+c.n+'…  (drop a file to attach)'} style={{flex:1,minHeight:74,resize:'none',border:'1px solid var(--line)',borderRadius:10,padding:'10px 12px',background:'var(--surface)',color:'var(--ink)',fontFamily:'inherit',fontSize:13.2,outline:'none',lineHeight:1.55}}/>
<button className="btn" style={{height:'auto',padding:'0 20px',background:'var(--gold-bright)',borderColor:'var(--gold-bright)',color:'#2A1C00',fontWeight:600}}><Ic.send size={15}/>Send</button></div>
<div className="row" style={{gap:8,flexWrap:'wrap'}}>
<button className="btn btn-s"><Ic.plus size={13}/>Attach</button><button className="btn btn-s"><Ic.pulse size={13}/>Dictate</button>
<button className="btn btn-s" style={{background:'var(--violet-tint)',borderColor:'var(--violet-line)',color:'var(--violet)'}}><Ic.spark size={13}/>Draft with Paige</button>
<button className="btn btn-s"><Ic.clock size={13}/>Schedule</button>
<span className="sub" style={{marginLeft:'auto'}}>To {c.email}</span></div></div></div>

{panel&&<div className="card ctc" style={{overflow:'auto',minHeight:0}}>
<div className="hd"><h3>Contact</h3><button className="btn btn-s" onClick={()=>setPanel(false)} style={{width:28,padding:0,justifyContent:'center'}}><Ic.x size={13}/></button></div>
<div style={{padding:'16px 18px',display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:16}}>
<div className="row" style={{gap:12}}><Avatar name={c.n} size={42}/><div className="grow" style={{minWidth:0}}>
<div style={{fontWeight:600,fontSize:14.5}} className="trunc">{c.n}</div><div className="sub trunc">{c.role}</div></div></div>
<div className="row" style={{gap:7,flexWrap:'wrap'}}><span className="pill pill-ok"><span className="dot"/>Active</span><span className="pill pill-n">{c.state}</span><span className="pill pill-n">{c.tenure}</span></div>
<div><div className="eyebrow">Owner</div><div className="row" style={{marginTop:6,gap:9,padding:'8px 11px',border:'1px solid var(--line)',borderRadius:10}}><Avatar name={c.owner} size={22}/><span style={{fontSize:13}}>{c.owner}</span><Ic.chev size={13} style={{marginLeft:'auto',color:'var(--ink-3)'}}/></div></div>
<div><div className="eyebrow">Reach them</div><div style={{display:'grid',gap:7,marginTop:6}}>
<div className="row" style={{gap:9,fontSize:12.8}}><Ic.mail size={14} style={{color:'var(--ink-3)'}}/><span className="trunc">{c.email}</span></div>
<div className="row" style={{gap:9,fontSize:12.8}}><Ic.pulse size={14} style={{color:'var(--ink-3)'}}/><span className="mono">{c.phone}</span></div></div></div>
<div style={{padding:'12px 13px',background:'var(--violet-tint)',border:'1px solid var(--violet-line)',borderRadius:'var(--r-m)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:11,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige on this thread</div>
<div style={{fontSize:12.7,color:'var(--ink-2)',marginTop:6,lineHeight:1.55}}>Two open questions in her last message. Sentiment is warm. She replies fastest in the morning — send before 10am.</div></div>
<div><div className="eyebrow">Tags</div><div className="row" style={{gap:7,marginTop:6,flexWrap:'wrap'}}><span className="pill pill-n">BUILD phase</span><span className="pill pill-n">Referral</span>
<button className="pill pill-n" style={{cursor:'pointer',borderStyle:'dashed'}}><Ic.plus size={11}/>Add tag</button></div></div>
<div className="seg" style={{width:'100%'}}>{['Details','DND','Actions'].map((t,i)=><button key={t} aria-pressed={i===0} style={{flex:1}}>{t}</button>)}</div></div></div>}</div>};

const ManualActions=()=>(<div className="card tbl"><div style={{minWidth:560}}><div className="hd"><div><h3>Manual actions</h3><div className="sub">Steps Paige can't take alone — she keeps the queue honest</div></div><button className="btn btn-s"><Ic.plus size={13}/>Add action</button></div>
{CV.manual.map((m,i)=><div key={i} className="row" style={{padding:'13px 20px',borderTop:'1px solid var(--line-soft)',gap:12}}>
<span className="tile" style={{width:20,height:20,borderRadius:6,border:'1.5px solid var(--line)'}}/>
<span className="grow" style={{fontSize:13.3,fontWeight:500}}>{m.t}</span>
<span className="sub" style={{flex:'0 0 120px'}}>{m.who}</span>
<span className="mono sub" style={{flex:'0 0 80px'}}>{m.due}</span>
<span className={'pill '+(m.state==='Open'?'pill-n':'pill-warn')} style={{flex:'none'}}>{m.state}</span></div>)}</div></div>);

const Snippets=()=>(<div className="g3">
{CV.snippets.map((s,i)=><div key={i} className="card" style={{padding:'15px 17px',display:'flex',flexDirection:'column',gap:9}}>
<div className="row" style={{justifyContent:'space-between',gap:10}}><span style={{fontWeight:600,fontSize:13.4}}>{s.t}</span><span className="mono sub">{s.use} uses</span></div>
<div style={{fontSize:12.7,color:'var(--ink-2)',lineHeight:1.55,flex:1}}>{s.body}</div>
<div className="row" style={{gap:7}}><button className="btn btn-s">Insert</button><button className="btn btn-s">Edit</button>
<button className="btn btn-s" style={{marginLeft:'auto',color:'var(--violet)'}}><Ic.spark size={12}/>Rewrite in my voice</button></div></div>)}
<button className="card" style={{padding:'15px 17px',border:'1px dashed var(--line)',background:'none',display:'grid',placeItems:'center',color:'var(--ink-3)',minHeight:130}}>
<span className="row" style={{gap:7,fontSize:13}}><Ic.plus size={15}/>New snippet</span></button></div>);

const TriggerLinks=()=>(<div className="card tbl"><div style={{minWidth:640}}><div className="hd"><div><h3>Trigger links</h3><div className="sub">A click starts the sequence that owns it</div></div><button className="btn btn-s"><Ic.plus size={13}/>New link</button></div>
<div className="row" style={{padding:'10px 20px',background:'var(--surface-2)',borderTop:'1px solid var(--line)',borderBottom:'1px solid var(--line)',fontSize:11,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)',fontWeight:600}}>
<span className="grow">Link</span><span style={{flex:'0 0 90px',textAlign:'right'}}>Clicks</span><span style={{flex:'0 0 110px',textAlign:'right'}}>Converts</span><span style={{flex:'0 0 60px'}}/></div>
{CV.links.map((l,i)=><div key={i} className="row" style={{padding:'13px 20px',borderBottom:i<CV.links.length-1?'1px solid var(--line-soft)':'0',gap:12}}>
<span className="grow" style={{minWidth:0}}><span style={{fontSize:13.3,fontWeight:500,display:'block'}}>{l.t}</span><span className="mono sub trunc" style={{display:'block'}}>{l.dest}</span></span>
<span className="mono" style={{flex:'0 0 90px',textAlign:'right',fontSize:13.2}}>{l.clicks.toLocaleString()}</span>
<span className="mono" style={{flex:'0 0 110px',textAlign:'right',fontSize:13.2,fontWeight:600,color:parseInt(l.conv)>50?'var(--ok)':'var(--ink)'}}>{l.conv}</span>
<span style={{flex:'0 0 60px',textAlign:'right'}}><button className="btn btn-s">Copy</button></span></div>)}</div></div>);

const ConvoAnalytics=()=>(<div className="g4">
{[['Median first reply','1h 12m','−22m',true],['Threads awaiting you','4','2 over 24h',false],['Paige drafts approved','89%','+4%',true],['Messages this week','218','+31',true]].map(([k,v,d,up],i)=>
<div key={i} className="card" style={{padding:'16px 18px'}}><div className="eyebrow">{k}</div>
<div className="row" style={{gap:8,alignItems:'baseline',marginTop:5}}><span style={{fontSize:24,fontWeight:600,letterSpacing:'-.03em'}}>{v}</span>
<span style={{fontSize:12,fontWeight:600,color:up?'var(--ok)':'var(--warn)'}}>{d}</span></div></div>)}
<div className="card" style={{gridColumn:'1 / -1',padding:'15px 18px',fontSize:13,color:'var(--ink-2)',lineHeight:1.6}}>
<span style={{fontWeight:600,color:'var(--ink)'}}>Paige's read: </span>Reply time improved after you turned on drafts, but four threads have sat past a day. Raising Client Success to Act with notice would have cleared three of them without you opening the tab.</div></div>);

const ConvoSettings=()=>(<div className="two">
<div className="card"><div className="hd"><h3>Sending</h3></div><div style={{padding:'6px 20px 16px'}}>
{[['Paige email address','meridian-advisory@mail.paigeagent.ai'],['Custom domain','Not connected — optional'],['SPF / DKIM / DMARC','All passing'],['Daily send cap','400 per domain'],['Signature','Jordan Avery · Meridian Advisory']].map(([k,v],i)=>
<div key={i} className="row" style={{padding:'12px 0',borderBottom:i<4?'1px solid var(--line-soft)':'0',gap:12}}>
<span className="grow" style={{fontSize:13.2}}>{k}</span><span className="sub trunc" style={{maxWidth:220,textAlign:'right'}}>{v}</span><Ic.chev size={13} style={{color:'var(--ink-3)'}}/></div>)}</div></div>
<div className="card"><div className="hd"><h3>How Paige behaves here</h3></div><div style={{padding:'6px 20px 16px'}}>
{[['Draft replies automatically',true],['Send without approval',false],['Suggest snippets while typing',true],['Flag sentiment drops',true],['Chase unanswered threads after 3 days',true]].map(([k,on],i)=>
<div key={i} className="row" style={{padding:'12px 0',borderBottom:i<4?'1px solid var(--line-soft)':'0',gap:12}}>
<span className="grow" style={{fontSize:13.2}}>{k}</span>
<span style={{width:34,height:20,borderRadius:99,background:on?'var(--violet)':'var(--surface-sunk)',padding:2,display:'flex',justifyContent:on?'flex-end':'flex-start'}}>
<span style={{width:16,height:16,borderRadius:'50%',background:'#fff',boxShadow:'var(--sh-1)'}}/></span></div>)}</div></div></div>);

const Conversations=()=>{const[tab,setTab]=React.useState('inbox');
const tabs=[['inbox','Conversations',()=><Ic.mail size={15}/>,2],['manual','Manual Actions',()=><Ic.check size={15}/>],['snip','Snippets',()=><Ic.doc size={15}/>],
['links','Trigger Links',()=><Ic.bolt size={15}/>],['an','Analytics',()=><Ic.chart size={15}/>],['set','Settings',()=><Ic.gear size={15}/>]];
const body={inbox:<Inbox2/>,manual:<ManualActions/>,snip:<Snippets/>,links:<TriggerLinks/>,an:<ConvoAnalytics/>,set:<ConvoSettings/>}[tab];
return <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0}}>
<div className="row" style={{marginBottom:14,justifyContent:'space-between',gap:14,flexWrap:'wrap',flex:'none',minWidth:0}}>
<div className="tabstrip"><SubTabs tabs={tabs} cur={tab} set={setTab} under/></div>
<div className="row" style={{gap:9}}><button className="btn btn-s"><Ic.filter size={13}/>All channels</button><button className="btn btn-s"><Ic.users size={13}/>All conversations</button></div></div>
<div key={tab} className="fade-in" style={{flex:1,minHeight:0,overflow:tab==='inbox'?'hidden':'auto'}}>{body}</div></div>};

const Delivery=()=>(<div className="card tbl"><div style={{minWidth:700}}><div className="hd"><div><h3>What you owe clients</h3><div className="sub">Milestones in flight, and who is holding each one</div></div>
<div className="row" style={{gap:9}}><button className="btn btn-s"><Ic.filter size={13}/>This month</button><button className="btn btn-s btn-p"><Ic.plus size={13}/>New milestone</button></div></div>
{CV.delivery.map((d,i)=>{const tone=d.state==='Blocked'?'pill-bad':d.state==='Slipping'?'pill-warn':d.state==='Ready for review'?'pill-v':'pill-ok';
return <div key={i} className="row" style={{padding:'14px 20px',borderTop:'1px solid var(--line-soft)',gap:14}}>
<span className="row" style={{flex:'1 1 230px',gap:11,minWidth:0}}><Avatar name={d.c} size={28}/>
<span style={{minWidth:0}}><span className="trunc" style={{fontWeight:600,fontSize:13.3,display:'block'}}>{d.ms}</span><span className="sub trunc" style={{display:'block'}}>{d.c} · {d.owner}</span></span></span>
<span className="row" style={{flex:'0 0 170px',gap:10}}><span style={{flex:1,height:7,borderRadius:4,background:'var(--surface-sunk)'}}>
<span style={{display:'block',width:d.prog+'%',height:'100%',borderRadius:4,background:d.state==='Blocked'?'var(--bad)':d.state==='Slipping'?'var(--warn)':'var(--ok)'}}/></span>
<span className="mono sub" style={{width:32,textAlign:'right'}}>{d.prog}%</span></span>
<span className="mono sub" style={{flex:'0 0 70px',textAlign:'right'}}>{d.due}</span>
<span style={{flex:'0 0 130px',textAlign:'right'}}><span className={'pill '+tone}>{d.state}</span></span></div>})}
<div style={{padding:'13px 20px',borderTop:'1px solid var(--line)',background:'var(--surface-2)',fontSize:12.9,color:'var(--ink-2)'}}>
<span style={{fontWeight:600,color:'var(--ink)'}}>Paige: </span>Ridgeline slipped because the DNS handoff has sat on their side since Monday. Nudge drafted for Marcus, and Bellweather is ready for your review.
<button className="btn btn-s" style={{marginLeft:12}}>Open both</button></div></div></div>);

const Portal=()=>(<div className="two-w">
<div className="card tbl"><div style={{minWidth:560}}><div className="hd"><div><h3>Client portal access</h3><div className="sub">Your brand, their workspace</div></div><button className="btn btn-s">Portal settings</button></div>
<div className="row" style={{padding:'10px 20px',background:'var(--surface-2)',borderTop:'1px solid var(--line)',borderBottom:'1px solid var(--line)',fontSize:11,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)',fontWeight:600}}>
<span className="grow">Client</span><span style={{flex:'0 0 60px',textAlign:'right'}}>Seats</span><span style={{flex:'0 0 70px',textAlign:'right'}}>Docs</span>
<span style={{flex:'0 0 90px',textAlign:'right'}}>Tasks</span><span style={{flex:'0 0 110px',textAlign:'right'}}>Last seen</span></div>
{CV.portal.map((p,i)=><div key={i} className="row" style={{padding:'13px 20px',borderBottom:i<CV.portal.length-1?'1px solid var(--line-soft)':'0',gap:12}}>
<span className="row grow" style={{gap:10,minWidth:0}}><Avatar name={p.c} size={26}/><span className="trunc" style={{fontSize:13.3,fontWeight:500}}>{p.c}</span>
<span className={'pill '+(p.state==='Dormant'?'pill-warn':p.state==='Onboarding'?'pill-v':'pill-ok')}>{p.state}</span></span>
<span className="mono sub" style={{flex:'0 0 60px',textAlign:'right'}}>{p.seats}</span>
<span className="mono sub" style={{flex:'0 0 70px',textAlign:'right'}}>{p.docs}</span>
<span className="mono" style={{flex:'0 0 90px',textAlign:'right',fontSize:13}}>{p.tasks}</span>
<span className="sub" style={{flex:'0 0 110px',textAlign:'right'}}>{p.active}</span></div>)}</div></div>
<div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:16}}>
<div className="card"><div className="hd"><h3>What they see</h3><span className="pill pill-n">Preview</span></div>
<div style={{padding:16}}><div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
<div className="row" style={{gap:9,padding:'11px 13px',background:'var(--rail)',color:'#fff'}}><Logo size={18}/><span style={{fontSize:12.5,fontWeight:600}}>Meridian Advisory</span>
<span className="pill" style={{marginLeft:'auto',background:'rgba(255,255,255,.12)',color:'#fff'}}>Client</span></div>
<div style={{padding:13,display:'grid',gap:9,background:'var(--surface-2)'}}>
{[['Your next task','Upload your brand assets'],['Phase','Foundation · step 2 of 6'],['Your contact','Jordan Avery']].map(([k,v],i)=>
<div key={i} style={{padding:'10px 12px',background:'var(--surface)',border:'1px solid var(--line)',borderRadius:10}}>
<div className="eyebrow" style={{fontSize:10}}>{k}</div><div style={{fontSize:12.8,marginTop:3,fontWeight:500}}>{v}</div></div>)}</div></div>
<div className="sub" style={{marginTop:11}}>Logo, colors, and domain are yours. Paige answers their questions inside the portal at the autonomy you set.</div></div></div>
<div className="card" style={{padding:'15px 17px',background:'var(--gold-tint)',borderColor:'var(--gold-line)'}}>
<div className="row" style={{gap:7,color:'var(--gold)',fontWeight:600,fontSize:12.5}}><Ic.bolt size={14}/>Selby has not logged in for 19 days</div>
<div style={{fontSize:12.7,color:'var(--ink-2)',marginTop:6,lineHeight:1.5}}>Portal silence is the earliest churn signal you have. Paige drafted a reset note and a one-click access reset.</div>
<button className="btn btn-s" style={{marginTop:11}}>Open the draft</button></div></div></div>);

export const ClientsHub=({openPaige})=>{const[tab,setTab]=useSubtabRoute("solo","clients","people");
const tabs=[['people','People',()=><Ic.users size={15}/>],['pipe','Pipeline',()=><Ic.trend size={15}/>],['convo','Conversations',()=><Ic.mail size={15}/>,2],
['deliv','Delivery',()=><Ic.doc size={15}/>],['portal','Client Portal',()=><Ic.store size={15}/>]];
const titles={convo:['Conversations','Every thread, every channel, one place — and Paige drafting inside it.'],
deliv:['Delivery','What you promised, where it stands, who is holding it.'],portal:['Client Portal','What your clients see when they log in.']};
return <div style={{display:'flex',flexDirection:'column',height:'100%',minWidth:0,alignItems:'stretch'}}>
<SubTabs tabs={tabs} cur={tab} set={setTab}/>
{tab==='people'?<Clients openPaige={openPaige}/>:tab==='pipe'?<Pipeline/>:
tab==='convo'?
<div style={{flex:1,minHeight:0,display:'flex',flexDirection:'column',width:'100%',maxWidth:1440,margin:'0 auto',padding:'20px 30px 24px'}}>
<div className="row" style={{flex:'none',alignItems:'flex-end',gap:20,flexWrap:'wrap',marginBottom:14}}>
<div className="grow"><div className="eyebrow">Clients</div>
<h1 style={{fontSize:23,letterSpacing:'-.032em',marginTop:3}}>Conversations</h1></div>
<p className="sub" style={{maxWidth:420,textAlign:'right'}}>Every thread, every channel, one console — and Paige drafting inside it.</p></div>
<div style={{flex:1,minHeight:0}}><Conversations/></div></div>:
<Wrap><PageHead eyebrow="Clients" title={titles[tab][0]} sub={titles[tab][1]}/>
{tab==='deliv'?<Delivery/>:<Portal/>}</Wrap>}</div>};

export { Inbox, Conversations, Delivery, Portal, ManualActions, Snippets, TriggerLinks, ConvoAnalytics, ConvoSettings };
