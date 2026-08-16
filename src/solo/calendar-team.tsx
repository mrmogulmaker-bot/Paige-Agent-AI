// @ts-nocheck
import React from "react";
import { Ic, Avatar } from "./_shared";
import { SetSect } from "./calendar-settings";
import { CfgRow, Sw } from "./calendar-cfg";

export const TCAL={
seats:[
 {n:'Antonio Cook',role:'Founder & Principal',cap:'4 calls a day',host:true,join:true,cal:'Google · connected',st:'Active',
  can:['Host every link','See every client','Move any booking','Collect payment'],
  note:'Every link can land on you, which is the problem — you are at 112 hours against 96.'},
 {n:'Maya Rios',role:'Account lead · Client Success',cap:'3 calls a day',host:true,join:true,cal:'Not connected',st:'Invited',
  can:['Host onboarding and quarterly reviews','See her three accounts','Reschedule her own calls'],
  note:'Her invite has been unopened three days. She can be assigned now, but nothing routes to her until she signs in and connects a calendar.'},
 {n:'Devon Park',role:'Strategist · contractor',cap:'2 calls a day',host:false,join:true,cal:'Not connected',st:'Invited',
  can:['Join deep-dives as second chair','See the account he is on the call for'],
  note:'Twenty hours a week through December. Second chair on deep-dives is the cheapest way to use him.'},
 {n:'Sasha Kim',role:'Client success · appointment setter',cap:'Books, does not host',host:false,join:false,cal:'Not connected',st:'Not invited',
  can:['Book on your behalf','See name, company and intake answers only'],
  note:'The setter seat. She fills your calendar from the consult link and never runs the call. Her invite was built and never sent.'},
 {n:'Dolores Ruiz',role:'CPA · advisor',role2:'Advisor',cap:'Quarterly only',host:false,join:true,cal:'Not connected',st:'Not invited',
  can:['Join a quarterly review when a filing is on the agenda'],
  note:'Read-only guest. She joins when the agenda has a filing on it, and sees nothing else.'}],
matrix:[
 ['Free consult','Round robin · you and Maya','—','Sasha books it'],
 ['Client onboarding call','Maya hosts, you on the first one','You, for the first three','—'],
 ['Quarterly compliance review','You','Dolores, when a filing is on the agenda','—'],
 ['Document signing session','Round robin · you and Maya','—','—'],
 ['Trust setup deep-dive','You only','Devon, second chair','—'],
 ['Trust structures webinar','You present','Maya moderates Q&A','—']],
rules:[
 ['Distribution','Equal, then whoever is free soonest','Keeps the count even without making a client wait three days for fairness.'],
 ['Setter to closer','Sasha books it, the closer runs it','She never appears as the host. The client sees whoever is taking the call.'],
 ['Shadow mode','A joiner sees the call and the record, and cannot change either','For training a rep without handing over the account.'],
 ['Respect their caps','Maya stops at three, Devon at two','Her cap wins over your round robin. She will not be offered a fourth.'],
 ['Escalate to you','Anything over $10k in pipeline','A rep can take the call, but you hear about it before it happens.']]};

