// @ts-nocheck
import React from "react";
import { Ic, PageHead, SubTabs } from "./_shared";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";

const IG_CATS=[['all','All'],['pay','Payments & billing'],['comm','Communication'],['cal','Calendar & meetings'],['crm','CRM & funnels'],['ads','Ads & analytics'],['fin','Accounting'],['store','Storage & docs'],['auto','Automation']];
export const IG=[
 {id:'stripe',n:'Stripe',cat:'pay',by:'Stripe, Inc.',st:'on',sync:'4m ago',health:'ok',ic:'vault',c:'#635BFF',
  d:'Charges, subscriptions, and webhook failures. Feeds Finance so a decline gets chased the same day.',
  scopes:['Read charges and subscriptions','Read customer records','Receive webhook events'],
  gives:['Revenue and MRR in Analytics','Failed-charge detection in Systems Check','SaaS subscription discovery in Business Vault'],
  events:[['invoice.payment_failed · Ridgeline Co.','11h ago','warn'],['charge.succeeded · Bellweather Co.','2h ago','ok'],['customer.subscription.updated','6h ago','ok']]},
 {id:'gcal',n:'Google Calendar',cat:'cal',by:'Google',st:'on',sync:'1m ago',health:'ok',ic:'clock',c:'#4285F4',
  d:'Your real availability, plus the meetings Paige books and the ones clients keep rescheduling.',
  scopes:['Read and write calendar events','Read free/busy'],
  gives:['Show-rate tracking','Reschedule detection on at-risk accounts','Booking without double-booking you'],
  events:[['Event created · Northwind kickoff','4h ago','ok'],['Reschedule detected · Ridgeline','1d ago','warn']]},
 {id:'gmail',n:'Gmail',cat:'comm',by:'Google',st:'on',sync:'2m ago',health:'ok',ic:'mail',c:'#EA4335',
  d:'Threads land in Conversations. Paige drafts under your address and never sends without the autonomy you set.',
  scopes:['Read messages and threads','Send on your behalf','Read contacts'],
  gives:['Every client thread in one console','Reply-time analytics','Sentiment and silence detection'],
  events:[['12 threads synced','2m ago','ok'],['Draft created · Harper & Vale','3h ago','ok']]},
 {id:'ga4',n:'Google Analytics 4',cat:'ads',by:'Google',st:'update',sync:'12m ago',health:'warn',ic:'chart',c:'#F9AB00',
  d:'Watches the event stream for what silently stops firing and tells Systems Check the moment one does.',
  scopes:['Read reporting data','Read event definitions'],
  gives:['Event health monitoring','Attribution normalization','Funnel drop-off analysis'],
  events:[['call_booked — no events in 6 days','14m ago','bad'],['11 of 12 events receiving','14m ago','warn']]},
 {id:'meta',n:'Meta Business',cat:'ads',by:'Meta Platforms',st:'attn',sync:'3h ago',health:'bad',ic:'trend',c:'#0866FF',
  d:'Ad spend, lead events, and pixel health across your accounts.',
  scopes:['Read ad accounts and insights','Manage pixels','Read lead forms'],
  gives:['Cost-per-client by campaign','Pixel firing checks','Conversions API backfill'],
  events:[['Pixel missing on /book-a-call','14m ago','bad'],['Spend $40/day · within cap','3h ago','ok']]},
 {id:'ghl',n:'GoHighLevel',cat:'crm',by:'HighLevel',st:'on',sync:'1d ago',health:'ok',ic:'store',c:'#2A9D8F',
  d:'Reads and writes inside the funnels you already pay for. Nothing has to move before it earns the move.',
  scopes:['Read and write contacts','Read funnels and forms','Trigger workflows'],
  gives:['6 funnels imported','Two-way contact sync','Form submissions routed to threads'],
  events:[['Contact sync · 84 records','1d ago','ok']]},
 {id:'kaj',n:'Kajabi',cat:'crm',by:'Kajabi',st:'on',sync:'2h ago',health:'ok',ic:'doc',c:'#0C5C4C',
  d:'Courses, memberships, and the offers attached to them.',
  scopes:['Read products and offers','Read member activity'],
  gives:['Offer catalog in Growth','Member progress signal','Churn risk from course inactivity'],
  events:[['4 offers, 2 funnels synced','2h ago','ok']]},
 {id:'twilio',n:'Twilio',cat:'comm',by:'Twilio',st:'on',sync:'8m ago',health:'ok',ic:'pulse',c:'#F22F46',
  d:'SMS from your own number, including the reminder sequences that lift your show rate.',
  scopes:['Send and receive SMS','Read message status'],
  gives:['SMS channel in Conversations','Two-touch call reminders','Delivery receipts'],
  events:[['Reminder sent · Tashia Anderson','8m ago','ok']]},
 {id:'qbo',n:'Ledgerly Pro',cat:'fin',by:'Ledgerly',st:'off',sync:null,health:null,ic:'chart',c:'#2CA01C',
  d:'Books, expenses, and the contractor records the January filings need.',
  scopes:['Read accounts and transactions','Read vendor records'],
  gives:['True margin per client','Contractor 1099 tracking','Expense categories in Analytics'],events:[]},
 {id:'drive',n:'Google Drive',cat:'store',by:'Google',st:'off',sync:null,health:null,ic:'doc',c:'#1FA463',
  d:'Point Paige at a folder and she indexes what is in it into the right knowledge domain.',
  scopes:['Read selected folders'],gives:['Bulk knowledge import','Document citations','Contract discovery for Business Vault'],events:[]},
 {id:'zap',n:'Zapier',cat:'auto',by:'Zapier',st:'off',sync:null,health:null,ic:'bolt',c:'#FF4F00',
  d:'For the tools with no direct bridge yet. Paige triggers Zaps and reads their results.',
  scopes:['Trigger Zaps','Read Zap history'],gives:['Long-tail tool coverage','Custom triggers'],events:[]},
 {id:'slack',n:'Slack',cat:'comm',by:'Salesforce',st:'soon',sync:null,health:null,ic:'users',c:'#611F69',
  d:'Paige posts the morning brief and the things that need you into a channel you choose.',
  scopes:['Post to channels','Read channel membership'],gives:['Daily brief in Slack','Approval buttons in-channel'],events:[]},
 {id:'wf',n:'Webflow',cat:'crm',by:'Webflow',st:'on',sync:'12m ago',health:'ok',ic:'grid',c:'#146EF5',
  d:'Watches your marketing site for pages that break, slow down, or lose their tracking.',
  scopes:['Read site structure','Read publish events'],
  gives:['18 pages watched','Publish-triggered Systems Check','Broken-link detection'],
  events:[['Publish detected · /q4-pricing','8h ago','ok'],['404 found · /teardown-13','8h ago','warn']]}];

