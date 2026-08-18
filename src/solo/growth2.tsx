// @ts-nocheck
import React from "react";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, PeekCard, Wrap, PageHead, SubTabs, DATA } from "./_shared";

export const GR={
stats:[['Live funnels',3,'funnels'],['Live pages',7,'pages'],['Live forms',5,'forms'],['Submissions (7d)',184,'submissions']],
pages:[
 {n:'Masterclass registration',views:4820,conv:32,state:'Live',edited:'2h ago',built:'Vibe Studio'},
 {n:'Signature program overview',views:2140,conv:18,state:'Live',edited:'1d ago',built:'Vibe Studio'},
 {n:'Teardown lead magnet',views:9410,conv:8,state:'Live',edited:'4d ago',built:'Vibe Studio'},
 {n:'Discovery call booking',views:1260,conv:44,state:'Live',edited:'6d ago',built:'Template'},
 {n:'Q4 pricing page',views:0,conv:0,state:'Draft',edited:'12m ago',built:'Vibe Studio'}],
funnels:[
 {n:'Masterclass → Academy',steps:[['Ad click',9410],['Registration',2980],['Attended',1240],['Application',312],['Closed',41]],state:'Live'},
 {n:'Teardown → Discovery call',steps:[['Download',1240],['Nurture open',806],['Call booked',186],['Showed',114],['Closed',22]],state:'Live'},
 {n:'Referral → Onboarding',steps:[['Intro',86],['Call',74],['Proposal',58],['Closed',41]],state:'Live'}],
forms:[
 {n:'Discovery-call intake',subs:186,done:64,fields:9,state:'Live'},
 {n:'New-client welcome',subs:41,done:88,fields:12,state:'Live'},
 {n:'Masterclass registration',subs:2980,done:32,fields:5,state:'Live'},
 {n:'Teardown request',subs:1240,done:71,fields:3,state:'Live'},
 {n:'Scope change request',subs:9,done:100,fields:7,state:'Draft'}],
social:[
 {ch:'LinkedIn',handle:'@jordanavery',foll:'12.4k',queued:6,best:'Tue 8am',state:'Connected'},
 {ch:'Instagram',handle:'@meridianadvisory',foll:'8.1k',queued:4,best:'Thu 7pm',state:'Connected'},
 {ch:'YouTube',handle:'Meridian Advisory',foll:'3.2k',queued:1,best:'Sun 10am',state:'Connected'},
 {ch:'X',handle:'@paigeagentai',foll:'1.1k',queued:0,best:'—',state:'Not connected'}],
queue:[
 {t:'Teardown #14 — the offer that could not close',ch:'LinkedIn',when:'Today 8:00am',state:'Scheduled'},
 {t:'Client story: Harper & Vale, 34% more briefs',ch:'LinkedIn + IG',when:'Thu 7:00pm',state:'Paige draft'},
 {t:'Three signs your funnel is leaking',ch:'Instagram',when:'Fri 12:00pm',state:'Scheduled'},
 {t:'Masterclass reminder, 48 hours out',ch:'LinkedIn',when:'Mon 8:00am',state:'Paige draft'}],
builders:[
 {n:'Kajabi',what:'Courses & memberships',sync:'2h ago',items:'4 offers, 2 funnels',state:'Connected'},
 {n:'GoHighLevel',what:'Legacy funnels',sync:'1d ago',items:'6 funnels imported',state:'Connected'},
 {n:'Webflow',what:'Marketing site',sync:'12m ago',items:'18 pages watched',state:'Connected'},
 {n:'WordPress',what:'Blog',sync:'—',items:'—',state:'Available'},
 {n:'Squarespace',what:'Client sites',sync:'—',items:'—',state:'Available'}],
brand:{colors:[['Ink','#171331'],['Gold','#E9A83A'],['Violet','#5B3FD6'],['Paper','#F6F5F1'],['Signal','#1B7A52']],
 fonts:[['Display','Geist Semibold','Headlines, 32–56px'],['Body','Geist Regular','13–17px, 1.55 leading'],['Numeric','Geist Mono','Tables and metrics']],
 voice:['Plain, direct, no hype','Lead with the number, then the reason','Never more than two sentences before a next step','Say "you" more than "we"'],
 assets:[['Primary logo','SVG · light + dark'],['Planet mark','SVG · favicon set'],['Deck template','16:9 · 12 layouts'],['Email header','600px'],['Social frames','1:1, 4:5, 9:16']]},
projects:[
 {n:'Meridian Advisory website',type:'Site · 6 pages',edited:'2h ago',state:'Published'},
 {n:'Masterclass landing page',type:'Page + form',edited:'Yesterday',state:'Published'},
 {n:'Discovery-call intake',type:'Form',edited:'3d ago',state:'Published'},
 {n:'Client-scoring dashboard',type:'Internal tool',edited:'5d ago',state:'Draft'},
 {n:'New-client welcome sequence',type:'Email · 5 steps',edited:'1w ago',state:'Published'}]};

