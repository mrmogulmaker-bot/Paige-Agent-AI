// @ts-nocheck
import React from "react";
import { Ic, Avatar, SubTabs } from "./_shared";
import { TIER, TenantAutomationsLibrary, TenantAutomationsRuns, RuleDrawer, RunDrawer } from "./automations";

export const AUB={
seed:[
 {who:'you',t:'Every time a client\'s card fails twice, wait 24 hours then send the retry sequence, and flag me if it fails a third time.'},
 {who:'paige',t:'Got it. Two failures on the same card, a 24-hour hold, then the retry sequence — and you hear about it only if a third failure lands.'},
 {who:'paige',t:'Two things before I file it. Should the flag reach you by email or in chat? And is "retry sequence" the standard three-message flow you already use for Ridgeline, or a custom one for this?',
  opts:['Chat, standard flow','Email, standard flow','Let me write custom copy']},
 {who:'you',t:'Chat, and use the standard flow.'},
 {who:'paige',t:'Filed. I named it, put it under Finance, and set it to confirm for the first thirty days — once it runs clean I will ask you about promoting it to auto.',
  draft:{n:'Dunning · Two-fail retry with escalation',dept:'Finance',c:'#2E7D8F',tier:'confirm',
   trig:'When a client\'s card fails twice, then wait 24 hours',
   act:'Send the standard three-message retry sequence · flag Jordan in chat on a third failure',
   why:'Confirm, not auto, because money leaving a client\'s account in your name is the kind of thing you want to see for a month first.'}}],
chips:['Automate my dunning sequence','Send a welcome kit when a new client signs up','Flag me when a client goes quiet for two weeks','Run my Monday brief every week'],
replies:{
 'Automate my dunning sequence':{t:'You already have one running under Finance — Dunning · Two-fail retry. Do you want a second rule for a different failure pattern, or should I edit that one?',
  opts:['Edit the existing rule','Build a second one']},
 'Send a welcome kit when a new client signs up':{t:'That one exists too, and it is running clean — nine sends since July on auto. Worth checking whether the fifth email still reads right.',
  opts:['Open the existing rule','Rewrite the fifth email']},
 'Flag me when a client goes quiet for two weeks':{t:'Nothing covers that yet. Quiet meaning no inbound mail, no call answered, no portal login — all three, or any one of them?',
  opts:['All three','Any one of them'],
  draft:{n:'Client silence · Two-week quiet flag',dept:'Client Success',c:'var(--violet)',tier:'confirm',
   trig:'When a client has no inbound mail, answered call or portal login for 14 days',
   act:'Open a Client Success item with the last three touches attached, and put it on your desk',
   why:'Confirm because the first thing you will want to change is the wording, and I would rather you see it than find it sent.'}},
 'Run my Monday brief every week':{t:'Running since June, every Monday at 6:30am, eleven clean runs. You open it inside nine minutes on average — I would leave it alone.',
  opts:['Change the time','Add cash flow to it']}},
tpl:[
 {n:'Standard dunning sequence',d:'Two failures, a hold, three messages, one escalation.',dept:'Finance',used:'Running'},
 {n:'New-client onboarding',d:'Kickoff sequence plus the checklist, off the signed agreement.',dept:'Client Success',used:'Running'},
 {n:'Weekly digest',d:'Pipeline, cash and queue in one brief on the morning you pick.',dept:'Owner Ops',used:'Running'},
 {n:'Quiet-client watch',d:'Flags an account that has gone silent longer than your threshold.',dept:'Client Success',used:'Not adopted'},
 {n:'Proposal chase',d:'Three touches at widening gaps until they reply.',dept:'Owner Ops',used:'Drafted'},
 {n:'Token expiry watch',d:'Refreshes integration credentials before they lapse.',dept:'Systems',used:'Broken'}],
recent:[
 {n:'Dunning · Two-fail retry with escalation',w:'Aug 2',st:'Live'},
 {n:'Competitor watch · Daily price scan',w:'Aug 11',st:'Live'},
 {n:'Scheduling · Thursday conflict resolver',w:'Aug 6',st:'Live'},
 {n:'Proposal follow-up · Three-touch chase',w:'Aug 14',st:'Draft'}]};

