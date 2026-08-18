// @ts-nocheck
import React from "react";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, SubTabs, Wrap, PageHead, DATA } from "./_shared";
import { Agent } from "./agent";
import { Knowledge } from "./knowledge";
import { useSoloActions } from "./data/useSoloActions";
import { useSoloSubagents } from "./data/useSoloSubagents";
import { useSoloSkills } from "./data/useSoloSkills";
import { useSoloPaigeTeam } from "./data/useSoloPaigeTeam";

export const PT={
subagents:[
 {n:'Pipeline Scout',kind:'soft',tag:'sales',on:true,d:'Surfaces stale leads, deals with no next step, and stuck stages — ranked by your next best hour.',runs:41,ok:97},
 {n:'Follow-Up Drafter',kind:'soft',tag:'outreach',on:true,d:'Turns "this client needs a nudge" into an on-brand follow-up ready for you to approve.',runs:118,ok:94},
 {n:'Email Composer',kind:'local',tag:'comms',on:true,d:'Free-form email drafter. Takes intent plus tone — professional, warm, stern, celebratory, direct — and key points.',runs:206,ok:96},
 {n:'Risk Watcher',kind:'soft',tag:'retention',on:true,d:'Watches reply gaps, portal silence, and sentiment drift, then scores every account nightly.',runs:30,ok:99},
 {n:'Collections Runner',kind:'local',tag:'finance',on:false,d:'Runs dunning on failed charges, softest tone first, escalating over nine days. Needs your approval to ship.',runs:0,ok:null},
 {n:'Systems Remediator',kind:'local',tag:'ops',on:true,d:'Applies approved Systems Check fixes — pixels, redirects, event wiring — then re-runs the check.',runs:23,ok:100}],
proposals:[
 {n:'Onboarding Sequencer',why:'You onboarded three clients by hand this month, same eight steps each time.',kind:'soft'},
 {n:'Referral Asker',why:'Six of your last nine deals came from three clients. None have been asked.',kind:'soft'}],
actions:[
 {t:'Fix: Company info populated',route:'Operations PMO → Operations PMO',kind:'Remediate',st:'Filed',pri:'High',w:'3 days ago'},
 {t:'Fix: Website connected or detected',route:'Operations PMO → Marketing',kind:'Remediate',st:'Filed',pri:'High',w:'3 days ago'},
 {t:'Fix: Comms configured across the board',route:'Operations PMO → Technology automation',kind:'Remediate',st:'Filed',pri:'Urgent',w:'3 days ago'},
 {t:'Draft: Harper & Vale renewal note',route:'Client Success → You',kind:'Draft',st:'Pending approval',pri:'High',w:'3h ago'},
 {t:'Run: Dunning on 3 failed charges',route:'Finance → Collections Runner',kind:'Execute',st:'Blocked',pri:'Urgent',w:'11h ago'},
 {t:'Plan: October content calendar',route:'Marketing → You',kind:'Draft',st:'Drafted',pri:'Medium',w:'1d ago'},
 {t:'Workflow: Onboard Northwind Partners',route:'Operations → Client Success',kind:'Execute',st:'Executing',pri:'High',w:'1d ago'},
 {t:'Reset: Selby Group re-engagement',route:'Client Success → You',kind:'Draft',st:'Drafted',pri:'High',w:'2d ago'}],
skills:[
 {i:'01',n:'Verify Deployed Surface',slug:'verify_deployed_surface',ro:true,cat:'operations_process',on:true,runs:3,ok:2,
  d:'Opens a deployed page, checks it actually came up, and reports an honest verdict. She compares what she saw against what a correctly loaded page should show, and names the exact problem if there is one. She opens no forms and changes nothing.',
  trig:['check that our published page is live','verify the site is rendering correctly']},
 {i:'02',n:'Draft Renewal Note',slug:'draft_renewal_note',ro:false,cat:'client_success',on:true,runs:18,ok:17,
  d:'Pulls the quarter\'s delivery numbers, compares them against the prior period, and writes an evidence-first renewal note at your rate with your tone rules applied.',
  trig:['renewal is coming up','write the renewal note']},
 {i:'03',n:'Chase Failed Charge',slug:'chase_failed_charge',ro:false,cat:'finance',on:true,runs:9,ok:9,
  d:'Builds a nine-day dunning sequence per client, softest tone first, referencing their own payment history so it never reads like a form letter.',
  trig:['card declined','payment failed']},
 {i:'04',n:'Score Account Risk',slug:'score_account_risk',ro:true,cat:'retention',on:true,runs:30,ok:30,
  d:'Scores an account on reply gaps, skipped calls, portal logins, and sentiment drift, then explains which signal moved the number.',
  trig:['is this client at risk','why did the score change']},
 {i:'05',n:'Rebuild Funnel Step',slug:'rebuild_funnel_step',ro:false,cat:'growth',on:false,runs:0,ok:0,
  d:'Takes the leakiest step in a funnel and rebuilds it — copy, form length, and reminder cadence — then ships it to Vibe Studio for your review.',
  trig:['fix the funnel','why is this step leaking']}],
team:[
 {n:'Client Success',role:'Onboarding · answers · nurture',level:2,open:3,handoff:'Owner Ops',c:'var(--violet)'},
 {n:'Owner Ops',role:'Pipeline · follow-ups · retainers',level:1,open:2,handoff:'Client Experience',c:'var(--gold)'},
 {n:'Marketing',role:'Content · campaigns · social',level:2,open:1,handoff:'Growth',c:'#3FA6B8'},
 {n:'Finance',role:'Invoices · dunning · forecasts',level:2,open:3,handoff:'Owner Ops',c:'#E88A80'},
 {n:'Operations',role:'Delivery · workflows · vendors',level:3,open:0,handoff:'Systems',c:'var(--ok)'},
 {n:'Systems',role:'Checks · fixes · data quality',level:3,open:2,handoff:'Operations',c:'#F2C97A'}]};