const Stat=({k,v})=>(<div className="card" style={{padding:'11px 14px'}}>
<div className="row" style={{justifyContent:'space-between',alignItems:'center',gap:8}}>
<div className="eyebrow trunc" style={{fontSize:9.5}}>{k}</div>
<div className="tile" style={{background:'var(--violet-tint)',color:'var(--violet)',width:22,height:22,borderRadius:7,flex:'none'}}><Ic.bolt size={12}/></div></div>
<div style={{fontSize:21,fontWeight:600,letterSpacing:'-.03em',marginTop:1}}>{v}</div></div>);

const CampOverview=()=><>
<div className="g4">{GR.stats.map(([k,v],i)=><Stat key={i} k={k} v={v}/>)}</div>
<div className="card" style={{display:'flex',flexDirection:'column',minHeight:0,overflow:'hidden'}}><div className="tbl" style={{flex:1,minHeight:0}}><div style={{minWidth:900}}><div className="hd"><div><h3>Active campaigns</h3><div className="sub">Every campaign running for this workspace, live</div></div>
<div className="row" style={{gap:9}}><button className="btn btn-s"><Ic.filter size={13}/>All channels</button><button className="btn btn-s btn-p"><Ic.plus size={13}/>New campaign</button></div></div>
<div className="row" style={{padding:'10px 20px',background:'var(--surface-2)',borderTop:'1px solid var(--line)',borderBottom:'1px solid var(--line)',fontSize:11,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)',fontWeight:600}}>
<span style={{flex:'1 1 240px',minWidth:210}}>Campaign</span><span style={{flex:'0 0 100px',textAlign:'right'}}>Reached</span><span style={{flex:'0 0 90px',textAlign:'right'}}>Open</span>
<span style={{flex:'0 0 90px',textAlign:'right'}}>Replies</span><span style={{flex:'0 0 110px',textAlign:'right'}}>Attributed</span><span style={{flex:'0 0 90px',textAlign:'right'}}>State</span></div>
{DATA.campaigns.map((c,i)=><div key={i} className="row" style={{padding:'13px 20px',borderBottom:i<DATA.campaigns.length-1?'1px solid var(--line-soft)':'0',gap:12}}>
<span style={{flex:'1 1 240px',minWidth:210}}><span className="trunc" style={{fontSize:13.3,fontWeight:600,display:'block'}}>{c.n}</span><span className="sub">{c.ch}</span></span>
<span className="mono" style={{flex:'0 0 100px',textAlign:'right',fontSize:13.2}}>{c.sent.toLocaleString()}</span>
<span className="mono" style={{flex:'0 0 90px',textAlign:'right',fontSize:13.2}}>{c.open}%</span>
<span className="mono" style={{flex:'0 0 90px',textAlign:'right',fontSize:13.2,fontWeight:600,color:c.rep>8?'var(--ok)':'var(--ink)'}}>{c.rep}%</span>
<span className="mono" style={{flex:'0 0 110px',textAlign:'right',fontSize:13.2}}>{['$8,400','$2,600','—','$1,100'][i]}</span>
<span style={{flex:'0 0 90px',textAlign:'right'}}><span className={'pill '+(c.state==='Live'?'pill-ok':c.state==='Draft'?'pill-v':'pill-n')}>{c.state}</span></span></div>)}
<div style={{padding:'13px 20px',borderTop:'1px solid var(--line)',background:'var(--surface-2)',fontSize:12.9,color:'var(--ink-2)',lineHeight:1.55}}>
<span style={{fontWeight:600,color:'var(--ink)'}}>Paige: </span>The Teardown series carries almost all attributed revenue. The Meta ad fills the calendar with people who convert at 21% — pausing it and moving that spend into referral credits is the drafted recommendation.
<button className="btn btn-s" style={{marginLeft:12}}>Read it</button></div></div></div></div></>;

const Swatches=({compact})=>(<div style={{padding:compact?'10px 14px 12px':'16px 20px 20px',display:'grid',
gridTemplateColumns:compact?'repeat('+GR.brand.colors.length+',minmax(0,1fr))':'repeat(auto-fit,minmax(150px,1fr))',gap:compact?8:14}}>
{GR.brand.colors.map(([n,c],i)=><div key={i} style={{minWidth:0}}>
<div style={{height:compact?38:92,borderRadius:'var(--r-m)',background:c,border:'1px solid var(--line)'}}/>
<div className="trunc" style={{fontSize:compact?11.4:13.4,fontWeight:600,marginTop:compact?5:8}}>{n}</div>
<div className="mono sub trunc" style={{fontSize:compact?10.2:12}}>{c}</div></div>)}</div>);

const VoiceList=({n})=>(<div style={{padding:'10px 14px 14px',display:'grid',gap:9}}>{GR.brand.voice.slice(0,n).map((v,i)=>
<div key={i} className="row" style={{gap:9,fontSize:12.7,color:'var(--ink-2)',alignItems:'flex-start',lineHeight:1.5}}>
<span style={{color:'var(--gold)',display:'flex',marginTop:2,flex:'none'}}><Ic.check size={13}/></span>{v}</div>)}
{n<GR.brand.voice.length&&<div className="sub" style={{paddingLeft:22,fontSize:11.6}}>+{GR.brand.voice.length-n} more rules</div>}</div>);

const TypeList=({n})=>(<div style={{padding:'2px 14px 12px'}}>{GR.brand.fonts.slice(0,n).map(([k,f,u],i)=>
<div key={i} style={{padding:'11px 0',borderBottom:i<Math.min(n,GR.brand.fonts.length)-1?'1px solid var(--line-soft)':'0'}}>
<div className="row" style={{justifyContent:'space-between',gap:8}}><span className="eyebrow" style={{fontSize:9.5}}>{k}</span><span className="sub trunc" style={{fontSize:11}}>{u}</span></div>
<div className="trunc" style={{fontSize:19,fontWeight:i===0?600:400,marginTop:4,fontFamily:i===2?'var(--mono)':'var(--font)',letterSpacing:i===0?'-.03em':0}}>{f}</div></div>)}
{n<GR.brand.fonts.length&&<div className="sub" style={{padding:'9px 0 0',fontSize:11.6}}>+{GR.brand.fonts.length-n} more</div>}</div>);

const AssetList=({n})=>(<div>{GR.brand.assets.slice(0,n).map(([a,d],i)=>
<div key={i} className="row" style={{padding:'11px 14px',borderTop:i?'1px solid var(--line-soft)':'0',gap:11}}>
<span className="tile" style={{width:24,height:24,borderRadius:7,background:'var(--surface-sunk)',color:'var(--ink-3)',flex:'none'}}><Ic.doc size={12}/></span>
<span className="grow trunc" style={{fontSize:12.7,fontWeight:500}}>{a}</span><span className="sub trunc" style={{flex:'none'}}>{d}</span></div>)}
{n<GR.brand.assets.length&&<div className="sub" style={{padding:'10px 14px',borderTop:'1px solid var(--line-soft)',fontSize:11.6}}>+{GR.brand.assets.length-n} more assets</div>}</div>);

const BrandKit=()=><>
<PeekCard title="Palette" sub="Everything Paige generates inherits these" foldTitle="Brand palette"
right={<button className="btn btn-s">Edit</button>} peek={<Swatches compact/>}><Swatches/></PeekCard>

<PeekCard title="Voice" sub="Applied to every draft she writes" foldTitle="Voice rules"
peek={<VoiceList n={2}/>}><VoiceList n={GR.brand.voice.length}/></PeekCard>

<PeekCard title="Type" sub={GR.brand.fonts.length+' typefaces in the system'} foldTitle="Typography"
peek={<TypeList n={1}/>}><TypeList n={GR.brand.fonts.length}/></PeekCard>

<PeekCard title="Assets" sub={GR.brand.assets.length+' files Paige can reach'} foldTitle="Brand assets"
right={<button className="btn btn-s"><Ic.plus size={13}/>Upload</button>} peek={<AssetList n={2}/>}><AssetList n={GR.brand.assets.length}/></PeekCard></>;

const Social=()=>(<div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:16}}>
<div className="g4">{GR.social.map((s,i)=><div key={i} className="card" style={{padding:'15px 17px'}}>
<div className="row" style={{justifyContent:'space-between',gap:10}}><span style={{fontWeight:600,fontSize:13.6}}>{s.ch}</span>
<span className={'pill '+(s.state==='Connected'?'pill-ok':'pill-n')}>{s.state==='Connected'?<span className="dot"/>:null}{s.state}</span></div>
<div className="sub" style={{marginTop:3}}>{s.handle}</div>
<div className="row" style={{marginTop:12,gap:16}}>
<div><div className="eyebrow" style={{fontSize:10}}>Following</div><div className="mono" style={{fontSize:15,fontWeight:500}}>{s.foll}</div></div>
<div><div className="eyebrow" style={{fontSize:10}}>Queued</div><div className="mono" style={{fontSize:15,fontWeight:500}}>{s.queued}</div></div>
<div><div className="eyebrow" style={{fontSize:10}}>Best slot</div><div className="mono" style={{fontSize:13,fontWeight:500,marginTop:2}}>{s.best}</div></div></div></div>)}</div>
<div className="card"><div className="hd"><div><h3>Publishing queue</h3><div className="sub">Paige writes in your voice and books the slot she knows performs</div></div>
<button className="btn btn-s btn-p"><Ic.plus size={13}/>New post</button></div>
{GR.queue.map((q,i)=><div key={i} className="row" style={{padding:'13px 20px',borderTop:'1px solid var(--line-soft)',gap:12,flexWrap:'wrap'}}>
<span className="tile" style={{background:q.state==='Paige draft'?'var(--violet-tint)':'var(--surface-sunk)',color:q.state==='Paige draft'?'var(--violet)':'var(--ink-3)',width:28,height:28,borderRadius:9}}>
{q.state==='Paige draft'?<Ic.spark size={14}/>:<Ic.clock size={14}/>}</span>
<span className="grow" style={{minWidth:180}}><span style={{fontSize:13.3,fontWeight:500,display:'block'}}>{q.t}</span><span className="sub">{q.ch}</span></span>
<span className="mono sub" style={{flex:'0 0 120px'}}>{q.when}</span>
<span className={'pill '+(q.state==='Paige draft'?'pill-v':'pill-n')}>{q.state}</span>
{q.state==='Paige draft'?<button className="btn btn-s btn-p"><Ic.check size={12}/>Approve</button>:<button className="btn btn-s">Edit</button>}</div>)}</div></div>);

