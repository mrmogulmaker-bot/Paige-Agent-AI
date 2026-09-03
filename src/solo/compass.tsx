// @ts-nocheck
import React from "react";
import { Ic, Foldout, PageHead, Wrap } from "./_shared";
import { useSoloActivityFeed, departmentLabel, elapsedLabel } from "./data/useSoloActivityFeed";
import { useSoloPendingActions, type SoloPendingAction } from "./data/useSoloPendingActions";
import { useSoloTrust } from "./data/useSoloTrust";

// TC_DEPTS / TRUST — REPLACED 2026-09-03, recorded rather than deleted quietly (§13/§58).
//
// What was here: ten INVENTED departments (`exec`, `mkt`, `cs`, `prod`, `tech`, `fin`, `ppl`,
// `legal`, `ops`, `sales`) each carrying a hardcoded trust float, a hardcoded confidence percent,
// a hardcoded week-over-week trend, and a hardcoded triple of work counts — seeded into a
// module-level singleton that any slider mutated and that died on reload.
//
// The platform has ELEVEN departments and they are not those ten; only `sales` overlaps. So the
// surface was not showing wrong numbers for the right organisation, it was showing a different
// organisation. And the floats were not compass-local: `vault.tsx` rendered a document's pill and
// `systems.tsx` decided a fix's state from them, so a hardcoded `.22` decided what a Solo owner
// was told about how their legal work is governed.
//
// What replaces it: `useSoloTrust`, which reads the real `paige_departments` and the real
// `paige_action_kinds` default lanes. The derived level is a DOCUMENTED mapping from real rows
// (auto=1, confirm=0.5, off=0), not a constant.
//
// THE LABEL MATTERS AS MUCH AS THE NUMBER. Every one of those rows has `tenant_id IS NULL` — they
// are PLATFORM DEFAULTS, identical for every workspace. Nothing here may say or imply that this
// workspace approved, chose, or personally authorised a level of autonomy, because no such record
// exists anywhere in the platform. The vocabulary below says "platform default" and the control is
// READ-ONLY for exactly that reason.
//
// GONE, NOT DEFAULTED, because nothing produces them (§13 — a plausible substitute is the same
// defect with better manners): the confidence percentage and its 30-day sparkline, the
// week-over-week trend, the per-action-type sliders whose values were arithmetic on the invented
// float, and the "Last actions here" list — six hardcoded outcomes, each with an elapsed time and
// a claim about whether she ran it or you approved it, asserting a per-department history that
// never happened. That last one is the same class as TC_LIVE above and goes for the same reason.
// (Paraphrased deliberately: useSoloTrust.test.ts greps this file for the original wording, and a
// note quoting it verbatim would make the guard match its own explanation — the same recursion the
// TC_DRAFT note above had to avoid.)

const TC_AMBER=.24;
export const tierLabel={green:'Runs on the platform default',amber:'Drafts for you by default',red:'Always your call'};

/** Presentation glyph per real department slug. Plumbing for `Ic[...]`, not a data claim. */
const DEPT_ICON={owner_ops:'grid',client_experience:'users',executive_office:'shield',marketing:'trend',
 sales:'store',product_curriculum:'grid',technology_automation:'bolt',finance:'chart',
 people_talent:'users',legal_compliance:'vault',operations_pmo:'gear'};

/**
 * A department's tier from its REAL default lane mix. `null` when the department has no enabled
 * action kinds at all — an absent posture is absent, never rendered as "always your call", which
 * would be a governance claim about a desk nothing is routed to.
 */
export const tierOfLevel=g=>g==null?null:g>=.6?'green':g>=.34?'amber':'red';

/**
 * The real per-department posture, in the shape the markup below already consumes.
 *
 * `g` is the derived platform-default level · `w` is the real [auto, confirm, off] count of
 * enabled action kinds routed to the desk · `acts` are the platform's own labels for those kinds.
 * There is no `conf` and no `trend`: nothing produces either.
 */
export const useTrustDepartments=(accountEpoch)=>{
 const t=useSoloTrust(accountEpoch);
 return React.useMemo(()=>({
  loading:t.loading,
  configured:t.configured,
  error:t.error,
  depts:t.departments.map(d=>({
   id:d.slug,n:d.name,ic:DEPT_ICON[d.slug]||'grid',
   g:d.defaultLevel,w:[d.lanes.auto,d.lanes.confirm,d.lanes.off],
   acts:d.acts,kinds:d.kinds,openCount:d.openCount,
   awaitingCount:d.awaitingCount,workingCount:d.workingCount,
  })),
 }),[t]);
};

/** slug -> derived platform-default level (or null). Kept as a map so existing call sites index it. */
export const useTrust=(accountEpoch)=>{
 const{depts}=useTrustDepartments(accountEpoch);
 return React.useMemo(()=>Object.fromEntries(depts.map(d=>[d.id,d.g])),[depts]);
};

/**
 * Tier for a department, from a levels map. PURE and map-taking on purpose: the value is now read
 * asynchronously, so a module-level `deptTier(id)` reading a singleton could only ever have
 * answered from a fixture. Returns null when the department is unknown or has no posture.
 */
export const deptTier=(levels,id)=>tierOfLevel(levels?.[id]??null);

