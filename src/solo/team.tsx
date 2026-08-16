// @ts-nocheck
import React from "react";
import { Ic, Avatar, Meter, SlideOut, SubTabs, Wrap, PageHead } from "./_shared";
import { TM_DIR_SEED, TmDirectory } from "./team-dir";
import { TmRoles, InviteFlow } from "./team-roles";

export const TM={
people:[
 {n:'Jordan Avery',role:'Founder & Principal',dept:'Leadership',type:'Owner',status:'Active',pres:'online',
  cap:96,load:112,accts:8,openWork:14,resp:'2.4h',win:'44%',pipe:38400,saved:0,
  covers:['All departments'],note:'You are over capacity by twelve hours. Two of the four things eating them are inside her range already.'},
 {n:'Maya Rios',role:'Account lead',dept:'Client Success',type:'Employee',status:'Invited',pres:'pending',
  cap:80,load:0,accts:3,openWork:0,resp:'—',win:'—',pipe:0,saved:0,
  covers:['Client Success','Marketing'],note:'Invite sent three days ago, not opened. Three accounts are staged and waiting for her first sign-in.'},
 {n:'Devon Park',role:'Strategist',dept:'Delivery',type:'Contractor',status:'Invited',pres:'pending',
  cap:40,load:0,accts:3,openWork:0,resp:'—',win:'—',pipe:0,saved:0,
  covers:['Operations'],note:'Contract runs through December at twenty hours a week. Nothing has moved to him yet.'},
 {n:'Sasha Kim',role:'Client success',dept:'Client Success',type:'Contractor',status:'Not invited',pres:'off',
  cap:20,load:0,accts:2,openWork:0,resp:'—',win:'—',pipe:0,saved:0,
  covers:['Client Success'],note:'Seat built but never sent. Selby and Okonkwo sit under her name on paper only.'},
 {n:'Dolores Ruiz',role:'CPA',dept:'Finance',type:'Advisor',status:'Not invited',pres:'off',
  cap:6,load:0,accts:0,openWork:0,resp:'—',win:'—',pipe:0,saved:0,
  covers:['Finance (read-only)'],note:'Reads the books quarterly. Read-only guest seat, no client access.'}],
depts:[
 {n:'Client Success',role:'Onboarding, answers, nurture',level:2,queue:3,done:41,saved:22,c:'var(--violet)',owner:'Maya Rios (invited)',
  note:'Drafts every onboarding sequence and answers routine client mail. Waiting on you for anything that changes scope.'},
 {n:'Owner Ops',role:'Pipeline, follow-ups, retainers',level:1,queue:2,done:28,saved:16,c:'var(--gold)',owner:'You',
  note:'Keeps the pipeline honest and chases the follow-ups you forget. Everything here waits for your read.'},
 {n:'Marketing',role:'Content, campaigns, competitor watch',level:2,queue:4,done:36,saved:31,c:'#8A5A9E',owner:'You',
  note:'Writes in your voice, ships on your approval, and watches five competitors every morning.'},
 {n:'Finance',role:'Invoicing, dunning, reconciliation',level:3,queue:1,done:63,saved:38,c:'#2E7D8F',owner:'Dolores Ruiz (advisor)',
  note:'Runs invoicing and dunning on her own now. Reconciliation still comes to you monthly.'},
 {n:'Operations',role:'Scheduling, handoffs, admin',level:3,queue:0,done:71,saved:26,c:'#3F7A4B',owner:'You',
  note:'The quietest department and the busiest. Seventy-one items closed this month without a question.'},
 {n:'Systems',role:'Integrations, monitoring, repairs',level:2,queue:2,done:19,saved:14,c:'var(--bad)',owner:'You',
  note:'Watches every connection and repairs what it can. Anything touching credentials waits for you.'}],
accts:[
 {c:'Harper & Vale',own:'You',hrs:22,val:4200,paige:'Onboarding, invoicing',load:'heavy'},
 {c:'Northwind Partners',own:'You',hrs:18,val:8630,paige:'All client mail',load:'ok'},
 {c:'Bellweather Co.',own:'You',hrs:16,val:3100,paige:'Reporting, scheduling',load:'ok'},
 {c:'Ridgeline Co.',own:'You',hrs:38,val:2400,paige:'Nothing yet',load:'wrong'},
 {c:'Selby Group',own:'Sasha Kim (not invited)',hrs:36,val:1900,paige:'Nothing yet',load:'wrong'},
 {c:'Cairn Advisory',own:'You',hrs:12,val:6200,paige:'Invoicing, recaps',load:'ok'},
 {c:'Mercer Studio',own:'You',hrs:9,val:1180,paige:'Everything routine',load:'light'},
 {c:'Okonkwo Group',own:'Sasha Kim (not invited)',hrs:6,val:600,paige:'Everything routine',load:'light'}],
gaps:[
 {t:'Two accounts are assigned to a seat that has never signed in',b:'Selby and Okonkwo point at Sasha Kim. In practice you are covering both — 42 hours a month.',
  act:'Send Sasha the invite',tone:'bad'},
 {t:'No one owns the books',b:'Reconciliation is manual and lands on you the first week of every month. Dolores reads quarterly, which is after the fact.',
  act:'Raise Finance to full autonomy',tone:'warn'},
 {t:'Devon has 20 hours a week and nothing on him',b:'Ridgeline is the obvious first move. It takes 38 hours and returns $2,400 — the worst ratio in the book.',
  act:'Move Ridgeline to Devon',tone:'warn'}],
feed:[
 {who:'Finance',ai:true,t:'Sent the Ridgeline dunning reminder',d:'Second attempt. Card still declining.',w:'8 min ago'},
 {who:'Jordan Avery',ai:false,t:'Approved the Northwind kickoff sequence',d:'Five emails over fourteen days.',w:'41 min ago'},
 {who:'Marketing',ai:true,t:'Drafted the reframe email for Verity',d:'Waiting on your read. Sales autonomy is draft-only.',w:'1 hr ago'},
 {who:'Operations',ai:true,t:'Rescheduled two discovery calls',d:'Both moved out of your Thursday block.',w:'2 hrs ago'},
 {who:'Jordan Avery',ai:false,t:'Raised Finance autonomy to full',d:'Invoicing and dunning now run without approval.',w:'yesterday'},
 {who:'Systems',ai:true,t:'Reconnected the HubSpot sync',d:'Token expired overnight. Repaired in 40 seconds.',w:'yesterday'},
 {who:'Client Success',ai:true,t:'Answered 6 routine client emails',d:'All inside the approved reply library.',w:'yesterday'},
 {who:'Marketing',ai:true,t:'Flagged a competitor price change',d:'Coach Sarah Linley dropped her mid-tier to $750.',w:'2 days ago'}],
perf:[
 {k:'Accounts carried',v:'8 of 8',s:'All on you',tone:'bad'},
 {k:'Hours returned by Paige',v:'147',s:'This month across six departments',tone:'ok'},
 {k:'Response time',v:'2.4h',s:'Down from 6.1h before Paige',tone:'ok'},
 {k:'Seats live',v:'1 of 5',s:'Three invites unopened',tone:'warn'}]};