export const DraftCard=({d,onSave})=>{const[c,lbl]=TIER[d.tier];const[saved,setSaved]=React.useState(false);
return <div className="card fade-in" style={{padding:0,overflow:'hidden',borderColor:saved?'var(--ok)':'var(--gold-line)',boxShadow:'var(--sh-2)'}}>
<div className="row" style={{gap:9,padding:'10px 14px',background:saved?'var(--ok-tint)':'var(--gold-tint)',borderBottom:'1px solid '+(saved?'var(--ok)':'var(--gold-line)')}}>
<span style={{display:'flex',color:saved?'var(--ok)':'var(--gold)',flex:'none'}}>{saved?<Ic.check size={14}/>:<Ic.bolt size={14}/>}</span>
<span className="eyebrow grow trunc" style={{fontSize:9.6,color:saved?'var(--ok)':'var(--gold)'}}>{saved?'Filed under '+d.dept:'Draft automation'}</span>
<span className="row" style={{gap:5,fontSize:10.8,fontWeight:600,color:c,flex:'none'}}><TierDot tier={d.tier}/>{lbl}</span></div>
<div style={{padding:'13px 15px'}}>
<div className="row" style={{gap:8,flexWrap:'wrap'}}>
<span style={{fontSize:13.4,fontWeight:600,letterSpacing:'-.01em'}}>{d.n}</span>
<span className="pill" style={{fontSize:10.2,background:d.c+'18',color:d.c}}>{d.dept}</span></div>
<div style={{display:'grid',gap:7,marginTop:10}}>
{[['WHEN',d.trig],['THEN',d.act]].map(([k,v])=><div key={k} className="row" style={{gap:9,alignItems:'flex-start'}}>
<span className="mono" style={{fontSize:10.2,color:'var(--ink-3)',width:38,flex:'none',marginTop:2}}>{k}</span>
<span style={{fontSize:12.4,color:'var(--ink-2)',lineHeight:1.5}}>{v}</span></div>)}</div>
<div style={{fontSize:12,color:'var(--ink-3)',lineHeight:1.5,marginTop:10,paddingTop:10,borderTop:'1px solid var(--line-soft)'}}>{d.why}</div>
{!saved&&<div className="row" style={{gap:7,marginTop:12,flexWrap:'wrap'}}>
<button className="btn btn-s btn-g" onClick={()=>{setSaved(true);onSave&&onSave(d)}}><Ic.check size={11}/>Save it</button>
<button className="btn btn-s"><Ic.spark size={11}/>Tweak with Paige</button>
<button className="btn btn-s" style={{color:'var(--ink-3)'}}>Discard</button></div>}</div></div>};

