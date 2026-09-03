// @ts-nocheck
import React from "react";
import { Ic, PageHead } from "./_shared";
import { deptTier, useTrust, MiniCompass } from "./compass";

const VLT_CATS=[['ins','Insurance','shield'],['form','Formation','doc'],['agent','Registered Agent','users'],['dom','Domain & SSL','grid'],
['tm','Trademark','vault'],['tax','Tax','chart'],['acct','Accounting','doc'],['lic','Licenses','check'],['saas','SaaS Subscriptions','store'],['cert','Certifications','spark'],['other','Custom']];
const VLT_DEPT={legal:'Legal & Compliance',fin:'Finance',ops:'Operations'};
// Real `paige_departments` slugs. The previous values were the compass fixture's invented ids, so
// a vault document's pill was decided by a hardcoded float for a department that does not exist.
const VLT_TCD={legal:'legal_compliance',fin:'finance',ops:'operations_pmo'};
// `t` is the PLATFORM DEFAULT lane for the owning department, or null when that is unreadable or
// the department has nothing routed to it. It is never a statement that this workspace approved a
// level, so the labels below say what the platform does — not what the owner authorised.
const vltState=(o,tr)=>{const t=deptTier(tr,VLT_TCD[o.dept]);
 if(o.status==='lapsed')return['Lapsed','pill-bad'];
 if(o.drafted)return t==='red'?['Your call','pill-bad']:['Draft ready','pill-v'];
 if(t==='green')return['Runs automatically','pill-ok'];
 return['Monitoring','pill-n']};
const band=d=>d<0?{k:'past',c:'var(--ink-3)',t:'var(--surface-sunk)',l:'Past due'}:d<7?{k:'crit',c:'var(--bad)',t:'var(--bad-tint)',l:'Critical'}:
 d<30?{k:'urg',c:'#C2600C',t:'#FBEBDD',l:'Urgent'}:d<60?{k:'soon',c:'var(--warn)',t:'var(--warn-tint)',l:'Approaching'}:{k:'ok',c:'var(--ok)',t:'var(--ok-tint)',l:'Healthy'};
const inDays=d=>d<0?Math.abs(d)+' days ago':d===0?'today':'in '+d+' days';

