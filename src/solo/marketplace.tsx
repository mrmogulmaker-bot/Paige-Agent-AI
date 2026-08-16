// @ts-nocheck
import React from "react";
import { Ic, Avatar, PageHead, SubTabs } from "./_shared";

const MK_CATS=[['vert','Practice Verticals'],['play','Playbooks & Knowledge'],['cx','Client Experience'],['growth','Growth & Automation'],['data','Data & Bridges']];
const G=(a,b)=>'linear-gradient(145deg,'+a+' 0%,'+b+' 100%)';
export const MK=[
 {id:'biz',n:'Business Coaching',dev:'Paige Verticals',cat:'vert',tag:'Paige handles your business-coaching pipeline.',g:G('#5B3FD6','#8A72F5'),ic:'store',rate:4.8,cnt:412,size:'Playbook preset',state:'get',age:'All practices',
  d:'A Playbook preset for business and executive coaches — discovery intake, engagement milestones, and retainer follow-through, native to your practice. Your persona, your voice, and your client journey stay exactly as you set them.',
  adds:['12 intake questions tuned for exec coaching','Milestone cadence for 90-day engagements','Retainer renewal sequence','Session-notes to action-items converter'],
  perms:['Read your client threads','Draft messages for your approval','Write to your knowledge base'],
  new:'Adds a stalled-engagement detector and two new milestone templates.',feat:true},
 {id:'consult',n:'Consulting',dev:'Paige Verticals',cat:'vert',tag:'Paige runs your consulting engagements end to end.',g:G('#1F7A8C','#3FA6B8'),ic:'chart',rate:4.7,cnt:288,size:'Playbook preset',state:'get',age:'All practices',
  d:'A Playbook preset for consultants and advisors — scoping intake, engagement cadence, and outcome check-ins in your voice. She learns your deliverable shapes and holds the schedule.',
  adds:['Scoping intake with budget qualification','Weekly outcome check-in cadence','Deliverable tracker','Scope-creep flagging at 120% of budget'],
  perms:['Read your client threads','Draft messages for your approval','Read delivery milestones'],
  new:'Scope-creep flagging now cites the specific overage hours.'},
 {id:'fit',n:'Fitness Coaching',dev:'Paige Verticals',cat:'vert',tag:"Paige runs your fitness practice's client journey.",g:G('#B4529E','#E07AC0'),ic:'pulse',rate:0,cnt:0,size:'Playbook preset',state:'soon',age:'All practices',
  d:'A Playbook preset that tunes Paige for fitness and wellness coaches — client intake, program check-ins, and accountability follow-ups, in your voice.',
  adds:['Program check-in cadence','Accountability nudges','Intake with health screening'],perms:['Read your client threads','Draft messages for your approval'],new:null},
 {id:'fund',n:'Funding & Capital Raising',dev:'Project Mogul',cat:'play',tag:'The Borrower-to-Banker methodology.',g:G('#C9860C','#E9A83A'),ic:'vault',rate:4.9,cnt:1240,size:'Curriculum · 42 docs',state:'installed',age:'Funding coaches',
  d:'The complete funding and capital-raising coaching methodology: program sequence, phase framing, four-bureau business-credit progression, lender intelligence, and a compliance-first posture. Install it and Paige has a funding brain.',
  adds:['BUILD · STACK · FUND phase framing','Four-bureau progression logic','Lender intelligence by tier','Compliance-first language rules','18-step client sequence'],
  perms:['Read your client threads','Draft messages for your approval','Write to your knowledge base','Read financial connections'],
  new:'Lender tier data refreshed for Q3. Two new objection scripts.',feat:true,badge:'Included'},
 {id:'acct',n:'Accountability & Follow-Through',dev:'Paige Playbooks',cat:'play',tag:'Turn what happens in the session into what gets done between them.',g:G('#2E7D8F','#5BB5C4'),ic:'check',rate:4.6,cnt:196,size:'Playbook · 9 docs',state:'get',age:'All practices',
  d:"A practitioner's playbook for building between-session accountability, running a follow-through nudge cadence, and re-engaging clients who go quiet before it becomes churn.",
  adds:['Between-session nudge cadence','Quiet-client detection at 7, 14, 21 days','Commitment tracker per client'],
  perms:['Read your client threads','Draft messages for your approval'],new:'Nudge timing now adapts to each client’s reply pattern.'},
 {id:'ret',n:'Client Retention Playbook',dev:'Paige Playbooks',cat:'play',tag:'Keep the clients you already earned.',g:G('#1B7A52','#4CC48C'),ic:'shield',rate:4.8,cnt:341,size:'Playbook · 11 docs',state:'get',age:'All practices',
  d:'A field guide to catching at-risk clients before they churn and converting shaky engagements into renewals. Paige scores risk nightly and brings you the save, drafted.',
  adds:['Nightly risk scoring','Save-play library by risk cause','Renewal note templates, evidence-first'],
  perms:['Read your client threads','Read portal activity','Draft messages for your approval'],new:'Adds sentiment drift as a fourth risk signal.',feat:true},
 {id:'disc',n:'Discovery Call Mastery',dev:'Paige Playbooks',cat:'play',tag:'Turn the first conversation into a signed client.',g:G('#5B3FD6','#A692FF'),ic:'mail',rate:4.7,cnt:509,size:'Playbook · 14 docs',state:'get',age:'All practices',
  d:'A working system for running discovery calls that qualify hard, surface real problems, and convert to proposals fast. Includes the question ladder and the silence rules.',
  adds:['Qualifying question ladder','Problem-surfacing prompts','Same-day proposal generator'],
  perms:['Read your client threads','Draft messages for your approval','Read calendar'],new:'Adds a two-question pre-call qualifier for paid traffic.'},
 {id:'grp',n:'Group Program Facilitation',dev:'Paige Playbooks',cat:'play',tag:'Run a cohort so every seat feels like a front-row seat.',g:G('#8A5A9E','#B98BCE'),ic:'users',rate:4.5,cnt:132,size:'Playbook · 8 docs',state:'get',age:'Cohort programs',
  d:"A facilitator's playbook for onboarding cohorts, sustaining week-over-week engagement, and managing the quiet and dominant voices in group programs.",
  adds:['Cohort onboarding sequence','Weekly engagement pulse','Quiet-participant surfacing'],
  perms:['Read your client threads','Draft messages for your approval'],new:'Cohort pulse now reports per-week attendance drift.'},
 {id:'obj',n:'Objection Handling',dev:'Paige Playbooks',cat:'play',tag:'The objection is the client telling you what they need to hear next.',g:G('#B93E37','#EE7A72'),ic:'bolt',rate:4.9,cnt:604,size:'Playbook · 12 docs',state:'get',age:'All practices',
  d:'Field-tested playbooks for the objections every client-based practice hears, how to reframe stalling, and how to hold your price without caving.',
  adds:['31 objection scripts by category','Price-holding language','Stall reframes'],
  perms:['Draft messages for your approval','Read your client threads'],new:'Six new scripts for economic-uncertainty stalls.'},
 {id:'onb',n:'Client Onboarding Essentials',dev:'Paige Client Experience',cat:'cx',tag:'Give Paige a proven onboarding playbook.',g:G('#3F5BD6','#7A8FF0'),ic:'doc',rate:4.6,cnt:274,size:'Playbook · 7 docs',state:'installed',age:'All practices',
  d:'Seeds your knowledge base with a proven client-onboarding framework Paige uses to welcome, orient, and set expectations with every new client — for any practice.',
  adds:['Welcome sequence, 5 touches','Expectation-setting script','First-30-days plan generator'],
  perms:['Write to your knowledge base','Draft messages for your approval'],new:'Welcome sequence now personalizes from intake answers.'},
 {id:'theme',n:'Portal Theming',dev:'Paige Client Experience',cat:'cx',tag:'Make the client portal unmistakably yours.',g:G('#C9860C','#F2C97A'),ic:'grid',rate:0,cnt:0,size:'Extension',state:'soon',age:'All practices',
  d:'Custom skins, layouts, and module arrangements beyond logo and color. Build the portal your clients think you built from scratch.',
  adds:['Layout presets','Module arrangement','Custom skins'],perms:['Write portal configuration'],new:null},
 {id:'voice',n:'Voice Agent',dev:'Paige Client Experience',cat:'cx',tag:'Let clients talk to Paige.',g:G('#171331','#5B3FD6'),ic:'pulse',rate:0,cnt:0,size:'Extension',state:'soon',age:'All practices',
  d:'A voice-first Paige that answers, runs intakes, and follows up by phone under your brand. Same persona, same guardrails, now on the line.',
  adds:['Inbound answering','Voice intake','Call summaries into threads'],perms:['Place and receive calls','Write to your client threads'],new:null},
 {id:'auto',n:'Automations',dev:'Paige Growth',cat:'growth',tag:'Paige builds and runs your plays.',g:G('#1B7A52','#7EDCAE'),ic:'bolt',rate:0,cnt:0,size:'Extension',state:'soon',age:'All practices',
  d:'Describe an automation in plain language and Paige builds it on your connected workflow engine, then watches it run and reports what broke.',
  adds:['Plain-language builder','Run monitoring','Failure remediation'],perms:['Write to your workflow engine'],new:null},
 {id:'social',n:'Social Autopilot',dev:'Paige Growth',cat:'growth',tag:'She writes, schedules, and reports.',g:G('#B4529E','#F0A6D8'),ic:'trend',rate:4.4,cnt:88,size:'Extension',state:'get',age:'All practices',
  d:'Paige drafts posts in your voice, books the slot that historically performs, and tells you which format is actually earning replies.',
  adds:['Per-channel voice tuning','Best-slot scheduling','Format performance reporting'],
  perms:['Post to connected channels','Read channel analytics'],new:'Adds Instagram carousels and LinkedIn document posts.'},
 {id:'stripe',n:'Stripe Bridge',dev:'Paige Data',cat:'data',tag:'Revenue, declines, and dunning in one line.',g:G('#4C48D6','#8F8BF5'),ic:'vault',rate:4.9,cnt:820,size:'Bridge',state:'installed',age:'All practices',
  d:'Reads charges, subscriptions, and webhook failures, then feeds Finance so failed payments get chased the same day instead of the same quarter.',
  adds:['Charge and subscription sync','Webhook failure detection','Dunning triggers'],
  perms:['Read Stripe data','Trigger dunning sequences'],new:'Detects retry-queue stalls within 15 minutes.'},
 {id:'ghl',n:'GoHighLevel Bridge',dev:'Paige Data',cat:'data',tag:'Keep your funnels where they are.',g:G('#C9860C','#E9A83A'),ic:'store',rate:4.3,cnt:210,size:'Bridge',state:'update',age:'All practices',
  d:'Reads and writes inside the funnels you already pay for. Nothing has to move before it earns the move.',
  adds:['Funnel import','Two-way contact sync','Form submission routing'],
  perms:['Read and write GoHighLevel data'],new:'Two-way contact sync no longer duplicates on tag change.'},
 {id:'ga4',n:'GA4 Bridge',dev:'Paige Data',cat:'data',tag:'Event health, not vanity charts.',g:G('#2E7D8F','#6BC2D1'),ic:'chart',rate:4.6,cnt:305,size:'Bridge',state:'update',age:'All practices',
  d:'Watches your event stream for the things that silently stop firing, and tells Systems Check the moment one does.',
  adds:['Event health monitoring','Attribution normalization','Conversion backfill'],
  perms:['Read GA4 data'],new:'Adds UTM normalization at ingest.'}];