const Pages=()=>(<div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:16}}>
<div className="g3">{GR.pages.map((p,i)=><div key={i} className="card" style={{overflow:'hidden'}}>
<div style={{height:96,background:'linear-gradient(140deg,var(--rail) 0%,var(--violet) 140%)',display:'grid',placeItems:'center',position:'relative'}}>
<div style={{width:'62%',height:'58%',border:'1px solid rgba(255,255,255,.22)',borderRadius:6,padding:8,display:'grid',gap:5,alignContent:'start'}}>
<div style={{height:5,width:'50%',background:'var(--gold-bright)',borderRadius:3}}/><div style={{height:4,width:'86%',background:'rgba(255,255,255,.35)',borderRadius:3}}/>
<div style={{height:4,width:'70%',background:'rgba(255,255,255,.25)',borderRadius:3}}/><div style={{height:11,width:'38%',background:'rgba(255,255,255,.5)',borderRadius:3,marginTop:4}}/></div>
<span className={'pill '+(p.state==='Live'?'pill-ok':'pill-v')} style={{position:'absolute',top:9,right:9}}>{p.state}</span></div>
<div style={{padding:'13px 16px 15px'}}><div style={{fontWeight:600,fontSize:13.6}}>{p.n}</div>
<div className="sub" style={{marginTop:2}}>{p.built} · edited {p.edited}</div>
<div className="row" style={{marginTop:12,gap:16}}>
<div><div className="eyebrow" style={{fontSize:10}}>Views</div><div className="mono" style={{fontSize:14}}>{p.views.toLocaleString()}</div></div>
<div><div className="eyebrow" style={{fontSize:10}}>Converts</div><div className="mono" style={{fontSize:14,color:p.conv>30?'var(--ok)':'var(--ink)'}}>{p.conv}%</div></div>
<button className="btn btn-s" style={{marginLeft:'auto'}}>Open</button></div></div></div>)}
<button className="card" style={{border:'1px dashed var(--line)',background:'none',display:'grid',placeItems:'center',minHeight:200,color:'var(--ink-3)'}}>
<span style={{textAlign:'center'}}><span className="row" style={{gap:7,fontSize:13.5,fontWeight:600,color:'var(--ink)',justifyContent:'center'}}><Ic.spark size={16}/>Build one in Vibe Studio</span>
<span className="sub" style={{display:'block',marginTop:5,maxWidth:200}}>Describe the page. Paige writes the copy and ships it.</span></span></button></div></div>);