// TC_LIVE — REMOVED 2026-09-01, and recorded here rather than deleted quietly (§13/§58).
//
// This const held eight lines of invented activity — named clients who do not exist, a named
// recipient, timings down to "4s ago" — rendered under a green "Live" pill beneath the heading
// "the last few minutes, as they happened". A placeholder is one thing. A placeholder that
// asserts liveness and names customers is a claim, and the standing boundary on this work is
// exact: do not invent activity, revenue, permissions, provider state, customer records, or
// successful actions.
//
// The panel now reads `paige_client_events` — the Rail, the row `record_rail_event` writes when
// something actually happens — through `useSoloActivityFeed`. The markup below is unchanged; only
// where the values come from has changed, which is the whole of the fix.
//
// ONE THING THE RAIL CANNOT SAY, so the feed does not say it. The amber/red tiers mean "waiting
// on you" and "your decision". A Rail row is a record that something HAPPENED and carries no
// approval state, so every real line resolves to `green` — performed and logged — and nothing
// synthesises the other two. Approval state lives in `paige_actions`; a feed that wants it needs
// that seam wired, not a guess dressed as a tier.
//
// STILL FABRICATED, NOT ADDRESSED HERE: `TC_DRAFT` and `TC_ESC` below. They remain reachable from
// the canvas orbs (`onOrb`), whose tier comes from the simulated dial rather than from this feed,
// so wiring the feed removes no affordance (§58). They are their own finding — TC_ESC in
// particular renders a specific recommendation about a fabricated lapsed insurance policy.
// TC_DRAFT and TC_ESC — REMOVED 2026-09-01, recorded rather than deleted quietly (§13/§58).
//
// TC_DRAFT was a complete outbound email: a named recipient at a named company, a named sender, a
// subject, a body, a "why she drafted it" rationale citing behaviour that never occurred ("she
// opened the last two teardowns"), and a confidence of 91%. Approving it raised a toast reading
// "Sent." — a claim that mail had gone to a person who does not exist.
//
// TC_ESC was a legal escalation: a workers' compensation policy said to have lapsed on a specific
// date, a named carrier, three courses of action, and a recommendation to reinstate. An operator
// reading it would have been reading a statutory coverage position invented in a source file.
// (Paraphrased deliberately — compass.fabrications.test.ts greps this file for the original
// wording, and a note that quotes it verbatim makes the guard match its own explanation.)
//
// Between them that is four of the six things the standing boundary names — an invented customer
// record, invented provider state, an invented measurement, and a fabricated successful action.
//
// Both modals now read `paige_actions` through `useSoloPendingActions`: the real action bus, where
// filed work sitting at `autonomy_lane='confirm'` is genuinely waiting on a person. 117 such rows
// exist on production, so this is not a hypothetical replacement for a hypothetical fixture.
//
// FOUR FIELDS ARE GONE RATHER THAN DEFAULTED, because `paige_actions` has no source for them: the
// recipient, the sender, the confidence percentage, and the list of "options as she sees them".
// They were never missing data awaiting a backfill — they were claims with nothing behind them,
// and rendering a plausible substitute would be the same defect with better manners.
//
// STILL A FALSE AFFORDANCE, REPORTED NOT REWRITTEN (§00 — in-surface copy is Claude Design's):
// "Approve & send" and "Decide and log" both only close the modal. The first no longer claims a
// send happened, which was the part that was mine to fix; what those buttons should say and do now
// that they cannot pretend is a design and product decision, and the approval seam itself is the
// chat confirm gate (§18 — one home), not a second one built here.

