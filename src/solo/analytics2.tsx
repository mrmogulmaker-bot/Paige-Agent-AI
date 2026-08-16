// @ts-nocheck
import React from "react";
import { Ic, Avatar, Foldout, PeekCard, SubTabs, Wrap, PageHead } from "./_shared";
import { AN } from "./analytics-data";
import { MW, MarketWatch, AttrDrawer, BranchTree, XInsights, WeeklyExec } from "./market";

const money=n=>'$'+n.toLocaleString();
const Ring=({v,tone})=>{const r=15,c=2*Math.PI*r,off=c-(Math.min(v,100)/100)*c;
return <svg width="38" height="38" viewBox="0 0 38 38"><circle cx="19" cy="19" r={r} fill="none" stroke="var(--surface-sunk)" strokeWidth="4"/>
<circle cx="19" cy="19" r={r} fill="none" stroke={tone} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 19 19)"/></svg>};

const Pacing=({onAttr})=>{const tone=v=>v==='behind'?'var(--warn)':v==='risk'?'var(--bad)':'var(--ok)';
return <div className="g4">{AN.pacing.map((p,i)=>{const pct=Math.round(p.now/p.goal*100);
return <div key={i} className="card" style={{padding:'11px 13px',display:'flex',flexDirection:'column',gap:7,minWidth:0}}>
<div className="row" style={{alignItems:'flex-start',gap:9}}>
<div className="grow" style={{minWidth:0}}><div className="eyebrow trunc" style={{fontSize:9.5}}>{p.k}</div>
<div className="row" style={{gap:6,alignItems:'baseline',marginTop:2}}>
<span style={{fontSize:19,fontWeight:600,letterSpacing:'-.03em'}}>{p.unit==='$'?money(p.now):p.now+p.unit}</span>
<span className="mono sub" style={{fontSize:10.8}}>of {p.unit==='$'?money(p.goal):p.goal+p.unit}</span></div></div>
<Ring v={pct} tone={tone(p.verdict)}/></div>
<div className="an-note" style={{fontSize:11.8,color:'var(--ink-2)',lineHeight:1.4,flex:1}}>{p.note}</div>
<div className="row" style={{gap:6}}><button className="btn btn-s" style={{height:26,fontSize:11.6}}><Ic.spark size={11}/>{p.act}</button>
<button className="btn btn-s" title="Why this number" onClick={()=>onAttr(p.k)} style={{height:26,width:26,padding:0,justifyContent:'center'}}><Ic.chart size={12}/></button></div></div>})}</div>};