const Funnels=()=>(<div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:16}}>{GR.funnels.map((f,i)=>{const top=f.steps[0][1];
return <div key={i} className="card"><div className="hd"><div><h3>{f.n}</h3><div className="sub">{Math.round(f.steps[f.steps.length-1][1]/top*1000)/10}% end-to-end</div></div>
<div className="row" style={{gap:9}}><span className="pill pill-ok"><span className="dot"/>{f.state}</span><button className="btn btn-s">Open</button></div></div>
<div style={{padding:'18px 20px 20px',display:'grid',gap:10}}>{f.steps.map(([s,v],j)=>{const pct=v/top*100;const drop=j?Math.round((1-v/f.steps[j-1][1])*100):0;
return <div key={j} className="row" style={{gap:14}}>
<span style={{flex:'0 0 130px',fontSize:13,color:'var(--ink-2)'}}>{s}</span>
<span style={{flex:1,height:26,borderRadius:7,background:'var(--surface-sunk)',position:'relative',overflow:'hidden'}}>
<span style={{position:'absolute',inset:0,width:Math.max(pct,4)+'%',background:j===f.steps.length-1?'var(--ok)':'var(--violet)',opacity:1-j*.13,borderRadius:7}}/>
<span className="mono" style={{position:'absolute',left:10,top:0,lineHeight:'26px',fontSize:12,color:pct>18?'#fff':'var(--ink)',fontWeight:600}}>{v.toLocaleString()}</span></span>
<span className="mono" style={{flex:'0 0 74px',textAlign:'right',fontSize:12,color:drop>60?'var(--bad)':'var(--ink-3)'}}>{j?'−'+drop+'%':''}</span></div>})}
<div style={{marginTop:6,padding:'11px 13px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',fontSize:12.8,color:'var(--ink-2)',lineHeight:1.55}}>
<span style={{fontWeight:600,color:'var(--ink)'}}>Biggest leak: </span>{i===0?'registration to attended — 58% never show. A two-touch reminder recovers roughly 300 attendees a cycle.':i===1?'download to call booked — the nurture is one email long.':'proposal to closed holds at 71%, which is the best ratio you have. Feed it more.'}
<button className="btn btn-s" style={{marginLeft:12}}>Fix with Paige</button></div></div></div>})}</div>);