const LVL=['Ask first','Draft & wait','Act with notice','Act freely'];

// Honest marker for a sub-panel with no real backend yet (§13) — demo shell, truthfully labeled.
const PreviewPill=()=>(<span className="pill pill-n" title="Sample layout — not yet wired to your live data">Preview</span>);
// Crafted empty state (§11) — never a bare "nothing here".
const HubEmpty=({icon,label,sub,preview})=>(<div className="card" style={{padding:'44px 20px',textAlign:'center'}}>
<div className="tile" style={{margin:'0 auto 12px',width:40,height:40,borderRadius:14,background:'var(--violet-tint)',color:'var(--violet)'}}>{icon||<Ic.spark size={20}/>}</div>
<div className="row" style={{gap:8,justifyContent:'center'}}><div style={{fontWeight:600}}>{label}</div>{preview&&<PreviewPill/>}</div>
{sub&&<div className="sub" style={{maxWidth:340,margin:'5px auto 0'}}>{sub}</div>}</div>);
// Loading skeletons (mirror useCommandCenter's shimmer bars).
const CardsSkeleton=({n=3})=>(<div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:12}}>
{Array.from({length:n}).map((_,i)=><div key={i} className="card" style={{padding:'16px 18px'}}>
<div style={{height:12,width:'40%',background:'var(--surface-sunk)',borderRadius:5}}/>
<div style={{height:9,width:'72%',background:'var(--surface-sunk)',borderRadius:4,marginTop:12}}/>
<div style={{height:9,width:'56%',background:'var(--surface-sunk)',borderRadius:4,marginTop:8}}/></div>)}</div>);
const KpiSkeleton=()=>(<div className="card" style={{padding:'16px 18px'}}>
<div style={{height:9,width:'52%',background:'var(--surface-sunk)',borderRadius:4}}/>
<div style={{height:24,width:'40%',background:'var(--surface-sunk)',borderRadius:5,marginTop:12}}/></div>);

