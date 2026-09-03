// @ts-nocheck
import React from "react";
import { Ic } from "./_shared";
import { deptTier, useTrust, MiniCompass } from "./compass";

const SC_DOMAINS=[['all','All checks'],['infra','Infrastructure'],['mkt','Marketing & tracking'],['forms','Forms & booking'],['comms','Comms & deliverability'],['pay','Payments & ops'],['data','Data quality']];
const SC_CHECKS=[
 {id:1,d:'comms',n:'SPF, DKIM & DMARC',m:'3 domains passing',s:'ok',ev:['mail.paigeagent.ai — SPF pass, DKIM pass, DMARC p=quarantine','meridianadvisory.com — all pass','meridiancoaching.com — all pass'],found:'All three sending domains authenticate cleanly.',fix:null},
 {id:2,d:'comms',n:'Inbox placement',m:'98.2% inbox, 1.8% spam',s:'ok',ev:['Seed test across Gmail, Outlook, Yahoo — 47 of 48 landed primary'],found:'Placement is strong and holding for the third week.',fix:null},
 {id:3,d:'comms',n:'Sender reputation',m:'Google Postmaster: medium',s:'warn',ev:['Aug 8 — reputation dropped high → medium','2,840 recipients in a single send window','Complaint rate 0.28% (threshold 0.30%)'],found:'The Teardown blast went out to 2,840 addresses in one window and pushed you within a hair of the complaint threshold.',fix:'Throttle to 400/day, warm the second domain over nine days, and split the list by engagement. Sequence rewritten and ready.'},
 {id:4,d:'infra',n:'Uptime & SSL',m:'99.98% · cert 71 days',s:'ok',ev:['No incidents in 30 days','Cert auto-renews Oct 23 via Cloudflare'],found:'Nothing to do here.',fix:null},
 {id:5,d:'infra',n:'Core Web Vitals',m:'LCP 1.4s · CLS 0.04',s:'ok',ev:['Mobile LCP 1.4s (good)','Largest element: hero image, 184KB'],found:'Fast enough that speed is not costing you conversions.',fix:null},
 {id:6,d:'infra',n:'404 & 5xx rates',m:'6 broken links',s:'warn',ev:['/teardown-13 → 404, 62 hits this week','/apply → 404, 11 hits','4 more on the blog'],found:'Two of these sit inside live campaign emails, so paying traffic is hitting dead ends.',fix:'Redirect /teardown-13 to /teardown and /apply to the discovery booking page. Four blog links repointed. Ready to publish.'},
 {id:7,d:'mkt',n:'Meta Pixel firing',m:'Missing on 1 page',s:'bad',ev:['/book-a-call — no PageView event since Aug 6','Lead event never fires','Page was republished Aug 6 at 2:14pm'],found:'The pixel came off /book-a-call when the page was republished. Every booking since Aug 6 is invisible to Meta, which is why the ad looks worse than it is.',fix:'Reinstall the pixel and backfill six days of conversions through the Conversions API. One click, no republish needed.'},
 {id:8,d:'mkt',n:'GA4 event health',m:'11 of 12 events',s:'warn',ev:['form_submit — receiving','purchase — receiving','call_booked — no events in 6 days'],found:'call_booked stopped the same day the pixel dropped. Same cause.',fix:'Rewire the event with the pixel fix above — one change covers both.'},
 {id:9,d:'mkt',n:'Ad account status',m:'2 accounts active',s:'ok',ev:['Meta — active, $40/day cap','Google Ads — paused by you Jul 2'],found:'No billing or policy flags.',fix:null},
 {id:10,d:'mkt',n:'UTM consistency',m:'3 naming collisions',s:'warn',ev:['utm_source=linkedin vs LinkedIn vs li','Affects 412 sessions this month'],found:'Three spellings of the same source split your attribution across three rows.',fix:'Normalize to lowercase at ingest and rewrite the 412 historical sessions. Mapping table drafted.'},
 {id:11,d:'forms',n:'Lead form smoke test',m:'6 forms delivering',s:'ok',ev:['Test submission delivered to Conversations in 1.2s avg','No silent failures in 30 days'],found:'Every form is delivering to a thread with an owner.',fix:null},
 {id:12,d:'forms',n:'Calendar link health',m:'2 links, 62% show',s:'warn',ev:['cal.paigeagent.ai/discovery — reachable','No reminder sequence attached','38% of booked calls no-show'],found:'Bookings are healthy, attendance is not. There is no reminder running.',fix:'Two-touch reminder — 24 hours and 1 hour before, SMS then email. Drafted in your voice.'},
 {id:13,d:'pay',n:'Stripe webhook health',m:'Retry queue: 3',s:'bad',ev:['3 failed charges — $4,180 total','invoice.payment_failed delivered, dunning never fired','Ridgeline $2,400 · Mercer $1,180 · Okonkwo $600'],found:'The webhook is fine but nothing downstream picked it up, so three declines have sat for 48 hours with no outreach.',fix:'Nine-day dunning sequence, softest tone first. Drafted per client with their own history referenced.'},
 {id:14,d:'pay',n:'Automation runs',m:'214 runs, 2 failed',s:'warn',ev:['Welcome sequence — 1 failure, missing merge field','Renewal reminder — 1 failure, contact had no email'],found:'Two failures, both from incomplete client records.',fix:'Fill both records from the intake forms already on file, then re-run. Ready.'},
 {id:15,d:'data',n:'CRM completeness',m:'94% complete',s:'warn',ev:['11 clients missing portal access','4 missing phone','2 missing owner'],found:'Portal silence is your earliest churn signal, and eleven clients cannot log in to make a sound.',fix:'Send portal invites to all eleven and assign the two unowned accounts by workload. Queued.'},
 {id:16,d:'data',n:'Orphan records',m:'None found',s:'ok',ev:['0 deals without a client','0 threads without an owner'],found:'Clean.',fix:null}];

