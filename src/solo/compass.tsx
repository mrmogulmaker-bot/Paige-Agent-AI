// @ts-nocheck
import React from "react";
import { Ic, Foldout, PageHead, Wrap } from "./_shared";

export const TC_DEPTS=[
 {id:'exec',n:'Executive',ic:'shield',g:.30,w:[6,3,1],conf:91,trend:2,acts:['Weekly priorities','Board-style summary','Goal tracking','Escalation triage']},
 {id:'mkt',n:'Marketing',ic:'trend',g:.58,w:[38,12,0],conf:88,trend:9,acts:['Outbound email','Social posts','Ad campaigns','SEO content','Review responses','Weekly brief']},
 {id:'sales',n:'Sales',ic:'store',g:.44,w:[21,14,1],conf:84,trend:6,acts:['Follow-ups','Proposal drafts','Pricing answers','Discovery notes','Deal hygiene']},
 {id:'cs',n:'Client Success',ic:'users',g:.52,w:[46,9,1],conf:94,trend:11,acts:['Onboarding steps','Check-ins','Answer threads','Risk outreach','Renewal notes']},
 {id:'prod',n:'Product',ic:'grid',g:.36,w:[8,4,0],conf:86,trend:0,acts:['Offer packaging','Roadmap notes','Feedback synthesis']},
 {id:'tech',n:'Technology',ic:'bolt',g:.72,w:[52,3,0],conf:97,trend:14,acts:['Systems fixes','Deploy checks','Data hygiene','Monitoring','Tracking repair']},
 {id:'fin',n:'Finance',ic:'chart',g:.40,w:[18,11,3],conf:92,trend:-3,acts:['Invoicing','Dunning','Forecast updates','Expense filing','Rate changes']},
 {id:'ppl',n:'People',ic:'users',g:.26,w:[4,2,1],conf:80,trend:0,acts:['Contractor onboarding','W-9 chase','Scheduling']},
 {id:'legal',n:'Legal',ic:'vault',g:.22,w:[5,8,4],conf:89,trend:4,acts:['Renewal reminders','Filing prep','Contract review notes','Trademark upkeep']},
 {id:'ops',n:'Operations',ic:'gear',g:.66,w:[36,6,0],conf:95,trend:8,acts:['Workflow runs','Vendor coordination','Delivery tracking','Document filing']}];
const TC_AMBER=.24;
const tierOf=(g,r)=>r<=g?'green':r<=Math.min(g+TC_AMBER,.97)?'amber':'red';
const tierLabel={green:'Autopilot',amber:'Draft ready',red:'Escalated'};

const TRUST=(()=>{let s=Object.fromEntries(TC_DEPTS.map(d=>[d.id,d.g]));const subs=new Set();
return{get:()=>s,of:id=>s[id],set:(id,v)=>{s={...s,[id]:Math.max(.12,Math.min(.94,v))};subs.forEach(f=>f(s))},
sub:f=>{subs.add(f);return()=>subs.delete(f)}}})();
export const useTrust=()=>{const[s,set]=React.useState(TRUST.get());React.useEffect(()=>TRUST.sub(set),[]);return s};
export const deptTier=id=>{const g=TRUST.of(id);return g>=.6?'green':g>=.34?'amber':'red'};

const TC_LIVE=[
 {d:'cs',t:'Answered Bellweather on the invoice question',tier:'green',w:'4s ago'},
 {d:'tech',t:'Re-ran check 6 after the redirect fix',tier:'green',w:'22s ago'},
 {d:'mkt',t:'Drafted the Q3 nurture email to Sarah Nnadi',tier:'amber',w:'40s ago'},
 {d:'fin',t:'Chased the Ridgeline decline, softest tone first',tier:'amber',w:'1m ago'},
 {d:'ops',t:'Filed the Northwind kickoff notes',tier:'green',w:'2m ago'},
 {d:'legal',t:'Workers\' comp lapsed — needs your decision',tier:'red',w:'3m ago'},
 {d:'cs',t:'Logged Cairn Advisory portal activity',tier:'green',w:'4m ago'},
 {d:'sales',t:'Drafted the Verity Partners proposal follow-up',tier:'amber',w:'6m ago'}];
const TC_DRAFT={dept:'Marketing',type:'Outbound email',conf:91,
 subj:'A quieter way to run your Q3',to:'sarah.nnadi@harpervale.com',from:'jordan@paigeagent.ai',
 why:'She opened the last two teardowns without replying, and her renewal window opens in five weeks. A soft-value email now beats a renewal ask later.',
 body:"Sarah — no ask here. You opened the last two teardowns, so I pulled the one thing both had in common: the teams that got traction moved reporting off Friday afternoons.\n\nIf that's useful I'll send the one-pager. If not, ignore me and I'll see you at the quarterly."};
