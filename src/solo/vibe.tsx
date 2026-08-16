// @ts-nocheck
import React from "react";
import { Ic, Logo } from "./_shared";
import { GR } from "./growth2";

const VS_NAV=[['recent','Recently viewed',()=><Ic.clock size={16}/>],['mine','My projects',()=><Ic.grid size={16}/>],['star','Starred',()=><Ic.spark size={16}/>],['tpl','Templates',()=><Ic.store size={16}/>],['lib','Saved library',()=><Ic.doc size={16}/>]];

export const VsStars=({n=260})=>{const stars=React.useMemo(()=>Array.from({length:n},(_,i)=>{const r=(s=>()=>((s=s*16807%2147483647)/2147483647))(i*7919+13);
return{x:r()*100,y:r()*100,s:r()*1.5+.3,o:r()*.7+.15,d:r()*6}}),[n]);
return <svg style={{position:'absolute',inset:0,width:'100%',height:'100%'}} preserveAspectRatio="none">
{stars.map((s,i)=><circle key={i} cx={s.x+'%'} cy={s.y+'%'} r={s.s} fill={i%9===0?'#F5C266':'#fff'} opacity={s.o}>
<animate attributeName="opacity" values={s.o+';'+(s.o*.25)+';'+s.o} dur={(4+s.d)+'s'} repeatCount="indefinite"/></circle>)}</svg>};