// Real `paige_departments` slugs. These were the compass fixture's invented ids (`tech`, `mkt`,
// `ops`, `fin`), none of which exist in the platform — so every tier this map produced was read
// off a hardcoded float for a department that is not real.
const SC_DEPT={infra:'technology_automation',mkt:'marketing',forms:'operations_pmo',
 comms:'technology_automation',pay:'finance',data:'technology_automation'};
const SC_CAT_SCORE=[['infra','Infrastructure',22,25],['mkt','Marketing & tracking',15,20],['forms','Forms & booking',8,10],['comms','Comms & deliverability',12,15],['pay','Payments & ops',10,15],['data','Data quality',6,15]];
const SC_LIFT=[['Reinstall the Meta Pixel and backfill','+4',7],['Throttle the sending and warm the second domain','+3',3],['Run the dunning sequence on three declines','+2',13]];
const SC_META={
 7:{conf:'high',each:'2:14pm on Aug 6',what:'Adds the pixel snippet back to the page head and replays six days of conversions through the Conversions API.',
  code:`<!-- head of /book-a-call -->\n<script>\n  fbq('init','8841002147');\n  fbq('track','PageView');\n</script>\n<!-- on booking confirm -->\n<script>fbq('track','Lead',{value:0,currency:'USD'});</script>`,
  side:'Touches one page head. No republish needed — it goes in through the site integration. The Conversions API backfill is idempotent, so a duplicate replay would be discarded, not double-counted.',
  roll:'Remove the snippet and the event stops. The backfilled conversions can be deleted from the Meta event log inside 72 hours.',
  hist:[3,3,3,3,3,3,3,3,3,3,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],rel:[8,10],learn:true},
 3:{conf:'medium',what:'Rewrites the send schedule to 400 a day, warms the second domain over nine days, and splits the list by engagement.',
  code:`sending:\n  daily_cap: 400\n  warmup: mail2.paigeagent.ai over 9 days\n  segments:\n    - engaged_30d   → full cadence\n    - engaged_90d   → weekly\n    - dormant       → hold, re-permission first`,
  side:'The next blast reaches fewer people per day, so a full pass takes seven days instead of one. Nothing already scheduled is cancelled.',
  roll:'Raise the cap back and the old schedule resumes on the next send.',
  hist:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1],rel:[1,2]},
 13:{conf:'high',what:'Fires the nine-day dunning sequence per client, softest tone first, referencing each client\'s own payment history.',
  code:`sequence: dunning_soft_first\n  day 0  → "card didn't go through" · no penalty language\n  day 3  → same, with the invoice attached\n  day 6  → offer to split or change method\n  day 9  → pause service notice, drafted for your approval`,
  side:'Three clients receive email from your address. Nothing pauses or cancels automatically — day nine is a draft, not a send.',
  roll:'Stopping the sequence stops future steps. Sent mail cannot be recalled.',
  hist:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,3,3],rel:[14],vault:true},
 6:{conf:'high',what:'Publishes six redirects.',code:`/teardown-13  → /teardown        (301)\n/apply        → /book-a-call      (301)\n/blog/p/2401  → /teardown         (301)\n… 3 more`,
  side:'Adds six redirect rules. Existing routes are untouched.',roll:'Delete the rules and the URLs 404 again.',hist:Array(30).fill(1),rel:[5]},
 8:{conf:'high',what:'Rewires the call_booked event alongside the pixel fix.',code:`gtag('event','call_booked',{ send_to:'G-4X9K2', value:0 });`,
  side:'One event definition changes. Historical GA4 data is untouched.',roll:'Revert the tag and the event stops again.',hist:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1],rel:[7]},
 10:{conf:'medium',what:'Normalizes UTM sources at ingest and rewrites 412 historical sessions.',code:`normalize: lower(trim(utm_source))\nmap:\n  LinkedIn|li|linkedin  → linkedin\n  FB|facebook           → facebook`,
  side:'Rewrites 412 historical rows. Attribution totals shift as the three rows collapse into one — reports from before today will not match.',
  roll:'The rewrite is snapshotted, so it can be restored for 30 days.',hist:Array(30).fill(1),rel:[8]},
 12:{conf:'high',what:'Attaches a two-touch reminder to the discovery link.',code:`reminders:\n  - 24h before · SMS  · your voice\n  - 1h before  · email · calendar attached`,
  side:'Everyone with an upcoming booking gets two messages they were not getting before.',roll:'Detach the sequence; scheduled reminders are cancelled.',hist:Array(30).fill(1),rel:[11]},
 14:{conf:'high',what:'Fills two incomplete client records from intake forms already on file, then re-runs the failed automations.',
  code:`clients.update:\n  mercer_studio  → email  from intake_2026_03\n  okonkwo_group  → merge  from intake_2026_05\nre-run: welcome_sequence, renewal_reminder`,
  side:'Two client records are edited and two automations re-run. Both send mail your clients expected weeks ago.',roll:'Field edits are versioned and reversible.',hist:Array(30).fill(1),rel:[13,15]},
 15:{conf:'high',what:'Sends portal invitations to eleven clients and assigns two unowned accounts by current workload.',
  code:`invite: 11 clients → portal, expires in 14 days\nassign:\n  cairn_advisory  → Devon Park\n  okonkwo_group   → Sasha Kim`,
  side:'Eleven clients receive an invitation from your address. Two accounts change owner.',roll:'Invitations can be revoked; ownership can be reassigned.',hist:Array(30).fill(1),rel:[16]}};