const TC_ESC={dept:'Legal',type:'Coverage decision',
 brief:"Workers' compensation lapsed on August 9. Reinstatement inside the 30-day window is available at an unknown premium, or the policy can be rewritten with a new carrier.",
 why:"I can't decide this one. It changes your statutory coverage position and the premium is not published — a person has to weigh the cost against the exposure.",
 opts:['Reinstate with Statewide Mutual at whatever the premium comes back as','Quote two carriers before committing, accepting a longer gap','Reduce scope of covered roles and reprice'],
 rec:'Reinstate now, quote carriers at the next renewal. The gap is the bigger exposure.'};

const TcCanvas=({sel,setSel,onOrb,drag,setDrag,setPreview})=>{
const wrap=React.useRef(null),cvr=React.useRef(null),S=React.useRef({});
const trust=useTrust();
React.useEffect(()=>{S.current.trust=trust},[trust]);
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
const tint=(t,a)=>hex(t==='green'?COL.ok:t==='amber'?COL.warn:COL.bad,a);
const s=S.current;Object.assign(s,{rot:0,t:0,mx:-999,my:-999,hot:null,orbs:[],segs:[],pulse:0,lit:0});
const spawn=(force)=>{const d=TC_DEPTS[(Math.random()*TC_DEPTS.length)|0];const g=s.trust[d.id];
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
 for(const d of TC_DEPTS){w=Math.max(w,ctx.measureText(d.n).width);
  ctx.font='500 10px "Geist Mono", monospace';
  w=Math.max(w,ctx.measureText(tierLabel[deptTier(d.id)].toLowerCase()+' · '+d.w[0]+'/'+d.w[1]+'/'+d.w[2]).width);
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
 TC_DEPTS.forEach((d,i)=>{const span=6.2832/TC_DEPTS.length;const a0=-Math.PI/2+i*span+s.rot;
  d.a0=a0;d.span=span;const g=trust[d.id];const dim=seln&&seln!==d.id?.24:1;
  const band=(r0,r1,tier,al)=>{ctx.beginPath();
   for(let k=0;k<=18;k++){const a=a0+span*(k/18);const p=proj(r1,a,G);k?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])}
   for(let k=18;k>=0;k--){const a=a0+span*(k/18);const p=proj(r0,a,G);ctx.lineTo(p[0],p[1])}
   ctx.closePath();const m=proj((r0+r1)/2,a0+span/2,G);
   const gr=ctx.createRadialGradient(cx,cy-G.lift,R*r0*.6,cx,cy-G.lift*.4,R*r1);
   gr.addColorStop(0,tint(tier,al*.9*dim));gr.addColorStop(1,tint(tier,al*.42*dim));
   ctx.fillStyle=gr;ctx.fill()};
  band(.10,g,'green',.30);band(g,Math.min(g+TC_AMBER,.97),'amber',.30);band(Math.min(g+TC_AMBER,.97),.97,'red',.26);
  ctx.beginPath();const e0=proj(.10,a0,G),e1=proj(.97,a0,G);ctx.moveTo(e0[0],e0[1]);ctx.lineTo(e1[0],e1[1]);
  ctx.strokeStyle='rgba(255,255,255,'+(.10*dim)+')';ctx.lineWidth=1;ctx.stroke();
  const hovB=drag&&drag.id===d.id;
  ctx.beginPath();for(let k=0;k<=20;k++){const a=a0+span*(k/20);const p=proj(g,a,G);k?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])}
  ctx.strokeStyle=hex(COL.ok,(hovB?1:.75)*dim);ctx.lineWidth=hovB?3.4:2.1;ctx.stroke();
  const hm=proj(g,a0+span/2,G);ctx.beginPath();ctx.arc(hm[0],hm[1],hovB?5.4:4,0,6.2832);
  ctx.fillStyle=hex(COL.ok,dim);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=1;ctx.stroke();
  const lp=proj(1.045,a0+span/2,G);
  const la=((a0+span/2)%6.2832+6.2832)%6.2832;const right=Math.cos(la)>=-0.08;
  ctx.textAlign=right?'left':'right';ctx.textBaseline='middle';
  ctx.font='600 11.5px Geist, sans-serif';ctx.fillStyle='rgba(255,255,255,'+(.92*dim*s.lit)+')';
  ctx.fillText(d.n,lp[0]+(right?6:-6),lp[1]-5);
  ctx.font='500 10px "Geist Mono", monospace';ctx.fillStyle=tint(deptTier(d.id),.95*dim);
  ctx.fillText(tierLabel[deptTier(d.id)].toLowerCase()+' · '+d.w[0]+'/'+d.w[1]+'/'+d.w[2],lp[0]+(right?6:-6),lp[1]+8);
  s.segs.push({id:d.id,a0,span,g})});
 ctx.textAlign='left';ctx.textBaseline='alphabetic';
 for(let i=s.orbs.length-1;i>=0;i--){const o=s.orbs[i];const d=TC_DEPTS.find(x=>x.id===o.d);if(!d){s.orbs.splice(i,1);continue}
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
 if(drag){const[r]=unproj(s.mx,s.my,G);TRUST.set(drag.id,r);
  const d=TC_DEPTS.find(x=>x.id===drag.id);const tot=d.w[0]+d.w[1]+d.w[2];
  setPreview({id:drag.id,n:d.n,auto:Math.round(tot*Math.max(.05,Math.min(.97,r))),tot,g:r})}
 raf=requestAnimationFrame(draw)};