const SubAgents=()=>{const sa=useSoloSubagents();const[tab,setTab]=React.useState('reg');const[list,setList]=React.useState([]);
React.useEffect(()=>{setList(sa.subagents)},[sa.subagents]);
const tabs=[['reg','Registry'],['prop','Proposals'],['test','Test Console'],['act','Activity']];
return <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:16}}>
<div className="card" style={{padding:'16px 20px'}}>
<div className="row" style={{gap:14,flexWrap:'wrap'}}>
<div className="grow" style={{minWidth:260}}><h3 style={{fontSize:16}}>Sub-Agent Console</h3>
<p style={{fontSize:13,color:'var(--ink-2)',marginTop:5,maxWidth:560,lineHeight:1.55}}>Specialists Paige delegates to. <strong style={{color:'var(--ink)'}}>Soft</strong> agents are prompt-only and she can ship them herself. <strong style={{color:'var(--ink)'}}>Local</strong> agents run code and wait for you.</p>
<div className="mono sub" style={{marginTop:7}}>{list.length} specialist{list.length===1?'':'s'} on call</div></div>
<div className="row" style={{gap:9}}><button className="btn" onClick={()=>sa.refresh()}><Ic.pulse size={15}/>Refresh</button>
<button className="btn btn-p"><Ic.spark size={15}/>Forge sub-agent</button></div></div>
<div className="row" style={{gap:4,marginTop:14,background:'var(--surface-sunk)',borderRadius:11,padding:3,width:'max-content',maxWidth:'100%',overflowX:'auto'}}>
{tabs.map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={{height:30,padding:'0 14px',borderRadius:8,fontSize:12.8,fontWeight:tab===k?600:450,
background:tab===k?'var(--surface)':'transparent',color:tab===k?'var(--ink)':'var(--ink-3)',boxShadow:tab===k?'var(--sh-1)':'none',whiteSpace:'nowrap'}}>{l}</button>)}</div></div>
{tab==='reg'&&(sa.loading&&!list.length?<CardsSkeleton n={4}/>:!list.length?<HubEmpty label="No sub-agents yet" sub="Forge a specialist and it will appear here."/>:<div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:12}}>{list.map((a,i)=>
<div key={i} className="card" style={{padding:'16px 18px'}}>
<div className="row" style={{gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
<div className="grow" style={{minWidth:240}}>
<div className="row" style={{gap:8,flexWrap:'wrap'}}><span style={{fontWeight:600,fontSize:14.5,letterSpacing:'-.01em'}}>{a.n}</span>
<span className="pill" style={{background:a.kind==='soft'?'var(--violet-tint)':'var(--surface-sunk)',color:a.kind==='soft'?'var(--violet)':'var(--ink-2)'}}>
{a.kind==='soft'?<Ic.spark size={11}/>:<Ic.gear size={11}/>}{a.kind}</span>
<span className="pill" style={{background:'var(--ink)',color:'var(--ink-inv)'}}>{a.tag}</span></div>
<p style={{fontSize:13,color:'var(--ink-2)',marginTop:6,lineHeight:1.55,maxWidth:680}}>{a.d}</p>
<div className="row" style={{gap:14,marginTop:9,flexWrap:'wrap'}}>
<span className="mono sub">{a.kind==='soft'?'Soft (prompt-only)':'Local edge function'}</span>
{a.runs>0&&<span className="mono sub">{a.runs} runs</span>}{a.ok!=null&&<span className="mono sub">{a.ok}% clean</span>}</div></div>
<div className="row" style={{gap:10}}><span className="sub">{a.on?'Enabled':'Off'}</span>
<button onClick={()=>setList(l=>l.map((x,j)=>j===i?{...x,on:!x.on}:x))} style={{width:42,height:24,borderRadius:99,padding:2,background:a.on?'var(--ink)':'var(--surface-sunk)',display:'flex',justifyContent:a.on?'flex-end':'flex-start',transition:'.15s'}}>
<span style={{width:20,height:20,borderRadius:'50%',background:'#fff',boxShadow:'var(--sh-1)'}}/></button></div></div></div>)}</div>)}
{tab==='prop'&&(sa.proposals.length?<div className="g3">{sa.proposals.map((p,i)=><div key={i} className="card" style={{padding:'16px 18px',display:'flex',flexDirection:'column',gap:10}}>
<div className="row" style={{gap:8}}><span style={{fontWeight:600,fontSize:14}}>{p.n}</span><span className="pill pill-v">{p.kind}</span></div>
<p style={{fontSize:12.9,color:'var(--ink-2)',lineHeight:1.55,flex:1}}>{p.why}</p>
<div className="row" style={{gap:8}}><button className="btn btn-s btn-p"><Ic.check size={12}/>Forge it</button><button className="btn btn-s">Not now</button></div></div>)}</div>
:<HubEmpty preview label="No proposals right now" sub="When Paige spots a repeatable job she can specialize, she'll propose a sub-agent here."/>)}
{tab==='test'&&<div className="card"><div className="hd"><div className="row" style={{gap:8}}><h3>Test console</h3><PreviewPill/></div><div className="sub">Run a sub-agent against real data without shipping anything</div></div>
<div style={{padding:'16px 20px 20px',display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:12}}>
<div className="row" style={{gap:9,flexWrap:'wrap'}}><select className="btn" style={{paddingRight:26}}>{list.map(a=><option key={a.n}>{a.n}</option>)}</select>
<select className="btn" style={{paddingRight:26}}>{DATA.clients.map(c=><option key={c.name}>{c.name}</option>)}</select>
<button className="btn btn-p"><Ic.send size={14}/>Run test</button></div>
<div style={{background:'#0A0818',borderRadius:'var(--r-m)',padding:'14px 16px',fontFamily:'var(--mono)',fontSize:11.8,color:'#A6E3C0',lineHeight:1.75,minHeight:150}}>
<div style={{color:'#7D779A'}}>$ run follow_up_drafter --client "Ridgeline Co." --dry-run</div>
<div>→ loaded 41 thread messages, 7 scope events, sentiment: neutral↓</div>
<div>→ retrieved 3 knowledge docs (Playbook, Rate card, Scope changes)</div>
<div>→ drafted 148 words · tone: direct, warm · reading level 8</div>
<div style={{color:'#E9A83A'}}>⚠ flagged: hours 41 vs budget 28 — recommends scope conversation first</div>
<div style={{color:'#7D779A'}}>dry run complete · nothing sent</div></div></div></div>}
{tab==='act'&&<div className="card"><div className="hd"><div className="row" style={{gap:8}}><h3>Activity</h3><PreviewPill/></div><button className="btn btn-s">Export log</button></div>
{[['Follow-Up Drafter drafted 4 follow-ups after the Ridgeline call','38m ago'],['Systems Remediator applied the redirect fix and re-ran check 6','2h ago'],
['Risk Watcher raised Selby Group to 74','7h ago'],['Email Composer wrote the Northwind kickoff invite','1d ago'],['Collections Runner blocked — awaiting your approval','11h ago']].map(([t,w],i)=>
<div key={i} className="row" style={{padding:'12px 20px',borderTop:'1px solid var(--line-soft)',gap:12}}>
<span className="tile" style={{width:26,height:26,borderRadius:'50%',background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.spark size={13}/></span>
<span className="grow" style={{fontSize:13,color:'var(--ink-2)'}}>{t}</span><span className="mono sub">{w}</span></div>)}</div>}</div>};

const Actions=()=>{const ac=useSoloActions();const[f,setF]=React.useState('All');
const chips=['All','Filed','Assigned','Drafting','Drafted','Pending approval','Approved','Executing','Done','Blocked','Dismissed'];
const rows=ac.actions.filter(a=>f==='All'||a.st===f);
const tone=s=>s==='Blocked'?'pill-bad':s==='Pending approval'?'pill-warn':s==='Executing'?'pill-v':s==='Done'?'pill-ok':'pill-n';
const tiles=[['Open',ac.kpis.open,'in flight on the bus','var(--violet)'],
['Needs attention',ac.kpis.needsAttention,'waiting on you','var(--warn)'],
['Completed today',ac.kpis.completedToday,'shipped without you','var(--ok)']];
return <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:16}}>
<div className="g3">{ac.loading?[0,1,2].map(i=><KpiSkeleton key={i}/>):tiles.map(([k,v,d,c],i)=>
<div key={i} className="card" style={{padding:'16px 18px'}}>
<div className="row" style={{justifyContent:'space-between',alignItems:'flex-start'}}><div className="eyebrow">{k}</div>
<div className="tile" style={{width:30,height:30,borderRadius:'50%',background:'var(--rail)',color:'var(--gold-bright)'}}><Ic.check size={14}/></div></div>
<div style={{fontSize:30,fontWeight:600,letterSpacing:'-.035em',marginTop:2,color:c}}>{v}</div><div className="sub">{d}</div></div>)}</div>
<div className="row" style={{gap:7,flexWrap:'wrap'}}>{chips.map(c=><button key={c} onClick={()=>setF(c)} style={{height:29,padding:'0 12px',borderRadius:99,fontSize:12.3,fontWeight:f===c?600:450,
background:f===c?'var(--ink)':'var(--surface)',color:f===c?'var(--ink-inv)':'var(--ink-2)',border:'1px solid '+(f===c?'var(--ink)':'var(--line)')}}>{c}</button>)}
<button className="btn btn-s" style={{marginLeft:'auto'}} onClick={()=>ac.refresh()}><Ic.pulse size={13}/>Refresh</button></div>
<div className="card tbl tbl-cap"><div style={{minWidth:1000}}>
<div className="row" style={{padding:'11px 20px',background:'var(--surface-2)',borderBottom:'1px solid var(--line)',fontSize:11,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)',fontWeight:600}}>
<span style={{flex:'0 0 96px'}}>Filed</span><span style={{flex:'1 1 260px',minWidth:220}}>Work</span><span style={{flex:'0 0 250px'}}>Route</span>
<span style={{flex:'0 0 100px'}}>Kind</span><span style={{flex:'0 0 140px'}}>Status</span><span style={{flex:'0 0 80px',textAlign:'right'}}>Priority</span></div>
{ac.loading?[0,1,2].map(i=><div key={i} className="row" style={{padding:'15px 20px',borderBottom:i<2?'1px solid var(--line-soft)':'0',gap:12}}>
<span style={{flex:'0 0 96px',height:9,background:'var(--surface-sunk)',borderRadius:4}}/><span style={{flex:'1 1 260px',minWidth:220,height:10,background:'var(--surface-sunk)',borderRadius:4}}/>
<span style={{flex:'0 0 250px',height:9,background:'var(--surface-sunk)',borderRadius:4}}/><span style={{flex:'0 0 100px',height:9,background:'var(--surface-sunk)',borderRadius:4}}/>
<span style={{flex:'0 0 140px',height:9,background:'var(--surface-sunk)',borderRadius:4}}/><span style={{flex:'0 0 80px',height:9,background:'var(--surface-sunk)',borderRadius:4}}/></div>)
:rows.map((a,i)=><div key={i} className="row" style={{padding:'13px 20px',borderBottom:i<rows.length-1?'1px solid var(--line-soft)':'0',gap:12}}>
<span className="mono sub" style={{flex:'0 0 96px'}}>{a.w}</span>
<span className="trunc" style={{flex:'1 1 260px',minWidth:220,fontSize:13.2,fontWeight:500}}>{a.t}</span>
<span className="trunc" style={{flex:'0 0 250px',fontSize:12.6,color:'var(--violet)'}}>{a.route}</span>
<span className="sub" style={{flex:'0 0 100px'}}>{a.kind}</span>
<span style={{flex:'0 0 140px'}}><span className={'pill '+tone(a.st)}>{a.st}</span></span>
<span style={{flex:'0 0 80px',textAlign:'right',fontSize:12.5,fontWeight:600,color:a.pri==='Urgent'?'var(--bad)':a.pri==='High'?'var(--warn)':'var(--ink-3)'}}>{a.pri||'—'}</span></div>)}
{!ac.loading&&!rows.length&&<div style={{padding:'40px 20px',textAlign:'center'}}><div className="sub">{f==='All'?'Nothing open on the bus right now.':'Nothing in this state.'}</div></div>}</div></div></div>};