const ChangeFull=({c,col})=>(<div style={{padding:'15px 18px',display:'grid',gap:11}}>
<div className="row" style={{justifyContent:'space-between',gap:10}}><span className="mono" style={{fontSize:11.5,fontWeight:600,color:col}}>{c.impact}</span><span className="sub">Aug 8–13</span></div>
<div style={{fontSize:13.4,color:'var(--ink-2)',lineHeight:1.6}}>{c.cause}</div>
<div style={{padding:'13px 15px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:11,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige's fix</div>
<div style={{fontSize:13,color:'var(--ink-2)',marginTop:6,lineHeight:1.55}}>{c.fix}</div>
<div className="row" style={{gap:8,marginTop:12}}><button className="btn btn-s btn-p"><Ic.check size={12}/>Approve</button><button className="btn btn-s">Dismiss</button></div></div></div>);

const Changed=()=>(<div className="g3" style={{minHeight:0}}>{AN.changes.map((c,i)=>{
const col=c.tone==='bad'?'var(--bad)':c.tone==='warn'?'var(--warn)':'var(--ok)';
return <PeekCard key={i} title={c.t} sub={c.impact+' · Aug 8–13'} foldTitle={c.t}
peek={<div style={{padding:'10px 16px 14px'}}>
<div className="an-clamp" style={{fontSize:12.2,color:'var(--ink-2)',lineHeight:1.45}}>{c.cause}</div>
<div className="row" style={{gap:7,marginTop:10}}><button className="btn btn-s btn-p" style={{height:26,fontSize:11.6}}><Ic.check size={11}/>Approve fix</button>
<button className="btn btn-s" style={{height:26,fontSize:11.6}}>Dismiss</button></div></div>}>
<ChangeFull c={c} col={col}/></PeekCard>})}</div>);

const CashChart=()=>{const{cash:C}=AN;const w=560,h=180,all=[...C.in,...C.fcHi],mx=Math.max(...all)*1.08;
const x=i=>i*(w/(C.mo.length+C.fcMo.length-2)),y=v=>h-(v/mx)*h;
const line=a=>a.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
const off=C.mo.length-1;const fx=i=>x(off+i);
const band=C.fcHi.map((v,i)=>(i?'L':'M')+fx(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ')+' '+C.fcLo.slice().reverse().map((v,i)=>'L'+fx(C.fcLo.length-1-i).toFixed(1)+' '+y(v).toFixed(1)).join(' ')+'Z';
return <div className="card"><div className="hd"><div><h3>Cash in, cash out, and where it lands</h3><div className="sub">Actuals through August, then modeled with a confidence band</div></div>
<div className="row" style={{gap:12,fontSize:11.5,color:'var(--ink-2)'}}>
<span className="row" style={{gap:5}}><span style={{width:9,height:2,background:'var(--violet)'}}/>In</span>
<span className="row" style={{gap:5}}><span style={{width:9,height:2,background:'var(--ink-3)'}}/>Out</span>
<span className="row" style={{gap:5}}><span style={{width:9,height:8,background:'var(--gold-line)',borderRadius:2}}/>Forecast</span></div></div>
<div style={{padding:'20px 20px 12px'}}>
<svg viewBox={'-6 -10 '+(w+14)+' '+(h+34)} style={{width:'100%',height:210,overflow:'visible'}}>
{[0,.25,.5,.75,1].map(g=><line key={g} x1="0" x2={w} y1={h*g} y2={h*g} stroke="var(--line-soft)" strokeWidth="1"/>)}
<path d={band} fill="var(--gold)" opacity=".16"/>
<path d={C.fc.map((v,i)=>(i?'L':'M')+fx(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ')} fill="none" stroke="var(--gold)" strokeWidth="2" strokeDasharray="5 4"/>
<path d={line(C.in)} fill="none" stroke="var(--violet)" strokeWidth="2.4" strokeLinecap="round"/>
<path d={line(C.out)} fill="none" stroke="var(--ink-3)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="0"/>
{[...C.mo,...C.fcMo.slice(1)].map((m,i)=><text key={i} x={x(i)} y={h+20} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--mono)">{m}</text>)}
<circle cx={x(off)} cy={y(C.in[off])} r="3.4" fill="var(--violet)"/></svg>
<div style={{marginTop:10,padding:'12px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',fontSize:13,color:'var(--ink-2)',lineHeight:1.55}}>
<span style={{color:'var(--ink)',fontWeight:600}}>The read: </span>costs are growing slower than revenue, so margin is widening — but November's range is wide ($24.6k–$31.2k) because two of the four deals carrying it are single-source referrals. If either slips, you land near the floor.</div></div></div>};

const Aging=()=>{const t=AN.aging.reduce((s,a)=>s+a.v,0);
return <div className="card"><div className="hd"><div><h3>Who owes you</h3><div className="sub">{money(t)} outstanding</div></div><span className="pill pill-warn"><span className="dot"/>{money(4180)} late</span></div>
<div style={{padding:'14px 20px 18px',display:'grid',gap:11}}>{AN.aging.map((a,i)=>
<div key={i}><div className="row" style={{justifyContent:'space-between',fontSize:12.8,marginBottom:5}}><span>{a.b}</span><span className="mono" style={{fontWeight:500}}>{money(a.v)}</span></div>
<div style={{height:7,borderRadius:4,background:'var(--surface-sunk)'}}><div style={{width:(a.v/t*100)+'%',height:'100%',borderRadius:4,background:i===0?'var(--ok)':i===1?'var(--warn)':'var(--bad)'}}/></div></div>)}
<button className="btn btn-s btn-g" style={{justifyContent:'center',marginTop:2}}>Run the dunning sequence <Ic.arrow size={13}/></button></div></div>};

const Profit=()=>{const[sort,setSort]=React.useState('margin');
const rows=[...AN.profit].sort((a,b)=>sort==='margin'?a.margin-b.margin:b.rev-a.rev);
return <div className="card" style={{overflow:'hidden'}}><div className="hd"><div><h3>Which clients actually make money</h3><div className="sub">Revenue against logged hours at your blended cost of $84/hr</div></div>
<div className="seg">{[['margin','Worst first'],['rev','Biggest first']].map(([k,l])=><button key={k} aria-pressed={sort===k} onClick={()=>setSort(k)}>{l}</button>)}</div></div>
<div className="tbl"><div style={{minWidth:980}}>
<div className="row" style={{padding:'10px 20px',background:'var(--surface-2)',borderBottom:'1px solid var(--line)',fontSize:11,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)',fontWeight:600}}>
<span style={{flex:'1 1 200px',minWidth:180}}>Client</span><span style={{flex:'0 0 100px',textAlign:'right'}}>Monthly</span><span style={{flex:'0 0 80px',textAlign:'right'}}>Hours</span>
<span style={{flex:'0 0 100px',textAlign:'right'}}>Eff. rate</span><span style={{flex:'0 0 170px',paddingLeft:24}}>Margin</span><span style={{flex:'0 0 130px'}}>Verdict</span></div>
{rows.map((p,i)=>{const neg=p.margin<15;
return <div key={i} className="row" style={{padding:'12px 20px',borderBottom:i<rows.length-1?'1px solid var(--line-soft)':'0'}}>
<span className="row" style={{flex:'1 1 200px',minWidth:180,gap:10}}><Avatar name={p.n} size={26}/><span style={{fontSize:13.4,fontWeight:500}}>{p.n}</span></span>
<span className="mono" style={{flex:'0 0 100px',textAlign:'right',fontSize:13.4}}>{money(p.rev)}</span>
<span className="mono sub" style={{flex:'0 0 80px',textAlign:'right'}}>{p.hrs}h</span>
<span className="mono" style={{flex:'0 0 100px',textAlign:'right',fontSize:13.4,color:neg?'var(--bad)':'var(--ink)'}}>${Math.round(p.rev/p.hrs)}/hr</span>
<span className="row" style={{flex:'0 0 170px',paddingLeft:24,gap:10}}>
<span style={{flex:1,height:7,borderRadius:4,background:'var(--surface-sunk)',position:'relative',overflow:'hidden'}}>
<span style={{position:'absolute',left:0,top:0,bottom:0,width:Math.max(p.margin,3)+'%',background:p.margin<0?'var(--bad)':p.margin<15?'var(--warn)':'var(--ok)'}}/></span>
<span className="mono" style={{fontSize:12.5,width:34,textAlign:'right',fontWeight:500}}>{p.margin}%</span></span>
<span style={{flex:'0 0 130px'}}><span className={'pill '+(p.margin<0?'pill-bad':p.margin<15?'pill-warn':'pill-ok')}>{p.verdict}</span></span></div>})}</div></div>
<div style={{padding:'14px 20px',borderTop:'1px solid var(--line)',background:'var(--surface-2)',fontSize:13,color:'var(--ink-2)',lineHeight:1.55}}>
<span style={{color:'var(--ink)',fontWeight:600}}>Paige's read: </span>Ridgeline and Selby take 74 hours a month and return $4,300 — less than Northwind returns on 38. Both were scoped before your rate change. Repricing Ridgeline to $3,600 puts it at 39% margin; I have the conversation drafted.
<button className="btn btn-s" style={{marginLeft:12}}>Read it</button></div></div>};

const Cohorts=()=>{const{cohorts:C}=AN;const cell=v=>v==null?{background:'var(--surface-sunk)',color:'transparent'}:
{background:'color-mix(in oklab, var(--violet) '+(v-40)+'%, var(--surface))',color:v>75?'#fff':'var(--ink)'};
return <div className="card"><div className="hd"><div><h3>Do clients stay</h3><div className="sub">Revenue retained by signup cohort</div></div><span className="pill pill-ok"><span className="dot"/>82% at 12 months</span></div>
<div style={{padding:'16px 20px 20px',overflowX:'auto'}}>
<div style={{display:'grid',gridTemplateColumns:'58px repeat(6,1fr)',gap:5,minWidth:380}}>
<span/>{C.months.map(m=><span key={m} className="mono" style={{fontSize:10.5,color:'var(--ink-3)',textAlign:'center'}}>{m}</span>)}
{C.rows.map(r=><React.Fragment key={r.c}><span className="mono" style={{fontSize:11,color:'var(--ink-3)',alignSelf:'center'}}>{r.c}</span>
{r.v.map((v,i)=><span key={i} className="mono" style={{...cell(v),height:30,borderRadius:6,display:'grid',placeItems:'center',fontSize:11.5,fontWeight:600}}>{v==null?'':v+'%'}</span>)}</React.Fragment>)}</div>
<div style={{marginTop:14,fontSize:12.8,color:'var(--ink-2)',lineHeight:1.55}}>Every cohort holds full revenue through month one. The drop always lands between month three and six — the same window where your check-in cadence goes from weekly to monthly.</div></div></div>};

const Channels=()=>(<div className="card" style={{overflow:'hidden'}}><div className="hd"><div><h3>Where clients come from</h3><div className="sub">Cost to acquire against lifetime value</div></div><span className="pill pill-v">Referrals win 9:1</span></div>
<div className="tbl"><div style={{minWidth:600}}>
<div className="row" style={{padding:'10px 20px',background:'var(--surface-2)',borderBottom:'1px solid var(--line)',fontSize:11,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)',fontWeight:600}}>
<span className="grow">Source</span><span style={{flex:'0 0 60px',textAlign:'right'}}>Won</span><span style={{flex:'0 0 80px',textAlign:'right'}}>CAC</span>
<span style={{flex:'0 0 90px',textAlign:'right'}}>LTV:CAC</span><span style={{flex:'0 0 90px',textAlign:'right'}}>Payback</span></div>
{AN.channels.map((c,i)=>{const ratio=(c.ltv/c.cac);const good=ratio>20;
return <div key={i} className="row" style={{padding:'12px 20px',borderBottom:i<AN.channels.length-1?'1px solid var(--line-soft)':'0'}}>
<span className="grow" style={{fontSize:13.4,fontWeight:500}}>{c.n}</span>
<span className="mono sub" style={{flex:'0 0 60px',textAlign:'right'}}>{c.clients}</span>
<span className="mono" style={{flex:'0 0 80px',textAlign:'right',fontSize:13.2}}>{money(c.cac)}</span>
<span className="mono" style={{flex:'0 0 90px',textAlign:'right',fontSize:13.2,fontWeight:600,color:good?'var(--ok)':ratio>8?'var(--warn)':'var(--bad)'}}>{ratio.toFixed(0)}:1</span>
<span className="mono sub" style={{flex:'0 0 90px',textAlign:'right'}}>{c.pay<1?'<1 mo':c.pay+' mo'}</span></div>})}</div></div>
<div style={{padding:'13px 20px',borderTop:'1px solid var(--line)',background:'var(--surface-2)',fontSize:12.8,color:'var(--ink-2)',lineHeight:1.55}}>
Meta ads and cold outbound cost {money(6760)} this quarter and returned three clients, two of which sit in your bottom margin quartile. The same spend as referral credits would have bought roughly eleven.</div></div>);

const Simulator=()=>{const[i,setI]=React.useState(0);const s=AN.scenarios[i];const[tree,setTree]=React.useState(false);
return <div className="card" style={{overflow:'hidden'}}><div className="hd"><div><h3>Business Simulator</h3><div className="sub">Ask what a decision costs before you make it</div></div>
<div className="row" style={{gap:8,flex:'none'}}><button className="btn btn-s" onClick={()=>setTree(true)}><Ic.trend size={12}/>Compare scenarios</button></div>
<Foldout open={tree} onClose={()=>setTree(false)} wide title="Three ways this month could go" sub="Modeled side by side against your own history"><BranchTree/></Foldout></div>
<div style={{padding:'16px 20px 20px'}}>
<div className="row" style={{gap:8,flexWrap:'wrap',marginBottom:16}}>{AN.scenarios.map((x,j)=>
<button key={j} onClick={()=>setI(j)} className="btn btn-s" style={{background:i===j?'var(--ink)':'var(--surface)',color:i===j?'var(--ink-inv)':'var(--ink)',borderColor:i===j?'var(--ink)':'var(--line)'}}>{x.q}</button>)}</div>
<div className="two" style={{gap:20}}>
<div><div className="eyebrow">Modeled outcome</div>
<div style={{fontSize:24,fontWeight:600,letterSpacing:'-.03em',marginTop:6}}>{s.res}</div>
<div className="mono sub" style={{marginTop:4}}>Range {s.range} · confidence {s.conf}</div>
<div style={{marginTop:14,padding:'12px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',fontSize:12.8,color:'var(--ink-2)',lineHeight:1.55}}>
<span style={{color:'var(--ink)',fontWeight:600}}>What limits this model: </span>{s.open}</div></div>
<div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'14px 15px'}}>
<div className="eyebrow">Ask your own</div>
<div style={{fontSize:12.7,color:'var(--ink-2)',margin:'6px 0 11px',lineHeight:1.5}}>Plain language. Paige pulls your acquisition cost, churn, and retention.</div>
<div className="row" style={{gap:8,border:'1px solid var(--line)',borderRadius:11,padding:'7px 8px 7px 12px',background:'var(--surface-2)'}}>
<span className="sub trunc" style={{flex:1}}>What if I add a $47/mo tier?</span>
<button className="btn btn-s btn-p" style={{width:28,padding:0,justifyContent:'center'}}><Ic.send size={13}/></button></div></div></div></div></div>};

const Bench=()=>{const[seg,setSeg]=React.useState(0);const S=MW.peers[seg];
return <div className="card"><div className="hd"><div><h3>You against comparable businesses</h3><div className="sub">Anonymized · {S[1]}</div></div></div>
<div style={{padding:'14px 20px 20px',display:'grid',gap:14}}>
<div className="row tabstrip" style={{gap:7}}>{MW.peers.map((p,j)=>
<button key={j} onClick={()=>setSeg(j)} className={'pill '+(seg===j?'pill-v':'pill-n')} style={{height:25,cursor:'pointer',flex:'none'}}>{p[0]}</button>)}</div>
{AN.bench.map((b0,i)=>{const b={...b0,peer:Math.round(b0.peer*S[2])};const mx=Math.max(b.you,b.peer)*1.1;const f=v=>(v/mx*100)+'%';const fmt=v=>b.k==='Avg retainer'?money(v):v+'%';
return <div key={i}><div className="row" style={{justifyContent:'space-between',fontSize:12.8,marginBottom:6}}><span>{b.k}</span>
<span className="mono" style={{fontWeight:600,color:b.you>=b.peer?'var(--ok)':'var(--warn)'}}>{fmt(b.you)} <span style={{color:'var(--ink-3)',fontWeight:400}}>vs {fmt(b.peer)}</span></span></div>
<div style={{display:'grid',gap:3}}><div style={{height:8,borderRadius:4,background:'var(--surface-sunk)'}}><div style={{width:f(b.you),height:'100%',borderRadius:4,background:b.you>=b.peer?'var(--ok)':'var(--warn)'}}/></div>
<div style={{height:4,borderRadius:2,background:'var(--surface-sunk)'}}><div style={{width:f(b.peer),height:'100%',borderRadius:2,background:'var(--ink-3)',opacity:.5}}/></div></div></div>})}
<div style={{fontSize:12.8,color:'var(--ink-2)',lineHeight:1.55}}>You keep clients better than the field and charge more, but your margin trails by {Math.abs(AN.bench[1].you-Math.round(AN.bench[1].peer*S[2]))} points. That gap is Ridgeline and Selby.</div></div></div>};

const AN_QS=['Why did margin drop?','Which client should I fire?','Can I afford a hire?','What is working best right now?'];
const AN_ANS="Gross margin fell 5 points since May. Almost all of it is two accounts: Ridgeline logged 41 hours against $2,400 and Selby 33 against $1,900, both scoped before your February rate change. Nothing else moved more than a point. Repricing those two to current rates recovers 6 points and frees roughly 30 hours a month.";

const AskPop=({open,seed,onClose})=>{const[msgs,setMsgs]=React.useState([]);const[v,setV]=React.useState('');const[think,setThink]=React.useState(false);
const scroll=React.useRef(null);
React.useEffect(()=>{if(open&&seed)ask(seed)},[open,seed]);
React.useEffect(()=>{if(!open){setMsgs([]);setV('')}},[open]);
React.useEffect(()=>{if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight},[msgs,think]);
React.useEffect(()=>{if(!open)return;const k=e=>e.key==='Escape'&&onClose();window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open,onClose]);
function ask(q){if(!q)return;setMsgs(m=>[...m,{r:'me',t:q}]);setV('');setThink(true);
 setTimeout(()=>{setThink(false);setMsgs(m=>[...m,{r:'paige',t:AN_ANS,acts:['Draft both conversations','Show the hours']}])},900)}
if(!open)return null;
return <><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(23,19,49,.44)',backdropFilter:'blur(4px)',zIndex:88}}/>
<div className="fade-in card" style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(680px,94vw)',
maxHeight:'84vh',display:'flex',flexDirection:'column',zIndex:89,borderRadius:'var(--r-xl)',boxShadow:'var(--sh-3)',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div className="row" style={{gap:11,minWidth:0}}>
<span className="tile" style={{borderRadius:'50%',background:'var(--violet-tint)',color:'var(--violet)',flex:'none'}}><Ic.spark size={17}/></span>
<div style={{minWidth:0}}><h3>Ask about your numbers</h3><div className="sub">She answers in words, and cites the rows behind it.</div></div></div>
<button className="btn btn-s" onClick={onClose} style={{width:28,height:28,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.x size={13}/></button></div>

<div ref={scroll} className="pane" style={{flex:1,padding:'18px 20px 8px',display:'flex',flexDirection:'column',gap:14}}>
{!msgs.length&&!think&&<div style={{padding:'18px 0 8px',textAlign:'center'}}>
<div style={{fontSize:13.6,color:'var(--ink-2)',lineHeight:1.6,maxWidth:420,margin:'0 auto'}}>Ask anything about revenue, margin, retention, or a decision you are weighing. She reads your own history first.</div>
<div className="row" style={{gap:8,justifyContent:'center',flexWrap:'wrap',marginTop:16}}>
{AN_QS.map(q=><button key={q} onClick={()=>ask(q)} className="btn btn-s">{q}</button>)}</div></div>}
{msgs.map((m,i)=>m.r==='me'
?<div key={i} style={{alignSelf:'flex-end',maxWidth:'80%',background:'var(--ink)',color:'var(--ink-inv)',padding:'10px 14px',borderRadius:'16px 16px 5px 16px',fontSize:13.3,lineHeight:1.5}}>{m.t}</div>
:<div key={i} className="row" style={{gap:11,alignItems:'flex-start',maxWidth:'94%'}}>
<span className="tile" style={{width:26,height:26,borderRadius:'50%',background:'var(--violet-tint)',color:'var(--violet)',flex:'none'}}><Ic.spark size={14}/></span>
<div style={{minWidth:0}}><div style={{background:'var(--surface-2)',border:'1px solid var(--line)',padding:'12px 15px',borderRadius:'5px 16px 16px 16px',fontSize:13.3,color:'var(--ink-2)',lineHeight:1.6}}>{m.t}</div>
{m.acts&&<div className="row" style={{gap:8,marginTop:9,flexWrap:'wrap'}}>
<button className="btn btn-s btn-p">{m.acts[0]}</button><button className="btn btn-s">{m.acts[1]}</button></div>}</div></div>)}
{think&&<div className="row" style={{gap:11}}><span className="tile" style={{width:26,height:26,borderRadius:'50%',background:'var(--violet-tint)',color:'var(--violet)'}}><Ic.spark size={14}/></span>
<div className="row" style={{gap:5,padding:'11px 14px'}}>{[0,1,2].map(i=><span key={i} style={{width:6,height:6,borderRadius:'50%',background:'var(--ink-3)',animation:'bl 1s '+(i*.15)+'s infinite'}}/>)}</div></div>}</div>

<div style={{flex:'none',padding:'10px 18px 14px',borderTop:'1px solid var(--line-soft)'}}>
{msgs.length>0&&<div className="row tabstrip" style={{gap:7,marginBottom:9}}>{AN_QS.map(q=>
<button key={q} onClick={()=>ask(q)} className="pill pill-n" style={{height:25,cursor:'pointer'}}>{q}</button>)}</div>}
<div className="row" style={{gap:8,border:'1px solid var(--line)',borderRadius:13,padding:'7px 7px 7px 13px',background:'var(--surface-2)'}}>
<input value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask(v.trim())} autoFocus
placeholder="Ask anything about your numbers…" style={{border:0,background:'none',outline:'none',flex:1,minWidth:0,fontFamily:'inherit',fontSize:13.3,color:'var(--ink)'}}/>
<button className="btn btn-s btn-p" onClick={()=>ask(v.trim())} style={{width:30,padding:0,justifyContent:'center'}}><Ic.send size={14}/></button></div></div></div></>};

const AskBar=({onOpen})=>(<button onClick={()=>onOpen()} className="card row" style={{width:'100%',textAlign:'left',padding:'10px 13px',gap:11,background:'var(--surface-2)',cursor:'text'}}>
<span className="tile" style={{borderRadius:'50%',background:'var(--violet-tint)',color:'var(--violet)',flex:'none'}}><Ic.spark size={16}/></span>
<span className="row grow" style={{gap:8,border:'1px solid var(--line)',borderRadius:11,padding:'7px 7px 7px 13px',background:'var(--surface)',minWidth:0}}>
<span className="grow trunc" style={{fontSize:13,color:'var(--ink-3)'}}>Ask anything about your numbers — Paige answers in words, not charts</span>
<span className="row tabstrip cc-hide" style={{gap:6}}>{AN_QS.slice(0,2).map(q=>
<span key={q} onClick={e=>{e.stopPropagation();onOpen(q)}} className="pill pill-n" style={{height:24,cursor:'pointer'}}>{q}</span>)}</span>
<span className="btn btn-s btn-p" style={{width:28,height:28,padding:0,justifyContent:'center',flex:'none'}}><Ic.send size={13}/></span></span></button>);

export const Analytics2=()=>{const[per,setPer]=React.useState('This month');const[sec,setSec]=React.useState('brief');
const[ask,setAsk]=React.useState(null);const[attr,setAttr]=React.useState(null);const[xi,setXi]=React.useState(false);const[wk,setWk]=React.useState(false);
const openAsk=q=>setAsk({q:q||null,k:Date.now()});
const tabs=[['brief','Brief',()=><Ic.spark size={14}/>],['money','The money',()=><Ic.chart size={14}/>],
['profit','Profitability',()=><Ic.trend size={14}/>],['ret','Retention',()=><Ic.users size={14}/>],
['dec','Decisions',()=><Ic.shield size={14}/>],['mkt','Market watch',()=><Ic.search size={14}/>]];
const subs={brief:'Where you stand against the plan, and what moved this week.',
money:'What came in, what is late, and where November lands.',
profit:'Revenue against logged hours — the number most businesses never look at.',
ret:'Who stays, and what each new client costs to win.',
dec:'Modeled on your own history, with the limits stated.',
mkt:'What your competitors did this week, and what she drafted back.'};
const body={
brief:<div className="an-brief"><AskBar onOpen={openAsk}/><Pacing onAttr={setAttr}/><Changed/></div>,
money:<div className="an-2"><CashChart/><Aging/></div>,
profit:<div className="an-1"><Profit/></div>,
ret:<div className="an-2e"><Cohorts/><Channels/></div>,
dec:<div className="an-2"><Simulator/><Bench/></div>,
mkt:<MarketWatch/>}[sec];
const periods=sec==='mkt'?['This week','This month','Quarter']:['This month','Quarter','Year'];
return <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0,minWidth:0,alignItems:'stretch'}}>
<SubTabs tabs={tabs} cur={sec} set={setSec} right={<>
<div className="seg">{periods.map(p=><button key={p} aria-pressed={per===p||(!periods.includes(per)&&p===periods[0])} onClick={()=>setPer(p)}>{p}</button>)}</div>
<button className="btn btn-s" onClick={()=>setWk(true)}><Ic.doc size={13}/>Monday brief</button>
<button className="btn btn-s" onClick={()=>setXi(true)} title="What Paige noticed across your systems"><Ic.bolt size={13}/>Connections</button>
<button className="btn btn-s" onClick={()=>openAsk()}><Ic.spark size={13}/>Ask Paige</button>
<button className="btn btn-s" title="Export" style={{width:30,padding:0,justifyContent:'center'}}><Ic.doc size={13}/></button></>}/>
<Wrap><PageHead eyebrow="Analytics" title={(tabs.find(t=>t[0]===sec)||[])[1]} sub={subs[sec]}/>
<div key={sec} className="fade-in an-fill">{body}</div></Wrap>
<AskPop key={ask&&ask.k} open={!!ask} seed={ask&&ask.q} onClose={()=>setAsk(null)}/>
<AttrDrawer k={attr} onClose={()=>setAttr(null)}/>
<XInsights open={xi} onClose={()=>setXi(false)}/>
<WeeklyExec open={wk} onClose={()=>setWk(false)}/></div>};
