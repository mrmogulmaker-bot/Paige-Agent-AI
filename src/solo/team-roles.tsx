// @ts-nocheck
import React from "react";
import { Ic, Avatar, Foldout } from "./_shared";
import { TM } from "./team";

export const TM_ROLES=[
 {k:'Owner',n:'Owner',who:'Antonio Cook',seats:'1 of 1',admin:true,c:'var(--gold)',
  purpose:'Runs the business and answers for it. The only seat that can move autonomy or open sealed records.',
  resp:['Sets every department\'s autonomy level','Approves anything Paige drafts above draft-only','Owns pricing, contracts and repricing conversations','Signs off on new seats and role changes','Reads the books monthly'],
  owns:'All 8 accounts',
  scope:['All departments'],
  gates:[['Change autonomy',1],['Open sealed records',1],['Export client data',1],['Invite and remove seats',1],['See margin by client',1],['Billing and plan',1]]},
 {k:'Manager',n:'Account lead',who:'Maya Rios (invited)',seats:'1 of 2',admin:true,c:'var(--violet)',
  purpose:'Carries a book of accounts and the people on them. Can invite below their own level, never above it.',
  resp:['Owns the client relationship end to end','Approves Client Success and Marketing drafts','Assigns accounts to contractors under them','Runs onboarding and quarterly reviews','Escalates scope changes to the Owner'],
  owns:'Harper & Vale, Northwind, Bellweather',
  scope:['Client Success','Marketing'],
  gates:[['Change autonomy',0],['Open sealed records',0],['Export client data',2],['Invite and remove seats',2],['See margin by client',2],['Billing and plan',0]]},
 {k:'Specialist',n:'Strategist',who:'Devon Park (invited)',seats:'1 of 3',admin:false,c:'#2E7D8F',
  purpose:'Does the delivery work on assigned accounts. Sees what they need and nothing else.',
  resp:['Delivers the work on assigned accounts','Files client notes and recaps through Paige','Requests drafts from Operations','Flags scope creep to their account lead'],
  owns:'Ridgeline, Mercer, Cairn',
  scope:['Operations'],
  gates:[['Change autonomy',0],['Open sealed records',0],['Export client data',0],['Invite and remove seats',0],['See margin by client',0],['Billing and plan',0]]},
 {k:'Coordinator',n:'Client success',who:'Sasha Kim (not invited)',seats:'1 of 3',admin:false,c:'#3F7A4B',
  purpose:'Keeps assigned clients answered and on schedule. Everything they send is drafted by Paige first.',
  resp:['Answers routine client mail from the approved library','Keeps onboarding checklists moving','Books and confirms calls','Hands anything unusual to the account lead'],
  owns:'Selby, Okonkwo',
  scope:['Client Success'],
  gates:[['Change autonomy',0],['Open sealed records',0],['Export client data',0],['Invite and remove seats',0],['See margin by client',0],['Billing and plan',0]]},
 {k:'Advisor',n:'Advisor',who:'Dolores Ruiz (not invited)',seats:'1 of 2',admin:false,c:'#8A5A9E',
  purpose:'Outside expert with read access to one department. Sits off the reporting line.',
  resp:['Reviews the books quarterly','Answers tax and entity questions','Reads Finance reporting, changes nothing'],
  owns:'No accounts',
  scope:['Finance (read-only)'],
  gates:[['Change autonomy',0],['Open sealed records',3],['Export client data',0],['Invite and remove seats',0],['See margin by client',3],['Billing and plan',0]]}];
const GATE_L=[['No','var(--ink-3)'],['Yes','var(--ok)'],['Within their book','var(--warn)'],['After identity check','var(--warn)']];