const FEAT=[
 {id:'fund',kick:'Now included on Solo',t:'Give Paige a funding brain',s:'The Borrower-to-Banker methodology, 42 documents, installed in one tap.',g:G('#3A2A08','#C9860C')},
 {id:'ret',kick:'Editors’ pick',t:'Catch churn three weeks early',s:'Nightly risk scoring, and the save already drafted in your voice.',g:G('#0B2A1E','#1B7A52')},
 {id:'disc',kick:'Most installed this month',t:'Run a discovery call that closes',s:'The question ladder, the silence rules, and a same-day proposal.',g:G('#1A1340','#5B3FD6')}];

const Icon=({app,size=56,r=14})=>(<div style={{width:size,height:size,borderRadius:r,background:app.g,display:'grid',placeItems:'center',flex:'none',
boxShadow:'inset 0 1px 0 rgba(255,255,255,.25), 0 6px 16px -6px rgba(23,19,49,.5)'}}>
{React.createElement(Ic[app.ic],{size:size*.44,style:{color:'#fff'}})}</div>);

const MkStars=({v,size=11})=>(<span className="row" style={{gap:1.5}}>{[1,2,3,4,5].map(i=>
<svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={v>=i-.5?'currentColor':'none'} stroke="currentColor" strokeWidth="1.6" style={{color:'var(--ink-3)'}}>
<path d="M12 3.6l2.6 5.6 6 .7-4.4 4.1 1.2 6-5.4-3-5.4 3 1.2-6L3.4 9.9l6-.7z"/></svg>)}</span>);