const Skills=()=>{const sk=useSoloSkills();const[q,setQ]=React.useState('');const[tab,setTab]=React.useState('sk');const[list,setList]=React.useState([]);
React.useEffect(()=>{setList(sk.skills)},[sk.skills]);
const rows=list.filter(s=>s.n.toLowerCase().includes(q.toLowerCase())||s.slug.includes(q.toLowerCase()));
const tiles=[['Skills',String(sk.stats.total),'in your catalog',false],['Active',String(sk.stats.active),'live and callable',false],
['Runs this week','—','not tracked yet',true],['Proposals','—','she writes them',true]];
return <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:16}}>
<div className="g4">{sk.loading?[0,1,2,3].map(i=><KpiSkeleton key={i}/>):tiles.map(([k,v,d,pv],i)=>
<div key={i} className="card" style={{padding:'16px 18px'}}><div className="row" style={{justifyContent:'space-between',alignItems:'flex-start'}}>
<div className="row" style={{gap:7}}><div className="eyebrow">{k}</div>{pv&&<PreviewPill/>}</div><div className="tile" style={{width:30,height:30,borderRadius:'50%',background:'var(--rail)',color:'var(--gold-bright)'}}><Ic.bolt size={14}/></div></div>
<div style={{fontSize:30,fontWeight:600,letterSpacing:'-.035em',marginTop:2}}>{v}</div><div className="sub">{d}</div></div>)}</div>
<div className="row" style={{gap:10,flexWrap:'wrap'}}>
<div className="row" style={{gap:4,background:'var(--surface-sunk)',borderRadius:11,padding:3}}>
{[['sk','Skills ('+sk.stats.total+')'],['runs','Recent runs'],['prop','Proposals'],['forge','Forge new skill']].map(([k,l])=>
<button key={k} onClick={()=>setTab(k)} style={{height:30,padding:'0 13px',borderRadius:8,fontSize:12.7,fontWeight:tab===k?600:450,whiteSpace:'nowrap',
background:tab===k?'var(--surface)':'transparent',color:tab===k?'var(--ink)':'var(--ink-3)',boxShadow:tab===k?'var(--sh-1)':'none'}}>{l}</button>)}</div>
{tab==='sk'&&<div className="row card" style={{padding:'0 13px',height:34,gap:8,borderRadius:10,boxShadow:'none',color:'var(--ink-3)'}}><Ic.search size={15}/>
<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search skills" style={{border:0,background:'none',outline:'none',color:'var(--ink)',width:170,fontFamily:'inherit',fontSize:13}}/></div>}</div>
{tab==='sk'&&(sk.loading?<CardsSkeleton n={4}/>:!list.length?<HubEmpty icon={<Ic.bolt size={20}/>} label="No skills in your catalog yet" sub="The skills Paige can run for your business appear here as they're enabled."/>
:!rows.length?<HubEmpty icon={<Ic.search size={20}/>} label="No skills match" sub="Try a different search."/>
:<div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:12}}>{rows.map((s,i)=>
<div key={i} className="card" style={{padding:'16px 18px'}}>
<div className="row" style={{gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
<span className="mono" style={{flex:'none',width:30,height:30,borderRadius:9,background:'var(--rail)',color:'var(--gold-bright)',display:'grid',placeItems:'center',fontSize:11.5,fontWeight:600}}>{s.i}</span>
<div className="grow" style={{minWidth:240}}>
<div className="row" style={{gap:8,flexWrap:'wrap'}}><span style={{fontWeight:600,fontSize:14.5,letterSpacing:'-.01em'}}>{s.n}</span>
<span className="mono pill pill-n">{s.slug}</span>
{s.ro&&<span className="pill pill-ok">read-only</span>}{s.cat&&<span className="pill" style={{background:'var(--violet-tint)',color:'var(--violet)'}}>{s.cat}</span>}</div>
{s.d&&<p style={{fontSize:13,color:'var(--ink-2)',marginTop:7,lineHeight:1.6,maxWidth:760}}>{s.d}</p>}
<div className="row" style={{gap:8,marginTop:9,flexWrap:'wrap'}}><span className="mono sub">{s.runs} runs · {s.ok} clean</span>
{s.trig.length>0&&<><span className="sub">triggers:</span>{s.trig.map(t=><span key={t} className="pill pill-n">{t}</span>)}</>}</div></div>
<div className="row" style={{gap:9}}>
<button onClick={()=>setList(l=>l.map((x,j)=>j===i?{...x,on:!x.on}:x))} className="row" style={{gap:7}}>
<span style={{width:42,height:24,borderRadius:99,padding:2,background:s.on?'var(--ink)':'var(--surface-sunk)',display:'flex',justifyContent:s.on?'flex-end':'flex-start',transition:'.15s'}}>
<span style={{width:20,height:20,borderRadius:'50%',background:'#fff',boxShadow:'var(--sh-1)'}}/></span>
<span className="mono" style={{fontSize:11,fontWeight:700,color:s.on?'var(--ok)':'var(--ink-3)'}}>{s.on?'ON':'OFF'}</span></button>
<button className="btn btn-s"><Ic.send size={12}/>Test</button></div></div></div>)}</div>)}
{tab==='runs'&&<HubEmpty preview icon={<Ic.pulse size={20}/>} label="Run history isn't wired yet" sub="A live feed of each skill run — outcome, duration, and when — lands here."/>}
{tab==='prop'&&<HubEmpty preview icon={<Ic.spark size={20}/>} label="No skill proposals yet" sub="When Paige spots a recipe worth saving, she'll propose it here for your yes."/>}
{tab==='forge'&&<div className="card"><div className="hd"><div><div className="row" style={{gap:8}}><h3>Forge a new skill</h3><PreviewPill/></div><div className="sub">Describe the recipe. Paige writes it, names its triggers, and tests it three times before it runs alone.</div></div></div>
<div style={{padding:'16px 20px 20px',display:'grid',gap:11}}>
<textarea placeholder="e.g. when a client's hours pass 120% of budget, draft a scope conversation citing the specific overage and offer two paths"
style={{minHeight:110,resize:'vertical',border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'12px 14px',background:'var(--surface-2)',color:'var(--ink)',fontFamily:'inherit',fontSize:13.4,outline:'none',lineHeight:1.6}}/>
<div className="row" style={{gap:9,flexWrap:'wrap'}}><span className="pill pill-n">Read-only</span><span className="pill pill-n">Needs approval x3</span>
<button className="btn btn-p" style={{marginLeft:'auto'}}><Ic.spark size={15}/>Forge it</button></div></div></div>}</div>};