const scMeta=id=>SC_META[id]||{conf:'high',what:'Nothing to apply — this check is passing.',code:null,side:'—',roll:'—',hist:Array(30).fill(0),rel:[]};
const SC_TRIG=[
 {a:'You published /q4-pricing',w:'8h ago',n:7,find:null},
 {a:'You added a form — Contact, Enterprise',w:'Yesterday',n:4,find:'The form does not fire the Lead event',fid:7},
 {a:'You connected Zapier',w:'2d ago',n:12,find:null},
 {a:'You changed the discovery booking link',w:'3d ago',n:5,find:'No reminder sequence attached',fid:12},
 {a:'You republished /book-a-call',w:'Aug 6',n:7,find:'Meta Pixel came off the page',fid:7}];

const scCol=s=>s==='ok'?'var(--ok)':s==='warn'?'var(--warn)':'var(--bad)';
const scTint=s=>s==='ok'?'var(--ok-tint)':s==='warn'?'var(--warn-tint)':'var(--bad-tint)';
const ScSpark=({hist,w=104,h=26})=>{const max=Math.max(1,...hist);
return <svg width={w} height={h} style={{overflow:'visible'}}>{hist.map((v,i)=>
<rect key={i} x={i*(w/hist.length)} y={h-Math.max(2,v/max*h)} width={(w/hist.length)-1.2} height={Math.max(2,v/max*h)} rx="1"
fill={v===0?'var(--ok)':v<2?'var(--warn)':'var(--bad)'} opacity={v===0?.42:.9}/>)}</svg>};

