// @ts-nocheck
import React from "react";
import { Ic, Foldout, Wrap } from "./_shared";
import { SC_CHECKS, scCol, ScDrawer } from "./systems";

const SHM_CLUSTERS=[
 {k:'infra',n:'Infrastructure',c:'#4CC48C',p:[0,.82,.15]},
 {k:'mkt',n:'Marketing & tracking',c:'#8A72F5',p:[-.86,.10,.30]},
 {k:'forms',n:'Forms & booking',c:'#3FA6B8',p:[.84,-.14,.42]},
 {k:'comms',n:'Comms & deliverability',c:'#F2C97A',p:[-.30,-.76,.36]},
 {k:'pay',n:'Payments & ops',c:'#E88A80',p:[.26,.28,-.88]},
 {k:'data',n:'Data quality',c:'#C9C4E0',p:[-.24,-.30,-.90]}];
const SHM_LINKS=[[7,8],[8,10],[7,10],[13,14],[14,15],[15,16],[1,2],[2,3],[4,5],[5,6],[11,12],[6,7],[3,2],[12,11],[13,15]];

const HealthMap=({checks,sel,setSel,onNode,setHover})=>{
const wrap=React.useRef(null),cvr=React.useRef(null),S=React.useRef({});
React.useEffect(()=>{S.current.checks=checks;S.current.sel=sel},[checks,sel]);
React.useEffect(()=>{
const cv=cvr.current,ctx=cv.getContext('2d');
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let rng=(x=>()=>((x=x*16807%2147483647)/2147483647))(4231);
const nodes=SC_CHECKS.map((c,i)=>{const cl=SHM_CLUSTERS.find(x=>x.k===c.d);
 const j=()=>(rng()-.5)*.46;
 return{id:c.id,k:c.d,c:cl.c,x:cl.p[0]*.78+j(),y:cl.p[1]*.78+j(),z:cl.p[2]*.78+j(),ph:rng()*6.28,scanAt:-999}});
const nOf=id=>nodes.find(n=>n.id===id);
const s=S.current;Object.assign(s,{yaw:.44,pitch:-.14,vy:.0013,zoom:1,mx:-999,my:-999,drag:null,hot:null,t:0,ripple:[]});
let W=0,H=0,dpr=Math.min(devicePixelRatio||1,2),raf;
const size=()=>{const r=wrap.current.getBoundingClientRect();W=r.width;H=r.height;cv.width=W*dpr;cv.height=H*dpr;
 cv.style.width=W+'px';cv.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0)};
const ro=new ResizeObserver(size);ro.observe(wrap.current);size();
const hexA=(h,a)=>{const n=parseInt(h.slice(1),16);return `rgba(${n>>16},${(n>>8)&255},${n&255},${a})`};
const stCol=st=>st==='ok'?'#4CC48C':st==='warn'?'#E3A63C':'#EE7A72';
const draw=()=>{s.t++;if(!s.drag&&!reduce)s.yaw+=s.vy;
 const cx=W/2,cy=H/2,f=3.3,scale=Math.min(W,H)*.34*s.zoom;
 const cyw=Math.cos(s.yaw),syw=Math.sin(s.yaw),cp=Math.cos(s.pitch),sp=Math.sin(s.pitch);
 const cks=s.checks,seln=s.sel;
 for(const n of nodes){let x=n.x*cyw+n.z*syw,z=-n.x*syw+n.z*cyw,y=n.y*cp-z*sp;z=n.y*sp+z*cp;
  const p=f/(f-z);n.dep=(z+1.3)/2.6;n.pp=p;
  let px=cx+x*scale*p,py=cy+y*scale*p;
  const dx=px-s.mx,dy=py-s.my,dd=Math.hypot(dx,dy);
  if(dd<130){const kk=(1-dd/130)**2*18;px+=dx/(dd||1)*kk;py+=dy/(dd||1)*kk}
  n.sx=px;n.sy=py;n.st=(cks.find(c=>c.id===n.id)||{}).s||'ok'}
 ctx.clearRect(0,0,W,H);
 const bg=ctx.createRadialGradient(cx,cy*.9,12,cx,cy,Math.max(W,H)*.72);
 bg.addColorStop(0,'#181442');bg.addColorStop(.5,'#100D28');bg.addColorStop(1,'#070613');
 ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 if(!reduce&&s.t%150===0){const n=nodes[(Math.random()*nodes.length)|0];s.ripple.push({id:n.id,t:0})}
 ctx.globalCompositeOperation='lighter';
 for(const[a,b] of SHM_LINKS){const na=nOf(a),nb=nOf(b);if(!na||!nb)continue;
  const act=!seln||seln===na.k||seln===nb.k;
  const cascade=na.st!=='ok'&&nb.st!=='ok';
  const dep=(na.dep+nb.dep)/2;
  ctx.strokeStyle=cascade?hexA(stCol(na.st==='bad'||nb.st==='bad'?'bad':'warn'),(.30+dep*.34)*(act?1:.14))
   :`rgba(200,196,224,${(.05+dep*.11)*(act?1:.12)})`;
  ctx.lineWidth=cascade?1.5:.7;ctx.beginPath();ctx.moveTo(na.sx,na.sy);ctx.lineTo(nb.sx,nb.sy);ctx.stroke();
  if(cascade&&!reduce){const q=((s.t*.006)%1);const px=na.sx+(nb.sx-na.sx)*q,py=na.sy+(nb.sy-na.sy)*q;
   ctx.fillStyle=hexA(stCol('bad'),.8*(act?1:.14));ctx.beginPath();ctx.arc(px,py,2,0,6.283);ctx.fill()}}
 for(let i=s.ripple.length-1;i>=0;i--){const r=s.ripple[i];r.t+=reduce?1:.02;if(r.t>1){s.ripple.splice(i,1);continue}
  const n=nOf(r.id);if(!n)continue;ctx.strokeStyle=`rgba(138,114,245,${.5*(1-r.t)})`;ctx.lineWidth=1.4;
  ctx.beginPath();ctx.arc(n.sx,n.sy,8+r.t*46,0,6.283);ctx.stroke()}
 for(const n of nodes){const act=!seln||seln===n.k;const isHot=s.hot===n;
  const scanning=!reduce&&((s.t*.9+n.ph*20)%600)<70;
  const pu=.7+.3*Math.sin(s.t*.03+n.ph);
  const col=stCol(n.st);
  const r=(n.st==='ok'?3.4:4.4)*n.pp*(isHot?1.55:1)*(act?1:.75);
  const al=(.4+n.dep*.55)*(act?1:.16)*(isHot?1.35:1);
  ctx.fillStyle=hexA(col,.10*pu*(act?1:.15));ctx.beginPath();ctx.arc(n.sx,n.sy,r*(scanning?6.5:4.4),0,6.283);ctx.fill();
  ctx.fillStyle=hexA(col,Math.min(1,al));ctx.beginPath();ctx.arc(n.sx,n.sy,r,0,6.283);ctx.fill();
  ctx.fillStyle=`rgba(255,255,255,${.55*al})`;ctx.beginPath();ctx.arc(n.sx-r*.3,n.sy-r*.32,r*.4,0,6.283);ctx.fill();
  if(scanning){ctx.strokeStyle=hexA('#8A72F5',.5);ctx.lineWidth=1;ctx.beginPath();ctx.arc(n.sx,n.sy,r*3.2,0,6.283);ctx.stroke()}}
 ctx.globalCompositeOperation='source-over';
 SHM_CLUSTERS.forEach(cl=>{const ns=nodes.filter(n=>n.k===cl.k);if(!ns.length)return;
  if(seln&&seln!==cl.k)return;
  const mx=ns.reduce((a,n)=>a+n.sx,0)/ns.length,my=ns.reduce((a,n)=>a+n.sy,0)/ns.length;
  const md=ns.reduce((a,n)=>a+n.dep,0)/ns.length;
  const openN=ns.filter(n=>n.st!=='ok').length;const on=seln===cl.k;
  ctx.globalAlpha=on?1:.4+md*.34;
  ctx.strokeStyle=hexA(cl.c,.42);ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(mx,my);ctx.lineTo(mx+14,my-15);ctx.lineTo(mx+28,my-15);ctx.stroke();
  ctx.fillStyle=cl.c;ctx.beginPath();ctx.arc(mx,my,2.2,0,6.283);ctx.fill();
  ctx.font='600 11.5px Geist, sans-serif';ctx.fillStyle='rgba(255,255,255,.95)';
  ctx.fillText(cl.n,mx+33,my-11);
  ctx.font='500 10px "Geist Mono", monospace';
  ctx.fillStyle=openN?hexA(stCol('warn'),.95):hexA('#4CC48C',.9);
  ctx.fillText(ns.length+' checks · '+(openN?openN+' open':'all healthy'),mx+33,my+2);
  ctx.globalAlpha=1});
 let hot=null,hd=20;
 for(const n of nodes){const d=Math.hypot(n.sx-s.mx,n.sy-s.my);if(d<hd){hd=d;hot=n}}
 if(hot!==s.hot){s.hot=hot;setHover(hot?{id:hot.id,x:hot.sx,y:hot.sy,k:hot.k}:null)}
 raf=requestAnimationFrame(draw)};
raf=requestAnimationFrame(draw);
const rect=()=>cv.getBoundingClientRect();
const mv=e=>{const r=rect();s.mx=e.clientX-r.left;s.my=e.clientY-r.top;
 if(s.drag){s.yaw+=(s.mx-s.drag.x)*.006;s.pitch=Math.max(-1.05,Math.min(1.05,s.pitch+(s.my-s.drag.y)*.005));s.drag={x:s.mx,y:s.my};s.moved=true}
 cv.style.cursor=s.drag?'grabbing':s.hot?'pointer':'grab'};
const dn=e=>{const r=rect();s.drag={x:e.clientX-r.left,y:e.clientY-r.top};s.moved=false};
const up=()=>{s.drag=null;cv.style.cursor='grab'};
const cl=()=>{if(s.moved)return;if(s.hot)onNode(s.hot.id)};
const lv=()=>{s.mx=-999;s.my=-999;s.drag=null};
const wh=e=>{e.preventDefault();s.zoom=Math.max(.7,Math.min(2.2,s.zoom*(e.deltaY>0?.94:1.06)))};
cv.addEventListener('mousemove',mv);cv.addEventListener('mousedown',dn);window.addEventListener('mouseup',up);
cv.addEventListener('click',cl);cv.addEventListener('mouseleave',lv);cv.addEventListener('wheel',wh,{passive:false});
return()=>{cancelAnimationFrame(raf);ro.disconnect();cv.removeEventListener('mousemove',mv);cv.removeEventListener('mousedown',dn);
 window.removeEventListener('mouseup',up);cv.removeEventListener('click',cl);cv.removeEventListener('mouseleave',lv);cv.removeEventListener('wheel',wh)}},[onNode,setHover]);
