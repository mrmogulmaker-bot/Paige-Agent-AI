// @ts-nocheck
import React from "react";
import { Ic, PeekCard, Foldout, SlideOut } from "./_shared";

export const MW={
comps:[
 {n:'Coach Sarah Linley',d:'sarahlinley.co',ch:3,last:'2 hours ago',ini:'SL',adv:'Direct — same offer, same buyer',ads:{on:true,spend:'$1.8k–$2.6k/mo',n:7,plat:'Meta, Google'}},
 {n:'TrackingCoachGroup',d:'trackingcoachgroup.com',ch:4,last:'yesterday',ini:'TC',adv:'Adjacent — content overlap only',ads:{on:true,spend:'$4.2k–$6.1k/mo',n:19,plat:'Meta, TikTok, Google'}},
 {n:'Coach James Ordway',d:'ordwaymethod.com',ch:1,last:'3 days ago',ini:'JO',adv:'Direct — one tier below you',ads:{on:false,spend:'no active ads',n:0,plat:'—'}},
 {n:'Vell & Co',d:'vellandco.com',ch:0,last:'3 weeks ago',ini:'VC',adv:'Upmarket — bids on your keywords',ads:{on:true,spend:'$900–$1.4k/mo',n:3,plat:'Google'}},
 {n:'Marin Advisory',d:'marinadvisory.io',ch:1,last:'6 days ago',ini:'MA',adv:'Adjacent — different vertical',ads:{on:false,spend:'no active ads',n:0,plat:'—'}}],
moves:[
 {who:'Coach Sarah Linley',ini:'SL',t:'Dropped her mid-tier package from $890 to $750',when:'Mon 6:12am',tone:'bad',impact:'2 of your open proposals sit against her',
  ctx:'The $890 tier had held since January. The new price undercuts your Growth retainer by $140 and her page now leads with "no long-term contract" — language she did not use before.',
  fix:'A reframe email that moves the conversation off price and onto the 14 hours a month you take back. Sent to Verity and Grantham, both mid-proposal.',dept:'Sales',act:'Send the reframe'},
 {who:'TrackingCoachGroup',ini:'TC',t:'Published 4 posts targeting your top-3 keywords',when:'Tue–Thu',tone:'warn',impact:'You rank 2nd on two of the three',
  ctx:'All four posts hit "client retention audit", "coaching ops checklist" and "onboarding template" — the three phrases that bring you 61% of organic discovery calls. Their posts are thin but freshly dated, which is enough to move a ranking.',
  fix:'Refresh your retention-audit teardown with this quarter\'s numbers and add the checklist as a downloadable. Outline drafted, 900 words, in your voice.',dept:'Marketing',act:'Approve the refresh'},
 {who:'Coach James Ordway',ini:'JO',t:'Launched a lead magnet: "The 90-Day Client Book"',when:'Fri 4:40pm',tone:'ok',impact:'No offer of yours competes with it',
  ctx:'A 90-day plan for filling a roster from zero. It targets the pre-revenue coach, which is below your floor — but it is collecting emails you eventually want.',
  fix:'Nothing urgent. If you want the same list, your Teardown converts better than a workbook. I can build a one-page version.',dept:'Marketing',act:'Draft the one-pager'}],
gaps:[
 {t:'Pricing a retainer without discounting',who:'Sarah Linley · TrackingCoachGroup',vol:'~2,400/mo searches',brief:'Your repricing conversation with Ridgeline is the whole post. You have the before, the script and the outcome.'},
 {t:'What to hand an assistant first',who:'TrackingCoachGroup · Marin Advisory',vol:'~1,100/mo searches',brief:'You have nine hours a week of admin logged by category. That table is the article.'},
 {t:'Client offboarding without burning the referral',who:'Sarah Linley',vol:'~640/mo searches',brief:'Selby is the live example. Anonymize it and the piece writes itself.'}],
attr:{
'Revenue this month':{tot:'$23,230',sub:'3 closed deals, 6 retainers collected',rows:[
 {n:'Northwind Partners',v:8630,src:'Referral — Harper & Vale',d:'Aug 4'},{n:'Bellweather Co.',v:8400,src:'Teardown content',d:'Aug 7'},
 {n:'Cairn Advisory',v:6200,src:'Webinar — June cohort',d:'Aug 11'}],
 read:'Two of the three trace back to people who already knew you. The webinar deal took 11 weeks from first touch.'},
'New clients':{tot:'3 of 4',sub:'Signed contracts this month',rows:[
 {n:'Northwind Partners',v:6200,src:'Referral',d:'Aug 4'},{n:'Mercer Studio',v:1180,src:'Teardown content',d:'Aug 9'},{n:'Okonkwo Group',v:600,src:'Referral',d:'Aug 12'}],
 read:'Northwind closes the gap on its own. The kickoff email is drafted and waiting.'},
'Billable utilization':{tot:'68%',sub:'Where the other 32% went',rows:[
 {n:'Invoicing and chasing',v:14,src:'Finance — Paige can take it',d:'hrs'},{n:'Meeting notes and recaps',v:11,src:'Client Success — Paige can take it',d:'hrs'},
 {n:'Proposal formatting',v:8,src:'Sales — Paige can take it',d:'hrs'},{n:'Inbox triage',v:6,src:'Mixed',d:'hrs'}],
 read:'Thirty-nine hours this month sat in four buckets. Three of them are already inside her autonomy range.'},
'Collections':{tot:'94%',sub:'$4,180 outstanding across 3 invoices',rows:[
 {n:'Ridgeline Co. — INV-2841',v:2400,src:'Card declined Aug 2, no retry',d:'11 days late'},
 {n:'Selby Group — INV-2836',v:1200,src:'Card expired',d:'18 days late'},{n:'Mercer Studio — INV-2849',v:580,src:'Awaiting PO number',d:'4 days late'}],
 read:'Two are card failures, not disputes. The dunning sequence recovers those in a day and a half on your own history.'}},
branches:[
 {k:'Base',t:'Current trajectory',res:'+$0/mo',by:'—',conf:'High',note:'Everything holds as scoped.'},
 {k:'A',t:'Raise retainers 15% for new clients only',res:'+$1,740/mo',by:'month 4',conf:'Medium',note:'Assumes win rate holds at 44%.'},
 {k:'B',t:'Drop Ridgeline, backfill with one referral',res:'+$980/mo',by:'month 3',conf:'High',note:'Referrals have supplied 1.4 clients a month for six months.'},
 {k:'C',t:'Do both A and B',res:'+$2,340/mo',by:'month 4',conf:'Medium',note:'Assumes the Ridgeline replacement lands. If it slips a month, +$1,600.'}],
xi:[
 {t:'Your Meta cost per acquisition is down 12% but GA4 conversion is flat',b:'The problem is after the click, not before it. Your landing page has not changed since the ad creative rotated on Jul 28 — the headline still promises the old offer.',src:['Meta Ads','GA4','Webflow'],act:'Rewrite the landing headline'},
 {t:'Referral revenue up 41% correlates with the client Slack channel',b:'You opened it six weeks ago. Three of the six new referrals came from clients inside that channel, and none from clients outside it.',src:['Slack','Stripe','HubSpot'],act:'Invite the other five clients'},
 {t:'Discovery-to-proposal drop starts the day Meta ads began serving',b:'Cold ad-sourced leads take 3.2x longer to qualify than referrals and convert at 21% against 78%. The calendar is full of the wrong people.',src:['Meta Ads','Calendly','HubSpot'],act:'Add two qualifying questions'}],
peers:[['All peers','40+ one-person firms',1],['$150K–$250K revenue','18 firms',1.04],['30–50 clients','12 firms',.94],['Coaching vertical','23 firms',1.09]]};