const RoleRow=({r,on,onClick})=>(<button onClick={onClick} className="row" style={{width:'100%',textAlign:'left',gap:11,padding:'11px 14px',
borderTop:'1px solid var(--line-soft)',background:on?'var(--surface-2)':'transparent'}}>
<span className="tile" style={{width:30,height:30,borderRadius:10,background:r.c+'1f',color:r.c,flex:'none',fontSize:11.5,fontWeight:600,fontFamily:'var(--mono)'}}>{r.k[0]}</span>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:12.9,fontWeight:600,display:'block'}}>{r.n}</span>
<span className="sub trunc" style={{fontSize:11.3,display:'block'}}>{r.who}</span></span>
{r.admin&&<span className="pill pill-v" style={{flex:'none',fontSize:10.2}}>Admin</span>}
<span className="mono sub" style={{fontSize:10.8,flex:'none'}}>{r.seats}</span>
<Ic.chev size={13} style={{color:'var(--ink-3)',flex:'none'}}/></button>);

const RoleDetail=({r,onInvite,onEdit})=>(<div className="pane" style={{flex:1,padding:'14px 17px'}}>
<div className="row" style={{gap:11,flexWrap:'wrap'}}>
<span className="tile" style={{width:34,height:34,borderRadius:11,background:r.c+'1f',color:r.c,flex:'none',fontSize:13,fontWeight:600,fontFamily:'var(--mono)'}}>{r.k[0]}</span>
<span className="grow" style={{minWidth:0}}><span style={{fontSize:15,fontWeight:600,letterSpacing:'-.02em',display:'block'}}>{r.n}</span>
<span className="sub trunc" style={{fontSize:11.6,display:'block'}}>{r.seats} seats used · {r.owns}</span></span>
<button className="btn btn-s" onClick={onEdit}><Ic.gear size={12}/>Edit role</button>
<button className="btn btn-s btn-p" onClick={()=>onInvite(r)}><Ic.send size={12}/>Invite to this role</button></div>
<div style={{fontSize:13,color:'var(--ink-2)',lineHeight:1.6,marginTop:12}}>{r.purpose}</div>
<div className="eyebrow" style={{marginTop:17}}>Responsibilities</div>
<div style={{display:'grid',gap:6,marginTop:8}}>{r.resp.map(x=>
<div key={x} className="row" style={{gap:9,alignItems:'flex-start'}}>
<span style={{display:'flex',color:r.c,flex:'none',marginTop:1}}><Ic.check size={13}/></span>
<span style={{fontSize:12.6,color:'var(--ink-2)',lineHeight:1.5}}>{x}</span></div>)}</div>
<div className="eyebrow" style={{marginTop:17}}>Departments they can direct</div>
<div className="row" style={{gap:6,marginTop:8,flexWrap:'wrap'}}>{r.scope.map(s=><span key={s} className="pill pill-v">{s}</span>)}</div>
<div className="eyebrow" style={{marginTop:17}}>What the role unlocks</div>
<div style={{marginTop:8,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{r.gates.map(([k,v],i)=><div key={k} className="row" style={{gap:11,padding:'9px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{display:'flex',color:v?GATE_L[v][1]:'var(--ink-3)',flex:'none'}}>{v?<Ic.check size={13}/>:<Ic.x size={13}/>}</span>
<span className="grow" style={{fontSize:12.5}}>{k}</span>
<span className="sub trunc" style={{fontSize:11.6,color:GATE_L[v][1]}}>{GATE_L[v][0]}</span></div>)}</div>
<div className="sub" style={{marginTop:11,fontSize:11.6,lineHeight:1.55}}>Invites carry the role. Whoever accepts lands with exactly this reach — nothing to configure after.</div></div>);

export const InviteFlow=({open,onClose,seed})=>{const[step,setStep]=React.useState(0);
const[role,setRole]=React.useState(seed||TM_ROLES[1]);const[email,setEmail]=React.useState('');
const[accts,setAccts]=React.useState([]);const[scope,setScope]=React.useState(role.scope);
React.useEffect(()=>{if(open){setStep(0);setRole(seed||TM_ROLES[1]);setScope((seed||TM_ROLES[1]).scope);setEmail('');setAccts([])}},[open,seed]);
const pick=r=>{setRole(r);setScope(r.scope);setAccts([])};
const allA=TM.accts.map(a=>a.c);
const canSend=email.includes('@')&&role;
return <Foldout open={open} onClose={onClose} wide title="Invite someone to a role" sub="The role decides what they land with. You are not configuring permissions twice.">
<div style={{padding:'15px 20px 20px'}}>
<div className="row" style={{gap:0,marginBottom:16}}>{['Pick the role','Set their scope','Review and send'].map((s,i)=>
<div key={s} className="row grow" style={{gap:8,minWidth:0}}>
<span className="tile" style={{width:22,height:22,borderRadius:'50%',flex:'none',fontSize:11,fontWeight:600,
background:i<=step?'var(--gold)':'var(--surface-sunk)',color:i<=step?'var(--rail)':'var(--ink-3)'}}>{i+1}</span>
<span className="trunc" style={{fontSize:12.3,fontWeight:i===step?600:400,color:i<=step?'var(--ink)':'var(--ink-3)'}}>{s}</span>
{i<2&&<span className="grow" style={{height:1,background:'var(--line)',minWidth:12}}/>}</div>)}</div>

{step===0&&<div className="fade-in" style={{display:'grid',gap:9}}>
{TM_ROLES.map(r=>{const on=role.k===r.k;
return <button key={r.k} onClick={()=>pick(r)} className="row" style={{gap:12,textAlign:'left',padding:'12px 14px',
border:'1px solid '+(on?'var(--gold)':'var(--line)'),borderRadius:'var(--r-m)',background:on?'var(--gold-tint,var(--surface-2))':'transparent'}}>
<span className="tile" style={{width:30,height:30,borderRadius:10,background:r.c+'1f',color:r.c,flex:'none',fontSize:11.5,fontWeight:600,fontFamily:'var(--mono)'}}>{r.k[0]}</span>
<span className="grow" style={{minWidth:0}}><span className="row" style={{gap:8}}>
<span className="trunc" style={{fontSize:13,fontWeight:600}}>{r.n}</span>
{r.admin&&<span className="pill pill-v" style={{fontSize:10.2}}>Admin</span>}</span>
<span className="sub" style={{fontSize:11.8,display:'block',marginTop:2,lineHeight:1.45}}>{r.purpose}</span></span>
<span style={{flex:'none',display:'flex',color:on?'var(--gold)':'var(--ink-3)'}}>{on?<Ic.check size={16}/>:<Ic.plus size={14}/>}</span></button>})}
<div className="sub" style={{fontSize:11.6,lineHeight:1.55}}>You can invite at or below your own level. Owner is the only seat that can hand out Owner.</div></div>}

{step===1&&<div className="fade-in" style={{display:'grid',gap:16}}>
<div><div className="eyebrow">Their email</div>
<input value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com" className="inp"
style={{marginTop:7,width:'100%',padding:'10px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)',
color:'var(--ink)',fontSize:13,fontFamily:'inherit'}}/></div>
<div><div className="eyebrow">Departments they can direct</div>
<div className="row" style={{gap:7,marginTop:8,flexWrap:'wrap'}}>
{['Client Success','Owner Ops','Marketing','Finance','Operations','Systems'].map(d=>{const on=scope.includes(d);
const locked=!role.admin&&!role.scope.includes(d);
return <button key={d} disabled={locked} onClick={()=>setScope(s=>on?s.filter(x=>x!==d):[...s,d])}
className={'pill '+(on?'pill-v':'pill-n')} style={{height:26,cursor:locked?'not-allowed':'pointer',opacity:locked?.45:1}}>
{on&&<Ic.check size={11}/>}{d}</button>})}</div>
<div className="sub" style={{marginTop:7,fontSize:11.5}}>Greyed departments are outside the {role.n} role. Change the role to widen the reach.</div></div>
<div><div className="eyebrow">Accounts on their name</div>
<div className="row" style={{gap:7,marginTop:8,flexWrap:'wrap'}}>{allA.map(a=>{const on=accts.includes(a);
return <button key={a} onClick={()=>setAccts(s=>on?s.filter(x=>x!==a):[...s,a])} className={'pill '+(on?'pill-ok':'pill-n')} style={{height:26,cursor:'pointer'}}>
{on&&<Ic.check size={11}/>}{a}</button>})}</div>
<div className="sub" style={{marginTop:7,fontSize:11.5}}>{role.k==='Advisor'?'Advisors hold no accounts. Anything picked here is ignored.':'They see only what is ticked. Paige keeps the rest out of their search.'}</div></div></div>}

{step===2&&<div className="fade-in" style={{display:'grid',gap:14}}>
<div style={{padding:'14px 16px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="row" style={{gap:11,flexWrap:'wrap'}}>
<span className="tile" style={{width:32,height:32,borderRadius:10,background:role.c+'1f',color:role.c,flex:'none',fontSize:12.5,fontWeight:600,fontFamily:'var(--mono)'}}>{role.k[0]}</span>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:13.4,fontWeight:600,display:'block'}}>{email||'no email yet'}</span>
<span className="sub" style={{fontSize:11.8}}>Joining as {role.n}{role.admin?' · admin seat':''}</span></span></div>
<div style={{marginTop:13,display:'grid',gap:7}}>
{[['Departments',scope.join(' · ')||'None'],['Accounts',role.k==='Advisor'?'None':(accts.join(', ')||'None yet')],
['Sealed records',role.gates[1][1]?GATE_L[role.gates[1][1]][0]:'No'],['Can invite others',role.gates[3][1]?GATE_L[role.gates[3][1]][0]:'No']].map(([k,v])=>
<div key={k} className="row" style={{gap:12}}><span className="sub" style={{flex:'0 0 130px',fontSize:11.8}}>{k}</span>
<span className="grow trunc" style={{fontSize:12.5}}>{v}</span></div>)}</div></div>
<div style={{padding:'13px 15px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:10.6,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>What she sends</div>
<div style={{fontSize:12.7,color:'var(--ink-2)',lineHeight:1.6,marginTop:7}}>A one-page invite naming the role, the accounts, and what she handles for them — then a first-week checklist so they are not guessing. Two-factor is required before the seat opens.</div></div>
<div className="sub" style={{fontSize:11.6,lineHeight:1.55}}>The invite expires in seven days. Nothing is visible to them until they accept and enroll.</div></div>}

<div className="row" style={{gap:9,marginTop:18,flexWrap:'wrap'}}>
{step>0&&<button className="btn btn-s" onClick={()=>setStep(step-1)}>Back</button>}
{step<2?<button className="btn btn-s btn-p" onClick={()=>setStep(step+1)}>Continue</button>
:<button className="btn btn-s btn-g" disabled={!canSend} style={{opacity:canSend?1:.5}}><Ic.send size={12}/>Send the invite</button>}
<button className="btn btn-s" onClick={onClose} style={{marginLeft:'auto'}}>Cancel</button></div></div></Foldout>};

export const RoleEditor=({open,onClose,r})=>{if(!r)return null;
return <Foldout open={open} onClose={onClose} wide title={'Edit the '+r.n+' role'} sub="Changes apply to every seat holding this role, and to open invites.">
<div style={{padding:'15px 20px 20px',display:'grid',gap:16}}>
<div><div className="eyebrow">Role name</div>
<input defaultValue={r.n} style={{marginTop:7,width:'100%',padding:'10px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',
background:'var(--surface-2)',color:'var(--ink)',fontSize:13,fontFamily:'inherit'}}/></div>
<div><div className="eyebrow">What this role is for</div>
<textarea defaultValue={r.purpose} rows={2} style={{marginTop:7,width:'100%',padding:'10px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',
background:'var(--surface-2)',color:'var(--ink)',fontSize:13,fontFamily:'inherit',resize:'vertical',lineHeight:1.55}}/></div>
<div><div className="eyebrow">Responsibilities</div>
<div style={{marginTop:8,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{r.resp.map((x,i)=><div key={x} className="row" style={{gap:11,padding:'9px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{display:'flex',color:'var(--ink-3)',flex:'none'}}><Ic.dots size={13}/></span>
<span className="grow" style={{fontSize:12.5}}>{x}</span>
<button className="btn btn-s" style={{height:24,fontSize:11,flex:'none'}}>Edit</button></div>)}
<div className="row" style={{gap:11,padding:'9px 13px',borderTop:'1px solid var(--line-soft)'}}>
<button className="btn btn-s" style={{height:25,fontSize:11.4}}><Ic.plus size={11}/>Add a responsibility</button></div></div></div>
<div><div className="eyebrow">What the role unlocks</div>
<div style={{marginTop:8,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{r.gates.map(([k,v],i)=><div key={k} className="row" style={{gap:11,padding:'9px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow" style={{fontSize:12.5}}>{k}</span>
<div className="seg" style={{flex:'none'}}>{['No','Limited','Yes'].map((o,j)=>
<button key={o} aria-pressed={(v===0&&j===0)||((v===2||v===3)&&j===1)||(v===1&&j===2)}>{o}</button>)}</div></div>)}</div>
<div className="sub" style={{marginTop:8,fontSize:11.6,lineHeight:1.55}}>Autonomy and sealed records stay Owner-only whatever you set here. Paige will not let a role hand out more than the seat that created it holds.</div></div>
<div className="row" style={{gap:9,flexWrap:'wrap'}}><button className="btn btn-s btn-g"><Ic.check size={12}/>Save the role</button>
<button className="btn btn-s" onClick={onClose}>Cancel</button>
<span className="sub" style={{marginLeft:'auto',fontSize:11.4}}>{r.seats} seats affected</span></div></div></Foldout>};

export const TmRoles=({invite,setInvite})=>{const[i,setI]=React.useState(0);const[ed,setEd]=React.useState(false);const r=TM_ROLES[i];
return <div className="an-2">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div style={{minWidth:0}}><h3>{r.n}</h3><div className="sub trunc">Role definition and what it reaches</div></div>
<span className={'pill '+(r.admin?'pill-v':'pill-n')}>{r.admin?'Admin role':'Standard role'}</span></div>
<RoleDetail r={r} onInvite={setInvite} onEdit={()=>setEd(true)}/>
<RoleEditor open={ed} onClose={()=>setEd(false)} r={r}/></div>
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Roles</h3><div className="sub">Five defined · 1 filled</div></div>
<button className="btn btn-s"><Ic.plus size={12}/>New role</button></div>
<div className="pane" style={{flex:1}}>
{TM_ROLES.map((x,j)=><RoleRow key={x.k} r={x} on={i===j} onClick={()=>setI(j)}/>)}
<div style={{padding:'13px 14px',borderTop:'1px solid var(--line)'}}>
<div className="eyebrow" style={{fontSize:9.6}}>Open invites</div>
<div style={{display:'grid',gap:8,marginTop:9}}>
{[['Maya Rios','Account lead','sent 3d ago, unopened'],['Devon Park','Strategist','sent 3d ago, unopened'],['Sasha Kim','Client success','never sent']].map(([n,ro,st])=>
<div key={n} className="row" style={{gap:10}}><Avatar name={n} size={24}/>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:12.4,fontWeight:500,display:'block'}}>{n}</span>
<span className="sub trunc" style={{fontSize:11,display:'block'}}>{ro} · {st}</span></span>
<button className="btn btn-s" style={{height:24,fontSize:11,flex:'none'}}>{st==='never sent'?'Send':'Resend'}</button></div>)}</div>
<button className="btn btn-s btn-p" onClick={()=>setInvite(TM_ROLES[1])} style={{marginTop:11,width:'100%',justifyContent:'center'}}><Ic.send size={12}/>Invite someone</button></div></div></div></div>};
