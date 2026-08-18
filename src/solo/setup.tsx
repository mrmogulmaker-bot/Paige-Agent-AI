// @ts-nocheck
import React from "react";
import { Ic, Avatar, PeekCard, Foldout, SlideOut, SubTabs, Wrap, PageHead } from "./_shared";
import { PT } from "./paigehub";
import { useSoloBusiness } from "./data/useSoloBusiness";
import { useSoloOwner } from "./data/useSoloOwner";
import { useSoloPeople } from "./data/useSoloPeople";
import { useSoloComms } from "./data/useSoloComms";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { subtabByKey } from "@/lib/routing/tierBranches";

/* ------------------------------------------------------------------ *
 * Claude Design "Solo Setup" pack — pop-out / slide-out / foldout edit
 * pattern restored FAITHFULLY (owner directive 2026-08-17: "I want all
 * of my design that I got from Claude design. I don't want your
 * version."). The regression fixed here: the earlier inline-edit
 * "WiredCard" rewrite dropped PersonDrawer, the EntityDrawer/ContactDrawer
 * footers, and the Business/Owner PeekCard foldouts. Now the Edit button
 * opens the design's own SlideOut (EditDrawer) whose Save persists through
 * the REAL adapters — the design is Claude Design's, the data is live.
 *
 * PREVIEW-ONLY fixtures — surfaces with NO backend in this schema
 * (§31/§13) — render behind an explicit per-card Preview marker and are
 * never presented as live data. §63: these are FICTIONAL sample values
 * (Meridian / Jordan Avery), never the owner's real accounts.
 * ------------------------------------------------------------------ */
const SU_BIZ={
addr:['1180 Peachtree St NE, Suite 1200','Atlanta, GA 30309','United States'],
mail:['PO Box 77412','Atlanta, GA 30357'],
hours:'Mon–Thu 9:00am–5:00pm ET · Fri by appointment',tz:'America/New_York',currency:'USD',lang:'English (US)'};
const SU_OWNER={n:'Jordan Avery',title:'Founder & Principal',email:'jordan@meridianadvisory.co',
pronouns:'they/them',since:'March 2023',cal:'cal.paigeagent.ai/jordan',
sig:'Jordan Avery · Founder, Meridian Advisory',bio:'Builds systems that let a one-person company operate like a staffed one.'};
const SU_SECRETS=[
 {id:'ein',k:'EIN',v:'88-4392104',cls:'Tax identifier',who:'You only',note:'Used on filings Paige prepares. Never included in anything she sends a client.'},
 {id:'state_id',k:'Georgia withholding ID',v:'GA-0142887',cls:'Tax identifier',who:'You and your CPA',note:'Shared with Ruiz & Whitfield for quarterly filings.'},
 {id:'bank',k:'Operating account',v:'Chase ••4471 · routing 061000019',cls:'Banking',who:'You only',note:'Referenced for payouts. Paige never sees the full number.'},
 {id:'reg',k:'Delaware file number',v:'7214880',cls:'Entity record',who:'You and your attorney',note:'Needed for annual report filings.'},
 {id:'ins',k:'GL policy number',v:'HM-GL-88-4471029',cls:'Insurance',who:'You and your broker',note:'On file with Hartwell Mutual.'}];
const SU_CONTACTS=[
 {r:'Accountant / CPA',n:'Dolores Ruiz, CPA',org:'Ruiz & Whitfield',e:'druiz@ruizwhitfield.com',p:'(404) 555-0231',note:'Handles quarterly estimates and the annual return.',sees:['Georgia withholding ID','Q3 estimated tax worksheet','Profit & loss'],since:'Mar 2023'},
 {r:'Attorney',n:'Marcus Feld',org:'Feld Legal Group',e:'mfeld@feldlegal.co',p:'(404) 555-0117',note:'Entity, contracts, and trademark matters.',sees:['Delaware file number','Signed contracts','Trademark registration'],since:'Mar 2023'},
 {r:'Insurance broker',n:'Renee Hartwell',org:'Hartwell Mutual',e:'renee@hartwellmutual.com',p:'(678) 555-0904',note:'General liability and E&O.',sees:['GL policy number','Payroll headcount'],since:'Apr 2023'},
 {r:'Registered agent',n:'Northpoint Agents',org:'Northpoint',e:'service@northpointagents.com',p:'(302) 555-0166',note:'Delaware agent of record.',sees:['Delaware file number','Principal address'],since:'Mar 2023'},
 {r:'Bookkeeper',n:'Unassigned',org:'—',e:'—',p:'—',note:'Paige flagged this gap — reconciliation is manual right now.',sees:[],gap:true},
 {r:'Emergency contact',n:'Sealed',org:'—',e:'—',p:'—',note:'Held encrypted. Visible only after an identity check.',sees:[],sealed:true}];
const SU_PEOPLE=[
 {n:'Jordan Avery',role:'Founder & Principal',dept:'Leadership',type:'Owner',seat:'Full access',rep:null,paige:['All departments'],status:'Active',start:'Mar 2023',
  email:'jordan@meridianadvisory.co',mfa:true,last:'Active now',clients:'All 8',sensitive:true},
 {n:'Maya Rios',role:'Account lead',dept:'Client Success',type:'Employee',seat:'Standard',rep:'Jordan Avery',paige:['Client Success','Marketing'],status:'Invited',start:'—',
  email:'maya@meridianadvisory.co',mfa:false,last:'Invite sent 3d ago',clients:'Harper & Vale, Northwind, Bellweather',sensitive:false},
 {n:'Devon Park',role:'Strategist',dept:'Delivery',type:'Contractor',seat:'Standard',rep:'Jordan Avery',paige:['Operations'],status:'Invited',start:'—',
  email:'devon@contract.co',mfa:false,last:'Invite sent 3d ago',clients:'Ridgeline, Mercer, Cairn',sensitive:false},
 {n:'Sasha Kim',role:'Client success',dept:'Client Success',type:'Contractor',seat:'Limited',rep:'Maya Rios',paige:['Client Success'],status:'Not invited',start:'—',
  email:'sasha@contract.co',mfa:false,last:'Never signed in',clients:'Selby, Okonkwo',sensitive:false},
 {n:'Dolores Ruiz',role:'CPA',dept:'Finance',type:'Advisor',seat:'Guest',rep:'Jordan Avery',paige:['Finance (read-only)'],status:'Not invited',start:'—',
  email:'druiz@ruizwhitfield.com',mfa:false,last:'Never signed in',clients:'None',sensitive:true}];
const SU_ENTITIES=[
 {n:'Meridian Advisory LLC',kind:'Parent · Delaware LLC',reg:'Formed Mar 2023',states:'DE, GA',status:'Active',
  ob:['General liability policy','Delaware annual report','Q3 estimated tax','Trademark §8'],agent:'Northpoint Agents',secret:'reg'},
 {n:'Meridian Coaching',kind:'DBA of parent',reg:'Registered Jan 2024',states:'GA',status:'Active',ob:['City business license'],agent:'—',secret:null},
 {n:'Meridian Holdings LLC',kind:'Planned holding entity',reg:'Not formed',states:'—',status:'Planned',ob:[],agent:'—',secret:null}];
const SU_TREE={'Jordan Avery':['Maya Rios','Devon Park','Dolores Ruiz'],'Maya Rios':['Sasha Kim']};

/* ------------------------------------------------------------------ *
 * Shared primitives (solo tokens only — no @/components/ui import).
 * ------------------------------------------------------------------ */
const DASH='—';
const PreviewPill=()=>(<span className="pill pill-n" title="Sample layout — no live backend for this yet">Preview</span>);
const colorSwatch=v=>(<span className="row" style={{gap:7}}><span style={{width:14,height:14,borderRadius:4,background:v||'var(--surface-sunk)',border:'1px solid var(--line)',flex:'none'}}/><span className="mono" style={{fontSize:12.6}}>{v||DASH}</span></span>);