const VLT=[
 {id:'gl',n:'General liability policy',cat:'ins',org:'Hartwell Mutual',d:7,cost:'$2,340 / yr',status:'active',dept:'legal',doc:'hartwell-gl-2026.pdf',
  terms:[['Coverage limit','$1,000,000 per occurrence','high'],['Aggregate','$2,000,000','high'],['Renewal date','Aug 20, 2026','high'],['Annual premium','$2,340','high'],['Cancellation notice','30 days written','medium'],['Deductible','$1,000','low']],
  drafted:{t:'Renewal confirmation to Hartwell Mutual',b:'Hi Renee — confirming we intend to renew the general liability policy at the current limits ahead of the August 20 date. Could you send the renewal declaration and confirm the premium holds at $2,340? If anything changed on the aggregate, flag it before we sign.',tier:'amber'},
  trail:[['Reminder fired · 60 days out','Jun 21'],['Reminder fired · 30 days out','Jul 21'],['Renewal action drafted','Aug 13 · 7:04am'],['Reminder fired · 7 days out','Aug 13 · 6:02am']],rel:['pl','wc'],partner:'insurance'},
 {id:'llc',n:'Delaware LLC annual report',cat:'form',org:'Delaware Division of Corporations',d:24,cost:'$300',status:'active',dept:'legal',doc:'de-annual-2025.pdf',
  terms:[['Filing fee','$300','high'],['Due date','Sep 6, 2026','high'],['Franchise tax','Included in filing','medium'],['Late penalty','$200 + 1.5%/mo','high']],
  drafted:{t:'Filing reminder to you, with the form pre-filled',b:'Your Delaware annual report is due September 6. I pre-filled the form from last year — registered agent, officers, and address are unchanged. Review and file, or tell me to route it to your agent.',tier:'amber'},
  trail:[['Obligation created from uploaded filing','Feb 2 · 9:14am'],['Reminder fired · 60 days out','Jul 8'],['Form pre-filled from prior year','Aug 11']],rel:['agent']},
 {id:'tax3',n:'Q3 estimated tax',cat:'tax',org:'IRS Form 1040-ES',d:31,cost:'$18,400 est.',status:'active',dept:'fin',doc:'1040es-q2-2026.pdf',
  terms:[['Payment period','Jun 1 – Aug 31','high'],['Due date','Sep 15, 2026','high'],['Estimated amount','$18,400','medium'],['Safe harbor basis','110% of prior year','medium']],
  drafted:{t:'Payment worksheet and reminder',b:'Q3 estimated tax is due September 15. Based on revenue through August the estimate is $18,400, which keeps you inside safe harbor. Worksheet attached. Consult your accountant before you send if the number looks off.',tier:'amber'},
  trail:[['Estimate recalculated from revenue','Aug 1'],['Reminder fired · 60 days out','Jul 17']],rel:['tax4']},
 {id:'pl',n:'Professional liability (E&O)',cat:'ins',org:'Beacon Specialty',d:44,cost:'$1,880 / yr',status:'active',dept:'legal',doc:'beacon-eo-2026.pdf',
  terms:[['Coverage limit','$1,000,000 claims-made','high'],['Retroactive date','Mar 4, 2023','high'],['Renewal date','Sep 26, 2026','high'],['Annual premium','$1,880','high'],['Cancellation notice','45 days','medium']],
  drafted:null,trail:[['Obligation created from uploaded policy','Mar 4 · 11:02am'],['Reminder fired · 60 days out','Jul 28']],rel:['gl'],partner:'insurance'},
 {id:'dom',n:'paigeagent.ai domain',cat:'dom',org:'Cloudflare Registrar',d:58,cost:'$42 / yr',status:'active',dept:'ops',doc:null,
  terms:[['Registrar','Cloudflare','high'],['Expiry','Oct 10, 2026','high'],['Auto-renew','On','high'],['Transfer lock','Enabled','high']],
  drafted:null,trail:[['Auto-renew confirmed','Aug 1'],['WHOIS privacy verified','Aug 1']],rel:['ssl']},
 {id:'ssl',n:'Wildcard SSL certificate',cat:'dom',org:'Cloudflare',d:71,cost:'Included',status:'active',dept:'ops',doc:null,
  terms:[['Certificate','*.paigeagent.ai','high'],['Expiry','Oct 23, 2026','high'],['Renewal','Automatic','high']],
  drafted:null,trail:[['Renewal confirmed for Oct 23','Aug 8']],rel:['dom']},
 {id:'tm',n:'Trademark maintenance · §8 declaration',cat:'tm',org:'USPTO',d:112,cost:'$525',status:'active',dept:'legal',doc:'uspto-reg-2023.pdf',
  terms:[['Registration','No. 7,214,880','high'],['Filing window','Dec 3, 2026 – Jun 3, 2027','high'],['Fee','$525 per class','high'],['Classes','2','high'],['Grace period','6 months, +$250','medium']],
  drafted:null,trail:[['Obligation created from registration certificate','Dec 3 · 2:41pm'],['Window opens in 112 days','Aug 1']],rel:[],note:true},
 {id:'agent',n:'Registered agent renewal',cat:'agent',org:'Northpoint Agents',d:96,cost:'$149 / yr',status:'active',dept:'legal',doc:null,
  terms:[['Provider','Northpoint Agents','high'],['Renewal','Nov 17, 2026','high'],['Annual fee','$149','high']],
  drafted:null,trail:[['Renewed for 2026','Nov 17']],rel:['llc'],partner:'agent'},
 {id:'lic',n:'City business license',cat:'lic',org:'City of Atlanta',d:19,cost:'$225',status:'active',dept:'legal',doc:'atl-license-2025.pdf',
  terms:[['License no.','BL-2024-88431','high'],['Renewal','Sep 1, 2026','high'],['Fee','$225 + gross receipts tier','medium'],['Late penalty','10% after 30 days','high']],
  drafted:{t:'Renewal reminder with the receipts figure ready',b:'Your city business license renews September 1. The gross-receipts tier moved you up a bracket this year, so the fee is $225 plus the tier adjustment. I have the figure ready to enter.',tier:'amber'},
  trail:[['Reminder fired · 30 days out','Aug 2'],['Renewal action drafted','Aug 12']],rel:[]},
 {id:'wc',n:"Workers' compensation",cat:'ins',org:'Statewide Mutual',d:-4,cost:'$1,120 / yr',status:'lapsed',dept:'legal',doc:'statewide-wc-2025.pdf',
  terms:[['Coverage','Statutory','high'],['Expired','Aug 9, 2026','high'],['Annual premium','$1,120','high'],['Reinstatement window','30 days','medium']],
  drafted:{t:'Reinstatement request to Statewide Mutual',b:'Our workers\' compensation coverage lapsed on August 9. We would like to reinstate at the same statutory coverage inside the 30-day window. Confirm the reinstatement premium and whether a new application is required.',tier:'amber'},
  trail:[['Reminder fired · 30 days out','Jul 10'],['Reminder fired · 7 days out','Aug 2'],['Lapsed — no response recorded','Aug 9'],['Reinstatement drafted','Aug 13 · 6:40am']],rel:['gl'],partner:'insurance'},
 {id:'qb',n:'Accounting subscription',cat:'saas',org:'Ledgerly Pro',d:12,cost:'$85 / mo',status:'active',dept:'fin',doc:null,
  terms:[['Plan','Pro, 3 seats','high'],['Renews','Aug 25, 2026','high'],['Monthly cost','$85','high'],['Cancellation','Anytime, no notice','high']],
  drafted:null,trail:[['Detected from payment data','Jan 14'],['Reminder fired · 30 days out','Jul 26']],rel:['t1099']},
 {id:'t1099',n:'Contractor 1099 filings',cat:'acct',org:'IRS · 4 contractors',d:141,cost:'Filing only',status:'active',dept:'fin',doc:null,
  terms:[['Recipients','4 contractors','high'],['Deadline','Jan 31, 2027','high'],['W-9 on file','3 of 4','medium']],
  drafted:{t:'W-9 request to Okonkwo Group',b:'Quick housekeeping — we do not have a current W-9 on file for you and will need it before January filing. Two minutes, form attached.',tier:'amber'},
  trail:[['Missing W-9 detected','Aug 5'],['Request drafted','Aug 5']],rel:['qb']},
 {id:'crm',n:'CRM subscription',cat:'saas',org:'Northlight CRM',d:33,cost:'$249 / mo',status:'active',dept:'ops',doc:null,
  terms:[['Plan','Growth, 5 seats','high'],['Renews','Sep 17, 2026','high'],['Monthly cost','$249','high'],['Contract','Annual, auto-renew','high'],['Cancellation window','30 days before term','high']],
  drafted:null,trail:[['Detected from payment data','Sep 17'],['Seat usage: 2 of 5 active','Aug 1']],rel:[],flag:'Two of five seats have not been used in 60 days.'},
 {id:'tax4',n:'Q4 estimated tax',cat:'tax',org:'IRS Form 1040-ES',d:123,cost:'$18,400 est.',status:'active',dept:'fin',doc:null,
  terms:[['Due date','Jan 15, 2027','high'],['Estimated amount','$18,400','low']],drafted:null,trail:[['Scheduled from tax calendar','Jan 2']],rel:['tax3']},
 {id:'cert',n:'Board certification renewal',cat:'cert',org:'ICF · Professional Certified',d:203,cost:'$275',status:'active',dept:'ops',doc:'icf-pcc-2023.pdf',
  terms:[['Credential','PCC','high'],['Renews','Mar 4, 2027','high'],['CCE hours required','40','high'],['Hours logged','22','medium']],
  drafted:null,trail:[['Obligation created from certificate','Mar 4'],['Hours logged: 22 of 40','Aug 1']],rel:[]}];