export const VibeStudio=({onBack})=>{
const[nav,setNav]=React.useState('recent');const[q,setQ]=React.useState('');const[building,setBuilding]=React.useState(null);
const chips=['Meridian Advisory website','Masterclass landing page','Discovery-call intake','New-client welcome'];
React.useEffect(()=>{const k=e=>{if(e.key==='Escape')onBack()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[onBack]);
const go=t=>{setQ(t);setBuilding({t,step:0});};
React.useEffect(()=>{if(!building||building.step>3)return;const id=setTimeout(()=>setBuilding(b=>({...b,step:b.step+1})),900);return()=>clearTimeout(id)},[building]);
const steps=['Reading your Brand Kit and voice','Drafting structure and copy','Assembling the page and its form','Wiring submissions into Conversations'];
const ink='#0A0818',panel='rgba(255,255,255,.06)',line='rgba(255,255,255,.12)',txt='#EDEAF7',dim='#A49FC0';
return <div style={{position:'fixed',inset:0,zIndex:80,display:'grid',gridTemplateColumns:'244px minmax(0,1fr)',background:ink,color:txt,overflow:'hidden'}}>
<div style={{borderRight:'1px solid '+line,padding:'14px 14px 16px',display:'flex',flexDirection:'column',gap:14}}>
<button onClick={onBack} className="row" style={{gap:8,color:dim,fontSize:12.5,padding:'2px 4px'}}>
<span style={{transform:'rotate(180deg)',display:'flex'}}><Ic.chev size={14}/></span>Back to Growth
<span className="mono" style={{marginLeft:'auto',fontSize:10.5,border:'1px solid '+line,borderRadius:5,padding:'1px 5px'}}>Esc</span></button>
<div className="row" style={{gap:9,padding:'0 4px'}}><Logo size={22}/><span style={{fontWeight:600,fontSize:14.5,letterSpacing:'-.02em'}}>Vibe Studio</span></div>
<button className="btn" style={{justifyContent:'center',background:'var(--gold-bright)',borderColor:'var(--gold-bright)',color:'#2A1C00',fontWeight:600,height:40,borderRadius:12}}><Ic.plus size={16}/>New project</button>
<div style={{display:'grid',gap:2}}>{VS_NAV.map(([k,l,Icn])=>{const on=nav===k;
return <button key={k} onClick={()=>setNav(k)} className="row" style={{gap:11,padding:'9px 11px',borderRadius:10,fontSize:13.2,color:on?txt:dim,background:on?panel:'transparent',fontWeight:on?600:450}}>
<span style={{display:'flex',color:on?'var(--gold-bright)':'inherit'}}>{Icn()}</span>{l}</button>})}</div>
<div style={{marginTop:'auto',display:'grid',gap:2,borderTop:'1px solid '+line,paddingTop:12}}>
{[['Light mode',()=><Ic.sun size={15}/>],['Reduce motion',()=><Ic.pulse size={15}/>]].map(([l,Icn],i)=>
<button key={i} className="row" style={{gap:11,padding:'8px 11px',borderRadius:10,fontSize:12.8,color:dim}}><span style={{display:'flex'}}>{Icn()}</span>{l}</button>)}</div></div>

<div style={{overflow:'auto',minWidth:0}}>
<div style={{position:'relative',minHeight:'min(560px,72vh)',display:'grid',placeItems:'center',padding:'56px 28px',
background:'radial-gradient(120% 90% at 50% 8%, #1B1740 0%, #0E0B23 45%, #070613 100%)',borderBottom:'1px solid '+line,overflow:'hidden'}}>
<VsStars/>
<div style={{position:'relative',width:'min(720px,100%)',textAlign:'center'}}>
<div style={{display:'grid',placeItems:'center',gap:10}}><Logo size={40}/>
<div style={{fontSize:11,letterSpacing:'.32em',color:dim,fontWeight:600}}>VIBE STUDIO</div></div>
<h1 style={{fontSize:'clamp(28px,4vw,46px)',letterSpacing:'-.04em',marginTop:16,color:'#fff'}}>What do you want to build?</h1>
<div style={{marginTop:22,background:'rgba(255,255,255,.07)',border:'1px solid '+line,borderRadius:18,padding:14,backdropFilter:'blur(6px)',textAlign:'left'}}>
<div className="row" style={{gap:8,flexWrap:'wrap',marginBottom:11}}>
<span className="mono" style={{fontSize:10.5,letterSpacing:'.18em',color:dim,paddingLeft:2}}>TRY</span>
{chips.map(c=><button key={c} onClick={()=>go(c)} style={{padding:'5px 11px',borderRadius:99,border:'1px solid rgba(255,255,255,.22)',fontSize:12.3,color:txt,background:'rgba(255,255,255,.05)'}}>{c}</button>)}</div>
<textarea value={q} onChange={e=>setQ(e.target.value)} placeholder="e.g. a registration page for my Q3 masterclass, with an intake form…"
style={{width:'100%',minHeight:78,resize:'none',border:0,outline:'none',background:'none',color:txt,fontFamily:'var(--font)',fontSize:14.5,lineHeight:1.55}}/>
<div className="row" style={{gap:10,borderTop:'1px solid '+line,paddingTop:11}}>
<button className="row" style={{gap:7,fontSize:12.8,color:dim}}><Ic.plus size={14}/>Attach</button>
<span className="sub" style={{color:dim,fontSize:11.8,marginLeft:6}}>Pages, funnels, forms, images, and internal tools — one session, no type picker.</span>
<button onClick={()=>q&&go(q)} style={{marginLeft:'auto',width:34,height:34,borderRadius:'50%',background:q?'var(--gold-bright)':'rgba(255,255,255,.14)',color:q?'#2A1C00':dim,display:'grid',placeItems:'center'}}>
<span style={{transform:'rotate(-90deg)',display:'flex'}}><Ic.arrow size={16}/></span></button></div></div>
{building&&<div className="fade-in" style={{marginTop:16,textAlign:'left',background:'rgba(255,255,255,.05)',border:'1px solid '+line,borderRadius:16,padding:'15px 17px'}}>
<div className="row" style={{gap:9,marginBottom:11}}><Ic.spark size={15} style={{color:'var(--gold-bright)'}}/>
<span style={{fontSize:13,fontWeight:600}}>Building “{building.t}”</span>
<span className="mono" style={{marginLeft:'auto',fontSize:11,color:dim}}>{Math.min(building.step,4)}/4</span></div>
<div style={{display:'grid',gap:8}}>{steps.map((s,i)=><div key={i} className="row" style={{gap:10,fontSize:12.8,color:i<building.step?txt:dim}}>
<span style={{width:16,height:16,borderRadius:'50%',display:'grid',placeItems:'center',border:'1px solid '+(i<building.step?'var(--gold-bright)':line),color:'var(--gold-bright)',flex:'none'}}>
{i<building.step?<Ic.check size={10}/>:null}</span>{s}</div>)}</div>
{building.step>3&&<div className="row" style={{gap:8,marginTop:13}}>
<button className="btn btn-s" style={{background:'var(--gold-bright)',borderColor:'var(--gold-bright)',color:'#2A1C00',fontWeight:600}}>Open preview</button>
<button className="btn btn-s" style={{background:'transparent',borderColor:line,color:txt}}>Keep iterating</button>
<button className="btn btn-s" style={{background:'transparent',borderColor:line,color:txt}}>Publish to Pages</button></div>}</div>}</div></div>

<div style={{padding:'26px 28px 44px'}}>
<div className="row" style={{alignItems:'baseline',gap:12,marginBottom:16}}>
<h2 style={{fontSize:20,letterSpacing:'-.03em',color:'#fff'}}>Your projects</h2><span style={{color:dim,fontSize:12.8}}>{GR.projects.length} projects</span>
<button className="row" style={{marginLeft:'auto',gap:7,fontSize:12.8,color:dim}}><Ic.filter size={14}/>Recently edited</button></div>
<div className="g3">{GR.projects.map((p,i)=><div key={i} style={{border:'1px solid '+line,borderRadius:'var(--r-l)',overflow:'hidden',background:'rgba(255,255,255,.03)'}}>
<div style={{height:104,position:'relative',background:'radial-gradient(110% 100% at 30% 0%, #221C4A 0%, #100D26 100%)',display:'grid',placeItems:'center',overflow:'hidden'}}>
<VsStars n={40}/>
<div style={{position:'relative',width:'58%',height:'56%',border:'1px solid rgba(255,255,255,.18)',borderRadius:7,padding:9,display:'grid',gap:5,alignContent:'start',background:'rgba(0,0,0,.25)'}}>
<div style={{height:5,width:'44%',background:'var(--gold-bright)',borderRadius:3}}/><div style={{height:4,width:'80%',background:'rgba(255,255,255,.3)',borderRadius:3}}/>
<div style={{height:4,width:'64%',background:'rgba(255,255,255,.2)',borderRadius:3}}/></div></div>
<div style={{padding:'13px 15px 15px'}}><div className="row" style={{justifyContent:'space-between',gap:10}}>
<span style={{fontWeight:600,fontSize:13.5}} className="trunc">{p.n}</span>
<span className="pill" style={{background:p.state==='Published'?'rgba(76,196,140,.14)':'rgba(255,255,255,.1)',color:p.state==='Published'?'#4CC48C':dim}}>{p.state}</span></div>
<div style={{color:dim,fontSize:12.3,marginTop:3}}>{p.type} · {p.edited}</div>
<div className="row" style={{gap:8,marginTop:12}}>
<button className="btn btn-s" style={{background:'rgba(255,255,255,.08)',borderColor:line,color:txt}}>Open</button>
<button className="btn btn-s" style={{background:'transparent',borderColor:line,color:dim}}>Duplicate</button>
<button className="btn btn-s" style={{marginLeft:'auto',background:'transparent',borderColor:'transparent',color:dim,width:28,padding:0,justifyContent:'center'}}><Ic.dots size={14}/></button></div></div></div>)}
<button style={{border:'1px dashed '+line,borderRadius:'var(--r-l)',background:'none',color:dim,minHeight:210,display:'grid',placeItems:'center',padding:20}}>
<span style={{textAlign:'center'}}><span className="row" style={{gap:7,justifyContent:'center',fontSize:13.5,fontWeight:600,color:txt}}><Ic.plus size={16}/>New project</span>
<span style={{display:'block',fontSize:12.3,marginTop:6,maxWidth:210,lineHeight:1.5}}>Publish one to the Marketplace when it is good enough to sell.</span></span></button></div></div></div></div>};
