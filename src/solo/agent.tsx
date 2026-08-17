// @ts-nocheck
import React from "react";
import { Ic } from "./_shared";
import { useSoloProposals } from "./data/useSoloProposals";
import { useSoloChat } from "./data/useSoloChat";

export const CHAT_MODELS=[
 {id:'paige-2',n:'Paige 2',d:'Her default. Fast, knows your Playbook, drafts in your voice.',tag:'Default'},
 {id:'paige-2-deep',n:'Paige 2 Deep',d:'Thinks longer before answering. Use for pricing, positioning, hard calls.',tag:'Reasoning'},
 {id:'paige-2-fast',n:'Paige 2 Fast',d:'Instant replies for quick lookups and short drafts.',tag:'Fast'},
 {id:'paige-research',n:'Paige Research',d:'Reads the web and your competitors before it answers.',tag:'Browsing'}];
export const CHAT_FOCUS=[
 {id:'none',n:'No focus',ic:'spark',d:'She routes by what you say.'},
 {id:'cs',n:'Client Success',ic:'users',d:'Onboarding, answers, nurture, renewals.'},
 {id:'growth',n:'Growth',ic:'trend',d:'Pipeline, follow-ups, proposals.'},
 {id:'mkt',n:'Marketing',ic:'store',d:'Content, campaigns, social.'},
 {id:'fin',n:'Finance',ic:'chart',d:'Invoicing, dunning, forecasts.'},
 {id:'ops',n:'Operations',ic:'gear',d:'Delivery, workflows, vendors.'},
 {id:'sys',n:'Systems',ic:'pulse',d:'Checks, fixes, data quality.'},
 {id:'vibe',n:'Vibe Studio',ic:'bolt',d:'Build a page, funnel, form, or tool.'}];
// Projects grouping has no backend on paige_chat_threads (no project column) —
// Preview: the section header stays, seeded with nothing (§13, never fabricate).
const CHAT_PROJECTS=[];

export const Bubble=({m,onAct})=>{const[copied,setCopied]=React.useState(false);const[vote,setVote]=React.useState(null);const[cite,setCite]=React.useState(false);
if(m.r==='me')return <div className="row bub-me" style={{alignSelf:'flex-end',maxWidth:'80%',gap:8,alignItems:'flex-end'}}>
<div className="bub-tools row" style={{gap:2}}>
<button className="bub-b" onClick={()=>onAct&&onAct('edit',m)} title="Edit message"><Ic.doc size={13}/></button>
<button className="bub-b" onClick={()=>{setCopied(true);setTimeout(()=>setCopied(false),1200)}} title="Copy">{copied?<Ic.check size={13}/>:<Ic.plus size={13}/>}</button></div>
<div style={{background:'var(--ink)',color:'var(--ink-inv)',padding:'11px 15px',borderRadius:'16px 16px 5px 16px',fontSize:13.5,lineHeight:1.55}}>{m.t}</div></div>;
return <div className="bub-ai" style={{maxWidth:'92%'}}>
<div className="row" style={{alignItems:'flex-start',gap:11}}>
<div className="tile" style={{width:28,height:28,borderRadius:'50%',background:'var(--violet-tint)',color:'var(--violet)',flex:'none'}}><Ic.spark size={15}/></div>
<div style={{minWidth:0}}>
<div style={{background:'var(--surface-2)',border:'1px solid var(--line)',padding:'12px 15px',borderRadius:'5px 16px 16px 16px',fontSize:13.5,lineHeight:1.6,color:'var(--ink-2)',whiteSpace:'pre-wrap'}}>{m.t}</div>
{m.cited&&<button onClick={()=>setCite(!cite)} className="row" style={{gap:6,marginTop:7,fontSize:11.6,color:'var(--ink-3)'}}>
<Ic.doc size={12}/>{m.cited.length} sources<Ic.chev size={11} style={{transform:cite?'rotate(90deg)':'',transition:'.15s'}}/></button>}
{cite&&m.cited&&<div className="fade-in" style={{marginTop:7,display:'grid',gap:5}}>{m.cited.map((c,i)=>
<div key={i} className="row" style={{gap:8,padding:'7px 11px',border:'1px solid var(--line)',borderRadius:9,fontSize:11.8,color:'var(--ink-2)'}}>
<span className="dot" style={{color:'var(--violet)'}}/>{c}</div>)}</div>}
<div className="bub-tools row" style={{gap:2,marginTop:6,marginLeft:-6}}>
<button className="bub-b" onClick={()=>{setCopied(true);setTimeout(()=>setCopied(false),1200)}} title="Copy">{copied?<Ic.check size={13}/>:<Ic.doc size={13}/>}</button>
<button className="bub-b" onClick={()=>setVote(vote==='up'?null:'up')} title="Good answer" style={{color:vote==='up'?'var(--ok)':''}}><Ic.check size={13}/></button>
<button className="bub-b" onClick={()=>setVote(vote==='down'?null:'down')} title="Bad answer" style={{color:vote==='down'?'var(--bad)':''}}><Ic.x size={13}/></button>
<button className="bub-b" onClick={()=>onAct&&onAct('retry',m)} title="Try again"><Ic.pulse size={13}/></button>
<button className="bub-b" onClick={()=>onAct&&onAct('speak',m)} title="Read aloud"><Ic.bell size={13}/></button>
<button className="bub-b" onClick={()=>onAct&&onAct('branch',m)} title="Branch into a new chat"><Ic.arrow size={13}/></button></div></div></div></div>};