const GetBtn=({app,state,onGet,big}) =>{
if(app.state==='soon')return <span className="pill pill-n" style={{height:big?34:26,padding:big?'0 16px':'0 11px',borderRadius:99,fontWeight:600}}><Ic.clock size={big?13:11}/>Coming soon</span>;
if(state==='installing')return <span className="row" style={{gap:7,height:big?34:28,padding:'0 4px'}}>
<span style={{width:big?92:64,height:4,borderRadius:3,background:'var(--surface-sunk)',overflow:'hidden'}}>
<span style={{display:'block',height:'100%',background:'var(--violet)',animation:'ld 1.4s ease-in-out infinite',borderRadius:3}}/></span>
<span className="mono sub" style={{fontSize:11}}>Installing</span>
<style>{'@keyframes ld{0%{width:8%}60%{width:82%}100%{width:100%}}'}</style></span>;
const lbl=state==='installed'?'Open':state==='update'?'Update':'Get';
const prime=state!=='installed';
return <button onClick={e=>{e.stopPropagation();onGet()}} className="row" style={{gap:6,height:big?34:27,padding:big?'0 20px':'0 15px',borderRadius:99,fontWeight:700,fontSize:big?13.5:12.3,
background:prime?(state==='update'?'var(--gold-bright)':'var(--violet)'):'var(--surface-sunk)',color:prime?(state==='update'?'#2A1C00':'#fff'):'var(--ink)'}}>{lbl}</button>};