const Forms=()=>(<div className="card tbl"><div style={{minWidth:640}}><div className="hd"><div><h3>Forms</h3><div className="sub">Every submission lands in Conversations as a thread</div></div>
<button className="btn btn-s btn-p"><Ic.plus size={13}/>New form</button></div>
<div className="row" style={{padding:'10px 20px',background:'var(--surface-2)',borderTop:'1px solid var(--line)',borderBottom:'1px solid var(--line)',fontSize:11,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-3)',fontWeight:600}}>
<span className="grow">Form</span><span style={{flex:'0 0 90px',textAlign:'right'}}>Fields</span><span style={{flex:'0 0 110px',textAlign:'right'}}>Submissions</span>
<span style={{flex:'0 0 160px',paddingLeft:24}}>Completion</span><span style={{flex:'0 0 80px',textAlign:'right'}}>State</span></div>
{GR.forms.map((f,i)=><div key={i} className="row" style={{padding:'13px 20px',borderBottom:i<GR.forms.length-1?'1px solid var(--line-soft)':'0',gap:12}}>
<span className="grow trunc" style={{fontSize:13.3,fontWeight:500}}>{f.n}</span>
<span className="mono sub" style={{flex:'0 0 90px',textAlign:'right'}}>{f.fields}</span>
<span className="mono" style={{flex:'0 0 110px',textAlign:'right',fontSize:13.2}}>{f.subs.toLocaleString()}</span>
<span className="row" style={{flex:'0 0 160px',paddingLeft:24,gap:10}}>
<span style={{flex:1,height:7,borderRadius:4,background:'var(--surface-sunk)'}}><span style={{display:'block',width:f.done+'%',height:'100%',borderRadius:4,background:f.done>60?'var(--ok)':'var(--warn)'}}/></span>
<span className="mono" style={{fontSize:12.5,width:32,textAlign:'right'}}>{f.done}%</span></span>
<span style={{flex:'0 0 80px',textAlign:'right'}}><span className={'pill '+(f.state==='Live'?'pill-ok':'pill-v')}>{f.state}</span></span></div>)}
<div style={{padding:'13px 20px',borderTop:'1px solid var(--line)',background:'var(--surface-2)',fontSize:12.9,color:'var(--ink-2)'}}>
<span style={{fontWeight:600,color:'var(--ink)'}}>Paige: </span>Masterclass registration completes at 32% — two of its five fields are optional and still lose people. Shorter version drafted.</div></div></div>);

const Builders=()=>(<div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:16}}>
<div className="card" style={{padding:'15px 18px',background:'var(--surface-2)',fontSize:13,color:'var(--ink-2)',lineHeight:1.6}}>
<span style={{fontWeight:600,color:'var(--ink)'}}>Bridges, not migrations. </span>Paige reads and writes inside the tools you already pay for, so nothing has to move before it earns the move. Where a tool has no API, the Web Automator drives it at your direction.</div>
<div className="g3">{GR.builders.map((b,i)=>{const on=b.state==='Connected';
return <div key={i} className="card" style={{padding:'16px 18px',display:'flex',flexDirection:'column',gap:10}}>
<div className="row" style={{justifyContent:'space-between',gap:10}}>
<span className="row" style={{gap:10}}><span className="tile" style={{background:on?'var(--violet-tint)':'var(--surface-sunk)',color:on?'var(--violet)':'var(--ink-3)',borderRadius:10}}><Ic.store size={16}/></span>
<span><span style={{fontWeight:600,fontSize:13.8,display:'block'}}>{b.n}</span><span className="sub">{b.what}</span></span></span>
<span className={'pill '+(on?'pill-ok':'pill-n')}>{on&&<span className="dot"/>}{b.state}</span></div>
<div className="row" style={{gap:14,fontSize:12.6,color:'var(--ink-2)'}}><span>{b.items}</span></div>
<div className="row" style={{marginTop:'auto',gap:8}}><span className="mono sub">{on?'Synced '+b.sync:'Not connected'}</span>
<button className="btn btn-s" style={{marginLeft:'auto'}}>{on?'Manage':'Connect'}</button></div></div>})}</div></div>);