const PaigeTeam=()=>{const pt=useSoloPaigeTeam();const team=pt.team;const n=team.length;
if(pt.loading)return <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:16}}>
<div className="card" style={{padding:'16px 20px',height:56,background:'var(--surface-2)'}}/><CardsSkeleton n={3}/></div>;
if(!pt.configured||!n)return <HubEmpty icon={<Ic.grid size={20}/>} label="Your departments aren't set up yet" sub="Once Paige's departments are configured, each one's live queue and autonomy shows here."/>;
return <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:16}}>
<div className="card" style={{padding:'16px 20px',background:'var(--surface-2)',fontSize:13,color:'var(--ink-2)',lineHeight:1.6}}>
<span style={{fontWeight:600,color:'var(--ink)'}}>One Paige, {n} department{n===1?'':'s'}. </span>She hands work between them the way a staffed team would, and every handoff is on the Action Bus. Set how far each department goes before it needs you.</div>
<div className="g3">{team.map((d,i)=><div key={i} className="card" style={{padding:'16px 18px',display:'flex',flexDirection:'column',gap:11}}>
<div className="row" style={{gap:11}}>
<span className="tile" style={{width:34,height:34,borderRadius:11,background:d.c+'1f',color:d.c}}><Ic.spark size={16}/></span>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontWeight:600,fontSize:14,display:'block'}}>{d.n}</span>
<span className="sub trunc" style={{display:'block'}}>{d.role}</span></span>
<span className="pill pill-ok"><span className="dot"/>Ready</span></div>
<div className="row" style={{gap:9,fontSize:12.4,color:'var(--ink-2)'}}>
<span className="row" style={{gap:6}}><Ic.arrow size={13} style={{color:'var(--ink-3)'}}/>Hands to {d.handoff}</span>
{d.open>0&&<span className="pill pill-warn" style={{marginLeft:'auto'}}>{d.open} open</span>}</div>
<div><div className="row" style={{justifyContent:'space-between',marginBottom:7}}><span className="row" style={{gap:6}}><span className="eyebrow" style={{fontSize:10}}>Autonomy</span><PreviewPill/></span>
<span style={{fontSize:11.5,fontWeight:600,color:d.level>2?'var(--gold)':'var(--ink-3)'}}>{LVL[d.level-1]}</span></div>
<div className="row" style={{gap:4}} title="Autonomy control is a preview — not yet wired to a live setting">{[1,2,3,4].map(l=><div key={l}
style={{height:6,flex:1,borderRadius:3,background:l<=d.level?(d.level>2?'var(--gold)':'var(--violet)'):'var(--surface-sunk)'}}/>)}</div></div>
<div className="row" style={{gap:8,marginTop:'auto'}}><button className="btn btn-s">Open queue</button><button className="btn btn-s">Playbook</button></div></div>)}</div></div>};