export const TenantAutomationsBuild=()=>{
const[msgs,setMsgs]=React.useState(AUB.seed);const[txt,setTxt]=React.useState('');const[tpl,setTpl]=React.useState(false);const[think,setThink]=React.useState(false);
const end=React.useRef(null);
React.useEffect(()=>{const p=end.current&&end.current.parentElement;if(p)p.scrollTop=p.scrollHeight},[msgs,think]);
const say=t=>{if(!t.trim())return;setTxt('');setMsgs(m=>[...m,{who:'you',t}]);setThink(true);
const r=AUB.replies[t]||{t:'Let me make sure I have it. I will need the trigger you mean, and whether this should send on its own or hold for your read — say it however it comes out and I will shape it.',
 opts:['It can send on its own','Hold it for me']};
setTimeout(()=>{setThink(false);setMsgs(m=>[...m,{who:'paige',...r}])},900)};
return <div className="an-2">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div style={{minWidth:0}}><h3>Tell her what you want automated</h3>
<div className="sub trunc">No node picker, no trigger dropdown — she drafts it, names it and files it</div></div>
<span className="pill pill-v"><Ic.spark size={11}/>Voice or text</span></div>
<div className="pane" style={{flex:1,padding:'16px 18px',display:'grid',gap:13,alignContent:'start'}}>
{msgs.map((m,i)=>m.who==='you'
?<div key={i} className="row" style={{gap:10,alignItems:'flex-start',justifyContent:'flex-end'}}>
<div style={{maxWidth:'78%',padding:'10px 13px',borderRadius:'14px 14px 4px 14px',background:'var(--surface-sunk)',fontSize:12.9,lineHeight:1.55}}>{m.t}</div>
<Avatar name="Jordan Avery" size={26} tone="var(--gold)"/></div>
:<div key={i} className="row" style={{gap:10,alignItems:'flex-start'}}>
<span className="tile" style={{width:26,height:26,borderRadius:9,background:'var(--violet-tint)',color:'var(--violet)',marginTop:1}}><Ic.spark size={13}/></span>
<div style={{maxWidth:'82%',minWidth:0,display:'grid',gap:9}}>
<div style={{padding:'10px 13px',borderRadius:'14px 14px 14px 4px',background:'var(--violet-tint)',fontSize:12.9,lineHeight:1.55,color:'var(--ink)'}}>{m.t}</div>
{m.opts&&<div className="row" style={{gap:7,flexWrap:'wrap'}}>{m.opts.map(o=>
<button key={o} className="btn btn-s" onClick={()=>say(o)} style={{height:27,fontSize:11.8}}>{o}</button>)}</div>}
{m.draft&&<DraftCard d={m.draft}/>}</div></div>)}
{think&&<div className="row fade-in" style={{gap:10}}>
<span className="tile" style={{width:26,height:26,borderRadius:9,background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.spark size={13}/></span>
<span className="row" style={{gap:4,padding:'11px 13px',borderRadius:14,background:'var(--violet-tint)'}}>
{[0,1,2].map(i=><span key={i} style={{width:5,height:5,borderRadius:'50%',background:'var(--violet)',animation:'fi .7s ease-in-out '+(i*.15)+'s infinite alternate'}}/>)}</span></div>}
<div ref={end}/></div>
<div style={{flex:'none',borderTop:'1px solid var(--line)',padding:'11px 14px 12px',background:'var(--surface-2)'}}>
<div className="row" style={{gap:8}}>
<span className="row grow" style={{gap:8,height:36,padding:'0 12px',border:'1px solid var(--line)',borderRadius:11,background:'var(--surface)',minWidth:0}}>
<input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&say(txt)}
placeholder="When this happens, do that…" style={{border:0,background:'none',outline:'none',fontSize:12.9,width:'100%',color:'var(--ink)'}}/></span>
<button className="btn btn-s" style={{width:34,height:36,padding:0,justifyContent:'center'}} title="Speak it"><Ic.pulse size={15}/></button>
<button className="btn btn-s btn-p" style={{height:36}} onClick={()=>say(txt)}><Ic.send size={13}/>Send</button></div>
<div className="row tabstrip" style={{gap:6,marginTop:9}}>
{AUB.chips.map(c=><button key={c} onClick={()=>say(c)} className="pill"
style={{height:25,cursor:'pointer',background:'var(--surface-sunk)',color:'var(--ink-2)',fontSize:11.2,fontWeight:500}}>{c}</button>)}</div>
<button onClick={()=>setTpl(!tpl)} className="row" style={{gap:7,marginTop:9,fontSize:11.8,color:'var(--ink-3)',fontWeight:500}}>
<span style={{display:'flex',transform:tpl?'rotate(90deg)':'',transition:'.18s'}}><Ic.chev size={13}/></span>Templates · six proven patterns</button>
{tpl&&<div className="g3 fade-in" style={{gap:9,marginTop:9}}>{AUB.tpl.map(t=>
<button key={t.n} onClick={()=>say('Set up the '+t.n.toLowerCase())} className="card" style={{padding:'10px 12px',textAlign:'left',minWidth:0}}>
<div className="row" style={{gap:7}}><span className="trunc grow" style={{fontSize:12.4,fontWeight:600}}>{t.n}</span>
<span className={'pill '+(t.used==='Running'?'pill-ok':t.used==='Broken'?'pill-bad':'pill-n')} style={{fontSize:10}}>{t.used}</span></div>
<div className="an-note" style={{fontSize:11.6,color:'var(--ink-2)',lineHeight:1.45,marginTop:4}}>{t.d}</div></button>)}</div>}</div></div>
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Recently built</h3><div className="sub">Everything you made by talking to her</div></div></div>
<div className="pane" style={{flex:1,padding:'12px 14px',display:'grid',gap:9,alignContent:'start'}}>
{AUB.recent.map(r=><div key={r.n} className="row" style={{gap:10,padding:'11px 12px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',alignItems:'flex-start'}}>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{display:'block',fontSize:12.4,fontWeight:600}}>{r.n}</span>
<span className="mono sub" style={{fontSize:10.8}}>Built {r.w}</span></span>
<span className={'pill '+(r.st==='Live'?'pill-ok':'pill-warn')} style={{fontSize:10.2,flex:'none'}}>{r.st}</span></div>)}
<div style={{padding:'12px 13px',border:'1px dashed var(--gold-line)',borderRadius:'var(--r-m)',background:'var(--gold-tint)'}}>
<div className="eyebrow" style={{fontSize:9.6,color:'var(--gold)'}}>One draft waiting</div>
<div style={{fontSize:12.2,color:'var(--ink-2)',lineHeight:1.5,marginTop:6}}>Proposal follow-up has been drafted since Thursday. The copy for touch one is the only thing between it and live.</div>
<button className="btn btn-s btn-g" style={{height:26,fontSize:11.5,marginTop:9}}><Ic.arrow size={11}/>Resume it</button></div>
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige's read</div>
<div style={{fontSize:12.3,color:'var(--ink-2)',lineHeight:1.55,marginTop:7}}>The gap I would close next is silence. Nothing you run watches for a client going quiet, and two of your eight accounts have not answered anything in eleven days.</div></div></div></div></div>};