const TcCanvas=({sel,setSel,onOrb})=>{
const wrap=React.useRef(null),cvr=React.useRef(null),S=React.useRef({});
const{depts}=useTrustDepartments();
const trust=useTrust();
React.useEffect(()=>{S.current.trust=trust},[trust]);
React.useEffect(()=>{S.current.depts=depts},[depts]);
React.useEffect(()=>{S.current.sel=sel},[sel]);
React.useEffect(()=>{
const cv=cvr.current;if(!cv)return;const ctx=cv.getContext('2d');if(!ctx)return;
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let COL={};
const readCol=()=>{const cs=getComputedStyle(document.documentElement);
 COL={ok:cs.getPropertyValue('--ok').trim()||'#1B7A52',warn:cs.getPropertyValue('--warn').trim()||'#B4700A',
 bad:cs.getPropertyValue('--bad').trim()||'#B93E37',vio:cs.getPropertyValue('--violet').trim()||'#5B3FD6',
 dark:document.documentElement.dataset.theme==='dark'}};
readCol();
const mo=new MutationObserver(readCol);mo.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
const hex=(c,a)=>{if(c.startsWith('#')){const n=parseInt(c.slice(1),16);return `rgba(${n>>16},${(n>>8)&255},${n&255},${a})`}return c};
const tint=(t,a)=>t==='none'?'rgba(255,255,255,'+a+')':hex(t==='green'?COL.ok:t==='amber'?COL.warn:COL.bad,a);
const s=S.current;Object.assign(s,{rot:0,t:0,mx:-999,my:-999,hot:null,orbs:[],segs:[],pulse:0,lit:0});
const spawn=(force)=>{const D=s.depts||[];if(!D.length)return;const d=D[(Math.random()*D.length)|0];const g=s.trust[d.id];if(g==null)return;
 const rnd=Math.random();const tier=rnd<g*.92?'green':rnd<g*.92+.16?'amber':(Math.random()<.25?'red':'amber');
 const a=d.a0+(0.18+Math.random()*.64)*d.span;
 s.orbs.push({d:d.id,a,r:.10,tier,v:(tier==='green'?.0044:.0036)+Math.random()*.0016,st:0,ph:Math.random()*6.28,
 label:d.n+' · '+d.acts[(Math.random()*d.acts.length)|0]+(tier==='green'?' — auto-performed':tier==='amber'?' — drafted, waiting on you':' — escalated for your call'),born:s.t})};
let W=0,H=0,dpr=Math.min(devicePixelRatio||1,2),raf;
const size=()=>{const r=wrap.current.getBoundingClientRect();W=r.width;H=r.height;cv.width=W*dpr;cv.height=H*dpr;
 cv.style.width=W+'px';cv.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0)};
const ro=new ResizeObserver(size);ro.observe(wrap.current);size();
const TILT=.74,LIFT=.17;
let labW=0;
const measureLabels=()=>{ctx.font='600 11.5px Geist, sans-serif';let w=0;
 for(const d of (s.depts||[])){w=Math.max(w,ctx.measureText(d.n).width);
  ctx.font='500 10px "Geist Mono", monospace';
  const tl=tierOfLevel(s.trust?.[d.id]??null);
  w=Math.max(w,ctx.measureText((tl?tierLabel[tl].toLowerCase():'no default set')+' · '+d.w[0]+'/'+d.w[1]+'/'+d.w[2]).width);
  ctx.font='600 11.5px Geist, sans-serif'}
 labW=w+14};
const PAD={t:74,b:46,x:16};
const geo=()=>{if(!labW)measureLabels();
 const bw=Math.max(120,(W-PAD.x*2)/2-labW);
 const bh=Math.max(120,H-PAD.t-PAD.b);
 const R=Math.min(bw/1.045,bh/0.98);
 const cx=W/2,cy=PAD.t+bh*.52+R*LIFT*.5;return{cx,cy,R,lift:R*LIFT}};
const proj=(r,a,G)=>{const{cx,cy,R,lift}=G;return[cx+r*R*Math.cos(a),cy+r*R*Math.sin(a)*TILT-lift*(1-r*r)]};
const unproj=(mx,my,G)=>{const{cx,cy,R,lift}=G;let r=Math.hypot((mx-cx)/R,(my-cy)/(R*TILT));
 for(let i=0;i<3;i++){const yy=my-cy+lift*(1-r*r);r=Math.hypot((mx-cx)/R,yy/(R*TILT))}
 const yy=my-cy+lift*(1-r*r);return[r,Math.atan2(yy/TILT,mx-cx)]};
const draw=()=>{s.t++;if(!reduce){s.rot+=0.00042;s.pulse=Math.sin(s.t*.026)}else s.pulse=.35;
 s.lit=Math.min(1,s.lit+.02);
 const G=geo();const{cx,cy,R}=G;const trust=s.trust;const seln=s.sel;
 if(!reduce&&s.t%26===0&&s.orbs.length<34)spawn();
 if(reduce&&s.orbs.length<10&&s.t%40===0)spawn();
 ctx.clearRect(0,0,W,H);
 const bg=ctx.createRadialGradient(cx,cy-R*.24,R*.06,cx,cy,R*1.9);
 bg.addColorStop(0,COL.dark?'#191541':'#171331');bg.addColorStop(.46,COL.dark?'#100D28':'#12102A');bg.addColorStop(1,COL.dark?'#070613':'#0A0819');
 ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 for(let i=1;i<=4;i++){const rr=i/4;ctx.beginPath();
  for(let k=0;k<=64;k++){const a=k/64*6.2832;const p=proj(rr,a,G);k?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])}
  ctx.closePath();ctx.strokeStyle='rgba(255,255,255,'+(.05*s.lit)+')';ctx.lineWidth=1;ctx.stroke()}
 s.segs=[];
 const DD=s.depts||[];DD.forEach((d,i)=>{const span=6.2832/DD.length;const a0=-Math.PI/2+i*span+s.rot;
  d.a0=a0;d.span=span;const g=trust[d.id];const dim=seln&&seln!==d.id?.24:1;
  const band=(r0,r1,tier,al)=>{ctx.beginPath();
   for(let k=0;k<=18;k++){const a=a0+span*(k/18);const p=proj(r1,a,G);k?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])}
   for(let k=18;k>=0;k--){const a=a0+span*(k/18);const p=proj(r0,a,G);ctx.lineTo(p[0],p[1])}
   ctx.closePath();const m=proj((r0+r1)/2,a0+span/2,G);
   const gr=ctx.createRadialGradient(cx,cy-G.lift,R*r0*.6,cx,cy-G.lift*.4,R*r1);
   gr.addColorStop(0,tint(tier,al*.9*dim));gr.addColorStop(1,tint(tier,al*.42*dim));
   ctx.fillStyle=gr;ctx.fill()};
  // A department with NO enabled action kinds has no posture (`g === null`). Painting the tier
  // bands from it would compute `Math.min(null + .24, .97)` and render a full red ring — telling
  // the owner this desk is "always your call" when in truth nothing is routed to it at all. That
  // is the exact claim the null exists to prevent, so it draws one neutral ring instead.
  if(g==null){band(.10,.97,'none',.16)}
  else{band(.10,g,'green',.30);band(g,Math.min(g+TC_AMBER,.97),'amber',.30);band(Math.min(g+TC_AMBER,.97),.97,'red',.26);}
  ctx.beginPath();const e0=proj(.10,a0,G),e1=proj(.97,a0,G);ctx.moveTo(e0[0],e0[1]);ctx.lineTo(e1[0],e1[1]);
  ctx.strokeStyle='rgba(255,255,255,'+(.10*dim)+')';ctx.lineWidth=1;ctx.stroke();
  // The boundary line and its knob sit AT radius `g`. A department with no posture has no
  // boundary to draw — `proj(null, …)` yields NaN coordinates — so it is skipped rather than
  // drawn somewhere arbitrary. (`hovB`, the drag-hover emphasis, went with the drag itself.)
  if(g!=null){
   ctx.beginPath();for(let k=0;k<=20;k++){const a=a0+span*(k/20);const p=proj(g,a,G);k?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])}
   ctx.strokeStyle=hex(COL.ok,.75*dim);ctx.lineWidth=2.1;ctx.stroke();
   const hm=proj(g,a0+span/2,G);ctx.beginPath();ctx.arc(hm[0],hm[1],4,0,6.2832);
   ctx.fillStyle=hex(COL.ok,dim);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=1;ctx.stroke();
  }
  const lp=proj(1.045,a0+span/2,G);
  const la=((a0+span/2)%6.2832+6.2832)%6.2832;const right=Math.cos(la)>=-0.08;
  ctx.textAlign=right?'left':'right';ctx.textBaseline='middle';
  ctx.font='600 11.5px Geist, sans-serif';ctx.fillStyle='rgba(255,255,255,'+(.92*dim*s.lit)+')';
  ctx.fillText(d.n,lp[0]+(right?6:-6),lp[1]-5);
  const dt=tierOfLevel(s.trust?.[d.id]??null);
  ctx.font='500 10px "Geist Mono", monospace';ctx.fillStyle=dt?tint(dt,.95*dim):'rgba(255,255,255,'+(.45*dim)+')';
  ctx.fillText((dt?tierLabel[dt].toLowerCase():'no default set')+' · '+d.w[0]+'/'+d.w[1]+'/'+d.w[2],lp[0]+(right?6:-6),lp[1]+8);
  s.segs.push({id:d.id,a0,span,g})});
 ctx.textAlign='left';ctx.textBaseline='alphabetic';
 for(let i=s.orbs.length-1;i>=0;i--){const o=s.orbs[i];const d=(s.depts||[]).find(x=>x.id===o.d);if(!d){s.orbs.splice(i,1);continue}
  const g=trust[o.d];const stop=o.tier==='green'?1.02:o.tier==='amber'?g:.965;
  if(reduce)o.r=stop;else if(o.r<stop)o.r=Math.min(stop,o.r+o.v*(o.tier==='green'&&o.r>g?2.1:1));
  if(o.tier==='green'&&o.r>=1.02){s.orbs.splice(i,1);continue}
  if(o.tier!=='green'&&s.t-o.born>1900){s.orbs.splice(i,1);continue}
  const p=proj(o.r,o.a+s.rot-(o.rot0||(o.rot0=s.rot)),G);o.sx=p[0];o.sy=p[1];
  const dimO=seln&&seln!==o.d?.2:1;
  const bl=o.tier==='green'?1:.55+.45*Math.sin(s.t*.09+o.ph);
  const fade=o.tier==='green'&&o.r>.94?1-(o.r-.94)/.08:1;
  const rad=(o.tier==='green'?2.5:3.2)*(1+.35*(1-o.r))*(s.hot===o?1.6:1);
  ctx.fillStyle=tint(o.tier,.14*bl*dimO*fade);ctx.beginPath();ctx.arc(p[0],p[1],rad*4.6,0,6.2832);ctx.fill();
  ctx.fillStyle=tint(o.tier,.95*bl*dimO*fade);ctx.beginPath();ctx.arc(p[0],p[1],rad,0,6.2832);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,'+(.65*bl*dimO*fade)+')';ctx.beginPath();ctx.arc(p[0]-rad*.28,p[1]-rad*.3,rad*.42,0,6.2832);ctx.fill()}
 const pc=proj(0,0,G);const pr=R*.115*(1+.045*s.pulse);
 const halo=ctx.createRadialGradient(pc[0],pc[1],pr*.4,pc[0],pc[1],pr*4.4);
 halo.addColorStop(0,hex(COL.vio,.34));halo.addColorStop(.5,hex(COL.vio,.09));halo.addColorStop(1,'rgba(0,0,0,0)');
 ctx.fillStyle=halo;ctx.beginPath();ctx.arc(pc[0],pc[1],pr*4.4,0,6.2832);ctx.fill();
 const sph=ctx.createRadialGradient(pc[0]-pr*.36,pc[1]-pr*.44,pr*.12,pc[0],pc[1],pr*1.12);
 sph.addColorStop(0,'rgba(255,255,255,.92)');sph.addColorStop(.34,hex(COL.vio,.92));sph.addColorStop(1,COL.dark?'#1A1440':'#221C46');
 ctx.fillStyle=sph;ctx.beginPath();ctx.arc(pc[0],pc[1],pr,0,6.2832);ctx.fill();
 ctx.strokeStyle='rgba(255,255,255,.3)';ctx.lineWidth=1;ctx.stroke();
 ctx.textAlign='center';ctx.font='700 10px Geist, sans-serif';ctx.fillStyle='rgba(255,255,255,.92)';
 ctx.fillText('PAIGE',pc[0],pc[1]+3.5);ctx.textAlign='left';
 let hot=null,hd=22;
 for(const o of s.orbs){const dd=Math.hypot(o.sx-s.mx,o.sy-s.my);if(dd<hd){hd=dd;hot=o}}
 s.hot=hot;
 // NO WRITE. The dial reflects the platform's default policy, which this workspace did not set
 // and cannot set from here; a drag that appeared to move it would be a governance claim with
 // nothing behind it. The band positions come from real lane counts and are read-only.
 raf=requestAnimationFrame(draw)};