export const Composer=({onSend,chips,model,setModel,focus,setFocus,compact})=>{
const[v,setV]=React.useState('');const[menu,setMenu]=React.useState(null);const[att,setAtt]=React.useState([]);const[rec,setRec]=React.useState(false);
const ta=React.useRef(null);
const go=()=>{if(v.trim()||att.length){onSend(v.trim()||'(attachment)');setV('');setAtt([]);if(ta.current)ta.current.style.height='auto'}};
const grow=e=>{const el=e.target;el.style.height='auto';el.style.height=Math.min(el.scrollHeight,150)+'px';setV(el.value)};
const M=CHAT_MODELS.find(m=>m.id===model)||CHAT_MODELS[0];
const F=CHAT_FOCUS.find(f=>f.id===focus)||CHAT_FOCUS[0];
const tools=[['Attach a file','doc'],['Add from Business Vault','vault'],['Search the web','search'],['Deep research','spark'],['Build in Vibe Studio','bolt'],['Create an image','grid']];
return <div style={{padding:compact?'10px 14px 12px':'10px 18px 14px',borderTop:'1px solid var(--line-soft)',background:'var(--surface)',position:'relative'}}>
{chips&&<div className="row tabstrip" style={{gap:7,marginBottom:9}}>{chips.map((c,i)=>
<button key={i} onClick={()=>onSend(c)} className="pill pill-n" style={{height:26,cursor:'pointer'}}>{c}</button>)}</div>}
{att.length>0&&<div className="row" style={{gap:7,marginBottom:8,flexWrap:'wrap'}}>{att.map((a,i)=>
<span key={i} className="row" style={{gap:7,height:28,padding:'0 8px 0 10px',borderRadius:9,border:'1px solid var(--line)',background:'var(--surface-2)',fontSize:11.8}}>
<Ic.doc size={12} style={{color:'var(--ink-3)'}}/>{a}
<button onClick={()=>setAtt(x=>x.filter((_,j)=>j!==i))} style={{display:'flex',color:'var(--ink-3)'}}><Ic.x size={11}/></button></span>)}</div>}

{menu==='tools'&&<div className="fade-in card" style={{position:'absolute',left:18,bottom:'100%',marginBottom:8,width:250,zIndex:20,boxShadow:'var(--sh-3)',padding:6,borderRadius:'var(--r-m)'}}>
{tools.map(([t,ic])=><button key={t} onClick={()=>{setMenu(null);if(ic==='doc')setAtt(a=>[...a,'proposal-v3.pdf'])}} className="row"
style={{width:'100%',textAlign:'left',gap:10,padding:'9px 10px',borderRadius:8,fontSize:12.9}}>
<span style={{display:'flex',color:'var(--ink-3)'}}>{React.createElement(Ic[ic]||Ic.doc,{size:15})}</span>{t}</button>)}</div>}

{menu==='model'&&<div className="fade-in card" style={{position:'absolute',right:18,bottom:'100%',marginBottom:8,width:290,zIndex:20,boxShadow:'var(--sh-3)',padding:6,borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{padding:'6px 10px 4px',fontSize:9.5}}>Model · Preview</div>
{CHAT_MODELS.map(m=><button key={m.id} onClick={()=>{setModel&&setModel(m.id);setMenu(null)}} className="row"
style={{width:'100%',textAlign:'left',gap:10,padding:'9px 10px',borderRadius:8,alignItems:'flex-start',background:model===m.id?'var(--surface-sunk)':'transparent'}}>
<span style={{width:15,display:'flex',color:'var(--violet)',paddingTop:2}}>{model===m.id&&<Ic.check size={13}/>}</span>
<span style={{minWidth:0}}><span className="row" style={{gap:7}}><span style={{fontSize:12.9,fontWeight:600}}>{m.n}</span>
<span className="pill pill-n" style={{height:17,fontSize:9.5}}>{m.tag}</span></span>
<span className="sub" style={{display:'block',marginTop:2,lineHeight:1.45}}>{m.d}</span></span></button>)}</div>}

{menu==='focus'&&<div className="fade-in card" style={{position:'absolute',right:18,bottom:'100%',marginBottom:8,width:270,maxHeight:300,overflow:'auto',zIndex:20,boxShadow:'var(--sh-3)',padding:6,borderRadius:'var(--r-m)'}}>
<div className="eyebrow" style={{padding:'6px 10px 4px',fontSize:9.5}}>Focus this chat on · Preview</div>
{CHAT_FOCUS.map(f=><button key={f.id} onClick={()=>{setFocus&&setFocus(f.id);setMenu(null)}} className="row"
style={{width:'100%',textAlign:'left',gap:10,padding:'9px 10px',borderRadius:8,alignItems:'flex-start',background:focus===f.id?'var(--surface-sunk)':'transparent'}}>
<span className="tile" style={{width:22,height:22,borderRadius:7,background:focus===f.id?'var(--violet-tint)':'var(--surface-sunk)',color:focus===f.id?'var(--violet)':'var(--ink-3)'}}>
{React.createElement(Ic[f.ic],{size:12})}</span>
<span style={{minWidth:0}}><span style={{fontSize:12.9,fontWeight:600,display:'block'}}>{f.n}</span>
<span className="sub" style={{display:'block',marginTop:1,lineHeight:1.4}}>{f.d}</span></span></button>)}</div>}

<div onClick={()=>ta.current&&ta.current.focus()} style={{border:'1px solid var(--line)',borderRadius:16,padding:'8px 8px 8px 10px',background:'var(--surface-2)',cursor:'text'}}>
<textarea ref={ta} value={v} onChange={grow} rows={1} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();go()}}}
placeholder="Ask Paige, or tell her what to do…" style={{border:0,background:'none',outline:'none',width:'100%',resize:'none',fontFamily:'inherit',
fontSize:13.5,lineHeight:1.55,color:'var(--ink)',padding:'5px 6px 7px',maxHeight:150,display:'block'}}/>
<div className="row" style={{gap:6}}>
<button onClick={()=>setMenu(menu==='tools'?null:'tools')} className="cb" title="Attach and tools"><Ic.plus size={15}/></button>
<button onClick={()=>setMenu(menu==='focus'?null:'focus')} className="cb row" style={{width:'auto',gap:6,padding:'0 10px',fontSize:12,fontWeight:500,
color:focus!=='none'?'var(--violet)':'',background:focus!=='none'?'var(--violet-tint)':''}}>
{React.createElement(Ic[F.ic],{size:13})}{F.n==='No focus'?'Focus':F.n}</button>
<div className="grow"/>
<button onClick={()=>setMenu(menu==='model'?null:'model')} className="cb row" style={{width:'auto',gap:6,padding:'0 10px',fontSize:12,fontWeight:500}} title="Model">
{M.n}<Ic.chev size={11} style={{transform:'rotate(-90deg)',opacity:.6}}/></button>
<button onClick={()=>setRec(!rec)} className="cb" title="Dictate" style={{color:rec?'var(--bad)':''}}><Ic.pulse size={15}/></button>
<button onClick={go} className="cb" title="Send" style={{background:v.trim()||att.length?'var(--ink)':'var(--surface-sunk)',
color:v.trim()||att.length?'var(--ink-inv)':'var(--ink-3)',border:0}}><Ic.send size={14}/></button></div></div>
<div className="row" style={{gap:6,marginTop:7,justifyContent:'center'}}>
<span className="sub" style={{fontSize:10.8}}>{M.n} · she can be wrong. Check anything that matters.</span></div>
<style>{'.cb{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:var(--ink-2);border:1px solid var(--line);background:var(--surface);transition:.15s}.cb:hover{background:var(--surface-sunk)}.bub-b{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:var(--ink-3);transition:.15s}.bub-b:hover{background:var(--surface-sunk);color:var(--ink)}.bub-tools{opacity:0;transition:opacity .15s}.bub-me:hover .bub-tools,.bub-ai:hover .bub-tools{opacity:1}@media(prefers-reduced-motion:reduce){.cb,.bub-b,.bub-tools{transition:none}}'}</style></div>};