const Campaigns=({tab})=>{
const body={ov:<CampOverview/>,brand:<BrandKit/>,soc:<Social/>,pg:<Pages/>,fn:<Funnels/>,fm:<Forms/>,ext:<Builders/>}[tab||'ov'];
const t=tab||'ov';
const cls=t==='ov'?' gr-fill':t==='brand'?' bk-fill':'';
return <div key={tab} className={'fade-in'+cls}>{body}</div>};

export const Pipeline=()=>{const total=DATA.pipeline.reduce((s,st)=>s+st.deals.reduce((a,d)=>a+d.v,0),0);
return <Wrap><PageHead eyebrow="Clients" title="Pipeline" sub={'$'+total.toLocaleString()+' of monthly value in play across 8 deals. Paige drafts the next touch on every one.'}
right={<div className="row" style={{gap:10}}><button className="btn"><Ic.filter size={15}/>This quarter</button><button className="btn btn-p"><Ic.plus size={15}/>New deal</button></div>}/>
<div className="g4">{DATA.pipeline.map((st,i)=>{const v=st.deals.reduce((a,d)=>a+d.v,0);
return <div key={i} className="card" style={{background:'var(--surface-2)',padding:12}}>
<div className="row" style={{justifyContent:'space-between',padding:'2px 4px 10px'}}><span style={{fontWeight:600,fontSize:13}}>{st.stage}</span><span className="mono sub">${(v/1000).toFixed(1)}k</span></div>
<div style={{display:'grid',gap:9}}>{st.deals.map((d,j)=><div key={j} className="card" style={{padding:'12px 13px',cursor:'grab'}}>
<div style={{fontWeight:600,fontSize:13}}>{d.n}</div>
<div className="row" style={{marginTop:7,justifyContent:'space-between'}}><span className="mono" style={{fontSize:13.5}}>${d.v.toLocaleString()}</span><span className="pill pill-n">{d.src}</span></div>
<div className="row" style={{marginTop:9,paddingTop:9,borderTop:'1px solid var(--line-soft)',gap:6,color:'var(--violet)',fontSize:12}}><Ic.spark size={13}/>Follow-up drafted · {d.age}</div></div>)}
<button className="btn btn-s" style={{justifyContent:'center',border:'1px dashed var(--line)',background:'none'}}><Ic.plus size={13}/>Add</button></div></div>})}</div></Wrap>};

