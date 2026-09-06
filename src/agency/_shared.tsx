// @ts-nocheck
// Agency pack — shared primitives. Faithful port of src/solo/_shared.tsx (the
// Solo pack), mirroring commit 2506608d exactly, PLUS the overlay/segment chrome
// the Agency design authors that Solo lacks (Modal, Popover, ScopeSeg) and the
// design's own helpers (AV, LBL, tone map). Every primitive is token-driven, so
// it themes under `.paige-agency` the same way it does under `.paige-solo`.
//
// Source of truth for the new chrome: "Agency Shell.dc.html" — center modals use
// scrim `rgba(38,32,18,.42)` + card `border-radius:16px` / `box-shadow:0 40px 90px`
// with a `cardIn` enter; the account popover uses an outside-click scrim + a
// `top:42px;right:0` anchored card; the scope segment uses `padding:7px 13px;
// radius:9px;font:12/600`, ink-fill active / surface inactive / sunk disabled.
// The DC runtime (support.js) is NOT ported — only its measurements are mirrored.
import React from "react";
import { createPortal } from "react-dom";

const I=(p,vb)=>({size=18,style,...r})=>React.createElement('svg',{width:size,height:size,viewBox:vb||'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round',style,...r},p);
export const Ic={
// ---- ported verbatim from Solo's Ic set ----
grid:I(<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>),
spark:I(<><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></>),
users:I(<><path d="M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19"/><circle cx="10" cy="7.5" r="3.2"/><path d="M17 11.2a3 3 0 100-6M20 19v-1.2a3.2 3.2 0 00-2.2-3"/></>),
store:I(<><path d="M4 9.5V19a1 1 0 001 1h14a1 1 0 001-1V9.5"/><path d="M3 9.5l1.6-4A1 1 0 015.5 5h13a1 1 0 01.9.5L21 9.5z"/><path d="M9 20v-5h6v5"/></>),
trend:I(<><path d="M4 16.5l4.5-5 3.5 3 6-7.5"/><path d="M14.5 7h4v4"/></>),
chart:I(<><path d="M4 20V6M9 20v-7M14 20V9M19 20v-4"/></>),
gear:I(<><circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M4.9 7.5l1.9 1.1M17.2 15.4l1.9 1.1M4.9 16.5l1.9-1.1M17.2 8.6l1.9-1.1"/></>),
vault:I(<><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="11" cy="12" r="3.2"/><path d="M11 8.8v1M11 15.2v1M17 10v4"/></>),
pulse:I(<><path d="M3 12h3.5l2-4.5 3 9 2.5-6 1.6 3H21"/></>),
check:I(<><path d="M5 12.5l4.2 4L19 7.5"/></>),
x:I(<><path d="M6 6l12 12M18 6L6 18"/></>),
arrow:I(<><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/></>),
bell:I(<><path d="M18 15.5V11a6 6 0 10-12 0v4.5L4.5 18h15z"/><path d="M10 21h4"/></>),
moon:I(<><path d="M20 14.5A8.2 8.2 0 019.5 4 8.5 8.5 0 1020 14.5z"/></>),
sun:I(<><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/></>),
search:I(<><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></>),
mail:I(<><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M4 7.5l7.3 5.2a1.2 1.2 0 001.4 0L20 7.5"/></>),
chev:I(<><path d="M9 6l6 6-6 6"/></>),
dots:I(<><circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/></>),
send:I(<><path d="M4.5 12l15-7-7 15-1.8-6.2z"/></>),
doc:I(<><path d="M14 3.5H7A1.5 1.5 0 005.5 5v14A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5V8z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/></>),
clock:I(<><circle cx="12" cy="12" r="8"/><path d="M12 8v4.3l3 1.8"/></>),
shield:I(<><path d="M12 3.5l7 2.5v5.5c0 4.3-3 7.4-7 9-4-1.6-7-4.7-7-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/></>),
bolt:I(<><path d="M13.5 3L6 13.5h4.5L10 21l7.5-10.5H13z"/></>),
filter:I(<><path d="M4 6.5h16M7 12h10M10 17.5h4"/></>),
cal:I(<><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/><circle cx="8.5" cy="14" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r="1.1" fill="currentColor" stroke="none"/></>),
plus:I(<><path d="M12 5.5v13M5.5 12h13"/></>),
// ---- added for the Agency pack (nav/surfaces Solo has no icon for) ----
// Billing (◈), Client Support (◫), agency identity + sub-account book + act-as.
card:I(<><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 9.5h18M6.5 14.5h4"/></>),
support:I(<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M6.3 6.3l3.4 3.4M14.3 14.3l3.4 3.4M17.7 6.3l-3.4 3.4M9.7 14.3l-3.4 3.4"/></>),
building:I(<><path d="M4 20.5V5.5a1 1 0 011-1h7a1 1 0 011 1v15"/><path d="M13 20.5V10a1 1 0 011-1h4.5a1 1 0 011 1v9.5"/><path d="M3 20.5h18M7 8h2M7 11.5h2M7 15h2M16 12.5h1M16 16h1"/></>),
layers:I(<><path d="M12 3.5l8 4.2-8 4.2-8-4.2z"/><path d="M4 12l8 4.2 8-4.2M4 16l8 4.2 8-4.2"/></>),
swap:I(<><path d="M4 7.5h13M13.5 4l3.5 3.5-3.5 3.5"/><path d="M20 16.5H7M10.5 20L7 16.5l3.5-3.5"/></>),
};

export const Logo=({size=26})=>(<svg width={size} height={size} viewBox="0 0 48 48" fill="none"><polygon points="21,13.6 30.5,13.6 21,34.4 11.5,34.4" fill="var(--gold-bright)" stroke="var(--gold-bright)" strokeWidth="3.2" strokeLinejoin="round"/><circle cx="34.5" cy="30.5" r="5.5" fill="var(--gold-bright)"/></svg>);
export const Avatar=({name,size=28,tone})=>{const init=name.split(' ').map(w=>w[0]).slice(0,2).join('');const tones=['var(--violet)','var(--gold)','#2E7D8F','#8A5A9E','#3F7A4B'];const c=tone||tones[name.charCodeAt(0)%5];
return <div style={{width:size,height:size,borderRadius:'50%',background:c,color:'#fff',display:'grid',placeItems:'center',fontSize:size*.36,fontWeight:600,flex:'none',letterSpacing:'.02em'}}>{init}</div>};

// ---------------------------------------------------------------------------
// Design helpers (ported from Agency Shell.dc.html)
// ---------------------------------------------------------------------------

// AV(hex) — WCAG-aware avatar/plate contrast pick. Given a brand hex it returns a
// { plate, ink, ring } where `plate` is nudged until it clears 4.6:1 against the
// chosen `ink` (dark or white, whichever the base favors). Verbatim port of the
// design's AV() (Agency Shell.dc.html) — the sub-account brand chips depend on it.
export const AV=(hex)=>{
const h=(hex||"#7C6CE0").replace("#","");
const parse=s=>[0,2,4].map(i=>parseInt(s.slice(i,i+2),16));
const hexOf=a=>"#"+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
const lum=a=>{const c=a.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]};
const ratio=(a,b)=>(Math.max(lum(a),lum(b))+0.05)/(Math.min(lum(a),lum(b))+0.05);
const INK=[36,28,5],WHITE=[255,255,255];
let plate=parse(h);
const useInk=ratio(plate,INK)>=ratio(plate,WHITE);
const ink=useInk?INK:WHITE;
const toward=useInk?WHITE:[10,8,14];
for(let i=0;i<14&&ratio(plate,ink)<4.6;i++)plate=plate.map((v,k)=>v+(toward[k]-v)*0.12);
return{plate:hexOf(plate),ink:hexOf(ink),ring:"#"+h};
};

// LBL — the agency terminology map. The whole Agency design speaks in "sub-account"
// / "book" wording; this is the single home for those labels (ported verbatim from
// Agency Shell.dc.html `const LBL`). Screens read LBL.tenant / LBL.tenants / etc.
// so the vocabulary stays consistent and swappable in one place (§12/§18).
export const LBL={tenants:"Sub-accounts",tenant:"sub-account",Tenant:"Sub-account",owner:"your book"};

// TONE — the design's shared status palette, re-expressed as tokens (the design
// hardcodes hex; we keep it token-driven so it themes light↔dark). `utilColor` /
// `loadColor` are the design's state→color maps (its "flex" of a health value to a
// tone), ported to return CSS vars: green = healthy, amber = tight, red = over.
export const TONE={gold:'var(--gold)',green:'var(--ok)',amber:'var(--warn)',red:'var(--bad)',blue:'var(--violet)',ink:'var(--ink-3)'};
export const utilColor=(pct)=>pct>95?TONE.red:pct>=80?TONE.amber:TONE.green;
export const loadColor=(label)=>label==='Upside down'?TONE.red:label==='Heavy'?TONE.amber:label==='Balanced'?TONE.blue:TONE.green;

// useReducedMotion — one home for the OS motion preference. Every enter/exit
// animation in the pack guards on this (§11/§22 motion-safe), so a reduced-motion
// visitor gets an instant cut instead of a transition.
export const useReducedMotion=()=>{const[r,setR]=React.useState(false);
React.useEffect(()=>{if(typeof window==='undefined'||!window.matchMedia)return;const m=window.matchMedia('(prefers-reduced-motion: reduce)');const f=()=>setR(!!m.matches);f();
m.addEventListener?m.addEventListener('change',f):m.addListener(f);
return()=>{m.removeEventListener?m.removeEventListener('change',f):m.removeListener(f)}},[]);return r};

// ---------------------------------------------------------------------------
// Ported Solo primitives (token-driven — unchanged markup)
// ---------------------------------------------------------------------------

export const Foldout=({open,onClose,title,sub,wide,children})=>{
React.useEffect(()=>{if(!open)return;const k=e=>e.key==='Escape'&&onClose();window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open,onClose]);
if(!open)return null;
return <><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(23,19,49,.42)',backdropFilter:'blur(4px)',zIndex:88}}/>
<div className="fade-in card" style={{position:'fixed',inset:0,margin:'auto',
width:wide?'min(1080px,94vw)':'min(720px,94vw)',height:'max-content',maxHeight:'88vh',display:'flex',flexDirection:'column',zIndex:89,borderRadius:'var(--r-xl)',boxShadow:'var(--sh-3)',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div style={{minWidth:0}}><h3>{title}</h3>{sub&&<div className="sub">{sub}</div>}</div>
<button className="btn btn-s" onClick={onClose} style={{width:28,height:28,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.x size={13}/></button></div>
<div className="pane" style={{flex:1}}>{children}</div></div></>};

export const ExpandBtn=({onClick,label='Expand'})=>(<button onClick={e=>{e.stopPropagation();onClick()}} title={label} className="row"
style={{gap:6,height:26,padding:'0 10px',borderRadius:99,border:'1px solid var(--line)',fontSize:11.6,fontWeight:500,color:'var(--ink-2)'}}>
<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<path d="M9 4H4v5M15 20h5v-5M20 9V4h-5M4 15v5h5"/></svg>{label}</button>);

export const PeekCard=({title,sub,right,peek,children,wide,foldTitle})=>{const[open,setOpen]=React.useState(false);
return <><div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
<div className="hd" style={{flex:'none',padding:'10px 14px'}}><div style={{minWidth:0}}><h3 style={{fontSize:13.4}}>{title}</h3>{sub&&<div className="sub trunc">{sub}</div>}</div>
<div className="row" style={{gap:8,flex:'none'}}>{right}<ExpandBtn onClick={()=>setOpen(true)}/></div></div>
<div className="pane" style={{flex:1}}>{peek||children}</div></div>
<Foldout open={open} onClose={()=>setOpen(false)} title={foldTitle||title} sub={sub} wide={wide}>{children}</Foldout></>};

export const Collapse=({title,sub,icon,badge,children,defaultOpen})=>{const[o,setO]=React.useState(!!defaultOpen);
return <div className="card" style={{overflow:'hidden'}}>
<button onClick={()=>setO(!o)} className="row" style={{width:'100%',textAlign:'left',gap:12,padding:'12px 18px'}}>
{icon&&<span className="tile" style={{width:30,height:30,borderRadius:10,background:'var(--violet-tint)',color:'var(--violet)'}}>{icon}</span>}
<span className="grow" style={{minWidth:0}}><span style={{fontWeight:600,fontSize:13.4,display:'block'}}>{title}</span>
{sub&&<span className="sub trunc" style={{display:'block'}}>{sub}</span>}</span>
{badge}<span style={{display:'flex',color:'var(--ink-3)',transform:o?'rotate(90deg)':'',transition:'.2s'}}><Ic.chev size={15}/></span></button>
{o&&<div className="fade-in" style={{borderTop:'1px solid var(--line-soft)'}}>{children}</div>}</div>};

export const PageHead=({eyebrow,title,sub,right})=>(<div className="pg-hd row" style={{alignItems:'center',gap:16,flexWrap:'wrap'}}>
<div className="grow" style={{minWidth:220}}>
<div className="row" style={{gap:10,alignItems:'baseline',flexWrap:'wrap'}}>
{eyebrow&&<span className="eyebrow" style={{fontSize:10}}>{eyebrow}</span>}
<h1 style={{fontSize:20,letterSpacing:'-.03em'}}>{title}</h1></div>
{sub&&<p className="pg-sub" style={{color:'var(--ink-2)',fontSize:12.8,marginTop:3,maxWidth:760}}>{sub}</p>}</div>{right}</div>);
export const Wrap=({children,max=1440})=>{const ar=React.Children.toArray(children);
const hd=ar.length&&ar[0]&&ar[0].type===PageHead?ar[0]:null;
return <div className="fade-in pg" style={{width:'100%',maxWidth:max,margin:'0 auto'}}>{hd}
<div className="pg-body">{hd?ar.slice(1):ar}</div></div>};

export const SubTabs=({tabs,cur,set,under,right})=>(<div className="row" style={{gap:0,borderBottom:under?'0':'1px solid var(--line)',background:under?'transparent':'var(--surface)',padding:under?'0':'0 22px',flex:'none',minWidth:0}}>
<div className="row tabstrip" style={{gap:under?4:20,minWidth:0,flex:'1 1 auto'}}>
{tabs.map(t=>{const on=cur===t[0];
return <button key={t[0]} onClick={()=>set(t[0])} className="row" style={{gap:7,padding:under?'6px 12px':'12px 0 11px',borderRadius:under?9:0,fontSize:13.2,fontWeight:on?600:450,
color:on?'var(--ink)':'var(--ink-3)',background:under&&on?'var(--surface-sunk)':'transparent',borderBottom:!under&&on?'2px solid var(--gold)':'2px solid transparent',marginBottom:under?0:-1}}>
{t[2]&&<span style={{display:'flex',color:on?'var(--gold)':'inherit'}}>{t[2]()}</span>}{t[1]}
{t[3]&&<span className="pill pill-warn" style={{height:18,padding:'0 6px'}}>{t[3]}</span>}</button>})}</div>
{right&&<div className="row" style={{gap:8,flex:'none',paddingLeft:14}}>{right}</div>}</div>);

// Shared primitives consumed pack-wide via `from "./_shared"`. Ported verbatim
// from Solo — token-driven, so they theme under `.paige-agency` unchanged.
export const Meter=({pct,tone,h=6})=>(<div style={{height:h,borderRadius:h/2,background:'var(--surface-sunk)',overflow:'hidden'}}>
<div style={{width:Math.min(pct,100)+'%',height:'100%',background:tone,borderRadius:h/2,transition:'width .5s var(--ease,ease)'}}/></div>);

export const SlideOut=({open,onClose,title,sub,icon,tone,children,foot,wide})=>{
React.useEffect(()=>{if(!open)return;const k=e=>e.key==='Escape'&&onClose();window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open,onClose]);
if(!open)return null;
return <><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(23,19,49,.36)',backdropFilter:'blur(3px)',zIndex:80}}/>
<aside className="fade-in" style={{position:'fixed',top:0,right:0,bottom:0,width:wide?'min(640px,96vw)':'min(520px,96vw)',
background:'var(--surface)',borderLeft:'1px solid var(--line)',boxShadow:'var(--sh-3)',zIndex:81,display:'flex',flexDirection:'column'}}>
<div className="row" style={{padding:'15px 20px',borderBottom:'1px solid var(--line)',gap:12,flex:'none'}}>
{icon&&<span className="tile" style={{width:32,height:32,borderRadius:10,background:tone||'var(--violet-tint)',color:tone?'var(--ink)':'var(--violet)',flex:'none'}}>{icon}</span>}
<div className="grow" style={{minWidth:0}}><div className="trunc" style={{fontWeight:600,fontSize:14.5}}>{title}</div>{sub&&<div className="sub trunc">{sub}</div>}</div>
<button className="btn btn-s" onClick={onClose} style={{width:30,height:30,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.x size={14}/></button></div>
<div className="pane" style={{flex:1,padding:'18px 20px 24px'}}>{children}</div>
{foot&&<div className="row" style={{padding:'12px 20px',borderTop:'1px solid var(--line)',gap:9,flex:'none',flexWrap:'wrap'}}>{foot}</div>}</aside></>};

// ---------------------------------------------------------------------------
// New Agency chrome
// ---------------------------------------------------------------------------

// Modal — center dialog. Portals to document.body (so it escapes any clipped/
// transformed ancestor), draws a scrim, traps focus, and dismisses on Escape or
// scrim-click. Enter/exit is a scale+fade, guarded by useReducedMotion (instant
// cut when the OS asks). Chrome mirrors the design's center modal: radius 16,
// `box-shadow:0 40px 90px`, hairline header with an accent bar. `size` sets the
// max width; `wide` is the design's ~1020px expand width.
export const Modal=({open,onClose,title,sub,icon,accent,children,foot,wide,size,pad='18px 22px'})=>{
const reduce=useReducedMotion();
const[shown,setShown]=React.useState(false);
const[closing,setClosing]=React.useState(false);
const cardRef=React.useRef(null);
const lastFocus=React.useRef(null);
React.useEffect(()=>{
if(!open){setShown(false);setClosing(false);return}
lastFocus.current=typeof document!=='undefined'?document.activeElement:null;
const id=requestAnimationFrame(()=>setShown(true));
const t=setTimeout(()=>{cardRef.current&&cardRef.current.focus&&cardRef.current.focus()},20);
return()=>{cancelAnimationFrame(id);clearTimeout(t);
if(lastFocus.current&&lastFocus.current.focus)try{lastFocus.current.focus()}catch{/* focus restore is best-effort */}}
},[open]);
const close=React.useCallback(()=>{
if(reduce){onClose();return}
setClosing(true);setTimeout(()=>onClose(),150)
},[onClose,reduce]);
React.useEffect(()=>{
if(!open)return;
const onKey=e=>{
if(e.key==='Escape'){e.stopPropagation();close();return}
if(e.key==='Tab'&&cardRef.current){
const f=cardRef.current.querySelectorAll('a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])');
if(!f.length)return;const first=f[0],last=f[f.length-1];
if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
}};
window.addEventListener('keydown',onKey,true);
return()=>window.removeEventListener('keydown',onKey,true)
},[open,close]);
if(!open||typeof document==='undefined')return null;
const vis=shown&&!closing;
const scrimStyle=reduce?{}:{opacity:vis?1:0,transition:'opacity .18s ease'};
const cardStyle=reduce?{}:{opacity:vis?1:0,transform:vis?'translateY(0) scale(1)':'translateY(8px) scale(.985)',transition:'opacity .18s ease, transform .22s cubic-bezier(.22,.8,.3,1)'};
return createPortal(
<div onMouseDown={e=>{if(e.target===e.currentTarget)close()}} style={{position:'fixed',inset:0,zIndex:120,display:'grid',placeItems:'center',padding:30,background:'rgba(23,19,49,.5)',backdropFilter:'blur(4px)',...scrimStyle}}>
<div ref={cardRef} role="dialog" aria-modal="true" aria-label={title||'Dialog'} tabIndex={-1} onMouseDown={e=>e.stopPropagation()}
style={{width:wide?'min(1020px,100%)':`min(${size||560}px,100%)`,maxHeight:'min(88vh,760px)',display:'flex',flexDirection:'column',
background:'var(--surface)',border:'1px solid var(--line)',borderRadius:'var(--r-l)',boxShadow:'var(--sh-3)',overflow:'hidden',outline:'none',...cardStyle}}>
{(title||icon)&&<div className="row" style={{padding:'14px 20px',borderBottom:'1px solid var(--line-soft)',gap:11,flex:'none'}}>
{accent&&<span style={{width:3,height:22,borderRadius:2,background:accent,flex:'none'}}/>}
{icon&&<span className="tile" style={{width:32,height:32,borderRadius:10,background:'var(--violet-tint)',color:'var(--violet)',flex:'none'}}>{icon}</span>}
<div className="grow" style={{minWidth:0}}><div className="trunc" style={{fontWeight:600,fontSize:15}}>{title}</div>{sub&&<div className="sub trunc">{sub}</div>}</div>
<button className="btn btn-s" onClick={close} style={{width:30,height:30,padding:0,justifyContent:'center',borderRadius:9,flex:'none'}}><Ic.x size={14}/></button></div>}
<div className="pane" style={{flex:1,padding:pad}}>{children}</div>
{foot&&<div className="row" style={{padding:'12px 20px',borderTop:'1px solid var(--line)',gap:9,flex:'none',flexWrap:'wrap'}}>{foot}</div>}</div>
</div>,document.body)};

// Popover — anchored dropdown. Renders inside a `position:relative` wrapper the
// caller provides; pass that wrapper's ref as `anchorRef` so a click on the
// trigger doesn't immediately re-close it (mirrors SoloApp's TopBar account
// menu: outside-mousedown + Escape close). `align` pins it to the left/right
// edge; `top` offsets it below the trigger. Reduced-motion drops the fade.
export const Popover=({open,onClose,anchorRef,align='right',width=240,top='calc(100% + 6px)',pad=6,children})=>{
const reduce=useReducedMotion();
const boxRef=React.useRef(null);
React.useEffect(()=>{
if(!open)return;
const onDoc=e=>{
const box=boxRef.current,anc=anchorRef&&anchorRef.current;
if(box&&box.contains(e.target))return;
if(anc&&anc.contains(e.target))return;
onClose()};
const onEsc=e=>{if(e.key==='Escape')onClose()};
window.addEventListener('mousedown',onDoc);
window.addEventListener('keydown',onEsc);
return()=>{window.removeEventListener('mousedown',onDoc);window.removeEventListener('keydown',onEsc)}
},[open,onClose,anchorRef]);
if(!open)return null;
return <div ref={boxRef} role="menu" className={reduce?'':'fade-in'}
style={{position:'absolute',top,[align]:0,zIndex:200,width,background:'var(--surface)',border:'1px solid var(--line)',borderRadius:12,boxShadow:'var(--sh-3)',padding:pad,overflow:'hidden'}}>
{children}</div>};

// ScopeSeg — the agency ↔ book ↔ per-sub-account scope toggle the design puts in
// section headers. `segs` is [{key,label,ok?,why?}]; a segment with `ok===false`
// renders disabled (sunk fill, not-allowed, `why` as its title). Active is the
// ink-fill pill, resting is a surface pill — the design's exact segment chrome
// (padding 7×13, radius 9, 12px/600), re-expressed in tokens.
export const ScopeSeg=({segs,value,onChange})=>(<div className="row" style={{gap:6,flex:'none'}}>
{segs.map(s=>{const on=value===s.key;const ok=s.ok!==false;
return <button key={s.key} title={!ok?(s.why||''):''} disabled={!ok} onClick={()=>ok&&onChange&&onChange(s.key)}
style={{padding:'7px 13px',borderRadius:9,fontSize:12,fontWeight:600,whiteSpace:'nowrap',
border:'1px solid '+(!ok?'var(--line-soft)':on?'var(--ink)':'var(--line)'),
background:!ok?'var(--surface-sunk)':on?'var(--ink)':'var(--surface)',
color:!ok?'var(--ink-3)':on?'var(--ink-inv)':'var(--ink-2)',
cursor:ok?'pointer':'not-allowed',transition:'.15s'}}>{s.label}</button>})}</div>);