export const PaigeHub=()=>{const[tab,setTab]=useSubtabRoute("solo","paige","chat");
const tabs=[['chat','Chat',()=><Ic.mail size={15}/>],['know','Knowledge',()=><Ic.spark size={15}/>],['sub','Sub-Agents',()=><Ic.users size={15}/>],
['act','Actions',()=><Ic.check size={15}/>,3],['skills','Skills',()=><Ic.bolt size={15}/>],['team','Paige Team',()=><Ic.grid size={15}/>]];
const heads={know:['What she knows','Knowledge','Her memory, drawn as it actually is — six domains, wired together, growing every time you teach her something.'],
sub:['Automation','Sub-Agents','Specialists Paige delegates to, and the ones she wants to build next.'],
act:['Automation · Action Bus','Actions','The work her departments hand each other — filed, drafted, waiting on you, or done.'],
skills:['Paige Skills','Skills Hub','Reusable recipes she can run on demand. High-risk ones wait for your confirm on the first three runs.'],
team:['Standing team','Paige Team','Six departments, one agent, and the autonomy you set for each.']};
const body={know:<Knowledge/>,sub:<SubAgents/>,act:<Actions/>,skills:<Skills/>,team:<PaigeTeam/>}[tab];
return <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0}}>
<SubTabs tabs={tabs} cur={tab} set={setTab}/>
{tab==='chat'?<div style={{flex:1,minHeight:0}}><Agent/></div>:
<div style={{flex:1,minHeight:0,overflow:'auto'}}><Wrap>
<PageHead eyebrow={heads[tab][0]} title={heads[tab][1]} sub={heads[tab][2]}/>
<div key={tab} className="fade-in">{body}</div></Wrap></div>}</div>};