const CatIcon=({cat,size=15})=>{const c=VLT_CATS.find(x=>x[0]===cat);return React.createElement(Ic[c&&c[2]||'doc'],{size})};
const catName=cat=>(VLT_CATS.find(x=>x[0]===cat)||['','Custom'])[1];
const Conf=({v})=>(<span className="pill" style={{background:v==='high'?'var(--ok-tint)':v==='medium'?'var(--warn-tint)':'var(--surface-sunk)',
color:v==='high'?'var(--ok)':v==='medium'?'var(--warn)':'var(--ink-3)',height:18,padding:'0 7px',fontSize:10}}>{v}</span>);
const StatePill=({s})=>{const m={active:['pill-ok','Active'],renewed:['pill-ok','Renewed'],lapsed:['pill-bad','Lapsed'],cancelled:['pill-n','Cancelled'],archived:['pill-n','Archived']}[s];
return <span className={'pill '+m[0]}>{s==='active'&&<span className="dot"/>}{m[1]}</span>};

const DocThumb=({name,w=44,h=56})=>(<div style={{width:w,height:h,flex:'none',borderRadius:6,border:'1px solid var(--line)',background:'var(--surface-2)',padding:5,display:'grid',gap:3,alignContent:'start',position:'relative',overflow:'hidden'}}>
{[92,74,86,60,80,52].map((x,i)=><span key={i} style={{height:2,width:x+'%',background:'var(--line)',borderRadius:2}}/>)}
{!name&&<span className="mono" style={{position:'absolute',inset:0,display:'grid',placeItems:'center',fontSize:8.5,color:'var(--ink-3)',background:'var(--surface-2)'}}>none</span>}</div>);