const CFav=({ini,size=30,tone})=>(<span className="tile" style={{width:size,height:size,borderRadius:9,flex:'none',
background:tone||'var(--surface-sunk)',color:'var(--ink-2)',fontSize:size*.36,fontWeight:600,letterSpacing:'.02em',fontFamily:'var(--mono)'}}>{ini}</span>);

const MoveFull=({m})=>{const col=m.tone==='bad'?'var(--bad)':m.tone==='warn'?'var(--warn)':'var(--ok)';
return <div style={{padding:'15px 18px',display:'grid',gap:11}}>
<div className="row" style={{justifyContent:'space-between',gap:10}}>
<span className="row" style={{gap:8}}><CFav ini={m.ini} size={24}/><span style={{fontSize:13,fontWeight:600}}>{m.who}</span></span>
<span className="sub">{m.when}</span></div>
<div className="row" style={{gap:7}}><span className="mono" style={{fontSize:11.5,fontWeight:600,color:col}}>{m.impact}</span></div>
<div style={{fontSize:13.4,color:'var(--ink-2)',lineHeight:1.6}}>{m.ctx}</div>
<div style={{padding:'13px 15px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="row" style={{gap:6,color:'var(--violet)',fontSize:11,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={12}/>Paige's response</div>
<div style={{fontSize:13,color:'var(--ink-2)',marginTop:6,lineHeight:1.55}}>{m.fix}</div>
<div className="row" style={{gap:8,marginTop:12,flexWrap:'wrap'}}>
<button className="btn btn-s btn-g"><Ic.check size={12}/>{m.act}</button><button className="btn btn-s">Read it first</button>
<span className="pill pill-n" style={{marginLeft:'auto'}}>{m.dept} · draft-ready</span></div></div></div>};

const MwMoves=()=>(<div style={{display:'grid',gap:10,padding:'12px 14px'}}>{MW.moves.map((m,i)=>{
const col=m.tone==='bad'?'var(--bad)':m.tone==='warn'?'var(--warn)':'var(--ok)';
return <PeekCard key={i} title={m.t} sub={m.who+' · '+m.when} foldTitle="Competitor move"
peek={<div style={{padding:'10px 15px 13px'}}>
<div className="row" style={{gap:7,marginBottom:7}}><span style={{width:6,height:6,borderRadius:'50%',background:col,flex:'none'}}/>
<span className="mono" style={{fontSize:11.3,fontWeight:600,color:col}}>{m.impact}</span></div>
<div className="an-clamp" style={{fontSize:12.2,color:'var(--ink-2)',lineHeight:1.45}}>{m.ctx}</div>
<div className="row" style={{gap:7,marginTop:10,flexWrap:'wrap'}}><button className="btn btn-s btn-g" style={{height:26,fontSize:11.6}}><Ic.check size={11}/>{m.act}</button>
<button className="btn btn-s" style={{height:26,fontSize:11.6}}>Dismiss</button></div></div>}><MoveFull m={m}/></PeekCard>})}</div>);

const MwAds=()=>(<div style={{display:'grid',gap:9,padding:'12px 14px'}}>
{MW.comps.map((c,i)=><div key={i} className="row" style={{gap:12,padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',background:c.ads.on?'var(--surface)':'var(--surface-2)'}}>
<CFav ini={c.ini} size={28}/>
<div className="grow" style={{minWidth:0}}><div className="trunc" style={{fontSize:13,fontWeight:500}}>{c.n}</div>
<div className="sub trunc" style={{fontSize:11.4}}>{c.ads.on?c.ads.n+' live creatives · '+c.ads.plat:'Nothing running'}</div></div>
<span className="mono" style={{fontSize:11.8,color:c.ads.on?'var(--ink)':'var(--ink-3)',flex:'none'}}>{c.ads.spend}</span>
<span className={'pill '+(c.ads.on?'pill-warn':'pill-n')} style={{flex:'none'}}>{c.ads.on?<><span className="dot"/>Active</>:'Dark'}</span>
{c.ads.on&&<button className="btn btn-s" style={{height:26,fontSize:11.5,flex:'none'}}>Creatives</button>}</div>)}
<div style={{fontSize:12.4,color:'var(--ink-2)',lineHeight:1.55,padding:'2px 2px 0'}}>Spend ranges are estimated from public ad-library impression bands, not reported figures. TrackingCoachGroup is outspending the field roughly three to one and running nineteen creatives — most of them the same offer with a different hook.</div></div>);

const MwGaps=()=>(<div style={{display:'grid',gap:9,padding:'12px 14px'}}>
{MW.gaps.map((g,i)=><div key={i} style={{padding:'12px 14px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div className="row" style={{justifyContent:'space-between',gap:10}}><span style={{fontSize:13.2,fontWeight:600}}>{g.t}</span>
<span className="mono sub" style={{fontSize:11,flex:'none'}}>{g.vol}</span></div>
<div className="sub" style={{fontSize:11.5,marginTop:3}}>Covered by {g.who} · nothing of yours ranks</div>
<div style={{fontSize:12.6,color:'var(--ink-2)',lineHeight:1.55,marginTop:8}}>{g.brief}</div>
<div className="row" style={{gap:7,marginTop:10}}><button className="btn btn-s btn-g" style={{height:26,fontSize:11.6}}><Ic.spark size={11}/>Open the brief</button>
<button className="btn btn-s" style={{height:26,fontSize:11.6}}>Not for me</button></div></div>)}</div>);

const MwRail=({onAdd})=>(<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>Who you're watching</h3><div className="sub">Checked every morning</div></div>
<span className="pill pill-warn"><span className="dot"/>9 changes</span></div>
<div className="pane" style={{flex:1,padding:'10px 12px',display:'grid',gap:7,alignContent:'start'}}>
{MW.comps.map((c,i)=><button key={i} className="row" style={{gap:11,padding:'9px 10px',border:'1px solid var(--line)',borderRadius:'var(--r-m)',textAlign:'left',width:'100%'}}>
<CFav ini={c.ini} size={28} tone={c.ch?'var(--violet-tint)':null}/>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:12.9,fontWeight:500,display:'block'}}>{c.n}</span>
<span className="sub trunc" style={{fontSize:11.2,display:'block'}}>{c.adv}</span></span>
<span style={{flex:'none',textAlign:'right'}}>{c.ch
?<span className="pill pill-warn" style={{fontSize:10}}><span className="dot"/>{c.ch}</span>
:<span className="mono sub" style={{fontSize:10.5}}>quiet</span>}
<span className="mono sub" style={{fontSize:10,display:'block',marginTop:3}}>{c.last}</span></span></button>)}
<div className="row" style={{gap:8,border:'1px dashed var(--line)',borderRadius:'var(--r-m)',padding:'7px 8px 7px 12px',marginTop:3}}>
<span className="grow trunc sub" style={{fontSize:12.3}}>Paste a competitor URL</span>
<button className="btn btn-s btn-p" onClick={onAdd} style={{height:26,fontSize:11.6}}><Ic.plus size={12}/>Watch</button></div>
<div className="sub" style={{fontSize:11.4,lineHeight:1.5,padding:'2px 2px 0'}}>She reads pricing pages, ad libraries and new posts. First brief lands the following Monday.</div></div></div>);

export const MarketWatch=()=>{const[v,setV]=React.useState('moves');const[added,setAdded]=React.useState(false);
const body={moves:<MwMoves/>,ads:<MwAds/>,gaps:<MwGaps/>}[v];
const heads={moves:['This week\'s moves','Three changes worth a response'],ads:['Who is spending','Ad presence across Meta, Google and TikTok'],gaps:['What they cover and you don\'t','Ranked by search volume you could take']}[v];
return <div className="an-2">
<div className="card" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
<div className="hd" style={{flex:'none'}}><div><h3>{heads[0]}</h3><div className="sub">{heads[1]}</div></div>
<div className="seg">{[['moves','Moves'],['ads','Ad presence'],['gaps','Content gaps']].map(([k,l])=>
<button key={k} aria-pressed={v===k} onClick={()=>setV(k)}>{l}</button>)}</div></div>
<div key={v} className="pane fade-in" style={{flex:1}}>{body}</div></div>
<MwRail onAdd={()=>setAdded(true)}/>
{added&&<div className="fade-in row" style={{position:'fixed',bottom:26,left:'50%',transform:'translateX(-50%)',gap:9,background:'var(--rail)',color:'var(--ink-inv)',
padding:'11px 18px',borderRadius:12,fontSize:13,boxShadow:'var(--sh-3)',zIndex:95}} onAnimationEnd={()=>setTimeout(()=>setAdded(false),2200)}>
<span style={{color:'var(--gold-bright)',display:'flex'}}><Ic.check size={15}/></span>Watching started. First brief lands Monday.</div>}</div>};

export const AttrDrawer=({k,onClose})=>{const a=k&&MW.attr[k];if(!a)return null;
const isHrs=a.rows[0].d==='hrs';
return <SlideOut open={!!k} onClose={onClose} title={k} sub={a.sub} icon={<Ic.chart size={15}/>} wide
foot={<><button className="btn btn-s btn-g">{isHrs?'Hand these to Paige':'Open the drafted action'}</button><button className="btn btn-s" onClick={onClose}>Close</button></>}>
<div style={{fontSize:26,fontWeight:600,letterSpacing:'-.03em'}}>{a.tot}</div>
<div className="eyebrow" style={{marginTop:16}}>What produced it</div>
<div style={{marginTop:8,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{a.rows.map((r,i)=><div key={i} className="row" style={{gap:12,padding:'11px 14px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:13,fontWeight:500,display:'block'}}>{r.n}</span>
<span className="sub trunc" style={{fontSize:11.4,display:'block'}}>{r.src}</span></span>
<span style={{flex:'none',textAlign:'right'}}><span className="mono" style={{fontSize:13,fontWeight:500,display:'block'}}>{isHrs?r.v+'h':'$'+r.v.toLocaleString()}</span>
<span className="mono sub" style={{fontSize:10.5}}>{isHrs?'per month':r.d}</span></span></div>)}</div>
<div style={{marginTop:14,padding:'12px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',fontSize:12.9,color:'var(--ink-2)',lineHeight:1.55}}>
<span style={{color:'var(--ink)',fontWeight:600}}>Paige's read: </span>{a.read}</div></SlideOut>};

export const BranchTree=()=>{const cols=['var(--ink-3)','var(--violet)','var(--ok)','var(--gold)'];
return <div style={{padding:'16px 20px 20px'}}>
<svg viewBox="0 0 640 210" style={{width:'100%',height:190}}>
<line x1="24" y1="105" x2="150" y2="105" stroke="var(--line)" strokeWidth="2"/>
<circle cx="24" cy="105" r="5" fill="var(--ink-3)"/>
{MW.branches.map((b,i)=>{const y=28+i*52;
return <g key={i}><path d={'M150 105 C 214 105, 214 '+y+', 278 '+y} fill="none" stroke={cols[i]} strokeWidth="2" opacity=".7"/>
<circle cx="278" cy={y} r="4.5" fill={cols[i]}/>
<text x="292" y={y-3} fontSize="12" fill="var(--ink)" fontWeight="500">{b.t}</text>
<text x="292" y={y+13} fontSize="11" fill="var(--ink-3)" fontFamily="var(--mono)">{b.res} · {b.by} · confidence {b.conf}</text></g>})}</svg>
<div style={{display:'grid',gap:7,marginTop:6}}>{MW.branches.map((b,i)=><div key={i} className="row" style={{gap:10,fontSize:12.4,color:'var(--ink-2)',lineHeight:1.5}}>
<span className="mono" style={{flex:'0 0 38px',color:cols[i],fontWeight:600}}>{b.k}</span><span>{b.note}</span></div>)}</div>
<div style={{marginTop:14,padding:'12px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',fontSize:12.9,color:'var(--ink-2)',lineHeight:1.55}}>
<span style={{color:'var(--ink)',fontWeight:600}}>What limits this: </span>every branch assumes your win rate holds at 44% and that referral supply stays near 1.4 clients a month. Branch C is the only one where two assumptions have to hold at once, which is why its range is the widest.</div></div>};

export const XInsights=({open,onClose})=>(<Foldout open={open} onClose={onClose} wide title="What Paige noticed across your systems"
sub="Signals that only show up when two tools are read together">
<div style={{padding:'14px 18px',display:'grid',gap:10}}>{MW.xi.map((x,i)=>
<div key={i} style={{padding:'13px 15px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<div style={{fontSize:13.4,fontWeight:600,lineHeight:1.4}}>{x.t}</div>
<div style={{fontSize:12.9,color:'var(--ink-2)',lineHeight:1.6,marginTop:7}}>{x.b}</div>
<div className="row" style={{gap:8,marginTop:11,flexWrap:'wrap'}}>
<button className="btn btn-s btn-g" style={{height:27,fontSize:11.8}}><Ic.check size={11}/>{x.act}</button>
<span className="row" style={{gap:5,marginLeft:'auto',flexWrap:'wrap'}}>{x.src.map(s=><span key={s} className="pill pill-n" style={{fontSize:10.4}}>{s}</span>)}</span></div></div>)}</div></Foldout>);

export const WeeklyExec=({open,onClose})=>(<Foldout open={open} onClose={onClose} wide title="Monday brief · week of August 10"
sub="Five minutes. Everything from the last seven days in one read.">
<div style={{padding:'16px 20px 22px',display:'grid',gap:18}}>
<div className="two" style={{gap:18}}>
<div><div className="eyebrow" style={{color:'var(--ok)'}}>What went up</div>
<div style={{display:'grid',gap:7,marginTop:8}}>{[['Referral revenue','+41% QoQ, six of nine last deals'],['Net revenue retention','112% against a peer field of 98%'],['Northwind Partners','$8,630 signed Aug 4, kickoff drafted']].map(([a,b])=>
<div key={a} style={{fontSize:12.7,color:'var(--ink-2)',lineHeight:1.5}}><span style={{color:'var(--ink)',fontWeight:600}}>{a} — </span>{b}</div>)}</div></div>
<div><div className="eyebrow" style={{color:'var(--bad)'}}>What went down</div>
<div style={{display:'grid',gap:7,marginTop:8}}>{[['Outbound reply rate','9.2% to 5.1% after the Aug 8 domain dip'],['Collections','94% — $4,180 sitting in two card failures'],['Discovery to proposal','44%, dragged down by ad-sourced calls']].map(([a,b])=>
<div key={a} style={{fontSize:12.7,color:'var(--ink-2)',lineHeight:1.5}}><span style={{color:'var(--ink)',fontWeight:600}}>{a} — </span>{b}</div>)}</div></div></div>
<div><div className="eyebrow">On your plate</div>
<div style={{marginTop:8,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{[['Push Verity & Grantham','Closes the $3,270 revenue gap','Sales'],['Run the dunning sequence','Recovers $3,600 of the $4,180','Finance'],
['Send the Sarah Linley reframe','Two proposals sit against her new price','Sales'],['Approve the retention-audit refresh','Holds your ranking on two keywords','Marketing']].map(([a,b,d],i)=>
<div key={a} className="row" style={{gap:12,padding:'11px 14px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow" style={{minWidth:0}}><span className="trunc" style={{fontSize:12.9,fontWeight:500,display:'block'}}>{a}</span><span className="sub trunc" style={{fontSize:11.3,display:'block'}}>{b}</span></span>
<span className="pill pill-n" style={{flex:'none'}}>{d}</span><button className="btn btn-s" style={{height:26,fontSize:11.5,flex:'none'}}>Approve</button></div>)}</div></div>
<div><div className="eyebrow">What the market did</div>
<div style={{display:'grid',gap:7,marginTop:8}}>{MW.moves.map(m=>
<div key={m.t} style={{fontSize:12.7,color:'var(--ink-2)',lineHeight:1.5}}><span style={{color:'var(--ink)',fontWeight:600}}>{m.who} — </span>{m.t.charAt(0).toLowerCase()+m.t.slice(1)}</div>)}</div></div>
<div style={{padding:'13px 15px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',fontSize:13,color:'var(--ink-2)',lineHeight:1.6}}>
<span style={{color:'var(--ink)',fontWeight:600}}>Going into this week: </span>the revenue gap closes itself if Northwind's paperwork lands and the dunning runs. The thing that would actually change your month is repricing Ridgeline and Selby — 74 hours returning $4,300 is the only number here that is structurally wrong, and it has been wrong since February.</div>
<div className="row" style={{gap:9,flexWrap:'wrap'}}><button className="btn btn-s btn-g"><Ic.check size={12}/>Approve all four</button>
<button className="btn btn-s"><Ic.doc size={12}/>Export as PDF</button>
<span className="sub" style={{marginLeft:'auto',fontSize:11.5}}>Delivered Mondays 6am · autonomy set to auto-deliver</span></div></div></Foldout>);