const Shot=({app,i,w=248,h=150})=>(<div style={{width:w,height:h,flex:'none',borderRadius:12,background:'#0C0A1B',border:'1px solid var(--line)',overflow:'hidden',position:'relative'}}>
<div style={{position:'absolute',inset:0,background:app.g,opacity:.16}}/>
<div style={{position:'relative',padding:12,display:'grid',gap:7}}>
<div className="row" style={{gap:7}}><Icon app={app} size={18} r={6}/><span style={{height:5,width:'42%',background:'rgba(255,255,255,.35)',borderRadius:3}}/></div>
{[0,1,2].map(j=><div key={j} style={{background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.09)',borderRadius:7,padding:8,display:'grid',gap:5}}>
<span style={{height:4,width:(60+((i+j)*13)%30)+'%',background:'rgba(255,255,255,.4)',borderRadius:3}}/>
<span style={{height:3,width:(80-((i+j)*9)%35)+'%',background:'rgba(255,255,255,.2)',borderRadius:3}}/></div>)}</div></div>);

const AppRow=({app,states,onGet,onOpen})=>(<button onClick={()=>onOpen(app)} className="row" style={{width:'100%',textAlign:'left',gap:13,padding:'11px 0'}}>
<Icon app={app} size={54}/>
<span className="grow" style={{minWidth:0}}>
<span className="trunc" style={{fontWeight:600,fontSize:14,display:'block'}}>{app.n}</span>
<span className="sub trunc" style={{display:'block',marginTop:1}}>{app.tag}</span>
<span className="row" style={{gap:8,marginTop:5}}>{app.rate>0?<><MkStars v={app.rate}/><span className="mono sub" style={{fontSize:11}}>{app.rate}</span></>:<span className="sub" style={{fontSize:11.5}}>Not yet rated</span>}
<span className="sub" style={{fontSize:11.5}}>· {app.size}</span></span></span>
<GetBtn app={app} state={states[app.id]||app.state} onGet={()=>onGet(app)}/></button>);

const AppCard=({app,states,onGet,onOpen})=>(<button onClick={()=>onOpen(app)} className="card" style={{width:236,flex:'none',textAlign:'left',padding:14,display:'grid',gap:10,borderRadius:'var(--r-l)'}}>
<div className="row" style={{gap:11,alignItems:'flex-start'}}><Icon app={app} size={48}/>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontWeight:600,fontSize:13.6,display:'block'}}>{app.n}</span>
<span className="sub trunc" style={{display:'block'}}>{app.dev}</span></span></div>
<div style={{fontSize:12.6,color:'var(--ink-2)',lineHeight:1.45,minHeight:36}}>{app.tag}</div>
<div className="row" style={{justifyContent:'space-between'}}>
{app.rate>0?<span className="row" style={{gap:6}}><MkStars v={app.rate}/><span className="mono sub" style={{fontSize:11}}>{app.cnt}</span></span>:<span className="sub" style={{fontSize:11.5}}>New</span>}
<GetBtn app={app} state={states[app.id]||app.state} onGet={()=>onGet(app)}/></div></button>);

const MkRail=({title,sub,items,states,onGet,onOpen})=>{const ref=React.useRef(null);
const go=d=>ref.current.scrollBy({left:d*520,behavior:'smooth'});
return <div style={{marginTop:26}}>
<div className="row" style={{alignItems:'flex-end',gap:12,marginBottom:12}}>
<div className="grow" style={{minWidth:0}}><h2 style={{fontSize:18,letterSpacing:'-.03em'}}>{title}</h2>{sub&&<div className="sub" style={{marginTop:2}}>{sub}</div>}</div>
<div className="row" style={{gap:6}}>{[-1,1].map(d=><button key={d} onClick={()=>go(d)} className="btn btn-s" style={{width:28,height:28,padding:0,justifyContent:'center',borderRadius:'50%'}}>
<span style={{display:'flex',transform:d<0?'rotate(180deg)':''}}><Ic.chev size={14}/></span></button>)}</div></div>
<div ref={ref} className="tabstrip" style={{display:'flex',gap:12,paddingBottom:4}}>
{items.map(a=><AppCard key={a.id} app={a} states={states} onGet={onGet} onOpen={onOpen}/>)}</div></div>};