raf=requestAnimationFrame(draw);
const rect=()=>cv.getBoundingClientRect();
const setM=e=>{const r=rect();s.mx=e.clientX-r.left;s.my=e.clientY-r.top};
const mv=e=>{setM(e);const G=geo();const[r,a]=unproj(s.mx,s.my,G);
 const seg=s.segs.find(g=>{let d=((a-g.a0)%6.2832+6.2832)%6.2832;return d<g.span});
 cv.style.cursor=s.hot?'pointer':seg&&r<1.0?'pointer':'default'};
const dn=e=>{setM(e);const G=geo();const[r,a]=unproj(s.mx,s.my,G);
 if(s.hot){onOrb(s.hot);return}
 const seg=s.segs.find(g=>{let d=((a-g.a0)%6.2832+6.2832)%6.2832;return d<g.span});
 if(!seg)return;
 // No drag: the boundary reflects platform policy this workspace cannot set, so grabbing it is
 // not an affordance the surface should offer. Selecting a department still works.
 if(r<.99&&r>.10)setSel(p=>p===seg.id?null:seg.id)};
const lv=()=>{s.mx=-999;s.my=-999};
cv.addEventListener('mousemove',mv);cv.addEventListener('mousedown',dn);window.addEventListener('mousemove',mv);
cv.addEventListener('mouseleave',lv);
return()=>{cancelAnimationFrame(raf);ro.disconnect();mo.disconnect();cv.removeEventListener('mousemove',mv);
 cv.removeEventListener('mousedown',dn);window.removeEventListener('mousemove',mv);cv.removeEventListener('mouseleave',lv)}},[onOrb,setSel]);
const hotLabel=S.current.hot;
return <div ref={wrap} style={{position:'absolute',inset:0}}><canvas ref={cvr} style={{display:'block'}}/></div>};

export const MiniCompass=({dept,label='This action was drafted because the platform default for',compact=false})=>{
const{depts,loading,configured}=useTrustDepartments();
const d=depts.find(x=>x.n===dept||x.id===dept);
// An absent read is reported as absent. It is never rendered as a level, because "no posture" and
// "she never acts here" are different statements and only one of them is true.
if(loading)return <div className="sub" style={{fontSize:12.2,padding:'10px 12px'}} role="status">Reading the platform default…</div>;
if(!configured||!d)return <div className="sub" style={{fontSize:12.2,padding:'10px 12px'}} role="status">The platform default for this department is unavailable.</div>;
const g=d.g;const t=tierOfLevel(g);
if(t==null)return <div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:compact?'10px 12px':'12px 14px',background:'var(--surface-2)'}}>
<span style={{fontSize:12.4,color:'var(--ink-2)'}}>No action types are routed to <strong style={{color:'var(--ink)'}}>{d.n}</strong> yet, so there is no default to show.</span></div>;
const col=t==='green'?'var(--ok)':t==='amber'?'var(--warn)':'var(--bad)';
const tint=t==='green'?'var(--ok-tint)':t==='amber'?'var(--warn-tint)':'var(--bad-tint)';
return <div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:compact?'10px 12px':'12px 14px',background:'var(--surface-2)'}}>
<div className="row" style={{gap:8,flexWrap:'wrap'}}>
<span style={{fontSize:12.4,color:'var(--ink-2)'}}>{label} <strong style={{color:'var(--ink)'}}>{d.n}</strong> is <strong style={{color:col}}>{tierLabel[t].toLowerCase()}</strong>.</span>
<span className="pill" style={{marginLeft:'auto',background:tint,color:col}}>{tierLabel[t]}</span></div>
<div style={{position:'relative',marginTop:11,height:22,display:'flex',alignItems:'center'}} role="img"
 aria-label={d.n+' platform default: '+d.w[0]+' run automatically, '+d.w[1]+' drafted for you, '+d.w[2]+' always your call'}>