const LVLS=['Ask first','Draft only','Draft and send','Full autonomy'];
const PRES={online:['var(--ok)','Online'],pending:['var(--warn)','Invite pending'],off:['var(--ink-3)','Never signed in']};

const PersonCard=({p,onOpen})=>{const[c,lbl]=PRES[p.pres];const over=p.load>p.cap;
return <button onClick={()=>onOpen(p)} className="card" style={{padding:'14px 15px',display:'flex',flexDirection:'column',gap:10,textAlign:'left',minWidth:0}}>
<div className="row" style={{gap:11}}>
<span style={{position:'relative',flex:'none'}}><Avatar name={p.n} size={36}/>
<span style={{position:'absolute',right:-1,bottom:-1,width:11,height:11,borderRadius:'50%',background:c,border:'2px solid var(--surface)'}}/></span>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:13.4,fontWeight:600,display:'block'}}>{p.n}</span>
<span className="sub trunc" style={{fontSize:11.6,display:'block'}}>{p.role}</span></span>
<span className="pill pill-n" style={{flex:'none'}}>{p.type}</span></div>
<div>
<div className="row" style={{justifyContent:'space-between',marginBottom:5}}>
<span className="eyebrow trunc" style={{fontSize:9.6,minWidth:0}}>{p.status==='Active'?'Load vs capacity':lbl}</span>
<span className="mono" style={{fontSize:11.3,fontWeight:600,flex:'none',whiteSpace:'nowrap',color:over?'var(--bad)':p.load?'var(--ok)':'var(--ink-3)'}}>
{p.status==='Active'?p.load+'h / '+p.cap+'h':p.cap+'h available'}</span></div>
<Meter pct={p.load?p.load/p.cap*100:0} tone={over?'var(--bad)':'var(--ok)'}/></div>
<div className="row" style={{gap:6,flexWrap:'wrap'}}>
<span className="pill pill-n" style={{fontSize:10.4}}>{p.accts} accounts</span>
{p.status==='Active'?<span className="pill pill-n" style={{fontSize:10.4}}>{p.openWork} open items</span>
:<span className={'pill '+(p.status==='Invited'?'pill-warn':'pill-n')} style={{fontSize:10.4}}>{p.status}</span>}</div>
<div className="an-note" style={{fontSize:11.8,color:'var(--ink-2)',lineHeight:1.45}}>{p.note}</div>
<div className="row" style={{gap:6,marginTop:'auto',paddingTop:2}}>
<span className="sub" style={{fontSize:10.8}}>Paige covers</span>
<span className="trunc mono" style={{fontSize:10.8,color:'var(--violet)'}}>{p.covers.join(' · ')}</span></div></button>};