const Detail=({app,state,onGet,onClose})=>{
const hist=[.72,.19,.05,.02,.02];
return <><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(23,19,49,.4)',backdropFilter:'blur(3px)',zIndex:80}}/>
<div className="fade-in" style={{position:'fixed',top:0,right:0,bottom:0,width:'min(560px,96vw)',background:'var(--surface)',borderLeft:'1px solid var(--line)',boxShadow:'var(--sh-3)',zIndex:81,overflow:'auto'}}>
<div style={{position:'relative',padding:'22px 24px 20px',background:app.g}}>
<button onClick={onClose} className="btn btn-s" style={{position:'absolute',top:16,right:16,width:30,height:30,padding:0,justifyContent:'center',borderRadius:'50%',background:'rgba(0,0,0,.25)',borderColor:'rgba(255,255,255,.25)',color:'#fff'}}><Ic.x size={14}/></button>
<div className="row" style={{gap:16,alignItems:'flex-start'}}>
<div style={{width:88,height:88,borderRadius:22,background:'rgba(255,255,255,.14)',border:'1px solid rgba(255,255,255,.28)',display:'grid',placeItems:'center',flex:'none'}}>
{React.createElement(Ic[app.ic],{size:40,style:{color:'#fff'}})}</div>
<div className="grow" style={{minWidth:0,color:'#fff'}}>
<div style={{fontSize:21,fontWeight:600,letterSpacing:'-.03em'}}>{app.n}</div>
<div style={{fontSize:12.8,opacity:.8,marginTop:2}}>{app.dev}</div>
<div className="row" style={{gap:9,marginTop:12,flexWrap:'wrap'}}>
<GetBtn app={app} state={state} onGet={onGet} big/>
{app.badge&&<span className="pill" style={{background:'rgba(255,255,255,.18)',color:'#fff',height:34,padding:'0 14px',borderRadius:99}}><Ic.check size={12}/>{app.badge}</span>}
<button className="btn btn-s" style={{height:34,borderRadius:99,background:'rgba(255,255,255,.14)',borderColor:'rgba(255,255,255,.22)',color:'#fff'}}><Ic.doc size={13}/>Share</button></div></div></div></div>

<div className="row" style={{padding:'14px 24px',borderBottom:'1px solid var(--line-soft)',gap:20,overflowX:'auto'}}>
{[[app.rate>0?app.rate:'—','Rating',app.rate>0?app.cnt+' ratings':'Not yet rated'],[app.size.split(' ')[0],'Type',app.size],[app.age,'Made for','Any practice'],
[app.cat==='data'?'Bridge':'Capability','Category',MK_CATS.find(c=>c[0]===app.cat)[1]]].map(([v,k,d],i)=>
<div key={i} style={{flex:'none',minWidth:88}}><div className="eyebrow" style={{fontSize:9.5}}>{k}</div>
<div style={{fontSize:16,fontWeight:600,letterSpacing:'-.02em',marginTop:3}}>{v}</div><div className="sub trunc" style={{fontSize:11,maxWidth:120}}>{d}</div></div>)}</div>

<div style={{padding:'18px 0 8px'}}>
<div className="tabstrip" style={{display:'flex',gap:12,padding:'0 24px 4px'}}>{[0,1,2].map(i=><Shot key={i} app={app} i={i}/>)}</div></div>

<div style={{padding:'10px 24px 26px',display:'grid',gap:22}}>
<div><div className="eyebrow">What it does</div>
<p style={{fontSize:13.6,color:'var(--ink-2)',lineHeight:1.65,marginTop:7}}>{app.d}</p></div>
{app.new&&<div><div className="row" style={{justifyContent:'space-between',alignItems:'baseline'}}><div className="eyebrow">What's new</div><span className="mono sub" style={{fontSize:11}}>Version 3.2 · 4 days ago</span></div>
<p style={{fontSize:13.2,color:'var(--ink-2)',lineHeight:1.6,marginTop:7}}>{app.new}</p></div>}
<div><div className="eyebrow">What it adds to Paige</div>
<div style={{display:'grid',gap:8,marginTop:9}}>{app.adds.map((a,i)=>
<div key={i} className="row" style={{gap:10,fontSize:13,color:'var(--ink-2)',alignItems:'flex-start'}}>
<span style={{color:'var(--ok)',display:'flex',marginTop:2}}><Ic.check size={14}/></span>{a}</div>)}</div></div>
<div><div className="eyebrow">What it can reach</div>
<div style={{display:'grid',gap:0,marginTop:9,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{app.perms.map((p,i)=><div key={i} className="row" style={{gap:10,padding:'11px 13px',borderTop:i?'1px solid var(--line-soft)':'0',fontSize:12.8}}>
<Ic.shield size={14} style={{color:'var(--ink-3)'}}/><span className="grow">{p}</span><span className="pill pill-n">Required</span></div>)}</div>
<div className="sub" style={{marginTop:8}}>Autonomy still governs what she does with this. A capability never raises its own permission.</div></div>
{app.rate>0&&<div><div className="eyebrow">Ratings</div>
<div className="row" style={{gap:20,marginTop:10,alignItems:'flex-start'}}>
<div style={{flex:'none',textAlign:'center'}}><div style={{fontSize:38,fontWeight:600,letterSpacing:'-.04em',lineHeight:1}}>{app.rate}</div>
<div style={{marginTop:5}}><MkStars v={app.rate} size={12}/></div><div className="sub" style={{fontSize:11,marginTop:3}}>{app.cnt} ratings</div></div>
<div className="grow" style={{display:'grid',gap:5}}>{hist.map((h,i)=><div key={i} className="row" style={{gap:8}}>
<span className="mono sub" style={{fontSize:10.5,width:8}}>{5-i}</span>
<span style={{flex:1,height:6,borderRadius:3,background:'var(--surface-sunk)'}}><span style={{display:'block',width:(h*100)+'%',height:'100%',borderRadius:3,background:'var(--gold)'}}/></span></div>)}</div></div>
<div style={{marginTop:16,display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:12}}>{[['Marisol D.','Replaced two contractors','Installed it on a Tuesday, and by Friday Paige was running the entire intake without me editing a word.'],
['Ken A.','It found the leak','The risk score flagged an account I would have sworn was fine. It was not fine.']].map(([w,t,b],i)=>
<div key={i} style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'12px 14px'}}>
<div className="row" style={{gap:9}}><Avatar name={w} size={24}/><span style={{fontSize:12.8,fontWeight:600}}>{w}</span><span style={{marginLeft:'auto'}}><MkStars v={5}/></span></div>
<div style={{fontSize:13,fontWeight:600,marginTop:8}}>{t}</div>
<div style={{fontSize:12.8,color:'var(--ink-2)',marginTop:4,lineHeight:1.55}}>{b}</div></div>)}</div></div>}
<div style={{padding:'14px 16px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',fontSize:12.9,color:'var(--ink-2)',lineHeight:1.6}}>
<span style={{fontWeight:600,color:'var(--ink)'}}>Your persona stays yours. </span>Capabilities layer expertise onto Paige. They never overwrite your voice, your greeting, or your client journey.</div></div></div></>};