const SuField=({k,v,w,mono,hint})=>(<div style={{gridColumn:w?'span '+w:'auto',minWidth:0}}>
<div className="eyebrow" style={{fontSize:9.5}}>{k}</div>
<div className={mono?'mono':''} style={{fontSize:13.2,fontWeight:500,marginTop:3,lineHeight:1.45,wordBreak:'break-word'}}>{v===''||v==null?DASH:v}</div>
{hint&&<div className="sub" style={{fontSize:11.2,marginTop:2}}>{hint}</div>}</div>);
const SuGrid=({children})=>(<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(170px,100%),1fr))',gap:'14px 18px'}}>{children}</div>);
const Toggle=({on,onClick,disabled})=>(<button disabled={disabled} onClick={onClick} style={{width:38,height:22,borderRadius:99,padding:2,flex:'none',opacity:disabled?.55:1,cursor:disabled?'default':'pointer',background:on?'var(--violet)':'var(--surface-sunk)',display:'flex',justifyContent:on?'flex-end':'flex-start',transition:'.15s'}}>
<span style={{width:18,height:18,borderRadius:'50%',background:'#fff',boxShadow:'var(--sh-1)'}}/></button>);
const SuRows=({items,disabled})=>{const[st,setSt]=React.useState(items.map(i=>i[2]));
return <div>{items.map(([k,d],i)=><div key={i} className="row" style={{gap:12,padding:'11px 16px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow" style={{minWidth:0}}><span style={{fontSize:12.9,fontWeight:500,display:'block'}}>{k}</span>{d&&<span className="sub trunc" style={{display:'block'}}>{d}</span>}</span>
<Toggle on={st[i]} disabled={disabled} onClick={()=>!disabled&&setSt(s=>s.map((x,j)=>j===i?!x:x))}/></div>)}</div>};

const LockIcon=({size=12})=>(<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 017 0v3"/></svg>);
const EyeIcon=({size=12,off})=>(<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>{off&&<path d="M4 20L20 4"/>}</svg>);
const mask=v=>{const tail=v.replace(/[^A-Za-z0-9]/g,'').slice(-4);return '•••• •••• '+tail};

// A tiny loading shimmer row for wired cards while their read resolves.
const SkelLine=({w='60%'})=>(<div style={{height:11,width:w,background:'var(--surface-sunk)',borderRadius:5}}/>);
const CardSkel=()=>(<div style={{padding:'16px 20px',display:'grid',gap:12}}><SkelLine w="40%"/><SkelLine w="70%"/><SkelLine w="55%"/></div>);

const inputStyle={height:36,padding:'0 11px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)',fontSize:13.2,color:'var(--ink)',width:'100%',outline:'none'};
const SuInput=({label,value,onChange,placeholder,type,mono,textarea,w})=>(<label style={{display:'grid',gap:4,minWidth:0,gridColumn:w?'span '+w:'auto'}}>
<span className="eyebrow" style={{fontSize:9.5}}>{label}</span>
{textarea
 ?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3}
   style={{...inputStyle,height:'auto',padding:'9px 11px',resize:'vertical',fontFamily:'inherit',lineHeight:1.5}}/>
 :type==='color'
 ?<span className="row" style={{gap:8}}>
   <input type="color" value={value||'#CFAE70'} onChange={e=>onChange(e.target.value)} style={{width:40,height:36,padding:2,border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)',cursor:'pointer'}}/>
   <input value={value} onChange={e=>onChange(e.target.value)} placeholder="#CFAE70" className="mono" style={{...inputStyle,flex:1}}/></span>
 :<input type={type||'text'} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className={mono?'mono':''} style={inputStyle}/>}
</label>);

/**
 * EditDrawer — the pop-out edit form (the piece the inline rewrite dropped).
 * It REUSES the Claude Design SlideOut (its foot slot is where Save/Cancel
 * live) + the SuInput field. One primitive serves Business + Owner edits;
 * Save persists through the real adapter (§9 — no client-supplied tenant_id).
 */
const EditDrawer=({open,onClose,title,sub,fields,initial,saving,onSave,notify,successMsg})=>{
const[draft,setDraft]=React.useState({});
// Seed the draft ONLY when the drawer opens — re-seeding every render (fields/
// initial are fresh each pass) would clobber the user's typing.
// eslint-disable-next-line react-hooks/exhaustive-deps
React.useEffect(()=>{if(open){const d={};fields.forEach(f=>{d[f.key]=initial[f.key]==null?'':initial[f.key]});setDraft(d)}},[open]);
const submit=async()=>{
 const res=await onSave(draft);
 if(res&&res.ok){onClose();notify&&notify(successMsg||'Saved.')}
 else notify&&notify((res&&res.error)||'That didn\'t save. Try again.')};
return <SlideOut open={open} onClose={onClose} title={title} sub={sub} icon={<Ic.gear size={15}/>}
foot={<><button className="btn btn-s btn-p" disabled={saving} onClick={submit}><Ic.check size={13}/>{saving?'Saving…':'Save'}</button>
<button className="btn btn-s" disabled={saving} onClick={onClose}>Cancel</button></>}>
<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(200px,100%),1fr))',gap:'14px 18px'}}>
{fields.map(f=><SuInput key={f.key} label={f.label} value={draft[f.key]??''} onChange={v=>setDraft(d=>({...d,[f.key]:v}))} type={f.type} mono={f.mono} textarea={f.textarea} w={f.w} placeholder={f.placeholder}/>)}</div>
</SlideOut>};

const RevealGate=({item,onClose,onGrant})=>{const[step,setStep]=React.useState('ask');const[code,setCode]=React.useState('');
React.useEffect(()=>{const k=e=>e.key==='Escape'&&onClose();window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onClose]);
return <><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(10,8,24,.55)',backdropFilter:'blur(4px)',zIndex:92}}/>
<div className="fade-in card" style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(430px,94vw)',zIndex:93,borderRadius:'var(--r-xl)',boxShadow:'var(--sh-3)'}}>
<div style={{padding:'20px 22px 22px'}}>
<div className="row" style={{gap:11}}>
<span className="tile" style={{width:34,height:34,borderRadius:11,background:'var(--gold-tint)',color:'var(--gold)',flex:'none'}}><LockIcon size={16}/></span>
<div className="grow" style={{minWidth:0}}><div style={{fontWeight:600,fontSize:14.5}}>Confirm it is you</div>
<div className="sub">Revealing {item.k} is logged with a timestamp.</div></div></div>
{step==='ask'?<>
<div style={{fontSize:13,color:'var(--ink-2)',marginTop:14,lineHeight:1.6}}>Enter the six-digit code from your authenticator. The value stays visible for thirty seconds, then re-seals itself.</div>
<div className="row" style={{gap:7,marginTop:14,justifyContent:'center'}}>{[0,1,2,3,4,5].map(i=>
<span key={i} className="mono" style={{width:40,height:46,borderRadius:10,border:'1.5px solid '+(code.length===i?'var(--violet)':'var(--line)'),
background:'var(--surface-2)',display:'grid',placeItems:'center',fontSize:19,fontWeight:600}}>{code[i]||''}</span>)}</div>
<input autoFocus value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}
onKeyDown={e=>{if(e.key==='Enter'&&code.length===6)setStep('ok')}}
style={{position:'absolute',opacity:0,pointerEvents:'none'}}/>
<div className="row" style={{gap:9,marginTop:16}}>
<button disabled={code.length<6} onClick={()=>setStep('ok')} className="row" style={{gap:7,height:35,padding:'0 17px',borderRadius:10,
background:code.length<6?'var(--surface-sunk)':'var(--gold-bright)',color:code.length<6?'var(--ink-3)':'#2A1C00',fontWeight:700,fontSize:13.2}}>
<Ic.check size={14}/>Reveal for 30 seconds</button>
<button className="btn btn-s" onClick={onClose}>Cancel</button>
<button className="btn btn-s" style={{marginLeft:'auto'}} onClick={()=>setCode('418205')}>Use a recovery code</button></div></>
:<>
<div style={{marginTop:14,padding:'14px 16px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{fontSize:9.5}}>{item.k}</div>
<div className="mono" style={{fontSize:17,fontWeight:600,marginTop:5,wordBreak:'break-all'}}>{item.v}</div></div>
<div className="sub" style={{marginTop:9,lineHeight:1.5}}>{item.note}</div>
<div className="row" style={{gap:9,marginTop:15}}>
<button className="btn btn-s btn-p" onClick={()=>{onGrant();onClose()}}><Ic.doc size={13}/>Copy and close</button>
<button className="btn btn-s" onClick={onClose}>Done</button>
<span className="mono sub" style={{marginLeft:'auto',fontSize:11}}>Logged · {new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></div></>}</div></div></>};

const Secret=({item,compact})=>{const[gate,setGate]=React.useState(false);const[shown,setShown]=React.useState(0);
React.useEffect(()=>{if(!shown)return;const id=setInterval(()=>setShown(s=>s<=1?0:s-1),1000);return()=>clearInterval(id)},[shown]);
return <><div className="row" style={{gap:10,padding:compact?'9px 12px':'11px 14px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',
background:shown?'var(--gold-tint)':'var(--surface-2)',minWidth:0,transition:'background .2s'}}>
<span className="tile" style={{width:24,height:24,borderRadius:7,background:shown?'var(--gold-line)':'var(--surface-sunk)',
color:shown?'var(--gold)':'var(--ink-3)',flex:'none'}}><LockIcon size={12}/></span>
<span className="grow" style={{minWidth:0}}>
<span className="eyebrow trunc" style={{fontSize:9.5,display:'block'}}>{item.k}</span>
<span className="mono trunc" style={{fontSize:12.8,fontWeight:600,display:'block',marginTop:1,letterSpacing:shown?0:'.06em'}}>{shown?item.v:mask(item.v)}</span></span>
{shown?<span className="mono" style={{fontSize:11,color:'var(--gold)',fontWeight:600,flex:'none'}}>{shown}s</span>:null}
<button onClick={()=>shown?setShown(0):setGate(true)} className="row" style={{gap:6,flex:'none',height:26,padding:'0 10px',borderRadius:8,
border:'1px solid var(--line)',fontSize:11.6,fontWeight:500,color:'var(--ink-2)'}}>
<EyeIcon size={12} off={!!shown}/>{shown?'Hide':'Reveal'}</button></div>
{gate&&<RevealGate item={item} onClose={()=>setGate(false)} onGrant={()=>setShown(30)}/>}</>};

const Sect=({t,d,children,right})=>(<div style={{marginBottom:20,minWidth:0}}>
<div className="row" style={{alignItems:'center',gap:10,marginBottom:9,minWidth:0}}>
<div className="grow" style={{minWidth:0}}>
<div className="eyebrow" style={{fontSize:9.5,lineHeight:1.3}}>{t}</div>
{d&&<div className="sub trunc" style={{fontSize:11.4,marginTop:1}}>{d}</div>}</div>
{right&&<div className="row" style={{gap:8,flex:'none'}}>{right}</div>}</div>{children}</div>);

/* ------------------------------------------------------------------ *
 * PersonDrawer — the People slide-out (RESTORED from Claude Design).
 * `source='real'` maps a live roster row: header renders real name /
 * status / email; every sub-field with no backend renders DASH under a
 * Preview marker (§13/§31 — never a fabricated "Not enrolled"/"Nobody"),
 * and the management footer is disabled (§53 — deferred slice).
 * `source='sample'` renders the full Claude Design sample (the Preview
 * hierarchy tree opens people this way).
 * ------------------------------------------------------------------ */
const PersonDrawer=({p,open,onClose,source='sample'})=>{
const real=source==='real';
const[perm,setPerm]=React.useState(p?(p.paige||[]):[]);
React.useEffect(()=>{if(p)setPerm(p.paige||[])},[p]);
if(!p)return null;
const all=['Client Success','Growth','Marketing','Finance','Operations','Systems'];
const status=p.status||(real?'Active':'—');
return <SlideOut open={open} onClose={onClose} title={p.n} sub={real?(p.role||DASH):(p.role+' · '+(p.dept||DASH))} icon={<Ic.users size={15}/>}
foot={<><button className="btn btn-s btn-p" disabled title="Inviting and managing teammates is coming soon"><Ic.send size={13}/>{status==='Not invited'?'Send invite':'Resend invite'}</button>
<button className="btn btn-s" disabled title="Editing teammate details is coming soon">Edit details</button>
<button className="btn btn-s" disabled title="Removing access is coming soon" style={{marginLeft:'auto',color:'var(--bad)'}}>Remove access</button></>}>
<div className="row" style={{gap:14,alignItems:'center',marginBottom:16}}>
<Avatar name={p.n} size={52}/>
<div className="grow" style={{minWidth:0}}>
<div className="row" style={{gap:8,flexWrap:'wrap'}}>
<span className={'pill '+(status==='Active'?'pill-ok':status==='Invited'?'pill-warn':'pill-n')}>{status==='Active'&&<span className="dot"/>}{status}</span>
<span className="pill pill-n">{p.type||DASH}</span>{p.seat&&p.seat!==DASH?<span className="pill pill-n">{p.seat}</span>:null}</div>
<div className="sub" style={{marginTop:5}}>{p.email||DASH}{p.last&&p.last!==DASH?' · '+p.last:''}</div></div></div>

{real&&<div className="row" style={{marginBottom:16,gap:8,flexWrap:'wrap'}}><PreviewPill/><span className="sub" style={{lineHeight:1.5}}>Reporting, permissions, and security aren't wired to live data yet — the name, role, email, and status above are live.</span></div>}

<Sect t="Reporting" d="Paige uses this to route and escalate">
<div style={{display:'grid',gap:8}}>
{[['Reports to',real?DASH:(p.rep||'Nobody — owner')],['Clients',real?DASH:p.clients],['Started',real?DASH:p.start]].map(([k,v],i)=>
<div key={i} className="row" style={{gap:11,padding:'10px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<span className="sub" style={{flex:'0 0 96px'}}>{k}</span><span className="grow trunc" style={{fontSize:12.9,fontWeight:500}}>{v==null||v===''?DASH:v}</span></div>)}</div></Sect>

<Sect t="Which departments they can reach" d="Paige will not surface work outside these">
<div className="row" style={{gap:7,flexWrap:'wrap'}}>{all.map(d=>{const on=!real&&perm.some(x=>x.startsWith(d));
return <button key={d} disabled={real} onClick={()=>!real&&setPerm(v=>on?v.filter(x=>!x.startsWith(d)):[...v,d])} className="row"
style={{gap:6,height:29,padding:'0 11px',borderRadius:99,fontSize:12.1,fontWeight:on?600:450,opacity:real?.6:1,cursor:real?'default':'pointer',
background:on?'var(--violet-tint)':'var(--surface)',border:'1px solid '+(on?'var(--violet-line)':'var(--line)'),color:on?'var(--violet)':'var(--ink-2)'}}>
{on&&<Ic.check size={11}/>}{d}</button>})}</div></Sect>

<Sect t="Security" d="What this seat is allowed to see">
<div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{(real?[['Two-factor authentication',DASH,null],['Can view sealed records',DASH,null],['Can export client data',DASH,null],['Can change autonomy',DASH,null]]
:[['Two-factor authentication',p.mfa?'Enrolled':'Not enrolled',p.mfa],
['Can view sealed records',p.sensitive?'Yes — after identity check':'No',p.sensitive],
['Can export client data',p.seat==='Full access'?'Yes':'No',p.seat==='Full access'],
['Can change autonomy',p.seat==='Full access'?'Yes':'No',p.seat==='Full access']]).map(([k,v,ok],i)=>
<div key={i} className="row" style={{gap:11,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{display:'flex',width:14,justifyContent:'center',color:'var(--ink-3)',flex:'none'}}>{ok==null?<span style={{fontSize:13,lineHeight:1}}>–</span>:ok?<Ic.check size={14} style={{color:'var(--ok)'}}/>:<Ic.x size={14}/>}</span>
<span className="grow" style={{fontSize:12.8}}>{k}</span><span className="sub trunc">{v}</span></div>)}</div>
{!real&&!p.mfa&&status!=='Not invited'&&<div className="sub" style={{marginTop:7}}>Paige will require enrollment on their first sign-in.</div>}</Sect>

<Sect t="Access log" d="Append-only">
<div style={{display:'grid',gap:0}}>{(real?[]:[['Invite sent by you','3d ago'],['Seat created · Standard','3d ago'],['Departments assigned','3d ago']]).map(([t,w],i)=>
<div key={i} className="row" style={{gap:11,padding:'8px 0',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow" style={{fontSize:12.6,color:'var(--ink-2)'}}>{t}</span><span className="mono sub" style={{fontSize:11}}>{w}</span></div>)}
{real&&<div className="row" style={{gap:8,marginTop:2}}><PreviewPill/><span className="sub">Access history isn't wired to live data yet.</span></div>}</div></Sect></SlideOut>};

const EntityDrawer=({e,open,onClose})=>{if(!e)return null;
const sec=e.secret&&SU_SECRETS.find(s=>s.id===e.secret);
return <SlideOut open={open} onClose={onClose} title={e.n} sub={e.kind} icon={<Ic.vault size={15}/>}
foot={<><button className="btn btn-s btn-p" disabled>Edit entity</button><button className="btn btn-s" disabled>Open its obligations</button></>}>
<div className="row" style={{gap:9,marginBottom:16,flexWrap:'wrap'}}>
<span className={'pill '+(e.status==='Active'?'pill-ok':'pill-n')}>{e.status==='Active'&&<span className="dot"/>}{e.status}</span>
<span className="pill pill-n">{e.reg}</span><span className="mono pill pill-n">{e.states}</span><PreviewPill/></div>
{sec&&<Sect t="Sealed record"><Secret item={sec}/></Sect>}
<Sect t="Registered agent"><div className="row" style={{gap:11,padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<Ic.users size={15} style={{color:'var(--ink-3)'}}/><span className="grow" style={{fontSize:12.9,fontWeight:500}}>{e.agent}</span></div></Sect>
<Sect t="Obligations Paige tracks against it" d={e.ob.length+' tracked'}>
{e.ob.length?<div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{e.ob.map((o,i)=><div key={i} className="row" style={{gap:11,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="dot" style={{color:'var(--violet)'}}/><span className="grow trunc" style={{fontSize:12.8}}>{o}</span>
<Ic.chev size={12} style={{color:'var(--ink-3)'}}/></div>)}</div>
:<div className="sub">Nothing yet — it files under the parent.</div>}</Sect>
<div className="sub" style={{lineHeight:1.55}}>Sample entity — the Entities registry has no live backend yet.</div></SlideOut>};

const ContactDrawer=({c,open,onClose})=>{const[sealed,setSealed]=React.useState(false);if(!c)return null;
return <SlideOut open={open} onClose={onClose} title={c.sealed?'Emergency contact':c.n} sub={c.r} icon={c.sealed?<LockIcon size={15}/>:<Ic.mail size={15}/>}
tone={c.sealed?'var(--gold-tint)':null}
foot={c.gap?<button className="btn btn-s btn-p" disabled><Ic.spark size={13}/>Draft the search brief</button>
:<><button className="btn btn-s btn-p" disabled>Edit contact</button><button className="btn btn-s" disabled>Message</button></>}>
{c.sealed?<>
<div style={{padding:'16px 18px',background:'var(--gold-tint)',border:'1px solid var(--gold-line)',borderRadius:'var(--r-l)'}}>
<div className="row" style={{gap:9,color:'var(--gold)',fontSize:10.5,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase'}}><LockIcon size={12}/>Sealed · Preview</div>
<div style={{fontSize:13.2,color:'var(--ink-2)',marginTop:8,lineHeight:1.6}}>This record is held encrypted and never appears in a list, a draft, or an export. Paige cannot read it. Only you can, and only after an identity check.</div>
{sealed?<div className="fade-in" style={{marginTop:13,display:'grid',gap:9}}>
{[{id:'ec1',k:'Name',v:'Renata Cook',note:'Relationship: spouse.'},{id:'ec2',k:'Mobile',v:'(404) 555-0912',note:'Reachable at any hour.'}].map(s=><Secret key={s.id} item={s}/>)}</div>
:<button onClick={()=>setSealed(true)} className="row" style={{gap:7,marginTop:13,height:34,padding:'0 16px',borderRadius:10,background:'var(--gold-bright)',color:'#2A1C00',fontWeight:700,fontSize:13}}>
<LockIcon size={13}/>Unseal this record</button>}</div>
<div className="sub" style={{marginTop:14,lineHeight:1.55}}>Sample continuity record — no live backend yet.</div></>
:<>
<div className="row" style={{marginBottom:14}}><PreviewPill/></div>
<Sect t="Reach them">
<div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{[['Firm',c.org],['Email',c.e],['Phone',c.p],['Working together since',c.since||DASH]].map(([k,v],i)=>
<div key={i} className="row" style={{gap:11,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="sub" style={{flex:'0 0 132px'}}>{k}</span><span className="grow trunc" style={{fontSize:12.9,fontWeight:500}}>{v}</span></div>)}</div></Sect>
<Sect t="What they can see" d="Paige shares only these when she writes to them">
{c.sees.length?<div style={{display:'grid',gap:7}}>{c.sees.map((s,i)=>
<div key={i} className="row" style={{gap:10,padding:'9px 12px',border:'1px solid var(--line)',borderRadius:9,fontSize:12.6}}>
<span style={{display:'flex',color:'var(--ok)'}}><Ic.check size={13}/></span>{s}</div>)}</div>
:<div className="sub">Nothing shared yet.</div>}</Sect>
<Sect t="Notes"><div style={{fontSize:12.9,color:'var(--ink-2)',lineHeight:1.6}}>{c.note}</div></Sect></>}</SlideOut>};

/* ================================================================== *
 * BUSINESS — legal name + reachability WIRED (Edit -> SlideOut -> save);
 * registered details, location, and entities are Preview.
 * ================================================================== */
const SuBusiness=({notify})=>{const b=useSoloBusiness();const[ent,setEnt]=React.useState(null);const[editBiz,setEditBiz]=React.useState(null);
const readOnlyNote=!b.loading&&!b.isAdmin?'Only a workspace admin can edit these. You have read-only access.':null;
const EditBtn=({which})=>b.isAdmin?<button className="btn btn-s" onClick={()=>setEditBiz(which)}>Edit</button>:null;
return <div className="su-fill">
{b.error&&<div className="card" style={{padding:'12px 16px',fontSize:12.8,color:'var(--bad)'}}>Couldn't load your business details. {b.error}</div>}

<PeekCard title="Legal identity" sub="The name on filings, contracts, and invoices" foldTitle="Legal identity"
 right={<EditBtn which="legal"/>}
 peek={<div style={{padding:'10px 14px 14px'}}><SuGrid>
 <SuField k="Legal name" v={b.loading?'…':b.name||DASH}/>
 <SuField k="Tax IDs" v={<span className="row" style={{gap:6}}><LockIcon size={12}/>2 sealed<PreviewPill/></span>}/></SuGrid></div>}>
<div style={{padding:'16px 20px 20px',display:'grid',gap:18}}>
<SuGrid><SuField k="Legal name" v={b.loading?'…':b.name||DASH}/><SuField k="Doing business as" v="Meridian Coaching"/><SuField k="Entity type" v="LLC · Delaware"/>
<SuField k="Date formed" v="March 4, 2023"/><SuField k="Industry code" v="611430 — Professional & Management Development Training" w={2}/><SuField k="Fiscal year" v="Calendar year"/></SuGrid>
<div><div className="row" style={{gap:8,marginBottom:8}}><div className="eyebrow" style={{fontSize:9.5}}>Sealed identifiers</div><PreviewPill/></div>
<div style={{display:'grid',gap:8}}>{SU_SECRETS.filter(s=>s.cls==='Tax identifier'||s.cls==='Entity record').map(s=><Secret key={s.id} item={s}/>)}</div>
<div className="sub" style={{marginTop:8,lineHeight:1.5}}>Sample only — DBA, entity type, and sealed identifiers have no live backend yet. Your legal name is live.</div></div></div></PeekCard>

<PeekCard title="Where you are" sub="Addresses, hours, and locale" foldTitle="Location and locale"
 right={<PreviewPill/>}
 peek={<div style={{padding:'10px 14px 14px'}}><SuGrid>
 <SuField k="Principal" v={SU_BIZ.addr[0]}/><SuField k="Time zone" v={SU_BIZ.tz}/></SuGrid></div>}>
<div style={{padding:'16px 20px 20px'}}><SuGrid>
<SuField k="Principal address" v={SU_BIZ.addr.map((l,i)=><div key={i}>{l}</div>)} w={2}/>
<SuField k="Mailing address" v={SU_BIZ.mail.map((l,i)=><div key={i}>{l}</div>)}/>
<SuField k="Time zone" v={SU_BIZ.tz}/><SuField k="Business hours" v={SU_BIZ.hours} w={2}/>
<SuField k="Currency" v={SU_BIZ.currency}/><SuField k="Language" v={SU_BIZ.lang}/></SuGrid>
<div className="sub" style={{marginTop:12,lineHeight:1.5}}>Sample only — location and locale have no live backend yet.</div></div></PeekCard>

<PeekCard title="How the business is reached" sub="Paige uses these when she speaks for you" foldTitle="Public contact points"
 right={<EditBtn which="reach"/>}
 peek={<div style={{padding:'10px 14px 14px'}}><SuGrid>
 <SuField k="Website" v={b.loading?'…':b.brand.website}/><SuField k="Support inbox" v={b.loading?'…':b.brand.support_email}/></SuGrid></div>}>
{b.loading?<CardSkel/>:<div style={{padding:'16px 20px 20px'}}><SuGrid>
<SuField k="Website" v={b.brand.website}/><SuField k="Main phone" v={b.brand.business_phone} mono/><SuField k="Support inbox" v={b.brand.support_email}/>
<SuField k="Email “from” name" v={b.brand.from_name}/><SuField k="Industry" v={b.brand.industry}/><SuField k="Brand color" v={colorSwatch(b.brand.primary_color)}/>
<SuField k="Logo URL" v={b.brand.logo_url} w={2}/><SuField k="How you describe the business" v={b.brand.about} w={3}/></SuGrid>
{readOnlyNote&&<div className="sub" style={{marginTop:12,lineHeight:1.5}}>{readOnlyNote}</div>}</div>}</PeekCard>

<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
<div className="hd" style={{flex:'none',padding:'12px 16px'}}><div style={{minWidth:0}}><h3 style={{fontSize:13.6}}>Entities</h3>
<div className="sub trunc">{SU_ENTITIES.length} tracked · click one to open it · sample data</div></div><PreviewPill/></div>
<div className="pane" style={{flex:1}}>{SU_ENTITIES.map((e,i)=>
<button key={i} onClick={()=>setEnt(e)} className="row" style={{width:'100%',textAlign:'left',gap:11,padding:'11px 16px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="tile" style={{width:24,height:24,borderRadius:7,background:'var(--violet-tint)',color:'var(--violet)',flex:'none'}}><Ic.vault size={12}/></span>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:12.9,fontWeight:600,display:'block'}}>{e.n}</span>
<span className="sub trunc" style={{display:'block'}}>{e.kind}</span></span>
{e.secret&&<LockIcon size={12}/>}
<span className={'pill '+(e.status==='Active'?'pill-ok':'pill-n')} style={{flex:'none'}}>{e.status}</span>
<Ic.chev size={13} style={{color:'var(--ink-3)',flex:'none'}}/></button>)}</div></div>

<EntityDrawer e={ent} open={!!ent} onClose={()=>setEnt(null)}/>

<EditDrawer open={editBiz==='legal'} onClose={()=>setEditBiz(null)} title="Legal identity" sub="The name on filings and invoices"
 saving={b.saving} notify={notify} successMsg="Business name saved." initial={{name:b.name}}
 fields={[{key:'name',label:'Legal name',w:2,placeholder:'Your business name'}]}
 onSave={patch=>b.saveBusiness({name:patch.name})}/>

<EditDrawer open={editBiz==='reach'} onClose={()=>setEditBiz(null)} title="How the business is reached" sub="Paige uses these when she speaks for you"
 saving={b.saving} notify={notify} successMsg="Contact details saved." initial={b.brand}
 fields={[
  {key:'website',label:'Website',placeholder:'yourbusiness.com'},
  {key:'business_phone',label:'Main phone',mono:true,type:'tel',placeholder:'(555) 000-0000'},
  {key:'support_email',label:'Support inbox',type:'email',placeholder:'help@yourbusiness.com'},
  {key:'from_name',label:'Email “from” name',placeholder:'Your Business'},
  {key:'industry',label:'Industry',placeholder:'Consulting'},
  {key:'logo_url',label:'Logo URL',w:2,placeholder:'https://…/logo.png'},
  {key:'primary_color',label:'Brand color',type:'color'},
  {key:'about',label:'How you describe the business',textarea:true,w:3,placeholder:'A sentence Paige can use when she introduces you.'},
 ]}
 onSave={patch=>b.saveBusiness(patch)}/></div>};

/* ================================================================== *
 * OWNER — profile WIRED (Edit -> SlideOut -> save); access, reveal log,
 * and continuity are Preview.
 * ================================================================== */
const SuOwner=({notify})=>{const o=useSoloOwner();const[cont,setCont]=React.useState(false);const[editOwner,setEditOwner]=React.useState(false);
return <div className="su-fill">
{o.error&&<div className="card" style={{padding:'12px 16px',fontSize:12.8,color:'var(--bad)'}}>Couldn't load your profile. {o.error}</div>}

<PeekCard title="Owner profile" sub="How Paige signs as you" foldTitle="Owner profile"
 right={!o.loading?<button className="btn btn-s" onClick={()=>setEditOwner(true)}>Edit</button>:null}
 peek={<div className="row" style={{padding:'12px 16px 16px',gap:13}}><Avatar name={o.owner.name||'You'} size={44} tone="var(--violet)"/>
 <div className="grow" style={{minWidth:0}}><div className="trunc" style={{fontSize:13.4,fontWeight:600}}>{o.loading?'…':o.owner.name||DASH}</div>
 <div className="sub trunc">{o.loading?'':o.owner.email||DASH}</div></div></div>}>
{o.loading?<CardSkel/>:<div style={{padding:'16px 20px 20px'}}>
<div className="row" style={{gap:16,flexWrap:'wrap',alignItems:'flex-start',marginBottom:16}}>
<div style={{display:'grid',justifyItems:'center',gap:8}}><Avatar name={o.owner.name||'You'} size={66} tone="var(--violet)"/>
<button className="btn btn-s" disabled title="Photo upload is coming soon">Change photo</button></div>
<div className="grow" style={{minWidth:240}}><SuGrid>
<SuField k="Name" v={o.owner.name}/><SuField k="Title" v={SU_OWNER.title}/><SuField k="Pronouns" v={SU_OWNER.pronouns}/>
<SuField k="Work email" v={o.owner.email}/><SuField k="Phone" v={o.owner.phone} mono/><SuField k="Website" v={o.owner.website}/>
<SuField k="Owner since" v={SU_OWNER.since}/><SuField k="Booking link" v={SU_OWNER.cal}/></SuGrid></div></div>
<SuGrid><SuField k="Email signature" v={SU_OWNER.sig} w={2}/><SuField k="How you describe the business" v={SU_OWNER.bio} w={3}/></SuGrid>
<div style={{marginTop:16}}><div className="row" style={{gap:8,marginBottom:8}}><div className="eyebrow" style={{fontSize:9.5}}>Sealed personal details</div><PreviewPill/></div>
<div style={{display:'grid',gap:8}}><Secret item={{id:'mob',k:'Mobile',v:'(404) 555-0188',note:'Used for critical alerts only.'}}/>
<Secret item={{id:'rec',k:'Recovery email',v:'jordan.personal@fastmail.com',note:'Where account recovery codes go.'}}/></div>
<div className="sub" style={{marginTop:10,lineHeight:1.5}}>Name, work email, phone, and website are live. Title, pronouns, signature, bio, and sealed details are sample — no live backend yet.</div></div></div>}</PeekCard>

<PeekCard title="Access and recovery" sub="You are the only full-access seat" foldTitle="Access and recovery" right={<PreviewPill/>}
 peek={<div style={{padding:'12px 16px 14px',display:'grid',gap:8}}>
 {[['Two-factor','Authenticator · enrolled'],['Login alerts','On a new device']].map(([k,v],i)=>
 <div key={i} className="row" style={{gap:10,fontSize:12.6}}><span style={{display:'flex',color:'var(--ok)'}}><Ic.check size={13}/></span>
 <span className="grow trunc">{k}</span><span className="sub trunc">{v}</span></div>)}</div>}>
<div><SuRows disabled items={[['Two-factor authentication','Authenticator app · enrolled Mar 2023',true],
['Login alerts','Email me on a new device',true],['Session timeout','Sign out after 30 days idle',true],
['Require a code for sealed records','Every reveal, no exceptions',true]]}/>
<div className="sub" style={{padding:'12px 16px',borderTop:'1px solid var(--line)'}}>Sample only — access controls are not wired to your live security settings yet.</div></div></PeekCard>

<PeekCard title="Reveal log" sub="Every time a sealed record was opened" foldTitle="Sealed-record reveal log" right={<PreviewPill/>}
 peek={<div style={{padding:'10px 16px 14px',display:'grid',gap:7}}>
 {[['EIN','You · 2d ago'],['GL policy number','You · 1w ago']].map(([k,w],i)=>
 <div key={i} className="row" style={{gap:10,fontSize:12.6}}><LockIcon size={12}/><span className="grow trunc">{k}</span><span className="mono sub trunc">{w}</span></div>)}</div>}>
<div>{[['EIN','Filing prep','Aug 13, 9:14am'],['GL policy number','Renewal call','Aug 6, 2:02pm'],
['Georgia withholding ID','Shared with CPA','Jul 28, 11:40am']].map(([k,why,when],i)=>
<div key={i} className="row" style={{gap:11,padding:'11px 16px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<LockIcon size={12}/><span className="grow trunc" style={{fontSize:12.8,fontWeight:500}}>{k}</span>
<span className="sub trunc" style={{flex:'0 0 120px'}}>{why}</span><span className="mono sub" style={{flex:'none',fontSize:11}}>{when}</span></div>)}
<div className="sub" style={{padding:'12px 16px',borderTop:'1px solid var(--line)'}}>Sample only — the reveal log has no live backend yet.</div></div></PeekCard>

<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
<div className="hd" style={{flex:'none',padding:'12px 16px'}}><div style={{minWidth:0}}><h3 style={{fontSize:13.6}}>Continuity</h3>
<div className="sub trunc">If you are unavailable</div></div><PreviewPill/></div>
<div className="pane" style={{flex:1}}>
{[['Emergency contact','Sealed',true],['Successor access','Not designated',false],['Where key documents live','Business Vault + Drive',false]].map(([k,v,lock],i)=>
<button key={i} onClick={()=>lock&&setCont(true)} className="row" style={{width:'100%',textAlign:'left',gap:11,padding:'11px 16px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
{lock?<LockIcon size={12}/>:<span className="dot" style={{color:'var(--ink-3)'}}/>}
<span className="grow trunc" style={{fontSize:12.8,fontWeight:500}}>{k}</span>
<span className="sub trunc" style={{flex:'none',maxWidth:150}}>{v}</span><Ic.chev size={12} style={{color:'var(--ink-3)',flex:'none'}}/></button>)}
<div className="sub" style={{padding:'11px 16px'}}>Sample only — continuity planning has no live backend yet.</div></div></div>

<ContactDrawer c={SU_CONTACTS.find(c=>c.sealed)} open={cont} onClose={()=>setCont(false)}/>

<EditDrawer open={editOwner} onClose={()=>setEditOwner(false)} title="Your details" sub="Name, email, and how clients reach you"
 saving={o.saving} notify={notify} successMsg="Profile saved."
 initial={{full_name:o.owner.name,work_email:o.owner.email,phone:o.owner.phone,website_url:o.owner.website}}
 fields={[
  {key:'full_name',label:'Name',placeholder:'Your name'},
  {key:'work_email',label:'Work email',type:'email',placeholder:'you@yourbusiness.com'},
  {key:'phone',label:'Phone',mono:true,type:'tel',placeholder:'(555) 000-0000'},
  {key:'website_url',label:'Website',placeholder:'yourbusiness.com'},
 ]}
 onSave={patch=>o.saveOwner({full_name:patch.full_name,work_email:patch.work_email,phone:patch.phone,website_url:patch.website_url})}/></div>};

/* ================================================================== *
 * CONTACTS — professional bench (no backend) → entirely Preview.
 * ================================================================== */
const SuContacts=()=>{const[cur,setCur]=React.useState(null);
return <div className="su-2">
<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
<div className="hd" style={{flex:'none',padding:'12px 16px'}}><div style={{minWidth:0}}><h3 style={{fontSize:13.6}}>Your professional bench</h3>
<div className="sub trunc">Who Paige routes to and names in drafts</div></div><PreviewPill/></div>
<div className="pane" style={{flex:1}}>{SU_CONTACTS.map((c,i)=>
<button key={i} onClick={()=>setCur(c)} className="row" style={{width:'100%',textAlign:'left',gap:12,padding:'11px 16px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="tile" style={{width:28,height:28,borderRadius:9,flex:'none',
background:c.gap?'var(--warn-tint)':c.sealed?'var(--gold-tint)':'var(--violet-tint)',
color:c.gap?'var(--warn)':c.sealed?'var(--gold)':'var(--violet)'}}>
{c.gap?<Ic.plus size={14}/>:c.sealed?<LockIcon size={13}/>:<Ic.users size={14}/>}</span>
<span className="grow" style={{minWidth:0}}>
<span className="eyebrow trunc" style={{fontSize:9,display:'block'}}>{c.r}</span>
<span className="trunc" style={{fontSize:12.9,fontWeight:600,display:'block',marginTop:1}}>{c.sealed?'Sealed':c.n}</span></span>
{c.gap&&<span className="pill pill-warn" style={{flex:'none'}}>Gap</span>}
{c.sealed&&<span className="pill pill-n" style={{flex:'none'}}>Encrypted</span>}
<Ic.chev size={13} style={{color:'var(--ink-3)',flex:'none'}}/></button>)}
<div style={{padding:'12px 16px',borderTop:'1px solid var(--line)',background:'var(--surface-2)',fontSize:12.5,color:'var(--ink-2)',lineHeight:1.5}}>
Sample bench — the professional-contacts registry has no live backend yet.</div></div></div>

<div className="su-stack">
<PeekCard title="Banking and payouts" sub="Referenced, never stored in full" foldTitle="Banking and payouts" right={<PreviewPill/>}
 peek={<div style={{padding:'11px 14px 14px',display:'grid',gap:8}}>
 <div className="row" style={{gap:10,fontSize:12.6}}><LockIcon size={12}/><span className="grow trunc">Operating account</span><span className="mono sub">••4471</span></div>
 <div className="row" style={{gap:10,fontSize:12.6}}><span className="dot" style={{color:'var(--ok)'}}/><span className="grow trunc">Payout schedule</span><span className="sub">Daily</span></div></div>}>
<div style={{padding:'14px 16px'}}>
<Secret item={SU_SECRETS.find(s=>s.id==='bank')}/>
<div style={{marginTop:12}}><SuRows disabled items={[['Payout schedule','Daily from Stripe',true],['Invoice reply-to','billing@paigeagent.ai',true]]}/></div>
<div className="sub" style={{marginTop:10}}>Sample only — banking and payouts have no live backend yet.</div></div></PeekCard>

<PeekCard title="Vendors you pay" sub="Detected from payment data" foldTitle="Vendors" right={<PreviewPill/>}
 peek={<div style={{padding:'11px 14px 14px',display:'grid',gap:7}}>
 {[['Northlight CRM','$249 / mo'],['Ledgerly Pro','$85 / mo']].map(([n,c],i)=>
 <div key={i} className="row" style={{gap:10,fontSize:12.6}}><span className="grow trunc">{n}</span><span className="mono sub">{c}</span></div>)}</div>}>
<div>{[['Northlight CRM','$249 / mo','CRM'],['Ledgerly Pro','$85 / mo','Accounting'],['Cloudflare','$42 / yr','Domain']].map(([n,c,k],i)=>
<div key={i} className="row" style={{gap:12,padding:'11px 16px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow trunc" style={{fontSize:12.8,fontWeight:500}}>{n}</span><span className="sub trunc" style={{flex:'0 0 120px'}}>{k}</span>
<span className="mono" style={{fontSize:12.6,flex:'none'}}>{c}</span></div>)}
<div className="sub" style={{padding:'11px 16px'}}>Sample only — vendor detection has no live backend yet.</div></div></PeekCard></div>
<ContactDrawer c={cur} open={!!cur} onClose={()=>setCur(null)}/></div>};

/* ================================================================== *
 * PEOPLE — roster WIRED read-only, row → PersonDrawer slide-out;
 * management deferred (§53); reporting tree + departments Preview.
 * ================================================================== */
const statusPill=s=>s==='Active'?'pill-ok':s==='Suspended'?'pill-bad':'pill-warn';
const mapRealPerson=sp=>({n:sp.name,role:sp.role,dept:DASH,type:sp.isOwner?'Owner':DASH,seat:DASH,status:sp.status,email:sp.email,
last:DASH,rep:DASH,clients:DASH,start:DASH,paige:[],mfa:null,sensitive:null});
const SuPeople=()=>{const pe=useSoloPeople();const[roles,setRoles]=React.useState(false);const[cur,setCur]=React.useState(null);
const Node=({name,depth})=>{const p=SU_PEOPLE.find(x=>x.n===name);const kids=SU_TREE[name]||[];
return <div style={{display:'grid',gap:7}}>
<button onClick={()=>p&&setCur({source:'sample',p})} className="row" style={{width:'100%',textAlign:'left',gap:10,padding:'9px 11px',border:'1px solid '+(depth?'var(--line)':'var(--violet-line)'),background:depth?'var(--surface)':'var(--violet-tint)',borderRadius:'var(--r-m)'}}>
<Avatar name={name} size={26}/>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:12.7,fontWeight:600,display:'block'}}>{name}</span>
<span className="sub trunc" style={{display:'block'}}>{p?p.role:DASH}</span></span>
<span className="pill pill-n" style={{flex:'none'}}>{p?p.type:DASH}</span></button>
{kids.length>0&&<div style={{marginLeft:16,paddingLeft:14,borderLeft:'1px solid var(--line)',display:'grid',gap:7}}>
{kids.map(k=><Node key={k} name={k} depth={depth+1}/>)}</div>}</div>};
return <div className="su-2">
<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
<div className="hd" style={{flex:'none',padding:'12px 16px'}}><div style={{minWidth:0}}><h3 style={{fontSize:13.6}}>People</h3>
<div className="sub trunc">{pe.loading?'Loading your team…':pe.onlyYou?'Just you for now':pe.people.length+' on your team'}</div></div>
<div className="row" style={{gap:8}}><button className="btn btn-s" onClick={()=>setRoles(true)}>Roles</button>
<button className="btn btn-s" disabled title="Inviting teammates is coming soon"><Ic.plus size={13}/>Add</button></div></div>
<div className="pane" style={{flex:1}}>
{pe.loading?[0,1].map(i=><div key={i} className="row" style={{padding:'12px 16px',borderTop:i?'1px solid var(--line-soft)':'0',gap:12}}>
<span className="tile" style={{width:28,height:28,borderRadius:'50%',background:'var(--surface-sunk)',flex:'none'}}/><span className="grow" style={{display:'grid',gap:6}}><SkelLine w="42%"/><SkelLine w="28%"/></span></div>)
:pe.error?<div style={{padding:'34px 20px',textAlign:'center'}}><div style={{fontWeight:600,fontSize:13.4}}>Couldn't load your team</div>
<div className="sub" style={{marginTop:3}}>Only a workspace admin can view the full roster. {pe.error}</div></div>
:pe.people.length===0?<div style={{padding:'34px 20px',textAlign:'center'}}><div style={{fontWeight:600,fontSize:13.4}}>No teammates yet</div>
<div className="sub" style={{marginTop:3}}>It's just you running this workspace.</div></div>
:pe.people.map((p,i)=>
<button key={p.id} onClick={()=>setCur({source:'real',p:mapRealPerson(p)})} className="row" style={{width:'100%',textAlign:'left',gap:12,padding:'11px 16px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<Avatar name={p.name} size={28}/>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:12.9,fontWeight:600,display:'block'}}>{p.name}</span>
<span className="sub trunc" style={{display:'block'}}>{p.role}{p.email?' · '+p.email:''}</span></span>
{p.isOwner&&<LockIcon size={12}/>}
<span className={'pill '+statusPill(p.status)} style={{flex:'none'}}>{p.status}</span>
<Ic.chev size={13} style={{color:'var(--ink-3)',flex:'none'}}/></button>)}</div>
<div style={{padding:'11px 16px',borderTop:'1px solid var(--line)',background:'var(--surface-2)',fontSize:12.3,color:'var(--ink-2)',lineHeight:1.5}}>
Inviting, role changes, and removing access are coming soon — the roster above is live. Click a teammate to open their seat.</div></div>

<div className="su-stack">
<PeekCard title="Hierarchy" sub="Who reports to whom" foldTitle="Reporting structure" right={<PreviewPill/>}
 peek={<div style={{padding:'11px 14px 14px'}}><Node name="Jordan Avery" depth={0}/></div>}>
<div style={{padding:'16px 18px'}}><Node name="Jordan Avery" depth={0}/>
<div className="sub" style={{marginTop:14,lineHeight:1.55}}>Sample reporting line — the org tree has no live backend yet.</div></div></PeekCard>

<PeekCard title="Departments" sub="Paige's six departments, and who owns each" foldTitle="Department ownership" right={<PreviewPill/>}
 peek={<div style={{padding:'11px 14px 14px',display:'grid',gap:7}}>
 {PT.team.slice(0,3).map((d,i)=><div key={i} className="row" style={{gap:10,fontSize:12.6}}>
 <span style={{width:7,height:7,borderRadius:'50%',background:d.c,flex:'none'}}/><span className="grow trunc">{d.n}</span>
 <span className="sub trunc" style={{maxWidth:110}}>You</span></div>)}
 <div className="sub" style={{paddingLeft:17,fontSize:11.4}}>+3 more</div></div>}>
<div>{PT.team.map((d,i)=><div key={i} className="row" style={{gap:11,padding:'11px 16px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{width:7,height:7,borderRadius:'50%',background:d.c,flex:'none'}}/>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:12.8,fontWeight:500,display:'block'}}>{d.n}</span>
<span className="sub trunc" style={{display:'block'}}>{d.role}</span></span>
<span className="sub trunc" style={{flex:'none',maxWidth:150}}>You</span></div>)}
<div className="sub" style={{padding:'11px 16px',borderTop:'1px solid var(--line-soft)'}}>Sample ownership — not yet wired to real department assignments.</div></div></PeekCard></div>

<Foldout open={roles} onClose={()=>setRoles(false)} title="Roles and permissions" sub="What each seat can reach">
<div>{pe.roleLegend.map((r,i)=><div key={r.role} className="row" style={{gap:12,padding:'13px 20px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{flex:'0 0 120px',fontSize:13,fontWeight:600}}>{r.label}</span><span className="sub grow" style={{lineHeight:1.5}}>{r.blurb}</span></div>)}
<div className="sub" style={{padding:'14px 20px',borderTop:'1px solid var(--line)',lineHeight:1.55}}>These are the roles you can assign to teammates. Granting and changing roles is coming soon.</div></div></Foldout>

<PersonDrawer p={cur?cur.p:null} source={cur?cur.source:'sample'} open={!!cur} onClose={()=>setCur(null)}/></div>};

/* ================================================================== *
 * COMMS & DATA — sending identity + billing WIRED read-only; rest Preview.
 * ================================================================== */
const domainPill=s=>s==='verified'?'pill-ok':s==='failed'?'pill-bad':'pill-warn';
const SuComms=()=>{const c=useSoloComms();
return <div className="su-fill">
{c.error&&<div className="card" style={{padding:'12px 16px',fontSize:12.8,color:'var(--bad)'}}>Couldn't load your comms settings. {c.error}</div>}

<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
<div className="hd" style={{flex:'none',padding:'12px 16px'}}><div style={{minWidth:0}}><h3 style={{fontSize:13.6}}>Sending identity</h3>
<div className="sub trunc">Everything Paige sends goes out as you</div></div>
<button className="btn btn-s" disabled title="Adding a sender domain is coming soon"><Ic.plus size={13}/>Add domain</button></div>
<div className="pane" style={{flex:1}}>
{c.loading?<CardSkel/>:<div>
<div style={{padding:'14px 16px'}}><SuGrid>
<SuField k="Default sender" v={c.sending.defaultSender||'no-reply@paigeagent.ai'} hint={c.sending.defaultSender?null:'Platform default until you verify your own domain'}/>
<SuField k="From name" v={c.sending.fromName}/><SuField k="Support inbox" v={c.sending.supportEmail}/></SuGrid></div>
{c.domains.length>0&&<div style={{borderTop:'1px solid var(--line-soft)'}}>
{c.domains.map((d,i)=><div key={d.id} className="row" style={{gap:11,padding:'11px 16px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<Ic.mail size={14} style={{color:'var(--ink-3)',flex:'none'}}/>
<span className="grow trunc" style={{fontSize:12.8,fontWeight:500}}>{d.fromEmailLocal}@{d.domain}</span>
{d.isDefault&&<span className="pill pill-n" style={{flex:'none'}}>Default</span>}
<span className={'pill '+domainPill(d.status)} style={{flex:'none'}}>{d.status}</span></div>)}</div>}
{c.domains.length===0&&<div className="sub" style={{padding:'0 16px 14px'}}>No custom domain yet — sends use the platform default. Adding and verifying a domain is coming soon.</div>}</div>}</div></div>

<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
<div className="hd" style={{flex:'none',padding:'12px 16px'}}><div style={{minWidth:0}}><h3 style={{fontSize:13.6}}>Plan and billing</h3>
<div className="sub trunc">Your Paige plan</div></div></div>
<div className="pane" style={{flex:1}}>
{c.loading?<CardSkel/>:c.isSubAccount?
 <div style={{padding:'20px'}}><div style={{fontWeight:600,fontSize:13.4}}>Managed by your parent agency</div>
 <div className="sub" style={{marginTop:4,lineHeight:1.55,maxWidth:460}}>Your workspace runs on your agency's plan, so there's nothing to subscribe to here.</div></div>
 :c.billing?
 <div style={{padding:'16px 20px 20px'}}><SuGrid>
 <SuField k="Plan" v={c.billing.name}/>
 <SuField k="Status" v={c.billing.status?<span className={'pill '+(c.billing.hasActiveSub?'pill-ok':'pill-n')}>{c.billing.status}</span>:(c.billing.hasActiveSub?'Active':'No plan yet')}/>
 <SuField k="Price" v={c.billing.priceLabel}/><SuField k="Renewal" v={c.billing.renewsLabel}/></SuGrid>
 <div className="row" style={{gap:9,marginTop:14}}>
 <button className="btn btn-s" disabled title={c.billing.canManage?'Managing your plan is coming soon':'Ask your workspace admin to manage billing'}>Manage plan</button></div>
 <div className="sub" style={{marginTop:9,lineHeight:1.5}}>{c.billing.hasActiveSub?'Changing or cancelling your plan is coming soon.':'Subscribing is coming soon to this surface.'}</div></div>
 :<div style={{padding:'20px'}}><div className="sub">Billing details aren't available right now.</div></div>}</div></div>

<PeekCard title="Notifications" sub="What reaches you, and how" foldTitle="Notifications" right={<PreviewPill/>}
 peek={<div style={{padding:'11px 14px 14px',display:'grid',gap:8}}>
 {[['Morning brief','7:00am ET'],['Drafted for approval','Immediately']].map(([k,v],i)=>
 <div key={i} className="row" style={{gap:10,fontSize:12.6}}><span className="dot" style={{color:'var(--violet)'}}/>
 <span className="grow trunc">{k}</span><span className="sub trunc">{v}</span></div>)}</div>}>
<SuRows disabled items={[['Morning brief','7:00am ET, email and in-app',true],['Anything drafted for approval','In-app, immediately',true],
['Critical Systems Check findings','Email and SMS',true],['Weekly performance summary','Monday 8:00am',false]]}/>
<div className="sub" style={{padding:'12px 16px',borderTop:'1px solid var(--line)'}}>Sample only — notification preferences have no live backend yet.</div></PeekCard>

<PeekCard title="Data, retention, and export" sub="Your material stays yours" foldTitle="Data and retention" right={<PreviewPill/>}
 peek={<div style={{padding:'11px 14px 14px',display:'grid',gap:8}}>
 {[['Encryption at rest','AES-256 on every record'],['Trains no models','Your material is excluded']].map(([k,v],i)=>
 <div key={i} className="row" style={{gap:10,fontSize:12.6}}><span style={{display:'flex',color:'var(--ok)'}}><Ic.check size={13}/></span>
 <span className="grow trunc">{k}</span><span className="sub trunc">{v}</span></div>)}</div>}>
<div><SuRows disabled items={[['Keep client threads','Indefinitely, until you delete them',true],
['Keep uploaded documents','Indefinitely, linked to their obligation',true],
['Use your data to improve models','Off — your material trains nothing',false]]}/>
<div style={{padding:'13px 16px',borderTop:'1px solid var(--line)'}}>
<div className="row" style={{gap:9,flexWrap:'wrap'}}><button className="btn btn-s" disabled><Ic.doc size={13}/>Export everything</button>
<button className="btn btn-s" disabled>Download audit log</button></div>
<div className="sub" style={{marginTop:8}}>Sample only — retention controls and export have no live backend yet.</div></div></div></PeekCard></div>};

export const Setup=({start='biz'})=>{const[tab,setTab]=useSubtabRoute("solo","setup",subtabByKey("solo","setup",start)?start:"biz");const[toast,setToast]=React.useState(null);
const notify=React.useCallback(msg=>{setToast(msg);window.setTimeout(()=>setToast(null),3200)},[]);
const tabs=[['biz','Business',()=><Ic.store size={14}/>],['owner','Owner',()=><Ic.users size={14}/>],['contacts','Contacts',()=><Ic.mail size={14}/>],
['people','People',()=><Ic.grid size={14}/>],['comms','Comms & data',()=><Ic.gear size={14}/>]];
const subs={biz:'Legal name and how the business is reached — plus registered details and entities.',
owner:'Your profile, how Paige signs as you, access, and continuity.',
contacts:'Your accountant, attorney, broker, and agent — who Paige routes to.',
people:'Seats, roles, and reporting lines for your team.',
comms:'Sending identity, plan and billing, notifications, and retention.'};
const body={biz:<SuBusiness notify={notify}/>,owner:<SuOwner notify={notify}/>,contacts:<SuContacts/>,people:<SuPeople/>,comms:<SuComms/>}[tab];
return <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0,minWidth:0,alignItems:'stretch'}}>
<SubTabs tabs={tabs} cur={tab} set={setTab} right={<span className="row pill pill-n" style={{gap:6}}><LockIcon size={11}/>Encrypted</span>}/>
<Wrap><PageHead eyebrow="Setup" title={(tabs.find(t=>t[0]===tab)||[])[1]} sub={subs[tab]}/>
<div key={tab} className="fade-in su-page">{body}</div></Wrap>
{toast&&<div className="fade-in" style={{position:'fixed',bottom:26,left:'50%',transform:'translateX(-50%)',background:'var(--rail)',color:'var(--ink-inv)',padding:'11px 18px',borderRadius:12,fontSize:13,boxShadow:'var(--sh-3)',zIndex:60,maxWidth:'min(560px,90vw)'}}>{toast}</div>}</div>};
export { SU_BIZ, Secret, SlideOut, LockIcon };