const DeptCard=({d,onOpen})=>(<button onClick={()=>onOpen(d)} className="card" style={{padding:'14px 15px',display:'flex',flexDirection:'column',gap:10,textAlign:'left',minWidth:0,
background:'linear-gradient(180deg,'+'var(--surface)'+' 60%,var(--surface-2))'}}>
<div className="row" style={{gap:11}}>
<span className="tile" style={{width:36,height:36,borderRadius:12,background:d.c+'1f',color:d.c,flex:'none'}}><Ic.spark size={17}/></span>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:13.4,fontWeight:600,display:'block'}}>{d.n}</span>
<span className="sub trunc" style={{fontSize:11.6,display:'block'}}>{d.role}</span></span>
<span className="pill pill-v" style={{flex:'none',fontSize:10.4}}>Paige</span></div>
<div><div className="row" style={{justifyContent:'space-between',marginBottom:5}}>
<span className="eyebrow" style={{fontSize:9.6}}>Autonomy</span>
<span style={{fontSize:11.3,fontWeight:600,color:d.level>2?'var(--gold)':'var(--ink-3)'}}>{LVLS[d.level-1]}</span></div>
<div className="row" style={{gap:4}}>{[1,2,3,4].map(l=><span key={l} style={{height:6,flex:1,borderRadius:3,
background:l<=d.level?(d.level>2?'var(--gold)':'var(--violet)'):'var(--surface-sunk)'}}/>)}</div></div>
<div className="row" style={{gap:6,flexWrap:'wrap'}}>
<span className={'pill '+(d.queue?'pill-warn':'pill-n')} style={{fontSize:10.4}}>{d.queue?d.queue+' waiting on you':'Queue clear'}</span>
<span className="pill pill-n" style={{fontSize:10.4}}>{d.done} closed</span></div>
<div className="an-note" style={{fontSize:11.8,color:'var(--ink-2)',lineHeight:1.45}}>{d.note}</div>
<div className="row" style={{gap:6,marginTop:'auto',paddingTop:2}}>
<span className="sub" style={{fontSize:10.8}}>Human owner</span><span className="trunc" style={{fontSize:10.8,color:'var(--ink-2)'}}>{d.owner}</span>
<span className="mono" style={{fontSize:10.8,color:'var(--ok)',marginLeft:'auto',flex:'none'}}>+{d.saved}h</span></div></button>);