export const AutomationsHub=()=>{const[tab,setTab]=React.useState('lib');
const[rule,setRule]=React.useState(null);const[run,setRun]=React.useState(null);
const tabs=[['lib','Automations',()=><Ic.bolt size={14}/>],['runs','Runs',()=><Ic.pulse size={14}/>],['build','Build',()=><Ic.spark size={14}/>]];
const subs={lib:'Every persistent rule Paige is running for you — one home, tune from here.',
runs:'Every automation firing, every execution — one timeline across every engine.',
build:'Tell Paige what you want automated. She drafts it, names it, and files it with the right autonomy tier.'};
const body={lib:<TenantAutomationsLibrary onOpen={setRule} onBuild={()=>setTab('build')}/>,
runs:<TenantAutomationsRuns onOpen={setRun}/>,build:<TenantAutomationsBuild/>}[tab];
return <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0,minWidth:0,alignItems:'stretch'}}>
<SubTabs tabs={tabs} cur={tab} set={setTab} right={<>
<span className="pill pill-n"><span className="dot" style={{background:'var(--bad)'}}/>3 need attention</span>
<button className="btn btn-s" onClick={()=>setTab('runs')}><Ic.pulse size={13}/>Runs</button>
<button className="btn btn-s btn-g" onClick={()=>setTab('build')}><Ic.plus size={13}/>Build new</button></>}/>
<div className="fade-in pg" style={{width:'100%',maxWidth:1440,margin:'0 auto'}}>
<div className="row" style={{flex:'none',gap:12,padding:'7px 30px',borderBottom:'1px solid var(--line-soft)',background:'var(--surface)'}}>
<span className="trunc" style={{fontSize:12.3,color:'var(--ink-2)'}}>{subs[tab]}</span></div>
<div className="pg-body" style={{padding:'12px 30px 18px'}}><div key={tab} className="fade-in an-fill">{body}</div></div></div>
<RuleDrawer a={rule} onClose={()=>setRule(null)}/>
<RunDrawer r={run} onClose={()=>setRun(null)}/></div>};
