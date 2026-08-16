// @ts-nocheck
import React from "react";
import { Ic } from "./_shared";

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
React.useEffect(()=>{const cv=ref.current;if(!cv)return;const ctx=cv.getContext('2d');const dpr=Math.min(devicePixelRatio||1,2);
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

// Screen alias: the ported pack supplies the dashboard tile; the Solo shell mounts it as the Trust Compass screen (no new markup — real symbol exposed under the shell's expected name).
export const TrustCompass=CompassTile;