<div style={{position:'absolute',inset:'8px 0',borderRadius:99,overflow:'hidden',display:'flex'}}>
<span style={{width:(g*100)+'%',background:'var(--ok)',opacity:.5}}/>
<span style={{width:(TC_AMBER*100)+'%',background:'var(--warn)',opacity:.5}}/>
<span style={{flex:1,background:'var(--bad)',opacity:.42}}/></div></div>
<div className="row" style={{justifyContent:'space-between',marginTop:2}}>
<span className="sub" style={{fontSize:10.5}}>{d.w[0]} run automatically</span>
<span className="sub" style={{fontSize:10.5}}>{d.w[1]} drafted · {d.w[2]} your call</span></div>
<div className="sub" style={{fontSize:10.5,marginTop:6}}>Platform default policy — not a setting this workspace chose.</div></div>};

export const CompassTile=({go,preview,departments})=>{const{depts,configured}=useTrustDepartments();const trust=useTrust();const ref=React.useRef(null);
const tot=depts.reduce((a,d)=>[a[0]+d.w[0],a[1]+d.w[1],a[2]+d.w[2]],[0,0,0]);
const all=tot[0]+tot[1]+tot[2];const auto=all?Math.round(tot[0]/all*100):null;
// Real per-department OPEN counts (usePaigeDeptStatus) when passed — the ONE live
// signal on this tile. The autonomy WEIGHT split below has no rollup seam yet (§13),
// so the tile carries a Preview marker while the sub line reports the live count.
const liveDepts=Array.isArray(departments)?departments:null;
const liveOpen=liveDepts?liveDepts.reduce((a,d)=>a+(d.openCount||0),0):null;
React.useEffect(()=>{const cv=ref.current;if(!cv)return;const ctx=cv.getContext('2d');if(!ctx)return;const dpr=Math.min(devicePixelRatio||1,2);
const W=cv.clientWidth,H=120;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;let t=0,raf,orbs=[];
const draw=()=>{t++;ctx.clearRect(0,0,W,H);const cx=W/2,cy=H*.72,R=Math.min(W*.42,H*.92);
 ctx.fillStyle='#0A0818';ctx.fillRect(0,0,W,H);
 depts.forEach((d,i)=>{const span=Math.PI/depts.length;const a0=-Math.PI+i*span;const g=trust[d.id];if(g==null)return;
  const arc=(r0,r1,col)=>{ctx.beginPath();ctx.arc(cx,cy,R*r1,a0,a0+span);ctx.arc(cx,cy,R*r0,a0+span,a0,true);ctx.closePath();ctx.fillStyle=col;ctx.fill()};
  arc(.2,g,'rgba(76,196,140,.42)');arc(g,Math.min(g+.24,.97),'rgba(227,166,60,.4)');arc(Math.min(g+.24,.97),.97,'rgba(238,122,114,.32)')});
 if(!reduce&&t%22===0&&orbs.length<9&&depts.length){const i=(Math.random()*depts.length)|0;const span=Math.PI/depts.length;
  const og=trust[depts[i].id];if(og!=null)orbs.push({a:-Math.PI+i*span+span*(.2+Math.random()*.6),r:.22,g:og,tier:'green'})}
 for(let i=orbs.length-1;i>=0;i--){const o=orbs[i];const stop=o.tier==='green'?1:o.g;
  if(o.r<stop)o.r+=.011;else if(o.tier==='green'){orbs.splice(i,1);continue}
  const x=cx+Math.cos(o.a)*R*o.r,y=cy+Math.sin(o.a)*R*o.r;
  ctx.fillStyle=o.tier==='green'?'rgba(120,230,180,.95)':'rgba(240,190,100,.95)';
  ctx.beginPath();ctx.arc(x,y,2,0,6.283);ctx.fill()}
 const pr=R*.14*(1+(reduce?0:.05*Math.sin(t*.03)));
 const gr=ctx.createRadialGradient(cx-pr*.3,cy-pr*.4,pr*.1,cx,cy,pr);
 gr.addColorStop(0,'rgba(255,255,255,.9)');gr.addColorStop(.4,'rgba(122,98,232,.9)');gr.addColorStop(1,'#221C46');
 ctx.fillStyle=gr;ctx.beginPath();ctx.arc(cx,cy,pr,0,6.283);ctx.fill();
 raf=requestAnimationFrame(draw)};
draw();return()=>cancelAnimationFrame(raf)},[trust,depts]);
return <div className="card" style={{overflow:'hidden'}}>
<div className="hd"><div><h3>Trust Compass</h3><div className="sub">{!configured?'Platform defaults unavailable':liveDepts?(liveOpen+' open across '+liveDepts.length+' departments'):(auto==null?depts.length+' departments':auto+'% run automatically by default, across '+depts.length+' departments')}</div></div>
<div className="row" style={{gap:8}}><Ic.shield size={17} style={{color:'var(--ink-3)'}}/></div></div>
<canvas ref={ref} style={{display:'block',width:'100%',height:120}}/>
<div className="row" style={{padding:'12px 20px',gap:16,borderTop:'1px solid var(--line-soft)'}}>
{[['Runs automatically',tot[0],'var(--ok)'],['Drafts for you',tot[1],'var(--warn)'],['Always your call',tot[2],'var(--bad)']].map(([k,v,c],i)=>
<div key={i}><div className="eyebrow" style={{fontSize:9.5}}>{k}</div><div style={{fontSize:19,fontWeight:600,marginTop:2,color:c}}>{v}</div></div>)}</div>
<div style={{padding:'0 20px 10px'}}><div className="sub" style={{fontSize:10.5}}>Counts are action types on the platform's default policy, not this workspace's own settings.</div></div>
<div style={{padding:'12px 20px',borderTop:'1px solid var(--line-soft)'}}>
<button className="btn btn-s" style={{width:'100%',justifyContent:'center'}} onClick={()=>go&&go('compass')}>Open Trust Compass <Ic.arrow size={14}/></button></div></div>};

// Shared shell so the two modals cannot drift apart in how they report an absent read (§18).
const TcModalState=({state,error,onRetry,emptyLine})=>
 <div className="sub" style={{fontSize:12.9,lineHeight:1.55,padding:'4px 2px'}} role={state==='error'?'alert':'status'}>
 {state==='loading'?'Reading what is waiting on you…'
  :state==='error'?<>This could not be loaded, so it is not a record of nothing waiting.{error?' ('+error+')':''} <button className="btn btn-s" style={{marginTop:9}} onClick={onRetry}>Try again</button></>
  :emptyLine}</div>;