export const Marketplace=()=>{
const[tab,setTab]=React.useState('today');
const[states,setStates]=React.useState(()=>Object.fromEntries(MK.map(a=>[a.id,a.state])));
const[open,setOpen]=React.useState(null);
const[q,setQ]=React.useState('');
const[cat,setCat]=React.useState('All');
const[hero,setHero]=React.useState(0);
const[toast,setToast]=React.useState(null);
React.useEffect(()=>{const id=setInterval(()=>setHero(h=>(h+1)%FEAT.length),6500);return()=>clearInterval(id)},[]);
const get=app=>{const s=states[app.id];
 if(s==='installed'){setToast('Opening '+app.n+' inside Paige');setTimeout(()=>setToast(null),2400);return}
 setStates(x=>({...x,[app.id]:'installing'}));
 setTimeout(()=>{setStates(x=>({...x,[app.id]:'installed'}));
  setToast(app.n+' installed — Paige is already using it');setTimeout(()=>setToast(null),3200)},2100)};
const updates=MK.filter(a=>states[a.id]==='update');
const installed=MK.filter(a=>states[a.id]==='installed');
const feat=FEAT.map(f=>({...f,app:MK.find(a=>a.id===f.id)}));
const byCat=k=>MK.filter(a=>a.cat===k);
const results=MK.filter(a=>(cat==='All'||a.cat===cat)&&(a.n+' '+a.tag+' '+a.dev).toLowerCase().includes(q.toLowerCase()));
const tabs=[['today','Today',()=><Ic.spark size={15}/>],['browse','Browse',()=><Ic.grid size={15}/>],['installed','Installed',()=><Ic.check size={15}/>],['updates','Updates',()=><Ic.arrow size={15}/>,updates.length||null]];

return <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0}}>
<div className="row" style={{flex:'none',borderBottom:'1px solid var(--line)',background:'var(--surface)',paddingRight:22,gap:12}}>
<div className="grow tabstrip"><SubTabs tabs={tabs} cur={tab} set={setTab}/></div>
<div className="row" style={{gap:8,flex:'none'}}><span className="pill pill-ok"><span className="dot"/>{installed.length} installed</span>
{updates.length>0&&<button onClick={()=>setTab('updates')} className="pill" style={{background:'var(--gold-bright)',color:'#2A1C00',cursor:'pointer'}}>{updates.length} updates</button>}</div></div>
<div style={{flex:1,minHeight:0,overflow:'auto'}}><div style={{maxWidth:1440,margin:'0 auto',padding:'18px 34px 60px'}}>