const openStudio=()=>window.dispatchEvent(new CustomEvent('paige-studio'));
export const GrowthHub=()=>{const[tab,setTab]=useSubtabRoute("solo","growth","ov");
const tabs=[['ov','Overview',()=><Ic.bolt size={14}/>],['brand','Brand Kit',()=><Ic.spark size={14}/>],['soc','Social',()=><Ic.users size={14}/>],
['pg','Pages',()=><Ic.grid size={14}/>],['fn','Funnels',()=><Ic.trend size={14}/>],['fm','Forms',()=><Ic.doc size={14}/>],['ext','Builders',()=><Ic.store size={14}/>]];
return <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0,minWidth:0,alignItems:'stretch'}}>
<SubTabs tabs={tabs} cur={tab} set={setTab} right={<><button className="btn btn-s"><Ic.clock size={13}/>Last 7 days</button>
<button className="btn btn-s btn-p" onClick={openStudio}><Ic.spark size={13}/>Vibe Studio</button></>}/>
<Wrap><PageHead eyebrow="Growth & acquisition" title={(tabs.find(t=>t[0]===tab)||[])[1]}
sub="Live campaigns, pages, funnels, forms, and the builders you already pay for — every one reporting into pipeline and Paige's workflows."/>
<Campaigns tab={tab}/></Wrap></div>};