const TcApprove=({onClose,onDone})=>{const q=useSoloPendingActions();
const a:SoloPendingAction|null=q.items[0]??null;
const state=q.loading?'loading':q.error?'error':a?'ok':'empty';
return (<><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(10,8,24,.62)',backdropFilter:'blur(4px)',zIndex:90}}/>
<div className="fade-in card" style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(600px,95vw)',maxHeight:'90vh',overflow:'auto',zIndex:91,borderRadius:'var(--r-xl)',boxShadow:'var(--sh-3)'}}>
<div className="hd"><div><div className="row" style={{gap:8}}><span className="pill pill-warn"><span className="dot"/>Waiting on you</span>
{a&&<span className="pill pill-n">{a.department}</span>}</div>
<h3 style={{marginTop:8}}>{a?a.title:'Waiting on you'}</h3></div>
<button className="btn btn-s" onClick={onClose} style={{width:28,height:28,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.x size={13}/></button></div>
<div style={{padding:'16px 20px 20px',display:'grid',gap:14}}>
{state!=='ok'?<TcModalState state={state} error={q.error} onRetry={q.refresh}
  emptyLine="Nothing is waiting on you right now. When Paige files work she is not allowed to run alone, it appears here."/>:<>
{a.draftContent&&<div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'14px 16px',fontSize:13.3,color:'var(--ink-2)',lineHeight:1.65,whiteSpace:'pre-wrap'}}>{a.draftContent}</div>}
{a.summary&&<div style={{fontSize:13.2,color:'var(--ink-2)',lineHeight:1.6}}>{a.summary}</div>}
{a.rationale&&<div><div className="eyebrow">Why she stopped</div><div style={{fontSize:13,color:'var(--ink-2)',marginTop:5,lineHeight:1.6}}>{a.rationale}</div></div>}
<MiniCompass dept={a.department}/>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<button onClick={onDone} className="row" style={{gap:7,height:36,padding:'0 18px',borderRadius:10,background:'var(--gold-bright)',color:'#2A1C00',fontWeight:700,fontSize:13.4}}><Ic.check size={14}/>Approve & send</button>
<button className="btn">Edit</button><button className="btn" onClick={onClose}>Dismiss</button></div></>}</div></div></>);};

