// @ts-nocheck
import React from "react";
import { Ic, Avatar, Meter, SlideOut } from "./_shared";

export const TM_DIR_SEED=[
 {n:'Jordan Avery',pref:'Jordan',title:'Founder & Principal',role:'Owner',dept:'Leadership',
  e:'jordan@paigeagent.ai',p:'(404) 555-0188',tz:'Eastern · GMT-4',loc:'Atlanta, GA',start:'Mar 2023',rep:'—',
  bio:'Runs the business. Carries all eight accounts today and answers for pricing, scope and anything Paige escalates.',
  skills:['Pricing','Retention','Positioning'],photo:null,pres:'online'},
 {n:'Maya Rios',pref:'Maya',title:'Account lead',role:'Manager',dept:'Client Success',
  e:'maya@paigeagent.ai',p:'(404) 555-0244',tz:'Eastern · GMT-4',loc:'Decatur, GA',start:'Starts on accept',rep:'Jordan Avery',
  bio:'Will own the Harper & Vale, Northwind and Bellweather relationships, and approve Client Success drafts.',
  skills:['Onboarding','Client comms','QBRs'],photo:null,pres:'pending'},
 {n:'Devon Park',pref:'Devon',title:'Strategist',role:'Specialist',dept:'Delivery',
  e:'devon@contract.co',p:'(312) 555-0173',tz:'Central · GMT-5',loc:'Chicago, IL',start:'Starts on accept',rep:'Jordan Avery',
  bio:'Contract strategist, twenty hours a week through December. First candidate for the Ridgeline handoff.',
  skills:['Funnels','Reporting','Ops audits'],photo:null,pres:'pending'},
 {n:'Sasha Kim',pref:'Sasha',title:'Client success',role:'Coordinator',dept:'Client Success',
  e:'sasha@contract.co',p:'(206) 555-0119',tz:'Pacific · GMT-7',loc:'Seattle, WA',start:'Invite not sent',rep:'Maya Rios',
  bio:'Seat built for routine client mail and scheduling on Selby and Okonkwo. Nothing sent yet.',
  skills:['Scheduling','Reply library'],photo:null,pres:'off'},
 {n:'Dolores Ruiz',pref:'Dolores',title:'CPA · Advisor',role:'Advisor',dept:'Finance',
  e:'druiz@ruizwhitfield.com',p:'(404) 555-0231',tz:'Eastern · GMT-4',loc:'Atlanta, GA',start:'Advising since Mar 2023',rep:'Outside the line',
  bio:'Reviews the books quarterly and answers tax and entity questions. Read-only on Finance, no client access.',
  skills:['Tax','Entity structure'],photo:null,pres:'off'}];