const TmRoster=({onOpen})=>{const[v,setV]=React.useState('all');
const show=v==='people'?['p']:v==='paige'?['d']:['p','d'];
return <div className="an-2">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div style={{minWidth:0}}><h3>Who is carrying the work</h3>
<div className="sub trunc">Five people, six departments, one roster</div></div>
<div className="seg">{[['all','Everyone'],['people','People'],['paige','Paige']].map(([k,l])=>
<button key={k} aria-pressed={v===k} onClick={()=>setV(k)}>{l}</button>)}</div></div>
<div key={v} className="pane fade-in" style={{flex:1,padding:'12px 14px'}}>
{show.includes('p')&&<><div className="eyebrow" style={{marginBottom:9}}>People · 1 live, 3 invited, 1 unsent</div>
<div className="g3" style={{marginBottom:show.length>1?16:0}}>{TM.people.map(p=><PersonCard key={p.n} p={p} onOpen={onOpen}/>)}</div></>}
{show.includes('d')&&<><div className="eyebrow" style={{marginBottom:9}}>Paige's departments · 147 hours returned this month</div>
<div className="g3">{TM.depts.map(d=><DeptCard key={d.n} d={d} onOpen={onOpen}/>)}</div></>}</div></div>
<TmRail/></div>};

const TmRail=()=>(<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Where the team is thin</h3><div className="sub">What Paige would fix first</div></div></div>
<div className="pane" style={{flex:1,padding:'11px 13px',display:'grid',gap:9,alignContent:'start'}}>
{TM.gaps.map((g,i)=><div key={i} style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="row" style={{gap:8,alignItems:'flex-start'}}>
<span style={{width:6,height:6,borderRadius:'50%',background:g.tone==='bad'?'var(--bad)':'var(--warn)',flex:'none',marginTop:5}}/>
<span style={{fontSize:12.7,fontWeight:600,lineHeight:1.4}}>{g.t}</span></div>
<div style={{fontSize:12,color:'var(--ink-2)',lineHeight:1.5,marginTop:6}}>{g.b}</div>
<button className="btn btn-s btn-g" style={{height:26,fontSize:11.5,marginTop:9}}><Ic.check size={11}/>{g.act}</button></div>)}
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)'}}>
<div className="eyebrow" style={{fontSize:9.6}}>Capacity across live seats</div>
<div style={{fontSize:20,fontWeight:600,letterSpacing:'-.03em',margin:'6px 0 8px'}}>112h <span className="sub" style={{fontSize:12,fontWeight:400}}>used of 96h</span></div>
<Meter pct={116} tone="var(--bad)" h={7}/>
<div style={{fontSize:11.8,color:'var(--ink-2)',lineHeight:1.5,marginTop:9}}>Three invited seats would add 140 hours a month. Until they sign in, the only lever is her autonomy.</div>
<button className="btn btn-s" style={{height:26,fontSize:11.5,marginTop:9}}><Ic.send size={11}/>Resend all invites</button></div></div></div>);