const VltDrawer=({o,onClose,onApprove,onOpen})=>{const b=band(o.d);
return <><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(23,19,49,.36)',backdropFilter:'blur(3px)',zIndex:80}}/>
<aside className="fade-in" style={{position:'fixed',top:0,right:0,bottom:0,width:'min(560px,96vw)',background:'var(--surface)',borderLeft:'1px solid var(--line)',boxShadow:'var(--sh-3)',zIndex:81,overflow:'auto'}}>
<div className="row" style={{padding:'16px 22px',borderBottom:'1px solid var(--line)',gap:12,position:'sticky',top:0,background:'var(--surface)',zIndex:2}}>
<span className="tile" style={{width:32,height:32,borderRadius:10,background:'var(--violet-tint)',color:'var(--violet)'}}><CatIcon cat={o.cat} size={16}/></span>
<div className="grow" style={{minWidth:0}}><div className="trunc" style={{fontWeight:600,fontSize:14.5}}>{o.n}</div>
<div className="sub trunc">{catName(o.cat)} · {o.org}</div></div>
<button className="btn btn-s" onClick={onClose} style={{width:30,height:30,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.x size={14}/></button></div>

<div style={{padding:'20px 22px 28px',display:'grid',gap:24}}>
<div>
<div className="row" style={{gap:10,flexWrap:'wrap'}}>
<span className="pill" style={{background:b.t,color:b.c}}><span className="dot"/>{inDays(o.d)}</span>
<StatePill s={o.status}/><span className="pill pill-n">{VLT_DEPT[o.dept]}</span></div>
<div className="g4" style={{marginTop:14,gap:10}}>{[['Renews',o.terms.find(t=>/date|expir|window|deadline|renews/i.test(t[0]))?.[1]||'—'],['Cost',o.cost],['Category',catName(o.cat)],['Owner','You']].map(([k,v],i)=>
<div key={i} style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'10px 12px'}}>
<div className="eyebrow" style={{fontSize:9.5}}>{k}</div><div className="trunc" style={{fontSize:13,fontWeight:600,marginTop:3}}>{v}</div></div>)}</div></div>

{o.drafted&&<div style={{border:'1px solid var(--violet-line)',background:'var(--violet-tint)',borderRadius:'var(--r-l)',padding:'15px 17px'}}>
<div className="row" style={{gap:8,flexWrap:'wrap'}}>
<span className="row" style={{gap:6,color:'var(--violet)',fontSize:10.5,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase'}}><Ic.spark size={12}/>Drafted, waiting on you</span>
<span className="pill pill-warn" style={{marginLeft:'auto'}}><span className="dot"/>Amber · drafted for approval</span></div>
<div style={{fontWeight:600,fontSize:13.6,marginTop:9}}>{o.drafted.t}</div>
<div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'12px 14px',marginTop:9,fontSize:13,color:'var(--ink-2)',lineHeight:1.6}}>{o.drafted.b}</div>
<div className="row" style={{gap:8,marginTop:12,flexWrap:'wrap'}}>
<button onClick={()=>onApprove(o)} className="row" style={{gap:7,height:34,padding:'0 18px',borderRadius:10,background:'var(--gold-bright)',color:'#2A1C00',fontWeight:700,fontSize:13.2}}><Ic.check size={14}/>Approve & send</button>
<button className="btn btn-s">Edit draft</button><button className="btn btn-s">Dismiss</button>
<span className="sub" style={{marginLeft:'auto',fontSize:11.5}}>Sends from your address</span></div>
<div style={{marginTop:12}}><MiniCompass dept={VLT_TCD[o.dept]}/></div></div>}

<div><div className="eyebrow">Source document</div>
<div className="row" style={{gap:13,marginTop:9,border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'12px 14px'}}>
<DocThumb name={o.doc}/>
<div className="grow" style={{minWidth:0}}><div className="trunc" style={{fontSize:13.2,fontWeight:500}}>{o.doc||'No document on file'}</div>
<div className="sub">{o.doc?'Uploaded by you · extracted by Paige':'Tracked from account data — upload the paperwork any time'}</div></div>
<button className="btn btn-s">{o.doc?'View':'Upload'}</button></div></div>

<div><div className="row" style={{justifyContent:'space-between',alignItems:'baseline'}}><div className="eyebrow">Extracted terms</div>
<span className="sub" style={{fontSize:11.5}}>Confidence shown per field</span></div>
<div style={{marginTop:9,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{o.terms.map(([k,v,c],i)=><div key={i} className="row" style={{gap:12,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="sub" style={{flex:'0 0 44%',minWidth:0}}>{k}</span>
<span className="grow trunc" style={{fontSize:12.9,fontWeight:500}}>{v}</span><Conf v={c}/></div>)}</div>
{o.terms.some(t=>t[2]==='low')&&<div className="sub" style={{marginTop:7}}>One field came out ambiguous. Open the document to confirm it, or correct it here.</div>}</div>

{o.partner&&<div style={{border:'1px dashed var(--line)',borderRadius:'var(--r-m)',padding:'12px 14px'}}>
<div className="row" style={{gap:9}}><Ic.store size={15} style={{color:'var(--ink-3)'}}/>
<span className="grow" style={{fontSize:12.9,color:'var(--ink-2)'}}>Recommended action · handled for you</span>
<span className="pill pill-n">Coming soon</span></div>
<div className="sub" style={{marginTop:6}}>Paige will be able to run this renewal through a vetted provider on your behalf. Not available yet.</div></div>}

<div><div className="eyebrow">Audit trail</div>
<div style={{marginTop:10,display:'grid',gap:0}}>{o.trail.map(([t,w],i)=>
<div key={i} className="row" style={{gap:11,alignItems:'flex-start',padding:'8px 0'}}>
<span style={{display:'grid',justifyItems:'center',flex:'none',paddingTop:4}}>
<span style={{width:7,height:7,borderRadius:'50%',background:i===o.trail.length-1?'var(--violet)':'var(--line)'}}/>
{i<o.trail.length-1&&<span style={{width:1,height:20,background:'var(--line)',marginTop:3}}/>}</span>
<span className="grow" style={{fontSize:12.8,color:'var(--ink-2)'}}>{t}</span>
<span className="mono sub" style={{fontSize:11}}>{w}</span></div>)}</div>
<div className="sub" style={{marginTop:6}}>Append-only. Nothing here can be edited or removed.</div></div>

{o.rel.length>0&&<div><div className="eyebrow">Related</div>
<div className="row" style={{gap:8,marginTop:9,flexWrap:'wrap'}}>{o.rel.map(r=>{const x=VLT.find(v=>v.id===r);if(!x)return null;
return <button key={r} onClick={()=>onOpen(x)} className="row" style={{gap:8,height:30,padding:'0 12px',borderRadius:99,border:'1px solid var(--line)',fontSize:12.4}}>
<CatIcon cat={x.cat} size={13}/>{x.n}</button>})}</div></div>}

{o.dept==='legal'&&<div className="sub" style={{borderTop:'1px solid var(--line-soft)',paddingTop:14}}>Entity-specific guidance here is informational. Consult counsel for your specific situation.</div>}</div></aside></>};

const INTAKE_PHASES=['Reading the document','Extracting dates','Identifying terms','Saving to your Vault'];
const VltIntake=({onDone})=>{
const[phase,setPhase]=React.useState(-1);const[confirm,setConfirm]=React.useState(false);
const phases=INTAKE_PHASES;
const start=()=>{setPhase(0)};
React.useEffect(()=>{if(phase<0||phase>=INTAKE_PHASES.length)return;
 const id=setTimeout(()=>{if(phase===INTAKE_PHASES.length-1){setPhase(-1);setConfirm(true)}else setPhase(phase+1)},820);return()=>clearTimeout(id)},[phase]);
const found=[['Policy','Cyber liability — Fairmont Assurance','high'],['Coverage limit','$1,000,000 per claim','high'],['Renewal date','Nov 12, 2026','high'],['Annual premium','$2,400','high'],['Cancellation notice','30 days written','medium'],['Deductible','Not stated in this document','low']];
return <><div className="card" style={{padding:0,overflow:'hidden',borderRadius:'var(--r-l)'}}>
{phase<0?<div className="row" style={{gap:12,padding:'9px 10px 9px 14px',flexWrap:'wrap',border:'1px dashed var(--line)',borderRadius:'var(--r-l)',background:'var(--surface-2)'}}>
<span className="tile" style={{width:26,height:26,borderRadius:8,background:'var(--violet-tint)',color:'var(--violet)',flex:'none'}}><Ic.plus size={14}/></span>
<span className="grow trunc" style={{minWidth:180,fontSize:12.9,color:'var(--ink-2)'}}>
<strong style={{color:'var(--ink)'}}>Drop a document</strong> — a policy, filing, contract, or renewal notice. She pulls the dates and asks you to confirm.</span>
<span className="row" style={{gap:8,flex:'none'}}><button onClick={start} className="btn btn-s btn-p"><Ic.doc size={13}/>Choose a file</button>
<button className="btn btn-s"><Ic.spark size={13}/>Describe it</button></span></div>
:<div style={{padding:'12px 16px'}}>
<div className="row" style={{gap:11}}><div className="tile" style={{width:28,height:28,borderRadius:9,background:'var(--violet-tint)',color:'var(--violet)',flex:'none'}}><Ic.spark size={14}/></div>
<div className="grow" style={{minWidth:0}}><div className="trunc" style={{fontWeight:600,fontSize:13}}>fairmont-cyber-2026.pdf</div><div className="sub">3 pages · reading now</div></div>
<span className="mono sub">{phase+1}/4</span></div>
<div className="row tabstrip" style={{gap:14,marginTop:10}}>{phases.map((p,i)=>
<div key={i} className="row" style={{gap:11,fontSize:12.9,color:i<=phase?'var(--ink)':'var(--ink-3)'}}>
<span style={{width:16,height:16,borderRadius:'50%',border:'1px solid '+(i<phase?'var(--ok)':i===phase?'var(--violet)':'var(--line)'),
display:'grid',placeItems:'center',color:i<phase?'var(--ok)':'var(--violet)',flex:'none'}}>{i<phase?<Ic.check size={10}/>:null}</span>
{p}{i===phase&&<span style={{height:3,width:52,borderRadius:2,background:'var(--surface-sunk)',overflow:'hidden',marginLeft:6}}>
<span style={{display:'block',height:'100%',background:'var(--violet)',animation:'vp .8s linear forwards',borderRadius:2}}/></span>}</div>)}</div>
<style>{'@keyframes vp{from{width:4%}to{width:100%}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}'}</style></div>}</div>

{confirm&&<><div onClick={()=>setConfirm(false)} style={{position:'fixed',inset:0,background:'rgba(23,19,49,.42)',backdropFilter:'blur(3px)',zIndex:90}}/>
<div className="fade-in card" style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(520px,94vw)',maxHeight:'88vh',overflow:'auto',zIndex:91,borderRadius:'var(--r-xl)',boxShadow:'var(--sh-3)'}}>
<div className="hd"><div><h3>Here is everything I found</h3><div className="sub">Confirm or correct it, then it goes in the Vault.</div></div>
<button className="btn btn-s" onClick={()=>setConfirm(false)} style={{width:28,height:28,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.x size={13}/></button></div>
<div style={{padding:'16px 20px 20px',display:'grid',gap:14}}>
<div className="row" style={{gap:13}}><DocThumb name="x"/><div className="grow"><div style={{fontSize:13.2,fontWeight:600}}>fairmont-cyber-2026.pdf</div>
<div className="sub">Filed under Insurance · Legal & Compliance</div></div></div>
<div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{found.map(([k,v,c],i)=><div key={i} className="row" style={{gap:12,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="sub" style={{flex:'0 0 42%'}}>{k}</span><span className="grow trunc" style={{fontSize:12.9,fontWeight:500}}>{v}</span><Conf v={c}/></div>)}</div>
<div className="sub">The deductible was not stated in this document. Add it now or leave it blank.</div>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<button onClick={()=>{setConfirm(false);onDone()}} className="row" style={{gap:7,height:36,padding:'0 18px',borderRadius:10,background:'var(--gold-bright)',color:'#2A1C00',fontWeight:700,fontSize:13.4}}><Ic.check size={14}/>Save to Vault</button>
<button className="btn">Edit fields</button><button className="btn" onClick={()=>setConfirm(false)}>Cancel</button></div></div></div></>}</>};

export const VaultView=()=>{
const[rows,setRows]=React.useState(VLT);
const[open,setOpen]=React.useState(null);
const[q,setQ]=React.useState('');
const[cat,setCat]=React.useState('All');
const[bucket,setBucket]=React.useState('All');
const[sel,setSel]=React.useState([]);
const[loading,setLoading]=React.useState(true);
const[toast,setToast]=React.useState(null);
const[dial,setDial]=React.useState(null);
const[catOpen,setCatOpen]=React.useState(false);
const trust=useTrust();
React.useEffect(()=>{const id=setTimeout(()=>setLoading(false),700);return()=>clearTimeout(id)},[]);
const buckets=[['All','All'],['crit','Under 7 days'],['urg','7–30 days'],['soon','30–60 days'],['ok','60+ days'],['past','Past due']];
const list=rows.filter(o=>(cat==='All'||o.cat===cat)&&(bucket==='All'||band(o.d).k===bucket)&&(o.n+' '+o.org).toLowerCase().includes(q.toLowerCase()))
 .sort((a,b)=>a.d-b.d);
const due30=rows.filter(o=>o.d<30&&o.d>=0).length,acting=rows.filter(o=>o.drafted).length;
const approve=o=>{setRows(r=>r.map(x=>x.id===o.id?{...x,drafted:null,status:'renewed',trail:[...x.trail,['Approved and sent by you','just now']]}:x));
 setOpen(null);setToast('Nice — that renewal is locked in for another year.');setTimeout(()=>setToast(null),3600)};
const add=()=>{setRows(r=>[{id:'cyb',n:'Cyber liability policy',cat:'ins',org:'Fairmont Assurance',d:91,cost:'$2,400 / yr',status:'active',dept:'legal',doc:'fairmont-cyber-2026.pdf',
 terms:[['Coverage limit','$1,000,000 per claim','high'],['Renewal date','Nov 12, 2026','high'],['Annual premium','$2,400','high'],['Cancellation notice','30 days written','medium'],['Deductible','Not stated','low']],
 drafted:null,trail:[['Created from uploaded document','just now']],rel:['gl'],partner:'insurance'},...r]);
 setToast('Cyber liability policy is in the Vault. Paige will raise it 60 days out.');setTimeout(()=>setToast(null),3600)};
const toggle=id=>setSel(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);

return <div className="fade-in pg" style={{maxWidth:1440,margin:'0 auto',width:'100%'}}>
<PageHead eyebrow="Platform" title="Business Vault"
sub={rows.length+' obligations tracked · '+due30+' due in the next 30 days · '+acting+' need your action now'}
right={<div className="row" style={{gap:9}}><button className="btn btn-s"><Ic.doc size={14}/>Export CSV</button>
<button className="btn btn-s"><Ic.filter size={14}/>Due date ↑</button></div>}/>
<div className="pg-body"><div className="vl-fill">
<VltIntake onDone={add}/>

{sel.length>0?<div className="row fade-in" style={{gap:9,padding:'8px 13px',background:'var(--violet-tint)',border:'1px solid var(--violet-line)',borderRadius:99,minWidth:0}}>
<span style={{fontSize:12.7,fontWeight:600,color:'var(--violet)',flex:'none'}}>{sel.length} selected</span>
<div className="row tabstrip" style={{gap:8,minWidth:0,flex:'1 1 auto'}}>
<button className="btn btn-s">Mark reviewed</button><button className="btn btn-s">Archive</button><button className="btn btn-s">Export CSV</button></div>
<button className="btn btn-s" style={{flex:'none'}} onClick={()=>setSel([])}>Clear</button></div>
:<div className="row" style={{gap:9,minWidth:0,position:'relative'}}>
<div className="row card" style={{padding:'0 12px',height:32,gap:8,borderRadius:99,boxShadow:'none',color:'var(--ink-3)',flex:'0 1 212px',minWidth:0}}><Ic.search size={14}/>
<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search obligations" style={{border:0,background:'none',outline:'none',color:'var(--ink)',flex:1,minWidth:0,fontFamily:'inherit',fontSize:12.7}}/></div>
<div className="row tabstrip" style={{gap:6,flex:'1 1 auto',minWidth:0}}>{buckets.map(([k,l])=>{const on=bucket===k;
return <button key={k} onClick={()=>setBucket(k)} style={{height:29,padding:'0 11px',borderRadius:99,fontSize:12.1,fontWeight:on?600:450,
background:on?'var(--ink)':'var(--surface)',color:on?'var(--ink-inv)':'var(--ink-2)',border:'1px solid '+(on?'var(--ink)':'var(--line)')}}>{l}</button>})}</div>
<button onClick={()=>setCatOpen(!catOpen)} className="row" style={{flex:'none',gap:7,height:29,padding:'0 11px',borderRadius:99,fontSize:12.1,fontWeight:cat==='All'?450:600,
background:cat==='All'?'var(--surface)':'var(--violet-tint)',border:'1px solid '+(cat==='All'?'var(--line)':'var(--violet-line)'),color:cat==='All'?'var(--ink-2)':'var(--violet)'}}>
<Ic.filter size={13}/>{cat==='All'?'Category':catName(cat)}<Ic.chev size={11} style={{transform:'rotate(90deg)',opacity:.6}}/></button>
{catOpen&&<><div onClick={()=>setCatOpen(false)} style={{position:'fixed',inset:0,background:'rgba(23,19,49,.28)',backdropFilter:'blur(3px)',zIndex:88}}/>
<div className="fade-in card pane" style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(320px,92vw)',maxHeight:'70vh',zIndex:89,padding:6,borderRadius:'var(--r-l)',boxShadow:'var(--sh-3)'}}>
<div className="eyebrow" style={{padding:'8px 10px 6px',fontSize:9.5}}>Filter by category</div>
{[['All','All categories'],...VLT_CATS.filter(c=>rows.some(o=>o.cat===c[0])).map(c=>[c[0],c[1]])].map(([k,l])=>{const on=cat===k;
const n=k==='All'?rows.length:rows.filter(o=>o.cat===k).length;
return <button key={k} onClick={()=>{setCat(k);setCatOpen(false)}} className="row" style={{width:'100%',textAlign:'left',gap:10,padding:'8px 10px',borderRadius:8,
background:on?'var(--surface-sunk)':'transparent'}}>
<span style={{width:14,display:'flex',color:'var(--violet)'}}>{on&&<Ic.check size={13}/>}</span>
{k!=='All'&&<CatIcon cat={k} size={13}/>}<span className="grow trunc" style={{fontSize:12.7,fontWeight:on?600:450}}>{l}</span>
<span className="mono sub" style={{fontSize:10.6}}>{n}</span></button>})}</div></>}</div>}

<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}><div className="tbl" style={{flex:1,minHeight:0}}><div style={{minWidth:1080}}>
<div className="row" style={{padding:'11px 20px',background:'var(--surface-2)',borderBottom:'1px solid var(--line)',fontSize:11,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)',fontWeight:600,gap:12}}>
<span style={{flex:'0 0 18px'}}/><span style={{flex:'1 1 250px',minWidth:210}}>Obligation</span><span style={{flex:'0 0 150px'}}>Category</span>
<span style={{flex:'0 0 130px'}}>Due</span><span style={{flex:'0 0 110px',textAlign:'right'}}>Cost</span>
<span style={{flex:'0 0 110px'}}>Status</span><span style={{flex:'0 0 140px',textAlign:'right'}}>Paige</span></div>
{loading?[0,1,2,3,4,5].map(i=><div key={i} className="row" style={{padding:'14px 20px',borderTop:i?'1px solid var(--line-soft)':'0',gap:12}}>
<span style={{flex:'0 0 18px'}}/><span className="grow" style={{display:'grid',gap:6}}>
<span style={{height:9,width:(48+i*7)+'%',background:'var(--surface-sunk)',borderRadius:4}}/><span style={{height:7,width:'28%',background:'var(--surface-sunk)',borderRadius:4}}/></span>
{[150,130,110,110,130].map((w,j)=><span key={j} style={{flex:'0 0 '+w+'px'}}><span style={{display:'block',height:9,width:'62%',background:'var(--surface-sunk)',borderRadius:4}}/></span>)}</div>)
:list.length?list.map((o,i)=>{const b=band(o.d);const on=sel.includes(o.id);
return <React.Fragment key={o.id}><div className="row vlt-row" style={{padding:'13px 20px',borderTop:i?'1px solid var(--line-soft)':'0',gap:12,background:on?'var(--surface-2)':'transparent',cursor:'pointer',position:'relative'}}
onClick={()=>setOpen(o)}>
<span style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:b.c,opacity:b.k==='ok'?0:1}}/>
<span style={{flex:'0 0 18px'}} onClick={e=>{e.stopPropagation();toggle(o.id)}}>
<span style={{width:16,height:16,borderRadius:5,border:'1.5px solid '+(on?'var(--violet)':'var(--line)'),background:on?'var(--violet)':'transparent',display:'grid',placeItems:'center',color:'#fff'}}>
{on&&<Ic.check size={10}/>}</span></span>
<span style={{flex:'1 1 250px',minWidth:210}}><span className="trunc" style={{fontSize:13.4,fontWeight:600,display:'block'}}>{o.n}</span>
<span className="sub trunc" style={{display:'block'}}>{o.org}{o.flag?' · '+o.flag:''}</span></span>
<span className="row" style={{flex:'0 0 150px',gap:8,minWidth:0,color:'var(--ink-2)'}}><CatIcon cat={o.cat} size={14}/><span className="trunc" style={{fontSize:12.7}}>{catName(o.cat)}</span></span>
<span style={{flex:'0 0 130px'}}><span className="pill" style={{background:b.t,color:b.c}}>{inDays(o.d)}</span></span>
<span className="mono" style={{flex:'0 0 110px',textAlign:'right',fontSize:12.9}}>{o.cost}</span>
<span style={{flex:'0 0 110px'}}><StatePill s={o.status}/></span>
<span style={{flex:'0 0 140px',textAlign:'right'}}>{(()=>{const[lbl,cls]=vltState(o,trust);
return <button onClick={e=>{e.stopPropagation();setDial(dial===o.id?null:o.id)}} className={'pill '+cls} style={{height:26,padding:'0 11px',marginLeft:'auto',cursor:'pointer'}}>
{lbl==='Draft ready'&&<Ic.spark size={11}/>}{lbl==='Autopilot'&&<span className="dot"/>}{lbl}<Ic.chev size={10} style={{transform:'rotate(90deg)',opacity:.6}}/></button>})()}</span></div>
{dial===o.id&&<div className="fade-in" style={{padding:'0 20px 14px',background:'var(--surface-2)',borderTop:'1px solid var(--line-soft)'}}>
<div style={{paddingTop:13}}><MiniCompass dept={VLT_TCD[o.dept]} label="This is where it sits because you have"/></div>
<div className="sub" style={{marginTop:7}}>Applies to every obligation this department handles, not just this one.</div></div>}
</React.Fragment>})
:<div style={{padding:'54px 22px',textAlign:'center'}}>
<div className="tile" style={{margin:'0 auto 12px',width:42,height:42,borderRadius:14,background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.vault size={20}/></div>
<div style={{fontWeight:600,fontSize:14.5}}>Nothing matches those filters</div>
<div className="sub" style={{maxWidth:340,margin:'6px auto 0'}}>Try a wider window, or drop a document and Paige will file whatever it finds.</div>
<button className="btn btn-s" style={{marginTop:14}} onClick={()=>{setCat('All');setBucket('All');setQ('')}}>Clear filters</button></div>}
</div></div></div>
<style>{'.vlt-row{transition:background .15s,box-shadow .15s,transform .15s}.vlt-row:hover{background:var(--surface-2);box-shadow:var(--sh-1)}@media(prefers-reduced-motion:reduce){.vlt-row{transition:none}}'}</style>

</div>

{open&&<VltDrawer o={open} onClose={()=>setOpen(null)} onApprove={approve} onOpen={setOpen}/>}
{toast&&<div className="fade-in row" style={{position:'fixed',bottom:26,left:'50%',transform:'translateX(-50%)',gap:9,background:'var(--rail)',color:'var(--ink-inv)',padding:'11px 18px',borderRadius:12,fontSize:13,boxShadow:'var(--sh-3)',zIndex:95}}>
<span style={{color:'var(--gold-bright)',display:'flex'}}><Ic.check size={15}/></span>{toast}</div>}</div></div>};

export const VaultTile=({preview})=>{const items=[...VLT].sort((a,b)=>a.d-b.d).slice(0,3);const due30=VLT.filter(o=>o.d<30).length;const act=VLT.filter(o=>o.drafted).length;
return <div className="card"><div className="hd"><div><h3>Business Vault</h3><div className="sub">{VLT.length} obligations tracked</div></div>
<div className="row" style={{gap:8}}>{preview&&<span className="pill pill-n" title="Sample obligations — the Vault has no live backend yet">Preview</span>}<Ic.vault size={17} style={{color:'var(--ink-3)'}}/></div></div>
<div className="row" style={{padding:'12px 20px',gap:18,borderBottom:'1px solid var(--line-soft)'}}>
<div><div className="eyebrow" style={{fontSize:9.5}}>Due in 30 days</div><div style={{fontSize:19,fontWeight:600,marginTop:2}}>{due30}</div></div>
<div><div className="eyebrow" style={{fontSize:9.5}}>Need your action</div><div style={{fontSize:19,fontWeight:600,marginTop:2,color:'var(--warn)'}}>{act}</div></div></div>
{items.map((o,i)=>{const b=band(o.d);
return <div key={o.id} className="row" style={{padding:'11px 20px',borderTop:i?'1px solid var(--line-soft)':'0',gap:11}}>
<span className="mono" style={{width:46,flex:'none',fontSize:12.5,fontWeight:600,color:b.c}}>{o.d<0?'past':o.d+'d'}</span>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:13,fontWeight:500,display:'block'}}>{o.n}</span>
<span className="sub trunc" style={{display:'block'}}>{o.org} · {o.cost}</span></span>
{o.drafted?<span className="pill pill-v"><Ic.spark size={11}/>Draft ready</span>:<span className="pill pill-n">Monitoring</span>}</div>})}
<div style={{padding:'12px 20px',borderTop:'1px solid var(--line-soft)'}}>
<button className="btn btn-s" style={{width:'100%',justifyContent:'center'}}>Open Business Vault <Ic.arrow size={14}/></button></div></div>};