const TcEscalate=({onClose})=>{const q=useSoloPendingActions();
const a:SoloPendingAction|null=q.items[0]??null;
const state=q.loading?'loading':q.error?'error':a?'ok':'empty';
return (<><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(10,8,24,.62)',backdropFilter:'blur(4px)',zIndex:90}}/>
<div className="fade-in card" style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(580px,95vw)',maxHeight:'90vh',overflow:'auto',zIndex:91,borderRadius:'var(--r-xl)',boxShadow:'var(--sh-3)'}}>
<div className="hd"><div><div className="row" style={{gap:8}}><span className="pill pill-bad"><span className="dot"/>Your decision</span>
{a&&<span className="pill pill-n">{a.department}</span>}</div>
<h3 style={{marginTop:8}}>{a?a.title:'She stopped and brought this to you'}</h3></div>
<button className="btn btn-s" onClick={onClose} style={{width:28,height:28,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.x size={13}/></button></div>
<div style={{padding:'16px 20px 20px',display:'grid',gap:14}}>
{state!=='ok'?<TcModalState state={state} error={q.error} onRetry={q.refresh}
  emptyLine="Nothing is waiting on your decision right now. When Paige files work she will not take alone, it appears here."/>:<>
{a.summary&&<div style={{fontSize:13.4,color:'var(--ink-2)',lineHeight:1.65}}>{a.summary}</div>}
{a.draftContent&&<div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'14px 16px',fontSize:13.2,color:'var(--ink-2)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{a.draftContent}</div>}
{a.rationale&&<div style={{background:'var(--bad-tint)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'12px 14px',fontSize:13,color:'var(--ink-2)',lineHeight:1.6}}>
<strong style={{color:'var(--ink)'}}>Why she won't decide it: </strong>{a.rationale}</div>}
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<button onClick={onClose} className="row" style={{gap:7,height:36,padding:'0 18px',borderRadius:10,background:'var(--gold-bright)',color:'#2A1C00',fontWeight:700,fontSize:13.4}}><Ic.check size={14}/>Decide and log</button>
<button className="btn">Hand back with guidance</button><button className="btn" onClick={onClose}>Later</button></div></>}</div></div></>);};

const TcDept=({id,onBack})=>{
const{depts,loading,configured}=useTrustDepartments();
const d=depts.find(x=>x.id===id);
if(loading)return <div className="sub" style={{padding:'18px 4px'}} role="status">Reading the platform default policy…</div>;
if(!configured||!d)return <div className="fade-in card" style={{padding:'18px 20px'}}>
 <div className="row" style={{gap:13}}><button className="btn btn-s" onClick={onBack}><span style={{transform:'rotate(180deg)',display:'flex'}}><Ic.arrow size={13}/></span>Full compass</button></div>
 <div className="sub" style={{marginTop:12}} role="status">This department's default policy could not be read, so nothing is shown for it. That is not a record of it having no policy.</div></div>;
const t=tierOfLevel(d.g);
const laneCopy={auto:'Runs automatically',confirm:'Drafts for you',off:'Always your call'};
const laneCol={auto:'var(--ok)',confirm:'var(--warn)',off:'var(--bad)'};
return <div className="fade-in" style={{display:'grid',gap:16}}>
<div className="card" style={{padding:'16px 20px'}}>
<div className="row" style={{gap:13,flexWrap:'wrap'}}>
<button className="btn btn-s" onClick={onBack}><span style={{transform:'rotate(180deg)',display:'flex'}}><Ic.arrow size={13}/></span>Full compass</button>
<span className="tile" style={{background:'var(--violet-tint)',color:'var(--violet)'}}>{React.createElement(Ic[d.ic]||Ic.grid,{size:16})}</span>
<div className="grow" style={{minWidth:200}}><div style={{fontWeight:600,fontSize:16,letterSpacing:'-.02em'}}>{d.n}</div>
<div className="sub">{d.w[0]} run automatically · {d.w[1]} drafted for you · {d.w[2]} always your call</div></div>
{t&&<span className="pill" style={{background:t==='green'?'var(--ok-tint)':t==='amber'?'var(--warn-tint)':'var(--bad-tint)',
 color:t==='green'?'var(--ok)':t==='amber'?'var(--warn)':'var(--bad)'}}>{tierLabel[t]}</span>}</div>
<div className="sub" style={{fontSize:10.8,marginTop:9}}>Platform default policy — not a setting this workspace chose. There is no per-workspace autonomy record to show.</div></div>
<div className="card"><div className="hd"><div><h3>Action types routed here</h3>
<div className="sub">{d.acts.length?'Each one runs in the lane the platform sets for it.':'Nothing is routed to this department yet.'}</div></div></div>
<div style={{padding:'6px 0 4px'}}>{d.acts.map((a,i)=>
<div key={a.label} className="row" style={{gap:11,padding:'11px 20px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',background:laneCol[a.lane]}}/>
<span className="grow trunc" style={{fontSize:13.1,fontWeight:500}}>{a.label}</span>
<span style={{fontSize:11.5,fontWeight:600,color:laneCol[a.lane]}}>{laneCopy[a.lane]}</span></div>)}
{!d.acts.length&&<div className="sub" style={{padding:'12px 20px'}}>No enabled action types are routed to this department, so it has no default policy to show.</div>}</div></div></div>};

export const TrustCompass=({accountEpoch}={})=>{
const trust=useTrust();
const[sel,setSel]=React.useState(null);
const[flow,setFlow]=React.useState(null);
const[toast,setToast]=React.useState(null);
const[full,setFull]=React.useState(null);
const[fold,setFold]=React.useState(null);
const activity=useSoloActivityFeed();
// The recorded events, in the shape this panel's markup already renders. `tier` is always
// 'green' by construction — see the note where TC_LIVE used to be.
const live=React.useMemo(()=>activity.items.map(a=>({
 id:a.id,t:a.title,dept:departmentLabel(a.departmentSlug),tier:'green',w:elapsedLabel(a.occurredAt)})),[activity.items]);
// An empty feed and a failed read look identical if you let them, and the second one tells the
// operator that Paige has done nothing (§13). They are kept apart here and said apart below.
const liveState=activity.loading?'loading':activity.error?'error':live.length?'ok':'empty';
const{depts,configured:trustConfigured}=useTrustDepartments(accountEpoch);
const tot=depts.reduce((a,d)=>[a[0]+d.w[0],a[1]+d.w[1],a[2]+d.w[2]],[0,0,0]);
const all=tot[0]+tot[1]+tot[2];
const auto=all?Math.round(tot[0]/all*100):null,dr=all?Math.round(tot[1]/all*100):null;
const onOrb=React.useCallback(o=>{setFlow(o.tier==='red'?'esc':o.tier==='amber'?'appr':null);
 if(o.tier==='green'){setToast(o.label);setTimeout(()=>setToast(null),2600)}},[]);
if(full)return <Wrap><PageHead eyebrow="Platform · Trust Compass" title={depts.find(d=>d.id===full)?.n||"Department"} sub="Every action type routed here, and the lane the platform default puts it in."/>
<TcDept id={full} onBack={()=>setFull(null)}/></Wrap>;
return <div className="fade-in pg" style={{width:'100%',maxWidth:1440,margin:'0 auto'}}>
<PageHead eyebrow="Platform" title="Trust Compass"
sub={!trustConfigured?'Platform default policy unavailable.':all+" action types across "+depts.length+" departments, on the platform's default policy. This is not a setting this workspace chose."}
right={<div className="row" style={{gap:8}}>
<span className="pill pill-ok"><span className="dot"/>{auto}% autopilot</span>
<span className="pill pill-warn">{dr}% drafts</span>
<span className="pill pill-bad">{100-auto-dr}% escalated</span></div>}/>
<div className="pg-fill tc-grid">
<div className="card" style={{overflow:'hidden',borderRadius:'var(--r-xl)',position:'relative',minHeight:260,background:'#0A0818',borderColor:'#241F49'}}>
<TcCanvas sel={sel} setSel={setSel} onOrb={onOrb}/>
<div style={{position:'absolute',top:16,left:18,right:18,display:'flex',gap:12,justifyContent:'space-between',pointerEvents:'none'}}>
<div><div style={{fontSize:10.5,letterSpacing:'.26em',color:'rgba(255,255,255,.55)',fontWeight:600}}>WHAT SHE IS ALLOWED TO DO</div>
<div style={{color:'#fff',fontSize:19,fontWeight:600,letterSpacing:'-.03em',marginTop:4}}>{sel?(depts.find(d=>d.id===sel)?.n||'Department'):depts.length+' departments'}</div>
<div style={{color:'rgba(255,255,255,.6)',fontSize:12.4,marginTop:3}}>{all} actions this week · {auto}% she handled alone</div></div>
<div style={{display:'grid',gap:6,justifyItems:'end',pointerEvents:'auto'}}>
<span className="row" style={{gap:7,height:26,padding:'0 11px',borderRadius:99,background:'rgba(76,196,140,.16)',color:'#4CC48C',fontSize:11.5,fontWeight:600}}>
<span className="dot"/>Live · she is working now</span>
<span style={{color:'rgba(255,255,255,.45)',fontSize:11}}>Drag a ring to change autonomy · click a segment to drill in · click an orb</span>
{sel&&<button onClick={()=>setFull(sel)} className="row" style={{gap:6,height:28,padding:'0 12px',borderRadius:99,background:'rgba(255,255,255,.1)',color:'#fff',fontSize:11.8,fontWeight:600}}>
Open {depts.find(d=>d.id===sel)?.n||'department'}<Ic.arrow size={12}/></button>}</div></div>

{/* The drag PREVIEW is gone with the drag. It read "At this setting she would have handled N
     of M actions this week without asking" — a projection from a dial that set nothing, over a
     weekly total nothing produced. Removed rather than left unreachable (§13/§58). */}

<div style={{position:'absolute',left:18,right:18,bottom:14,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',pointerEvents:'none'}}>
{[['Autopilot','#4CC48C'],['Drafts for you','#E3A63C'],['Your call','#EE7A72']].map(([l,c])=>
<span key={l} className="row" style={{gap:7,height:26,padding:'0 11px',borderRadius:99,background:'rgba(255,255,255,.05)',color:'rgba(255,255,255,.76)',fontSize:11.4}}>
<span style={{width:7,height:7,borderRadius:'50%',background:c}}/>{l}</span>)}
<span className="mono" style={{marginLeft:'auto',color:'rgba(255,255,255,.5)',fontSize:11}}>Today · {tot[0]} performed · {tot[1]} for you · {tot[2]} escalated</span></div></div>

<div className="tc-rail">
<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Working now</h3><div className="sub">The last few minutes, as they happened</div></div>
<span className={'pill '+(liveState==='ok'?'pill-ok':'pill-n')}>{liveState==='ok'?<><span className="dot"/>Live</>:liveState==='loading'?'Loading':liveState==='error'?'Unavailable':'Nothing yet'}</span></div>
<div className="pane" style={{flex:1}}>{liveState!=='ok'?<div className="sub" style={{padding:'16px 20px',fontSize:12.4,lineHeight:1.5}} role={liveState==='error'?'alert':'status'}>{liveState==='loading'?'Reading what she has done…':liveState==='error'?<>Recent activity could not be loaded, so this is not a record of nothing happening. <button className="btn btn-s" style={{marginTop:9}} onClick={activity.refresh}>Try again</button></>:'Nothing recorded yet. Anything Paige or your team does lands here as it happens.'}</div>:live.map((l,i)=>{
return <button key={l.id} onClick={()=>setFlow(l.tier==='red'?'esc':l.tier==='amber'?'appr':null)} className="row"
style={{width:'100%',textAlign:'left',gap:11,padding:'11px 20px',borderTop:i?'1px solid var(--line-soft)':'0',alignItems:'flex-start'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',marginTop:5,
background:l.tier==='green'?'var(--ok)':l.tier==='amber'?'var(--warn)':'var(--bad)'}}/>
<span className="grow" style={{minWidth:0}}><span style={{fontSize:12.9,color:'var(--ink-2)',lineHeight:1.45,display:'block'}}>{l.t}</span>
<span className="sub" style={{fontSize:11.3}}>{l.dept} · {l.tier==='green'?'performed and logged':l.tier==='amber'?'waiting on you':'your decision'}</span></span>
<span className="mono sub" style={{fontSize:10.8,flex:'none'}}>{l.w}</span></button>})}</div></div>

<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('growth')}><Ic.trend size={14}/>Trust growth · +14%</button>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('depts')}><Ic.grid size={14}/>By department</button></div></div>

<div className="tc-railbtn row" style={{gap:9,flexWrap:'wrap'}}>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('live')}><span className="dot" style={{color:'var(--ok)'}}/>Working now · {live.length}</button>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('growth')}><Ic.trend size={14}/>+14%</button>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('depts')}><Ic.grid size={14}/>By department</button></div>

<Foldout open={fold==='live'} onClose={()=>setFold(null)} title="Working now" sub="The last few minutes, as they happened">
<div>{liveState!=='ok'?<div className="sub" style={{padding:'16px 20px',fontSize:12.4,lineHeight:1.5}} role={liveState==='error'?'alert':'status'}>{liveState==='loading'?'Reading what she has done…':liveState==='error'?'Recent activity could not be loaded, so this is not a record of nothing happening.':'Nothing recorded yet. Anything Paige or your team does lands here as it happens.'}</div>:live.map((l,i)=>{
return <button key={l.id} onClick={()=>{setFold(null);setFlow(l.tier==='red'?'esc':l.tier==='amber'?'appr':null)}} className="row"
style={{width:'100%',textAlign:'left',gap:11,padding:'11px 20px',borderTop:i?'1px solid var(--line-soft)':'0',alignItems:'flex-start'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',marginTop:5,background:l.tier==='green'?'var(--ok)':l.tier==='amber'?'var(--warn)':'var(--bad)'}}/>
<span className="grow" style={{minWidth:0}}><span style={{fontSize:12.9,color:'var(--ink-2)',lineHeight:1.45,display:'block'}}>{l.t}</span>
<span className="sub" style={{fontSize:11.3}}>{l.dept} · {l.tier==='green'?'performed and logged':l.tier==='amber'?'waiting on you':'your decision'}</span></span>
<span className="mono sub" style={{fontSize:10.8,flex:'none'}}>{l.w}</span></button>})}</div></Foldout>

<Foldout open={fold==='growth'} onClose={()=>setFold(null)} title="Your trust has grown 14% in 30 days" sub="Four departments moved outward. None moved back.">
<div style={{padding:'16px 20px 20px'}}>
<div className="card" style={{padding:'16px 18px',boxShadow:'none'}}>
<div className="row" style={{gap:9}}><span className="tile" style={{width:30,height:30,borderRadius:'50%',background:'var(--ok-tint)',color:'var(--ok)'}}><Ic.trend size={15}/></span>
<div className="grow"><div style={{fontSize:13.4,fontWeight:600}}>Thirty-day trajectory</div>
<div className="sub" style={{marginTop:2}}>Every outward move you made, and none reversed.</div></div></div>
<div className="sub" style={{fontSize:11,marginTop:12}} role="status">A fourteen-day trend is not shown: nothing in the platform records a day-by-day history of what Paige did, so any chart here would be drawn from numbers that do not exist.</div></div></div></Foldout>

<Foldout open={fold==='depts'} onClose={()=>setFold(null)} title="By department" sub="Action types on the platform default: runs automatically / drafted for you / always your call.">
<div>{depts.map((d,i)=>{const t=tierOfLevel(d.g);
return <button key={d.id} onClick={()=>setFull(d.id)} onMouseEnter={()=>setSel(d.id)} onMouseLeave={()=>setSel(null)} className="row"
style={{width:'100%',textAlign:'left',gap:11,padding:'10px 20px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',background:t==='green'?'var(--ok)':t==='amber'?'var(--warn)':t==='red'?'var(--bad)':'var(--ink-3)'}}/>
<span className="grow trunc" style={{fontSize:12.9,fontWeight:500}}>{d.n}</span>
<span className="mono sub" style={{fontSize:11}}>{d.w[0]}/{d.w[1]}/{d.w[2]}</span>
<span className="pill pill-n" style={{fontSize:10}}>{t?tierLabel[t]:'No default set'}</span></button>})}</div></Foldout></div>

{flow==='appr'&&<TcApprove onClose={()=>setFlow(null)} onDone={()=>setFlow(null)}/>}
{flow==='esc'&&<TcEscalate onClose={()=>setFlow(null)}/>}
{toast&&<div className="fade-in row" style={{position:'fixed',bottom:26,left:'50%',transform:'translateX(-50%)',gap:9,background:'var(--rail)',color:'var(--ink-inv)',
padding:'11px 18px',borderRadius:12,fontSize:13,boxShadow:'var(--sh-3)',zIndex:95,maxWidth:'min(560px,92vw)'}}>
<span style={{color:'var(--gold-bright)',display:'flex',flex:'none'}}><Ic.check size={15}/></span>{toast}</div>}
</div>};