export const TeamAssignPanel=()=>{const[p,setP]=React.useState(null);
return <>
<SetSect t="Who can be assigned" d="Pulled from your Team tab. Assignment is separate from access — someone can run a call without seeing the account.">
<div style={{marginTop:10,display:'grid',gap:8}}>
{TCAL.seats.map(s=>{const open=p===s.n;const blocked=s.st!=='Active';
return <div key={s.n} style={{border:'1px solid '+(open?'var(--violet)':'var(--line)'),borderRadius:'var(--r-m)',overflow:'hidden',transition:'.15s'}}>
<button onClick={()=>setP(open?null:s.n)} className="row" style={{width:'100%',gap:11,padding:'12px 13px',textAlign:'left',alignItems:'flex-start'}}>
<Avatar name={s.n} size={30}/>
<span className="grow" style={{minWidth:0,display:'block'}}>
<span className="row" style={{gap:7,flexWrap:'wrap'}}><span className="trunc" style={{fontSize:12.8,fontWeight:600}}>{s.n}</span>
<span className={'pill '+(s.st==='Active'?'pill-ok':s.st==='Invited'?'pill-warn':'pill-n')} style={{fontSize:10}}>{s.st}</span></span>
<span className="trunc" style={{display:'block',fontSize:11.4,color:'var(--ink-3)',marginTop:2}}>{s.role} · {s.cap}</span></span>
<span className="row cc-hide" style={{gap:6,flex:'none'}}>
<span className="pill" style={{fontSize:10,background:s.host?'var(--violet-tint)':'var(--surface-sunk)',color:s.host?'var(--violet)':'var(--ink-3)'}}>{s.host?'Can host':'No hosting'}</span>
<span className="pill" style={{fontSize:10,background:s.join?'#2E7D8F18':'var(--surface-sunk)',color:s.join?'#2E7D8F':'var(--ink-3)'}}>{s.join?'Can join':'No joining'}</span></span>
<span style={{color:'var(--ink-3)',display:'flex',marginTop:3,flex:'none',transform:open?'rotate(90deg)':'',transition:'.18s'}}><Ic.chev size={14}/></span></button>
{open&&<div className="fade-in" style={{borderTop:'1px solid var(--line-soft)',background:'var(--surface-2)'}}>
<CfgRow k="Can host a call" v={s.host?'Yes — appears as the host on the page':'No'} sw on={s.host} c="var(--violet)"/>
<CfgRow k="Can join yours" v={s.join?'Yes — second chair, shadow or moderator':'No'} sw on={s.join} c="#2E7D8F"/>
<CfgRow k="Their calendar" v={s.cal} note={s.cal==='Not connected'?'Nothing routes to them until a calendar is connected — she cannot check for conflicts against nothing.':null}/>
<CfgRow k="Daily cap" v={s.cap}/>
<div style={{padding:'11px 13px',borderTop:'1px solid var(--line-soft)'}}>
<div className="eyebrow" style={{fontSize:9.4}}>What they may do</div>
<div style={{display:'grid',gap:5,marginTop:7}}>{s.can.map(x=><span key={x} className="row" style={{gap:7,fontSize:11.8,color:'var(--ink-2)'}}>
<span style={{width:4,height:4,borderRadius:'50%',background:'var(--violet)',flex:'none',display:'block'}}/>{x}</span>)}</div></div>
<div style={{padding:'11px 13px',borderTop:'1px solid var(--line-soft)',fontSize:11.8,color:'var(--ink-2)',lineHeight:1.55}}>
<span style={{fontWeight:600,color:'var(--ink)'}}>Paige's read: </span>{s.note}</div>
{blocked&&<div className="row" style={{gap:7,padding:'11px 13px',borderTop:'1px solid var(--line-soft)',flexWrap:'wrap'}}>
<button className="btn btn-s btn-g" style={{height:26,fontSize:11.4}}><Ic.mail size={11}/>{s.st==='Invited'?'Resend the invite':'Send the invite'}</button>
<button className="btn btn-s" style={{height:26,fontSize:11.4}}>Assign anyway, hold the routing</button></div>}</div>}</div>})}</div>
<button className="btn btn-s" style={{marginTop:9}}><Ic.users size={12}/>Open the Team tab</button></SetSect>
<SetSect t="Who is on what" d="One row per link. Hosts run it, joiners sit in, setters book it.">
<div className="tbl" style={{marginTop:10,border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div style={{minWidth:560}}>
<div className="row" style={{gap:10,padding:'9px 13px',background:'var(--surface-2)',borderBottom:'1px solid var(--line)'}}>
{['Link','Hosts','Joins','Books it'].map((h,i)=><span key={h} className="eyebrow" style={{fontSize:9.2,flex:i?'1 1 0':'1.3 1 0',minWidth:0}}>{h}</span>)}</div>
{TCAL.matrix.map(([l,h,j,b],i)=><div key={l} className="row" style={{gap:10,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="trunc" style={{flex:'1.3 1 0',minWidth:0,fontSize:12.2,fontWeight:600}}>{l}</span>
<span className="trunc" style={{flex:'1 1 0',minWidth:0,fontSize:11.8,color:'var(--ink-2)'}}>{h}</span>
<span className="trunc" style={{flex:'1 1 0',minWidth:0,fontSize:11.8,color:j==='—'?'var(--ink-3)':'#2E7D8F'}}>{j}</span>
<span className="trunc" style={{flex:'1 1 0',minWidth:0,fontSize:11.8,color:b==='—'?'var(--ink-3)':'var(--ink-2)'}}>{b}</span></div>)}</div></div>
<div className="sub" style={{marginTop:8,fontSize:11.6,lineHeight:1.5}}>Set per link in its own drawer under Hosts. This is the read-across so you can see it in one place.</div></SetSect>
<SetSect t="How assignment behaves">
<div style={{marginTop:10,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{TCAL.rules.map(([k,v,n],i)=><div key={k} style={{padding:'11px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<div className="row" style={{gap:10}}><span className="eyebrow" style={{fontSize:9.4,width:120,flex:'none'}}>{k}</span>
<span className="grow" style={{fontSize:12.2,color:'var(--ink-2)'}}>{v}</span><Sw on c="var(--violet)"/></div>
<div style={{fontSize:11.4,color:'var(--ink-3)',lineHeight:1.45,marginTop:5,paddingLeft:130}}>{n}</div></div>)}</div></SetSect>
<div style={{padding:'12px 13px',border:'1px dashed var(--gold-line)',borderRadius:'var(--r-m)',background:'var(--gold-tint)'}}>
<div className="eyebrow" style={{fontSize:9.6,color:'var(--gold)'}}>Three of five seats cannot receive a booking yet</div>
<div style={{fontSize:12.2,color:'var(--ink-2)',lineHeight:1.5,marginTop:6}}>Maya and Devon have unopened invites, Sasha's was never sent, and none of the three has a calendar connected. You can assign them today — the routing holds until they sign in.</div>
<button className="btn btn-s btn-g" style={{height:26,fontSize:11.5,marginTop:9}}><Ic.mail size={11}/>Send all three invites</button></div></>};

export const OnCall=({e})=>{const deep=e.n.includes('deep-dive'),quart=e.n.includes('Quarterly'),onb=e.n.includes('Onboarding');
const who=[['Antonio Cook','Host','var(--violet)']];
if(deep)who.push(['Devon Park','Second chair','#2E7D8F']);
if(quart)who.push(['Dolores Ruiz','Joins for the filing','#2E7D8F']);
if(onb)who.push(['Maya Rios','Host after this one','var(--violet)']);
return <><div className="eyebrow" style={{marginTop:18}}>Who is on this call</div>
<div style={{marginTop:8,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{who.map(([n,r,c],i)=><div key={n} className="row" style={{gap:10,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<Avatar name={n} size={24}/><span className="grow trunc" style={{fontSize:12.2,fontWeight:600}}>{n}</span>
<span className="pill" style={{fontSize:10,flex:'none',background:c+'18',color:c}}>{r}</span></div>)}</div>
<div className="row" style={{gap:7,marginTop:9,flexWrap:'wrap'}}>
<button className="btn btn-s" style={{height:26,fontSize:11.4}}><Ic.plus size={11}/>Add a team member</button>
<button className="btn btn-s" style={{height:26,fontSize:11.4}}>Hand the call over</button></div></>};