const IgLogo=({app,size=42})=>(<div style={{width:size,height:size,borderRadius:size*.26,flex:'none',display:'grid',placeItems:'center',
background:app.c+'1a',border:'1px solid '+app.c+'33',color:app.c}}>{React.createElement(Ic[app.ic],{size:size*.46})}</div>);
const IG_ST={on:['pill-ok','Connected'],update:['pill-warn','Needs update'],attn:['pill-bad','Needs attention'],off:['pill-n','Not connected'],soon:['pill-n','Coming soon']};

const IgDrawer=({app,state,onToggle,onClose})=>(<><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(23,19,49,.36)',backdropFilter:'blur(3px)',zIndex:80}}/>
<aside className="fade-in" style={{position:'fixed',top:0,right:0,bottom:0,width:'min(540px,96vw)',background:'var(--surface)',borderLeft:'1px solid var(--line)',boxShadow:'var(--sh-3)',zIndex:81,overflow:'auto'}}>
<div className="row" style={{padding:'18px 22px',borderBottom:'1px solid var(--line)',gap:14,position:'sticky',top:0,background:'var(--surface)',zIndex:2}}>
<IgLogo app={app} size={46}/>
<div className="grow" style={{minWidth:0}}><div className="trunc" style={{fontWeight:600,fontSize:15.5,letterSpacing:'-.02em'}}>{app.n}</div>
<div className="sub trunc">{app.by} · {IG_CATS.find(c=>c[0]===app.cat)[1]}</div></div>
<button className="btn btn-s" onClick={onClose} style={{width:30,height:30,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.x size={14}/></button></div>
<div style={{padding:'18px 22px 28px',display:'grid',gap:22}}>
<div className="row" style={{gap:10,flexWrap:'wrap'}}>
<span className={'pill '+IG_ST[state][0]}>{state==='on'&&<span className="dot"/>}{IG_ST[state][1]}</span>
{app.sync&&<span className="mono sub">Synced {app.sync}</span>}
<div className="row" style={{gap:8,marginLeft:'auto'}}>
{state==='soon'?<span className="pill pill-n"><Ic.clock size={11}/>On the roadmap</span>
:state==='off'?<button onClick={onToggle} className="btn btn-p"><Ic.plus size={14}/>Connect</button>
:<><button onClick={onToggle} className="btn btn-s">Disconnect</button><button className="btn btn-s"><Ic.pulse size={13}/>Sync now</button></>}</div></div>
<p style={{fontSize:13.6,color:'var(--ink-2)',lineHeight:1.65}}>{app.d}</p>
<div><div className="eyebrow">What it gives Paige</div>
<div style={{display:'grid',gap:8,marginTop:9}}>{app.gives.map((g,i)=>
<div key={i} className="row" style={{gap:10,fontSize:13,color:'var(--ink-2)',alignItems:'flex-start'}}>
<span style={{color:'var(--ok)',display:'flex',marginTop:2}}><Ic.check size={14}/></span>{g}</div>)}</div></div>
<div><div className="eyebrow">Access it needs</div>
<div style={{marginTop:9,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{app.scopes.map((s,i)=><div key={i} className="row" style={{gap:10,padding:'11px 13px',borderTop:i?'1px solid var(--line-soft)':'0',fontSize:12.8}}>
<Ic.shield size={14} style={{color:'var(--ink-3)'}}/><span className="grow">{s}</span><span className="pill pill-n">Required</span></div>)}</div>
<div className="sub" style={{marginTop:8}}>Access is read-first. Anything that writes still obeys the autonomy you set for that department.</div></div>
{app.events.length>0&&<div><div className="eyebrow">Recent events</div>
<div style={{marginTop:9,display:'grid',gap:0}}>{app.events.map(([t,w,k],i)=>
<div key={i} className="row" style={{gap:11,padding:'10px 0',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',background:k==='bad'?'var(--bad)':k==='warn'?'var(--warn)':'var(--ok)'}}/>
<span className="grow mono" style={{fontSize:11.8,color:'var(--ink-2)'}}>{t}</span><span className="mono sub" style={{fontSize:11}}>{w}</span></div>)}</div></div>}
</div></aside></>);

export const Integrations=()=>{
const[cat,setCat]=React.useState('all');const[q,setQ]=React.useState('');const[view,setView]=useSubtabRoute("solo","integrations","cat");
const[states,setStates]=React.useState(()=>Object.fromEntries(IG.map(a=>[a.id,a.st])));
const[open,setOpen]=React.useState(null);
const on=IG.filter(a=>states[a.id]==='on').length;
const attn=IG.filter(a=>['attn','update'].includes(states[a.id]));
const list=IG.filter(a=>(cat==='all'||a.cat===cat)&&(a.n+' '+a.by+' '+a.d).toLowerCase().includes(q.toLowerCase()));
const toggle=id=>setStates(s=>({...s,[id]:s[id]==='off'?'on':'off'}));
return <div className="fade-in pg" style={{maxWidth:1440,margin:'0 auto',width:'100%'}}>
<PageHead eyebrow="Platform" title="Integrations"
sub="Paige works inside the tools you already pay for. Connect one and she gets sharper — nothing has to move."
right={<div className="row" style={{gap:9}}><span className="pill pill-ok"><span className="dot"/>{on} connected</span>
{attn.length>0&&<span className="pill pill-warn">{attn.length} need attention</span>}
<button className="btn btn-s"><Ic.gear size={14}/>API keys</button></div>}/>
<SubTabs under tabs={[['cat','Catalog',()=><Ic.store size={14}/>],['auto','Web Automator',()=><Ic.bolt size={14}/>],['act','Activity',()=><Ic.pulse size={14}/>]]} cur={view} set={setView}/>
<div className="pg-body">

{attn.length>0&&<div className="card" style={{padding:'14px 18px',marginBottom:16,borderColor:'var(--warn-tint)',background:'var(--warn-tint)'}}>
<div className="row" style={{gap:11,flexWrap:'wrap'}}>
<Ic.pulse size={16} style={{color:'var(--warn)'}}/>
<span className="grow" style={{fontSize:13,color:'var(--ink-2)',minWidth:220}}>
<strong style={{color:'var(--ink)'}}>Two connections are degraded. </strong>The Meta pixel stopped firing on one page and GA4 lost the matching event — one fix covers both.</span>
<button className="btn btn-s">Open Systems Check</button></div></div>}

{view==='cat'&&<div className="row" style={{gap:10,flexWrap:'wrap',marginBottom:16}}>
<div className="row card" style={{padding:'0 13px',height:34,gap:9,borderRadius:99,boxShadow:'none',color:'var(--ink-3)',flex:'0 1 250px',minWidth:0}}><Ic.search size={15}/>
<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search integrations" style={{border:0,background:'none',outline:'none',color:'var(--ink)',flex:1,minWidth:0,fontFamily:'inherit',fontSize:13}}/></div>
<div className="row tabstrip" style={{gap:6}}>{IG_CATS.map(([k,l])=>{const sel=cat===k;
return <button key={k} onClick={()=>setCat(k)} style={{flex:'none',height:30,padding:'0 12px',borderRadius:99,fontSize:12.3,fontWeight:sel?600:450,
background:sel?'var(--ink)':'var(--surface)',color:sel?'var(--ink-inv)':'var(--ink-2)',border:'1px solid '+(sel?'var(--ink)':'var(--line)')}}>{l}</button>})}</div></div>}

{view==='cat'&&<div className="g3">{list.map(a=>{const s=states[a.id];
return <div key={a.id} className="card" style={{padding:16,display:'flex',flexDirection:'column',gap:11}}>
<button onClick={()=>setOpen(a)} className="row" style={{gap:12,textAlign:'left',alignItems:'flex-start'}}>
<IgLogo app={a}/><span className="grow" style={{minWidth:0}}>
<span className="trunc" style={{fontWeight:600,fontSize:14.2,display:'block'}}>{a.n}</span>
<span className="sub trunc" style={{display:'block'}}>{a.by}</span></span>
<span className={'pill '+IG_ST[s][0]}>{s==='on'&&<span className="dot"/>}{IG_ST[s][1]}</span></button>
<div style={{fontSize:12.7,color:'var(--ink-2)',lineHeight:1.5,flex:1}}>{a.d}</div>
<div className="row" style={{justifyContent:'space-between',borderTop:'1px solid var(--line-soft)',paddingTop:11}}>
<span className="mono sub" style={{fontSize:11.5}}>{a.sync?'Synced '+a.sync:s==='soon'?'On the roadmap':'Not connected'}</span>
{s==='soon'?<span className="pill pill-n">Soon</span>
:<button onClick={()=>s==='off'?toggle(a.id):setOpen(a)} className="row" style={{gap:6,height:27,padding:'0 14px',borderRadius:99,fontWeight:700,fontSize:12.2,
background:s==='off'?'var(--violet)':'var(--surface-sunk)',color:s==='off'?'#fff':'var(--ink)'}}>{s==='off'?'Connect':'Manage'}</button>}</div></div>})}</div>}

{view==='auto'&&<div className="two-w">
<div className="card"><div className="hd"><div><h3>Web Automator</h3><div className="sub">For the tools with no API at all</div></div><span className="pill pill-v">Beta</span></div>
<div style={{padding:'15px 20px 18px',fontSize:13,color:'var(--ink-2)',lineHeight:1.6}}>
Where a vendor gives you no way in, Paige drives the interface at your direction — logging in with credentials you hold, taking the action, and recording what she did. She never improvises past the task you gave her.
<div style={{marginTop:13,display:'grid',gap:9}}>{[['State filing portal','Runs the annual report','Verified'],['Legacy vendor invoicing','Pulls monthly statements','Verified'],['Two ad platforms','Reads spend where the API is gated','Needs re-auth']].map(([n,d,s],i)=>
<div key={i} className="row" style={{gap:11,padding:'10px 12px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<Ic.bolt size={14} style={{color:'var(--ink-3)'}}/>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:12.9,fontWeight:500,display:'block'}}>{n}</span><span className="sub trunc" style={{display:'block'}}>{d}</span></span>
<span className={'pill '+(s==='Verified'?'pill-ok':'pill-warn')}>{s}</span></div>)}</div></div></div>
<div style={{display:'grid',gap:16,alignContent:'start'}}>
<div className="card" style={{padding:'16px 18px',background:'var(--rail)',borderColor:'var(--rail-line)'}}>
<div className="row" style={{gap:7,color:'var(--gold-bright)',fontSize:10.5,fontWeight:700,letterSpacing:'.16em',textTransform:'uppercase'}}><Ic.gear size={12}/>Build your own</div>
<h3 style={{color:'#fff',fontSize:16,marginTop:8,letterSpacing:'-.025em'}}>Bring any system in</h3>
<p style={{color:'var(--rail-text)',fontSize:12.9,marginTop:6,lineHeight:1.55}}>Issue a scoped API key, point a webhook at Paige, and she treats your system like any other connection.</p>
<div className="row" style={{gap:9,marginTop:13}}>
<button className="btn btn-s" style={{background:'var(--gold-bright)',borderColor:'var(--gold-bright)',color:'#2A1C00',fontWeight:600}}>Create API key</button>
<button className="btn btn-s" style={{background:'transparent',borderColor:'var(--rail-line)',color:'#fff'}}>Webhook docs</button></div></div></div></div>}

{view==='act'&&<div className="card"><div className="hd"><div><h3>Sync activity</h3><div className="sub">Every event Paige received, newest first</div></div><button className="btn btn-s">Full log</button></div>
<div style={{padding:'6px 0'}}>{[['Gmail','12 threads synced','2m ago','ok'],['Stripe','payment_failed · Ridgeline Co.','11h ago','warn'],['Meta','pixel missing on /book-a-call','14m ago','bad'],
['Webflow','publish detected · /q4-pricing','8h ago','ok'],['Twilio','reminder delivered · Tashia Anderson','8m ago','ok'],['GA4','call_booked — no events in 6 days','14m ago','bad'],
['Google Calendar','event created · Northwind kickoff','4h ago','ok'],['GoHighLevel','contact sync · 84 records','1d ago','ok'],['Kajabi','4 offers, 2 funnels synced','2h ago','ok']].map(([n,t,w,k],i)=>
<div key={i} className="row" style={{gap:11,padding:'11px 20px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',background:k==='bad'?'var(--bad)':k==='warn'?'var(--warn)':'var(--ok)'}}/>
<span style={{fontSize:12.8,fontWeight:500,flex:'0 0 120px'}} className="trunc">{n}</span>
<span className="grow mono trunc" style={{fontSize:11.6,color:'var(--ink-3)'}}>{t}</span><span className="mono sub" style={{fontSize:11}}>{w}</span></div>)}</div></div>}
</div>{open&&<IgDrawer app={open} state={states[open.id]} onToggle={()=>{toggle(open.id);setOpen(null)}} onClose={()=>setOpen(null)}/>}</div>};