raf=requestAnimationFrame(draw);
const rect=()=>cv.getBoundingClientRect();
const setM=e=>{const r=rect();s.mx=e.clientX-r.left;s.my=e.clientY-r.top};
const mv=e=>{setM(e);const G=geo();const[r,a]=unproj(s.mx,s.my,G);
 const seg=s.segs.find(g=>{let d=((a-g.a0)%6.2832+6.2832)%6.2832;return d<g.span});
 const nearB=seg&&Math.abs(r-seg.g)<.055&&r>.10&&r<.97;
 cv.style.cursor=drag?'grabbing':s.hot?'pointer':nearB?'ns-resize':seg&&r<1.0?'pointer':'default'};
const dn=e=>{setM(e);const G=geo();const[r,a]=unproj(s.mx,s.my,G);
 if(s.hot){onOrb(s.hot);return}
 const seg=s.segs.find(g=>{let d=((a-g.a0)%6.2832+6.2832)%6.2832;return d<g.span});
 if(!seg)return;
 if(Math.abs(r-seg.g)<.07&&r>.10&&r<.97){setDrag({id:seg.id})}
 else if(r<.99&&r>.10)setSel(p=>p===seg.id?null:seg.id)};
const up=()=>{if(drag){setDrag(null);setPreview(null)}};
const lv=()=>{s.mx=-999;s.my=-999};
cv.addEventListener('mousemove',mv);cv.addEventListener('mousedown',dn);window.addEventListener('mousemove',mv);
window.addEventListener('mouseup',up);cv.addEventListener('mouseleave',lv);
return()=>{cancelAnimationFrame(raf);ro.disconnect();mo.disconnect();cv.removeEventListener('mousemove',mv);
 cv.removeEventListener('mousedown',dn);window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up);cv.removeEventListener('mouseleave',lv)}},[drag,onOrb,setSel,setDrag,setPreview]);
const hotLabel=S.current.hot;
return <div ref={wrap} style={{position:'absolute',inset:0}}><canvas ref={cvr} style={{display:'block'}}/></div>};

export const MiniCompass=({dept,label='This action was drafted because you have',compact})=>{
const trust=useTrust();const d=TC_DEPTS.find(x=>x.n===dept||x.id===dept);if(!d)return null;
const g=trust[d.id];const t=deptTier(d.id);
return <div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:compact?'10px 12px':'12px 14px',background:'var(--surface-2)'}}>
<div className="row" style={{gap:8,flexWrap:'wrap'}}>
<span style={{fontSize:12.4,color:'var(--ink-2)'}}>{label} <strong style={{color:'var(--ink)'}}>{d.n}</strong> on <strong style={{color:t==='green'?'var(--ok)':t==='amber'?'var(--warn)':'var(--bad)'}}>{t}</strong>. Slide to change.</span>
<span className="pill" style={{marginLeft:'auto',background:t==='green'?'var(--ok-tint)':t==='amber'?'var(--warn-tint)':'var(--bad-tint)',
color:t==='green'?'var(--ok)':t==='amber'?'var(--warn)':'var(--bad)'}}>{tierLabel[t]}</span></div>
<div style={{position:'relative',marginTop:11,height:22,display:'flex',alignItems:'center'}}>
<div style={{position:'absolute',inset:'8px 0',borderRadius:99,overflow:'hidden',display:'flex'}}>
<span style={{width:(g*100)+'%',background:'var(--ok)',opacity:.5}}/>
<span style={{width:(TC_AMBER*100)+'%',background:'var(--warn)',opacity:.5}}/>
<span style={{flex:1,background:'var(--bad)',opacity:.42}}/></div>
<input type="range" min="12" max="94" value={Math.round(g*100)} onChange={e=>TRUST.set(d.id,+e.target.value/100)}
style={{position:'relative',width:'100%',appearance:'none',background:'transparent',height:22,margin:0,cursor:'grab'}} className="tc-range"/></div>
<div className="row" style={{justifyContent:'space-between',marginTop:2}}>
<span className="sub" style={{fontSize:10.5}}>She acts and logs it</span>
<span className="sub" style={{fontSize:10.5}}>She briefs, you decide</span></div>
<style>{'.tc-range::-webkit-slider-thumb{appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;border:2.5px solid var(--ok);box-shadow:var(--sh-1);cursor:grab}.tc-range::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:2.5px solid var(--ok);box-shadow:var(--sh-1)}'}</style></div>};