const PhotoWell=({name,photo,onPick,onClear,size=76,editing})=>{const inp=React.useRef(null);
const[over,setOver]=React.useState(false);
const take=f=>{if(f&&/^image\//.test(f.type))onPick(URL.createObjectURL(f))};
return <div style={{display:'grid',gap:7,justifyItems:'center'}}>
<div onDragOver={e=>{if(editing){e.preventDefault();setOver(true)}}} onDragLeave={()=>setOver(false)}
onDrop={e=>{if(!editing)return;e.preventDefault();setOver(false);take(e.dataTransfer.files[0])}}
onClick={()=>editing&&inp.current.click()}
style={{width:size,height:size,borderRadius:'50%',position:'relative',flex:'none',cursor:editing?'pointer':'default',
outline:over?'2px dashed var(--gold)':'none',outlineOffset:3}}>
{photo?<img src={photo} alt={name} style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover',display:'block'}}/>
:<Avatar name={name} size={size}/>}
{editing&&<span className="tile" style={{position:'absolute',right:-2,bottom:-2,width:26,height:26,borderRadius:'50%',
background:'var(--gold)',color:'var(--rail)',border:'2px solid var(--surface)'}}><Ic.plus size={13}/></span>}
<input ref={inp} type="file" accept="image/*" onChange={e=>take(e.target.files[0])} style={{display:'none'}}/></div>
{editing&&<div className="row" style={{gap:7}}>
<button className="btn btn-s" style={{height:24,fontSize:11}} onClick={()=>inp.current.click()}>{photo?'Replace':'Upload photo'}</button>
{photo&&<button className="btn btn-s" style={{height:24,fontSize:11}} onClick={onClear}>Remove</button>}</div>}
{editing&&!photo&&<div className="sub" style={{fontSize:10.6,textAlign:'center',maxWidth:150,lineHeight:1.45}}>Drop a headshot here or click. Square crops best.</div>}</div>};

const Fld=({k,v,edit,onChange,wide,area,opts})=>(<div style={{gridColumn:wide?'1 / -1':'auto'}}>
<div className="eyebrow" style={{fontSize:9.4}}>{k}</div>
{edit?(opts?<select value={v} onChange={e=>onChange(e.target.value)} style={{marginTop:5,width:'100%',padding:'8px 10px',border:'1px solid var(--line)',
borderRadius:'var(--r-s,8px)',background:'var(--surface-2)',color:'var(--ink)',fontSize:12.7,fontFamily:'inherit'}}>
{opts.map(o=><option key={o} value={o}>{o}</option>)}</select>
:area?<textarea value={v} rows={3} onChange={e=>onChange(e.target.value)} style={{marginTop:5,width:'100%',padding:'8px 10px',border:'1px solid var(--line)',
borderRadius:'var(--r-s,8px)',background:'var(--surface-2)',color:'var(--ink)',fontSize:12.7,fontFamily:'inherit',lineHeight:1.55,resize:'vertical'}}/>
:<input value={v} onChange={e=>onChange(e.target.value)} style={{marginTop:5,width:'100%',padding:'8px 10px',border:'1px solid var(--line)',
borderRadius:'var(--r-s,8px)',background:'var(--surface-2)',color:'var(--ink)',fontSize:12.7,fontFamily:'inherit'}}/>)
:<div style={{fontSize:12.9,marginTop:4,lineHeight:1.5,color:v==='—'?'var(--ink-3)':'var(--ink)'}}>{v}</div>}</div>);

export const ProfileDrawer=({m,onClose,onSave,onInvite})=>{const[edit,setEdit]=React.useState(false);
const[d,setD]=React.useState(m);
React.useEffect(()=>{setD(m);setEdit(false)},[m]);
if(!m||!d)return null;
const set=(k,v)=>setD(x=>({...x,[k]:v}));
const roleDef=(window.TM_ROLES||[]).find(r=>r.k===d.role);
const st=d.pres==='online'?['pill-ok','Active seat']:d.pres==='pending'?['pill-warn','Invite pending']:['pill-n','No invite sent'];
return <SlideOut open={!!m} onClose={onClose} title={edit?'Edit profile':d.n} sub={d.title+' · '+d.dept} icon={<Ic.users size={15}/>} wide
foot={edit?<><button className="btn btn-s btn-g" onClick={()=>{onSave(d);setEdit(false)}}><Ic.check size={12}/>Save profile</button>
<button className="btn btn-s" onClick={()=>{setD(m);setEdit(false)}}>Cancel</button></>
:<><button className="btn btn-s btn-p" onClick={()=>setEdit(true)}><Ic.gear size={12}/>Edit profile</button>
{d.pres!=='online'&&<button className="btn btn-s" onClick={()=>onInvite(roleDef)}><Ic.send size={12}/>{d.pres==='pending'?'Resend invite':'Send invite'}</button>}
<button className="btn btn-s" style={{marginLeft:'auto'}}><Ic.mail size={12}/>Message</button></>}>
<div className="row" style={{gap:16,alignItems:'flex-start'}}>
<PhotoWell name={d.n} photo={d.photo} editing={edit} onPick={u=>set('photo',u)} onClear={()=>set('photo',null)}/>
<div className="grow" style={{minWidth:0}}>
<div className="row" style={{gap:7,flexWrap:'wrap'}}>
<span className={'pill '+st[0]}>{d.pres==='online'&&<span className="dot"/>}{st[1]}</span>
<span className="pill pill-v">{d.role}</span><span className="pill pill-n">{d.dept}</span></div>
<div style={{fontSize:12.9,color:'var(--ink-2)',lineHeight:1.6,marginTop:10}}>
{edit?<Fld k="About" v={d.bio} edit area onChange={v=>set('bio',v)}/>:d.bio}</div></div></div>

<div className="eyebrow" style={{marginTop:20}}>Role and reporting</div>
<div className="two" style={{gap:12,marginTop:8}}>
<Fld k="Role" v={d.role} edit={edit} onChange={v=>set('role',v)} opts={(window.TM_ROLES||[]).map(r=>r.k)}/>
<Fld k="Job title" v={d.title} edit={edit} onChange={v=>set('title',v)}/>
<Fld k="Department" v={d.dept} edit={edit} onChange={v=>set('dept',v)}
opts={['Leadership','Client Success','Delivery','Finance','Marketing','Operations']}/>
<Fld k="Reports to" v={d.rep} edit={edit} onChange={v=>set('rep',v)}/></div>
{roleDef&&<div style={{marginTop:10,padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)'}}>
<div className="sub" style={{fontSize:11.4,lineHeight:1.5}}>{roleDef.purpose}</div>
<div className="row" style={{gap:6,marginTop:8,flexWrap:'wrap'}}>{roleDef.scope.map(s=><span key={s} className="pill pill-v" style={{fontSize:10.2}}>{s}</span>)}
<span className="sub" style={{marginLeft:'auto',fontSize:10.8}}>{roleDef.resp.length} responsibilities</span></div></div>}

<div className="eyebrow" style={{marginTop:20}}>Contact</div>
<div className="two" style={{gap:12,marginTop:8}}>
<Fld k="Preferred name" v={d.pref} edit={edit} onChange={v=>set('pref',v)}/>
<Fld k="Email" v={d.e} edit={edit} onChange={v=>set('e',v)}/>
<Fld k="Phone" v={d.p} edit={edit} onChange={v=>set('p',v)}/>
<Fld k="Time zone" v={d.tz} edit={edit} onChange={v=>set('tz',v)}/>
<Fld k="Location" v={d.loc} edit={edit} onChange={v=>set('loc',v)}/>
<Fld k="Start" v={d.start} edit={edit} onChange={v=>set('start',v)}/></div>

<div className="eyebrow" style={{marginTop:20}}>What they do</div>
<div className="row" style={{gap:6,marginTop:8,flexWrap:'wrap'}}>{d.skills.map(s=><span key={s} className="pill pill-n">{s}</span>)}
{edit&&<button className="btn btn-s" style={{height:25,fontSize:11}}><Ic.plus size={11}/>Add</button>}</div>

{!edit&&<><div className="eyebrow" style={{marginTop:20}}>Accounts on their name</div>
<div style={{marginTop:8,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{(window.TM?TM.accts:[]).filter(a=>a.own.split(' (')[0]===d.n||(d.role==='Owner'&&a.own==='You')).map((a,i)=>
<div key={a.c} className="row" style={{gap:12,padding:'10px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow trunc" style={{fontSize:12.6}}>{a.c}</span>
<span className="mono sub" style={{fontSize:11.4,flex:'none'}}>{a.hrs}h/mo</span></div>)}
{!(window.TM?TM.accts:[]).some(a=>a.own.split(' (')[0]===d.n||(d.role==='Owner'&&a.own==='You'))&&
<div className="sub" style={{padding:'11px 13px',fontSize:12}}>Nothing assigned yet.</div>}</div></>}

<div className="sub" style={{marginTop:18,fontSize:11.6,lineHeight:1.55}}>Seat permissions and sealed-record access come from the role, not this profile. Outside professionals — your CPA, attorney, broker — live under Setup.</div></SlideOut>};

export const DirCard=({m,onOpen})=>{const st=m.pres==='online'?['var(--ok)','Active']:m.pres==='pending'?['var(--warn)','Invited']:['var(--ink-3)','Not invited'];
return <button onClick={()=>onOpen(m)} className="card" style={{padding:'15px 15px 13px',display:'flex',flexDirection:'column',gap:10,textAlign:'left',minWidth:0}}>
<div className="row" style={{gap:12}}>
<span style={{position:'relative',flex:'none'}}>
{m.photo?<img src={m.photo} alt={m.n} style={{width:42,height:42,borderRadius:'50%',objectFit:'cover',display:'block'}}/>:<Avatar name={m.n} size={42}/>}
<span style={{position:'absolute',right:-1,bottom:-1,width:12,height:12,borderRadius:'50%',background:st[0],border:'2px solid var(--surface)'}}/></span>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:13.6,fontWeight:600,display:'block'}}>{m.n}</span>
<span className="sub trunc" style={{fontSize:11.6,display:'block'}}>{m.title}</span></span></div>
<div className="row" style={{gap:6,flexWrap:'wrap'}}>
<span className="pill pill-v" style={{fontSize:10.4}}>{m.role}</span>
<span className="pill pill-n" style={{fontSize:10.4}}>{m.dept}</span>
{m.pres!=='online'&&<span className={'pill '+(m.pres==='pending'?'pill-warn':'pill-n')} style={{fontSize:10.4}}>{st[1]}</span>}</div>
<div style={{display:'grid',gap:4}}>
<span className="row sub trunc" style={{gap:7,fontSize:11.6}}><Ic.mail size={12}/>{m.e}</span>
<span className="row sub trunc" style={{gap:7,fontSize:11.6}}><Ic.clock size={12}/>{m.tz}</span></div>
<div className="row" style={{gap:6,marginTop:'auto',paddingTop:3}}>
<span className="btn btn-s" style={{height:25,fontSize:11.2}}><Ic.gear size={11}/>Edit profile</span>
{!m.photo&&<span className="sub" style={{fontSize:10.6,marginLeft:'auto'}}>No photo</span>}</div></button>};

export const TmDirectory=({dir,setDir,onInvite})=>{const[cur,setCur]=React.useState(null);
const[q,setQ]=React.useState('');
const rows=dir.filter(m=>!q||(m.n+m.title+m.role+m.dept).toLowerCase().includes(q.toLowerCase()));
const noPhoto=dir.filter(m=>!m.photo).length;
const save=d=>{setDir(ds=>ds.map(x=>x.n===cur.n?d:x));setCur(d)};
return <div className="an-2">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div style={{minWidth:0}}><h3>Team directory</h3>
<div className="sub trunc">Team members only — full profiles, editable</div></div>
<div className="row" style={{gap:8,flex:'none'}}>
<span className="row" style={{gap:7,padding:'0 10px',height:28,border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)'}}>
<Ic.search size={12} style={{color:'var(--ink-3)'}}/>
<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Find someone" style={{border:0,background:'transparent',color:'var(--ink)',
fontSize:12.2,fontFamily:'inherit',outline:'none',width:120}}/></span>
<button className="btn btn-s btn-p" onClick={()=>onInvite(null)}><Ic.plus size={12}/>Add member</button></div></div>
<div className="pane" style={{flex:1,padding:'12px 14px'}}>
<div className="g3">{rows.map(m=><DirCard key={m.n} m={m} onOpen={setCur}/>)}</div>
{!rows.length&&<div className="sub" style={{padding:'20px 4px',fontSize:12.5}}>No one matches that.</div>}</div></div>

<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Profile health</h3><div className="sub">What's missing before they start</div></div></div>
<div className="pane" style={{flex:1,padding:'12px 13px',display:'grid',gap:9,alignContent:'start'}}>
<div style={{padding:'12px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:'var(--surface-2)'}}>
<div className="eyebrow" style={{fontSize:9.6}}>Photos on file</div>
<div style={{fontSize:20,fontWeight:600,letterSpacing:'-.03em',margin:'6px 0 8px'}}>{dir.length-noPhoto} of {dir.length}</div>
<Meter pct={(dir.length-noPhoto)/dir.length*100} tone="var(--gold)" h={7}/>
<div style={{fontSize:11.8,color:'var(--ink-2)',lineHeight:1.5,marginTop:9}}>Photos show up on client-facing recaps and the contact sheet Paige embeds. Open a profile to drop one in.</div></div>
{dir.filter(m=>m.pres!=='online').map(m=><div key={m.n} className="row" style={{gap:10,padding:'10px 12px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
{m.photo?<img src={m.photo} alt={m.n} style={{width:26,height:26,borderRadius:'50%',objectFit:'cover',flex:'none'}}/>:<Avatar name={m.n} size={26}/>}
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:12.4,fontWeight:500,display:'block'}}>{m.n}</span>
<span className="sub trunc" style={{fontSize:11,display:'block'}}>{m.pres==='pending'?'Invite sent, not opened':'Invite never sent'}</span></span>
<button className="btn btn-s" onClick={()=>onInvite((window.TM_ROLES||[]).find(r=>r.k===m.role))} style={{height:24,fontSize:11,flex:'none'}}>
{m.pres==='pending'?'Resend':'Send'}</button></div>)}
<div className="sub" style={{fontSize:11.4,lineHeight:1.55,padding:'2px 2px 0'}}>Outside professionals — CPA, attorney, insurance broker, registered agent — are kept in Setup, not here.</div></div></div>
<ProfileDrawer m={cur} onClose={()=>setCur(null)} onSave={save} onInvite={onInvite}/></div>};