const ScDrawer=({c,onClose,onFix,onOpen})=>{const M=scMeta(c.id);const applied=c.s==='ok'&&/just now/.test(c.m||'');
const trust=useTrust();const tier=deptTier(trust,SC_DEPT[c.d]);
return <><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(23,19,49,.36)',backdropFilter:'blur(3px)',zIndex:80}}/>
<aside className="fade-in" style={{position:'fixed',top:0,right:0,bottom:0,width:'min(580px,96vw)',background:'var(--surface)',borderLeft:'1px solid var(--line)',boxShadow:'var(--sh-3)',zIndex:81,overflow:'auto'}}>
<div className="row" style={{padding:'16px 22px',borderBottom:'1px solid var(--line)',gap:12,position:'sticky',top:0,background:'var(--surface)',zIndex:2}}>
<span className="tile" style={{background:scTint(c.s),color:scCol(c.s)}}>{c.s==='ok'?<Ic.check size={16}/>:c.s==='warn'?<Ic.pulse size={16}/>:<Ic.bolt size={16}/>}</span>
<div className="grow" style={{minWidth:0}}><div className="trunc" style={{fontWeight:600,fontSize:14.5}}>{c.n}</div>
<div className="sub trunc">{SC_DOMAINS.find(d=>d[0]===c.d)[1]}</div></div>
<button className="btn btn-s" onClick={onClose} style={{width:30,height:30,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.x size={14}/></button></div>
<div style={{padding:'18px 22px 28px',display:'grid',gap:22}}>
<div><div className="row" style={{gap:9,flexWrap:'wrap'}}>
<span className="pill" style={{background:scTint(c.s),color:scCol(c.s)}}><span className="dot"/>{c.s==='ok'?'Healthy':c.s==='warn'?'Warning':'Critical'}</span>
<span className="mono sub">{c.m}</span>
<span className="pill pill-n" style={{marginLeft:'auto'}}>Last run 14m ago</span><span className="pill pill-n">Next in 46m</span></div>
<div style={{fontSize:13.6,color:'var(--ink-2)',lineHeight:1.65,marginTop:12}}>{c.found}</div></div>

<div><div className="eyebrow">The evidence</div>
<div style={{marginTop:9,background:'#0A0818',borderRadius:'var(--r-m)',padding:'12px 14px',display:'grid',gap:5}}>
{c.ev.map((e,i)=><div key={i} className="mono" style={{fontSize:11.6,color:'#A6E3C0'}}>{e}</div>)}</div></div>

{c.fix&&<div style={{border:'1px solid var(--violet-line)',background:'var(--violet-tint)',borderRadius:'var(--r-l)',padding:'15px 17px'}}>
<div className="row" style={{gap:8,flexWrap:'wrap'}}>
<span className="row" style={{gap:6,color:'var(--violet)',fontSize:10.5,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase'}}><Ic.spark size={12}/>She drafted the fix</span>
<span className="pill" style={{marginLeft:'auto',background:M.conf==='high'?'var(--ok-tint)':'var(--warn-tint)',color:M.conf==='high'?'var(--ok)':'var(--warn)'}}>
{M.conf} confidence{M.conf==='high'?' · safe and reversible':''}</span></div>
<div style={{fontSize:13.2,color:'var(--ink-2)',marginTop:9,lineHeight:1.6}}>{c.fix}</div>
{M.code&&<pre className="mono" style={{margin:'11px 0 0',background:'#0A0818',color:'#C9C4E0',borderRadius:'var(--r-m)',padding:'13px 15px',fontSize:11.6,lineHeight:1.65,overflowX:'auto',whiteSpace:'pre'}}>{M.code}</pre>}
<div className="two" style={{gap:10,marginTop:11}}>
<div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'11px 13px'}}>
<div className="eyebrow" style={{fontSize:9.5}}>What it touches</div>
<div style={{fontSize:12.4,color:'var(--ink-2)',marginTop:4,lineHeight:1.5}}>{M.side}</div></div>
<div style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'11px 13px'}}>
<div className="eyebrow" style={{fontSize:9.5}}>How to undo it</div>
<div style={{fontSize:12.4,color:'var(--ink-2)',marginTop:4,lineHeight:1.5}}>{M.roll}</div></div></div>
<div className="row" style={{gap:8,marginTop:12,flexWrap:'wrap'}}>
<button onClick={()=>{onFix(c);onClose()}} className="row" style={{gap:7,height:34,padding:'0 18px',borderRadius:10,background:'var(--gold-bright)',color:'#2A1C00',fontWeight:700,fontSize:13.2}}><Ic.check size={14}/>Apply fix</button>
<button className="btn btn-s">Edit fix</button><button className="btn btn-s">Acknowledge as intentional</button><button className="btn btn-s">Dismiss</button></div>
<div style={{marginTop:12}}><MiniCompass dept={SC_DEPT[c.d]} label="She drafted rather than applied because, on the platform default,"/></div></div>}

{tier==='green'&&!c.fix&&c.s!=='ok'&&<div style={{border:'1px solid var(--ok-tint)',background:'var(--ok-tint)',borderRadius:'var(--r-m)',padding:'12px 14px',fontSize:12.9,color:'var(--ink-2)'}}>
<strong style={{color:'var(--ink)'}}>This department runs automatically on the platform default. </strong>That lane does not wait for your approval — it is the platform's policy for this desk, not a level this workspace set.</div>}

<div><div className="row" style={{justifyContent:'space-between',alignItems:'baseline'}}><div className="eyebrow">Last 30 days</div>
<span className="sub" style={{fontSize:11.5}}>Findings per day</span></div>
<div style={{marginTop:9,border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'12px 14px'}}>
<ScSpark hist={M.hist} w={480} h={40}/>
<div className="row" style={{justifyContent:'space-between',marginTop:6}}><span className="sub" style={{fontSize:10.5}}>30 days ago</span><span className="sub" style={{fontSize:10.5}}>Today</span></div></div>
<div style={{marginTop:10,display:'grid',gap:0}}>{[['Finding surfaced',c.s==='ok'?'resolved':'open','14m ago'],['Change-triggered scan ran','7 checks','8h ago'],['Full scan','16 checks','Yesterday 6:02am']].map(([t,x,w],i)=>
<div key={i} className="row" style={{gap:11,padding:'9px 0',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow" style={{fontSize:12.7,color:'var(--ink-2)'}}>{t}</span><span className="sub">{x}</span><span className="mono sub" style={{fontSize:11}}>{w}</span></div>)}</div></div>

{(M.vault||M.learn)&&<div style={{display:'grid',gap:9}}>
{M.vault&&<div className="row" style={{gap:10,padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<Ic.vault size={15} style={{color:'var(--ink-3)'}}/><span className="grow" style={{fontSize:12.8}}>This finding created a Business Vault obligation</span><Ic.arrow size={13} style={{color:'var(--ink-3)'}}/></div>}
{M.learn&&<div className="row" style={{gap:10,padding:'11px 13px',border:'1px solid var(--line)',borderRadius:'var(--r-m)'}}>
<Ic.spark size={15} style={{color:'var(--violet)'}}/><span className="grow" style={{fontSize:12.8}}>Paige learned the pattern — republishing drops the pixel on this site</span><Ic.arrow size={13} style={{color:'var(--ink-3)'}}/></div>}</div>}

{M.rel.length>0&&<div><div className="eyebrow">Related checks</div>
<div className="row" style={{gap:8,marginTop:9,flexWrap:'wrap'}}>{M.rel.map(r=>{const x=SC_CHECKS.find(v=>v.id===r);if(!x)return null;
return <button key={r} onClick={()=>onOpen(x)} className="row" style={{gap:8,height:30,padding:'0 12px',borderRadius:99,border:'1px solid var(--line)',fontSize:12.4}}>
<span style={{width:7,height:7,borderRadius:'50%',background:scCol(x.s)}}/>{x.n}</button>})}</div></div>}</div></aside></>};

const ScScore=({score,onClose})=>{const traj=[62,63,64,66,65,67,69,68,70,71,70,72,73];
return <><div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(23,19,49,.36)',backdropFilter:'blur(3px)',zIndex:80}}/>
<aside className="fade-in" style={{position:'fixed',top:0,right:0,bottom:0,width:'min(520px,96vw)',background:'var(--surface)',borderLeft:'1px solid var(--line)',boxShadow:'var(--sh-3)',zIndex:81,overflow:'auto'}}>
<div className="row" style={{padding:'16px 22px',borderBottom:'1px solid var(--line)',gap:12,position:'sticky',top:0,background:'var(--surface)',zIndex:2}}>
<div className="grow"><div className="eyebrow">Operational health</div><div style={{fontWeight:600,fontSize:15,marginTop:2}}>Where the {score} comes from</div></div>
<button className="btn btn-s" onClick={onClose} style={{width:30,height:30,padding:0,justifyContent:'center',borderRadius:'50%'}}><Ic.x size={14}/></button></div>
<div style={{padding:'18px 22px 28px',display:'grid',gap:22}}>
<div><div className="eyebrow">By category</div>
<div style={{marginTop:10,display:'grid',gap:11}}>{SC_CAT_SCORE.map(([k,l,v,max])=>{const pct=v/max;
return <div key={k}><div className="row" style={{justifyContent:'space-between',marginBottom:5}}>
<span style={{fontSize:12.9,fontWeight:500}}>{l}</span><span className="mono sub">{v}/{max}</span></div>
<div style={{height:6,borderRadius:3,background:'var(--surface-sunk)'}}>
<div style={{width:pct*100+'%',height:'100%',borderRadius:3,background:pct>.85?'var(--ok)':pct>.6?'var(--warn)':'var(--bad)'}}/></div></div>})}</div></div>
<div><div className="eyebrow">What gets you to 90</div>
<div style={{marginTop:9,border:'1px solid var(--line)',borderRadius:'var(--r-m)',overflow:'hidden'}}>
{SC_LIFT.map(([t,d],i)=><div key={i} className="row" style={{gap:12,padding:'11px 13px',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span className="grow" style={{fontSize:12.9}}>{t}</span><span className="mono" style={{fontSize:13,fontWeight:600,color:'var(--ok)'}}>{d}</span></div>)}
<div className="row" style={{gap:12,padding:'11px 13px',borderTop:'1px solid var(--line)',background:'var(--surface-2)'}}>
<span className="grow" style={{fontSize:12.9,fontWeight:600}}>Three fixes, nine points</span><span className="mono" style={{fontSize:13,fontWeight:700}}>→ 82</span></div></div>
<div className="sub" style={{marginTop:8}}>The rest comes from the data-quality checks, which climb on their own as records fill in.</div></div>
<div><div className="row" style={{justifyContent:'space-between',alignItems:'baseline'}}><div className="eyebrow">Last 30 days</div>
<span className="pill pill-ok">+11 points</span></div>
<div style={{marginTop:10,border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'14px 16px'}}>
<svg viewBox="0 0 240 70" style={{width:'100%',height:78,overflow:'visible'}}>
<path d={traj.map((v,i)=>(i?'L':'M')+(i*(240/(traj.length-1)))+' '+(70-(v-58)/22*62)).join(' ')} fill="none" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round"/>
<circle cx="240" cy={70-(73-58)/22*62} r="3.4" fill="var(--ok)"/></svg>
<div style={{fontSize:12.9,color:'var(--ink-2)',marginTop:8,lineHeight:1.55}}>Your operational health has grown 11 points in 30 days. Keep going.</div></div></div>
<div style={{border:'1px solid var(--line)',borderRadius:'var(--r-m)',padding:'12px 14px'}}>
<div className="row" style={{gap:10}}><Ic.users size={15} style={{color:'var(--ink-3)'}}/>
<span className="grow" style={{fontSize:12.8,color:'var(--ink-2)'}}>The median coaching and consulting business scores 78. You are at {score}.</span></div>
<div className="sub" style={{marginTop:6}}>Anonymous and aggregated, and only because you opted in. Turn it off in Setup any time.</div></div></div></aside></>};

const ScTrigStream=({onOpen})=>(<div style={{display:'grid',gap:0}}>{SC_TRIG.map((t,i)=>
<div key={i} className="row" style={{gap:11,alignItems:'flex-start',padding:'11px 0',borderTop:i?'1px solid var(--line-soft)':'0'}}>
<span style={{width:7,height:7,borderRadius:'50%',flex:'none',marginTop:5,background:t.find?'var(--warn)':'var(--ok)'}}/>
<span className="grow" style={{minWidth:0}}>
<span style={{fontSize:12.8,color:'var(--ink-2)',lineHeight:1.45,display:'block'}}>{t.a}</span>
<span className="sub" style={{display:'block',marginTop:2,fontSize:11.5}}>She ran {t.n} checks · {t.find?t.find:'nothing came back'}</span>
{t.find&&<button onClick={()=>onOpen(SC_CHECKS.find(c=>c.id===t.fid))} className="pill pill-v" style={{marginTop:6,height:22,cursor:'pointer'}}><Ic.spark size={10}/>Fix ready</button>}</span>
<span className="mono sub" style={{fontSize:11,flex:'none'}}>{t.w}</span></div>)}</div>);

const ScCatPanel=({dom,checks})=>{const meta=SC_CAT_SCORE.find(c=>c[0]===dom);if(!meta)return null;
const [,label,v,max]=meta;const open=checks.filter(c=>c.d===dom&&c.s!=='ok').length;
const rec={mkt:'Three findings here share one root cause — the pixel came off /book-a-call. Fix that one thing and your Meta reporting, GA4 attribution, and UTM rows all straighten out at once.',
 infra:'Nothing structural is wrong. Six dead links are costing you paying traffic, and two of them sit inside live campaign emails.',
 comms:'Placement is strong. The only pressure is send volume — one blast pushed you within a hair of the complaint threshold.',
 pay:'The webhook works. What failed is what should have happened next, and $4,180 has been sitting for two days.',
 forms:'Every form delivers. What is missing is attendance — bookings are healthy and 38% do not show up.',
 data:'Eleven clients cannot log in, which means your earliest churn signal is muted for a third of the book.'}[dom];
return <div className="fade-in" style={{padding:'14px 20px',borderTop:'1px solid var(--line-soft)',background:'var(--surface-2)',display:'grid',gap:12}}>
<div className="row" style={{gap:16,flexWrap:'wrap'}}>
<div><div className="eyebrow" style={{fontSize:9.5}}>Category score</div>
<div className="row" style={{gap:7,alignItems:'baseline',marginTop:2}}><span style={{fontSize:22,fontWeight:600,letterSpacing:'-.03em'}}>{v}</span><span className="mono sub">of {max}</span></div></div>
<div><div className="eyebrow" style={{fontSize:9.5}}>Open findings</div><div style={{fontSize:22,fontWeight:600,marginTop:2,color:open?'var(--warn)':'var(--ok)'}}>{open}</div></div>
<div className="grow" style={{minWidth:140}}><div className="eyebrow" style={{fontSize:9.5}}>Trend, 30 days</div>
<div style={{marginTop:6}}><ScSpark hist={dom==='mkt'?[0,0,0,0,0,0,0,0,0,0,1,1,1,2,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3]:Array(30).fill(0).map((_,i)=>i>24?1:0)} w={140} h={22}/></div></div></div>
<div style={{background:'var(--gold-tint)',border:'1px solid var(--gold-line)',borderRadius:'var(--r-m)',padding:'11px 13px'}}>
<div className="row" style={{gap:7,color:'var(--gold)',fontSize:10.5,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.spark size={11}/>Paige on {label.toLowerCase()}</div>
<div style={{fontSize:12.8,color:'var(--ink-2)',marginTop:6,lineHeight:1.55}}>{rec}</div></div></div>};

const ScMiniMap=({checks,onOpen})=>{const ref=React.useRef(null);
React.useEffect(()=>{const cv=ref.current;if(!cv)return;const ctx=cv.getContext('2d');const dpr=Math.min(devicePixelRatio||1,2);
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;let raf,t=0;
const W=cv.clientWidth||300,H=112;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
const cl=SC_DOMAINS.slice(1).map((d,i)=>{const a=i/6*6.2832;return{k:d[0],x:W/2+Math.cos(a)*W*.28,y:H/2+Math.sin(a)*H*.30}});
const nodes=checks.map(c=>{const g=cl.find(x=>x.k===c.d);const a=c.id*2.4;
 return{s:c.s,x:g.x+Math.cos(a)*13,y:g.y+Math.sin(a)*9,ph:c.id}});
const draw=()=>{t++;ctx.clearRect(0,0,W,H);ctx.fillStyle='#0A0818';ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='rgba(255,255,255,.07)';ctx.lineWidth=1;
 cl.forEach((g,i)=>{const n=cl[(i+1)%cl.length];ctx.beginPath();ctx.moveTo(g.x,g.y);ctx.lineTo(n.x,n.y);ctx.stroke()});
 nodes.forEach(n=>{const pu=reduce?.8:.6+.4*Math.sin(t*.05+n.ph);
  const c=n.s==='ok'?'rgba(76,196,140,':n.s==='warn'?'rgba(227,166,60,':'rgba(238,122,114,';
  ctx.fillStyle=c+(.12*pu)+')';ctx.beginPath();ctx.arc(n.x,n.y,9,0,6.283);ctx.fill();
  ctx.fillStyle=c+(.95*pu)+')';ctx.beginPath();ctx.arc(n.x,n.y,2.6,0,6.283);ctx.fill()});
 raf=requestAnimationFrame(draw)};
draw();return()=>cancelAnimationFrame(raf)},[checks]);
return <div style={{position:'relative',borderRadius:'var(--r-m)',overflow:'hidden',border:'1px solid var(--line)'}}>
<canvas ref={ref} style={{display:'block',width:'100%',height:112}}/>
<div className="row" style={{position:'absolute',inset:'auto 10px 8px 10px',gap:8}}>
<span className="mono" style={{fontSize:10.5,color:'rgba(255,255,255,.55)'}}>16 of 30 checks live · 4 findings this hour</span>
<button onClick={onOpen} className="row" style={{marginLeft:'auto',gap:6,height:24,padding:'0 10px',borderRadius:99,background:'rgba(255,255,255,.12)',color:'#fff',fontSize:11,fontWeight:600}}>
View the map<Ic.arrow size={11}/></button></div></div>};

const SystemsCheck=({go})=>{
const[checks,setChecks]=React.useState(SC_CHECKS);
const[dom,setDom]=React.useState('all');
const[scan,setScan]=React.useState(null);
const[open,setOpen]=React.useState(null);
const[scoreOpen,setScoreOpen]=React.useState(false);
const[rail,setRail]=React.useState('feed');
const trust=useTrust();
const[feed,setFeed]=React.useState([
 {t:'Meta Pixel stopped firing on /book-a-call',w:'14m ago',k:'bad',lab:'waiting on you'},
 {t:'Sender reputation dropped to medium',w:'2h ago',k:'warn',lab:'waiting on you'},
 {t:'Cert renewal confirmed for Oct 23',w:'6h ago',k:'ok',lab:'performed and logged'},
 {t:'Change-triggered scan after /q4-pricing published',w:'8h ago',k:'info',lab:'nothing came back'},
 {t:'Full 30-check scan completed, 4 findings',w:'Yesterday 6:02am',k:'info',lab:''}]);
const bad=checks.filter(c=>c.s==='bad').length,warn=checks.filter(c=>c.s==='warn').length;
const score=Math.round(checks.reduce((s,c)=>s+(c.s==='ok'?100:c.s==='warn'?62:18),0)/checks.length);
const shown=checks.filter(c=>dom==='all'||c.d===dom).sort((a,b)=>({bad:0,warn:1,ok:2})[a.s]-({bad:0,warn:1,ok:2})[b.s]);
const run=()=>{if(scan)return;setScan({i:0})};
React.useEffect(()=>{if(!scan)return;if(scan.i>=checks.length){const id=setTimeout(()=>{setScan(null);
setFeed(f=>[{t:'Full scan completed, '+(bad+warn)+' open findings',w:'just now',k:'info',lab:''},...f])},700);return()=>clearTimeout(id)}
const id=setTimeout(()=>setScan(s=>({i:s.i+1})),110);return()=>clearTimeout(id)},[scan]);
const onFix=c=>{setChecks(cs=>cs.map(x=>x.id===c.id?{...x,s:'ok',m:'Fixed just now',fix:null,found:'Paige applied the fix and re-ran the check. Passing.'}:x));
setFeed(f=>[{t:'Applied the '+c.n.toLowerCase()+' fix — check is passing',w:'just now',k:'ok',lab:'performed and logged'},...f])};
const onSnooze=c=>{setChecks(cs=>cs.map(x=>x.id===c.id?{...x,fix:null,m:'Snoozed 7 days'}:x));
setFeed(f=>[{t:'Snoozed '+c.n+' for 7 days',w:'just now',k:'info',lab:''},...f])};
const ring=(v,col,size=76)=>{const r=size/2-6,c=2*Math.PI*r;
return <svg width={size} height={size} viewBox={'0 0 '+size+' '+size}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-sunk)" strokeWidth="6"/>
<circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c-(v/100)*c} transform={'rotate(-90 '+size/2+' '+size/2+')'} style={{transition:'stroke-dashoffset .6s'}}/>
<text x="50%" y="50%" textAnchor="middle" dy="6" fontSize="20" fontWeight="600" fill="var(--ink)" fontFamily="var(--font)" letterSpacing="-1">{v}</text></svg>};
const sCol=score>85?'var(--ok)':score>65?'var(--warn)':'var(--bad)';
const fixState=c=>{const t=deptTier(trust,SC_DEPT[c.d]);
 if(/just now/.test(c.m||''))return['Fixed','pill-ok'];
 if(/Snoozed/.test(c.m||''))return['Acknowledged','pill-n'];
 if(c.s==='ok')return null;
 if(t==='green')return['Autopilot','pill-ok'];
 if(t==='red')return['Your call','pill-bad'];
 return['Fix ready','pill-v']};

return <div className="card" style={{overflow:'hidden'}}>
<div className="row" style={{padding:'18px 20px',gap:18,flexWrap:'wrap',borderBottom:'1px solid var(--line-soft)'}}>
<button onClick={()=>setScoreOpen(true)} title="See where the score comes from" style={{position:'relative',flex:'none'}}>{ring(score,sCol)}
<span className="row" style={{position:'absolute',left:'50%',bottom:-2,transform:'translateX(-50%)',gap:3,fontSize:9.5,fontWeight:700,letterSpacing:'.08em',color:'var(--ink-3)'}}>WHY<Ic.chev size={9}/></span></button>
<div className="grow" style={{minWidth:220}}>
<div className="row" style={{gap:9}}><h3 style={{fontSize:16}}>Systems Check</h3>
<span className={'pill '+(bad?'pill-bad':warn?'pill-warn':'pill-ok')}><span className="dot"/>{bad?bad+' urgent':warn?warn+' to review':'All clear'}</span></div>
<p style={{fontSize:13,color:'var(--ink-2)',marginTop:5,maxWidth:520,lineHeight:1.55}}>
Sixteen of thirty checks run continuously across your infrastructure, tracking, forms, deliverability, payments, and data. Paige transmits every finding here with the fix already drafted.</p>
<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(124px,1fr))',gap:'10px 16px',marginTop:11}}>
{[['Last full scan','14m ago'],['Cadence','Hourly delta'],['Change-triggered','On publish'],['Fixes applied (30d)','23']].map(([k,v],i)=>
<div key={i} style={{minWidth:0}}><div className="eyebrow trunc" style={{fontSize:10}}>{k}</div>
<div className="mono trunc" style={{fontSize:12.5,marginTop:2,whiteSpace:'nowrap'}}>{v}</div></div>)}</div></div>
<div style={{display:'grid',gap:8,alignContent:'start'}}>
<button className="btn btn-p" onClick={run} disabled={!!scan} style={{opacity:scan?.6:1}}><Ic.pulse size={15}/>{scan?'Scanning…':'Run scan now'}</button>
<button className="btn btn-s" style={{justifyContent:'center'}}>Scan settings</button></div></div>

{scan&&<div style={{padding:'10px 20px',background:'var(--violet-tint)',borderBottom:'1px solid var(--violet-line)'}}>
<div className="row" style={{gap:10}}><Ic.spark size={14} style={{color:'var(--violet)'}}/>
<span className="mono trunc" style={{fontSize:11.8,color:'var(--violet)'}}>checking {(checks[Math.min(scan.i,checks.length-1)]||{}).n}…</span>
<span className="mono" style={{marginLeft:'auto',fontSize:11.5,color:'var(--violet)'}}>{Math.min(scan.i,checks.length)}/{checks.length}</span></div>
<div style={{height:4,borderRadius:3,background:'rgba(0,0,0,.08)',marginTop:7}}><div style={{width:(Math.min(scan.i,checks.length)/checks.length*100)+'%',height:'100%',borderRadius:3,background:'var(--violet)',transition:'width .1s'}}/></div></div>}

<div className="cc-grid" style={{gap:0,alignItems:'stretch'}}>
<div style={{borderRight:'1px solid var(--line-soft)',minWidth:0}}>
<div className="row" style={{padding:'12px 20px',gap:6,overflowX:'auto'}}>{SC_DOMAINS.map(([k,l])=>{const n=k==='all'?checks.filter(c=>c.s!=='ok').length:checks.filter(c=>c.d===k&&c.s!=='ok').length;const on=dom===k;
return <button key={k} onClick={()=>setDom(k)} className="row" style={{gap:6,flex:'none',height:28,padding:'0 11px',borderRadius:99,fontSize:12.4,fontWeight:on?600:450,
background:on?'var(--ink)':'var(--surface-sunk)',color:on?'var(--ink-inv)':'var(--ink-2)'}}>{l}
{n>0&&<span className="mono" style={{fontSize:10.5,padding:'0 5px',borderRadius:99,background:on?'rgba(255,255,255,.2)':'var(--warn-tint)',color:on?'var(--ink-inv)':'var(--warn)',fontWeight:600}}>{n}</span>}</button>})}</div>
{dom!=='all'&&<ScCatPanel dom={dom} checks={checks}/>}
{shown.map(c=>{const fs=fixState(c);
return <button key={c.id} onClick={()=>setOpen(c)} className="row sc-row" style={{width:'100%',textAlign:'left',padding:'12px 20px',gap:12,borderTop:'1px solid var(--line-soft)'}}>
<span className="tile" style={{width:26,height:26,borderRadius:8,background:scTint(c.s),color:scCol(c.s)}}>{c.s==='ok'?<Ic.check size={14}/>:c.s==='warn'?<Ic.pulse size={14}/>:<Ic.bolt size={14}/>}</span>
<span style={{flex:'1 1 190px',minWidth:150}}><span className="trunc" style={{fontSize:13.3,fontWeight:c.s==='ok'?500:600,display:'block'}}>{c.n}</span>
<span className="sub trunc" style={{display:'block'}}>{SC_DOMAINS.find(d=>d[0]===c.d)[1]}</span></span>
<span className="mono trunc" style={{flex:'0 1 150px',textAlign:'right',fontSize:12,color:c.s==='ok'?'var(--ink-3)':scCol(c.s),fontWeight:c.s==='ok'?400:600}}>{c.m}</span>
<span style={{flex:'0 0 96px',textAlign:'right'}}>{fs&&<span className={'pill '+fs[1]}>{fs[0]==='Fix ready'&&<Ic.spark size={11}/>}{fs[0]}</span>}</span>
<span style={{display:'flex',color:'var(--ink-3)',flex:'none'}}><Ic.chev size={14}/></span></button>})}
<style>{'.sc-row{transition:background .15s}.sc-row:hover{background:var(--surface-2)}@media(prefers-reduced-motion:reduce){.sc-row{transition:none}}'}</style></div>

<div style={{padding:'12px 20px 18px',minWidth:0}}>
<div className="row" style={{gap:4,background:'var(--surface-sunk)',borderRadius:10,padding:3,marginBottom:12}}>
{[['feed','What she transmitted'],['trig','Since your last change']].map(([k,l])=>
<button key={k} onClick={()=>setRail(k)} style={{flex:1,height:27,borderRadius:7,fontSize:11.8,fontWeight:rail===k?600:450,
background:rail===k?'var(--surface)':'transparent',color:rail===k?'var(--ink)':'var(--ink-3)',boxShadow:rail===k?'var(--sh-1)':'none'}}>{l}</button>)}</div>
{rail==='feed'?<div style={{display:'grid',gap:0}}>{feed.slice(0,6).map((f,i)=>{const col=f.k==='bad'?'var(--bad)':f.k==='warn'?'var(--warn)':f.k==='ok'?'var(--ok)':'var(--ink-3)';
return <div key={i} className="row" style={{gap:11,alignItems:'flex-start',padding:'9px 0'}}>
<span style={{display:'grid',placeItems:'center',flex:'none',paddingTop:4}}>
<span style={{width:7,height:7,borderRadius:'50%',background:col}}/>
{i<5&&<span style={{width:1,height:22,background:'var(--line)',marginTop:3}}/>}</span>
<span className="grow" style={{minWidth:0}}><span style={{fontSize:12.8,color:'var(--ink-2)',lineHeight:1.45,display:'block'}}>{f.t}</span>
<span className="mono sub" style={{fontSize:11}}>{f.w}{f.lab?' · '+f.lab:''}</span></span></div>})}</div>
:<ScTrigStream onOpen={setOpen}/>}
<div style={{marginTop:14}}><ScMiniMap checks={checks} onOpen={()=>go&&go('systems')}/></div>
<div style={{marginTop:12,padding:'12px 13px',background:'var(--gold-tint)',border:'1px solid var(--gold-line)',borderRadius:'var(--r-m)'}}>
<div className="row" style={{gap:7,color:'var(--gold)',fontSize:11,fontWeight:600,letterSpacing:'.1em',textTransform:'uppercase'}}><Ic.bolt size={12}/>Start here today</div>
<div style={{fontSize:12.8,color:'var(--ink-2)',marginTop:6,lineHeight:1.55}}>The pixel and the GA4 event are one fix, and it recovers six days of attribution. Then the three failed charges — $4,180 already earned.</div>
<button className="btn btn-s" style={{marginTop:10}} onClick={()=>setOpen(checks.find(c=>c.id===7))}>Take me there <Ic.arrow size={13}/></button></div></div></div>

{open&&<ScDrawer c={open} onClose={()=>setOpen(null)} onFix={onFix} onOpen={setOpen}/>}
{scoreOpen&&<ScScore score={score} onClose={()=>setScoreOpen(false)}/>}</div>};
export {SystemsCheck,SC_CHECKS,SC_DOMAINS,SC_DEPT,scCol,scTint,scMeta,ScDrawer};