export const CompassTile=({go})=>{const trust=useTrust();const ref=React.useRef(null);
const tot=TC_DEPTS.reduce((a,d)=>[a[0]+d.w[0],a[1]+d.w[1],a[2]+d.w[2]],[0,0,0]);
const all=tot[0]+tot[1]+tot[2];const auto=Math.round(tot[0]/all*100);
React.useEffect(()=>{const cv=ref.current;if(!cv)return;const ctx=cv.getContext('2d');if(!ctx)return;const dpr=Math.min(devicePixelRatio||1,2);
const W=cv.clientWidth,H=120;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;let t=0,raf,orbs=[];
const draw=()=>{t++;ctx.clearRect(0,0,W,H);const cx=W/2,cy=H*.72,R=Math.min(W*.42,H*.92);
 ctx.fillStyle='#0A0818';ctx.fillRect(0,0,W,H);
 TC_DEPTS.forEach((d,i)=>{const span=Math.PI/TC_DEPTS.length;const a0=-Math.PI+i*span;const g=trust[d.id];
  const arc=(r0,r1,col)=>{ctx.beginPath();ctx.arc(cx,cy,R*r1,a0,a0+span);ctx.arc(cx,cy,R*r0,a0+span,a0,true);ctx.closePath();ctx.fillStyle=col;ctx.fill()};
  arc(.2,g,'rgba(76,196,140,.42)');arc(g,Math.min(g+.24,.97),'rgba(227,166,60,.4)');arc(Math.min(g+.24,.97),.97,'rgba(238,122,114,.32)')});
 if(!reduce&&t%22===0&&orbs.length<9){const i=(Math.random()*TC_DEPTS.length)|0;const span=Math.PI/TC_DEPTS.length;
  orbs.push({a:-Math.PI+i*span+span*(.2+Math.random()*.6),r:.22,g:trust[TC_DEPTS[i].id],tier:Math.random()<.7?'green':'amber'})}
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
draw();return()=>cancelAnimationFrame(raf)},[trust]);
return <div className="card" style={{overflow:'hidden'}}>
<div className="hd"><div><h3>Trust Compass</h3><div className="sub">{auto}% autopilot across ten departments</div></div><Ic.shield size={17} style={{color:'var(--ink-3)'}}/></div>
<canvas ref={ref} style={{display:'block',width:'100%',height:120}}/>
<div className="row" style={{padding:'12px 20px',gap:16,borderTop:'1px solid var(--line-soft)'}}>
{[['Autopilot',tot[0],'var(--ok)'],['Drafts for you',tot[1],'var(--warn)'],['Your call',tot[2],'var(--bad)']].map(([k,v,c],i)=>
<div key={i}><div className="eyebrow" style={{fontSize:9.5}}>{k}</div><div style={{fontSize:19,fontWeight:600,marginTop:2,color:c}}>{v}</div></div>)}</div>
<div style={{padding:'12px 20px',borderTop:'1px solid var(--line-soft)'}}>
<button className="btn btn-s" style={{width:'100%',justifyContent:'center'}} onClick={()=>go&&go('compass')}>Open Trust Compass <Ic.arrow size={14}/></button></div></div>};

const TcApprove=({onClose,onDone})=>(<><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(10,8,24,.62)',backdropFilter:'blur(4px)',zIndex:90}}/>
<div className="fade-in card" style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(600px,95vw)',maxHeight:'90vh',overflow:'auto',zIndex:91,borderRadius:'var(--r-xl)',boxShadow:'var(--sh-3)'}}>
<div className="hd"><div><div className="row" style={{gap:8}}><span className="pill pill-warn"><span className="dot"/>Waiting on you</span>
<span className="pill pill-n">{TC_DRAFT.dept} · {TC_DRAFT.type}</span></div>
<h3 style={{marginTop:8}}>{TC_DRAFT.subj}</h3></div>
<button className="btn btn-s" onClick={onClose} style={{width:28,height:28,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.x size={13}/></button></div>
<div style={{padding:'16px 20px 20px',display:'grid',gap:14}}>
<div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{[['To',TC_DRAFT.to],['From',TC_DRAFT.from+' · your domain'],['Confidence',TC_DRAFT.conf+'%']].map(([k,v],i)=>
<div key={i} className="row" style={{gap:12,padding:'9px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="sub" style={{flex:'0 0 90px'}}>{k}</span><span className="grow trunc" style={{fontSize:12.9,fontWeight:500}}>{v}</span></div>)}</div>
<div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'14px 16px',fontSize:13.3,color:'var(--ink-2)',lineHeight:1.65,whiteSpace:'pre-wrap'}}>{TC_DRAFT.body}</div>
<div><div className="eyebrow">Why she drafted it</div><div style={{fontSize:13,color:'var(--ink-2)',marginTop:5,lineHeight:1.6}}>{TC_DRAFT.why}</div></div>
<MiniCompass dept="Marketing"/>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<button onClick={onDone} className="row" style={{gap:7,height:36,padding:'0 18px',borderRadius:10,background:'var(--gold-bright)',color:'#2A1C00',fontWeight:700,fontSize:13.4}}><Ic.check size={14}/>Approve & send</button>
<button className="btn">Edit</button><button className="btn" onClick={onClose}>Dismiss</button></div></div></div></>);

const TcEscalate=({onClose})=>(<><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(10,8,24,.62)',backdropFilter:'blur(4px)',zIndex:90}}/>
<div className="fade-in card" style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(580px,95vw)',maxHeight:'90vh',overflow:'auto',zIndex:91,borderRadius:'var(--r-xl)',boxShadow:'var(--sh-3)'}}>
<div className="hd"><div><div className="row" style={{gap:8}}><span className="pill pill-bad"><span className="dot"/>Your decision</span>
<span className="pill pill-n">{TC_ESC.dept} · {TC_ESC.type}</span></div>
<h3 style={{marginTop:8}}>She stopped and brought this to you</h3></div>
<button className="btn btn-s" onClick={onClose} style={{width:28,height:28,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.x size={13}/></button></div>
<div style={{padding:'16px 20px 20px',display:'grid',gap:14}}>
<div style={{fontSize:13.4,color:'var(--ink-2)',lineHeight:1.65}}>{TC_ESC.brief}</div>
<div style={{background:'var(--bad-tint)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'12px 14px',fontSize:13,color:'var(--ink-2)',lineHeight:1.6}}>
<strong style={{color:'var(--ink)'}}>Why she won't decide it: </strong>{TC_ESC.why}</div>
<div><div className="eyebrow">Options as she sees them</div>
<div style={{display:'grid',gap:8,marginTop:9}}>{TC_ESC.opts.map((o,i)=>
<label key={i} className="row" style={{gap:11,padding:'11px 13px',border:'1px solid '+(i===0?'var(--violet-line)':'var(--line)'),
background:i===0?'var(--violet-tint)':'transparent',borderRadius:'var(--r-m)',cursor:'pointer',alignItems:'flex-start'}}>
<span style={{width:15,height:15,borderRadius:'50%',border:'1.5px solid '+(i===0?'var(--violet)':'var(--line)'),flex:'none',marginTop:2,
display:'grid',placeItems:'center'}}>{i===0&&<span style={{width:7,height:7,borderRadius:'50%',background:'var(--violet)'}}/>}</span>
<span style={{fontSize:12.9,color:'var(--ink-2)',lineHeight:1.5}}>{o}{i===0&&<span className="pill pill-v" style={{marginLeft:8}}>She recommends</span>}</span></label>)}</div></div>
<div className="sub">{TC_ESC.rec} Consult counsel for your specific situation.</div>
<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<button onClick={onClose} className="row" style={{gap:7,height:36,padding:'0 18px',borderRadius:10,background:'var(--gold-bright)',color:'#2A1C00',fontWeight:700,fontSize:13.4}}><Ic.check size={14}/>Decide and log</button>
<button className="btn">Hand back with guidance</button><button className="btn" onClick={onClose}>Later</button></div></div></div></>);

const TcDept=({id,onBack})=>{const d=TC_DEPTS.find(x=>x.id===id);const trust=useTrust();
const[subs,setSubs]=React.useState(()=>d.acts.map((_,i)=>Math.max(.14,Math.min(.92,d.g+(i%3-1)*.16))));
const line=[62,66,64,71,74,72,79,83,81,86,88,d.conf];
return <div className="fade-in" style={{display:'grid',gap:16}}>
<div className="card" style={{padding:'16px 20px'}}>
<div className="row" style={{gap:13,flexWrap:'wrap'}}>
<button className="btn btn-s" onClick={onBack}><span style={{transform:'rotate(180deg)',display:'flex'}}><Ic.arrow size={13}/></span>Full compass</button>
<span className="tile" style={{background:'var(--violet-tint)',color:'var(--violet)'}}>{React.createElement(Ic[d.ic],{size:16})}</span>
<div className="grow" style={{minWidth:200}}><div style={{fontWeight:600,fontSize:16,letterSpacing:'-.02em'}}>{d.n}</div>
<div className="sub">{d.w[0]} on autopilot · {d.w[1]} drafted for you · {d.w[2]} escalated, this week</div></div>
<span className="pill" style={{background:'var(--ok-tint)',color:'var(--ok)'}}>{d.conf}% avg confidence</span>
<span className={'pill '+(d.trend>0?'pill-ok':d.trend<0?'pill-warn':'pill-n')}>{d.trend>0?'+':''}{d.trend}% vs last week</span></div></div>
<div className="two-w">
<div className="card"><div className="hd"><div><h3>Autonomy by action type</h3><div className="sub">Set each one on its own. The department dial is their average.</div></div></div>
<div style={{padding:'14px 20px 18px',display:'grid',gap:16}}>{d.acts.map((a,i)=>{const g=subs[i];const t=g>=.6?'green':g>=.34?'amber':'red';
return <div key={a}><div className="row" style={{justifyContent:'space-between',marginBottom:7}}>
<span style={{fontSize:13.1,fontWeight:500}}>{a}</span>
<span style={{fontSize:11.5,fontWeight:600,color:t==='green'?'var(--ok)':t==='amber'?'var(--warn)':'var(--bad)'}}>{tierLabel[t]}</span></div>
<div style={{position:'relative',height:20,display:'flex',alignItems:'center'}}>
<div style={{position:'absolute',inset:'7px 0',borderRadius:99,overflow:'hidden',display:'flex'}}>
<span style={{width:(g*100)+'%',background:'var(--ok)',opacity:.5}}/><span style={{width:(TC_AMBER*100)+'%',background:'var(--warn)',opacity:.5}}/>
<span style={{flex:1,background:'var(--bad)',opacity:.42}}/></div>
<input className="tc-range" type="range" min="14" max="92" value={Math.round(g*100)} onChange={e=>setSubs(s=>s.map((x,j)=>j===i?+e.target.value/100:x))}
style={{position:'relative',width:'100%',appearance:'none',background:'transparent',height:20,margin:0}}/></div></div>})}</div></div>
<div style={{display:'grid',gap:16}}>
<div className="card"><div className="hd"><h3>Confidence, last 30 days</h3><span className="pill pill-ok">{d.conf}%</span></div>
<div style={{padding:'18px 20px'}}><svg viewBox="0 0 240 70" style={{width:'100%',height:74,overflow:'visible'}}>
<path d={line.map((v,i)=>(i?'L':'M')+(i*(240/(line.length-1)))+' '+(70-(v-55)/45*66)).join(' ')} fill="none" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round"/>
<circle cx="240" cy={70-(d.conf-55)/45*66} r="3.4" fill="var(--ok)"/></svg>
<div className="sub" style={{marginTop:6}}>She has been getting this department right more often, which is why the dial can move.</div></div></div>
<div className="card"><div className="hd"><h3>Last actions here</h3><button className="btn btn-s">Full history</button></div>
<div>{[['green','Ran it and logged it','2m ago'],['green','Ran it and logged it','18m ago'],['amber','Drafted, you approved','1h ago'],
['green','Ran it and logged it','3h ago'],['red','Escalated, you decided','1d ago'],['amber','Drafted, you edited first','1d ago']].map(([t,x,w],i)=>
<div key={i} className="row" style={{gap:11,padding:'11px 20px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',background:t==='green'?'var(--ok)':t==='amber'?'var(--warn)':'var(--bad)'}}/>
<span className="grow trunc" style={{fontSize:12.8}}>{d.acts[i%d.acts.length]} — {x}</span><span className="mono sub" style={{fontSize:11}}>{w}</span></div>)}</div></div></div></div></div>};

export const TrustCompass=()=>{
const trust=useTrust();
const[sel,setSel]=React.useState(null);
const[drag,setDrag]=React.useState(null);
const[preview,setPreview]=React.useState(null);
const[flow,setFlow]=React.useState(null);
const[toast,setToast]=React.useState(null);
const[full,setFull]=React.useState(null);
const[fold,setFold]=React.useState(null);
const tot=TC_DEPTS.reduce((a,d)=>[a[0]+d.w[0],a[1]+d.w[1],a[2]+d.w[2]],[0,0,0]);
const all=tot[0]+tot[1]+tot[2];
const auto=Math.round(tot[0]/all*100),dr=Math.round(tot[1]/all*100);
const onOrb=React.useCallback(o=>{setFlow(o.tier==='red'?'esc':o.tier==='amber'?'appr':null);
 if(o.tier==='green'){setToast(o.label);setTimeout(()=>setToast(null),2600)}},[]);
if(full)return <Wrap><PageHead eyebrow="Platform · Trust Compass" title={TC_DEPTS.find(d=>d.id===full).n} sub="Every action type in this department, with its own dial."/>
<TcDept id={full} onBack={()=>setFull(null)}/></Wrap>;
return <div className="fade-in pg" style={{width:'100%',maxWidth:1440,margin:'0 auto'}}>
<PageHead eyebrow="Platform" title="Trust Compass"
sub={all+' actions this week. Drag a boundary to change what she does alone.'}
right={<div className="row" style={{gap:8}}>
<span className="pill pill-ok"><span className="dot"/>{auto}% autopilot</span>
<span className="pill pill-warn">{dr}% drafts</span>
<span className="pill pill-bad">{100-auto-dr}% escalated</span></div>}/>
<div className="pg-fill tc-grid">
<div className="card" style={{overflow:'hidden',borderRadius:'var(--r-xl)',position:'relative',minHeight:260,background:'#0A0818',borderColor:'#241F49'}}>
<TcCanvas sel={sel} setSel={setSel} onOrb={onOrb} drag={drag} setDrag={setDrag} setPreview={setPreview}/>
<div style={{position:'absolute',top:16,left:18,right:18,display:'flex',gap:12,justifyContent:'space-between',pointerEvents:'none'}}>
<div><div style={{fontSize:10.5,letterSpacing:'.26em',color:'rgba(255,255,255,.55)',fontWeight:600}}>WHAT SHE IS ALLOWED TO DO</div>
<div style={{color:'#fff',fontSize:19,fontWeight:600,letterSpacing:'-.03em',marginTop:4}}>{sel?TC_DEPTS.find(d=>d.id===sel).n:'Ten departments'}</div>
<div style={{color:'rgba(255,255,255,.6)',fontSize:12.4,marginTop:3}}>{all} actions this week · {auto}% she handled alone</div></div>
<div style={{display:'grid',gap:6,justifyItems:'end',pointerEvents:'auto'}}>
<span className="row" style={{gap:7,height:26,padding:'0 11px',borderRadius:99,background:'rgba(76,196,140,.16)',color:'#4CC48C',fontSize:11.5,fontWeight:600}}>
<span className="dot"/>Live · she is working now</span>
<span style={{color:'rgba(255,255,255,.45)',fontSize:11}}>Drag a ring to change autonomy · click a segment to drill in · click an orb</span>
{sel&&<button onClick={()=>setFull(sel)} className="row" style={{gap:6,height:28,padding:'0 12px',borderRadius:99,background:'rgba(255,255,255,.1)',color:'#fff',fontSize:11.8,fontWeight:600}}>
Open {TC_DEPTS.find(d=>d.id===sel).n}<Ic.arrow size={12}/></button>}</div></div>

{preview&&<div style={{position:'absolute',left:'50%',bottom:74,transform:'translateX(-50%)',background:'rgba(10,8,24,.92)',border:'1px solid rgba(255,255,255,.16)',
borderRadius:12,padding:'10px 14px',pointerEvents:'none',textAlign:'center',maxWidth:'86%'}}>
<div style={{color:'#fff',fontSize:12.6,fontWeight:600}}>{preview.n} · {tierLabel[preview.g>=.6?'green':preview.g>=.34?'amber':'red']}</div>
<div style={{color:'rgba(255,255,255,.66)',fontSize:11.6,marginTop:3}}>At this setting she would have handled {preview.auto} of {preview.tot} actions this week without asking.</div></div>}

<div style={{position:'absolute',left:18,right:18,bottom:14,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',pointerEvents:'none'}}>
{[['Autopilot','#4CC48C'],['Drafts for you','#E3A63C'],['Your call','#EE7A72']].map(([l,c])=>
<span key={l} className="row" style={{gap:7,height:26,padding:'0 11px',borderRadius:99,background:'rgba(255,255,255,.05)',color:'rgba(255,255,255,.76)',fontSize:11.4}}>
<span style={{width:7,height:7,borderRadius:'50%',background:c}}/>{l}</span>)}
<span className="mono" style={{marginLeft:'auto',color:'rgba(255,255,255,.5)',fontSize:11}}>Today · {tot[0]} performed · {tot[1]} for you · {tot[2]} escalated</span></div></div>

<div className="tc-rail">
<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Working now</h3><div className="sub">The last few minutes, as they happened</div></div>
<span className="pill pill-ok"><span className="dot"/>Live</span></div>
<div className="pane" style={{flex:1}}>{TC_LIVE.map((l,i)=>{const d=TC_DEPTS.find(x=>x.id===l.d);
return <button key={i} onClick={()=>setFlow(l.tier==='red'?'esc':l.tier==='amber'?'appr':null)} className="row"
style={{width:'100%',textAlign:'left',gap:11,padding:'11px 20px',borderTop:i?'1px solid var(--line-soft)':'0',alignItems:'flex-start'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',marginTop:5,
background:l.tier==='green'?'var(--ok)':l.tier==='amber'?'var(--warn)':'var(--bad)'}}/>
<span className="grow" style={{minWidth:0}}><span style={{fontSize:12.9,color:'var(--ink-2)',lineHeight:1.45,display:'block'}}>{l.t}</span>
<span className="sub" style={{fontSize:11.3}}>{d.n} · {l.tier==='green'?'performed and logged':l.tier==='amber'?'waiting on you':'your decision'}</span></span>
<span className="mono sub" style={{fontSize:10.8,flex:'none'}}>{l.w}</span></button>})}</div></div>

<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('growth')}><Ic.trend size={14}/>Trust growth · +14%</button>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('depts')}><Ic.grid size={14}/>By department</button></div></div>

<div className="tc-railbtn row" style={{gap:9,flexWrap:'wrap'}}>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('live')}><span className="dot" style={{color:'var(--ok)'}}/>Working now · {TC_LIVE.length}</button>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('growth')}><Ic.trend size={14}/>+14%</button>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('depts')}><Ic.grid size={14}/>By department</button></div>

<Foldout open={fold==='live'} onClose={()=>setFold(null)} title="Working now" sub="The last few minutes, as they happened">
<div>{TC_LIVE.map((l,i)=>{const d=TC_DEPTS.find(x=>x.id===l.d);
return <button key={i} onClick={()=>{setFold(null);setFlow(l.tier==='red'?'esc':l.tier==='amber'?'appr':null)}} className="row"
style={{width:'100%',textAlign:'left',gap:11,padding:'11px 20px',borderTop:i?'1px solid var(--line-soft)':'0',alignItems:'flex-start'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',marginTop:5,background:l.tier==='green'?'var(--ok)':l.tier==='amber'?'var(--warn)':'var(--bad)'}}/>
<span className="grow" style={{minWidth:0}}><span style={{fontSize:12.9,color:'var(--ink-2)',lineHeight:1.45,display:'block'}}>{l.t}</span>
<span className="sub" style={{fontSize:11.3}}>{d.n} · {l.tier==='green'?'performed and logged':l.tier==='amber'?'waiting on you':'your decision'}</span></span>
<span className="mono sub" style={{fontSize:10.8,flex:'none'}}>{l.w}</span></button>})}</div></Foldout>

<Foldout open={fold==='growth'} onClose={()=>setFold(null)} title="Your trust has grown 14% in 30 days" sub="Four departments moved outward. None moved back.">
<div style={{padding:'16px 20px 20px'}}>
<div className="card" style={{padding:'16px 18px',boxShadow:'none'}}>
<div className="row" style={{gap:9}}><span className="tile" style={{width:30,height:30,borderRadius:'50%',background:'var(--ok-tint)',color:'var(--ok)'}}><Ic.trend size={15}/></span>
<div className="grow"><div style={{fontSize:13.4,fontWeight:600}}>Thirty-day trajectory</div>
<div className="sub" style={{marginTop:2}}>Every outward move you made, and none reversed.</div></div></div>
<div className="row" style={{gap:4,marginTop:14,alignItems:'flex-end',height:44}}>{[38,44,41,52,49,58,55,64,62,71,68,74,79,86].map((h,i)=>
<span key={i} style={{flex:1,height:h+'%',borderRadius:'3px 3px 1px 1px',background:i>10?'var(--ok)':'var(--violet)',opacity:i>10?1:.3+i*.045}}/>)}</div>
<div className="row" style={{justifyContent:'space-between',marginTop:6}}><span className="sub" style={{fontSize:10.5}}>14 days ago</span><span className="sub" style={{fontSize:10.5}}>Today</span></div></div></div></Foldout>

<Foldout open={fold==='depts'} onClose={()=>setFold(null)} title="This week, by department" sub="Autopilot / drafted / escalated — click one to open its dials.">
<div>{TC_DEPTS.map((d,i)=>{const t=deptTier(d.id);
return <button key={d.id} onClick={()=>setFull(d.id)} onMouseEnter={()=>setSel(d.id)} onMouseLeave={()=>setSel(null)} className="row"
style={{width:'100%',textAlign:'left',gap:11,padding:'10px 20px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',background:t==='green'?'var(--ok)':t==='amber'?'var(--warn)':'var(--bad)'}}/>
<span className="grow trunc" style={{fontSize:12.9,fontWeight:500}}>{d.n}</span>
<span className="mono sub" style={{fontSize:11}}>{d.w[0]}/{d.w[1]}/{d.w[2]}</span>
<span className="pill pill-n" style={{fontSize:10}}>{tierLabel[t]}</span></button>})}</div></Foldout></div>

{flow==='appr'&&<TcApprove onClose={()=>setFlow(null)} onDone={()=>{setFlow(null);setToast('Sent. That one raced through — she logged it under Marketing.');setTimeout(()=>setToast(null),3400)}}/>}
{flow==='esc'&&<TcEscalate onClose={()=>setFlow(null)}/>}
{toast&&<div className="fade-in row" style={{position:'fixed',bottom:26,left:'50%',transform:'translateX(-50%)',gap:9,background:'var(--rail)',color:'var(--ink-inv)',
padding:'11px 18px',borderRadius:12,fontSize:13,boxShadow:'var(--sh-3)',zIndex:95,maxWidth:'min(560px,92vw)'}}>
<span style={{color:'var(--gold-bright)',display:'flex',flex:'none'}}><Ic.check size={15}/></span>{toast}</div>}
</div>};