const Thinking=()=>(<div className="row" style={{gap:11}}><div className="tile" style={{width:28,height:28,borderRadius:'50%',background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.spark size={15}/></div>
<div className="row" style={{gap:5,padding:'12px 15px'}}>{[0,1,2].map(i=><span key={i} style={{width:6,height:6,borderRadius:'50%',background:'var(--ink-3)',animation:`bl 1s ${i*.15}s infinite`}}/>)}</div>
<style>{'@keyframes bl{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}@media(prefers-reduced-motion:reduce){span{animation:none!important}}'}</style></div>);

const ThreadRow=({t,on,onClick,onMenu}) =>(<div className="row th-row" style={{gap:8,borderRadius:9,background:on?'var(--surface-sunk)':'transparent'}}>
<button onClick={onClick} className="row grow" style={{textAlign:'left',gap:9,padding:'8px 4px 8px 10px',minWidth:0}}>
<span className="grow" style={{minWidth:0}}>
<span className="row" style={{gap:6}}>{t.pin&&<Ic.shield size={11} style={{color:'var(--gold)',flex:'none'}}/>}
<span className="trunc" style={{fontSize:12.9,fontWeight:on?600:450}}>{t.n}</span></span>
<span className="sub trunc" style={{display:'block',fontSize:11.2,marginTop:1}}>{t.pre}</span></span></button>
<button onClick={onMenu} className="th-menu" style={{width:24,height:24,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--ink-3)',marginRight:5,flex:'none'}}><Ic.dots size={13}/></button></div>);

const ChatSidebar=({cur,setCur,onNew,threads,q,setQ,proj,setProj}) =>{
const groups=['Today','Yesterday','Previous 7 days','Previous 30 days'];
const list=threads.filter(t=>(!proj||t.proj===proj)&&(t.n+' '+t.pre).toLowerCase().includes(q.toLowerCase()));
return <div style={{display:'flex',flexDirection:'column',minHeight:0,height:'100%',borderRight:'1px solid var(--line)',background:'var(--surface)'}}>
<div style={{padding:'12px 12px 10px',borderBottom:'1px solid var(--line-soft)',display:'grid',gap:9}}>
<button onClick={onNew} className="btn btn-p" style={{width:'100%',justifyContent:'center'}}><Ic.plus size={15}/>New chat</button>
<div className="row card" style={{padding:'0 11px',height:32,gap:8,borderRadius:9,boxShadow:'none',color:'var(--ink-3)'}}><Ic.search size={14}/>
<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search chats" style={{border:0,background:'none',outline:'none',color:'var(--ink)',flex:1,minWidth:0,fontFamily:'inherit',fontSize:12.6}}/></div></div>
<div className="pane" style={{flex:1,padding:'10px 8px 14px'}}>
<div className="row" style={{justifyContent:'space-between',padding:'0 6px 7px'}}>
<span className="eyebrow" style={{fontSize:9.5}}>Projects</span>
<button style={{color:'var(--ink-3)',display:'flex'}} title="New project"><Ic.plus size={13}/></button></div>
{CHAT_PROJECTS.map(p=>{const on=proj===p.id;
return <button key={p.id} onClick={()=>setProj(on?null:p.id)} className="row" style={{width:'100%',textAlign:'left',gap:9,padding:'7px 10px',borderRadius:9,marginBottom:2,
background:on?'var(--surface-sunk)':'transparent'}}>
<span style={{width:7,height:7,borderRadius:2,background:p.color,flex:'none'}}/>
<span className="grow trunc" style={{fontSize:12.7,fontWeight:on?600:450}}>{p.n}</span>
<span className="mono sub" style={{fontSize:10.5}}>{p.n2}</span></button>})}
{/* §13 Preview — project grouping has no backend yet; honest empty, never fabricated. */}
{!CHAT_PROJECTS.length&&<div className="sub" style={{fontSize:11,padding:'2px 6px 4px'}}>Preview — grouping chats into projects is coming soon.</div>}
{groups.map(g=>{const rows=list.filter(t=>t.grp===g);if(!rows.length)return null;
return <div key={g} style={{marginTop:14}}>
<div className="eyebrow" style={{fontSize:9.5,padding:'0 6px 6px'}}>{g}</div>
{rows.map(t=><ThreadRow key={t.id} t={t} on={cur===t.id} onClick={()=>setCur(t.id)} onMenu={e=>e.stopPropagation()}/>)}</div>})}
{!list.length&&<div style={{padding:'30px 12px',textAlign:'center'}}><div className="sub">No chats match.</div></div>}</div>
<style>{'.th-row{transition:background .15s}.th-row:hover{background:var(--surface-2)}.th-menu{opacity:0;transition:.15s}.th-row:hover .th-menu{opacity:1}'}</style></div>};

export const Agent=()=>{
// REAL seam: threads, turn history, and streaming send — scoped to the session
// (§9/§51, no client tenant_id). Replaces the fixture CHAT_THREADS + fake useChat.
const chat=useSoloChat();
const{threads,msgs,think,cur,setCur,send,newChat,curThread}=chat;
const[q,setQ]=React.useState('');
const[proj,setProj]=React.useState(null);
const[model,setModel]=React.useState('paige-2');
const[railOpen,setRailOpen]=React.useState(true);
const prop=useSoloProposals();
const[railBusy,setRailBusy]=React.useState(null);
const T=curThread;
// Preview — no per-chat focus backend; the picker is cosmetic UI state (§13).
const[focus,setFocus]=React.useState('none');
const scroll=React.useRef(null);
React.useEffect(()=>{if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight},[msgs,think]);
const F=CHAT_FOCUS.find(f=>f.id===focus)||CHAT_FOCUS[0];
const empty=!msgs.length&&!think;
return <div className="fade-in chat-shell" style={{height:'100%',minHeight:0}}>
<div className="chat-side"><ChatSidebar cur={cur} setCur={setCur} onNew={newChat} threads={threads} q={q} setQ={setQ} proj={proj} setProj={setProj}/></div>

<div style={{display:'flex',flexDirection:'column',minHeight:0,minWidth:0,background:'var(--canvas)'}}>
<div className="row" style={{padding:'10px 18px',borderBottom:'1px solid var(--line)',background:'var(--surface)',gap:10,flex:'none'}}>
<div className="grow" style={{minWidth:0}}><div className="row" style={{gap:8}}>
<span className="trunc" style={{fontWeight:600,fontSize:13.6}}>{T.n}</span>
{focus!=='none'&&<span className="pill pill-v">{React.createElement(Ic[F.ic],{size:11})}{F.n}</span>}
{T.proj&&<span className="pill pill-n">{CHAT_PROJECTS.find(p=>p.id===T.proj)?.n}</span>}</div>
<div className="sub trunc">Say it plainly — she routes to the right department herself.</div></div>
<span className="pill pill-ok cc-hide"><span className="dot"/>Draft & wait</span>
<button className="btn btn-s" title="Share"><Ic.send size={13}/></button>
<button className="btn btn-s" onClick={()=>setRailOpen(!railOpen)} title="Context"><Ic.doc size={13}/></button>
<button className="btn btn-s" style={{width:30,padding:0,justifyContent:'center'}}><Ic.dots size={14}/></button></div>

{empty?<div className="pane" style={{flex:1,display:'grid',placeItems:'center',padding:'20px'}}>
<div style={{maxWidth:560,textAlign:'center'}}>
<div className="tile" style={{margin:'0 auto 14px',width:46,height:46,borderRadius:16,background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.spark size={22}/></div>
<h2 style={{fontSize:19,letterSpacing:'-.03em'}}>What are we working on?</h2>
<p style={{color:'var(--ink-2)',fontSize:13.4,marginTop:6,lineHeight:1.6}}>Say it plainly. She routes to the right department herself — or set a focus below if you want to pin it.</p>
<div className="row" style={{gap:8,justifyContent:'center',flexWrap:'wrap',marginTop:16}}>
{['What needs me first today?','Draft the Selby reset','Model a 30% price increase','Why did the pixel drop?'].map(s=>
<button key={s} onClick={()=>send(s)} className="btn btn-s">{s}</button>)}</div></div></div>
:<div ref={scroll} className="pane" style={{flex:1,padding:'20px 20px 8px',display:'flex',flexDirection:'column',gap:16}}>
{msgs.map((m,i)=><Bubble key={i} m={m}/>)}{think&&<Thinking/>}</div>}

<Composer onSend={send} model={model} setModel={setModel} focus={focus} setFocus={setFocus}
chips={empty?null:["Show me the Selby reset draft","What's at risk this week?","Model a 30% price increase"]}/></div>

{railOpen&&<div className="chat-rail pane" style={{padding:'16px 14px',background:'var(--surface)',borderLeft:'1px solid var(--line)'}}>
<div className="eyebrow">In this chat</div>
<div style={{display:'grid',gap:9,marginTop:10}}>
<div className="row" style={{padding:'9px 11px',border:'1px solid var(--line)',borderRadius:10,gap:9}}>
<span className="tile" style={{width:22,height:22,borderRadius:7,background:'var(--violet-tint)',color:'var(--violet)'}}>{React.createElement(Ic[F.ic],{size:12})}</span>
<span className="grow" style={{fontSize:12.5,fontWeight:500}}>{F.n==='No focus'?'Routing herself':F.n}</span></div>
<div className="row" style={{padding:'9px 11px',border:'1px solid var(--line)',borderRadius:10,gap:9}}>
<span className="dot" style={{color:'var(--ok)'}}/><span className="grow" style={{fontSize:12.5,fontWeight:500}}>{(CHAT_MODELS.find(m=>m.id===model)||{}).n}</span></div></div>
<div className="eyebrow" style={{marginTop:20}}>Working from</div>
{/* §13 Preview — live connected-systems status has no backend hook yet; we keep the
    section but never fabricate synced timestamps or a false connection. */}
<div style={{display:'grid',gap:8,marginTop:10}}>
<div className="row" style={{padding:'9px 11px',border:'1px solid var(--line)',borderRadius:10,gap:9}}>
<span className="dot" style={{color:'var(--ink-3)'}}/><span className="grow sub" style={{fontSize:11.6}}>Preview — connected-systems status is coming soon.</span></div></div>
<div className="eyebrow" style={{marginTop:20}}>She proposed today</div>
<div style={{display:'grid',gap:9,marginTop:10}}>
{prop.loading?[0,1,2].map(i=><div key={i} style={{padding:'11px 12px',border:'1px solid var(--line)',borderRadius:11}}>
<div style={{height:10,width:'80%',background:'var(--surface-sunk)',borderRadius:4}}/>
<div style={{height:20,width:62,background:'var(--surface-sunk)',borderRadius:6,marginTop:9}}/></div>)
:prop.proposals.length?prop.proposals.slice(0,3).map(a=>
<div key={a.id} style={{padding:'11px 12px',border:'1px solid var(--line)',borderRadius:11}}>
<div style={{fontSize:12.6,fontWeight:600,lineHeight:1.35}}>{a.title}</div>
<div className="row" style={{marginTop:7,gap:6}}><button className="btn btn-s btn-p" disabled={railBusy===a.id} onClick={()=>{setRailBusy(a.id);prop.approve(a.id).finally(()=>setRailBusy(null))}} style={{height:24,fontSize:11.5}}>{railBusy===a.id?'Working…':'Approve'}</button></div></div>)
:<div className="sub" style={{fontSize:11.6,padding:'2px 2px 4px'}}>Nothing waiting on you right now.</div>}</div></div>}
<style>{'.chat-shell{display:grid;grid-template-columns:250px minmax(0,1fr) 268px;grid-template-rows:minmax(0,1fr);height:100%;min-height:0}.chat-shell>*{min-height:0;min-width:0;overflow:hidden}@media(max-width:1240px){.chat-shell{grid-template-columns:236px minmax(0,1fr)}.chat-rail{display:none}}@media(max-width:900px){.chat-shell{grid-template-columns:minmax(0,1fr)}.chat-side{display:none}}'}</style></div>};

export const PaigePanel=({open,onClose})=>{const{msgs,think,send}=useSoloChat({autoResume:open});const[model,setModel]=React.useState('paige-2');const[focus,setFocus]=React.useState('none');
return <><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(23,19,49,.34)',opacity:open?1:0,pointerEvents:open?'auto':'none',transition:'.25s',zIndex:70,backdropFilter:'blur(2px)'}}/>
<aside style={{position:'fixed',top:0,right:0,bottom:0,width:'min(440px,94vw)',background:'var(--surface)',borderLeft:'1px solid var(--line)',boxShadow:'var(--sh-3)',zIndex:71,
transform:open?'none':'translateX(102%)',transition:'transform .3s cubic-bezier(.32,.72,0,1)',display:'flex',flexDirection:'column'}}>
<div className="row" style={{padding:'14px 18px',borderBottom:'1px solid var(--line)',gap:11}}>
<div className="tile" style={{borderRadius:'50%',background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.spark size={17}/></div>
<div className="grow"><div style={{fontWeight:600,fontSize:14}}>Paige</div><div className="sub">Your AI COO · always in context</div></div>
<button className="btn btn-s" onClick={onClose} style={{width:28,padding:0,justifyContent:'center'}}><Ic.x size={14}/></button></div>
<div className="pane" style={{flex:1,padding:'18px',display:'flex',flexDirection:'column',gap:14}}>{msgs.map((m,i)=><Bubble key={i} m={m}/>)}{think&&<Thinking/>}</div>
<Composer compact onSend={send} model={model} setModel={setModel} focus={focus} setFocus={setFocus} chips={["What needs me first?","Chase the failed charges"]}/></aside></>};