return <div ref={wrap} style={{position:'absolute',inset:0}}><canvas ref={cvr} style={{display:'block',cursor:'grab'}}/></div>};

const SystemsHealthMap=({embed})=>{
const[checks,setChecks]=React.useState(SC_CHECKS);
const[sel,setSel]=React.useState(null);
const[open,setOpen]=React.useState(null);
const[hover,setHover]=React.useState(null);
// `useTrust()` was called here and its result never read — a dead subscription to the compass
// fixture, removed rather than repointed at the real read it does not use.
const[toast,setToast]=React.useState(null);
const[fold,setFold]=React.useState(null);
const onNode=React.useCallback(id=>setOpen(SC_CHECKS.find(c=>c.id===id)),[]);
const onFix=c=>{setChecks(cs=>cs.map(x=>x.id===c.id?{...x,s:'ok',m:'Fixed just now',fix:null,found:'Paige applied the fix and re-ran the check. Passing.'}:x));
 setToast('Applied the '+c.n.toLowerCase()+' fix. The node is green and the cascade cleared.');setTimeout(()=>setToast(null),3600)};
const open_=checks.filter(c=>c.s!=='ok');
const hoverC=hover&&checks.find(c=>c.id===hover.id);
const catOf=k=>SHM_CLUSTERS.find(c=>c.k===k);
const body=<>
{!embed&&<div className="row" style={{alignItems:'flex-end',gap:20,flexWrap:'wrap',marginBottom:16}}>
<div className="grow"><div className="eyebrow">Platform</div>
<div className="row" style={{gap:12,alignItems:'baseline',marginTop:4}}>
<h1 style={{fontSize:26,letterSpacing:'-.034em'}}>Systems Health Map</h1>
<span className="mono sub">16 of 30 checks live · {open_.length} open findings</span></div>
<p style={{color:'var(--ink-2)',fontSize:14,marginTop:5,maxWidth:640}}>Every system Paige watches, and how they depend on each other. When one thing breaks, you can see what it takes down with it.</p></div>
<div className="row" style={{gap:9}}>
<span className="pill pill-ok"><span className="dot"/>{checks.filter(c=>c.s==='ok').length} healthy</span>
<span className="pill pill-warn">{checks.filter(c=>c.s==='warn').length} warning</span>
<span className="pill pill-bad">{checks.filter(c=>c.s==='bad').length} critical</span></div></div>}

<div className={embed?'pg-fill tc-grid':'two-w'} style={embed?null:{alignItems:'stretch'}}>
<div className="card" style={{overflow:'hidden',borderRadius:'var(--r-xl)',position:'relative',minHeight:embed?200:560,background:'#0A0818',borderColor:'#241F49'}}>
<HealthMap checks={checks} sel={sel} setSel={setSel} onNode={onNode} setHover={setHover}/>
<div style={{position:'absolute',top:16,left:18,right:18,display:'flex',gap:12,justifyContent:'space-between',pointerEvents:'none'}}>
<div><div style={{fontSize:10.5,letterSpacing:'.26em',color:'rgba(255,255,255,.55)',fontWeight:600}}>WHAT SHE IS WATCHING</div>
<div style={{color:'#fff',fontSize:19,fontWeight:600,letterSpacing:'-.03em',marginTop:4}}>{sel?catOf(sel).n:'Your operation'}</div>
<div style={{color:'rgba(255,255,255,.6)',fontSize:12.4,marginTop:3}}>Six clusters · 16 checks running · {open_.length} findings surfaced this hour</div></div>
<div style={{display:'grid',gap:6,justifyItems:'end'}}>
<span className="row" style={{gap:7,height:26,padding:'0 11px',borderRadius:99,background:'rgba(76,196,140,.16)',color:'#4CC48C',fontSize:11.5,fontWeight:600}}>
<span className="dot"/>Scanning continuously</span>
<span style={{color:'rgba(255,255,255,.45)',fontSize:11}}>Drag to rotate · scroll to zoom · click a node</span></div></div>

{hover&&hoverC&&<div style={{position:'absolute',left:Math.max(12,hover.x+16),top:Math.max(12,hover.y-12),pointerEvents:'none',
background:'rgba(10,8,24,.92)',border:'1px solid '+(hoverC.s==='ok'?'#4CC48C':hoverC.s==='warn'?'#E3A63C':'#EE7A72')+'66',borderRadius:10,padding:'8px 12px',maxWidth:250}}>
<div className="row" style={{gap:7}}><span style={{width:7,height:7,borderRadius:'50%',flex:'none',background:hoverC.s==='ok'?'#4CC48C':hoverC.s==='warn'?'#E3A63C':'#EE7A72'}}/>
<span style={{color:'#fff',fontSize:12,fontWeight:600}}>{hoverC.n}</span></div>
<div style={{color:'rgba(255,255,255,.62)',fontSize:10.8,marginTop:3}}>{hoverC.m} · last scan 14m ago</div>
<div style={{color:'rgba(255,255,255,.42)',fontSize:10.4,marginTop:2}}>Click to open the finding</div></div>}

<div style={{position:'absolute',left:18,right:18,bottom:14,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
{SHM_CLUSTERS.map(c=>{const on=sel===c.k;const openN=checks.filter(x=>x.d===c.k&&x.s!=='ok').length;
return <button key={c.k} onClick={()=>setSel(on?null:c.k)} className="row" style={{gap:7,height:28,padding:'0 11px',borderRadius:99,
border:'1px solid '+(on?c.c:'rgba(255,255,255,.16)'),background:on?c.c+'22':'rgba(255,255,255,.05)',
color:on?'#fff':'rgba(255,255,255,.72)',fontSize:11.6,fontWeight:on?600:450}}>
<span style={{width:7,height:7,borderRadius:'50%',background:c.c}}/>{c.n}
{openN>0&&<span className="mono" style={{fontSize:10,color:'#E3A63C'}}>{openN}</span>}</button>})}
{sel&&<button onClick={()=>setSel(null)} className="row" style={{gap:6,height:28,padding:'0 11px',borderRadius:99,color:'rgba(255,255,255,.6)',fontSize:11.6}}><Ic.x size={12}/>Clear</button>}</div></div>

<div className="tc-rail">
<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Open findings</h3><div className="sub">Ranked by what it costs you to leave alone</div></div>
<span className="pill pill-warn">{open_.length}</span></div>
<div className="pane" style={{flex:1}}>{open_.sort((a,b)=>({bad:0,warn:1})[a.s]-({bad:0,warn:1})[b.s]).map((c,i)=>
<button key={c.id} onClick={()=>setOpen(c)} onMouseEnter={()=>setSel(c.d)} onMouseLeave={()=>setSel(null)} className="row"
style={{width:'100%',textAlign:'left',gap:11,padding:'11px 20px',borderTop:i?'1px solid var(--line-soft)':'0',alignItems:'flex-start'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',marginTop:5,background:scCol(c.s)}}/>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:12.9,fontWeight:600,display:'block'}}>{c.n}</span>
<span className="sub trunc" style={{display:'block'}}>{c.m}</span></span>
{c.fix&&<span className="pill pill-v" style={{flex:'none'}}><Ic.spark size={10}/>Fix ready</span>}</button>)}
{!open_.length&&<div style={{padding:'40px 20px',textAlign:'center'}}>
<div className="tile" style={{margin:'0 auto 10px',width:38,height:38,borderRadius:13,background:'var(--ok-tint)',color:'var(--ok)'}}><Ic.check size={18}/></div>
<div style={{fontWeight:600,fontSize:14}}>All systems healthy</div><div className="sub">Next scan in 22 minutes.</div></div>}</div></div>

<div className="row" style={{gap:9,flexWrap:'wrap'}}>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('cause')}><Ic.pulse size={14}/>One break, three symptoms</button>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('cluster')}><Ic.grid size={14}/>Cluster health</button></div></div>

<div className="tc-railbtn row" style={{gap:9,flexWrap:'wrap'}}>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('open')}><span className="dot" style={{color:'var(--warn)'}}/>Findings · {open_.length}</button>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('cause')}><Ic.pulse size={14}/>Root cause</button>
<button className="btn btn-s grow" style={{justifyContent:'center'}} onClick={()=>setFold('cluster')}><Ic.grid size={14}/>Clusters</button></div>

<Foldout open={fold==='open'} onClose={()=>setFold(null)} title="Open findings" sub="Ranked by what it costs you to leave alone">
<div>{open_.map((c,i)=><button key={c.id} onClick={()=>{setFold(null);setOpen(c)}} className="row"
style={{width:'100%',textAlign:'left',gap:11,padding:'11px 20px',borderTop:i?'1px solid var(--line-soft)':'0',alignItems:'flex-start'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',marginTop:5,background:scCol(c.s)}}/>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:12.9,fontWeight:600,display:'block'}}>{c.n}</span>
<span className="sub trunc" style={{display:'block'}}>{c.m}</span></span>
{c.fix&&<span className="pill pill-v" style={{flex:'none'}}><Ic.spark size={10}/>Fix ready</span>}</button>)}</div></Foldout>

<Foldout open={fold==='cause'} onClose={()=>setFold(null)} title="One break, three symptoms" sub="Follow the bright links out of the pixel node.">
<div style={{padding:'16px 20px 20px'}}>
<div style={{fontSize:13.4,color:'var(--ink-2)',lineHeight:1.65}}>The pixel came off /book-a-call, which stopped the GA4 call_booked event, which is why your UTM rows disagree with your ad reporting. Three findings, one fix.</div>
<button className="btn btn-s btn-p" style={{marginTop:14}} onClick={()=>{setFold(null);setOpen(checks.find(c=>c.id===7))}}>Open the root cause <Ic.arrow size={13}/></button></div></Foldout>

<Foldout open={fold==='cluster'} onClose={()=>setFold(null)} title="Cluster health" sub="Six clusters, sixteen checks">
<div>{SHM_CLUSTERS.map((cl,i)=>{const ns=checks.filter(c=>c.d===cl.k);const openN=ns.filter(c=>c.s!=='ok').length;
return <button key={cl.k} onClick={()=>{setSel(sel===cl.k?null:cl.k);setFold(null)}} className="row" style={{width:'100%',textAlign:'left',gap:11,padding:'11px 20px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',background:cl.c}}/>
<span className="grow trunc" style={{fontSize:12.9,fontWeight:500}}>{cl.n}</span>
<span className="mono sub" style={{fontSize:11}}>{ns.length} checks</span>
<span className={'pill '+(openN?'pill-warn':'pill-ok')} style={{fontSize:10}}>{openN?openN+' open':'healthy'}</span></button>})}</div></Foldout></div>

{open&&<ScDrawer c={open} onClose={()=>setOpen(null)} onFix={onFix} onOpen={setOpen}/>}
{toast&&<div className="fade-in row" style={{position:'fixed',bottom:26,left:'50%',transform:'translateX(-50%)',gap:9,background:'var(--rail)',color:'var(--ink-inv)',
padding:'11px 18px',borderRadius:12,fontSize:13,boxShadow:'var(--sh-3)',zIndex:95,maxWidth:'min(560px,92vw)'}}>
<span style={{color:'var(--gold-bright)',display:'flex',flex:'none'}}><Ic.check size={15}/></span>{toast}</div>}
</>;
return embed?body:<Wrap>{body}</Wrap>};
export {SystemsHealthMap,SHM_CLUSTERS};