{tab==='today'&&<div className="fade-in">
<div style={{position:'relative',borderRadius:'var(--r-xl)',overflow:'hidden',minHeight:262,background:feat[hero].g,padding:'28px 30px',display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
<div style={{position:'absolute',inset:0,background:'radial-gradient(120% 140% at 85% 10%, rgba(255,255,255,.16) 0%, rgba(0,0,0,0) 55%)'}}/>
<div style={{position:'absolute',top:26,right:30,opacity:.9}}><Icon app={feat[hero].app} size={92} r={24}/></div>
<div style={{position:'relative',maxWidth:'62%'}}>
<div style={{fontSize:10.5,letterSpacing:'.24em',color:'rgba(255,255,255,.72)',fontWeight:700,textTransform:'uppercase'}}>{feat[hero].kick}</div>
<h2 style={{color:'#fff',fontSize:'clamp(22px,2.6vw,32px)',letterSpacing:'-.035em',marginTop:9,lineHeight:1.1}}>{feat[hero].t}</h2>
<p style={{color:'rgba(255,255,255,.8)',fontSize:14,marginTop:8,lineHeight:1.5}}>{feat[hero].s}</p>
<div className="row" style={{gap:10,marginTop:16}}>
<button onClick={()=>get(feat[hero].app)} className="row" style={{gap:7,height:36,padding:'0 20px',borderRadius:99,background:'#fff',color:'#171331',fontWeight:700,fontSize:13.5}}>
{states[feat[hero].id]==='installed'?'Open':states[feat[hero].id]==='installing'?'Installing…':'Get'}</button>
<button onClick={()=>setOpen(feat[hero].app)} className="row" style={{gap:7,height:36,padding:'0 18px',borderRadius:99,background:'rgba(255,255,255,.16)',border:'1px solid rgba(255,255,255,.28)',color:'#fff',fontWeight:600,fontSize:13.2}}>Learn more</button></div></div>
<div className="row" style={{gap:6,position:'absolute',bottom:22,right:30}}>{feat.map((_,i)=>
<button key={i} onClick={()=>setHero(i)} style={{width:i===hero?20:7,height:7,borderRadius:99,background:i===hero?'#fff':'rgba(255,255,255,.4)',transition:'.25s'}}/>)}</div></div>

<MkRail title="Give Paige a profession" sub="Domain brains that layer deep, practice-specific expertise onto your persona." items={byCat('vert')} states={states} onGet={get} onOpen={setOpen}/>
<MkRail title="Playbooks she runs like a seasoned operator" sub="Proven frameworks she draws on with every client." items={byCat('play')} states={states} onGet={get} onOpen={setOpen}/>

<div style={{marginTop:28}} className="two">
<div className="card"><div className="hd"><div><h3>Top charts</h3><div className="sub">By installs this month</div></div><button className="btn btn-s" onClick={()=>setTab('browse')}>See all</button></div>
<div style={{padding:'6px 20px 14px'}}>{[...MK].filter(a=>a.rate>0).sort((a,b)=>b.cnt-a.cnt).slice(0,5).map((a,i)=>
<div key={a.id} className="row" style={{gap:12,borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="mono" style={{fontSize:17,fontWeight:600,color:'var(--ink-3)',width:20,flex:'none'}}>{i+1}</span>
<div className="grow" style={{minWidth:0}}><AppRow app={a} states={states} onGet={get} onOpen={setOpen}/></div></div>)}</div></div>
<div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:16}}>
<div className="card" style={{padding:'18px 20px',background:'var(--rail)',borderColor:'var(--rail-line)'}}>
<div className="row" style={{gap:7,color:'var(--gold-bright)',fontSize:10.5,fontWeight:700,letterSpacing:'.16em',textTransform:'uppercase'}}><Ic.bolt size={12}/>Build and sell</div>
<h3 style={{color:'#fff',fontSize:17,marginTop:8,letterSpacing:'-.025em'}}>Publish your own capability</h3>
<p style={{color:'var(--rail-text)',fontSize:13,marginTop:6,lineHeight:1.55}}>Package a Playbook, a curriculum, or a workflow you built in Vibe Studio and list it here. You set the price, we handle billing and updates.</p>
<div className="row" style={{gap:9,marginTop:14}}>
<button className="btn btn-s" style={{background:'var(--gold-bright)',borderColor:'var(--gold-bright)',color:'#2A1C00',fontWeight:600}}>Start a listing</button>
<button className="btn btn-s" style={{background:'transparent',borderColor:'var(--rail-line)',color:'#fff'}}>Publisher terms</button></div></div>
<div className="card"><div className="hd"><h3>Because you installed Funding</h3></div>
<div style={{padding:'6px 20px 12px'}}>{[MK.find(a=>a.id==='obj'),MK.find(a=>a.id==='disc'),MK.find(a=>a.id==='acct')].map((a,i)=>
<div key={a.id} style={{borderTop:i?'1px solid var(--line-soft)':'0'}}><AppRow app={a} states={states} onGet={get} onOpen={setOpen}/></div>)}</div></div></div></div>

<MkRail title="Client experience" sub="Shape how your portal looks and talks." items={byCat('cx')} states={states} onGet={get} onOpen={setOpen}/>
<MkRail title="Bridges to what you already pay for" sub="Nothing has to move before it earns the move." items={byCat('data')} states={states} onGet={get} onOpen={setOpen}/>
</div>}

{tab==='browse'&&<div className="fade-in">
<PageHead eyebrow="Capability store" title="Browse everything" sub={MK.length+' capabilities across five categories. Search, or walk the shelves.'}/>
<div className="row" style={{gap:10,flexWrap:'wrap',marginBottom:18}}>
<div className="row card" style={{padding:'0 14px',height:38,gap:9,borderRadius:99,boxShadow:'none',color:'var(--ink-3)',flex:'1 1 260px',maxWidth:380}}><Ic.search size={16}/>
<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search capabilities" style={{border:0,background:'none',outline:'none',color:'var(--ink)',flex:1,minWidth:0,fontFamily:'inherit',fontSize:13.4}}/></div>
<div className="row tabstrip" style={{gap:7}}>{['All',...MK_CATS.map(c=>c[0])].map(k=>{const on=cat===k;const l=k==='All'?'All':MK_CATS.find(c=>c[0]===k)[1];
return <button key={k} onClick={()=>setCat(k)} style={{flex:'none',height:32,padding:'0 14px',borderRadius:99,fontSize:12.6,fontWeight:on?600:450,
background:on?'var(--ink)':'var(--surface)',color:on?'var(--ink-inv)':'var(--ink-2)',border:'1px solid '+(on?'var(--ink)':'var(--line)')}}>{l}</button>})}</div></div>
<div className="g3">{results.map(a=><div key={a.id} className="card" style={{padding:16,display:'grid',gap:11}}>
<button onClick={()=>setOpen(a)} className="row" style={{gap:12,textAlign:'left',alignItems:'flex-start'}}>
<Icon app={a} size={52}/><span className="grow" style={{minWidth:0}}>
<span className="trunc" style={{fontWeight:600,fontSize:14.2,display:'block'}}>{a.n}</span>
<span className="sub trunc" style={{display:'block'}}>{a.dev} · {a.size}</span>
<span className="row" style={{gap:7,marginTop:5}}>{a.rate>0?<><MkStars v={a.rate}/><span className="mono sub" style={{fontSize:11}}>{a.rate} · {a.cnt}</span></>:<span className="pill pill-n">New</span>}</span></span></button>
<div style={{fontSize:12.8,color:'var(--ink-2)',lineHeight:1.5}}>{a.tag}</div>
<div className="row" style={{justifyContent:'space-between',borderTop:'1px solid var(--line-soft)',paddingTop:11}}>
<span className="sub trunc">{MK_CATS.find(c=>c[0]===a.cat)[1]}</span>
<GetBtn app={a} state={states[a.id]} onGet={()=>get(a)}/></div></div>)}
{!results.length&&<div className="card" style={{padding:'44px 20px',textAlign:'center',gridColumn:'1/-1'}}>
<div className="sub">Nothing matches “{q}”. Paige can build it in Vibe Studio instead.</div></div>}</div></div>}

{tab==='installed'&&<div className="fade-in">
<PageHead eyebrow="On this workspace" title="Installed capabilities" sub={installed.length+' capabilities are live. Everything here shapes how Paige works for you today.'}
right={<button className="btn"><Ic.gear size={15}/>Manage permissions</button>}/>
<div className="card">{installed.map((a,i)=><div key={a.id} className="row" style={{gap:13,padding:'14px 20px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<Icon app={a} size={48}/>
<div className="grow" style={{minWidth:0}}><div className="row" style={{gap:8,flexWrap:'wrap'}}><span style={{fontWeight:600,fontSize:14}}>{a.n}</span>
{a.badge&&<span className="pill pill-ok">{a.badge}</span>}</div>
<div className="sub trunc">{a.adds.length} additions · {a.perms.length} permissions · updated 4 days ago</div></div>
<div className="row" style={{gap:8}}><button className="btn btn-s" onClick={()=>setOpen(a)}>Details</button>
<button className="btn btn-s">Open</button>
<button className="btn btn-s" onClick={()=>setStates(x=>({...x,[a.id]:'get'}))} style={{color:'var(--bad)'}}>Remove</button></div></div>)}</div>
<div className="card" style={{marginTop:16,padding:'16px 20px',background:'var(--surface-2)',fontSize:13,color:'var(--ink-2)',lineHeight:1.6}}>
<span style={{fontWeight:600,color:'var(--ink)'}}>Paige: </span>Funding and Client Onboarding overlap on two intake questions. I deduplicated them so your clients are not asked twice.</div></div>}

{tab==='updates'&&<div className="fade-in">
<PageHead eyebrow="Keeping her current" title="Updates" sub={updates.length?updates.length+' capabilities have new versions. Each one lists what changed before you take it.':'Everything is on the current version.'}
right={updates.length?<button className="btn btn-p" onClick={()=>updates.forEach(a=>get(a))}><Ic.arrow size={15}/>Update all</button>:null}/>
<div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:12}}>{updates.map(a=><div key={a.id} className="card" style={{padding:'16px 18px'}}>
<div className="row" style={{gap:13,alignItems:'flex-start',flexWrap:'wrap'}}>
<Icon app={a} size={52}/>
<div className="grow" style={{minWidth:220}}><div className="row" style={{gap:8}}><span style={{fontWeight:600,fontSize:14.2}}>{a.n}</span><span className="mono sub" style={{fontSize:11}}>3.2</span></div>
<div className="sub">4 days ago · {a.size}</div>
<p style={{fontSize:13,color:'var(--ink-2)',marginTop:8,lineHeight:1.55,maxWidth:600}}>{a.new}</p></div>
<GetBtn app={a} state={states[a.id]} onGet={()=>get(a)} big/></div></div>)}
{!updates.length&&<div className="card" style={{padding:'50px 20px',textAlign:'center'}}>
<div className="tile" style={{margin:'0 auto 12px',width:42,height:42,borderRadius:15,background:'var(--ok-tint)',color:'var(--ok)'}}><Ic.check size={20}/></div>
<div style={{fontWeight:600}}>All current</div><div className="sub">Paige updates herself in the background and only stops to ask when a permission changes.</div></div>}</div>
<div style={{marginTop:22}}><div className="eyebrow" style={{marginBottom:10}}>Updated recently</div>
<div className="card">{installed.slice(0,3).map((a,i)=><div key={a.id} className="row" style={{gap:12,padding:'12px 20px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<Icon app={a} size={38} r={11}/><span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:13.4,fontWeight:500,display:'block'}}>{a.n}</span>
<span className="sub trunc" style={{display:'block'}}>{a.new}</span></span><span className="mono sub" style={{fontSize:11}}>4d ago</span></div>)}</div></div></div>}

</div></div>
{open&&<Detail app={open} state={states[open.id]} onGet={()=>get(open)} onClose={()=>setOpen(null)}/>}
{toast&&<div className="fade-in" style={{position:'fixed',bottom:26,left:'50%',transform:'translateX(-50%)',background:'var(--rail)',color:'var(--ink-inv)',padding:'11px 18px',borderRadius:12,fontSize:13,boxShadow:'var(--sh-3)',zIndex:90}}>{toast}</div>}</div>};