const TmWorkload=()=>{const[sort,setSort]=React.useState('worst');
const tone={heavy:['pill-warn','Heavy'],ok:['pill-ok','Balanced'],wrong:['pill-bad','Upside down'],light:['pill-n','Light']};
const rows=[...TM.accts].sort((a,b)=>sort==='worst'?(a.val/a.hrs)-(b.val/b.hrs):b.hrs-a.hrs);
return <div className="an-2">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div style={{minWidth:0}}><h3>Account assignment</h3>
<div className="sub trunc">Who owns each account, what it costs in hours, and what she already handles</div></div>
<div className="seg">{[['worst','Worst ratio'],['hours','Most hours']].map(([k,l])=>
<button key={k} aria-pressed={sort===k} onClick={()=>setSort(k)}>{l}</button>)}</div></div>
<div className="pane" style={{flex:1}}>
<div className="row" style={{gap:12,padding:'9px 16px',position:'sticky',top:0,background:'var(--surface-2)',borderBottom:'1px solid var(--line)',zIndex:2}}>
{[['Client',1],['Owner',1],['Hrs/mo',0],['Eff. rate',0],['Paige handles',1],['Load',0]].map(([h,g],i)=>
<span key={h} className={'eyebrow '+(g?'grow':'')} style={{fontSize:9.6,flex:g?1:'none',width:g?'auto':i===2?52:i===3?70:78,textAlign:g?'left':'right'}}>{h}</span>)}</div>
{rows.map((a,i)=><div key={a.c} className="row" style={{gap:12,padding:'11px 16px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow trunc" style={{fontSize:12.9,fontWeight:500}}>{a.c}</span>
<span className="grow trunc sub" style={{fontSize:11.8}}>{a.own}</span>
<span className="mono" style={{width:52,textAlign:'right',fontSize:12.3,flex:'none'}}>{a.hrs}h</span>
<span className="mono" style={{width:70,textAlign:'right',fontSize:12.3,flex:'none',color:a.val/a.hrs<80?'var(--bad)':'var(--ink)'}}>${Math.round(a.val/a.hrs)}/h</span>
<span className="grow trunc sub" style={{fontSize:11.8,color:a.paige==='Nothing yet'?'var(--ink-3)':'var(--violet)'}}>{a.paige}</span>
<span style={{width:78,textAlign:'right',flex:'none'}}><span className={'pill '+tone[a.load][0]}>{tone[a.load][1]}</span></span></div>)}
<div style={{padding:'13px 16px',borderTop:'1px solid var(--line)',fontSize:12.7,color:'var(--ink-2)',lineHeight:1.55}}>
<span style={{color:'var(--ink)',fontWeight:600}}>Paige's read: </span>Ridgeline and Selby take 74 hours a month and return $4,300 — less than Northwind returns on 38. Those two are the whole capacity problem.</div></div></div>
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Rebalance</h3><div className="sub">Drafted, not applied</div></div></div>
<div className="pane" style={{flex:1,padding:'12px 14px',display:'grid',gap:10,alignContent:'start'}}>
{TM.people.filter(p=>p.type!=='Advisor').map(p=>{const over=p.load>p.cap;
return <div key={p.n}><div className="row" style={{gap:9,marginBottom:5}}>
<Avatar name={p.n} size={22}/><span className="grow trunc" style={{fontSize:12.4,fontWeight:500}}>{p.n}</span>
<span className="mono" style={{fontSize:11.2,color:over?'var(--bad)':'var(--ink-3)',flex:'none'}}>{p.load}h / {p.cap}h</span></div>
<Meter pct={p.load?p.load/p.cap*100:0} tone={over?'var(--bad)':'var(--ok)'} h={5}/></div>})}
<div style={{padding:'13px 14px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)',marginTop:4}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Her proposal</div>
<div style={{fontSize:12.5,color:'var(--ink-2)',lineHeight:1.55,marginTop:7}}>Move Ridgeline and Selby to Devon at his contract rate, hand their invoicing to Finance, and you drop from 112 hours to 71. Devon lands at 34 of 40.</div>
<div className="row" style={{gap:7,marginTop:11,flexWrap:'wrap'}}>
<button className="btn btn-s btn-g" style={{height:27,fontSize:11.6}}><Ic.check size={11}/>Apply the move</button>
<button className="btn btn-s" style={{height:27,fontSize:11.6}}>See the math</button></div></div></div></div></div>};

const TmPerf=()=>(<div className="an-1"><div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>How the team is doing</h3><div className="sub">This month, against last</div></div>
<button className="btn btn-s"><Ic.doc size={12}/>Export</button></div>
<div className="pane" style={{flex:1,padding:'13px 16px',display:'grid',gap:14,alignContent:'start'}}>
<div className="g4">{TM.perf.map(m=><div key={m.k} className="card" style={{padding:'12px 14px'}}>
<div className="eyebrow" style={{fontSize:9.6}}>{m.k}</div>
<div style={{fontSize:24,fontWeight:600,letterSpacing:'-.03em',margin:'5px 0 3px',
color:m.tone==='bad'?'var(--bad)':m.tone==='warn'?'var(--warn)':'var(--ok)'}}>{m.v}</div>
<div className="sub" style={{fontSize:11.4,lineHeight:1.4}}>{m.s}</div></div>)}</div>
<div><div className="eyebrow" style={{marginBottom:9}}>By department · items closed and hours returned</div>
<div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{TM.depts.map((d,i)=>{const mx=Math.max(...TM.depts.map(x=>x.done));
return <div key={d.n} className="row" style={{gap:12,padding:'11px 14px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{width:7,height:7,borderRadius:'50%',background:d.c,flex:'none'}}/>
<span className="trunc" style={{flex:'0 0 130px',fontSize:12.7,fontWeight:500}}>{d.n}</span>
<span className="grow" style={{minWidth:60}}><Meter pct={d.done/mx*100} tone={d.c} h={5}/></span>
<span className="mono" style={{width:74,textAlign:'right',fontSize:12,flex:'none'}}>{d.done} closed</span>
<span className="mono" style={{width:52,textAlign:'right',fontSize:12,color:'var(--ok)',flex:'none'}}>+{d.saved}h</span>
<span className="sub trunc cc-hide" style={{flex:'0 0 100px',fontSize:11.4}}>{LVLS[d.level-1]}</span></div>})}</div></div>
<div style={{padding:'13px 15px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',fontSize:12.9,color:'var(--ink-2)',lineHeight:1.6}}>
<span style={{color:'var(--ink)',fontWeight:600}}>Paige's read: </span>Operations and Finance closed 134 items between them without asking you anything, which is where the 147 hours came from. The departments still at draft-only are the ones with queues. Raising Client Success one level would clear three items sitting on your desk today.</div></div></div></div>);

const TmActivity=()=>{const[f,setF]=React.useState('all');
const rows=TM.feed.filter(x=>f==='all'||(f==='ai'?x.ai:!x.ai));
return <div className="an-1"><div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>What the team did</h3><div className="sub">People and departments on one timeline</div></div>
<div className="seg">{[['all','Everything'],['ai','Paige'],['human','People']].map(([k,l])=>
<button key={k} aria-pressed={f===k} onClick={()=>setF(k)}>{l}</button>)}</div></div>
<div key={f} className="pane fade-in" style={{flex:1,padding:'14px 18px'}}>
<div style={{position:'relative',paddingLeft:26}}>
<span style={{position:'absolute',left:9,top:6,bottom:6,width:1,background:'var(--line)'}}/>
{rows.map((r,i)=><div key={i} style={{position:'relative',paddingBottom:i===rows.length-1?0:15}}>
<span style={{position:'absolute',left:-22,top:3,width:13,height:13,borderRadius:'50%',border:'2px solid var(--surface)',
background:r.ai?'var(--violet)':'var(--gold)'}}/>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<span style={{fontSize:12.9,fontWeight:600}}>{r.t}</span>
<span className={'pill '+(r.ai?'pill-v':'pill-n')} style={{fontSize:10.2}}>{r.who}</span>
<span className="mono sub" style={{fontSize:10.6,marginLeft:'auto'}}>{r.w}</span></div>
<div style={{fontSize:12.2,color:'var(--ink-2)',lineHeight:1.5,marginTop:3}}>{r.d}</div></div>)}</div></div></div></div>};

const MemberDrawer=({m,onClose})=>{if(!m)return null;const isDept=!!m.role&&m.level!==undefined;
return <SlideOut open={!!m} onClose={onClose} title={m.n} sub={isDept?m.role:m.role+' · '+m.dept}
icon={isDept?<Ic.spark size={15}/>:<Ic.users size={15}/>} wide
foot={isDept?<><button className="btn btn-s btn-g"><Ic.check size={12}/>Open her queue</button><button className="btn btn-s">Adjust autonomy</button></>
:<><button className="btn btn-s btn-p"><Ic.send size={12}/>{m.status==='Not invited'?'Send invite':m.status==='Invited'?'Resend invite':'Message'}</button>
<button className="btn btn-s">Reassign accounts</button></>}>
{isDept?<>
<div className="row" style={{gap:9,flexWrap:'wrap'}}><span className="pill pill-v">Paige department</span>
<span className={'pill '+(m.level>2?'pill-ok':'pill-warn')}>{LVLS[m.level-1]}</span>
<span className="pill pill-n">{m.done} closed this month</span></div>
<div style={{fontSize:13.2,color:'var(--ink-2)',lineHeight:1.6,marginTop:14}}>{m.note}</div>
<div className="eyebrow" style={{marginTop:18}}>Autonomy</div>
<div className="row" style={{gap:5,marginTop:8}}>{[1,2,3,4].map(l=><span key={l} style={{height:7,flex:1,borderRadius:4,
background:l<=m.level?(m.level>2?'var(--gold)':'var(--violet)'):'var(--surface-sunk)'}}/>)}</div>
<div className="sub" style={{marginTop:7,fontSize:11.8}}>Set in Trust Compass. Changing it here changes it everywhere.</div>
<div className="eyebrow" style={{marginTop:18}}>This month</div>
<div className="two" style={{gap:12,marginTop:8}}>
{[['Items closed',m.done],['Hours returned','+'+m.saved+'h'],['Waiting on you',m.queue],['Human owner',m.owner]].map(([k,v])=>
<div key={k} style={{padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{fontSize:9.4}}>{k}</div><div className="trunc" style={{fontSize:14.5,fontWeight:600,marginTop:3}}>{v}</div></div>)}</div></>
:<>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<span className={'pill '+(m.status==='Active'?'pill-ok':m.status==='Invited'?'pill-warn':'pill-n')}>{m.status==='Active'&&<span className="dot"/>}{m.status}</span>
<span className="pill pill-n">{m.type}</span><span className="pill pill-n">{PRES[m.pres][1]}</span></div>
<div style={{fontSize:13.2,color:'var(--ink-2)',lineHeight:1.6,marginTop:14}}>{m.note}</div>
<div className="eyebrow" style={{marginTop:18}}>Load</div>
<div style={{marginTop:8}}><div className="row" style={{justifyContent:'space-between',marginBottom:6}}>
<span className="sub" style={{fontSize:11.8}}>{m.status==='Active'?'Booked against capacity':'Capacity if they sign in'}</span>
<span className="mono" style={{fontSize:12.3,fontWeight:600,color:m.load>m.cap?'var(--bad)':'var(--ink-2)'}}>{m.load}h / {m.cap}h</span></div>
<Meter pct={m.load?m.load/m.cap*100:0} tone={m.load>m.cap?'var(--bad)':'var(--ok)'} h={7}/></div>
<div className="eyebrow" style={{marginTop:18}}>Accounts on their name</div>
<div style={{marginTop:8,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{TM.accts.filter(a=>a.own.split(' (')[0]===m.n||(m.type==='Owner'&&a.own==='You')).map((a,i)=>
<div key={a.c} className="row" style={{gap:12,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow trunc" style={{fontSize:12.6}}>{a.c}</span>
<span className="mono sub" style={{fontSize:11.4,flex:'none'}}>{a.hrs}h · ${Math.round(a.val/a.hrs)}/h</span></div>)}
{!TM.accts.some(a=>a.own.split(' (')[0]===m.n||(m.type==='Owner'&&a.own==='You'))&&
<div className="sub" style={{padding:'12px 13px',fontSize:12}}>Nothing assigned.</div>}</div>
<div className="eyebrow" style={{marginTop:18}}>What Paige covers for them</div>
<div className="row" style={{gap:6,marginTop:8,flexWrap:'wrap'}}>{m.covers.map(c=><span key={c} className="pill pill-v">{c}</span>)}</div>
{m.status==='Active'&&<><div className="eyebrow" style={{marginTop:18}}>Performance</div>
<div className="two" style={{gap:12,marginTop:8}}>
{[['Open items',m.openWork],['Response time',m.resp],['Proposal win rate',m.win],['Pipeline owned','$'+m.pipe.toLocaleString()]].map(([k,v])=>
<div key={k} style={{padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{fontSize:9.4}}>{k}</div><div style={{fontSize:14.5,fontWeight:600,marginTop:3}}>{v}</div></div>)}</div></>}
<div className="sub" style={{marginTop:16,fontSize:11.8,lineHeight:1.55}}>Seat permissions, sealed-record access and the reporting line live in Setup. This view is about the work.</div></>}</SlideOut>};

export const TeamHub=()=>{const[tab,setTab]=React.useState('roster');const[cur,setCur]=React.useState(null);
const[dir,setDir]=React.useState(TM_DIR_SEED);const[inv,setInv]=React.useState(null);
const openInv=r=>setInv({r:r||null,k:Date.now()});
const tabs=[['roster','Roster',()=><Ic.users size={14}/>],['dir','Directory',()=><Ic.mail size={14}/>],
['roles','Roles & invites',()=><Ic.shield size={14}/>],['work','Workload',()=><Ic.grid size={14}/>],
['perf','Performance',()=><Ic.trend size={14}/>],['act','Activity',()=><Ic.pulse size={14}/>]];
const subs={roster:'Everyone doing the work — the people you hired and the departments she runs — in one roster.',
dir:'Team members only. Photos, contact details, role and reporting line — all editable in place.',
roles:'What each role is responsible for, what it unlocks, and who can invite into it.',
work:'What each account costs in hours, who owns it, and where the load is wrong.',
perf:'Closed work, hours returned, and the honest numbers per department.',
act:'A single timeline of what people did and what she did on her own.'};
const body={roster:<TmRoster onOpen={setCur}/>,dir:<TmDirectory dir={dir} setDir={setDir} onInvite={openInv}/>,
roles:<TmRoles invite={inv} setInvite={openInv}/>,work:<TmWorkload/>,perf:<TmPerf/>,act:<TmActivity/>}[tab];
return <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0,minWidth:0,alignItems:'stretch'}}>
<SubTabs tabs={tabs} cur={tab} set={setTab} right={<>
<span className="pill pill-n"><span className="dot" style={{background:'var(--bad)'}}/>112h of 96h booked</span>
<button className="btn btn-s" onClick={()=>setTab('roles')}><Ic.shield size={13}/>Roles</button>
<button className="btn btn-s btn-p" onClick={()=>openInv(null)}><Ic.plus size={13}/>Invite someone</button></>}/>
<Wrap><PageHead eyebrow="Team" title={(tabs.find(t=>t[0]===tab)||[])[1]} sub={subs[tab]}/>
<div key={tab} className="fade-in an-fill">{body}</div></Wrap>
<MemberDrawer m={cur} onClose={()=>setCur(null)}/>
<InviteFlow key={inv&&inv.k} open={!!inv} seed={inv&&inv.r} onClose={()=>setInv(null)}/></div>};
